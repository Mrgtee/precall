import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createPublicClient, formatUnits, http, parseEventLogs, type Hex } from "viem";
import { arcTestnet } from "@precall/shared/chains";
import { precallRegistryAbi } from "@precall/shared/contracts/abi";
import { createDb } from "@precall/shared/db/client";
import { calls, circleActions, thesisUnlocks, users } from "@precall/shared/db/schema";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    callId?: number;
    wallet?: string;
    txHash?: Hex;
  };

  if (!body.callId || !body.wallet || !body.txHash) {
    return NextResponse.json({ error: "callId, wallet, and txHash are required." }, { status: 400 });
  }

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

  const call = await db.query.calls.findFirst({ where: eq(calls.id, body.callId) });
  if (!call?.onchainCallId) {
    return NextResponse.json({ error: "Call is not published onchain." }, { status: 400 });
  }

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]),
  });
  const registry = (call.registryAddress || process.env.PRECALL_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS || "").toLowerCase();
  const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash });
  const registryLogs = registry ? receipt.logs.filter((log) => log.address.toLowerCase() === registry) : receipt.logs;
  const events = parseEventLogs({
    abi: precallRegistryAbi,
    eventName: "ThesisUnlocked",
    logs: registryLogs,
  });
  const event = events.find(
    (item) =>
      Number(item.args.callId) === call.onchainCallId &&
      item.args.buyer.toLowerCase() === body.wallet!.toLowerCase(),
  );
  if (!event) {
    return NextResponse.json({ error: "Transaction does not contain the expected ThesisUnlocked event." }, { status: 422 });
  }

  await db
    .insert(users)
    .values({ walletAddress: body.wallet })
    .onConflictDoNothing();
  const amount = formatUnits(event.args.amount, 6);
  await db
    .insert(thesisUnlocks)
    .values({
      callId: body.callId,
      userWallet: body.wallet,
      amount,
      txHash: body.txHash,
    })
    .onConflictDoNothing();
  await db.insert(circleActions).values({
    actionType: "thesis_unlock",
    walletAddress: body.wallet,
    amount,
    amountUsdc: amount,
    chain: "Arc Testnet",
    txHash: body.txHash,
    relatedCallId: body.callId,
    status: "success",
    metadata: { onchainCallId: call.onchainCallId, registryAddress: registry },
  }).onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
