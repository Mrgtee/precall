import test from "node:test";
import assert from "node:assert/strict";
import { fetchAisaX402SocialEvidence } from "./x402-provider";
import type { MarketSnapshot, PolymarketMarket } from "../../types";

const market: PolymarketMarket = {
  source: "polymarket",
  marketId: "m1",
  conditionId: "c1",
  slug: "will-bitcoin-hit-150k",
  title: "Will Bitcoin hit $150k?",
  description: "A strict YES/NO market.",
  url: "https://polymarket.com/event/will-bitcoin-hit-150k",
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

test("successful x402 payment becomes paid evidence", async () => {
  const result = await fetchAisaX402SocialEvidence({
    market,
    snapshot,
    payResource: async <T>() => ({
      enabled: true,
      status: "success",
      paid: true,
      supported: true,
      url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
      amountUsdc: "0.005000",
      maxPaymentUsdc: "0.005",
      dailySpendUsdc: "0.000000",
      dailyBudgetUsdc: "0.10",
      paymentNetwork: "eip155:5042002",
      paymentRef: "0xpayment",
      txHash: "0xpayment",
      data: { response: { tweets: [{ text: "BTC option flow is pricing upside.", url: "https://x.com/a/status/1", author: { userName: "analyst" } }] } } as T,
    }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.paymentAmountUsdc, "0.005000");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.sourceType, "circle_x402_social");
  assert.equal(result.evidence[0]?.provider, "aisa_x402_social");
  assert.equal(result.evidence[0]?.paid, true);
  assert.equal(result.evidence[0]?.paymentRef, "0xpayment");
});

test("failed x402 payment returns no paid evidence but keeps failure metadata", async () => {
  const result = await fetchAisaX402SocialEvidence({
    market,
    snapshot,
    payResource: async <T>() => ({
      enabled: true,
      status: "blocked",
      paid: false,
      supported: true,
      url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
      amountUsdc: "0.020000",
      maxPaymentUsdc: "0.005",
      dailySpendUsdc: "0.000000",
      dailyBudgetUsdc: "0.10",
      error: "x402 payment exceeds cap",
    }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.evidence.length, 0);
  assert.equal(result.paymentAmountUsdc, "0.020000");
  assert.match(result.error || "", /exceeds cap/);
});
