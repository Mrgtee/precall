import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceContext, validateEvidenceIds } from "./evidence-context";
import type { MarketSnapshot, PolymarketMarket } from "../types";

const market: PolymarketMarket = {
  source: "polymarket",
  marketId: "m1",
  conditionId: "c1",
  slug: "test-market",
  title: "Will the test pass?",
  description: "A strict YES/NO market.",
  url: "https://polymarket.com/event/test-market",
  outcomes: ["Yes", "No"],
  outcomePrices: [0.4, 0.6],
  clobTokenIds: ["yes", "no"],
  liquidityUsd: 20000,
  volume24hUsd: 1000,
  closeTime: new Date(Date.now() + 86400000).toISOString(),
  status: "active",
};

const snapshot: MarketSnapshot = {
  marketId: "m1",
  yesPriceBps: 4000,
  noPriceBps: 6000,
  spreadBps: 200,
  depthUsd: 5000,
  capturedAt: new Date().toISOString(),
};

test("Polymarket evidence stays free/public", () => {
  const evidence = buildEvidenceContext({ market, snapshot });

  assert.equal(evidence.length, 2);
  assert.deepEqual(evidence.map((item) => item.provider), ["polymarket_gamma", "polymarket_clob"]);
  assert.equal(evidence.every((item) => item.paid === false), true);
  assert.equal(evidence.every((item) => item.metadata && (item.metadata as { publicData?: boolean }).publicData === true), true);
});

test("model evidence IDs must reference supplied evidence only", () => {
  const evidence = buildEvidenceContext({ market, snapshot });

  assert.equal(validateEvidenceIds(["pm-market", "pm-orderbook"], evidence), true);
  assert.equal(validateEvidenceIds(["pm-market", "invented-source"], evidence), false);
});
