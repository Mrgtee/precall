import test from "node:test";
import assert from "node:assert/strict";
import { fetchMarketSnapshot, fetchPolymarketSelectedOutcomeResolution } from "./polymarket";
import type { PolymarketMarket } from "./types";

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    source: "polymarket",
    marketId: "market-1",
    conditionId: "condition-1",
    slug: "market-1",
    title: "Will this happen?",
    description: "A YES/NO market.",
    url: "https://polymarket.com/market/market-1",
    outcomes: ["No", "Yes"],
    outcomePrices: [0.6, 0.4],
    clobTokenIds: ["no-token", "yes-token"],
    liquidityUsd: 50_000,
    volume24hUsd: 10_000,
    closeTime: "2026-06-30T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

test("fetchMarketSnapshot uses the YES token and computes best bid/ask spread from unsorted CLOB levels", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({
      bids: [{ price: "0.35" }, { price: "0.39" }, { price: "0.32" }],
      asks: [{ price: "0.47" }, { price: "0.41" }, { price: "0.44" }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const snapshot = await fetchMarketSnapshot(market());
    assert.match(requestedUrl, /token_id=yes-token/);
    assert.equal(snapshot.yesPriceBps, 4000);
    assert.equal(snapshot.noPriceBps, 6000);
    assert.equal(snapshot.spreadBps, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMarketSnapshot falls back to liquidity spread estimate when CLOB book has no usable best bid/ask", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ bids: [], asks: [] }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const snapshot = await fetchMarketSnapshot(market({ liquidityUsd: 50_000 }));
    assert.equal(snapshot.spreadBps, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("fetchPolymarketSelectedOutcomeResolution uses CLOB token winner when Gamma prices are ambiguous", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("gamma-api.polymarket.com")) {
      return new Response(JSON.stringify({
        id: "sports-1",
        question: "Team A vs Team B",
        conditionId: "condition-1",
        slug: "team-a-team-b",
        closed: true,
        active: true,
        acceptingOrders: false,
        umaResolutionStatus: "resolved",
        outcomes: JSON.stringify(["Team A", "Team B"]),
        outcomePrices: JSON.stringify(["0.5", "0.5"]),
        closedTime: "2026-06-01T00:00:00Z",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("clob.polymarket.com/markets/condition-1")) {
      return new Response(JSON.stringify({
        closed: true,
        is_50_50_outcome: false,
        tokens: [
          { outcome: "Team A", price: 0, winner: false },
          { outcome: "Team B", price: 1, winner: true },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const resolution = await fetchPolymarketSelectedOutcomeResolution("sports-1");
    assert.equal(resolution?.resolvedOutcomeIndex, 1);
    assert.equal(resolution?.resolvedOutcome, "Team B");
    assert.equal(resolution?.finalPriceBps, 10_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchPolymarketSelectedOutcomeResolution resolves 50-50 markets as push", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes("gamma-api.polymarket.com")) {
      return new Response(JSON.stringify({
        id: "sports-push",
        question: "Player A vs Player B",
        conditionId: "condition-push",
        slug: "player-a-player-b",
        closed: true,
        active: true,
        acceptingOrders: false,
        umaResolutionStatus: "resolved",
        outcomes: JSON.stringify(["Player A", "Player B"]),
        outcomePrices: JSON.stringify(["0.5", "0.5"]),
        closedTime: "2026-06-01T00:00:00Z",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (href.includes("clob.polymarket.com/markets/condition-push")) {
      return new Response(JSON.stringify({
        closed: true,
        is_50_50_outcome: true,
        tokens: [
          { outcome: "Player A", price: 0.5, winner: false },
          { outcome: "Player B", price: 0.5, winner: false },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  };

  try {
    const resolution = await fetchPolymarketSelectedOutcomeResolution("sports-push");
    assert.equal(resolution?.resolvedOutcomeIndex, null);
    assert.equal(resolution?.resolvedOutcome, "50-50 / Push");
    assert.equal(resolution?.finalPriceBps, 5_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
