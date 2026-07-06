import { NextResponse } from "next/server";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { getMarketplaceSportsPredictions } from "../../../../../lib/marketplace";
import { createDb } from "@precall/shared/db/client";
import { circleActions } from "@precall/shared/db/schema";

const facilitator = new BatchFacilitatorClient({
  url: process.env.X402_FACILITATOR_URL || "https://gateway-api-testnet.circle.com",
});

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const x402PriceAtomicUsdc = "10000"; // $0.01 USDC in micro-units (1e6)
const gatewayAuthValidityWindowSeconds = 604900;

type SupportedKind = {
  network: string;
  extra?: Record<string, unknown>;
};

function getSellerAddress() {
  const address = process.env.CIRCLE_X402_SELLER_ADDRESS || process.env.AGENT_OWNER_WALLET || "";
  return evmAddressPattern.test(address) ? address : null;
}

function getAcceptedNetworks() {
  return (process.env.X402_ACCEPTED_NETWORKS || "")
    .split(",")
    .map(network => network.trim())
    .filter(Boolean);
}

function getUsdcAddress(kind: SupportedKind) {
  const assets = kind.extra?.assets;
  if (!Array.isArray(assets)) return null;

  const usdc = assets.find(asset => {
    if (!asset || typeof asset !== "object") return false;
    return (asset as { symbol?: unknown }).symbol === "USDC";
  }) as { address?: unknown } | undefined;

  const address = typeof usdc?.address === "string" ? usdc.address : "";
  return evmAddressPattern.test(address) ? address : null;
}

function getVerifyingContract(kind: SupportedKind) {
  const verifyingContract = kind.extra?.verifyingContract;
  return typeof verifyingContract === "string" && evmAddressPattern.test(verifyingContract)
    ? verifyingContract
    : null;
}

function toPaymentRequirement(kind: SupportedKind, sellerAddress: string) {
  const asset = getUsdcAddress(kind);
  const verifyingContract = getVerifyingContract(kind);
  if (!asset || !verifyingContract) return null;

  return {
    scheme: "exact",
    network: kind.network,
    asset,
    amount: x402PriceAtomicUsdc,
    payTo: sellerAddress,
    maxTimeoutSeconds: gatewayAuthValidityWindowSeconds,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract,
    },
  };
}

export async function GET(request: Request) {
  const headers = request.headers;
  const paymentSignature = headers.get("payment-signature");

  // 1. If payment is missing, construct the x402 V2 PAYMENT-REQUIRED challenge
  if (!paymentSignature) {
    try {
      const sellerAddress = getSellerAddress();
      if (!sellerAddress) {
        return NextResponse.json(
          { error: "Missing or invalid x402 seller address configuration" },
          { status: 500 },
        );
      }

      const acceptedNetworks = getAcceptedNetworks();
      const supported = await facilitator.getSupported();
      const supportedKinds = acceptedNetworks.length
        ? supported.kinds.filter(kind => acceptedNetworks.includes(kind.network))
        : supported.kinds;
      const accepts = supportedKinds
        .map(kind => toPaymentRequirement(kind, sellerAddress))
        .filter((requirement): requirement is NonNullable<typeof requirement> => Boolean(requirement));

      if (!accepts.length) {
        return NextResponse.json(
          { error: "No Circle x402 facilitator networks match X402_ACCEPTED_NETWORKS" },
          { status: 500 },
        );
      }

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

  // 3. Fork Gating: Verify client network matches platform allowed networks
  const allowedNetworks = getAcceptedNetworks();
  const clientNetwork = payload.accepted?.network;
  if (clientNetwork && allowedNetworks.length > 0 && !allowedNetworks.includes(clientNetwork)) {
    return NextResponse.json({ error: `Fork mismatch. Network '${clientNetwork}' is not supported.` }, { status: 400 });
  }

  // 4. Verify & Settle using Circle Facilitator
  const sellerAddress = getSellerAddress();
  if (!sellerAddress) {
    return NextResponse.json(
      { error: "Missing or invalid x402 seller address configuration" },
      { status: 500 },
    );
  }

  const requirements = {
    scheme: "exact",
    network: payload.accepted?.network || "",
    asset: payload.accepted?.asset || "",
    amount: x402PriceAtomicUsdc,
    payTo: sellerAddress,
    maxTimeoutSeconds: gatewayAuthValidityWindowSeconds,
    extra: payload.accepted?.extra || {},
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

    // 5. Log settled Gateway transaction into circle_actions database.
    const txHash = typeof settleResult.transaction === "string" && settleResult.transaction
      ? settleResult.transaction
      : typeof payload.transactionHash === "string"
        ? payload.transactionHash
        : null;

    await createDb().insert(circleActions).values({
      actionType: "x402_api_sale",
      txHash,
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
