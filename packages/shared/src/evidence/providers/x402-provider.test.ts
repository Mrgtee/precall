import test from "node:test";
import assert from "node:assert/strict";
import { externalX402EvidenceRuntimeConfig, fetchAisaX402SocialEvidence, fetchFirecrawlX402SearchEvidence, fetchParallelX402SearchEvidence, fetchTavilyX402SearchEvidence } from "./x402-provider";
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


test("provider 502 falls back to internal Circle Gateway paid evidence when enabled", async () => {
  const previousSeller = process.env.CIRCLE_X402_SELLER_ADDRESS;
  const previousInternal = process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  process.env.CIRCLE_X402_SELLER_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE = "true";
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
  if (previousInternal === undefined) delete process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  else process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE = previousInternal;

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


test("provider Cloudflare 403 falls back to internal Circle Gateway paid evidence when enabled", async () => {
  const previousSeller = process.env.CIRCLE_X402_SELLER_ADDRESS;
  const previousInternal = process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  process.env.CIRCLE_X402_SELLER_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE = "true";
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
  if (previousInternal === undefined) delete process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  else process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE = previousInternal;

  assert.equal(result.provider, "precall_gateway_x402_evidence");
  assert.equal(result.paymentAmountUsdc, "0.001000");
  assert.equal(result.evidence[0]?.paymentRef, "0xgateway403");
  assert.match(result.evidence[0]?.excerpt || "", /provider challenge/i);
});

test("provider timeout falls back to internal Circle Gateway paid evidence when enabled", async () => {
  const previousSeller = process.env.CIRCLE_X402_SELLER_ADDRESS;
  const previousInternal = process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  process.env.CIRCLE_X402_SELLER_ADDRESS = "0x0000000000000000000000000000000000000001";
  process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE = "true";
  let calls = 0;
  const result = await fetchAisaX402SocialEvidence({
    market,
    snapshot,
    payResource: async <T>() => {
      calls += 1;
      if (calls === 1) {
        return {
          enabled: true,
          status: "failed" as const,
          paid: false,
          supported: false,
          url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
          maxPaymentUsdc: "0.03",
          dailySpendUsdc: "0.000000",
          dailyBudgetUsdc: "0.10",
          failureReason: "provider_timeout",
          error: "x402 provider request terminated before evidence was returned.",
        };
      }
      return {
        enabled: true,
        status: "success" as const,
        paid: true,
        supported: true,
        url: "http://127.0.0.1:3100/evidence",
        amountUsdc: "0.001000",
        maxPaymentUsdc: "0.03",
        dailySpendUsdc: "0.000000",
        dailyBudgetUsdc: "0.10",
        paymentNetwork: "eip155:8453",
        selectedChain: "base",
        paymentRef: "0xtimeoutfallback",
        txHash: "0xtimeoutfallback",
        data: { signals: [{ title: "Gateway-paid packet", excerpt: "Circle Gateway evidence handled provider timeout.", sourceUrl: market.url }] } as T,
      };
    },
  });

  if (previousSeller === undefined) delete process.env.CIRCLE_X402_SELLER_ADDRESS;
  else process.env.CIRCLE_X402_SELLER_ADDRESS = previousSeller;

  assert.equal(calls, 2);
  assert.equal(result.status, "success");
  if (previousInternal === undefined) delete process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  else process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE = previousInternal;

  assert.equal(result.provider, "precall_gateway_x402_evidence");
  assert.equal(result.evidence[0]?.paymentRef, "0xtimeoutfallback");
  assert.match(result.evidence[0]?.excerpt || "", /provider timeout/i);
});

test("internal Gateway fallback is disabled by default", async () => {
  const previous = process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  delete process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
  try {
    let calls = 0;
    const result = await fetchAisaX402SocialEvidence({
      market,
      snapshot,
      payResource: async () => {
        calls += 1;
        return {
          enabled: true,
          status: "failed" as const,
          paid: false,
          supported: false,
          url: "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search",
          maxPaymentUsdc: "0.03",
          dailySpendUsdc: "0.000000",
          dailyBudgetUsdc: "0.10",
          failureReason: "provider_timeout",
          error: "x402 provider request terminated before evidence was returned.",
        };
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.provider, "aisa_x402_social");
    assert.equal(result.evidence.length, 0);
  } finally {
    if (previous === undefined) delete process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE;
    else process.env.ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE = previous;
  }
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

test("parallel x402 payment parses source-backed search results", async () => {
  let capturedInput: any;
  const eventQuery = "France vs England match date 2026-07-18 latest confirmed team news injuries lineups";
  const result = await fetchParallelX402SearchEvidence({
    market,
    query: eventQuery,
    payResource: async <T>(input: any) => {
      capturedInput = input;
      return {
      enabled: true,
      status: "success",
      paid: true,
      supported: true,
      url: "https://parallelmpp.dev/api/search",
      amountUsdc: "0.010000",
      maxPaymentUsdc: "0.03",
      dailySpendUsdc: "0.000000",
      dailyBudgetUsdc: "0.10",
      paymentNetwork: "eip155:8453",
      paymentScheme: "standard-exact",
      selectedChain: "base",
      paymentRef: "0xparallel",
      txHash: "0xparallel",
      data: {
        results: [
          { title: "Confirmed lineup news", url: "https://example.com/lineups", excerpts: ["Lineup update and injury context before kickoff."], publish_date: "2026-07-15" }
        ],
        search_id: "search-1"
      } as T,
    };
    },
  });

  assert.equal(capturedInput?.body?.query, eventQuery);
  assert.equal(result.status, "success");
  assert.equal(result.provider, "parallel_x402_search");
  assert.equal(result.paymentAmountUsdc, "0.010000");
  assert.equal(result.paymentScheme, "standard-exact");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.sourceType, "circle_x402_news");
  assert.equal(result.evidence[0]?.provider, "parallel_x402_search");
  assert.equal(result.evidence[0]?.sourceUrl, "https://example.com/lineups");
  assert.equal(result.evidence[0]?.excerpt, "Lineup update and injury context before kickoff.");
  assert.deepEqual(result.evidence[0]?.metadata?.evidenceTags, ["injury_lineup", "fixture_context", "tactical_news"]);
  assert.equal(result.evidence[0]?.metadata?.sourcePublishedAt, "2026-07-15");
  assert.equal(result.evidence[0]?.metadata?.paymentScheme, "standard-exact");
});

test("tavily x402 payment parses source-backed search results only", async () => {
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
          { title: "Match Outlook", url: "https://espn.com/match", content: "Injury updates on key players.", publishedDate: "2026-07-15T12:00:00Z" }
        ],
        answer: "The match will likely favor the home team."
      } as T,
    }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.provider, "aisa_x402_tavily");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.title, "Match Outlook");
  assert.equal(result.evidence[0]?.excerpt, "Injury updates on key players.");
  assert.equal(result.evidence[0]?.sourceUrl, "https://espn.com/match");
  assert.deepEqual(result.evidence[0]?.metadata?.evidenceTags, ["injury_lineup"]);
  assert.equal(result.evidence[0]?.metadata?.sourcePublishedAt, "2026-07-15T12:00:00Z");
});

