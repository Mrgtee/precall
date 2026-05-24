import test from "node:test";
import assert from "node:assert/strict";
import { fetchMarketSnapshot } from "./polymarket";
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
