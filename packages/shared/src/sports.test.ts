import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSportsVotes, buildSportsEvidenceContext, classifySportsMarket, evaluateSportsCandidate, sportsEventTime, sportsThresholdFailures } from "./sports";
import type { OutcomeSnapshot, PolymarketMarket, SportsVote } from "./types";

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    source: "polymarket",
    marketId: "sports-1",
    conditionId: "condition-1",
    slug: "nba-nyk-bos-2026-05-24",
    title: "NBA: Knicks vs Celtics - Game Winner",
    description: "Basketball market with clear outcomes and matchup context.",
    url: "https://polymarket.com/market/nba-nyk-bos-2026-05-24",
    outcomes: ["Knicks", "Celtics"],
    outcomePrices: [0.44, 0.56],
    clobTokenIds: ["knicks", "celtics"],
    liquidityUsd: 120_000,
    volume24hUsd: 80_000,
    closeTime: "2026-05-24T20:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

const now = new Date("2026-05-24T00:00:00.000Z");
const snapshot: OutcomeSnapshot = {
  marketId: "sports-1",
  outcomeIndex: 0,
  outcome: "Knicks",
  priceBps: 4400,
  complementPriceBps: 5600,
  spreadBps: 120,
  depthUsd: 120_000,
  capturedAt: now.toISOString(),
};

test("sports classifier identifies NBA and moneyline-style markets", () => {
  const classification = classifySportsMarket(market());
  assert.equal(classification.isSports, true);
  assert.equal(classification.category, "nba");
  assert.equal(classification.marketKind, "moneyline");
});

test("sports classifier avoids substring false positives in non-sports politics markets", () => {
  const classification = classifySportsMarket(market({
    title: "US x Iran permanent peace deal by May 31, 2026?",
    slug: "us-x-iran-permanent-peace-deal-by-may-31-2026",
    description: "A geopolitics market, not an MMA or football market.",
  }));
  assert.equal(classification.isSports, false);
  assert.ok(classification.reasons.includes("not_sports"));
});

test("sports classifier catches club-name soccer markets without explicit soccer words", () => {
  const classification = classifySportsMarket(market({
    title: "Will AFC Ajax win on 2026-05-24?",
    slug: "ere-aja-utr-2026-05-24-aja",
    description: "Dutch league match market.",
  }));
  assert.equal(classification.isSports, true);
  assert.equal(classification.category, "soccer");
});

test("sports event date keeps same-day markets eligible when Polymarket close time is later", () => {
  const tennisMarket = market({
    title: "Roland Garros ATP: Tomas Etcheverry vs Nuno Borges",
    slug: "atp-etcheve-borges-2026-05-24",
    description: "Tennis match market with two clear outcomes.",
    closeTime: "2026-05-31T09:00:00.000Z",
  });
  assert.equal(sportsEventTime(tennisMarket), "2026-05-24T09:00:00.000Z");
  const result = evaluateSportsCandidate(tennisMarket, undefined, now);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test("sports event window falls back to near close time for late-night games", () => {
  const lateGame = market({
    title: "Thunder vs. Spurs",
    slug: "nba-okc-sas-2026-05-24",
    description: "NBA moneyline market.",
    closeTime: "2026-05-25T00:00:00.000Z",
  });
  const result = evaluateSportsCandidate(lateGame, undefined, new Date("2026-05-24T01:00:00.000Z"));
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test("sports candidate eligibility allows non-YES/NO selected-outcome sports markets", () => {
  const result = evaluateSportsCandidate(market(), undefined, now);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.candidate?.outcomeIndexes, [0, 1]);
});

test("sports candidate eligibility rejects non-sports and extreme prices", () => {
  const result = evaluateSportsCandidate(market({ title: "Will Congress pass a bill?", slug: "politics", description: "A legislative market with no sport context.", outcomePrices: [0.02, 0.98] }), undefined, now);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("not_sports"));
  assert.ok(result.reasons.includes("no_reasonable_price_band"));
});

test("sports aggregation uses selected outcome probability and edge semantics", () => {
  const evidence = buildSportsEvidenceContext({ market: market(), snapshot });
  const votes: SportsVote[] = [
    { agent: "FormScout", selectedOutcomeIndex: 0, agentProbabilityBps: 5200, confidenceBps: 6000, thesis: "Form supports Knicks [pm-market].", risks: ["Variance"], evidenceIds: ["pm-market"] },
    { agent: "InjuryNews", selectedOutcomeIndex: 0, agentProbabilityBps: 5100, confidenceBps: 5600, thesis: "No supplied injury red flag [pm-selected-outcome].", risks: [], evidenceIds: ["pm-selected-outcome"] },
    { agent: "MarketMover", selectedOutcomeIndex: 0, agentProbabilityBps: 5150, confidenceBps: 5700, thesis: "Price leaves room [pm-selected-outcome].", risks: [], evidenceIds: ["pm-selected-outcome"] },
    { agent: "MatchupDesk", selectedOutcomeIndex: 1, agentProbabilityBps: 5800, confidenceBps: 3000, thesis: "Celtics alternative case [pm-market].", risks: [], evidenceIds: ["pm-market"] },
    { agent: "Skeptic", selectedOutcomeIndex: 0, agentProbabilityBps: 5000, confidenceBps: 5200, thesis: "Edge is not guaranteed [pm-market].", risks: ["Market may be efficient"], evidenceIds: ["pm-market"] },
  ];

  const idea = aggregateSportsVotes({ market: market(), snapshot, category: "nba", marketKind: "moneyline", evidence, votes });
  assert.equal(idea.selectedOption, "Knicks");
  assert.equal(idea.marketPriceBps, 4400);
  assert.ok(idea.agentProbabilityBps > 5000);
  assert.ok(idea.edgeBps > 600);
  assert.equal(sportsThresholdFailures(idea).length, 0);
});