test("firecrawl x402 payment parses source-backed web evidence", async () => {
  const result = await fetchFirecrawlX402SearchEvidence({
    market,
    payResource: async <T>() => ({
      enabled: true,
      status: "success",
      paid: true,
      supported: true,
      url: "https://stableenrich.dev/api/firecrawl/search",
      amountUsdc: "0.025200",
      maxPaymentUsdc: "0.03",
      dailySpendUsdc: "0.000000",
      dailyBudgetUsdc: "0.10",
      paymentNetwork: "eip155:8453",
      selectedChain: "base",
      paymentRef: "0xfirecrawl",
      txHash: "0xfirecrawl",
      data: {
        results: [
          { title: "Official team news", url: "https://www.thefa.com/news/team-news", description: "Lineup and injury update before the match.", publishedDate: "2026-07-15T14:00:00Z" }
        ]
      } as T,
    }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.provider, "stableenrich_x402_firecrawl");
  assert.equal(result.paymentAmountUsdc, "0.025200");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.sourceType, "circle_x402_news");
  assert.equal(result.evidence[0]?.provider, "stableenrich_x402_firecrawl");
  assert.equal(result.evidence[0]?.sourceUrl, "https://www.thefa.com/news/team-news");
  assert.deepEqual(result.evidence[0]?.metadata?.evidenceTags, ["injury_lineup", "tactical_news"]);
  assert.equal(result.evidence[0]?.metadata?.sourcePublishedAt, "2026-07-15T14:00:00Z");
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



test("Parallel, AISA, Tavily, and Firecrawl x402 providers send external evidence payments through Base config", async () => {
  const keys = [
    "CIRCLE_X402_EVIDENCE_CHAIN",
    "CIRCLE_X402_EVIDENCE_ACCEPTED_NETWORKS",
    "CIRCLE_X402_EVIDENCE_FACILITATOR_URL",
    "CIRCLE_X402_EVIDENCE_MAX_PAYMENT_USDC",
    "CIRCLE_X402_EVIDENCE_DAILY_BUDGET_USDC",
    "CIRCLE_X402_EVIDENCE_ALLOWED_HOSTS",
    "CIRCLE_X402_EVIDENCE_MIN_GATEWAY_BALANCE_USDC",
    "CIRCLE_X402_EVIDENCE_REQUEST_TIMEOUT_MS",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.CIRCLE_X402_EVIDENCE_CHAIN = "base";
  process.env.CIRCLE_X402_EVIDENCE_ACCEPTED_NETWORKS = "eip155:8453";
  process.env.CIRCLE_X402_EVIDENCE_FACILITATOR_URL = "https://gateway-api.circle.com";
  process.env.CIRCLE_X402_EVIDENCE_MAX_PAYMENT_USDC = "0.01";
  process.env.CIRCLE_X402_EVIDENCE_DAILY_BUDGET_USDC = "0.10";
  process.env.CIRCLE_X402_EVIDENCE_ALLOWED_HOSTS = "api.aisa.one,parallelmpp.dev,stableenrich.dev";
  process.env.CIRCLE_X402_EVIDENCE_MIN_GATEWAY_BALANCE_USDC = "0.02";
  process.env.CIRCLE_X402_EVIDENCE_REQUEST_TIMEOUT_MS = "123456";

  try {
    const configs: unknown[] = [];
    const inputs: any[] = [];
    const payResource = async <T>(input: any) => {
      inputs.push(input);
      configs.push(input.config);
      const isParallel = String(input.url).includes("parallelmpp.dev");
      const isTavily = String(input.url).includes("/tavily/");
      const isFirecrawl = String(input.url).includes("/firecrawl/");
      return {
        enabled: true,
        status: "success" as const,
        paid: true,
        supported: true,
        url: input.url,
        amountUsdc: "0.005000",
        maxPaymentUsdc: "0.01",
        dailySpendUsdc: "0.000000",
        dailyBudgetUsdc: "0.10",
        paymentNetwork: "eip155:8453",
        selectedChain: "base",
        paymentRef: isFirecrawl ? "0xfirecrawl-base" : isTavily ? "0xtavily-base" : isParallel ? "0xparallel-base" : "0xaisa-base",
        txHash: isFirecrawl ? "0xfirecrawl-base" : isTavily ? "0xtavily-base" : isParallel ? "0xparallel-base" : "0xaisa-base",
        data: (isFirecrawl
          ? { results: [{ title: "Team news crawl", url: "https://example.com/crawl", snippet: "Lineup and injury update from crawled source.", publishedDate: "2026-07-15T15:00:00Z" }] }
          : isTavily
            ? { results: [{ title: "Team news", url: "https://example.com/news", content: "Lineup and injury update." }] }
            : isParallel
              ? { results: [{ title: "Team news search", url: "https://example.com/parallel", excerpts: ["Lineup and injury update from search."], publish_date: "2026-07-15" }] }
              : { response: { tweets: [{ text: "Team news signal", url: "https://x.com/a/status/2", author: { userName: "reporter" } }] } }) as T,
      };
    };

    const social = await fetchAisaX402SocialEvidence({ market, snapshot, payResource });
    const parallel = await fetchParallelX402SearchEvidence({ market, payResource });
    const tavily = await fetchTavilyX402SearchEvidence({ market, payResource });
    const firecrawl = await fetchFirecrawlX402SearchEvidence({ market, payResource });
    const runtime = externalX402EvidenceRuntimeConfig();

    assert.equal(social.status, "success");
    assert.equal(parallel.status, "success");
    assert.equal(tavily.status, "success");
    assert.equal(firecrawl.status, "success");
    assert.equal(configs.length, 4);
    const socialInput = inputs.find((input) => String(input.url).includes("twitter/tweet/advanced_search"));
    const parallelInput = inputs.find((input) => String(input.url).includes("parallelmpp.dev"));
    const tavilyInput = inputs.find((input) => String(input.url).includes("/tavily/"));
    assert.match(String(socialInput?.url || ""), /queryType=Latest/);
    assert.equal(parallelInput?.body?.mode, "fast");
    assert.equal(tavilyInput?.body?.topic, "news");
    assert.equal(tavilyInput?.body?.time_range, "week");
    assert.equal(tavilyInput?.body?.search_depth, "ultra-fast");
    assert.equal(tavilyInput?.body?.include_answer, false);
    for (const config of configs as any[]) {
      assert.equal(config.chain, "base");
      assert.deepEqual(config.chainCandidates, ["base"]);
      assert.deepEqual(config.acceptedNetworks, ["eip155:8453"]);
      assert.equal(config.facilitatorUrl, "https://gateway-api.circle.com");
      assert.equal(config.maxPaymentUsdc, "0.01");
      assert.equal(config.minGatewayBalanceUsdc, "0.02");
      assert.equal(config.requestTimeoutMs, 123456);
      assert.deepEqual(config.allowedHosts, ["api.aisa.one", "parallelmpp.dev", "stableenrich.dev"]);
    }
    assert.equal(runtime.chain, "base");
    assert.deepEqual(runtime.acceptedNetworks, ["eip155:8453"]);
    assert.equal(runtime.minGatewayBalanceUsdc, "0.02");
    assert.equal(runtime.requestTimeoutMs, 123456);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("external x402 evidence defaults do not inherit main seller payment limits", () => {
  const keys = [
    "CIRCLE_X402_EVIDENCE_CHAIN",
    "CIRCLE_X402_EVIDENCE_ACCEPTED_NETWORKS",
    "CIRCLE_X402_EVIDENCE_FACILITATOR_URL",
    "CIRCLE_X402_EVIDENCE_MAX_PAYMENT_USDC",
    "CIRCLE_X402_EVIDENCE_DAILY_BUDGET_USDC",
    "CIRCLE_X402_EVIDENCE_ALLOWED_HOSTS",
    "CIRCLE_X402_EVIDENCE_MIN_GATEWAY_BALANCE_USDC",
    "CIRCLE_X402_EVIDENCE_REQUEST_TIMEOUT_MS",
    "CIRCLE_X402_MAX_PAYMENT_USDC",
    "CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC",
    "CIRCLE_X402_REQUEST_TIMEOUT_MS",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.CIRCLE_X402_MAX_PAYMENT_USDC = "0.025";
  process.env.CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC = "0.25";
  process.env.CIRCLE_X402_REQUEST_TIMEOUT_MS = "30000";

  try {
    const runtime = externalX402EvidenceRuntimeConfig();

    assert.equal(runtime.chain, "base");
    assert.deepEqual(runtime.acceptedNetworks, ["eip155:8453"]);
    assert.equal(runtime.maxPaymentUsdc, "0.03");
    assert.equal(runtime.minGatewayBalanceUsdc, "0.05");
    assert.equal(runtime.requestTimeoutMs, 90_000);
    assert.deepEqual(runtime.allowedHosts, ["api.aisa.one", "parallelmpp.dev", "stableenrich.dev"]);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

