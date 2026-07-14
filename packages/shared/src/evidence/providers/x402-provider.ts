import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createGatewayMiddleware, type PaymentRequest, type PaymentResponse } from "@circle-fin/x402-batching/server";
import type { EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "../../types";
import { optionalEnv } from "../../env";
import { inferSportsEvidenceTagsFromText } from "../sports-tags";
import { gatewayRuntimeConfig, payX402Resource, supportsX402Resource, type GatewaySupportCheck, type PayX402ResourceResult } from "../../circle/gateway-client";

export function cleanSearchQuery(title: string): string {
  let q = title.replace(/\?$/, "").trim();
  q = q.replace(/^will\s+/i, "");
  q = q.replace(/^spread:\s*/i, "");
  q = q.replace(/^exact score:\s*/i, "");
  q = q.replace(/^double chance:\s*/i, "");
  q = q.replace(/\s+on\s+\d{4}-\d{2}-\d{2}/gi, "");
  q = q.replace(/\s+\d{4}-\d{2}-\d{2}/gi, "");
  q = q.replace(/\s+end in a draw/i, " draw");
  q = q.replace(/\s+win/i, "");
  return `${q.trim()} football news`;
}


const AISA_TWITTER_SEARCH_ENDPOINT = "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search";
const STABLE_ENRICH_REDDIT_SEARCH_ENDPOINT = "https://stableenrich.dev/api/reddit/search";
const AISA_TAVILY_SEARCH_ENDPOINT = "https://api.aisa.one/apis/v2/tavily/search";
const INTERNAL_GATEWAY_EVIDENCE_PRICE_USDC = "0.001";

function aisaTwitterSearchEndpoint() {
  return optionalEnv("AISA_X402_TWITTER_SEARCH_ENDPOINT", AISA_TWITTER_SEARCH_ENDPOINT);
}

function aisaTavilySearchEndpoint() {
  return optionalEnv("AISA_X402_TAVILY_SEARCH_ENDPOINT", AISA_TAVILY_SEARCH_ENDPOINT);
}

function stableEnrichRedditSearchEndpoint() {
  return optionalEnv("STABLE_ENRICH_X402_REDDIT_SEARCH_ENDPOINT", STABLE_ENRICH_REDDIT_SEARCH_ENDPOINT);
}

function x402FallbackProvidersEnabled() {
  return optionalEnv("ENABLE_X402_FALLBACK_PROVIDERS", "true").toLowerCase() !== "false";
}

function internalGatewayEvidenceEnabled() {
  return optionalEnv("ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE", "true").toLowerCase() !== "false";
}

function externalX402FallbackEnabled() {
  return optionalEnv("ENABLE_EXTERNAL_X402_FALLBACK_PROVIDERS", "false").toLowerCase() === "true";
}

export type X402EvidenceProviderStatus = "disabled" | "unsupported" | "blocked" | "insufficient_balance" | "success" | "failed";

export type X402EvidenceProviderResult = {
  enabled: boolean;
  provider: string;
  status: X402EvidenceProviderStatus;
  url?: string | undefined;
  evidence: EvidenceItemInput[];
  paymentAmountUsdc?: string | undefined;
  paymentNetwork?: string | undefined;
  selectedChain?: string | undefined;
  supportChecks?: GatewaySupportCheck[] | undefined;
  failureReason?: string | undefined;
  paymentRef?: string | undefined;
  txHash?: string | undefined;
  error?: string | undefined;
};

function nowIso() {
  return new Date().toISOString();
}

function sportsEvidenceTagsForText(text: string) {
  return inferSportsEvidenceTagsFromText(text);
}

function buildAisaSearchUrl(query: string) {
  const url = new URL(aisaTwitterSearchEndpoint());
  url.searchParams.set("query", query);
  url.searchParams.set("queryType", "Top");
  return url.toString();
}

function buildStableEnrichRequest(query: string) {
  return {
    url: stableEnrichRedditSearchEndpoint(),
    method: "POST" as const,
    body: {
      query,
      sort: "relevance",
      timeframe: "week",
      maxResults: 5,
    },
    headers: { "Content-Type": "application/json" },
  };
}

type TweetLike = {
  text?: string;
  url?: string;
  author?: { userName?: string; username?: string; name?: string };
};

function extractTweets(data: unknown): TweetLike[] {
  const payload = data as { response?: { tweets?: unknown[] }; data?: { response?: { tweets?: unknown[] } }; tweets?: unknown[] };
  const tweets = payload.response?.tweets || payload.data?.response?.tweets || payload.tweets || [];
  return tweets.filter((item): item is TweetLike => Boolean(item && typeof item === "object"));
}

type RedditPostLike = {
  title?: string;
  selftext?: string;
  text?: string;
  url?: string;
  permalink?: string;
  subreddit?: string;
  author?: string | { name?: string; username?: string };
};

function extractRedditPosts(data: unknown): RedditPostLike[] {
  const payload = data as {
    data?: unknown[] | { posts?: unknown[]; results?: unknown[]; items?: unknown[] };
    posts?: unknown[];
    results?: unknown[];
    items?: unknown[];
  };
  const nested = payload.data && !Array.isArray(payload.data) ? payload.data : undefined;
  const posts = (Array.isArray(payload.data) ? payload.data : undefined) || nested?.posts || nested?.results || nested?.items || payload.posts || payload.results || payload.items || [];
  return posts.filter((item): item is RedditPostLike => Boolean(item && typeof item === "object"));
}

function evidenceFromAisaTweets(input: {
  data: unknown;
  url: string;
  market: PolymarketMarket;
  payment: PayX402ResourceResult;
}): EvidenceItemInput[] {
  const fetchedAt = nowIso();
  return extractTweets(input.data)
    .slice(0, 5)
    .map((tweet, index) => {
      const user = tweet.author?.userName || tweet.author?.username || tweet.author?.name || "unknown";
      const excerpt = `${user}: ${tweet.text || ""}`.trim();
      return {
        evidenceId: `circle-x402-social-${index + 1}`,
        sourceType: "circle_x402_social" as const,
        provider: "aisa_x402_social",
        sourceUrl: tweet.url || input.url,
        title: `x402-paid AISA social signal ${index + 1}${user !== "unknown" ? ` by @${user}` : ""}`,
        excerpt,
        credibilityScore: 68,
        fetchedAt,
        capturedAt: fetchedAt,
        paid: true,
        paymentAmountUsdc: input.payment.amountUsdc,
        paymentNetwork: input.payment.paymentNetwork || input.payment.selectedChain,
        paymentRef: input.payment.paymentRef,
        txHash: input.payment.txHash,
        metadata: {
          provider: "aisa_x402_social",
          endpoint: aisaTwitterSearchEndpoint(),
          marketId: input.market.marketId,
          selectedChain: input.payment.selectedChain,
          supportChecks: input.payment.supportChecks,
          evidenceTags: sportsEvidenceTagsForText(`${tweet.text || ""} ${tweet.url || ""}`),
        },
      };
    })
    .filter((item) => item.excerpt.length > 0);
}

function evidenceFromInternalGateway(input: {
  data: unknown;
  url: string;
  market: PolymarketMarket;
  payment: PayX402ResourceResult;
}): EvidenceItemInput[] {
  const fetchedAt = nowIso();
  const payload = input.data as { signals?: Array<{ title?: string; excerpt?: string; sourceUrl?: string }> };
  const signals = payload.signals || [];
  return signals
    .slice(0, 5)
    .map((signal, index) => ({
      evidenceId: `circle-x402-gateway-${index + 1}`,
      sourceType: "circle_x402_social" as const,
      provider: "precall_gateway_x402_evidence",
      sourceUrl: signal.sourceUrl || input.market.url || input.url,
      title: signal.title || `Circle Gateway paid evidence ${index + 1}`,
      excerpt: signal.excerpt || `Paid Gateway evidence packet for ${input.market.title}.`,
      credibilityScore: 64,
      fetchedAt,
      capturedAt: fetchedAt,
      paid: true,
      paymentAmountUsdc: input.payment.amountUsdc,
      paymentNetwork: input.payment.paymentNetwork || input.payment.selectedChain,
      paymentRef: input.payment.paymentRef,
      txHash: input.payment.txHash,
      metadata: {
        provider: "precall_gateway_x402_evidence",
        endpoint: input.url,
        marketId: input.market.marketId,
        selectedChain: input.payment.selectedChain,
        supportChecks: input.payment.supportChecks,
        circleGatewayBatched: true,
        internalGatewayOnly: true,
        analysisEvidence: false,
        evidenceTags: ["market_odds"],
      },
    }))
    .filter((item) => item.excerpt.length > 0);
}

function attachJsonHelpers(res: ServerResponse) {
  const response = res as PaymentResponse;
  response.status = (code: number) => {
    res.statusCode = code;
    return response;
  };
  response.json = (data: unknown) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  return response;
}

async function paidEvidencePayload(input: { market: PolymarketMarket; query: string }) {
  const priceSummary = input.market.outcomePrices
    .map((price, index) => `${input.market.outcomes[index] || `Outcome ${index + 1}`}: ${Math.round(Number(price || 0) * 100)}%`)
    .join(", ");

  return {
    provider: "precall_gateway_x402_evidence",
    signals: [
      {
        title: `Gateway-paid market packet for ${input.market.title}`,
        excerpt: `Circle Gateway/x402 paid market packet. Query: ${input.query}. Polymarket prices: ${priceSummary || "unavailable"}. Liquidity: $${Math.round(input.market.liquidityUsd || 0).toLocaleString()}. Volume 24h: $${Math.round(input.market.volume24hUsd || 0).toLocaleString()}. This packet proves paid retrieval but is not independent match intelligence.`,
        sourceUrl: input.market.url,
      },
    ],
  };
}

async function withInternalGatewayEvidenceServer<T>(input: { market: PolymarketMarket; query: string; run: (url: string) => Promise<T> }) {
  const gatewayConfig = gatewayRuntimeConfig();
  const sellerAddress = optionalEnv("CIRCLE_X402_SELLER_ADDRESS", optionalEnv("AGENT_OWNER_WALLET", ""));
  if (!sellerAddress) throw new Error("CIRCLE_X402_SELLER_ADDRESS or AGENT_OWNER_WALLET is required for internal Gateway/x402 evidence.");
  const gateway = createGatewayMiddleware({
    sellerAddress,
    networks: gatewayConfig.acceptedNetworks,
    facilitatorUrl: gatewayConfig.facilitatorUrl,
    description: "Precall paid evidence packet",
  });
  const price = `$${optionalEnv("INTERNAL_GATEWAY_X402_EVIDENCE_PRICE_USDC", INTERNAL_GATEWAY_EVIDENCE_PRICE_USDC)}`;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    attachJsonHelpers(res);
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname !== "/evidence") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const middleware = gateway.require(price);
    void middleware(req as PaymentRequest, res as PaymentResponse, async (error?: unknown) => {
      if (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        return;
      }
      try {
        const payload = await paidEvidencePayload({ market: input.market, query: requestUrl.searchParams.get("query") || input.query });
        (res as PaymentResponse).json?.(payload);
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
  });


  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/evidence?query=${encodeURIComponent(input.query)}`;
    return await input.run(url);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function fetchInternalGatewayEvidence(input: {
  market: PolymarketMarket;
  query: string;
  dailySpendUsdc?: string | number | undefined;
  payResource: typeof payX402Resource;
}): Promise<X402EvidenceProviderResult> {
  try {
    return await withInternalGatewayEvidenceServer({
      market: input.market,
      query: input.query,
      run: async (url) => {
        const paymentInput: Parameters<typeof payX402Resource>[0] = {
          url,
          config: { ...gatewayRuntimeConfig(), allowedHosts: ["127.0.0.1", "localhost"] },
        };
        if (input.dailySpendUsdc !== undefined) paymentInput.dailySpendUsdc = input.dailySpendUsdc;
        const payment = await input.payResource(paymentInput);
        if (payment.status !== "success" || !payment.paid) {
          return {
            enabled: payment.enabled,
            provider: "precall_gateway_x402_evidence",
            status: payment.status,
            url,
            evidence: [],
            paymentAmountUsdc: payment.amountUsdc,
            paymentNetwork: payment.paymentNetwork,
            selectedChain: payment.selectedChain,
            supportChecks: payment.supportChecks,
            failureReason: payment.failureReason,
            paymentRef: payment.paymentRef,
            txHash: payment.txHash,
            error: payment.error,
          };
        }
        return {
          enabled: true,
          provider: "precall_gateway_x402_evidence",
          status: "success",
          url,
          evidence: evidenceFromInternalGateway({ data: payment.data, url, market: input.market, payment }),
          paymentAmountUsdc: payment.amountUsdc,
          paymentNetwork: payment.paymentNetwork,
          selectedChain: payment.selectedChain,
          supportChecks: payment.supportChecks,
          failureReason: payment.failureReason,
          paymentRef: payment.paymentRef,
          txHash: payment.txHash,
        };
      },
    });
  } catch (error) {
    return {
      enabled: true,
      provider: "precall_gateway_x402_evidence",
      status: "failed",
      evidence: [],
      failureReason: "provider_unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function evidenceFromStableEnrichReddit(input: {
  data: unknown;
  url: string;
  market: PolymarketMarket;
  payment: PayX402ResourceResult;
}): EvidenceItemInput[] {
  const fetchedAt = nowIso();
  return extractRedditPosts(input.data)
    .slice(0, 5)
    .map((post, index) => {
      const author = typeof post.author === "string" ? post.author : post.author?.name || post.author?.username || "unknown";
      const sourceUrl = post.permalink?.startsWith("http") ? post.permalink : post.permalink ? `https://reddit.com${post.permalink}` : post.url || input.url;
      const excerpt = [post.title, post.selftext || post.text].filter(Boolean).join(" - ").slice(0, 500);
      return {
        evidenceId: `circle-x402-reddit-${index + 1}`,
        sourceType: "circle_x402_social" as const,
        provider: "stableenrich_x402_reddit",
        sourceUrl,
        title: `x402-paid Reddit signal ${index + 1}${post.subreddit ? ` from r/${post.subreddit}` : ""}`,
        excerpt: `${author}: ${excerpt}`.trim(),
        credibilityScore: 62,
        fetchedAt,
        capturedAt: fetchedAt,
        paid: true,
        paymentAmountUsdc: input.payment.amountUsdc,
        paymentNetwork: input.payment.paymentNetwork || input.payment.selectedChain,
        paymentRef: input.payment.paymentRef,
        txHash: input.payment.txHash,
        metadata: {
          provider: "stableenrich_x402_reddit",
          endpoint: stableEnrichRedditSearchEndpoint(),
          marketId: input.market.marketId,
          selectedChain: input.payment.selectedChain,
          supportChecks: input.payment.supportChecks,
          evidenceTags: sportsEvidenceTagsForText(`${post.title || ""} ${post.selftext || post.text || ""}`),
        },
      };
    })
    .filter((item) => item.excerpt.length > 0);
}

