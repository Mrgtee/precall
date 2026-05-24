import test from "node:test";
import assert from "node:assert/strict";
import { validateSportsVote } from "./agents/sports-council";
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
