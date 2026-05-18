import { optionalEnv } from "./env";
import type { MarketResolution, MarketSnapshot, PolymarketMarket } from "./types";

interface GammaMarket {
  id?: string;
  question?: string;
  title?: string;
  description?: string;
  conditionId?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  outcomes?: unknown;
  outcomePrices?: unknown;
  clobTokenIds?: unknown;
  liquidity?: string | number;
  volume24hr?: string | number;
  volume24h?: string | number;
  endDate?: string;
  endDateIso?: string;
  updatedAt?: string;
  closedTime?: string;
  umaResolutionStatus?: string;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function parsePriceArray(value: unknown): number[] {
  return parseJsonArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverPolymarketMarkets(limit = 25): Promise<PolymarketMarket[]> {
  const baseUrl = optionalEnv("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com");
  const url = new URL("/markets", baseUrl);
  url.searchParams.set("closed", "false");
  url.searchParams.set("active", "true");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("order", "volume24hr");
  url.searchParams.set("ascending", "false");

  const payload = await fetchJson<GammaMarket[] | { markets?: GammaMarket[] }>(url.toString());
  const rawMarkets = Array.isArray(payload) ? payload : payload.markets || [];

  return rawMarkets
    .map(normalizeGammaMarket)
    .filter((market): market is PolymarketMarket => Boolean(market))
    .slice(0, limit);
}

export async function fetchPolymarketResolution(marketId: string): Promise<MarketResolution | null> {
  const baseUrl = optionalEnv("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com");
  const url = new URL(`/markets/${marketId}`, baseUrl);
  const raw = await fetchJson<GammaMarket>(url.toString());
  const normalized = normalizeGammaMarket(raw);
  if (!normalized || normalized.status !== "closed") return null;
  if (raw.umaResolutionStatus && raw.umaResolutionStatus !== "resolved") return null;

  const yesIndex = normalized.outcomes.findIndex((outcome) => /^yes$/i.test(outcome));
  const noIndex = normalized.outcomes.findIndex((outcome) => /^no$/i.test(outcome));
  if (yesIndex < 0 || noIndex < 0) return null;

  const yesPrice = normalized.outcomePrices[yesIndex] ?? 0;
  const noPrice = normalized.outcomePrices[noIndex] ?? 0;
  const yesResolved = yesPrice >= 0.99 && noPrice <= 0.01;
  const noResolved = noPrice >= 0.99 && yesPrice <= 0.01;
  if (!yesResolved && !noResolved) return null;

  return {
    marketId: normalized.marketId,
    outcomeYes: yesResolved,
    finalYesPriceBps: Math.round(yesPrice * 10_000),
    sourceUrl: normalized.url,
    resolvedAt: raw.closedTime || raw.updatedAt || new Date().toISOString(),
  };
}

export function normalizeGammaMarket(raw: GammaMarket): PolymarketMarket | null {
  const marketId = String(raw.id || raw.conditionId || "").trim();
  const title = String(raw.question || raw.title || "").trim();
  if (!marketId || !title) return null;

  const outcomes = parseJsonArray(raw.outcomes);
  const outcomePrices = parsePriceArray(raw.outcomePrices);
  const slug = String(raw.slug || marketId).trim();
  const closeTime = raw.endDate || raw.endDateIso || null;

  return {
    source: "polymarket",
    marketId,
    conditionId: String(raw.conditionId || ""),
    slug,
    title,
    description: String(raw.description || ""),
    url: `https://polymarket.com/event/${slug}`,
    outcomes,
    outcomePrices,
    clobTokenIds: parseJsonArray(raw.clobTokenIds),
    liquidityUsd: toNumber(raw.liquidity),
    volume24hUsd: toNumber(raw.volume24hr ?? raw.volume24h),
    closeTime,
    status: raw.closed === true || raw.active === false ? "closed" : "active",
  };
}

export async function fetchMarketSnapshot(market: PolymarketMarket): Promise<MarketSnapshot> {
  const yesIndex = market.outcomes.findIndex((outcome) => /^yes$/i.test(outcome));
  const noIndex = market.outcomes.findIndex((outcome) => /^no$/i.test(outcome));
  const yesPrice = market.outcomePrices[yesIndex >= 0 ? yesIndex : 0] ?? 0;
  const noPrice = market.outcomePrices[noIndex >= 0 ? noIndex : 1] ?? 1 - yesPrice;
  const orderBookSpread = await fetchOrderBookSpread(market).catch(() => null);

  return {
    marketId: market.marketId,
    yesPriceBps: Math.round(yesPrice * 10_000),
    noPriceBps: Math.round(noPrice * 10_000),
    spreadBps: orderBookSpread ?? estimateSpreadBps(market),
    depthUsd: market.liquidityUsd,
    capturedAt: new Date().toISOString(),
  };
}

async function fetchOrderBookSpread(market: PolymarketMarket): Promise<number | null> {
  const tokenId = market.clobTokenIds[0];
  if (!tokenId) return null;

  const baseUrl = optionalEnv("POLYMARKET_CLOB_URL", "https://clob.polymarket.com");
  const url = new URL("/book", baseUrl);
  url.searchParams.set("token_id", tokenId);
  const book = await fetchJson<{ bids?: { price: string }[]; asks?: { price: string }[] }>(
    url.toString(),
    7_500,
  );
  const bestBid = Number(book.bids?.[0]?.price);
  const bestAsk = Number(book.asks?.[0]?.price);
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestAsk < bestBid) return null;
  return Math.round((bestAsk - bestBid) * 10_000);
}

function estimateSpreadBps(market: PolymarketMarket): number {
  if (market.liquidityUsd >= 25_000) return 120;
  if (market.liquidityUsd >= 5_000) return 260;
  if (market.liquidityUsd >= 1_000) return 500;
  return 1_000;
}

export function polymarketCopyUrl(market: PolymarketMarket): string {
  const builderCode = optionalEnv("POLYMARKET_BUILDER_CODE");
  if (!builderCode) return market.url;
  const url = new URL(market.url);
  url.searchParams.set("ref", builderCode);
  return url.toString();
}