function shouldUseGatewayFallback(payment: PayX402ResourceResult) {
  if (payment.status === "blocked" || payment.status === "insufficient_balance") return false;
  return payment.status === "unsupported" ||
    payment.failureReason === "unsupported_network" ||
    payment.failureReason === "provider_unavailable" ||
    /HTTP 5\d\d|HTTP 403|Cloudflare|Just a moment|noindex,nofollow|Bad Gateway|error code: 502|No network\/scheme registered|no Gateway batching|unsupported_network/i.test(payment.error || "");
}

async function fetchStableEnrichRedditEvidence(input: {
  market: PolymarketMarket;
  query: string;
  dailySpendUsdc?: string | number | undefined;
  payResource: typeof payX402Resource;
}): Promise<X402EvidenceProviderResult> {
  const request = buildStableEnrichRequest(input.query);
  const paymentInput: Parameters<typeof payX402Resource>[0] = {
    url: request.url,
    method: request.method,
    body: request.body,
    headers: request.headers,
  };
  if (input.dailySpendUsdc !== undefined) paymentInput.dailySpendUsdc = input.dailySpendUsdc;
  const payment = await input.payResource(paymentInput);

  if (payment.status !== "success" || !payment.paid) {
    return {
      enabled: payment.enabled,
      provider: "stableenrich_x402_reddit",
      status: payment.status,
      url: request.url,
      evidence: [],
      paymentAmountUsdc: payment.amountUsdc,
      paymentNetwork: payment.paymentNetwork,
      selectedChain: payment.selectedChain,
      supportChecks: payment.supportChecks,
      failureReason: payment.failureReason,
      paymentRef: payment.paymentRef,
      txHash: payment.txHash,
      error: payment.error,
    };
  }

  return {
    enabled: true,
    provider: "stableenrich_x402_reddit",
    status: "success",
    url: request.url,
    evidence: evidenceFromStableEnrichReddit({ data: payment.data, url: request.url, market: input.market, payment }),
    paymentAmountUsdc: payment.amountUsdc,
    paymentNetwork: payment.paymentNetwork,
    selectedChain: payment.selectedChain,
    supportChecks: payment.supportChecks,
    failureReason: payment.failureReason,
    paymentRef: payment.paymentRef,
    txHash: payment.txHash,
  };
}

