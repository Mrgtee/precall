import type { EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "../../types";

function nowIso() {
  return new Date().toISOString();
}

export function buildPolymarketEvidence(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
}): EvidenceItemInput[] {
  const fetchedAt = input.snapshot.capturedAt || nowIso();
  return [
    {
      evidenceId: "pm-market",
      sourceType: "polymarket_market",
      provider: "polymarket_gamma",
      sourceUrl: input.market.url,
      title: `Polymarket market: ${input.market.title}`,
      excerpt: `${input.market.description || "No description provided"} Outcomes: ${input.market.outcomes.join("/")}. Close: ${input.market.closeTime || "unknown"}.`,
      credibilityScore: 88,
      fetchedAt,
      capturedAt: fetchedAt,
      paid: false,
      metadata: {
        marketId: input.market.marketId,
        liquidityUsd: input.market.liquidityUsd,
        volume24hUsd: input.market.volume24hUsd,
        publicData: true,
      },
    },
    {
      evidenceId: "pm-orderbook",
      sourceType: "polymarket_orderbook",
      provider: "polymarket_clob",
      sourceUrl: input.market.url,
      title: `Polymarket price snapshot: ${input.market.title}`,
      excerpt: `YES ${input.snapshot.yesPriceBps} bps, NO ${input.snapshot.noPriceBps} bps, spread ${input.snapshot.spreadBps} bps, depth about $${Math.round(input.snapshot.depthUsd).toLocaleString()}.`,
      credibilityScore: 84,
      fetchedAt,
      capturedAt: fetchedAt,
      paid: false,
      metadata: {
        yesPriceBps: input.snapshot.yesPriceBps,
        noPriceBps: input.snapshot.noPriceBps,
        spreadBps: input.snapshot.spreadBps,
        depthUsd: input.snapshot.depthUsd,
        publicData: true,
      },
    },
  ];
}
