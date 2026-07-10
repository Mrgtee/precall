import { numberEnv, optionalEnv } from "./env";
import { clampBps, suggestedSizeBps } from "./scoring";
import type { EvidenceItemInput, OutcomeSnapshot, PolymarketMarket, SportsPredictionIdea, SportsRiskLevel, SportsVote } from "./types";

export type SportsCategory = "soccer" | "nba" | "mlb" | "nhl" | "ufc" | "football" | "esports" | "tennis" | "cricket" | "golf" | "rugby" | "other_sports";
export type SportsMarketKind =
  | "over_under"
  | "spread"
  | "moneyline"
  | "team_win"
  | "draw"
  | "double_chance"
  | "team_total"
  | "both_teams_to_score"
  | "goals_range"
  | "correct_score"
  | "player_prop"
  | "outright"
  | "other";
export type SportsCallStatus = "strong_call" | "lean_call" | "high_risk_call" | "avoid_call";

export type SportsMarketClassification = {
  isSports: boolean;
  category: SportsCategory | "unknown";
  marketKind: SportsMarketKind;
  reasons: string[];
};

export type SportsThresholds = {
  minLiquidityUsd: number;
  maxSpreadBps: number;
  minEdgeBps: number;
  minConfidenceBps: number;
  minPriceBps: number;
  maxPriceBps: number;
  lookaheadHours: number;
  minStartLeadMinutes: number;
};

export type SportsCandidate = {
  market: PolymarketMarket;
  classification: SportsMarketClassification;
  outcomeIndexes: number[];
  candidateScore: number;
};

export type SportsSkip = {
  marketId: string;
  title: string;
  reasons: string[];
  url: string;
  category?: string;
  marketKind?: string;
  liquidityUsd?: number;
  volume24hUsd?: number;
  closeTime?: string | null;
  candidateScore?: number;
};

export function sportsOnlyCategory(fallback = "") {
  const category = optionalEnv("SPORTS_ONLY_CATEGORY", fallback).toLowerCase();
  return category && category !== "all" && category !== "*" ? category : undefined;
}

const SPORTS_PATTERNS = [
  /\b(nba|wnba|mlb|nhl|nfl|ufc|ucl|atp|wta|ipl|mma|cs2|lol)\b/,
  /\b(champions league|premier league|la liga|serie a|bundesliga|ligue 1|world cup|soccer|football|basketball|baseball|hockey|tennis|golf|cricket|rugby|boxing|dota|counter-strike|league of legends|valorant)\b/,
  /\b(epl|ere|fifwc|nba|mlb|nhl|nfl|ufc|atp|wta|lol|dota2|cs2|cricipl)-[a-z0-9-]+/,
  /\b(afc|fc|united|city|hotspur|ajax|inter|madrid|barcelona|arsenal|chelsea|liverpool|tottenham|brighton|everton|west ham|newcastle|aston villa)\b/,
  /\b(over|under)\s+\d+(?:\.\d+)?\s+(goals?|points?|runs?)\b/,
  /\b(total goals?|team goals?|both teams to score|btts|double chance|correct score|score range)\b/,
];

const NON_SPORTS_FALSE_POSITIVE_PATTERNS = [
  /\b(president|nomination|election|congress|senate|iran|israel|hezbollah|uranium|nuclear|ceasefire|peace deal|invasion|tariff|fed|bitcoin|wti|oil)\b/,
];

function lowerMarketText(market: PolymarketMarket) {
  const urlFallback = market.slug.trim() ? "" : market.url;
  return `${market.title} ${market.slug} ${urlFallback} ${market.description} ${market.outcomes.join(" ")}`.toLowerCase();
}

