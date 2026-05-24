import type { MarketSnapshot, PolymarketMarket } from "./types";
import type { PublishThresholds } from "./scoring";

export type MarketSkipReason =
  | "inactive"
  | "expired"
  | "missing_close_time"
  | "non_binary"
  | "missing_prices"
  | "invalid_prices"
  | "not_yes_no"
  | "low_liquidity"
  | "wide_spread"
  | "extreme_price";

export type MarketEligibility = {
  eligible: boolean;
  reasons: MarketSkipReason[];
};

function isYesNo(outcomes: string[]) {
  return /^yes$/i.test(outcomes[0] || "") && /^no$/i.test(outcomes[1] || "");
}

function hasValidPrices(prices: number[]) {
  return prices.length >= 2 && prices.slice(0, 2).every((price) => Number.isFinite(price) && price >= 0 && price <= 1);
}

export function isStrictYesNoMarket(market: PolymarketMarket): boolean {
  return market.outcomes.length === 2 && isYesNo(market.outcomes) && hasValidPrices(market.outcomePrices);
}

export function isEligibleBinaryMarket(market: PolymarketMarket): boolean {
  return evaluateMarketEligibility(market).eligible;
}

export function evaluateMarketEligibility(
  market: PolymarketMarket,
  options: { snapshot?: MarketSnapshot; thresholds?: Pick<PublishThresholds, "minLiquidityUsd" | "maxSpreadBps">; now?: Date } = {},
): MarketEligibility {
  const reasons: MarketSkipReason[] = [];
  const now = options.now || new Date();

  if (market.status !== "active") reasons.push("inactive");
  if (!market.closeTime) reasons.push("missing_close_time");
  if (market.closeTime && new Date(market.closeTime).getTime() <= now.getTime()) reasons.push("expired");
  if (market.outcomes.length !== 2) reasons.push("non_binary");
  if (market.outcomePrices.length < 2) reasons.push("missing_prices");
  if (market.outcomePrices.length >= 2 && !hasValidPrices(market.outcomePrices)) reasons.push("invalid_prices");
  if (market.outcomes.length === 2 && !isYesNo(market.outcomes)) reasons.push("not_yes_no");
  if (options.thresholds && market.liquidityUsd < options.thresholds.minLiquidityUsd) reasons.push("low_liquidity");
  if (options.thresholds && options.snapshot && options.snapshot.spreadBps > options.thresholds.maxSpreadBps) reasons.push("wide_spread");

  return { eligible: reasons.length === 0, reasons };
}


export function isAnalysisPriceInBand(priceBps: number | null, minBps = 100, maxBps = 9_900): boolean {
  if (priceBps === null || !Number.isFinite(priceBps)) return false;
  return priceBps >= minBps && priceBps <= maxBps;
}

export function analysisPriceSkipReason(snapshot: MarketSnapshot, minBps = 100, maxBps = 9_900): MarketSkipReason[] {
  return isAnalysisPriceInBand(snapshot.yesPriceBps, minBps, maxBps) ? [] : ["extreme_price"];
}

export function summarizeSkipReasons(items: { reasons: string[] }[]) {
  return items.reduce<Record<string, number>>((summary, item) => {
    for (const reason of item.reasons) summary[reason] = (summary[reason] || 0) + 1;
    return summary;
  }, {});
}

export type MarketCandidateScore = {
  score: number;
  spreadBps: number | null;
  liquidityUsd: number;
  volume24hUsd: number;
  closeTime: string | null;
  yesPriceBps: number | null;
  descriptionLength: number;
  components: {
    spread: number;
    liquidity: number;
    volume: number;
    closeTime: number;
    priceBalance: number;
    evidenceDepth: number;
    priceQualityMultiplier: number;
  };
};

function logScore(value: number, maxValue: number, weight: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(weight, (Math.log10(value + 1) / Math.log10(maxValue + 1)) * weight);
}

function priceBpsForScore(market: PolymarketMarket, snapshot?: MarketSnapshot | undefined) {
  if (snapshot) return snapshot.yesPriceBps;
  const yesIndex = market.outcomes.findIndex((outcome) => /^yes$/i.test(outcome));
  const price = market.outcomePrices[yesIndex >= 0 ? yesIndex : 0];
  return Number.isFinite(price) ? Math.round((price ?? 0) * 10_000) : null;
}

export function scoreMarketCandidate(market: PolymarketMarket, snapshot?: MarketSnapshot | undefined): MarketCandidateScore {
  const spreadBps = snapshot?.spreadBps ?? null;
  const spread = spreadBps === null ? 0 : Math.max(0, 30 * (1 - Math.min(spreadBps, 1_500) / 1_500));
  const liquidity = logScore(market.liquidityUsd, 1_000_000, 25);
  const volume = logScore(market.volume24hUsd, 250_000, 15);
  const closeTime = market.closeTime && new Date(market.closeTime).getTime() > Date.now() ? 10 : 0;
  const yesPriceBps = priceBpsForScore(market, snapshot);
  const priceBalance = yesPriceBps === null ? 0 : Math.max(0, 10 * (1 - Math.min(Math.abs(yesPriceBps - 5_000), 4_500) / 4_500));
  const descriptionLength = market.description.trim().length;
  const evidenceDepth = Math.min(10, (descriptionLength / 240) * 10);
  const priceQualityMultiplier = yesPriceBps === null
    ? 0.8
    : yesPriceBps < 100 || yesPriceBps > 9_900
      ? 0.2
      : yesPriceBps <= 500 || yesPriceBps >= 9_500
        ? 0.45
        : yesPriceBps <= 1_000 || yesPriceBps >= 9_000
          ? 0.7
          : 1;
  const components = { spread, liquidity, volume, closeTime, priceBalance, evidenceDepth, priceQualityMultiplier };
  const rawScore = spread + liquidity + volume + closeTime + priceBalance + evidenceDepth;
  const score = rawScore * priceQualityMultiplier;
  return {
    score: Math.round(score * 100) / 100,
    spreadBps,
    liquidityUsd: market.liquidityUsd,
    volume24hUsd: market.volume24hUsd,
    closeTime: market.closeTime,
    yesPriceBps,
    descriptionLength,
    components,
  };
}

export function rankMarketCandidates<T extends { market: PolymarketMarket; snapshot?: MarketSnapshot | undefined }>(candidates: T[]) {
  return candidates
    .map((candidate) => ({ ...candidate, candidateScore: scoreMarketCandidate(candidate.market, candidate.snapshot) }))
    .sort((left, right) => {
      const leftSpread = left.candidateScore.spreadBps ?? Number.POSITIVE_INFINITY;
      const rightSpread = right.candidateScore.spreadBps ?? Number.POSITIVE_INFINITY;
      return (
        right.candidateScore.score - left.candidateScore.score ||
        leftSpread - rightSpread ||
        right.market.liquidityUsd - left.market.liquidityUsd ||
        right.market.volume24hUsd - left.market.volume24hUsd
      );
    });
}
