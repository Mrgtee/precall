import { numberEnv, optionalEnv } from "./env";
import { clampBps } from "./scoring";
import type { EvidenceItemInput, OutcomeSnapshot, PolymarketMarket, SportsPredictionIdea, SportsRiskLevel, SportsVote } from "./types";

export type SportsCategory = "soccer" | "nba" | "mlb" | "nhl" | "ufc" | "football" | "esports" | "other_sports";
export type SportsMarketKind = "over_under" | "spread" | "moneyline" | "team_win" | "draw" | "double_chance" | "outright" | "other";

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

const SPORTS_PATTERNS = [
  /\b(nba|wnba|mlb|nhl|nfl|ufc|ucl|atp|wta|ipl|mma|cs2|lol)\b/,
  /\b(champions league|premier league|la liga|serie a|bundesliga|ligue 1|world cup|soccer|football|basketball|baseball|hockey|tennis|golf|cricket|rugby|boxing|dota|counter-strike|league of legends|valorant)\b/,
  /\b(epl|ere|nba|mlb|nhl|nfl|ufc|atp|wta|lol|dota2|cs2|cricipl)-[a-z0-9-]+/,
  /\b(afc|fc|united|city|hotspur|ajax|inter|madrid|barcelona|arsenal|chelsea|liverpool|tottenham|brighton|everton|west ham|newcastle|aston villa)\b/,
];

const NON_SPORTS_FALSE_POSITIVE_PATTERNS = [
  /\b(president|nomination|election|congress|senate|iran|israel|hezbollah|uranium|nuclear|ceasefire|peace deal|invasion|tariff|fed|bitcoin|wti|oil)\b/,
];

function lowerMarketText(market: PolymarketMarket) {
  return `${market.title} ${market.slug} ${market.description} ${market.outcomes.join(" ")}`.toLowerCase();
}

export function classifySportsMarket(market: PolymarketMarket): SportsMarketClassification {
  const text = lowerMarketText(market);
  const reasons: string[] = [];
  const hasSportsSignal = SPORTS_PATTERNS.some((pattern) => pattern.test(text));
  const hasFalsePositiveSignal = NON_SPORTS_FALSE_POSITIVE_PATTERNS.some((pattern) => pattern.test(text));
  const hasExplicitCompetitionSignal = /\b(nba|wnba|mlb|nhl|nfl|ufc|ucl|atp|wta|ipl|fifa|world cup|premier league|champions league|la liga|serie a|bundesliga|ligue 1)\b|\b(epl|ere|nba|mlb|nhl|nfl|ufc|atp|wta|lol|dota2|cs2|cricipl)-/.test(text);
  const isSports = hasSportsSignal && (!hasFalsePositiveSignal || hasExplicitCompetitionSignal);
  if (!isSports) reasons.push("not_sports");

  let category: SportsCategory | "unknown" = "unknown";
  if (/\b(nba|wnba|basketball)\b/.test(text)) category = "nba";
  else if (/\b(mlb|baseball)\b/.test(text)) category = "mlb";
  else if (/\b(nhl|hockey)\b/.test(text)) category = "nhl";
  else if (/\b(ufc|mma|boxing)\b/.test(text)) category = "ufc";
  else if (/\b(nfl)\b/.test(text)) category = "football";
  else if (/\b(soccer|ucl|champions league|epl|ere|premier league|la liga|serie a|bundesliga|ligue 1|fifa|world cup|afc|fc|united|city|hotspur|ajax|inter)\b/.test(text)) category = "soccer";
  else if (/\b(dota|counter-strike|cs2|league of legends|lol|valorant)\b/.test(text)) category = "esports";
  else if (/\b(cricket|ipl|rugby|golf|atp|wta|tennis)\b/.test(text)) category = "other_sports";
  else if (/\bfootball\b/.test(text)) category = "football";
  else if (isSports) category = "other_sports";

  let marketKind: SportsMarketKind = "other";
  if (/over\/under|over under|total goals|\bo\/u\b|over [0-9]+\.?[0-9]?|under [0-9]+\.?[0-9]?/.test(text)) marketKind = "over_under";
  else if (/spread|\(-?\d+\.?\d?\)|\+\d+\.?\d?/.test(text)) marketKind = "spread";
  else if (/double chance/.test(text)) marketKind = "double_chance";
  else if (/\bdraw\b/.test(text)) marketKind = "draw";
  else if (/winner|wins?|beat|defeat|vs\.| vs |moneyline/.test(text)) marketKind = "moneyline";
  else if (/will .* win/.test(text)) marketKind = "team_win";
  else if (/champion|finals|world cup|conference|division|nomination/.test(text)) marketKind = "outright";

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
  };
}

