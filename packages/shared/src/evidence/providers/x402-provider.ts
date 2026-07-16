import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { SupportedChainName } from "@circle-fin/x402-batching/client";
import { createGatewayMiddleware, type PaymentRequest, type PaymentResponse } from "@circle-fin/x402-batching/server";
import type { EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "../../types";
import { optionalEnv } from "../../env";
import { inferSportsEvidenceTagsFromText } from "../sports-tags";
import { gatewayRuntimeConfig, payX402Resource, supportsX402Resource, type GatewayRuntimeConfig, type GatewaySupportCheck, type PayX402ResourceResult } from "../../circle/gateway-client";

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
  const currentYear = new Date().getUTCFullYear();
  return q.trim() + " latest team news injuries lineups form stats football " + currentYear;
}


const AISA_TWITTER_SEARCH_ENDPOINT = "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search";
const STABLE_ENRICH_REDDIT_SEARCH_ENDPOINT = "https://stableenrich.dev/api/reddit/search";
const STABLE_ENRICH_FIRECRAWL_SEARCH_ENDPOINT = "https://stableenrich.dev/api/firecrawl/search";
const PARALLEL_SEARCH_ENDPOINT = "https://parallelmpp.dev/api/search";
const AISA_TAVILY_SEARCH_ENDPOINT = "https://api.aisa.one/apis/v2/tavily/search";
const INTERNAL_GATEWAY_EVIDENCE_PRICE_USDC = "0.001";
const BASE_MAINNET_NETWORK = "eip155:8453";
const ARC_TESTNET_NETWORK = "eip155:5042002";
const MAINNET_FACILITATOR_URL = "https://gateway-api.circle.com";
const TESTNET_FACILITATOR_URL = "https://gateway-api-testnet.circle.com";

function aisaTwitterSearchEndpoint() {
  return optionalEnv("AISA_X402_TWITTER_SEARCH_ENDPOINT", AISA_TWITTER_SEARCH_ENDPOINT);
}

function aisaTavilySearchEndpoint() {
  return optionalEnv("AISA_X402_TAVILY_SEARCH_ENDPOINT", AISA_TAVILY_SEARCH_ENDPOINT);
}

function stableEnrichRedditSearchEndpoint() {
  return optionalEnv("STABLE_ENRICH_X402_REDDIT_SEARCH_ENDPOINT", STABLE_ENRICH_REDDIT_SEARCH_ENDPOINT);
}

function stableEnrichFirecrawlSearchEndpoint() {
  return optionalEnv("STABLE_ENRICH_X402_FIRECRAWL_SEARCH_ENDPOINT", STABLE_ENRICH_FIRECRAWL_SEARCH_ENDPOINT);
}

function parallelSearchEndpoint() {
  return optionalEnv("PARALLEL_X402_SEARCH_ENDPOINT", PARALLEL_SEARCH_ENDPOINT);
}

function x402FallbackProvidersEnabled() {
  return optionalEnv("ENABLE_X402_FALLBACK_PROVIDERS", "true").toLowerCase() !== "false";
}

function internalGatewayEvidenceEnabled() {
  return optionalEnv("ENABLE_INTERNAL_GATEWAY_X402_EVIDENCE", "false").toLowerCase() === "true";
}

function externalX402FallbackEnabled() {
  return optionalEnv("ENABLE_EXTERNAL_X402_FALLBACK_PROVIDERS", "false").toLowerCase() === "true";
}

function parseCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveIntegerEnv(name: string, fallback: number) {
  const explicit = process.env[name];
  const raw = explicit !== undefined && explicit.trim() !== "" ? explicit : String(fallback);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function defaultEvidenceAllowedHosts() {
  return [...new Set([...parseCsv(optionalEnv("CIRCLE_X402_ALLOWED_HOSTS", "api.aisa.one")), "api.aisa.one", "parallelmpp.dev", "stableenrich.dev"])].join(",");
}

function externalEvidenceChain(): SupportedChainName {
  const configured = optionalEnv("CIRCLE_X402_EVIDENCE_CHAIN", "base").trim();
  if (configured === "arcTestnet" || configured === "base" || configured === "baseSepolia") return configured;
  return "base";
}

function defaultEvidenceNetwork(chain: SupportedChainName) {
  if (chain === "arcTestnet") return ARC_TESTNET_NETWORK;
  return BASE_MAINNET_NETWORK;
}

function defaultEvidenceFacilitator(chain: SupportedChainName) {
  if (chain === "arcTestnet") return TESTNET_FACILITATOR_URL;
  return MAINNET_FACILITATOR_URL;
}

function externalX402EvidenceConfig(): Partial<GatewayRuntimeConfig> {
  const chain = externalEvidenceChain();
  return {
    chain,
    chainCandidates: [chain],
    acceptedNetworks: parseCsv(optionalEnv("CIRCLE_X402_EVIDENCE_ACCEPTED_NETWORKS", defaultEvidenceNetwork(chain))),
    facilitatorUrl: optionalEnv("CIRCLE_X402_EVIDENCE_FACILITATOR_URL", defaultEvidenceFacilitator(chain)),
    maxPaymentUsdc: optionalEnv("CIRCLE_X402_EVIDENCE_MAX_PAYMENT_USDC", "0.03"),
    dailyBudgetUsdc: optionalEnv("CIRCLE_X402_EVIDENCE_DAILY_BUDGET_USDC", optionalEnv("CIRCLE_X402_DAILY_BUDGET_USDC", "0.10")),
    allowedHosts: parseCsv(optionalEnv("CIRCLE_X402_EVIDENCE_ALLOWED_HOSTS", defaultEvidenceAllowedHosts())),
    minGatewayBalanceUsdc: optionalEnv("CIRCLE_X402_EVIDENCE_MIN_GATEWAY_BALANCE_USDC", "0.05"),
    requestTimeoutMs: positiveIntegerEnv("CIRCLE_X402_EVIDENCE_REQUEST_TIMEOUT_MS", 90_000),
  };
}

export function externalX402EvidenceRuntimeConfig() {
  return gatewayRuntimeConfig(externalX402EvidenceConfig());
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
  paymentScheme?: "gateway-batched" | "standard-exact" | undefined;
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
  url.searchParams.set("queryType", "Latest");
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
  createdAt?: string;
  created_at?: string;
  publishedAt?: string;
  published_at?: string;
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
  createdAt?: string;
  created_at?: string;
  created_utc?: string | number;
  publishedAt?: string;
  published_at?: string;
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
          sourceKind: "social",
          sourcePublishedAt: tweet.createdAt || tweet.created_at || tweet.publishedAt || tweet.published_at,
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
          sourceKind: "social",
          sourcePublishedAt: post.createdAt || post.created_at || post.publishedAt || post.published_at || (post.created_utc ? new Date(Number(post.created_utc) * 1000).toISOString() : undefined),
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
    payment.failureReason === "provider_timeout" ||
    /HTTP 5\d\d|HTTP 403|Cloudflare|Just a moment|noindex,nofollow|Bad Gateway|error code: 502|No network\/scheme registered|no Gateway batching|unsupported_network|terminated|AbortError|aborted|timeout|ETIMEDOUT|UND_ERR/i.test(payment.error || "");
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
    config: externalX402EvidenceConfig(),
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
  const paymentInput: Parameters<typeof payX402Resource>[0] = { url, config: externalX402EvidenceConfig() };
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
  return supportsX402Resource(buildAisaSearchUrl(query), { config: externalX402EvidenceConfig() });
}

function buildAisaTavilyRequest(query: string) {
  return {
    url: aisaTavilySearchEndpoint(),
    method: "POST" as const,
    body: {
      query,
      topic: "news",
      time_range: "week",
      search_depth: "ultra-fast",
      include_answer: false,
      max_results: 5,
    },
    headers: { "Content-Type": "application/json" },
  };
}

type TavilySearchResultLike = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  publishedDate?: string;
  published_date?: string;
  date?: string;
};

function evidenceFromTavily(input: {
  data: any;
  url: string;
  market: PolymarketMarket;
  payment: PayX402ResourceResult;
}): EvidenceItemInput[] {
  const fetchedAt = nowIso();
  const results = (input.data as { results?: TavilySearchResultLike[] })?.results || [];

  const items: EvidenceItemInput[] = results.map((res, index) => ({
    evidenceId: `circle-x402-tavily-${index + 1}`,
    sourceType: "circle_x402_news" as const,
    provider: "aisa_x402_tavily",
    sourceUrl: res.url || input.url,
    title: res.title || `x402 Tavily Search Result ${index + 1}`,
    excerpt: (res.content || res.raw_content || "").slice(0, 800),
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
      sourceKind: "web",
      sourcePublishedAt: res.publishedDate || res.published_date || res.date,
      evidenceTags: sportsEvidenceTagsForText(`${res.title || ""} ${res.content || res.raw_content || ""}`),
    },
  }));

  return items.filter((item) => item.excerpt.length > 0 && item.sourceUrl !== input.market.url);
}

function buildParallelSearchRequest(query: string) {
  return {
    url: parallelSearchEndpoint(),
    method: "POST" as const,
    body: {
      query,
      mode: "fast",
    },
    headers: { "Content-Type": "application/json" },
  };
}