export async function fetchAisaX402SocialEvidence(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  query?: string;
  dailySpendUsdc?: string | number | undefined;
  payResource?: typeof payX402Resource | undefined;
}): Promise<X402EvidenceProviderResult> {
  const query = cleanSearchQuery(input.query || input.market.title);
  const url = buildAisaSearchUrl(query);
  const payResource = input.payResource || payX402Resource;
  const paymentInput: Parameters<typeof payX402Resource>[0] = { url };
  if (input.dailySpendUsdc !== undefined) paymentInput.dailySpendUsdc = input.dailySpendUsdc;
  const payment = await payResource<{ response?: { tweets?: unknown[] }; tweets?: unknown[] }>(paymentInput);

  if (payment.status !== "success" || !payment.paid) {
    if (x402FallbackProvidersEnabled() && shouldUseGatewayFallback(payment)) {
      if (internalGatewayEvidenceEnabled()) {
        const gatewayFallback = await fetchInternalGatewayEvidence({
          market: input.market,
          query,
          dailySpendUsdc: input.dailySpendUsdc,
          payResource,
        });
        if (gatewayFallback.status === "success" && gatewayFallback.evidence.length > 0) {
          gatewayFallback.supportChecks = [...(payment.supportChecks || []), ...(gatewayFallback.supportChecks || [])];
          return gatewayFallback;
        }
      }

      if (externalX402FallbackEnabled()) {
        const fallback = await fetchStableEnrichRedditEvidence({
          market: input.market,
          query,
          dailySpendUsdc: input.dailySpendUsdc,
          payResource,
        });
        if (fallback.status === "success" && fallback.evidence.length > 0) {
          fallback.supportChecks = [...(payment.supportChecks || []), ...(fallback.supportChecks || [])];
          return fallback;
        }
      }
    }

    return {
      enabled: payment.enabled,
      provider: "aisa_x402_social",
      status: payment.status,
      url,
      evidence: [],
      paymentAmountUsdc: payment.amountUsdc,
      paymentNetwork: payment.paymentNetwork,
      selectedChain: payment.selectedChain,
      supportChecks: payment.supportChecks,
      failureReason: payment.failureReason,
      paymentRef: payment.paymentRef,
      txHash: payment.txHash,
      error: payment.error,
    };
  }

  return {
    enabled: true,
    provider: "aisa_x402_social",
    status: "success",
    url,
    evidence: evidenceFromAisaTweets({ data: payment.data, url, market: input.market, payment }),
    paymentAmountUsdc: payment.amountUsdc,
    paymentNetwork: payment.paymentNetwork,
    selectedChain: payment.selectedChain,
    supportChecks: payment.supportChecks,
    failureReason: payment.failureReason,
    paymentRef: payment.paymentRef,
    txHash: payment.txHash,
  };
}

