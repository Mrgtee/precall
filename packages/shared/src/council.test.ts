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
    evidenceId: "news-1",
    sourceType: "circle_x402_news",
    provider: "news-provider",
    sourceUrl: "https://example.com/news",
    title: "News Story",
    excerpt: "Excerpt",
    credibilityScore: 80,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: true,
  },
  {
    evidenceId: "social-1",
    sourceType: "circle_x402_social",
    provider: "social-provider",
    sourceUrl: "https://example.com/social",
    title: "Social Post",
    excerpt: "Excerpt",
    credibilityScore: 75,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: true,
  },
  {
    evidenceId: "note-1",
    sourceType: "admin_note",
    provider: "admin",
    sourceUrl: "https://example.com/note",
    title: "Admin Note",
    excerpt: "Excerpt",
    credibilityScore: 95,
    fetchedAt: "2026-06-22T00:00:00Z",
    capturedAt: "2026-06-22T00:00:00Z",
    paid: false,
  },
];

test("filterEvidenceForAgent filters evidence by agent type correctly", () => {
  // MacroScout -> pm-market + admin_note
  const macro = filterEvidenceForAgent("MacroScout", mockEvidence);
  assert.equal(macro.length, 2);
  assert.ok(macro.some(e => e.evidenceId === "pm-market"));
  assert.ok(macro.some(e => e.evidenceId === "note-1"));

  // NewsHawk -> pm-market + circle_x402_news
  const news = filterEvidenceForAgent("NewsHawk", mockEvidence);
  assert.equal(news.length, 2);
  assert.ok(news.some(e => e.evidenceId === "pm-market"));
  assert.ok(news.some(e => e.evidenceId === "news-1"));

  // CrowdPulse -> pm-market + circle_x402_social
  const crowd = filterEvidenceForAgent("CrowdPulse", mockEvidence);
  assert.equal(crowd.length, 2);
  assert.ok(crowd.some(e => e.evidenceId === "pm-market"));
  assert.ok(crowd.some(e => e.evidenceId === "social-1"));

  // BookWatcher -> pm-market + pm-orderbook
  const book = filterEvidenceForAgent("BookWatcher", mockEvidence);
  assert.equal(book.length, 2);
  assert.ok(book.some(e => e.evidenceId === "pm-market"));
  assert.ok(book.some(e => e.evidenceId === "pm-orderbook"));

  // Skeptic -> sees all
  const skeptic = filterEvidenceForAgent("Skeptic", mockEvidence);
  assert.equal(skeptic.length, 5);
});
