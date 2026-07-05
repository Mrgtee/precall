import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createPublicClient, formatUnits, getAddress, http, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { ARC_TESTNET_USDC, arcTestnet } from "@precall/shared/chains";
import { erc20Abi, precallSportsSplitterAbi } from "@precall/shared/contracts/abi";
import { createDb } from "@precall/shared/db/client";
import { circleActions, sportsPredictions, sportsUnlocks, users, agents } from "@precall/shared/db/schema";

function sportsUnlockReceiver(): Address | null {
  const raw = process.env.SPORTS_UNLOCK_RECEIVER_ADDRESS || process.env.PROTOCOL_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS || "";
  try {
    return raw ? getAddress(raw) : null;
  } catch {
    return null;
  }
}

function isExpired(expiresAt: Date | string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sportsPredictionId?: number;
    wallet?: string;
    txHash?: Hex;
  };

  if (!body.sportsPredictionId || !body.wallet || !body.txHash) {
    return NextResponse.json({ error: "sportsPredictionId, wallet, and txHash are required." }, { status: 400 });
  }

  let wallet: Address;
  try {
    wallet = getAddress(body.wallet);
  } catch {
    return NextResponse.json({ error: "wallet must be a valid address." }, { status: 400 });
  }

  const receiver = sportsUnlockReceiver();
  if (!receiver) return NextResponse.json({ error: "Sports unlock receiver is not configured." }, { status: 500 });

  const db = createDb();

  // Replay Protection: Ensure this transaction hash has not been processed already
  const existing = await db
    .select()
    .from(circleActions)
    .where(eq(circleActions.txHash, body.txHash))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "Replay attack detected. Transaction hash has already been used." }, { status: 400 });
  }

  const prediction = await db.query.sportsPredictions.findFirst({ where: eq(sportsPredictions.id, body.sportsPredictionId) });
  if (!prediction) return NextResponse.json({ error: "Sports Live Call not found." }, { status: 404 });
  if (prediction.status === "expired" || isExpired(prediction.expiresAt)) {
    return NextResponse.json({ error: "Sports Live Call is expired and no longer unlockable." }, { status: 410 });
  }

  const usdcAddress = getAddress(process.env.ARC_USDC_ADDRESS || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || ARC_TESTNET_USDC);
  const splitterEnv = process.env.NEXT_PUBLIC_SPORTS_SPLITTER_ADDRESS || process.env.SPORTS_SPLITTER_ADDRESS;
  const splitterAddress = splitterEnv ? getAddress(splitterEnv) : null;

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]),
  });
  const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash });
  const requiredAmount = parseUnits(String(prediction.unlockPrice), 6);
  let amount: string;

  if (splitterAddress) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, prediction.agentId) });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

    const splitterLogs = receipt.logs.filter((log) => log.address.toLowerCase() === splitterAddress.toLowerCase());
    const events = parseEventLogs({ abi: precallSportsSplitterAbi, eventName: "SportsCallUnlocked", logs: splitterLogs });
    const event = events.find((item) => {
      const buyer = String(item.args.buyer || "").toLowerCase();
      const agentOwner = String(item.args.agentOwner || "").toLowerCase();
      return (
        buyer === wallet.toLowerCase() &&
        agentOwner === agent.ownerWallet.toLowerCase() &&
        item.args.predictionId === BigInt(prediction.id) &&
        item.args.totalAmount >= requiredAmount
      );
    });

    if (!event) {
      return NextResponse.json({ error: "Transaction does not contain the expected PrecallSportsSplitter unlock event." }, { status: 422 });
    }
    amount = formatUnits(event.args.totalAmount, 6);
  } else {
    const usdcLogs = receipt.logs.filter((log) => log.address.toLowerCase() === usdcAddress.toLowerCase());
    const events = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: usdcLogs });
    const event = events.find((item) => {
      const from = String(item.args.from || "").toLowerCase();
      const to = String(item.args.to || "").toLowerCase();
      return from === wallet.toLowerCase() && to === receiver.toLowerCase() && item.args.value >= requiredAmount;
    });

    if (!event) {
      return NextResponse.json({ error: "Transaction does not contain the expected Arc USDC sports unlock transfer." }, { status: 422 });
    }
    amount = formatUnits(event.args.value, 6);
  }
  await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();
  await db
    .insert(sportsUnlocks)
    .values({ sportsPredictionId: prediction.id, userWallet: wallet, amount, txHash: body.txHash })
    .onConflictDoNothing();
  await db.insert(circleActions).values({
    actionType: "sports_unlock",
    walletAddress: wallet,
    amount,
    amountUsdc: amount,
    chain: "Arc Testnet",
    txHash: body.txHash,
    relatedMarketId: prediction.marketId,
    status: "success",
    metadata: {
      sportsPredictionId: prediction.id,
      selectedOutcomeIndex: prediction.selectedOutcomeIndex,
      receiver,
      usdcAddress,
    },
  }).onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