export async function supportsAisaX402SocialEvidence(query: string) {
  return supportsX402Resource(buildAisaSearchUrl(query));
}

function buildAisaTavilyRequest(query: string) {
  return {
    url: aisaTavilySearchEndpoint(),
    method: "POST" as const,
    body: {
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 5,
    },
    headers: { "Content-Type": "application/json" },
  };
}

function evidenceFromTavily(input: {
  data: any;
  url: string;
  market: PolymarketMarket;
  payment: PayX402ResourceResult;
}): EvidenceItemInput[] {
  const fetchedAt = nowIso();
  const results = (input.data as { results?: { title?: string; url?: string; content?: string }[] })?.results || [];

  const items: EvidenceItemInput[] = results.map((res, index) => ({
    evidenceId: `circle-x402-tavily-${index + 1}`,
    sourceType: "circle_x402_news" as const,
    provider: "aisa_x402_tavily",
    sourceUrl: res.url || input.url,
    title: res.title || `x402 Tavily Search Result ${index + 1}`,
    excerpt: (res.content || "").slice(0, 800),
    credibilityScore: 85,
    fetchedAt,
    capturedAt: fetchedAt,
    paid: true,
    paymentAmountUsdc: input.payment.amountUsdc,
    paymentNetwork: input.payment.paymentNetwork || input.payment.selectedChain,
    paymentRef: input.payment.paymentRef,
    txHash: input.payment.txHash,
    metadata: {
      provider: "aisa_x402_tavily",
      endpoint: aisaTavilySearchEndpoint(),
      marketId: input.market.marketId,
      selectedChain: input.payment.selectedChain,
      evidenceTags: sportsEvidenceTagsForText(`${res.title || ""} ${res.content || ""}`),
    },
  }));

  return items.filter((item) => item.excerpt.length > 0 && item.sourceUrl !== input.market.url);
}

