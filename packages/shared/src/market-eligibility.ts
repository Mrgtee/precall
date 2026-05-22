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
  | "wide_spread";

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

export function summarizeSkipReasons(items: { reasons: string[] }[]) {
  return items.reduce<Record<string, number>>((summary, item) => {
    for (const reason of item.reasons) summary[reason] = (summary[reason] || 0) + 1;
    return summary;
  }, {});
}