export function classifySportsMarket(market: PolymarketMarket): SportsMarketClassification {
  const text = lowerMarketText(market);
  const reasons: string[] = [];
  const hasSportsSignal = SPORTS_PATTERNS.some((pattern) => pattern.test(text));
  const hasFalsePositiveSignal = NON_SPORTS_FALSE_POSITIVE_PATTERNS.some((pattern) => pattern.test(text));
  const hasExplicitCompetitionSignal = /\b(nba|wnba|mlb|nhl|nfl|ufc|ucl|atp|wta|ipl|fifa|fifwc|world cup|premier league|champions league|la liga|serie a|bundesliga|ligue 1|roland garros)\b|\b(epl|ere|fifwc|nba|mlb|nhl|nfl|ufc|atp|wta|lol|dota2|cs2|cricipl)-/.test(text);
  const isSports = hasSportsSignal && (!hasFalsePositiveSignal || hasExplicitCompetitionSignal);
  if (!isSports) reasons.push("not_sports");

  let category: SportsCategory | "unknown" = "unknown";
  if (/\b(nba|wnba|basketball)\b/.test(text)) category = "nba";
  else if (/\b(mlb|baseball)\b/.test(text)) category = "mlb";
  else if (/\b(nhl|hockey)\b/.test(text)) category = "nhl";
  else if (/\b(ufc|mma|boxing)\b/.test(text)) category = "ufc";
  else if (/\b(nfl|american football)\b/.test(text)) category = "football";
  else if (/\b(atp|wta|tennis|roland garros)\b/.test(text)) category = "tennis";
  else if (/\b(cricket|ipl|cricipl|indian premier league)\b/.test(text)) category = "cricket";
  else if (/\b(golf)\b/.test(text)) category = "golf";
  else if (/\b(rugby)\b/.test(text)) category = "rugby";
  else if (/\b(dota\s*2?|dota2|counter-strike|cs2|league of legends|lol|valorant|esports?)\b/.test(text)) category = "esports";
  else if (/\b(soccer|ucl|champions league|epl|ere|fifwc|premier league|la liga|serie a|bundesliga|ligue 1|fifa|world cup|afc|fc|united|city|hotspur|ajax|inter)\b/.test(text)) category = "soccer";
  else if (/\bfootball\b/.test(text)) category = "football";
  else if (isSports) category = "other_sports";

  let marketKind: SportsMarketKind = "other";
  if (/both teams to score|\bbtts\b/.test(text)) marketKind = "both_teams_to_score";
  else if (/correct score/.test(text)) marketKind = "correct_score";
  else if (/score range|goals? range|between \d+(?:\.\d+)?(?: and |-)\d+(?:\.\d+)? goals?/.test(text)) marketKind = "goals_range";
  else if (/team total|team goals?|\b[a-z .'-]+ goals? over|\b[a-z .'-]+ goals? under/.test(text)) marketKind = "team_total";
  else if (/over\/under|over under|total goals?|total points?|total runs?|\bo\/u\b|over \d+(?:\.\d+)?|under \d+(?:\.\d+)?/.test(text)) marketKind = "over_under";
  else if (/spread|\([+-]?\d+(?:\.\d+)?\)|(?:^|\s)[+-]\d+(?:\.\d+)?\b/.test(text)) marketKind = "spread";
  else if (/double chance/.test(text)) marketKind = "double_chance";
  else if (/\bdraw\b/.test(text)) marketKind = "draw";
  else if (/player|points|rebounds|assists|shots|cards|goalscorer|touchdown|strikeouts|bases|saves/.test(text) && !/team goals?/.test(text)) marketKind = "player_prop";
  else if (/winner|wins?|beat|defeat|vs\.| vs |moneyline/.test(text)) marketKind = "moneyline";
  else if (/will .* win/.test(text)) marketKind = "team_win";
  else if (/champion|finals|world cup|conference|division|tournament/.test(text)) marketKind = "outright";

  return { isSports, category, marketKind, reasons };
}

export function sportsThresholds(): SportsThresholds {
  return {
    minLiquidityUsd: numberEnv("SPORTS_MIN_LIQUIDITY_USD", 25_000),
    maxSpreadBps: numberEnv("SPORTS_MAX_SPREAD_BPS", 500),
    minEdgeBps: numberEnv("SPORTS_MIN_EDGE_BPS", 300),
    minConfidenceBps: numberEnv("SPORTS_MIN_CONFIDENCE_BPS", 5_000),
    minPriceBps: numberEnv("SPORTS_MIN_PRICE_BPS", 1_000),
    maxPriceBps: numberEnv("SPORTS_MAX_PRICE_BPS", 9_000),
    lookaheadHours: numberEnv("SPORTS_LOOKAHEAD_HOURS", 72),
    minStartLeadMinutes: numberEnv("SPORTS_MIN_START_LEAD_MINUTES", 30),
  };
}

export function sportsEnabled() {
  return optionalEnv("ENABLE_SPORTS_EDGE", "false") !== "false";
}

