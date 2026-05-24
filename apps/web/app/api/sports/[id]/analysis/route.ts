import { NextResponse } from "next/server";
import { getAddress, type Address } from "viem";
import { getSportsPrediction, hasSportsUnlock } from "../../../../../lib/queries";

function isExpired(expiresAt: Date | string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet query param is required." }, { status: 400 });

  let walletAddress: Address;
  try {
    walletAddress = getAddress(wallet);
  } catch {
    return NextResponse.json({ error: "wallet query param must be a valid address." }, { status: 400 });
  }

  const prediction = await getSportsPrediction(Number(id));
  if (!prediction) return NextResponse.json({ error: "Sports Live Call not found." }, { status: 404 });
  if (prediction.status === "expired" || isExpired(prediction.expiresAt)) {
    return NextResponse.json({ error: "Sports Live Call is expired and no longer unlockable." }, { status: 410 });
  }

  const unlocked = await hasSportsUnlock(prediction.id, walletAddress);
  if (!unlocked) return NextResponse.json({ error: "Sports analysis is locked for this wallet." }, { status: 403 });

  return NextResponse.json({
    call: {
      id: prediction.id,
      marketId: prediction.marketId,
      marketTitle: prediction.marketTitle,
      marketUrl: prediction.marketUrl,
      category: prediction.category,
      marketKind: prediction.marketKind,
      selectedOption: prediction.selectedOption,
      selectedOutcomeIndex: prediction.selectedOutcomeIndex,
      marketPriceBps: prediction.marketPriceBps,
      agentProbabilityBps: prediction.agentProbabilityBps,
      edgeBps: prediction.edgeBps,
      confidenceBps: prediction.confidenceBps,
      riskLevel: prediction.riskLevel,
      reasoning: prediction.reasoning || prediction.rationale,
      matchupContext: prediction.matchupContext,
      marketMovement: prediction.marketMovement,
      risks: prediction.risks,
      verdict: prediction.verdict,
      evidenceIds: prediction.evidenceIds,
      sourceUrls: prediction.sourceUrls,
      x402PaidEvidenceUsed: prediction.x402PaidEvidenceUsed,
      eventStartTime: prediction.eventStartTime,
      expiresAt: prediction.expiresAt,
      resolutionStatus: prediction.resolutionStatus,
    },
    evidence: prediction.evidenceContext,
    votes: prediction.votes,
  });
}
