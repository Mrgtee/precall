import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createPublicClient, formatUnits, http, parseEventLogs, type Hex } from "viem";
import { arcTestnet } from "@precall/shared/chains";
import { precallRegistryAbi } from "@precall/shared/contracts/abi";
import { createDb } from "@precall/shared/db/client";
import { calls, thesisUnlocks, users } from "@precall/shared/db/schema";

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
  const call = await db.query.calls.findFirst({ where: eq(calls.id, body.callId) });
  if (!call?.onchainCallId) {
    return NextResponse.json({ error: "Call is not published onchain." }, { status: 400 });
  }

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]),
  });
  const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash });
  const events = parseEventLogs({
    abi: precallRegistryAbi,
    eventName: "ThesisUnlocked",
    logs: receipt.logs,
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
  await db
    .insert(thesisUnlocks)
    .values({
      callId: body.callId,
      userWallet: body.wallet,
      amount: formatUnits(event.args.amount, 6),
      txHash: body.txHash,
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