export function sportsDiscoveryLimit() {
  return numberEnv("SPORTS_DISCOVERY_MARKET_LIMIT", 350);
}

export function sportsDailyTarget() {
  return numberEnv("SPORTS_DAILY_TARGET", 8);
}

export function maxSportsAnalyzedPerRun() {
  return numberEnv("MAX_SPORTS_ANALYZED_PER_RUN", 24);
}

export function sportsStrategyMode() {
  return optionalEnv("SPORTS_STRATEGY_MODE", "hit_rate").trim().toLowerCase();
}

export function sportsHitRateMode() {
  return sportsStrategyMode() !== "edge";
}

export function sportsTargetHitRateBps() {
  return numberEnv("SPORTS_TARGET_HIT_RATE_BPS", 7_000);
}

export function sportsHighProbabilityMinPriceBps() {
  return numberEnv("SPORTS_HIGH_PROB_MIN_PRICE_BPS", 6_500);
}

export function sportsHighProbabilityMaxPriceBps() {
  return numberEnv("SPORTS_HIGH_PROB_MAX_PRICE_BPS", 9_000);
}

export function sportsHighProbabilityMinConfidenceBps() {
  return numberEnv("SPORTS_HIGH_PROB_MIN_CONFIDENCE_BPS", 4_000);
}

export function sportsHighProbabilityMinEdgeBps() {
  return numberEnv("SPORTS_HIGH_PROB_MIN_EDGE_BPS", 0);
}

function validOutcomeIndexes(market: PolymarketMarket, thresholds: SportsThresholds) {
  return market.outcomePrices
    .map((price, index) => ({ priceBps: Math.round(price * 10_000), index }))
    .filter((item) => item.priceBps >= thresholds.minPriceBps && item.priceBps <= thresholds.maxPriceBps)
    .map((item) => item.index);
}

function pricedOutcomeIndexes(market: PolymarketMarket) {
  return market.outcomePrices
    .map((price, index) => ({ priceBps: Math.round(price * 10_000), index }))
    .filter((item) => Number.isFinite(item.priceBps) && item.priceBps > 0 && item.priceBps < 10_000)
    .map((item) => item.index);
}

function outcomePriceBps(market: PolymarketMarket, outcomeIndex: number) {
  return clampBps(Math.round((market.outcomePrices[outcomeIndex] || 0) * 10_000));
}

function highProbabilityPriceScore(priceBps: number) {
  const min = sportsHighProbabilityMinPriceBps();
  const max = sportsHighProbabilityMaxPriceBps();
  if (priceBps >= min && priceBps <= max) {
    return 30 + ((priceBps - min) / Math.max(1, max - min)) * 35;
  }
  if (priceBps > max && priceBps < 9_800) return 18;
  if (priceBps >= 5_800) return 10;
  return 0;
}

export function sportsHitRatePotentialScore(market: PolymarketMarket, outcomeIndexes = pricedOutcomeIndexes(market)) {
  const bestPrice = outcomeIndexes.reduce((best, index) => Math.max(best, outcomePriceBps(market, index)), 0);
  return Math.round(highProbabilityPriceScore(bestPrice) * 100) / 100;
}

export function preferredHighProbabilityOutcomeIndex(market: PolymarketMarket, outcomeIndexes = pricedOutcomeIndexes(market)) {
  const candidates = outcomeIndexes.length ? outcomeIndexes : pricedOutcomeIndexes(market);
  if (!candidates.length) return 0;
  return [...candidates].sort((left, right) => {
    const leftPrice = outcomePriceBps(market, left);
    const rightPrice = outcomePriceBps(market, right);
    return highProbabilityPriceScore(rightPrice) - highProbabilityPriceScore(leftPrice) || rightPrice - leftPrice || left - right;
  })[0] ?? candidates[0] ?? 0;
}

