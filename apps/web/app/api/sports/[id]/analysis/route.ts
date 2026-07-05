import { getAddress, type Address } from "viem";
import { getSportsPrediction, hasSportsUnlock } from "../../../../../lib/queries";
import { errorJson, noStoreJson } from "../../../../../lib/api-security";

function isExpired(expiresAt: Date | string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) return errorJson("Valid sports prediction id is required.", 400);
  if (!wallet) return errorJson("wallet query param is required.", 400);

  let walletAddress: Address;
  try {
    walletAddress = getAddress(wallet);
  } catch {
    return errorJson("wallet query param must be a valid address.", 400);
  }

  const prediction = await getSportsPrediction(Number(id));
  if (!prediction) return errorJson("Sports Live Call not found.", 404);
  if (prediction.status === "expired" || isExpired(prediction.expiresAt)) {
    return errorJson("Sports Live Call is expired and no longer unlockable.", 410);
  }

  const unlocked = await hasSportsUnlock(prediction.id, walletAddress);
  if (!unlocked) return errorJson("Sports analysis is locked for this wallet.", 403);

  return noStoreJson({
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
