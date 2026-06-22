import test from "node:test";
import assert from "node:assert/strict";
import { filterSportsEvidenceForAgent, validateSportsVote } from "./agents/sports-council";
import type { EvidenceItemInput } from "./types";

const evidence: EvidenceItemInput[] = [{
  evidenceId: "pm-market",
  sourceType: "polymarket_market",
  provider: "polymarket",
  sourceUrl: "https://polymarket.com/market/test",
  title: "Market",
  excerpt: "Supplied market evidence.",
  credibilityScore: 80,
  fetchedAt: "2026-05-24T00:00:00.000Z",
  capturedAt: "2026-05-24T00:00:00.000Z",
  paid: false,
}];

test("sports council rejects unknown evidence IDs", () => {
  assert.throws(() => validateSportsVote({
    agent: "FormScout",
    selectedOutcomeIndex: 0,
    agentProbabilityBps: 5500,
    confidenceBps: 5000,
    thesis: "Unsupported claim [fake-evidence].",
    risks: ["variance"],
    evidenceIds: ["fake-evidence"],
  }, "FormScout", evidence, [0, 1], 10, 0), /unknown evidence IDs/);
});

test("filterSportsEvidenceForAgent matches keywords and segments evidence correctly", () => {
  const mockEvidence: EvidenceItemInput[] = [
    {
      evidenceId: "pm-market",
      sourceType: "polymarket_market",
      provider: "polymarket",
      sourceUrl: "https://example.com",
      title: "Market Baseline",
      excerpt: "Baseline market data.",
      credibilityScore: 90,
      fetchedAt: "2026-06-22T00:00:00Z",
      capturedAt: "2026-06-22T00:00:00Z",
      paid: false,
    },
    {
      evidenceId: "pm-selected-outcome",
      sourceType: "polymarket_orderbook",
      provider: "polymarket",
      sourceUrl: "https://example.com",
      title: "Orderbook Detail",
      excerpt: "Orderbook snapshot.",
      credibilityScore: 85,
      fetchedAt: "2026-06-22T00:00:00Z",
      capturedAt: "2026-06-22T00:00:00Z",
      paid: false,
    },
    {
      evidenceId: "form-evidence",
      sourceType: "circle_x402_news",
      provider: "provider",
      sourceUrl: "https://example.com",
      title: "Team Form and Stats",
      excerpt: "Recent wins, losses, stats and h2h records.",
      credibilityScore: 80,
      fetchedAt: "2026-06-22T00:00:00Z",
      capturedAt: "2026-06-22T00:00:00Z",
      paid: true,
    },
    {
      evidenceId: "injury-evidence",
      sourceType: "circle_x402_news",
      provider: "provider",
      sourceUrl: "https://example.com",
      title: "Lineup Injury Update",
      excerpt: "Roster status: key players are out or active on the bench.",
      credibilityScore: 80,
      fetchedAt: "2026-06-22T00:00:00Z",
      capturedAt: "2026-06-22T00:00:00Z",
      paid: true,
    },
    {
      evidenceId: "market-evidence",
      sourceType: "circle_x402_social",
      provider: "provider",
      sourceUrl: "https://example.com",
      title: "Odds Movement",
      excerpt: "Positions on pricing, book spreads, and volume.",
      credibilityScore: 75,
      fetchedAt: "2026-06-22T00:00:00Z",
      capturedAt: "2026-06-22T00:00:00Z",
      paid: true,
    },
    {
      evidenceId: "tactics-evidence",
      sourceType: "free_web",
      provider: "provider",
      sourceUrl: "https://example.com",
      title: "Tactical Matchup and Weather",
      excerpt: "Matchup tactical styles and court weather conditions.",
      credibilityScore: 70,
      fetchedAt: "2026-06-22T00:00:00Z",
      capturedAt: "2026-06-22T00:00:00Z",
      paid: false,
    },
  ];



  // FormScout sees pm-market + form-evidence
  const form = filterSportsEvidenceForAgent("FormScout", mockEvidence);
  assert.equal(form.length, 2);
  assert.ok(form.some((e: any) => e.evidenceId === "pm-market"));
  assert.ok(form.some((e: any) => e.evidenceId === "form-evidence"));

  // InjuryNews sees pm-market + injury-evidence
  const injury = filterSportsEvidenceForAgent("InjuryNews", mockEvidence);
  assert.equal(injury.length, 2);
  assert.ok(injury.some((e: any) => e.evidenceId === "pm-market"));
  assert.ok(injury.some((e: any) => e.evidenceId === "injury-evidence"));

  // MarketMover sees pm-market + pm-selected-outcome + market-evidence
  const mover = filterSportsEvidenceForAgent("MarketMover", mockEvidence);
  assert.equal(mover.length, 3);
  assert.ok(mover.some((e: any) => e.evidenceId === "pm-market"));
  assert.ok(mover.some((e: any) => e.evidenceId === "pm-selected-outcome"));
  assert.ok(mover.some((e: any) => e.evidenceId === "market-evidence"));

  // MatchupDesk sees pm-market + tactics-evidence
  const matchup = filterSportsEvidenceForAgent("MatchupDesk", mockEvidence);
  assert.equal(matchup.length, 2);
  assert.ok(matchup.some((e: any) => e.evidenceId === "pm-market"));
  assert.ok(matchup.some((e: any) => e.evidenceId === "tactics-evidence"));

  // Skeptic sees all
  const skeptic = filterSportsEvidenceForAgent("Skeptic", mockEvidence);
  assert.equal(skeptic.length, 6);
});
