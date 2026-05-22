import test from "node:test";
import assert from "node:assert/strict";
import { aggregateVotes, calculateEdgeBps, passesPublishThresholds, publishThresholdFailures, selectedSideProbabilityBps } from "./scoring";
import type { AgentName, AgentVote, EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "./types";

const agents: AgentName[] = ["MacroScout", "NewsHawk", "CrowdPulse", "BookWatcher", "Skeptic"];

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    source: "polymarket",
    marketId: "btc-150k",
    conditionId: "condition-1",
    slug: "will-bitcoin-hit-150k",
    title: "Will Bitcoin hit $150k?",
    description: "Strict YES/NO test market",
    url: "https://polymarket.com/event/will-bitcoin-hit-150k",
    outcomes: ["Yes", "No"],
    outcomePrices: [0.5, 0.5],
    clobTokenIds: ["yes", "no"],
    liquidityUsd: 25_000,
    volume24hUsd: 2_000,
    closeTime: new Date(Date.now() + 86_400_000).toISOString(),
    status: "active",
    ...overrides,
  };
}

function snapshot(yesPriceBps: number): MarketSnapshot {
  return {
    marketId: "btc-150k",
    yesPriceBps,
    noPriceBps: 10_000 - yesPriceBps,
    spreadBps: 250,
    depthUsd: 10_000,
    capturedAt: new Date().toISOString(),
  };
}

const evidence: EvidenceItemInput[] = [
  {
    evidenceId: "pm-market",
    sourceType: "polymarket_market",
    provider: "polymarket_gamma",
    sourceUrl: "https://polymarket.com/event/will-bitcoin-hit-150k",
    title: "Market metadata",
    excerpt: "Market terms and current prices.",
    credibilityScore: 80,
    fetchedAt: new Date().toISOString(),
    capturedAt: new Date().toISOString(),
    paid: false,
  },
];

function votes(yesProbabilityBps: number, confidenceBps = 6500): AgentVote[] {
  return agents.map((agent) => ({
    agent,
    yesProbabilityBps,
    confidenceBps,
    action: "WATCH",
    thesis: `${agent} thesis`,
    risks: agent === "Skeptic" ? ["Skeptic risk"] : [],
    evidenceIds: ["pm-market"],
  }));
}

test("BUY_NO uses YES probability canonically and selected NO probability for display", () => {
  const call = aggregateVotes(market(), snapshot(7000), votes(4500), evidence);

  assert.equal(call.action, "BUY_NO");
  assert.equal(call.yesProbabilityBps, 4500);
  assert.equal(call.selectedSideProbabilityBps, 5500);
  assert.equal(call.marketPriceBps, 3000);
  assert.equal(call.edgeBps, 2500);
  assert.equal(calculateEdgeBps("BUY_NO", 4500, 7000), 2500);
});

test("BUY_YES uses selected YES probability and YES edge", () => {
  const call = aggregateVotes(market(), snapshot(3000), votes(4500), evidence);

  assert.equal(call.action, "BUY_YES");
  assert.equal(call.yesProbabilityBps, 4500);
  assert.equal(call.selectedSideProbabilityBps, 4500);
  assert.equal(call.marketPriceBps, 3000);
  assert.equal(call.edgeBps, 1500);
  assert.equal(calculateEdgeBps("BUY_YES", 4500, 3000), 1500);
});

test("fair price produces WATCH / no edge", () => {
  const call = aggregateVotes(market(), snapshot(5000), votes(5000), evidence);

  assert.equal(call.action, "WATCH");
  assert.equal(call.edgeBps, 0);
  assert.equal(selectedSideProbabilityBps("BUY_NO", 5000), 5000);
});

test("publish thresholds reject weak calls and accept quality calls", () => {
  const strong = aggregateVotes(market(), snapshot(3000), votes(5200, 7000), evidence);
  const weak = aggregateVotes(market(), snapshot(4900), votes(5000, 4000), evidence);
  const thresholds = { minLiquidityUsd: 10_000, minEdgeBps: 650, maxSpreadBps: 900, minConfidenceBps: 5200, minSuggestedSizeBps: 100 };

  assert.equal(passesPublishThresholds(strong, thresholds), true);
  assert.deepEqual(publishThresholdFailures(weak, thresholds).sort(), ["low_confidence", "low_edge", "tiny_size"].sort());
});
