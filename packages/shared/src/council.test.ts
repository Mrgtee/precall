import test from "node:test";
import assert from "node:assert/strict";
import { filterEvidenceForAgent } from "./agents/council";
import type { EvidenceItemInput } from "./types";

const mockEvidence: EvidenceItemInput[] = [
  {
    evidenceId: "pm-market",
    sourceType: "polymarket_market",
    provider: "polymarket_gamma",
    sourceUrl: "https://example.com/market",
    title: "Market Baseline",
    excerpt: "Excerpt",
    credibilityScore: 90,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: false,
  },
  {
    evidenceId: "pm-orderbook",
    sourceType: "polymarket_orderbook",
    provider: "polymarket_clob",
    sourceUrl: "https://example.com/market",
    title: "Orderbook Info",
    excerpt: "Excerpt",
    credibilityScore: 85,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: false,
  },
  {
    evidenceId: "tactic-evidence",
    sourceType: "circle_x402_news",
    provider: "news-provider",
    sourceUrl: "https://example.com/news",
    title: "Tactical formation",
    excerpt: "The manager is playing a high-press system.",
    credibilityScore: 80,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: true,
  },
  {
    evidenceId: "stats-evidence",
    sourceType: "circle_x402_social",
    provider: "social-provider",
    sourceUrl: "https://example.com/social",
    title: "Expected goals",
    excerpt: "Underlying xG stats suggest a close H2H game.",
    credibilityScore: 75,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: true,
  },
  {
    evidenceId: "squad-evidence",
    sourceType: "admin_note",
    provider: "admin",
    sourceUrl: "https://example.com/note",
    title: "Lineup injury roster",
    excerpt: "A key player is out on suspension.",
    credibilityScore: 95,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: false,
  },
  {
    evidenceId: "context-evidence",
    sourceType: "free_web",
    provider: "free",
    sourceUrl: "https://example.com/context",
    title: "Standings motivation",
    excerpt: "Group standings require a win to qualify.",
    credibilityScore: 70,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: false,
  },
];

test("filterEvidenceForAgent filters evidence by agent type correctly", () => {
  // TacticsScout -> pm-market + tactic-evidence
  const tactics = filterEvidenceForAgent("TacticsScout", mockEvidence);
  assert.equal(tactics.length, 2);
  assert.ok(tactics.some(e => e.evidenceId === "pm-market"));
  assert.ok(tactics.some(e => e.evidenceId === "tactic-evidence"));

  // StatsEngine -> pm-market + stats-evidence
  const stats = filterEvidenceForAgent("StatsEngine", mockEvidence);
  assert.equal(stats.length, 2);
  assert.ok(stats.some(e => e.evidenceId === "pm-market"));
  assert.ok(stats.some(e => e.evidenceId === "stats-evidence"));

  // SquadDesk -> pm-market + squad-evidence
  const squad = filterEvidenceForAgent("SquadDesk", mockEvidence);
  assert.equal(squad.length, 2);
  assert.ok(squad.some(e => e.evidenceId === "pm-market"));
  assert.ok(squad.some(e => e.evidenceId === "squad-evidence"));

  // ContextScout -> pm-market + pm-orderbook + context-evidence
  const context = filterEvidenceForAgent("ContextScout", mockEvidence);
  assert.equal(context.length, 3);
  assert.ok(context.some(e => e.evidenceId === "pm-market"));
  assert.ok(context.some(e => e.evidenceId === "pm-orderbook"));
  assert.ok(context.some(e => e.evidenceId === "context-evidence"));

  // Skeptic -> sees all
  const skeptic = filterEvidenceForAgent("Skeptic", mockEvidence);
  assert.equal(skeptic.length, 6);
});
