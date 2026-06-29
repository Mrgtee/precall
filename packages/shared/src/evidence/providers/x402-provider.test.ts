import test from "node:test";
import assert from "node:assert/strict";
import { fetchAisaX402SocialEvidence, fetchTavilyX402SearchEvidence } from "./x402-provider";
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
      paymentNetwork: "eip155:8453",
      selectedChain: "base",
      paymentRef: "0xpayment",
      txHash: "0xpayment",
      data: { response: { tweets: [{ text: "BTC option flow is pricing upside.", url: "https://x.com/a/status/1", author: { userName: "analyst" } }] } } as T,
    }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.paymentAmountUsdc, "0.005000");
  assert.equal(result.selectedChain, "base");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.sourceType, "circle_x402_social");
  assert.equal(result.evidence[0]?.provider, "aisa_x402_social");
  assert.equal(result.evidence[0]?.paid, true);
  assert.equal(result.evidence[0]?.paymentRef, "0xpayment");
  assert.equal(result.evidence[0]?.paymentNetwork, "eip155:8453");
  assert.equal(result.evidence[0]?.metadata?.selectedChain, "base");
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


test("unsupported x402 chains return no paid evidence and keep unsupported_network reason", async () => {
  const result = await fetchAisaX402SocialEvidence({
    market,
    snapshot,
    payResource: async <T>() => ({
      enabled: true,
      status: "unsupported",
      paid: false,
      supported: false,
      url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
      maxPaymentUsdc: "0.005",
      dailySpendUsdc: "0.000000",
      dailyBudgetUsdc: "0.10",
      failureReason: "unsupported_network",
      supportChecks: [
        { chain: "base", status: "unsupported", supported: false, error: "No Gateway batching option available" },
      ],
      error: "unsupported_network: no Gateway batching option available for candidate chains base",
    }),
  });

  assert.equal(result.status, "unsupported");
  assert.equal(result.failureReason, "unsupported_network");
  assert.equal(result.evidence.length, 0);
  assert.equal(result.supportChecks?.length, 1);
});


test("provider 502 falls back to internal Circle Gateway paid evidence", async () => {
  const previousSeller = process.env.CIRCLE_X402_SELLER_ADDRESS;
  process.env.CIRCLE_X402_SELLER_ADDRESS = "0x0000000000000000000000000000000000000001";
  let calls = 0;
  const result = await fetchAisaX402SocialEvidence({
    market,
    snapshot,
    payResource: async <T>() => {
      calls += 1;
      if (calls === 1) {
        return {
          enabled: true,
          status: "failed",
          paid: false,
          supported: false,
          url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
          maxPaymentUsdc: "0.025",
          dailySpendUsdc: "0.000000",
          dailyBudgetUsdc: "0.10",
          failureReason: "provider_unavailable",
          error: "x402 provider request failed with HTTP 502. Body: error code: 502",
        };
      }
      return {
        enabled: true,
        status: "success",
        paid: true,
        supported: true,
        url: "http://127.0.0.1:3100/evidence",
        amountUsdc: "0.001000",
        maxPaymentUsdc: "0.025",
        dailySpendUsdc: "0.000000",
        dailyBudgetUsdc: "0.10",
        paymentNetwork: "eip155:8453",
        selectedChain: "base",
        paymentRef: "0xgateway",
        txHash: "0xgateway",
        data: { signals: [{ title: "Gateway-paid packet", excerpt: "Circle Gateway evidence reached AI analysis.", sourceUrl: market.url }] } as T,
      };
    },
  });

  if (previousSeller === undefined) delete process.env.CIRCLE_X402_SELLER_ADDRESS;
  else process.env.CIRCLE_X402_SELLER_ADDRESS = previousSeller;

  assert.equal(calls, 2);
  assert.equal(result.status, "success");
  assert.equal(result.provider, "precall_gateway_x402_evidence");
  assert.equal(result.paymentAmountUsdc, "0.001000");
  assert.equal(result.selectedChain, "base");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.provider, "precall_gateway_x402_evidence");
  assert.equal(result.evidence[0]?.paymentRef, "0xgateway");
  assert.equal(result.evidence[0]?.metadata?.circleGatewayBatched, true);
  assert.match(result.evidence[0]?.excerpt || "", /Gateway evidence reached/i);
});