type ParallelSearchResultLike = {
  title?: string;
  url?: string;
  excerpts?: string[];
  excerpt?: string;
  content?: string;
  publish_date?: string | null;
  publishedDate?: string;
  published_date?: string;
  date?: string;
};

function extractParallelResults(data: unknown): ParallelSearchResultLike[] {
  const payload = data as {
    data?: unknown[] | { results?: unknown[]; items?: unknown[] };
    results?: unknown[];
    items?: unknown[];
  };
  const nested = payload.data && !Array.isArray(payload.data) ? payload.data : undefined;
  const results = (Array.isArray(payload.data) ? payload.data : undefined) || nested?.results || nested?.items || payload.results || payload.items || [];
  return results.filter((item): item is ParallelSearchResultLike => Boolean(item && typeof item === "object"));
}

function evidenceFromParallel(input: {
  data: unknown;
  url: string;
  market: PolymarketMarket;
  payment: PayX402ResourceResult;
}): EvidenceItemInput[] {
  const fetchedAt = nowIso();
  return extractParallelResults(input.data)
    .slice(0, 5)
    .map((res, index) => {
      const excerpt = (Array.isArray(res.excerpts) ? res.excerpts.join(" ") : res.excerpt || res.content || "").slice(0, 800);
      const publishedAt = res.publish_date || res.publishedDate || res.published_date || res.date || undefined;
      return {
        evidenceId: "circle-x402-parallel-" + (index + 1),
        sourceType: "circle_x402_news" as const,
        provider: "parallel_x402_search",
        sourceUrl: res.url || input.url,
        title: res.title || "x402 Parallel Search Result " + (index + 1),
        excerpt,
        credibilityScore: 86,
        fetchedAt,
        capturedAt: fetchedAt,
        paid: true,
        paymentAmountUsdc: input.payment.amountUsdc,
        paymentNetwork: input.payment.paymentNetwork || input.payment.selectedChain,
        paymentRef: input.payment.paymentRef,
        txHash: input.payment.txHash,
        metadata: {
          provider: "parallel_x402_search",
          endpoint: parallelSearchEndpoint(),
          marketId: input.market.marketId,
          selectedChain: input.payment.selectedChain,
          paymentScheme: input.payment.paymentScheme,
          sourceKind: "web",
          sourcePublishedAt: publishedAt,
          evidenceTags: sportsEvidenceTagsForText((res.title || "") + " " + excerpt),
        },
      };
    })
    .filter((item) => item.excerpt.length > 0 && item.sourceUrl !== input.market.url);
}

