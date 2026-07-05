import { eq } from "drizzle-orm";
import { createPublicClient, formatUnits, http, parseEventLogs } from "viem";
import { arcTestnet } from "@precall/shared/chains";
import { precallRegistryAbi } from "@precall/shared/contracts/abi";
import { createDb } from "@precall/shared/db/client";
import { calls, circleActions, thesisUnlocks, users } from "@precall/shared/db/schema";
import { addressSchema, errorJson, noStoreJson, parseJsonBody, positiveIntSchema, requireSameOrigin, txHashSchema } from "../../../../lib/api-security";
import { z } from "zod";

const unlockRecordSchema = z.object({
  callId: positiveIntSchema,
  wallet: addressSchema,
  txHash: txHashSchema,
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, unlockRecordSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const db = createDb();

  // Replay Protection: Ensure this transaction hash has not been processed already
  const existing = await db
    .select()
    .from(circleActions)
    .where(eq(circleActions.txHash, body.txHash))
    .limit(1);

  if (existing.length > 0) {
    return errorJson("Replay attack detected. Transaction hash has already been used.", 400);
  }

  const call = await db.query.calls.findFirst({ where: eq(calls.id, body.callId) });
  if (!call?.onchainCallId) {
    return errorJson("Call is not published onchain.", 400);
  }

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]),
  });
  const registry = (call.registryAddress || process.env.PRECALL_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS || "").toLowerCase();
  const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash });
  if (receipt.status !== "success") {
    return errorJson("Transaction did not complete successfully.", 422);
  }
  const registryLogs = registry ? receipt.logs.filter((log) => log.address.toLowerCase() === registry) : receipt.logs;
  const events = parseEventLogs({
    abi: precallRegistryAbi,
    eventName: "ThesisUnlocked",
    logs: registryLogs,
  });
  const event = events.find(
    (item) =>
      Number(item.args.callId) === call.onchainCallId &&
      item.args.buyer.toLowerCase() === body.wallet.toLowerCase(),
  );
  if (!event) {
    return errorJson("Transaction does not contain the expected ThesisUnlocked event.", 422);
  }

  await db.insert(users).values({ walletAddress: body.wallet }).onConflictDoNothing();
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

  return noStoreJson({ ok: true });
}
