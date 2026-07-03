import { NextResponse } from "next/server";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { getMarketplaceSportsPredictions } from "../../../../../lib/marketplace";
import { createDb } from "@precall/shared/db/client";
import { circleActions } from "@precall/shared/db/schema";
import { eq, and } from "drizzle-orm";

const facilitator = new BatchFacilitatorClient({
  url: process.env.X402_FACILITATOR_URL || "https://gateway-api-testnet.circle.com",
});

export async function GET(request: Request) {
  const headers = request.headers;
  const paymentSignature = headers.get("payment-signature");

  // 1. If payment is missing, construct the x402 V2 PAYMENT-REQUIRED challenge
  if (!paymentSignature) {
    try {
      const supported = await facilitator.getSupported();
      const accepts = supported.kinds.map(kind => ({
        scheme: "circle-batching",
        network: kind.network,
        asset: "USDC",
        amount: "10000", // $0.01 USDC in micro-units (1e6)
        payTo: process.env.CIRCLE_X402_SELLER_ADDRESS || process.env.AGENT_OWNER_WALLET,
        maxTimeoutSeconds: 604800,
        extra: {
          name: "circle-batching",
          version: "1.0.0",
          verifyingContract: kind.extra?.verifyingContract
        }
      }));

      const paymentRequired = {
        x402Version: 2,
        resource: {
          url: request.url,
          description: "Precall Soccer Prediction Intelligence API",
          mimeType: "application/json"
        },
        accepts
      };

      const headerBase64 = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
      return new NextResponse(JSON.stringify({}), {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": headerBase64,
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: "Failed to load payment facilitator configurations", details: msg }, { status: 500 });
    }
  }

  // 2. Decode payment signature
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(paymentSignature, "base64").toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Invalid payment-signature header format (base64 expected)" }, { status: 400 });
  }

  const txHash = payload.transactionHash;
  if (!txHash) {
    return NextResponse.json({ error: "Missing transactionHash in signature payload" }, { status: 400 });
  }

  // 3. Replay Protection: Check if this transaction has already been processed
  const db = createDb();
  const existing = await db
    .select()
    .from(circleActions)
    .where(and(eq(circleActions.txHash, txHash), eq(circleActions.actionType, "x402_api_sale")))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "Replay attack detected. Transaction hash has already been used." }, { status: 400 });
  }

  // 4. Verify & Settle using Circle Facilitator
  const requirements = {
    scheme: "circle-batching",
    network: payload.accepted?.network || "",
    asset: payload.accepted?.asset || "USDC",
    amount: "10000",
    payTo: process.env.CIRCLE_X402_SELLER_ADDRESS || process.env.AGENT_OWNER_WALLET || "",
    maxTimeoutSeconds: 604800,
  };

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  let verifyResult: any;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  let settleResult: any;

  try {
    verifyResult = await facilitator.verify(payload, requirements);
    if (!verifyResult.isValid) {
      return NextResponse.json({ error: "Payment verification failed", reason: verifyResult.invalidReason }, { status: 402 });
    }

    settleResult = await facilitator.settle(payload, requirements);
    if (!settleResult.success) {
      return NextResponse.json({ error: "Payment settlement failed", reason: settleResult.errorReason }, { status: 402 });
    }

    // 5. Log transaction into circle_actions database
    await db.insert(circleActions).values({
      actionType: "x402_api_sale",
      txHash: txHash,
      amountUsdc: "0.01",
      walletAddress: settleResult.payer || verifyResult.payer || "",
      chain: payload.accepted?.network || "Arc Testnet",
      status: "success",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Circle Gateway validation error", details: msg }, { status: 400 });
  }

  // 6. Return payload and PAYMENT-RESPONSE confirmation header
  const predictions = await getMarketplaceSportsPredictions(12);
  const paymentResponse = Buffer.from(JSON.stringify({
    success: true,
    transaction: settleResult.transaction,
    network: payload.accepted?.network || "",
    payer: settleResult.payer || ""
  })).toString("base64");

  return new NextResponse(JSON.stringify(predictions), {
    status: 200,
    headers: {
      "PAYMENT-RESPONSE": paymentResponse,
      "Content-Type": "application/json"
    }
  });
}
