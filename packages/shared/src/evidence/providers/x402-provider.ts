import type { EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "../../types";
import { payX402Resource, supportsX402Resource, type PayX402ResourceResult } from "../../circle/gateway-client";

const AISA_TWITTER_SEARCH_ENDPOINT = "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search";

export type X402EvidenceProviderStatus = "disabled" | "unsupported" | "blocked" | "insufficient_balance" | "success" | "failed";

export type X402EvidenceProviderResult = {
  enabled: boolean;
  provider: string;
  status: X402EvidenceProviderStatus;
  url?: string | undefined;
  evidence: EvidenceItemInput[];
  paymentAmountUsdc?: string | undefined;
  paymentNetwork?: string | undefined;
  paymentRef?: string | undefined;
  txHash?: string | undefined;
  error?: string | undefined;
};

function nowIso() {
  return new Date().toISOString();
}

function buildAisaSearchUrl(query: string) {
  const url = new URL(AISA_TWITTER_SEARCH_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("queryType", "Top");
  return url.toString();
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
        paymentNetwork: input.payment.paymentNetwork,
        paymentRef: input.payment.paymentRef,
        txHash: input.payment.txHash,
        metadata: { provider: "aisa_x402_social", endpoint: AISA_TWITTER_SEARCH_ENDPOINT, marketId: input.market.marketId },
      };
    })
    .filter((item) => item.excerpt.length > 0);
}

export async function fetchAisaX402SocialEvidence(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  query?: string;
  dailySpendUsdc?: string | number | undefined;
  payResource?: typeof payX402Resource | undefined;
}): Promise<X402EvidenceProviderResult> {
  const query = input.query || `${input.market.title} Polymarket`;
  const url = buildAisaSearchUrl(query);
  const payResource = input.payResource || payX402Resource;
  const paymentInput: Parameters<typeof payX402Resource>[0] = { url };
  if (input.dailySpendUsdc !== undefined) paymentInput.dailySpendUsdc = input.dailySpendUsdc;
  const payment = await payResource<{ response?: { tweets?: unknown[] }; tweets?: unknown[] }>(paymentInput);

  if (payment.status !== "success" || !payment.paid) {
    return {
      enabled: payment.enabled,
      provider: "aisa_x402_social",
      status: payment.status,
      url,
      evidence: [],
      paymentAmountUsdc: payment.amountUsdc,
      paymentNetwork: payment.paymentNetwork,
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
    paymentRef: payment.paymentRef,
    txHash: payment.txHash,
  };
}

export async function supportsAisaX402SocialEvidence(query: string) {
  return supportsX402Resource(buildAisaSearchUrl(query));
}

export { AISA_TWITTER_SEARCH_ENDPOINT };
