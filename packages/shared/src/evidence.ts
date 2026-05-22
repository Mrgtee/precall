import type { EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "./types";
import type { CircleEnrichmentResult } from "./circle/enrichment";

function nowIso() {
  return new Date().toISOString();
}

export function buildEvidenceContext(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  circle?: CircleEnrichmentResult;
}): EvidenceItemInput[] {
  const capturedAt = input.snapshot.capturedAt || nowIso();
  const items: EvidenceItemInput[] = [
    {
      evidenceId: "pm-market",
      sourceType: "polymarket_market",
      sourceUrl: input.market.url,
      title: `Polymarket market: ${input.market.title}`,
      excerpt: `${input.market.description || "No description provided"} Outcomes: ${input.market.outcomes.join("/")}. Close: ${input.market.closeTime || "unknown"}.`,
      credibilityScore: 88,
      capturedAt,
      metadata: {
        marketId: input.market.marketId,
        liquidityUsd: input.market.liquidityUsd,
        volume24hUsd: input.market.volume24hUsd,
      },
    },
    {
      evidenceId: "pm-orderbook",
      sourceType: "polymarket_orderbook",
      sourceUrl: input.market.url,
      title: `Polymarket price snapshot: ${input.market.title}`,
      excerpt: `YES ${input.snapshot.yesPriceBps} bps, NO ${input.snapshot.noPriceBps} bps, spread ${input.snapshot.spreadBps} bps, depth about $${Math.round(input.snapshot.depthUsd).toLocaleString()}.`,
      credibilityScore: 84,
      capturedAt,
      metadata: {
        yesPriceBps: input.snapshot.yesPriceBps,
        noPriceBps: input.snapshot.noPriceBps,
        spreadBps: input.snapshot.spreadBps,
        depthUsd: input.snapshot.depthUsd,
      },
    },
  ];

  for (const [index, item] of (input.circle?.evidence || []).entries()) {
    items.push({
      evidenceId: `circle-x402-${index + 1}`,
      sourceType: "circle_x402_social",
      sourceUrl: item.sourceUrl || input.market.url,
      title: item.title || `x402-paid social evidence ${index + 1}`,
      excerpt: item.excerpt,
      credibilityScore: item.credibilityScore ?? 65,
      capturedAt: item.capturedAt || nowIso(),
      metadata: item.metadata,
    });
  }

  return items;
}

export function validateEvidenceIds(ids: string[], evidence: EvidenceItemInput[]) {
  const validIds = new Set(evidence.map((item) => item.evidenceId));
  return ids.every((id) => validIds.has(id));
}
