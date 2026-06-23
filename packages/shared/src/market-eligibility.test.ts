import test from "node:test";
import assert from "node:assert/strict";
import { analysisPriceSkipReason, evaluateMarketEligibility, isAnalysisPriceInBand, isEligibleBinaryMarket, rankMarketCandidates, scoreMarketCandidate, summarizeSkipReasons } from "./market-eligibility";
import type { PolymarketMarket } from "./types";

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    source: "polymarket",
    marketId: "market-1",
    conditionId: "condition-1",
    slug: "ere-aja-utr-2026-05-24-aja",
    title: "Will AFC Ajax win this soccer match?",
    description: "A strict soccer YES/NO market",
    url: "https://polymarket.com/event/ere-aja-utr-2026-05-24-aja",
    outcomes: ["Yes", "No"],
    outcomePrices: [0.4, 0.6],
    clobTokenIds: ["yes", "no"],
    liquidityUsd: 20_000,
    volume24hUsd: 1_000,
    closeTime: "2026-06-30T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

const now = new Date("2026-05-22T00:00:00.000Z");

test("strict YES/NO active future markets are eligible", () => {
  assert.equal(isEligibleBinaryMarket(market()), true);
  assert.deepEqual(evaluateMarketEligibility(market(), { now }).reasons, []);
});

test("non YES/NO binary markets are skipped for V1", () => {
  const result = evaluateMarketEligibility(market({ outcomes: ["Spurs", "Thunder"], outcomePrices: [0.45, 0.55] }), { now });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, ["not_yes_no"]);
});

test("expired, non-binary, missing, invalid, low-liquidity and wide-spread reasons are transparent", () => {
  const result = evaluateMarketEligibility(
    market({ outcomes: ["A", "B", "C"], outcomePrices: [1.2], closeTime: "2026-01-01T00:00:00.000Z", liquidityUsd: 100 }),
    { now, snapshot: { marketId: "market-1", yesPriceBps: 4000, noPriceBps: 6000, spreadBps: 1200, depthUsd: 0, capturedAt: now.toISOString() }, thresholds: { minLiquidityUsd: 10_000, maxSpreadBps: 900 } },
  );

  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("expired"));
  assert.ok(result.reasons.includes("non_binary"));
  assert.ok(result.reasons.includes("missing_prices"));
  assert.ok(result.reasons.includes("low_liquidity"));
  assert.ok(result.reasons.includes("wide_spread"));
});

test("summarizeSkipReasons counts reasons for admin/health output", () => {
  assert.deepEqual(summarizeSkipReasons([{ reasons: ["expired", "not_yes_no"] }, { reasons: ["expired"] }]), { expired: 2, not_yes_no: 1 });
});


test("candidate ranking prefers tighter spread, liquidity, volume, balanced prices, and evidence depth", () => {
  const weaker = {
    market: market({
      marketId: "wide",
      title: "Wide market",
      description: "thin",
      liquidityUsd: 12_000,
      volume24hUsd: 100,
      outcomePrices: [0.97, 0.03],
    }),
    snapshot: { marketId: "wide", yesPriceBps: 9700, noPriceBps: 300, spreadBps: 850, depthUsd: 12_000, capturedAt: now.toISOString() },
  };
  const stronger = {
    market: market({
      marketId: "tight",
      title: "Tight market",
      description: "A detailed market description with clear resolution terms and enough context for evidence-based analysis.",
      liquidityUsd: 80_000,
      volume24hUsd: 25_000,
      outcomePrices: [0.52, 0.48],
    }),
    snapshot: { marketId: "tight", yesPriceBps: 5200, noPriceBps: 4800, spreadBps: 120, depthUsd: 80_000, capturedAt: now.toISOString() },
  };

  const ranked = rankMarketCandidates([weaker, stronger]);
  assert.equal(ranked[0]?.market.marketId, "tight");
  assert.ok(scoreMarketCandidate(stronger.market, stronger.snapshot).score > scoreMarketCandidate(weaker.market, weaker.snapshot).score);
});


test("analysis price band skips extreme lottery-ticket markets before model spend", () => {
  const low = { marketId: "low", yesPriceBps: 5, noPriceBps: 9995, spreadBps: 120, depthUsd: 50_000, capturedAt: now.toISOString() };
  const balanced = { marketId: "balanced", yesPriceBps: 4500, noPriceBps: 5500, spreadBps: 120, depthUsd: 50_000, capturedAt: now.toISOString() };

  assert.equal(isAnalysisPriceInBand(low.yesPriceBps, 100, 9900), false);
  assert.deepEqual(analysisPriceSkipReason(low, 100, 9900), ["extreme_price"]);
  assert.equal(isAnalysisPriceInBand(balanced.yesPriceBps, 100, 9900), true);
  assert.deepEqual(analysisPriceSkipReason(balanced, 100, 9900), []);
});

test("candidate scoring heavily penalizes ultra-extreme prices", () => {
  const extreme = {
    market: market({ marketId: "extreme", title: "Extreme longshot", outcomePrices: [0.0005, 0.9995], liquidityUsd: 1_000_000, volume24hUsd: 250_000 }),
    snapshot: { marketId: "extreme", yesPriceBps: 5, noPriceBps: 9995, spreadBps: 120, depthUsd: 1_000_000, capturedAt: now.toISOString() },
  };
  const useful = {
    market: market({ marketId: "useful", title: "Useful market", outcomePrices: [0.42, 0.58], liquidityUsd: 60_000, volume24hUsd: 20_000 }),
    snapshot: { marketId: "useful", yesPriceBps: 4200, noPriceBps: 5800, spreadBps: 180, depthUsd: 60_000, capturedAt: now.toISOString() },
  };

  const ranked = rankMarketCandidates([extreme, useful]);
  assert.equal(ranked[0]?.market.marketId, "useful");
  assert.ok(scoreMarketCandidate(useful.market, useful.snapshot).score > scoreMarketCandidate(extreme.market, extreme.snapshot).score);
});
