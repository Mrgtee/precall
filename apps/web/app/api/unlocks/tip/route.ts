import { eq } from "drizzle-orm";
import { createPublicClient, formatUnits, getAddress, http, parseEventLogs, type Address } from "viem";
import { ARC_TESTNET_USDC, arcTestnet } from "@precall/shared/chains";
import { erc20Abi } from "@precall/shared/contracts/abi";
import { createDb } from "@precall/shared/db/client";
import { agents, calls, circleActions, sportsPredictions, users } from "@precall/shared/db/schema";
import { addressSchema, errorJson, noStoreJson, parseJsonBody, positiveIntSchema, requireSameOrigin, txHashSchema } from "../../../../lib/api-security";
import { z } from "zod";

function sportsUnlockReceiver(): Address | null {
  const raw = process.env.SPORTS_UNLOCK_RECEIVER_ADDRESS || process.env.PROTOCOL_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS || "";
  try {
    return raw ? getAddress(raw) : null;
  } catch {
    return null;
  }
}

const tipRecordSchema = z.object({
  callId: positiveIntSchema.optional(),
  sportsPredictionId: positiveIntSchema.optional(),
  wallet: addressSchema,
  txHash: txHashSchema,
}).refine((value) => Boolean(value.callId) !== Boolean(value.sportsPredictionId), {
  message: "Exactly one of callId or sportsPredictionId is required.",
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, tipRecordSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const db = createDb();
  let receiver: Address | null = null;
  let relatedMarketId: string | null = null;

  if (body.callId) {
    const call = await db.query.calls.findFirst({ where: eq(calls.id, body.callId) });
    if (!call) return errorJson("Call not found.", 404);
    relatedMarketId = call.marketId;
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, call.agentId) });
    if (agent?.ownerWallet) {
      try {
        receiver = getAddress(agent.ownerWallet);
      } catch {
        receiver = sportsUnlockReceiver();
      }
    } else {
      receiver = sportsUnlockReceiver();
    }
  } else if (body.sportsPredictionId) {
    const prediction = await db.query.sportsPredictions.findFirst({ where: eq(sportsPredictions.id, body.sportsPredictionId) });
    if (!prediction) return errorJson("Sports Live Call not found.", 404);
    relatedMarketId = prediction.marketId;
    receiver = sportsUnlockReceiver();
  }

  if (!receiver) return errorJson("Tip receiver is not configured.", 500);

  const usdcAddress = getAddress(process.env.ARC_USDC_ADDRESS || process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || ARC_TESTNET_USDC);
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]),
  });

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: body.txHash });
    if (receipt.status !== "success") {
      return errorJson("Transaction did not complete successfully.", 422);
    }
    const usdcLogs = receipt.logs.filter((log) => log.address.toLowerCase() === usdcAddress.toLowerCase());
    const events = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: usdcLogs });

    const event = events.find((item) => {
      const from = String(item.args.from || "").toLowerCase();
      const to = String(item.args.to || "").toLowerCase();
      return from === body.wallet.toLowerCase() && to === receiver!.toLowerCase();
    });

    if (!event) return errorJson("Transaction does not contain the expected Arc USDC tip transfer.", 422);

    const amount = formatUnits(event.args.value, 6);
    await db.insert(users).values({ walletAddress: body.wallet }).onConflictDoNothing();

    await db.insert(circleActions).values({
      actionType: "thesis_tip",
      walletAddress: body.wallet,
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

    return noStoreJson({ ok: true, amount });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error), 500);
  }
}