export function sportsEventTime(market: PolymarketMarket): string | null {
  const text = `${market.title} ${market.slug} ${market.url}`;
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (!match?.[1]) return market.closeTime;

  const close = market.closeTime ? new Date(market.closeTime) : undefined;
  const closeMs = close && Number.isFinite(close.getTime()) ? close.getTime() : Number.NaN;
  const eventDateMs = Date.parse(`${match[1]}T00:00:00.000Z`);

  // Polymarket sports slugs usually carry the event date, while closeTime often
  // carries the actual UTC start/close hour. If closeTime is within the event
  // day window, it is a better start-time proxy than midnight.
  if (Number.isFinite(closeMs) && Number.isFinite(eventDateMs) && closeMs >= eventDateMs && closeMs - eventDateMs <= 36 * 3_600_000) {
    return close!.toISOString();
  }

  const hour = close && Number.isFinite(close.getTime()) ? close.getUTCHours() : 12;
  const minute = close && Number.isFinite(close.getTime()) ? close.getUTCMinutes() : 0;
  return `${match[1]}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function closeTimeScore(market: PolymarketMarket, now: Date, lookaheadHours: number, minStartLeadMinutes: number) {
  const eventTime = sportsEventTime(market);
  if (!eventTime) return { ok: false, score: 0, reason: "missing_close_time" };
  const eventMs = new Date(eventTime).getTime();
  if (!Number.isFinite(eventMs)) return { ok: false, score: 0, reason: "expired" };
  if (eventMs <= now.getTime()) return { ok: false, score: 0, reason: "event_started" };
  if (eventMs - now.getTime() < minStartLeadMinutes * 60_000) return { ok: false, score: 0, reason: "event_starting_soon" };
  const hours = (eventMs - now.getTime()) / 3_600_000;
  if (hours > lookaheadHours) return { ok: false, score: 0, reason: "outside_sports_window" };
  return { ok: true, score: Math.max(0, 20 * (1 - Math.abs(hours - 24) / Math.max(lookaheadHours, 1))), reason: "" };
}

function logScore(value: number, maxValue: number, weight: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(weight, (Math.log10(value + 1) / Math.log10(maxValue + 1)) * weight);
}

export function evaluateSportsCandidate(market: PolymarketMarket, thresholds = sportsThresholds(), now = new Date()): { eligible: boolean; reasons: string[]; candidate?: SportsCandidate } {
  const classification = classifySportsMarket(market);
  const reasons = [...classification.reasons];
  if (market.status !== "active") reasons.push("inactive");

  const forceCategory = sportsOnlyCategory();
  if (forceCategory && classification.category !== forceCategory) {
    reasons.push("wrong_sports_category");
  }
  const close = closeTimeScore(market, now, thresholds.lookaheadHours, thresholds.minStartLeadMinutes);
  if (!close.ok) reasons.push(close.reason);
  if (market.outcomes.length < 2 || market.outcomePrices.length < 2) reasons.push("missing_outcomes_or_prices");
  if (market.outcomePrices.some((price) => !Number.isFinite(price) || price < 0 || price > 1)) reasons.push("invalid_prices");
  if (!Number.isFinite(market.liquidityUsd) || market.liquidityUsd <= 0) reasons.push("low_liquidity");
  if (classification.isSports && classification.marketKind === "other") reasons.push("unsupported_market_format");
  const outcomeIndexes = validOutcomeIndexes(market, thresholds);
  const analyzableOutcomeIndexes = outcomeIndexes.length > 0 ? outcomeIndexes : pricedOutcomeIndexes(market);
  if (analyzableOutcomeIndexes.length === 0) reasons.push("unclear_outcome_mapping");

  if (reasons.length > 0) return { eligible: false, reasons };

  const volume = logScore(market.volume24hUsd, 500_000, 20);
  const liquidity = logScore(market.liquidityUsd, 1_000_000, 20);
  const evidenceDepth = Math.min(12, (market.description.trim().length / 600) * 12);
  const outcomeDepth = Math.min(8, outcomeIndexes.length * 3);
  const kindBoost = classification.marketKind === "over_under" || classification.marketKind === "moneyline" || classification.marketKind === "double_chance" || classification.marketKind === "team_total" ? 12 : classification.marketKind === "spread" ? 6 : 4;
  const hitRatePotential = sportsHitRateMode() ? sportsHitRatePotentialScore(market, analyzableOutcomeIndexes) : 0;
  const candidateScore = Math.round((volume + liquidity + close.score + evidenceDepth + outcomeDepth + kindBoost + hitRatePotential) * 100) / 100;

  return { eligible: true, reasons: [], candidate: { market, classification, outcomeIndexes: analyzableOutcomeIndexes, candidateScore } };
}

export function rankSportsCandidates(candidates: SportsCandidate[]) {
  return [...candidates].sort((left, right) =>
    right.candidateScore - left.candidateScore ||
    right.market.volume24hUsd - left.market.volume24hUsd ||
    right.market.liquidityUsd - left.market.liquidityUsd,
  );
}

export function buildSportsEvidenceContext(input: { market: PolymarketMarket; snapshot: OutcomeSnapshot; x402Evidence?: EvidenceItemInput[] | undefined }): EvidenceItemInput[] {
  const fetchedAt = input.snapshot.capturedAt;
  const publicEvidence: EvidenceItemInput[] = [
    {
      evidenceId: "pm-market",
      sourceType: "polymarket_market",
      provider: "polymarket_gamma",
      sourceUrl: input.market.url,
      title: `Polymarket sports market: ${input.market.title}`,
      excerpt: `${input.market.description || "No description provided"} Outcomes: ${input.market.outcomes.join(" / ")}. Close: ${input.market.closeTime || "unknown"}.`,
      credibilityScore: 86,
      fetchedAt,
      capturedAt: fetchedAt,
      paid: false,
      metadata: { marketId: input.market.marketId, sports: true, liquidityUsd: input.market.liquidityUsd, volume24hUsd: input.market.volume24hUsd, publicData: true },
    },
    {
      evidenceId: "pm-selected-outcome",
      sourceType: "polymarket_orderbook",
      provider: "polymarket_clob",
      sourceUrl: input.market.url,
      title: `Sports outcome price snapshot: ${input.market.title}`,
      excerpt: `Outcome prices: ${input.market.outcomes.map((outcome, index) => `${index}: ${outcome} ${Math.round((input.market.outcomePrices[index] || 0) * 10_000)} bps`).join("; ")}. Current book sample spread ${input.snapshot.spreadBps} bps and market depth about $${Math.round(input.snapshot.depthUsd).toLocaleString()}.`,
      credibilityScore: 84,
      fetchedAt,
      capturedAt: fetchedAt,
      paid: false,
      metadata: { outcomeIndex: input.snapshot.outcomeIndex, outcome: input.snapshot.outcome, priceBps: input.snapshot.priceBps, spreadBps: input.snapshot.spreadBps, publicData: true },
    },
  ];
  return [...publicEvidence, ...(input.x402Evidence || [])];
}

export function selectedSportsOptionLabel(market: PolymarketMarket, outcomeIndex: number) {
  const rawOutcome = String(market.outcomes[outcomeIndex] || `Outcome ${outcomeIndex + 1}`).trim();
  const normalizedOutcome = rawOutcome.toLowerCase();
  if (normalizedOutcome !== "yes" && normalizedOutcome !== "no") return rawOutcome;

  const affirmative = normalizedOutcome === "yes";
  const title = market.title.replace(/\?$/, "").trim();
  const text = `${market.title} ${market.slug}`.toLowerCase();
  const explicitTotalLine = text.match(/\b(over|under)\s*(\d+(?:\.\d+)?)\s*(goals?|points?|runs?)?\b/);
  const shorthandTotalLine = text.match(/\bo\/u\s*(\d+(?:\.\d+)?)\b/);
  if (explicitTotalLine || shorthandTotalLine) {
    const explicitDirection = explicitTotalLine?.[1] === "under" ? "Under" : "Over";
    const number = explicitTotalLine?.[2] || shorthandTotalLine?.[1] || "";
    const unitToken = explicitTotalLine?.[3];
    const unit = unitToken ? (unitToken.endsWith("s") ? unitToken : `${unitToken}s`) : text.includes("goal") ? "goals" : text.includes("run") ? "runs" : "points";
    const direction = affirmative ? explicitDirection : explicitDirection === "Over" ? "Under" : "Over";
    return `${direction} ${number} ${unit}`;
  }

  if (/both teams to score|\bbtts\b/.test(text)) return affirmative ? "Both teams to score" : "Both teams not to score";
  if (/double chance/.test(text)) return affirmative ? title.replace(/^will\s+/i, "") : `Oppose ${title.replace(/^will\s+/i, "")}`;
  const winMatch = title.match(/^will\s+(.+?)\s+win(?:\s+on\s+\d{4}-\d{2}-\d{2})?/i);
  if (winMatch?.[1]) return affirmative ? `${winMatch[1]} to win` : `${winMatch[1]} not to win`;
  const spreadMatch = title.match(/(.+?)([+-]\d+(?:\.\d+)?)/);
  if (spreadMatch?.[1] && spreadMatch[2]) {
    const spreadLabel = `${spreadMatch[1].trim()} ${spreadMatch[2]}`;
    return affirmative ? spreadLabel : `Oppose ${spreadLabel}`;
  }

  return affirmative ? title : `No: ${title}`;
}

export function aggregateSportsVotes(input: { market: PolymarketMarket; snapshot: OutcomeSnapshot; category: string; marketKind: string; evidence: EvidenceItemInput[]; votes: SportsVote[] }): SportsPredictionIdea {
  const grouped = new Map<number, SportsVote[]>();
  for (const vote of input.votes) {
    if (vote.selectedOutcomeIndex < 0 || vote.selectedOutcomeIndex >= input.market.outcomes.length) continue;
    const current = grouped.get(vote.selectedOutcomeIndex) || [];
    current.push(vote);
    grouped.set(vote.selectedOutcomeIndex, current);
  }
  const selectableOutcomeIndexes = [...new Set([...pricedOutcomeIndexes(input.market), input.snapshot.outcomeIndex, ...input.votes.map((vote) => vote.selectedOutcomeIndex)])]
    .filter((index) => index >= 0 && index < input.market.outcomes.length);
  const [voteSelectedOutcomeIndex, voteSelectedVotes] = [...grouped.entries()].sort((left, right) => {
    const leftWeight = left[1].reduce((sum, vote) => sum + vote.confidenceBps, 0);
    const rightWeight = right[1].reduce((sum, vote) => sum + vote.confidenceBps, 0);
    return rightWeight - leftWeight || right[1].length - left[1].length;
  })[0] || [input.snapshot.outcomeIndex, input.votes];
  const selectedOutcomeIndex = sportsHitRateMode()
    ? selectHighProbabilityOutcomeIndex(input.market, selectableOutcomeIndexes, grouped, voteSelectedOutcomeIndex)
    : voteSelectedOutcomeIndex;
  const selectedVotes = grouped.get(selectedOutcomeIndex) || voteSelectedVotes || input.votes;

  const marketPriceBps = outcomePriceBps(input.market, selectedOutcomeIndex);
  const totalWeight = Math.max(1, selectedVotes.reduce((sum, vote) => sum + Math.max(1, vote.confidenceBps), 0));
  const rawAgentProbabilityBps = clampBps(selectedVotes.reduce((sum, vote) => sum + vote.agentProbabilityBps * Math.max(1, vote.confidenceBps), 0) / totalWeight || marketPriceBps);
  const agentProbabilityBps = sportsHitRateMode() && highProbabilityPriceScore(marketPriceBps) > 0
    ? calibrateHighProbabilityBps(marketPriceBps, rawAgentProbabilityBps)
    : rawAgentProbabilityBps;
  const confidenceBps = clampBps(selectedVotes.reduce((sum, vote) => sum + vote.confidenceBps, 0) / Math.max(1, selectedVotes.length));
  const edgeBps = Math.max(0, agentProbabilityBps - marketPriceBps);
  const selectedOption = selectedSportsOptionLabel(input.market, selectedOutcomeIndex);
  const riskLevel = riskLevelFor({ confidenceBps, edgeBps, marketPriceBps, spreadBps: input.snapshot.spreadBps });
  const rationale = selectedVotes.map((vote) => `${vote.agent}: ${vote.thesis}`).join("\n\n").slice(0, 4_000);
  const risks = [...new Set(selectedVotes.flatMap((vote) => vote.risks))].slice(0, 8);

  return {
    market: input.market,
    snapshot: { ...input.snapshot, outcomeIndex: selectedOutcomeIndex, outcome: selectedOption, priceBps: marketPriceBps, complementPriceBps: Math.max(0, 10_000 - marketPriceBps) },
    category: input.category,
    marketKind: input.marketKind,
    selectedOption,
    selectedOutcomeIndex,
    marketPriceBps,
    agentProbabilityBps,
    edgeBps,
    confidenceBps,
    riskLevel,
    rationale,
    matchupContext: summarizeEvidence(input.evidence, ["circle_x402_social", "circle_x402_news", "free_web"]),
    marketMovement: `Polymarket selected outcome ${selectedOption} is priced at ${marketPriceBps} bps with ${input.snapshot.spreadBps} bps spread and about $${Math.round(input.snapshot.depthUsd).toLocaleString()} liquidity/depth context.`,
    risks,
    verdict: edgeBps > 0 ? `${selectedOption} is a ${riskLevel}-risk AI sports call, not a guarantee.` : `${selectedOption} is a high-risk AI sports call with no positive selected-side edge after council review.`,
    evidence: input.evidence,
    votes: selectedVotes,
    suggestedSizeBps: suggestedSizeBps(edgeBps, confidenceBps, marketPriceBps),
  };
}

export function sportsThresholdFailures(idea: Pick<SportsPredictionIdea, "edgeBps" | "confidenceBps" | "marketPriceBps" | "agentProbabilityBps" | "snapshot">, thresholds = sportsThresholds()) {
  const failures: string[] = [];
  const highProbability = isHighProbabilitySportsCall(idea);
  if (!highProbability && idea.edgeBps < thresholds.minEdgeBps) failures.push("low_edge");
  if (idea.confidenceBps < (highProbability ? sportsHighProbabilityMinConfidenceBps() : thresholds.minConfidenceBps)) failures.push("low_confidence");
  if (idea.snapshot.spreadBps > thresholds.maxSpreadBps) failures.push("wide_spread");
  if (idea.marketPriceBps < thresholds.minPriceBps || idea.marketPriceBps > thresholds.maxPriceBps) failures.push("outside_price_band");
  return failures;
}

export function classifySportsCallStatus(idea: Pick<SportsPredictionIdea, "edgeBps" | "confidenceBps" | "marketPriceBps" | "agentProbabilityBps" | "snapshot" | "riskLevel">, thresholds = sportsThresholds()): SportsCallStatus {
  const wideSpread = idea.snapshot.spreadBps > thresholds.maxSpreadBps;
  const highProbability = isHighProbabilitySportsCall(idea);
  if (!wideSpread && highProbability && idea.confidenceBps >= sportsHighProbabilityMinConfidenceBps() && idea.edgeBps >= sportsHighProbabilityMinEdgeBps()) {
    if (idea.confidenceBps >= thresholds.minConfidenceBps && idea.riskLevel !== "high") return "strong_call";
    return "lean_call";
  }
  if (idea.edgeBps <= 0) return "high_risk_call";
  if (!wideSpread && idea.edgeBps >= thresholds.minEdgeBps && idea.confidenceBps >= thresholds.minConfidenceBps && idea.riskLevel !== "high") return "strong_call";
  if (!wideSpread && (idea.confidenceBps >= 4_000 || idea.edgeBps >= 200)) return "lean_call";
  return "high_risk_call";
}

export function sportsStatusReason(status: SportsCallStatus, failures: string[]) {
  if (status === "strong_call") return "Strong sports live call: high-probability outcome, confidence, spread, and risk passed configured gates; edge may be small by design.";
  if (status === "lean_call") return failures.length ? `Lean sports live call: useful high-probability or moderate-edge call below at least one strong gate (${failures.join(", ")}).` : "Lean sports live call: selected side is clear but conviction is moderate.";
  if (status === "high_risk_call") return failures.length ? `High-risk sports live call: selected side exists, but risk is elevated (${failures.join(", ")}).` : "High-risk sports live call: selected side exists, but evidence or confidence is limited.";
  return failures.length ? `High-risk sports live call: selected side exists, but no playable edge or evidence quality is too weak (${failures.join(", ")}).` : "High-risk sports live call: selected side exists, but no playable edge was found from the supplied evidence.";
}

export function sportsVerdictForStatus(status: SportsCallStatus, idea: Pick<SportsPredictionIdea, "selectedOption" | "edgeBps" | "confidenceBps" | "riskLevel">) {
  if (status === "strong_call") return `AI prediction: ${idea.selectedOption}. High-probability strong call with ${idea.edgeBps} bps edge and ${idea.confidenceBps} bps confidence. Not financial advice.`;
  if (status === "lean_call") return `AI leans: ${idea.selectedOption}. High-potential or moderate-conviction call; useful market intelligence, not a guaranteed outcome.`;
  if (status === "high_risk_call") return `AI leans: ${idea.selectedOption}, but this is high risk due to weaker confidence, evidence, or market conditions.`;
  return `AI leans: ${idea.selectedOption}, but this is high risk because the reviewed side did not show enough playable edge from supplied evidence.`;
}

export function passesSportsThresholds(idea: Pick<SportsPredictionIdea, "edgeBps" | "confidenceBps" | "marketPriceBps" | "agentProbabilityBps" | "snapshot" | "riskLevel">, thresholds = sportsThresholds()) {
  return classifySportsCallStatus(idea, thresholds) === "strong_call";
}

function riskLevelFor(input: { confidenceBps: number; edgeBps: number; marketPriceBps: number; spreadBps: number }): SportsRiskLevel {
  const highProbabilityBand = input.marketPriceBps >= sportsHighProbabilityMinPriceBps() && input.marketPriceBps <= sportsHighProbabilityMaxPriceBps();
  if (highProbabilityBand && input.confidenceBps >= 6_200 && input.spreadBps <= 180) return "low";
  if (highProbabilityBand && input.confidenceBps >= sportsHighProbabilityMinConfidenceBps() && input.spreadBps <= 300) return "medium";
  if (input.confidenceBps >= 6_700 && input.edgeBps >= 700 && input.spreadBps <= 150 && input.marketPriceBps >= 2_000 && input.marketPriceBps <= 7_500) return "low";
  if (input.confidenceBps >= 5_500 && input.edgeBps >= 450 && input.spreadBps <= 300) return "medium";
  return "high";
}

function selectHighProbabilityOutcomeIndex(market: PolymarketMarket, outcomeIndexes: number[], grouped: Map<number, SportsVote[]>, fallbackOutcomeIndex: number) {
  const candidates = outcomeIndexes.length ? outcomeIndexes : [fallbackOutcomeIndex];
  const preferred = [...candidates].sort((left, right) => highProbabilityOutcomeScore(market, right, grouped) - highProbabilityOutcomeScore(market, left, grouped) || outcomePriceBps(market, right) - outcomePriceBps(market, left) || left - right)[0] ?? fallbackOutcomeIndex;
  return highProbabilityPriceScore(outcomePriceBps(market, preferred)) > 0 ? preferred : fallbackOutcomeIndex;
}

function highProbabilityOutcomeScore(market: PolymarketMarket, outcomeIndex: number, grouped: Map<number, SportsVote[]>) {
  const marketPriceBps = outcomePriceBps(market, outcomeIndex);
  const votes = grouped.get(outcomeIndex) || [];
  const totalWeight = votes.reduce((sum, vote) => sum + Math.max(1, vote.confidenceBps), 0);
  const averageAgentProbabilityBps = totalWeight > 0
    ? votes.reduce((sum, vote) => sum + vote.agentProbabilityBps * Math.max(1, vote.confidenceBps), 0) / totalWeight
    : marketPriceBps;
  const supportBps = clampBps(totalWeight / Math.max(1, 5));
  const priceBandBonus = highProbabilityPriceScore(marketPriceBps) * 100;
  return marketPriceBps * 0.58 + averageAgentProbabilityBps * 0.30 + supportBps * 0.12 + priceBandBonus;
}

function calibrateHighProbabilityBps(marketPriceBps: number, agentProbabilityBps: number) {
  const blended = marketPriceBps * 0.62 + agentProbabilityBps * 0.38;
  const highProbabilityBand = marketPriceBps >= sportsHighProbabilityMinPriceBps() && marketPriceBps <= sportsHighProbabilityMaxPriceBps();
  const gentleFavoriteLift = highProbabilityBand && agentProbabilityBps >= marketPriceBps ? Math.min(175, Math.max(0, agentProbabilityBps - marketPriceBps) * 0.25) : 0;
  return clampBps(blended + gentleFavoriteLift);
}

function isHighProbabilitySportsCall(idea: Pick<SportsPredictionIdea, "marketPriceBps" | "agentProbabilityBps">) {
  return idea.marketPriceBps >= sportsHighProbabilityMinPriceBps()
    && idea.marketPriceBps <= sportsHighProbabilityMaxPriceBps()
    && idea.agentProbabilityBps >= sportsTargetHitRateBps();
}

function summarizeEvidence(evidence: EvidenceItemInput[], sourceTypes: string[]) {
  const item = evidence.find((entry) => sourceTypes.includes(entry.sourceType));
  if (!item) return "No independent form, injury, or matchup feed was available beyond Polymarket market text and price data; treat this as market/evidence-limited.";
  return `${item.title}: ${item.excerpt}`.slice(0, 1_000);
}