export async function fetchParallelX402SearchEvidence(input: {
  market: PolymarketMarket;
  query?: string;
  dailySpendUsdc?: string | number | undefined;
  payResource?: typeof payX402Resource | undefined;
}): Promise<X402EvidenceProviderResult> {
  const query = cleanSearchQuery(input.query || input.market.title);
  const request = buildParallelSearchRequest(query);
  const payResource = input.payResource || payX402Resource;
  const paymentInput: Parameters<typeof payX402Resource>[0] = {
    url: request.url,
    method: request.method,
    body: request.body,
    headers: request.headers,
    config: externalX402EvidenceConfig(),
  };
  if (input.dailySpendUsdc !== undefined) paymentInput.dailySpendUsdc = input.dailySpendUsdc;
  const payment = await payResource<unknown>(paymentInput);

  if (payment.status !== "success" || !payment.paid) {
    return {
      enabled: payment.enabled,
      provider: "parallel_x402_search",
      status: payment.status,
      url: request.url,
      evidence: [],
      paymentAmountUsdc: payment.amountUsdc,
      paymentNetwork: payment.paymentNetwork,
      paymentScheme: payment.paymentScheme,
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
    provider: "parallel_x402_search",
    status: "success",
    url: request.url,
    evidence: evidenceFromParallel({ data: payment.data, url: request.url, market: input.market, payment }),
    paymentAmountUsdc: payment.amountUsdc,
    paymentNetwork: payment.paymentNetwork,
    paymentScheme: payment.paymentScheme,
    selectedChain: payment.selectedChain,
    supportChecks: payment.supportChecks,
    failureReason: payment.failureReason,
    paymentRef: payment.paymentRef,
    txHash: payment.txHash,
  };
}

export async function supportsParallelX402SearchEvidence(query: string) {
  return supportsX402Resource(parallelSearchEndpoint(), { config: externalX402EvidenceConfig() });
}

function buildFirecrawlSearchRequest(query: string) {
  return {
    url: stableEnrichFirecrawlSearchEndpoint(),
    method: "POST" as const,
    body: {
      query,
      limit: 5,
    },
    headers: { "Content-Type": "application/json" },
  };
}

type FirecrawlSearchResultLike = {
  title?: string;
  url?: string;
  sourceUrl?: string;
  description?: string;
  content?: string;
  markdown?: string;
  snippet?: string;
  publishedDate?: string;
  published_date?: string;
  date?: string;
};

function extractFirecrawlResults(data: unknown): FirecrawlSearchResultLike[] {
  const payload = data as {
    data?: unknown[] | { results?: unknown[]; items?: unknown[] };
    results?: unknown[];
    items?: unknown[];
  };
  const nested = payload.data && !Array.isArray(payload.data) ? payload.data : undefined;
  const results = (Array.isArray(payload.data) ? payload.data : undefined) || nested?.results || nested?.items || payload.results || payload.items || [];
  return results.filter((item): item is FirecrawlSearchResultLike => Boolean(item && typeof item === "object"));
}

function evidenceFromFirecrawl(input: {
  data: unknown;
  url: string;
  market: PolymarketMarket;
  payment: PayX402ResourceResult;
}): EvidenceItemInput[] {
  const fetchedAt = nowIso();
  return extractFirecrawlResults(input.data)
    .slice(0, 5)
    .map((res, index) => {
      const excerpt = (res.content || res.description || res.snippet || res.markdown || "").slice(0, 800);
      return {
        evidenceId: "circle-x402-firecrawl-" + (index + 1),
        sourceType: "circle_x402_news" as const,
        provider: "stableenrich_x402_firecrawl",
        sourceUrl: res.url || res.sourceUrl || input.url,
        title: res.title || "x402 Firecrawl Search Result " + (index + 1),
        excerpt,
        credibilityScore: 82,
        fetchedAt,
        capturedAt: fetchedAt,
        paid: true,
        paymentAmountUsdc: input.payment.amountUsdc,
        paymentNetwork: input.payment.paymentNetwork || input.payment.selectedChain,
        paymentRef: input.payment.paymentRef,
        txHash: input.payment.txHash,
        metadata: {
          provider: "stableenrich_x402_firecrawl",
          endpoint: stableEnrichFirecrawlSearchEndpoint(),
          marketId: input.market.marketId,
          selectedChain: input.payment.selectedChain,
          sourceKind: "web",
          sourcePublishedAt: res.publishedDate || res.published_date || res.date,
          evidenceTags: sportsEvidenceTagsForText((res.title || "") + " " + excerpt),
        },
      };
    })
    .filter((item) => item.excerpt.length > 0 && item.sourceUrl !== input.market.url);
}

export async function fetchFirecrawlX402SearchEvidence(input: {
  market: PolymarketMarket;
  query?: string;
  dailySpendUsdc?: string | number | undefined;
  payResource?: typeof payX402Resource | undefined;
}): Promise<X402EvidenceProviderResult> {
  const query = cleanSearchQuery(input.query || input.market.title);
  const request = buildFirecrawlSearchRequest(query);
  const payResource = input.payResource || payX402Resource;
  const paymentInput: Parameters<typeof payX402Resource>[0] = {
    url: request.url,
    method: request.method,
    body: request.body,
    headers: request.headers,
    config: externalX402EvidenceConfig(),
  };
  if (input.dailySpendUsdc !== undefined) paymentInput.dailySpendUsdc = input.dailySpendUsdc;
  const payment = await payResource<unknown>(paymentInput);

  if (payment.status !== "success" || !payment.paid) {
    return {
      enabled: payment.enabled,
      provider: "stableenrich_x402_firecrawl",
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
    provider: "stableenrich_x402_firecrawl",
    status: "success",
    url: request.url,
    evidence: evidenceFromFirecrawl({ data: payment.data, url: request.url, market: input.market, payment }),
    paymentAmountUsdc: payment.amountUsdc,
    paymentNetwork: payment.paymentNetwork,
    selectedChain: payment.selectedChain,
    supportChecks: payment.supportChecks,
    failureReason: payment.failureReason,
    paymentRef: payment.paymentRef,
    txHash: payment.txHash,
  };
}

export async function supportsFirecrawlX402SearchEvidence(query: string) {
  return supportsX402Resource(stableEnrichFirecrawlSearchEndpoint(), { config: externalX402EvidenceConfig() });
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
    config: externalX402EvidenceConfig(),
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
  return supportsX402Resource(aisaTavilySearchEndpoint(), { config: externalX402EvidenceConfig() });
}

export { AISA_TWITTER_SEARCH_ENDPOINT, STABLE_ENRICH_REDDIT_SEARCH_ENDPOINT, STABLE_ENRICH_FIRECRAWL_SEARCH_ENDPOINT, PARALLEL_SEARCH_ENDPOINT, AISA_TAVILY_SEARCH_ENDPOINT };