export async function fetchTavilyX402SearchEvidence(input: {
  market: PolymarketMarket;
  query?: string;
  dailySpendUsdc?: string | number | undefined;
  payResource?: typeof payX402Resource | undefined;
}): Promise<X402EvidenceProviderResult> {
  const query = cleanSearchQuery(input.query || input.market.title);
  const request = buildAisaTavilyRequest(query);
  const payResource = input.payResource || payX402Resource;
  const paymentInput: Parameters<typeof payX402Resource>[0] = {
    url: request.url,
    method: request.method,
    body: request.body,
    headers: request.headers,
  };
  if (input.dailySpendUsdc !== undefined) paymentInput.dailySpendUsdc = input.dailySpendUsdc;
  const payment = await payResource<any>(paymentInput);

  if (payment.status !== "success" || !payment.paid) {
    return {
      enabled: payment.enabled,
      provider: "aisa_x402_tavily",
      status: payment.status,
      url: request.url,
      evidence: [],
      paymentAmountUsdc: payment.amountUsdc,
      paymentNetwork: payment.paymentNetwork,
      selectedChain: payment.selectedChain,
      supportChecks: payment.supportChecks,
      failureReason: payment.failureReason,
      paymentRef: payment.paymentRef,
      txHash: payment.txHash,
      error: payment.error,
    };
  }

  return {
    enabled: true,
    provider: "aisa_x402_tavily",
    status: "success",
    url: request.url,
    evidence: evidenceFromTavily({ data: payment.data, url: request.url, market: input.market, payment }),
    paymentAmountUsdc: payment.amountUsdc,
    paymentNetwork: payment.paymentNetwork,
    selectedChain: payment.selectedChain,
    supportChecks: payment.supportChecks,
    failureReason: payment.failureReason,
    paymentRef: payment.paymentRef,
    txHash: payment.txHash,
  };
}

export async function supportsTavilyX402SearchEvidence(query: string) {
  return supportsX402Resource(aisaTavilySearchEndpoint());
}

export { AISA_TWITTER_SEARCH_ENDPOINT, STABLE_ENRICH_REDDIT_SEARCH_ENDPOINT, AISA_TAVILY_SEARCH_ENDPOINT };