export function sportsEnabled() {
  return optionalEnv("ENABLE_SPORTS_EDGE", "true") !== "false";
}

export function sportsDiscoveryLimit() {
  return numberEnv("SPORTS_DISCOVERY_MARKET_LIMIT", 250);
}

export function sportsDailyTarget() {
  return numberEnv("SPORTS_DAILY_TARGET", 5);
}

export function maxSportsAnalyzedPerRun() {
  return numberEnv("MAX_SPORTS_ANALYZED_PER_RUN", 16);
}

export function sportsWatchlistLimit() {
  return numberEnv("SPORTS_WATCHLIST_LIMIT", 5);
}

function validOutcomeIndexes(market: PolymarketMarket, thresholds: SportsThresholds) {
  return market.outcomePrices
    .map((price, index) => ({ priceBps: Math.round(price * 10_000), index }))
    .filter((item) => item.priceBps >= thresholds.minPriceBps && item.priceBps <= thresholds.maxPriceBps)
    .map((item) => item.index);
}

export function sportsEventTime(market: PolymarketMarket): string | null {
  const text = `${market.title} ${market.slug} ${market.url}`;
  const match = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (!match?.[1]) return market.closeTime;
  const close = market.closeTime ? new Date(market.closeTime) : undefined;
  const hour = close && Number.isFinite(close.getTime()) ? close.getUTCHours() : 12;
  const minute = close && Number.isFinite(close.getTime()) ? close.getUTCMinutes() : 0;
  return `${match[1]}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
}

function closeTimeScore(market: PolymarketMarket, now: Date, lookaheadHours: number) {
  const eventTime = sportsEventTime(market);
  if (!eventTime) return { ok: false, score: 0, reason: "missing_close_time" };
  const eventMs = new Date(eventTime).getTime();
  if (!Number.isFinite(eventMs)) return { ok: false, score: 0, reason: "expired" };
  const closeMs = market.closeTime ? new Date(market.closeTime).getTime() : Number.NaN;
  const scoreMs = eventMs <= now.getTime() && Number.isFinite(closeMs) && closeMs > now.getTime() && closeMs - eventMs <= 36 * 3_600_000
    ? closeMs
    : eventMs;
  if (scoreMs <= now.getTime()) return { ok: false, score: 0, reason: "expired" };
  const hours = (scoreMs - now.getTime()) / 3_600_000;
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
  const close = closeTimeScore(market, now, thresholds.lookaheadHours);
  if (!close.ok) reasons.push(close.reason);
  if (market.outcomes.length < 2 || market.outcomePrices.length < 2) reasons.push("missing_outcomes_or_prices");
  if (market.outcomePrices.some((price) => !Number.isFinite(price) || price < 0 || price > 1)) reasons.push("invalid_prices");
  if (market.liquidityUsd < thresholds.minLiquidityUsd) reasons.push("low_liquidity");
  const outcomeIndexes = validOutcomeIndexes(market, thresholds);
  if (outcomeIndexes.length === 0) reasons.push("no_reasonable_price_band");

  if (reasons.length > 0) return { eligible: false, reasons };

  const volume = logScore(market.volume24hUsd, 500_000, 25);
  const liquidity = logScore(market.liquidityUsd, 1_000_000, 25);
  const evidenceDepth = Math.min(15, (market.description.trim().length / 600) * 15);
  const outcomeDepth = Math.min(10, outcomeIndexes.length * 4);
  const kindBoost = classification.marketKind === "over_under" || classification.marketKind === "moneyline" || classification.marketKind === "spread" ? 10 : 5;
  const candidateScore = Math.round((volume + liquidity + close.score + evidenceDepth + outcomeDepth + kindBoost) * 100) / 100;

  return { eligible: true, reasons: [], candidate: { market, classification, outcomeIndexes, candidateScore } };
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

export function aggregateSportsVotes(input: { market: PolymarketMarket; snapshot: OutcomeSnapshot; category: string; marketKind: string; evidence: EvidenceItemInput[]; votes: SportsVote[] }): SportsPredictionIdea {
  const grouped = new Map<number, SportsVote[]>();
  for (const vote of input.votes) {
    if (vote.selectedOutcomeIndex < 0 || vote.selectedOutcomeIndex >= input.market.outcomes.length) continue;
    const current = grouped.get(vote.selectedOutcomeIndex) || [];
    current.push(vote);
    grouped.set(vote.selectedOutcomeIndex, current);
  }
  const [selectedOutcomeIndex, selectedVotes] = [...grouped.entries()].sort((left, right) => {
    const leftWeight = left[1].reduce((sum, vote) => sum + vote.confidenceBps, 0);
    const rightWeight = right[1].reduce((sum, vote) => sum + vote.confidenceBps, 0);
    return rightWeight - leftWeight || right[1].length - left[1].length;
  })[0] || [input.snapshot.outcomeIndex, input.votes];

  const marketPriceBps = clampBps(Math.round((input.market.outcomePrices[selectedOutcomeIndex] || 0) * 10_000));
  const totalWeight = Math.max(1, selectedVotes.reduce((sum, vote) => sum + Math.max(1, vote.confidenceBps), 0));
  const agentProbabilityBps = clampBps(selectedVotes.reduce((sum, vote) => sum + vote.agentProbabilityBps * Math.max(1, vote.confidenceBps), 0) / totalWeight);
  const confidenceBps = clampBps(selectedVotes.reduce((sum, vote) => sum + vote.confidenceBps, 0) / Math.max(1, selectedVotes.length));
  const edgeBps = Math.max(0, agentProbabilityBps - marketPriceBps);
  const selectedOption = input.market.outcomes[selectedOutcomeIndex] || `Outcome ${selectedOutcomeIndex + 1}`;
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
    verdict: edgeBps > 0 ? `${selectedOption} is a ${riskLevel}-risk value idea, not a guarantee.` : `No clear value edge after council review.`,
    evidence: input.evidence,
    votes: selectedVotes,
  };
}

export function sportsThresholdFailures(idea: Pick<SportsPredictionIdea, "edgeBps" | "confidenceBps" | "marketPriceBps" | "snapshot">, thresholds = sportsThresholds()) {
  const failures: string[] = [];
  if (idea.edgeBps < thresholds.minEdgeBps) failures.push("low_edge");
  if (idea.confidenceBps < thresholds.minConfidenceBps) failures.push("low_confidence");
  if (idea.snapshot.spreadBps > thresholds.maxSpreadBps) failures.push("wide_spread");
  if (idea.marketPriceBps < thresholds.minPriceBps || idea.marketPriceBps > thresholds.maxPriceBps) failures.push("outside_price_band");
  return failures;
}

export function passesSportsThresholds(idea: Pick<SportsPredictionIdea, "edgeBps" | "confidenceBps" | "marketPriceBps" | "snapshot">, thresholds = sportsThresholds()) {
  return sportsThresholdFailures(idea, thresholds).length === 0;
}

function riskLevelFor(input: { confidenceBps: number; edgeBps: number; marketPriceBps: number; spreadBps: number }): SportsRiskLevel {
  if (input.confidenceBps >= 6_700 && input.edgeBps >= 700 && input.spreadBps <= 150 && input.marketPriceBps >= 2_000 && input.marketPriceBps <= 7_500) return "low";
  if (input.confidenceBps >= 5_500 && input.edgeBps >= 450 && input.spreadBps <= 300) return "medium";
  return "high";
}

function summarizeEvidence(evidence: EvidenceItemInput[], sourceTypes: string[]) {
  const item = evidence.find((entry) => sourceTypes.includes(entry.sourceType));
  if (!item) return "No independent form, injury, or matchup feed was available beyond Polymarket market text and price data; treat this as market/evidence-limited.";
  return `${item.title}: ${item.excerpt}`.slice(0, 1_000);
}