test("provider Cloudflare 403 falls back to internal Circle Gateway paid evidence", async () => {
  const previousSeller = process.env.CIRCLE_X402_SELLER_ADDRESS;
  process.env.CIRCLE_X402_SELLER_ADDRESS = "0x0000000000000000000000000000000000000001";
  let calls = 0;
  const result = await fetchAisaX402SocialEvidence({
    market,
    snapshot,
    payResource: async <T>() => {
      calls += 1;
      if (calls === 1) {
        return {
          enabled: true,
          status: "failed",
          paid: false,
          supported: false,
          url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
          maxPaymentUsdc: "0.025",
          dailySpendUsdc: "0.000000",
          dailyBudgetUsdc: "0.10",
          error: "x402 provider request failed with HTTP 403. Body: <title>Just a moment...</title><meta name=\"robots\" content=\"noindex,nofollow\">",
        };
      }
      return {
        enabled: true,
        status: "success",
        paid: true,
        supported: true,
        url: "http://127.0.0.1:3100/evidence",
        amountUsdc: "0.001000",
        maxPaymentUsdc: "0.025",
        dailySpendUsdc: "0.000000",
        dailyBudgetUsdc: "0.10",
        paymentNetwork: "eip155:8453",
        selectedChain: "base",
        paymentRef: "0xgateway403",
        txHash: "0xgateway403",
        data: { signals: [{ title: "Gateway-paid packet", excerpt: "Circle Gateway evidence handled the provider challenge.", sourceUrl: market.url }] } as T,
      };
    },
  });

  if (previousSeller === undefined) delete process.env.CIRCLE_X402_SELLER_ADDRESS;
  else process.env.CIRCLE_X402_SELLER_ADDRESS = previousSeller;

  assert.equal(calls, 2);
  assert.equal(result.status, "success");
  assert.equal(result.provider, "precall_gateway_x402_evidence");
  assert.equal(result.paymentAmountUsdc, "0.001000");
  assert.equal(result.evidence[0]?.paymentRef, "0xgateway403");
  assert.match(result.evidence[0]?.excerpt || "", /provider challenge/i);
});

test("provider fallback can be disabled", async () => {
  const previous = process.env.ENABLE_X402_FALLBACK_PROVIDERS;
  process.env.ENABLE_X402_FALLBACK_PROVIDERS = "false";
  try {
    let calls = 0;
    const result = await fetchAisaX402SocialEvidence({
      market,
      snapshot,
      payResource: async () => {
        calls += 1;
        return {
          enabled: true,
          status: "failed",
          paid: false,
          supported: false,
          url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
          maxPaymentUsdc: "0.025",
          dailySpendUsdc: "0.000000",
          dailyBudgetUsdc: "0.10",
          failureReason: "provider_unavailable",
          error: "x402 provider request failed with HTTP 502. Body: error code: 502",
        };
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.provider, "aisa_x402_social");
    assert.equal(result.failureReason, "provider_unavailable");
    assert.equal(result.evidence.length, 0);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_X402_FALLBACK_PROVIDERS;
    else process.env.ENABLE_X402_FALLBACK_PROVIDERS = previous;
  }
});

test("tavily x402 payment successfully parses search results and answer summary", async () => {
  const result = await fetchTavilyX402SearchEvidence({
    market,
    payResource: async <T>() => ({
      enabled: true,
      status: "success",
      paid: true,
      supported: true,
      url: "https://api.aisa.one/apis/v2/tavily/search",
      amountUsdc: "0.009600",
      maxPaymentUsdc: "0.01",
      dailySpendUsdc: "0.000000",
      dailyBudgetUsdc: "0.10",
      paymentNetwork: "eip155:8453",
      selectedChain: "base",
      paymentRef: "0xtavily",
      txHash: "0xtavily",
      data: {
        results: [
          { title: "Match Outlook", url: "https://espn.com/match", content: "Injury updates on key players." }
        ],
        answer: "The match will likely favor the home team."
      } as T,
    }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.provider, "aisa_x402_tavily");
  assert.equal(result.evidence.length, 2); // Summary + 1 result
  assert.equal(result.evidence[0]?.title, "Tavily AI Match Summary Brief");
  assert.equal(result.evidence[0]?.excerpt, "The match will likely favor the home team.");
  assert.equal(result.evidence[1]?.title, "Match Outlook");
  assert.equal(result.evidence[1]?.excerpt, "Injury updates on key players.");
  assert.equal(result.evidence[1]?.sourceUrl, "https://espn.com/match");
});

test("tavily x402 payment failure handles error states correctly", async () => {
  const result = await fetchTavilyX402SearchEvidence({
    market,
    payResource: async () => ({
      enabled: true,
      status: "insufficient_balance",
      paid: false,
      supported: true,
      url: "https://api.aisa.one/apis/v2/tavily/search",
      maxPaymentUsdc: "0.01",
      dailySpendUsdc: "0.000000",
      dailyBudgetUsdc: "0.10",
      failureReason: "insufficient_balance",
      error: "Gateway wallet has insufficient balance.",
    }),
  });

  assert.equal(result.status, "insufficient_balance");
  assert.equal(result.provider, "aisa_x402_tavily");
  assert.equal(result.evidence.length, 0);
});

