import type { EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "../types";
import { buildPolymarketEvidence } from "./providers/polymarket-provider";
import type { X402EvidenceProviderResult } from "./providers/x402-provider";

export function buildEvidenceContext(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  x402?: X402EvidenceProviderResult;
  freeEvidence?: EvidenceItemInput[];
}): EvidenceItemInput[] {
  const publicEvidence = buildPolymarketEvidence({ market: input.market, snapshot: input.snapshot });
  return [...publicEvidence, ...(input.freeEvidence || []), ...(input.x402?.evidence || [])];
}

export function validateEvidenceIds(ids: string[], evidence: EvidenceItemInput[]) {
  const validIds = new Set(evidence.map((item) => item.evidenceId));
  return ids.every((id) => validIds.has(id));
}

export function evidenceQualityScore(evidence: EvidenceItemInput[]) {
  if (evidence.length === 0) return 0;
  const total = evidence.reduce((sum, item) => sum + item.credibilityScore, 0);
  return Math.round(total / evidence.length);
}
