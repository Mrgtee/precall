import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSportsVotes, buildSportsEvidenceContext, classifySportsCallStatus, classifySportsMarket, evaluateSportsCandidate, selectedSportsOptionLabel, sportsEventTime, sportsOnlyCategory, sportsHitRatePotentialScore, sportsThresholdFailures, sportsVerdictForStatus } from "./sports";
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


test("sports classifier catches FIFA matchup slugs without team-name hints", () => {
  const classification = classifySportsMarket(market({
    title: "Will Canada win on 2026-06-12?",
    slug: "fifwc-can-bih-2026-06-12-can",
    description: "International soccer match market.",
  }));
  assert.equal(classification.isSports, true);
  assert.equal(classification.category, "soccer");
  assert.equal(classification.marketKind, "moneyline");
});

test("sports classifier catches FIFA matchup slugs when Gamma only exposes them in the URL", () => {
  const classification = classifySportsMarket(market({
    title: "Will Bosnia and Herzegovina win on 2026-06-12?",
    slug: "",
    url: "https://polymarket.com/market/fifwc-can-bih-2026-06-12-bih",
    description: "International match market.",
  }));
  assert.equal(classification.isSports, true);
  assert.equal(classification.category, "soccer");
  assert.equal(classification.marketKind, "moneyline");
});


test("sports classifier supports soccer over/under goal markets", () => {
  for (const line of ["0.5", "1.5", "2.5", "3.5"]) {
    const goalMarket = market({
      title: `Arsenal vs Chelsea: Over ${line} goals`,
      slug: `epl-ars-che-2026-05-24-total-goals-over-${line.replace(".", "pt")}`,
      description: "Soccer total goals market.",
      outcomes: ["Yes", "No"],
      outcomePrices: [0.52, 0.48],
    });
    const classification = classifySportsMarket(goalMarket);
    assert.equal(classification.isSports, true);
    assert.equal(classification.category, "soccer");
    assert.equal(classification.marketKind, "over_under");
    assert.equal(selectedSportsOptionLabel(goalMarket, 0), `Over ${line} goals`);
    assert.equal(selectedSportsOptionLabel(goalMarket, 1), `Under ${line} goals`);
  }
});

test("sports classifier supports match winner and spread markets", () => {
  const matchWinner = classifySportsMarket(market({
    title: "Will Tottenham Hotspur FC win on 2026-05-24?",
    slug: "epl-tot-eve-2026-05-24-tot",
    description: "Premier League match market.",
    url: "https://polymarket.com/market/epl-tot-eve-2026-05-24-tot",
  }));
  assert.equal(matchWinner.category, "soccer");
  assert.equal(matchWinner.marketKind, "moneyline");

  const spread = classifySportsMarket(market({ title: "Thunder vs. Spurs: Spurs +7.5", slug: "nba-okc-sas-2026-05-24-spread-away-7pt5" }));
  assert.equal(spread.category, "nba");
  assert.equal(spread.marketKind, "spread");
});

test("sports classifier prioritizes explicit esports over broad soccer terms", () => {
  const classification = classifySportsMarket(market({
    title: "Valorant: Team Vitality vs Nongshim RedForce (BO3) - Esports World Cup Playoffs",
    slug: "val-vit-ns1-2026-07-10",
    description: "Esports playoff market with clear outcomes.",
    outcomes: ["Team Vitality", "Nongshim RedForce"],
    outcomePrices: [0.58, 0.42],
  }));
  assert.equal(classification.isSports, true);
  assert.equal(classification.category, "esports");
  assert.equal(classification.marketKind, "moneyline");
});

