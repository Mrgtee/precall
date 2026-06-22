import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createPublicClient, formatUnits, getAddress, http, parseEventLogs, type Address, type Hex } from "viem";
import { ARC_TESTNET_USDC, arcTestnet } from "@precall/shared/chains";
import { erc20Abi } from "@precall/shared/contracts/abi";
import { createDb } from "@precall/shared/db/client";
import { agents, calls, circleActions, sportsPredictions, users } from "@precall/shared/db/schema";

function sportsUnlockReceiver(): Address | null {
  const raw = process.env.SPORTS_UNLOCK_RECEIVER_ADDRESS || process.env.PROTOCOL_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS || "";
  try {
    return raw ? getAddress(raw) : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    callId?: number;
    sportsPredictionId?: number;
    wallet?: string;
    txHash?: Hex;
  };

  if ((!body.callId && !body.sportsPredictionId) || !body.wallet || !body.txHash) {
    return NextResponse.json({ error: "Either callId or sportsPredictionId, plus wallet and txHash are required." }, { status: 400 });
  }

  let wallet: Address;
  try {
    wallet = getAddress(body.wallet);
  } catch {
    return NextResponse.json({ error: "wallet must be a valid address." }, { status: 400 });
  }

  const db = createDb();
  let receiver: Address | null = null;
  let relatedMarketId: string | null = null;

  if (body.callId) {
    const call = await db.query.calls.findFirst({ where: eq(calls.id, body.callId) });
    if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });
    relatedMarketId = call.marketId;
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, call.agentId) });
    if (agent?.ownerWallet) {
      try {
        receiver = getAddress(agent.ownerWallet);
      } catch {
        // Fallback to protocol treasury
        receiver = sportsUnlockReceiver();
      }
    } else {
      receiver = sportsUnlockReceiver();
    }
  } else if (body.sportsPredictionId) {
    const prediction = await db.query.sportsPredictions.findFirst({ where: eq(sportsPredictions.id, body.sportsPredictionId) });
    if (!prediction) return NextResponse.json({ error: "Sports Live Call not found." }, { status: 404 });
    relatedMarketId = prediction.marketId;
    receiver = sportsUnlockReceiver();
  }

  if (!receiver) {
    return NextResponse.json({ error: "Tip receiver is not configured." }, { status: 500 });
  }

  const usdcAddress = getAddress(process.env.ARC_USDC_ADDRESS || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || ARC_TESTNET_USDC);
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]),
  });

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash });
    const usdcLogs = receipt.logs.filter((log) => log.address.toLowerCase() === usdcAddress.toLowerCase());
    const events = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: usdcLogs });

    const event = events.find((item) => {
      const from = String(item.args.from || "").toLowerCase();
      const to = String(item.args.to || "").toLowerCase();
      return from === wallet.toLowerCase() && to === receiver!.toLowerCase();
    });

    if (!event) {
      return NextResponse.json({ error: "Transaction does not contain the expected Arc USDC tip transfer." }, { status: 422 });
    }

    const amount = formatUnits(event.args.value, 6);
    await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();

    await db.insert(circleActions).values({
      actionType: "thesis_tip",
      walletAddress: wallet,
      amount,
      amountUsdc: amount,
      chain: "Arc Testnet",
      txHash: body.txHash,
      relatedCallId: body.callId || null,
      relatedMarketId,
      status: "success",
      metadata: {
        relatedCallId: body.callId || null,
        relatedSportsPredictionId: body.sportsPredictionId || null,
        receiver,
        usdcAddress,
      },
    }).onConflictDoNothing();

    return NextResponse.json({ ok: true, amount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
