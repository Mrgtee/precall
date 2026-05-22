import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMarketEligibility, isEligibleBinaryMarket, summarizeSkipReasons } from "./market-eligibility";
import type { PolymarketMarket } from "./types";

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    source: "polymarket",
    marketId: "market-1",
    conditionId: "condition-1",
    slug: "strict-yes-no",
    title: "Will this happen?",
    description: "A strict YES/NO market",
    url: "https://polymarket.com/event/strict-yes-no",
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