test("sports-only category helper supports worker soccer default", () => {
  const previous = process.env.SPORTS_ONLY_CATEGORY;
  try {
    delete process.env.SPORTS_ONLY_CATEGORY;
    assert.equal(sportsOnlyCategory(), undefined);
    assert.equal(sportsOnlyCategory("soccer"), "soccer");

    process.env.SPORTS_ONLY_CATEGORY = "all";
    assert.equal(sportsOnlyCategory("soccer"), undefined);

    process.env.SPORTS_ONLY_CATEGORY = "esports";
    assert.equal(sportsOnlyCategory("soccer"), "esports");
  } finally {
    if (previous === undefined) delete process.env.SPORTS_ONLY_CATEGORY;
    else process.env.SPORTS_ONLY_CATEGORY = previous;
  }
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

test("sports event window uses close time for late-night games on the slug date", () => {
  const lateGame = market({
    title: "Thunder vs. Spurs",
    slug: "nba-okc-sas-2026-05-24",
    description: "NBA moneyline market.",
    closeTime: "2026-05-25T00:00:00.000Z",
  });
  assert.equal(sportsEventTime(lateGame), "2026-05-25T00:00:00.000Z");
  const result = evaluateSportsCandidate(lateGame, undefined, new Date("2026-05-24T01:00:00.000Z"));
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test("sports candidate eligibility rejects already-started or nearly-live markets", () => {
  const liveGame = market({ closeTime: "2026-05-24T20:00:00.000Z" });
  const liveResult = evaluateSportsCandidate(liveGame, undefined, new Date("2026-05-24T20:01:00.000Z"));
  assert.equal(liveResult.eligible, false);
  assert.ok(liveResult.reasons.includes("event_started"));

  const almostLiveResult = evaluateSportsCandidate(liveGame, undefined, new Date("2026-05-24T19:45:01.000Z"));
  assert.equal(almostLiveResult.eligible, false);
  assert.ok(almostLiveResult.reasons.includes("event_starting_soon"));
});

test("sports candidate eligibility allows non-YES/NO selected-outcome sports markets", () => {
  const result = evaluateSportsCandidate(market(), undefined, now);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.candidate?.outcomeIndexes, [0, 1]);
});

test("sports candidate eligibility rejects non-sports but lets soft price bands become labels", () => {
  const nonSports = evaluateSportsCandidate(market({ title: "Will Congress pass a bill?", slug: "politics", description: "A legislative market with no sport context.", outcomePrices: [0.02, 0.98] }), undefined, now);
  assert.equal(nonSports.eligible, false);
  assert.ok(nonSports.reasons.includes("not_sports"));
  assert.ok(!nonSports.reasons.includes("no_reasonable_price_band"));

  const extremeSports = evaluateSportsCandidate(market({ title: "Arsenal vs Chelsea: Over 3.5 goals", slug: "epl-ars-che-2026-05-24-total-goals-over-3pt5", description: "Soccer total goals market.", outcomes: ["Yes", "No"], outcomePrices: [0.08, 0.92] }), undefined, now);
  assert.equal(extremeSports.eligible, true);
  assert.deepEqual(extremeSports.reasons, []);
  assert.deepEqual(extremeSports.candidate?.outcomeIndexes, [0, 1]);
});

test("sports candidate eligibility treats below-threshold liquidity as soft but zero liquidity as invalid", () => {
  const thinButReal = evaluateSportsCandidate(market({ liquidityUsd: 500 }), undefined, now);
  assert.equal(thinButReal.eligible, true);
  assert.deepEqual(thinButReal.reasons, []);

  const deadMarket = evaluateSportsCandidate(market({ liquidityUsd: 0 }), undefined, now);
  assert.equal(deadMarket.eligible, false);
  assert.ok(deadMarket.reasons.includes("low_liquidity"));
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




test("sports hit-rate mode prefers high-probability outcomes before small-profit edge", () => {
  const favoriteMarket = market({
    outcomes: ["Favorite FC", "Underdog FC"],
    outcomePrices: [0.72, 0.28],
    title: "Soccer: Favorite FC vs Underdog FC - Match Winner",
    slug: "epl-fav-und-2026-05-24",
  });
  const favoriteSnapshot: OutcomeSnapshot = { ...snapshot, outcomeIndex: 0, outcome: "Favorite FC", priceBps: 7200, complementPriceBps: 2800 };
  const evidence = buildSportsEvidenceContext({ market: favoriteMarket, snapshot: favoriteSnapshot });
  const votes: SportsVote[] = [
    { agent: "FormScout", selectedOutcomeIndex: 1, agentProbabilityBps: 6100, confidenceBps: 7000, thesis: "Underdog has a case [pm-market].", risks: ["Favorite still likely"], evidenceIds: ["pm-market"] },
    { agent: "MarketMover", selectedOutcomeIndex: 1, agentProbabilityBps: 6000, confidenceBps: 6500, thesis: "Underdog payout is larger [pm-selected-outcome].", risks: [], evidenceIds: ["pm-selected-outcome"] },
    { agent: "InjuryNews", selectedOutcomeIndex: 0, agentProbabilityBps: 7300, confidenceBps: 4600, thesis: "No supplied favorite injury red flag [pm-market].", risks: [], evidenceIds: ["pm-market"] },
    { agent: "MatchupDesk", selectedOutcomeIndex: 0, agentProbabilityBps: 7200, confidenceBps: 4500, thesis: "Favorite remains the most likely winner [pm-selected-outcome].", risks: [], evidenceIds: ["pm-selected-outcome"] },
    { agent: "Skeptic", selectedOutcomeIndex: 1, agentProbabilityBps: 5800, confidenceBps: 5200, thesis: "Underdog edge is speculative [pm-market].", risks: ["Favorite price may be efficient"], evidenceIds: ["pm-market"] },
  ];

  const idea = aggregateSportsVotes({ market: favoriteMarket, snapshot: favoriteSnapshot, category: "soccer", marketKind: "moneyline", evidence, votes });
  assert.equal(idea.selectedOption, "Favorite FC");
  assert.equal(idea.marketPriceBps, 7200);
  assert.ok(idea.agentProbabilityBps >= 7000);
  assert.ok(idea.edgeBps <= 150);
  assert.ok(sportsHitRatePotentialScore(favoriteMarket) > 0);
});

test("sports live call status classifies strong, lean, and high-risk calls", () => {
  const strongIdea = { edgeBps: 700, confidenceBps: 6200, marketPriceBps: 4400, agentProbabilityBps: 5100, riskLevel: "medium" as const, snapshot: { ...snapshot, spreadBps: 120 } };
  const leanIdea = { edgeBps: 250, confidenceBps: 4200, marketPriceBps: 4400, agentProbabilityBps: 4650, riskLevel: "high" as const, snapshot };
  const highRiskIdea = { edgeBps: 100, confidenceBps: 3200, marketPriceBps: 4400, agentProbabilityBps: 4500, riskLevel: "high" as const, snapshot };
  const zeroEdgeIdea = { edgeBps: 0, confidenceBps: 5600, marketPriceBps: 4400, agentProbabilityBps: 5000, riskLevel: "high" as const, snapshot };
  const highProbabilityStrongIdea = { edgeBps: 40, confidenceBps: 5600, marketPriceBps: 7200, agentProbabilityBps: 7240, riskLevel: "medium" as const, snapshot: { ...snapshot, priceBps: 7200, spreadBps: 120 } };
  const highProbabilityLeanIdea = { edgeBps: 25, confidenceBps: 4300, marketPriceBps: 7200, agentProbabilityBps: 7225, riskLevel: "medium" as const, snapshot: { ...snapshot, priceBps: 7200, spreadBps: 120 } };
  assert.equal(classifySportsCallStatus(strongIdea), "strong_call");
  assert.equal(classifySportsCallStatus(leanIdea), "lean_call");
  assert.equal(classifySportsCallStatus(highRiskIdea), "high_risk_call");
  assert.equal(classifySportsCallStatus(zeroEdgeIdea), "high_risk_call");
  assert.equal(classifySportsCallStatus(highProbabilityStrongIdea), "strong_call");
  assert.equal(classifySportsCallStatus(highProbabilityLeanIdea), "lean_call");
  assert.match(sportsVerdictForStatus("avoid_call", { selectedOption: "Knicks", edgeBps: 0, confidenceBps: 5600, riskLevel: "high" }), /high risk/i);
});

test("sports candidate eligibility respects SPORTS_ONLY_CATEGORY env variable", () => {
  const nbaMarket = market(); // NBA Category by default
  const soccerMarket = market({
    title: "Arsenal vs Chelsea",
    slug: "epl-ars-che-2026-05-24",
    description: "Soccer match.",
    outcomes: ["Arsenal", "Chelsea"],
    outcomePrices: [0.52, 0.48],
  });

  // Set SPORTS_ONLY_CATEGORY = soccer
  process.env.SPORTS_ONLY_CATEGORY = "soccer";

  try {
    const nbaResult = evaluateSportsCandidate(nbaMarket, undefined, now);
    assert.equal(nbaResult.eligible, false);
    assert.ok(nbaResult.reasons.includes("wrong_sports_category"));

    const soccerResult = evaluateSportsCandidate(soccerMarket, undefined, now);
    assert.equal(soccerResult.eligible, true);
    assert.deepEqual(soccerResult.reasons, []);
  } finally {
    delete process.env.SPORTS_ONLY_CATEGORY;
  }
});
