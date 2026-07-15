import { buildEvidenceContext } from "@precall/shared/evidence";
import { runAgentCouncilDetailed } from "@precall/shared/agents/council";
import { runSportsCouncilDetailed } from "@precall/shared/agents/sports-council";
import { boolEnv, numberEnv, optionalEnv, requireEnv } from "@precall/shared/env";
import { getGatewayBalancesByChain, gatewayRuntimeConfig } from "@precall/shared/circle/gateway-client";
import { externalX402EvidenceRuntimeConfig, fetchAisaX402SocialEvidence, fetchTavilyX402SearchEvidence, type X402EvidenceProviderResult } from "@precall/shared/evidence/providers/x402-provider";
import { apiFootballMatchCacheKey, fetchApiFootballEvidence, type SportsStructuredEvidenceProviderResult } from "@precall/shared/evidence/providers/api-football-provider";
import { analysisPriceSkipReason, evaluateMarketEligibility, rankMarketCandidates, scoreMarketCandidate, summarizeSkipReasons, type MarketCandidateScore } from "@precall/shared/market-eligibility";
import { publishAggregatedCallOnchain, registerAgentOnchain, resolveCallOnchain } from "@precall/shared/onchain/precall";
import {
  discoverPolymarketMarkets,
  fetchMarketSnapshot,
  fetchOutcomeSnapshot,
  fetchPolymarketResolution,
  fetchPolymarketSelectedOutcomeResolution,
  polymarketCopyUrl,
} from "@precall/shared/polymarket";
import { aggregateVotes, brierScoreBps, hashText, passesPublishThresholds, publishThresholdFailures, type PublishThresholds } from "@precall/shared/scoring";
import { aggregateSportsVotes, buildSportsEvidenceContext, classifySportsCallStatus, evaluateSportsCandidate, evaluateSportsEvidenceQuality, maxSportsAnalyzedPerRun, rankSportsCandidates, sportsDailyTarget, sportsDiscoveryLimit, sportsEnabled, sportsOnlyCategory, sportsEventTime, sportsStatusReason, sportsThresholdFailures, sportsThresholds, sportsVerdictForStatus, type SportsCallStatus, type SportsCandidate, type SportsSkip } from "@precall/shared/sports";
import type { MarketSnapshot, OutcomeSnapshot, PolymarketMarket } from "@precall/shared/types";
import {
  ensureCouncilAgent,
  ensureSportsCouncilAgent,
  getAgentRunById,
  getOpenPublishedCalls,
  getSportsPredictionsForResolution,
  insertPublishedCall,
  insertResolution,
  insertSnapshot,
  markCallResolutionFailed,
  markCallResolving,
  markExpiredCalls,
  markExpiredSportsPredictions,
  markSportsPredictionResolved,
  recordAgentRun,
  updateAgentRun,
  recordCircleAction,
  getTodayX402SpendUsdc,
  checkCircleActionsSchemaHealth,
  upsertMarket,
  upsertSportsPrediction,
} from "./repository";

export async function health() {
  const thresholds = publishThresholds();
  const sportsConfig = sportsThresholds();
  const gatewayConfig = gatewayRuntimeConfig();
  const evidenceGatewayConfig = externalX402EvidenceRuntimeConfig();
  const gatewayBalances = gatewayConfig.enabled ? await getGatewayBalancesByChain().catch((error) => [{ enabled: true, status: "failed" as const, chain: gatewayConfig.chain, gatewayAvailableUsdc: undefined, error: error instanceof Error ? error.message : String(error) }]) : [];
  const evidenceGatewayBalances = evidenceGatewayConfig.enabled ? await getGatewayBalancesByChain({ config: evidenceGatewayConfig, chains: evidenceGatewayConfig.chainCandidates }).catch((error) => [{ enabled: true, status: "failed" as const, chain: evidenceGatewayConfig.chain, gatewayAvailableUsdc: undefined, error: error instanceof Error ? error.message : String(error) }]) : [];
  const primaryGatewayBalance = gatewayBalances.find((balance) => balance.chain === gatewayConfig.chain) || gatewayBalances[0];
  const primaryEvidenceGatewayBalance = evidenceGatewayBalances.find((balance) => balance.chain === evidenceGatewayConfig.chain) || evidenceGatewayBalances[0];
  const circleActionsSchema = await checkCircleActionsSchemaHealth();
  const base = {
    worker: {
      commitSha: optionalEnv("RAILWAY_GIT_COMMIT_SHA", optionalEnv("GIT_COMMIT_SHA", "unknown")),
      schemaRepair: "0012_hosted_agent_marketplace",
    },
    databaseUrl: Boolean(process.env.DATABASE_URL),
    modelApiKey: Boolean(process.env.OPENAI_API_KEY),
    modelBaseUrl: optionalEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
    modelTimeoutMs: numberEnv("MODEL_TIMEOUT_MS", 45_000),
    modelRetryCount: numberEnv("MODEL_RETRY_COUNT", 2),
    registryAddress: Boolean(process.env.PRECALL_REGISTRY_ADDRESS),
    discovery: {
      marketLimit: discoveryMarketLimit(),
      maxAnalyzedMarkets: maxAnalyzedMarketsPerRun(),
      minAnalysisPriceBps: minAnalysisPriceBps(),
      maxAnalysisPriceBps: maxAnalysisPriceBps(),
    },
    database: {
      circleActions: circleActionsSchema,
    },
    circle: {
      gatewayX402Enabled: gatewayConfig.enabled,
      gatewayX402Required: boolEnv("REQUIRE_CIRCLE_GATEWAY_X402", false),
      gatewayChain: gatewayConfig.chain,
      x402PaymentNetworkLabel: gatewayConfig.paymentNetworkLabel,
      x402AcceptedNetworks: gatewayConfig.acceptedNetworks,
      x402FacilitatorUrl: gatewayConfig.facilitatorUrl,
      x402ProductionMode: gatewayConfig.productionMode,
      evidenceX402PaymentNetworkLabel: evidenceGatewayConfig.paymentNetworkLabel,
      evidenceX402AcceptedNetworks: evidenceGatewayConfig.acceptedNetworks,
      evidenceX402FacilitatorUrl: evidenceGatewayConfig.facilitatorUrl,
      evidenceX402ProductionMode: evidenceGatewayConfig.productionMode,
      evidenceX402ConfigWarnings: evidenceGatewayConfig.configWarnings,
      evidenceX402ConfigErrors: evidenceGatewayConfig.configErrors,
      evidenceGatewayBalanceStatus: primaryEvidenceGatewayBalance?.status,
      evidenceGatewayAvailableUsdc: primaryEvidenceGatewayBalance?.gatewayAvailableUsdc,
      evidenceGatewayBalancesByChain: evidenceGatewayBalances.map((balance) => ({ chain: balance.chain, status: balance.status, gatewayAvailableUsdc: balance.gatewayAvailableUsdc, error: balance.error })),
      x402ConfigWarnings: gatewayConfig.configWarnings,
      x402ConfigErrors: gatewayConfig.configErrors,
      x402ChainCandidates: gatewayConfig.chainCandidates,
      gatewayWalletConfigured: Boolean(gatewayConfig.privateKey),
      allowedHosts: gatewayConfig.allowedHosts,
      maxPaymentUsdc: gatewayConfig.maxPaymentUsdc,
      dailyBudgetUsdc: gatewayConfig.dailyBudgetUsdc,
      minGatewayBalanceUsdc: gatewayConfig.minGatewayBalanceUsdc,
      gatewayBalanceStatus: primaryGatewayBalance?.status || "disabled",
      gatewayAvailableUsdc: primaryGatewayBalance && "gatewayAvailableUsdc" in primaryGatewayBalance ? primaryGatewayBalance.gatewayAvailableUsdc : undefined,
      gatewayBalancesByChain: gatewayBalances.map((balance) => ({
        chain: balance.chain,
        status: balance.status,
        gatewayAvailableUsdc: "gatewayAvailableUsdc" in balance ? balance.gatewayAvailableUsdc : undefined,
        error: balance.error,
      })),
      gatewayError: primaryGatewayBalance?.error,
    },
    thresholds,
    sportsLiveCalls: {
      enabled: sportsEnabled(),
      discoveryLimit: sportsDiscoveryLimit(),
      dailyTarget: sportsDailyTarget(),
      maxAnalyzedMarkets: maxSportsAnalyzedPerRun(),
      thresholds: sportsConfig,
    },
  };

  let markets;
  try {
    markets = await discoverPolymarketMarkets(25);
  } catch (error) {
    return {
      ok: false,
      polymarket: {
        discoveredActiveUnexpired: 0,
        sampled: 0,
        eligibleStrictYesNo: 0,
        skippedByReason: {},
        error: error instanceof Error ? error.message : String(error),
      },
      ...base,
    };
  }

  const sampled = markets.slice(0, 8);
  const checked = [];

  for (const market of sampled) {
    try {
      const snapshot = await fetchMarketSnapshot(market);
      const eligibility = evaluateMarketEligibility(market, { snapshot, thresholds });
      checked.push({ marketId: market.marketId, title: market.title, eligible: eligibility.eligible, reasons: eligibility.reasons });
    } catch (error) {
      checked.push({ marketId: market.marketId, title: market.title, eligible: false, reasons: ["snapshot_failed"], error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    ok: true,
    polymarket: {
      discoveredActiveUnexpired: markets.length,
      sampled: checked.length,
      eligibleStrictYesNo: checked.filter((item) => item.eligible).length,
      skippedByReason: summarizeSkipReasons(checked.filter((item) => !item.eligible).map((item) => ({ reasons: item.reasons }))),
    },
    ...base,
  };
}

function publishThresholds(): PublishThresholds {
  return {
    minLiquidityUsd: numberEnv("MIN_LIQUIDITY_USD", 10_000),
    minEdgeBps: numberEnv("MIN_EDGE_BPS", 650),
    maxSpreadBps: numberEnv("MAX_SPREAD_BPS", 900),
    minConfidenceBps: numberEnv("MIN_CONFIDENCE_BPS", 5200),
    minSuggestedSizeBps: numberEnv("MIN_SUGGESTED_SIZE_BPS", 100),
  };
}

function discoveryMarketLimit() {
  return numberEnv("DISCOVERY_MARKET_LIMIT", 150);
}

function maxAnalyzedMarketsPerRun() {
  return numberEnv("MAX_ANALYZED_MARKETS_PER_RUN", 8);
}

function minAnalysisPriceBps() {
  return numberEnv("MIN_ANALYSIS_PRICE_BPS", 100);
}

function maxAnalysisPriceBps() {
  return numberEnv("MAX_ANALYSIS_PRICE_BPS", 9_900);
}

type RunSkippedMarket = {
  marketId: string;
  title: string;
  reasons: string[];
  url?: string | undefined;
  liquidityUsd?: number | undefined;
  volume24hUsd?: number | undefined;
  closeTime?: string | null | undefined;
  spreadBps?: number | null | undefined;
  yesPriceBps?: number | null | undefined;
  candidateScore?: number | undefined;
  edgeBps?: number | undefined;
  confidenceBps?: number | undefined;
  suggestedSizeBps?: number | undefined;
};

type RunFailedMarket = {
  marketId: string;
  title: string;
  stage: string;
  error: string;
};

type RankedDiscoveryCandidate = {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  candidateScore: MarketCandidateScore;
};

function candidateSummary(candidate: RankedDiscoveryCandidate) {
  return {
    marketId: candidate.market.marketId,
    title: candidate.market.title,
    url: candidate.market.url,
    candidateScore: candidate.candidateScore.score,
    spreadBps: candidate.snapshot.spreadBps,
    liquidityUsd: candidate.market.liquidityUsd,
    volume24hUsd: candidate.market.volume24hUsd,
    closeTime: candidate.market.closeTime,
    yesPriceBps: candidate.snapshot.yesPriceBps,
    descriptionLength: candidate.candidateScore.descriptionLength,
  };
}

function sportsCandidateSummary(candidate: SportsCandidate): Omit<SportsSkip, "reasons"> {
  return {
    marketId: candidate.market.marketId,
    title: candidate.market.title,
    url: candidate.market.url,
    category: candidate.classification.category,
    marketKind: candidate.classification.marketKind,
    liquidityUsd: candidate.market.liquidityUsd,
    volume24hUsd: candidate.market.volume24hUsd,
    closeTime: candidate.market.closeTime,
    candidateScore: candidate.candidateScore,
  };
}

function sportsRejectedSummary(market: PolymarketMarket, reasons: string[]): SportsSkip {
  return {
    marketId: market.marketId,
    title: market.title,
    reasons,
    url: market.url,
    liquidityUsd: market.liquidityUsd,
    volume24hUsd: market.volume24hUsd,
    closeTime: market.closeTime,
  };
}

function provisionalSportsOutcomeIndex(candidate: SportsCandidate) {
  return candidate.outcomeIndexes
    .map((index) => ({ index, distance: Math.abs(Math.round((candidate.market.outcomePrices[index] || 0) * 10_000) - 5_000) }))
    .sort((left, right) => left.distance - right.distance)[0]?.index ?? candidate.outcomeIndexes[0] ?? 0;
}

function marketSnapshotFromOutcome(snapshot: OutcomeSnapshot): MarketSnapshot {
  return {
    marketId: snapshot.marketId,
    yesPriceBps: snapshot.priceBps,
    noPriceBps: snapshot.complementPriceBps,
    spreadBps: snapshot.spreadBps,
    depthUsd: snapshot.depthUsd,
    capturedAt: snapshot.capturedAt,
  };
}

function rejectedSummary(market: PolymarketMarket, reasons: string[], snapshot: MarketSnapshot | undefined, candidateScore: MarketCandidateScore): RunSkippedMarket {
  return {
    marketId: market.marketId,
    title: market.title,
    reasons,
    url: market.url,
    liquidityUsd: market.liquidityUsd,
    volume24hUsd: market.volume24hUsd,
    closeTime: market.closeTime,
    spreadBps: snapshot?.spreadBps ?? candidateScore.spreadBps,
    yesPriceBps: snapshot?.yesPriceBps ?? candidateScore.yesPriceBps,
    candidateScore: candidateScore.score,
  };
}

async function discoverRankedMarketPool(input: { thresholds: PublishThresholds; discoveryLimit: number; topLimit: number; minAnalysisPriceBps?: number; maxAnalysisPriceBps?: number }) {
  const markets = await discoverPolymarketMarkets(input.discoveryLimit);
  const skipped: RunSkippedMarket[] = [];
  const failed: RunFailedMarket[] = [];
  const rejected: RunSkippedMarket[] = [];
  const snapshotCandidates: { market: PolymarketMarket; snapshot: MarketSnapshot }[] = [];

  for (const market of markets) {
    try {
      await upsertMarket(market);
    } catch (error) {
      failed.push({ marketId: market.marketId, title: market.title, stage: "market_upsert", error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const preliminary = evaluateMarketEligibility(market, { thresholds: input.thresholds });
    if (!preliminary.eligible) {
      const summary = rejectedSummary(market, preliminary.reasons, undefined, scoreMarketCandidate(market));
      skipped.push(summary);
      rejected.push(summary);
      continue;
    }

    let snapshot: MarketSnapshot;
    try {
      snapshot = await fetchMarketSnapshot(market);
      await insertSnapshot(snapshot);
    } catch (error) {
      failed.push({ marketId: market.marketId, title: market.title, stage: "snapshot", error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const eligibility = evaluateMarketEligibility(market, { snapshot, thresholds: input.thresholds });
    if (!eligibility.eligible) {
      const summary = rejectedSummary(market, eligibility.reasons, snapshot, scoreMarketCandidate(market, snapshot));
      skipped.push(summary);
      rejected.push(summary);
      continue;
    }

    const priceReasons = analysisPriceSkipReason(snapshot, input.minAnalysisPriceBps, input.maxAnalysisPriceBps);
    if (priceReasons.length > 0) {
      const summary = rejectedSummary(market, priceReasons, snapshot, scoreMarketCandidate(market, snapshot));
      skipped.push(summary);
      rejected.push(summary);
      continue;
    }

    snapshotCandidates.push({ market, snapshot });
  }

  const eligibleCandidates = rankMarketCandidates(snapshotCandidates) as RankedDiscoveryCandidate[];
  const topRejectedMarkets = rejected
    .sort((left, right) => (right.candidateScore || 0) - (left.candidateScore || 0) || (right.liquidityUsd || 0) - (left.liquidityUsd || 0))
    .slice(0, 10);
  const topEligibleCandidates = eligibleCandidates.slice(0, input.topLimit).map(candidateSummary);

  return {
    discoveryLimit: input.discoveryLimit,
    discovered: markets.length,
    checked: markets.length,
    eligibleCandidates,
    skipped,
    failed,
    topRejectedMarkets,
    topEligibleCandidates,
  };
}

export async function discover() {
  const thresholds = publishThresholds();
  const discovery = await discoverRankedMarketPool({
    thresholds,
    discoveryLimit: discoveryMarketLimit(),
    topLimit: maxAnalyzedMarketsPerRun(),
    minAnalysisPriceBps: minAnalysisPriceBps(),
    maxAnalysisPriceBps: maxAnalysisPriceBps(),
  });

  return {
    discoveryLimit: discovery.discoveryLimit,
    maxAnalyzedMarkets: maxAnalyzedMarketsPerRun(),
    minAnalysisPriceBps: minAnalysisPriceBps(),
    maxAnalysisPriceBps: maxAnalysisPriceBps(),
    discovered: discovery.discovered,
    checked: discovery.checked,
    eligible: discovery.eligibleCandidates.length,
    skipped: discovery.skipped,
    failed: discovery.failed,
    skippedByReason: summarizeSkipReasons(discovery.skipped),
    topRejectedMarkets: discovery.topRejectedMarkets,
    topEligibleCandidates: discovery.topEligibleCandidates,
  };
}

export async function registerCouncilAgent() {
  const result = await registerAgentOnchain({ name: "Precall Council", metadataUri: "https://precall.arena/agents/precall-council" });
  return { message: "Registered Precall Council on Arc. Set DEFAULT_ONCHAIN_AGENT_ID to this value.", ...result };
}

function shouldRecordX402(result: X402EvidenceProviderResult | undefined) {
  return Boolean(result && result.status !== "disabled");
}

async function recordX402CircleAction(input: { result: X402EvidenceProviderResult; marketId: string; agentRunId?: number | undefined }) {
  if (!shouldRecordX402(input.result)) return;
  await recordCircleAction({
    actionType: "x402_api_payment",
    provider: input.result.provider,
    url: input.result.url,
    amountUsdc: input.result.paymentAmountUsdc || "0",
    chain: input.result.selectedChain || input.result.paymentNetwork || optionalEnv("CIRCLE_GATEWAY_CHAIN", "arcTestnet"),
    paymentRef: input.result.paymentRef,
    txHash: input.result.txHash,
    relatedMarketId: input.marketId,
    relatedAgentRunId: input.agentRunId,
    status: input.result.status === "success" ? "success" : input.result.status,
    error: input.result.error,
    metadata: {
      evidenceCount: input.result.evidence.length,
      selectedChain: input.result.selectedChain,
      paymentNetwork: input.result.paymentNetwork,
      supportChecks: input.result.supportChecks,
      failureReason: input.result.failureReason,
    },
  });
}

function addUsdc(left: string | number, right: string | number | undefined) {
  const total = Number(left || 0) + Number(right || 0);
  return Number.isFinite(total) ? total.toFixed(6) : String(left);
}

function x402Summary(result: X402EvidenceProviderResult | undefined) {
  if (!result) return { enabled: false, status: "not_attempted" };
  return {
    enabled: result.enabled,
    provider: result.provider,
    status: result.status,
    selectedChain: result.selectedChain,
    paymentNetwork: result.paymentNetwork,
    paymentAmountUsdc: result.paymentAmountUsdc,
    supportChecks: result.supportChecks,
    failureReason: result.failureReason,
    error: result.error,
    evidenceCount: result.evidence.length,
  };
}

function structuredEvidenceSummary(result: SportsStructuredEvidenceProviderResult | undefined) {
  if (!result) return { enabled: false, status: "not_attempted", evidenceCount: 0 };
  return {
    enabled: result.enabled,
    provider: result.provider,
    status: result.status,
    evidenceCount: result.evidence.length,
    fixtureId: result.fixtureId,
    teams: result.teams,
    failureReason: result.failureReason,
    error: result.error,
  };
}

function cloneStructuredEvidenceForMarket(result: SportsStructuredEvidenceProviderResult, market: PolymarketMarket): SportsStructuredEvidenceProviderResult {
  return {
    ...result,
    evidence: result.evidence.map((item) => ({
      ...item,
      metadata: {
        ...(item.metadata || {}),
        marketId: market.marketId,
      },
    })),
  };
}

function createStructuredEvidenceFetcher() {
  const cache = new Map<string, Promise<SportsStructuredEvidenceProviderResult>>();
  return {
    cache,
    async fetch(market: PolymarketMarket) {
      const key = apiFootballMatchCacheKey(market);
      let cached = cache.get(key);
      if (!cached) {
        cached = fetchApiFootballEvidence({ market }).catch((error) => {
          cache.delete(key);
          throw error;
        });
        cache.set(key, cached);
      }
      return cloneStructuredEvidenceForMarket(await cached, market);
    },
  };
}

export async function runOnce() {
  requireEnv("OPENAI_API_KEY");
  const publishOnchain = boolEnv("PUBLISH_ONCHAIN", true);
  const discoveryLimit = discoveryMarketLimit();
  const maxAnalyzedMarkets = maxAnalyzedMarketsPerRun();
  const bondAmount = optionalEnv("BOND_AMOUNT_USDC", "0");
  const unlockPrice = optionalEnv("UNLOCK_PRICE_USDC", "0.05");
  const thresholds = publishThresholds();
  const registryAddress = optionalEnv("PRECALL_REGISTRY_ADDRESS", "");
  const requireX402 = boolEnv("REQUIRE_CIRCLE_GATEWAY_X402", false);
  const gatewayConfig = gatewayRuntimeConfig();
  if (requireX402 && !gatewayConfig.enabled) {
    throw new Error("REQUIRE_CIRCLE_GATEWAY_X402=true but ENABLE_CIRCLE_GATEWAY_X402 is not enabled on the worker.");
  }
  if (requireX402 && !gatewayConfig.privateKey) {
    throw new Error("REQUIRE_CIRCLE_GATEWAY_X402=true but CIRCLE_AGENT_PRIVATE_KEY is missing on the worker.");
  }
  if (requireX402 && gatewayConfig.allowedHosts.length === 0) {
    throw new Error("REQUIRE_CIRCLE_GATEWAY_X402=true but CIRCLE_X402_ALLOWED_HOSTS is empty.");
  }
  const onchainAgentId = Number(optionalEnv("DEFAULT_ONCHAIN_AGENT_ID", "0"));
  if (publishOnchain && (!Number.isFinite(onchainAgentId) || onchainAgentId <= 0)) {
    throw new Error("DEFAULT_ONCHAIN_AGENT_ID is required when PUBLISH_ONCHAIN=true. Run `npm run worker -- register-agent` first.");
  }

  const council = await ensureCouncilAgent({
    onchainAgentId: onchainAgentId || undefined,
    ownerWallet: optionalEnv("AGENT_OWNER_WALLET", "0x0000000000000000000000000000000000000000"),
  });

  const discovery = await discoverRankedMarketPool({
    thresholds,
    discoveryLimit,
    topLimit: maxAnalyzedMarkets,
    minAnalysisPriceBps: minAnalysisPriceBps(),
    maxAnalysisPriceBps: maxAnalysisPriceBps(),
  });
  let dailyX402SpendUsdc = await getTodayX402SpendUsdc();
  const published = [];
  const skipped: RunSkippedMarket[] = [...discovery.skipped];
  const failed: RunFailedMarket[] = [...discovery.failed];
  const candidatesForAnalysis = discovery.eligibleCandidates.slice(0, maxAnalyzedMarkets);
  const analysisLimited = discovery.eligibleCandidates.slice(maxAnalyzedMarkets);
  for (const candidate of analysisLimited) {
    skipped.push({ ...candidateSummary(candidate), reasons: ["analysis_limit"] });
  }
  let analyzed = 0;

  for (const candidate of candidatesForAnalysis) {
    const { market, snapshot } = candidate;
    analyzed += 1;

    let x402Result: X402EvidenceProviderResult | undefined;
    let aisaResult: X402EvidenceProviderResult | undefined;
    let tavilyResult: X402EvidenceProviderResult | undefined;
    try {
      const [aisaRes, tavilyRes] = await Promise.all([
        fetchAisaX402SocialEvidence({ market, snapshot, dailySpendUsdc: dailyX402SpendUsdc }),
        fetchTavilyX402SearchEvidence({ market, dailySpendUsdc: dailyX402SpendUsdc }),
      ]);
      aisaResult = aisaRes;
      tavilyResult = tavilyRes;

      if (aisaResult.status === "success") dailyX402SpendUsdc = addUsdc(dailyX402SpendUsdc, aisaResult.paymentAmountUsdc);
      if (tavilyResult.status === "success") dailyX402SpendUsdc = addUsdc(dailyX402SpendUsdc, tavilyResult.paymentAmountUsdc);

      x402Result = {
        enabled: aisaResult.enabled || tavilyResult.enabled,
        provider: "combined_aisa_tavily",
        status: (aisaResult.status === "success" || tavilyResult.status === "success") ? "success" : aisaResult.status,
        evidence: [...aisaResult.evidence, ...tavilyResult.evidence],
        paymentAmountUsdc: addUsdc(aisaResult.paymentAmountUsdc || "0", tavilyResult.paymentAmountUsdc || "0"),
        paymentNetwork: aisaResult.paymentNetwork || tavilyResult.paymentNetwork,
        selectedChain: aisaResult.selectedChain || tavilyResult.selectedChain,
        supportChecks: [...(aisaResult.supportChecks || []), ...(tavilyResult.supportChecks || [])],
        failureReason: aisaResult.failureReason || tavilyResult.failureReason,
        paymentRef: aisaResult.paymentRef || tavilyResult.paymentRef,
        txHash: aisaResult.txHash || tavilyResult.txHash,
        error: aisaResult.error || tavilyResult.error,
      };

      if (requireX402 && (x402Result.status !== "success" || x402Result.evidence.length === 0)) {
        const failure = x402Result.error || `Required Gateway/x402 evidence failed with status ${x402Result.status}.`;
        const failedRun = await recordAgentRun({
          status: "failed_x402_required",
          model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
          inputs: { market, snapshot, requireX402: true, candidateScore: candidate.candidateScore, x402: x402Summary(x402Result) },
          failure,
        });
        await recordX402CircleAction({ result: aisaResult, marketId: market.marketId, agentRunId: failedRun?.id });
        await recordX402CircleAction({ result: tavilyResult, marketId: market.marketId, agentRunId: failedRun?.id });
        failed.push({ marketId: market.marketId, title: market.title, stage: "x402_required", error: failure });
        continue;
      }
      const evidenceContext = buildEvidenceContext({ market, snapshot, x402: x402Result });
      const councilResult = await runAgentCouncilDetailed({ market, snapshot, evidence: evidenceContext });
      const call = aggregateVotes(market, snapshot, councilResult.votes, evidenceContext);
      const thresholdFailures = publishThresholdFailures(call, thresholds);
      const publishable = thresholdFailures.length === 0;
      const candidateRun = await recordAgentRun({
        status: publishable ? "candidate" : "filtered",
        model: councilResult.model,
        inputs: { market, snapshot, thresholds, candidateScore: candidate.candidateScore, evidenceIds: evidenceContext.map((item) => item.evidenceId), x402: x402Summary(x402Result) },
        outputs: { call, votes: councilResult.votes, failures: councilResult.failures, thresholdFailures, x402: x402Summary(x402Result) },
        evidenceContext,
        retryCount: councilResult.votes.reduce((sum, vote) => sum + (vote.retryCount || 0), 0),
        latencyMs: councilResult.totalLatencyMs,
      });

      if (aisaResult) await recordX402CircleAction({ result: aisaResult, marketId: market.marketId, agentRunId: candidateRun?.id });
      if (tavilyResult) await recordX402CircleAction({ result: tavilyResult, marketId: market.marketId, agentRunId: candidateRun?.id });

      if (!publishable) {
        skipped.push({
          ...candidateSummary(candidate),
          reasons: thresholdFailures,
          edgeBps: call.edgeBps,
          confidenceBps: call.confidenceBps,
          suggestedSizeBps: call.suggestedSizeBps,
        });
        continue;
      }

      let txHash: string | undefined;
      let onchainCallId: number | undefined;
      if (publishOnchain) {
        const onchain = await publishAggregatedCallOnchain({ call, onchainAgentId: BigInt(onchainAgentId), bondAmountUsdc: bondAmount, unlockPriceUsdc: unlockPrice });
        txHash = onchain.txHash;
        onchainCallId = onchain.onchainCallId ? Number(onchain.onchainCallId) : undefined;
      }

      const row = await insertPublishedCall({
        agentId: council.id,
        onchainCallId,
        txHash,
        registryAddress,
        call,
        bondAmount,
        unlockPrice,
        copyUrl: polymarketCopyUrl(market),
      });

      if (txHash) {
        await recordCircleAction({
          actionType: "arc_bond",
          walletAddress: optionalEnv("AGENT_OWNER_WALLET", ""),
          amount: bondAmount,
          chain: "Arc Testnet",
          txHash,
          relatedCallId: row.id,
          status: "success",
          metadata: { onchainCallId, registryAddress },
        });
      }

      if (candidateRun) {
        await updateAgentRun(candidateRun.id, {
          status: "published",
          publishedCallId: row.id,
          outputs: {
            call,
            votes: councilResult.votes,
            failures: councilResult.failures,
            thresholdFailures,
            x402: x402Summary(x402Result),
            thesisHash: hashText(call.thesis),
            evidenceHash: hashText(JSON.stringify(call.evidence)),
          },
        });
      }
      published.push({ id: row.id, onchainCallId, market: market.title, txHash, edgeBps: call.edgeBps, confidenceBps: call.confidenceBps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedRun = await recordAgentRun({ status: "failed", model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"), inputs: { market, snapshot, candidateScore: candidate.candidateScore, x402: x402Summary(x402Result) }, failure: message });
      if (x402Result) await recordX402CircleAction({ result: x402Result, marketId: market.marketId, agentRunId: failedRun?.id });
      failed.push({ marketId: market.marketId, title: market.title, stage: "analysis_or_publish", error: message });
      continue;
    }
  }

  let resolutionUpdate: unknown;
  try {
    resolutionUpdate = await resolveMatureCalls();
  } catch (error) {
    resolutionUpdate = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  return {
    discoveryLimit,
    maxAnalyzedMarkets,
    minAnalysisPriceBps: minAnalysisPriceBps(),
    maxAnalysisPriceBps: maxAnalysisPriceBps(),
    discovered: discovery.discovered,
    checked: discovery.checked,
    eligible: discovery.eligibleCandidates.length,
    analyzed,
    published,
    skipped,
    failed,
    resolutionUpdate,
    skippedByReason: summarizeSkipReasons(skipped),
    topRejectedMarkets: discovery.topRejectedMarkets,
    topEligibleCandidates: discovery.topEligibleCandidates,
  };
}


export async function runSportsEdge() {
  if (!sportsEnabled()) {
    return { ok: true, disabled: true, message: "Sports Live Calls are disabled. Set ENABLE_SPORTS_EDGE=true on Railway to run sports scans." };
  }

  requireEnv("OPENAI_API_KEY");
  const thresholds = sportsThresholds();
  const discoveryLimit = sportsDiscoveryLimit();
  const dailyTarget = sportsDailyTarget();
  const maxAnalyzed = maxSportsAnalyzedPerRun();
  const requireX402 = boolEnv("REQUIRE_SPORTS_X402", true);
  const enforcedSportsCategory = sportsOnlyCategory("soccer");
  const sportsCouncil = await ensureSportsCouncilAgent({
    ownerWallet: optionalEnv("AGENT_OWNER_WALLET", "0x0000000000000000000000000000000000000000"),
  });
  const expiryUpdate = await expirePublishedCalls();
  const markets = await discoverPolymarketMarkets(discoveryLimit);
  const skipped: SportsSkip[] = [];
  const failed: RunFailedMarket[] = [];
  const candidates: SportsCandidate[] = [];

  for (const market of markets) {
    try {
      await upsertMarket(market);
    } catch (error) {
      failed.push({ marketId: market.marketId, title: market.title, stage: "market_upsert", error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const evaluation = evaluateSportsCandidate(market, thresholds);
    if (!evaluation.eligible || !evaluation.candidate) {
      skipped.push(sportsRejectedSummary(market, evaluation.reasons));
      continue;
    }
    if (enforcedSportsCategory && evaluation.candidate.classification.category !== enforcedSportsCategory) {
      skipped.push({ ...sportsCandidateSummary(evaluation.candidate), reasons: ["wrong_sports_category"] });
      continue;
    }
    candidates.push(evaluation.candidate);
  }

  const ranked = rankSportsCandidates(candidates);
  const candidatesForAnalysis = ranked.slice(0, maxAnalyzed);
  for (const candidate of ranked.slice(maxAnalyzed)) {
    skipped.push({ ...sportsCandidateSummary(candidate), reasons: ["analysis_limit"] });
  }

  const sportsCalls: Array<{
    id: number;
    status: string;
    market: string;
    selectedOption: string;
    edgeBps: number;
    confidenceBps: number;
    riskLevel: string;
    statusReason: string;
    suggestedSizeBps?: number | undefined;
  }> = [];
  const callsByStatus: Record<Exclude<SportsCallStatus, "avoid_call">, number> = { strong_call: 0, lean_call: 0, high_risk_call: 0 };
  let analyzed = 0;
  const structuredEvidenceFetcher = createStructuredEvidenceFetcher();

  await Promise.all(
    candidatesForAnalysis.map(async (candidate) => {
      const { market, classification } = candidate;
      let x402Result: X402EvidenceProviderResult | undefined;
      let aisaResult: X402EvidenceProviderResult | undefined;
      let tavilyResult: X402EvidenceProviderResult | undefined;
      let structuredResult: SportsStructuredEvidenceProviderResult | undefined;

      try {
        const currentDailySpendUsdc = await getTodayX402SpendUsdc();
        analyzed += 1;
        const provisionalSnapshot = await fetchOutcomeSnapshot(market, provisionalSportsOutcomeIndex(candidate));
        const [structuredRes, aisaRes, tavilyRes] = await Promise.all([
          structuredEvidenceFetcher.fetch(market),
          fetchAisaX402SocialEvidence({
            market,
            snapshot: marketSnapshotFromOutcome(provisionalSnapshot),
            dailySpendUsdc: currentDailySpendUsdc,
            query: `${market.title} injuries form stats news`
          }),
          fetchTavilyX402SearchEvidence({
            market,
            query: `${market.title} injuries form stats news`,
            dailySpendUsdc: currentDailySpendUsdc
          })
        ]);
        structuredResult = structuredRes;
        aisaResult = aisaRes;
        tavilyResult = tavilyRes;

        x402Result = {
          enabled: aisaResult.enabled || tavilyResult.enabled,
          provider: "combined_aisa_tavily",
          status: (aisaResult.status === "success" || tavilyResult.status === "success") ? "success" : aisaResult.status,
          evidence: [...aisaResult.evidence, ...tavilyResult.evidence],
          paymentAmountUsdc: addUsdc(aisaResult.paymentAmountUsdc || "0", tavilyResult.paymentAmountUsdc || "0"),
          paymentNetwork: aisaResult.paymentNetwork || tavilyResult.paymentNetwork,
          selectedChain: aisaResult.selectedChain || tavilyResult.selectedChain,
          supportChecks: [...(aisaResult.supportChecks || []), ...(tavilyResult.supportChecks || [])],
          failureReason: aisaResult.failureReason || tavilyResult.failureReason,
          paymentRef: aisaResult.paymentRef || tavilyResult.paymentRef,
          txHash: aisaResult.txHash || tavilyResult.txHash,
          error: aisaResult.error || tavilyResult.error,
        };

        if (requireX402 && (x402Result.status !== "success" || x402Result.evidence.length === 0)) {
          const failure = x402Result.error || `Required Gateway/x402 sports evidence failed with status ${x402Result.status}.`;
          const failedRun = await recordAgentRun({ status: "sports_failed_x402_required", model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"), inputs: { market, thresholds, candidateScore: candidate.candidateScore, x402: x402Summary(x402Result), structuredEvidence: structuredEvidenceSummary(structuredResult) }, failure });
          await recordX402CircleAction({ result: aisaResult, marketId: market.marketId, agentRunId: failedRun?.id });
          await recordX402CircleAction({ result: tavilyResult, marketId: market.marketId, agentRunId: failedRun?.id });
          failed.push({ marketId: market.marketId, title: market.title, stage: "sports_x402_required", error: failure });
          return;
        }

        let evidenceContext = buildSportsEvidenceContext({ market, snapshot: provisionalSnapshot, structuredEvidence: structuredResult.evidence, x402Evidence: x402Result.evidence });
        const evidenceQuality = evaluateSportsEvidenceQuality(evidenceContext);
        if (!evidenceQuality.ok) {
          const reasons = ["insufficient_real_sports_evidence", ...evidenceQuality.reasons.filter((reason) => reason !== "insufficient_real_sports_evidence")];
          const failure = `Sports evidence quality gate failed: ${reasons.join(", ")}`;
          const skippedRun = await recordAgentRun({
            status: "sports_skipped_evidence_quality",
            model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
            inputs: { market, thresholds, candidateScore: candidate.candidateScore, candidateOutcomeIndexes: candidate.outcomeIndexes, evidenceIds: evidenceContext.map((item) => item.evidenceId), evidenceQuality, x402: x402Summary(x402Result), structuredEvidence: structuredEvidenceSummary(structuredResult) },
            failure,
            evidenceContext,
          });
          if (aisaResult) await recordX402CircleAction({ result: aisaResult, marketId: market.marketId, agentRunId: skippedRun?.id });
          if (tavilyResult) await recordX402CircleAction({ result: tavilyResult, marketId: market.marketId, agentRunId: skippedRun?.id });
          skipped.push({ ...sportsCandidateSummary(candidate), reasons });
          return;
        }
        const councilResult = await runSportsCouncilDetailed({ market, snapshot: provisionalSnapshot, evidence: evidenceContext, candidateOutcomeIndexes: candidate.outcomeIndexes, category: classification.category, marketKind: classification.marketKind });
        let idea = aggregateSportsVotes({ market, snapshot: provisionalSnapshot, category: classification.category, marketKind: classification.marketKind, evidence: evidenceContext, votes: councilResult.votes });
        if (idea.selectedOutcomeIndex !== provisionalSnapshot.outcomeIndex) {
          const selectedSnapshot = await fetchOutcomeSnapshot(market, idea.selectedOutcomeIndex);
          evidenceContext = buildSportsEvidenceContext({ market, snapshot: selectedSnapshot, structuredEvidence: structuredResult.evidence, x402Evidence: x402Result.evidence });
          idea = aggregateSportsVotes({ market, snapshot: selectedSnapshot, category: classification.category, marketKind: classification.marketKind, evidence: evidenceContext, votes: councilResult.votes });
        }
        const thresholdFailures = sportsThresholdFailures(idea, thresholds);
        const sportsStatus = classifySportsCallStatus(idea, thresholds);
        const statusReason = sportsStatusReason(sportsStatus, thresholdFailures);
        idea = { ...idea, verdict: sportsVerdictForStatus(sportsStatus, idea) };

        const candidateRun = await recordAgentRun({
          status: "sports_analyzed",
          model: councilResult.model,
          inputs: { market, thresholds, candidateScore: candidate.candidateScore, candidateOutcomeIndexes: candidate.outcomeIndexes, evidenceIds: evidenceContext.map((item) => item.evidenceId), evidenceQuality, x402: x402Summary(x402Result), structuredEvidence: structuredEvidenceSummary(structuredResult) },
          outputs: { idea, sportsStatus, votes: councilResult.votes, failures: councilResult.failures, thresholdFailures, evidenceQuality, x402: x402Summary(x402Result), structuredEvidence: structuredEvidenceSummary(structuredResult) },
          evidenceContext,
          retryCount: councilResult.votes.reduce((sum, vote) => sum + (vote.retryCount || 0), 0),
          latencyMs: councilResult.totalLatencyMs,
        });
        if (aisaResult) await recordX402CircleAction({ result: aisaResult, marketId: market.marketId, agentRunId: candidateRun?.id });
        if (tavilyResult) await recordX402CircleAction({ result: tavilyResult, marketId: market.marketId, agentRunId: candidateRun?.id });

        const row = await upsertSportsPrediction({ agentId: sportsCouncil.id, idea, sourceRunId: candidateRun?.id, x402Status: x402Summary(x402Result), status: sportsStatus, statusReason, eventStartTime: sportsEventTime(market) });
        const reportedStatus = sportsStatus === "avoid_call" ? "high_risk_call" : sportsStatus;
        callsByStatus[reportedStatus] += 1;
        sportsCalls.push({ id: row.id, status: reportedStatus, market: idea.market.title, selectedOption: idea.selectedOption, edgeBps: idea.edgeBps, confidenceBps: idea.confidenceBps, riskLevel: idea.riskLevel, statusReason, suggestedSizeBps: idea.suggestedSizeBps });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedRun = await recordAgentRun({ status: "sports_failed", model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"), inputs: { market, candidateScore: candidate.candidateScore, x402: x402Summary(x402Result), structuredEvidence: structuredEvidenceSummary(structuredResult) }, failure: message });
        if (x402Result) await recordX402CircleAction({ result: x402Result, marketId: market.marketId, agentRunId: failedRun?.id });
        failed.push({ marketId: market.marketId, title: market.title, stage: "sports_analysis_or_store", error: message });
      }
    })
  );

  return {
    discoveryLimit,
    dailyTarget,
    sportsOnlyCategory: enforcedSportsCategory ?? "all",
    maxAnalyzedSportsMarkets: maxAnalyzed,
    discovered: markets.length,
    checked: markets.length,
    eligible: ranked.length,
    analyzed,
    liveCallsStored: sportsCalls.length,
    callsByStatus,
    expiryUpdate,
    sportsCalls,
    skipped,
    failed,
    skippedByReason: summarizeSkipReasons(skipped),
    topSportsCandidates: ranked.slice(0, Math.max(dailyTarget, 10)).map(sportsCandidateSummary),
    structuredEvidenceCacheSize: structuredEvidenceFetcher.cache.size,
  };
}

export async function publishStoredRun(runId: number) {
  if (!Number.isFinite(runId) || runId <= 0) throw new Error("Usage: npm run worker -- publish-run <agentRunId>");
  const sourceRun = await getAgentRunById(runId);
  if (!sourceRun) throw new Error(`Agent run ${runId} was not found.`);

  const output = sourceRun.outputs as { call?: ReturnType<typeof aggregateVotes> } | null;
  const call = output?.call;
  if (!call) throw new Error(`Agent run ${runId} does not contain a call output.`);
  if (call.action === "WATCH") throw new Error(`Agent run ${runId} is WATCH-only and cannot be published.`);

  const thresholds = publishThresholds();
  if (!boolEnv("ALLOW_PUBLISH_FILTERED_RUN", false) && !passesPublishThresholds(call, thresholds)) {
    const failures = publishThresholdFailures(call, thresholds).join(", ");
    throw new Error(`Agent run ${runId} does not pass publish thresholds (${failures}). Set ALLOW_PUBLISH_FILTERED_RUN=true only for explicit demos.`);
  }

  const onchainAgentId = Number(optionalEnv("DEFAULT_ONCHAIN_AGENT_ID", "0"));
  if (!Number.isFinite(onchainAgentId) || onchainAgentId <= 0) throw new Error("DEFAULT_ONCHAIN_AGENT_ID is required. Run `npm run worker -- register-agent` first.");

  const bondAmount = optionalEnv("BOND_AMOUNT_USDC", "0");
  const unlockPrice = optionalEnv("UNLOCK_PRICE_USDC", "0.05");
  const registryAddress = optionalEnv("PRECALL_REGISTRY_ADDRESS", "");
  const council = await ensureCouncilAgent({ onchainAgentId, ownerWallet: optionalEnv("AGENT_OWNER_WALLET", "0x0000000000000000000000000000000000000000") });
  const onchain = await publishAggregatedCallOnchain({ call, onchainAgentId: BigInt(onchainAgentId), bondAmountUsdc: bondAmount, unlockPriceUsdc: unlockPrice });
  const row = await insertPublishedCall({ agentId: council.id, onchainCallId: onchain.onchainCallId ? Number(onchain.onchainCallId) : undefined, txHash: onchain.txHash, registryAddress, call, bondAmount, unlockPrice, copyUrl: polymarketCopyUrl(call.market) });

  await recordCircleAction({ actionType: "arc_bond", walletAddress: optionalEnv("AGENT_OWNER_WALLET", ""), amount: bondAmount, chain: "Arc Testnet", txHash: onchain.txHash, relatedCallId: row.id, status: "success", metadata: { sourceAgentRunId: runId, onchainCallId: onchain.onchainCallId?.toString(), registryAddress } });
  await recordAgentRun({ status: "published-stored", model: sourceRun.model, inputs: { sourceAgentRunId: runId }, outputs: { call, thesisHash: hashText(call.thesis), evidenceHash: hashText(JSON.stringify(call.evidence)) }, publishedCallId: row.id });
  return { id: row.id, sourceAgentRunId: runId, onchainCallId: onchain.onchainCallId, market: call.market.title, action: call.action, edgeBps: call.edgeBps, confidenceBps: call.confidenceBps, txHash: onchain.txHash };
}

function realizedPnlBps(action: string, entryPriceBps: number, outcomeYes: boolean) {
  const wins = (action === "BUY_YES" && outcomeYes) || (action === "BUY_NO" && !outcomeYes);
  if (!wins) return -10_000;
  const entry = Math.max(1, Math.min(9_999, entryPriceBps));
  return Math.round(((10_000 - entry) / entry) * 10_000);
}

function realizedSelectedOutcomePnlBps(entryPriceBps: number, won: boolean) {
  if (!won) return -10_000;
  const entry = Math.max(1, Math.min(9_999, entryPriceBps));
  return Math.round(((10_000 - entry) / entry) * 10_000);
}

export async function expirePublishedCalls() {
  const expired = await markExpiredCalls();
  const sportsExpired = await markExpiredSportsPredictions();
  return { expired: expired.length, calls: expired, sportsExpired: sportsExpired.length, sportsCalls: sportsExpired };
}

export async function resolveMatureCalls() {
  const expired = await expirePublishedCalls();
  const publishOnchain = boolEnv("RESOLVE_ONCHAIN", true);
  const openCalls = await getOpenPublishedCalls();
  const resolved = [];
  const skipped = [];
  const failed = [];

  for (const call of openCalls) {
    if (!call.onchainCallId) {
      skipped.push({ callId: call.id, reason: "missing_onchain_call_id" });
      continue;
    }
    if (call.marketType !== "strict_yes_no") {
      skipped.push({ callId: call.id, reason: "unsupported_market_type" });
      continue;
    }

    const resolution = await fetchPolymarketResolution(call.marketId);
    if (!resolution) {
      skipped.push({ callId: call.id, marketId: call.marketId, reason: "not_resolved_or_ambiguous" });
      continue;
    }

    try {
      await markCallResolving(call.id);
      const resolvedOutcomeIndex = resolution.outcomeYes ? 0 : 1;
      const isPush = false;
      const roiBps = realizedPnlBps(call.action, call.marketPriceBps, resolution.outcomeYes);
      const brier = brierScoreBps(call.yesProbabilityBps || call.agentProbabilityBps, resolution.outcomeYes);
      let txHash: string | undefined;

      if (publishOnchain) {
        const tx = await resolveCallOnchain({
          onchainCallId: BigInt(call.onchainCallId),
          resolvedOutcomeIndex,
          isPush,
          realizedPnlBps: roiBps,
          brierScoreBps: brier,
        });
        txHash = tx.txHash;
      }

      await insertResolution({ callId: call.id, finalOutcome: resolution.outcomeYes ? "YES" : "NO", finalPriceBps: resolution.finalYesPriceBps, roiBps, brierScoreBps: brier, resolverTx: txHash });
      resolved.push({ callId: call.id, marketId: call.marketId, outcome: resolution.outcomeYes ? "YES" : "NO", txHash });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markCallResolutionFailed(call.id, message);
      failed.push({ callId: call.id, error: message });
    }
  }

  const sportsCandidates = await getSportsPredictionsForResolution();
  const sportsResolved = [];
  const sportsSkipped = [];

  for (const prediction of sportsCandidates) {
    const resolution = await fetchPolymarketSelectedOutcomeResolution(prediction.marketId).catch(() => null);
    if (!resolution) {
      sportsSkipped.push({ sportsPredictionId: prediction.id, marketId: prediction.marketId, reason: "not_resolved_or_ambiguous" });
      continue;
    }

    const pushed = resolution.resolvedOutcomeIndex === null;
    const won = !pushed && resolution.resolvedOutcomeIndex === prediction.selectedOutcomeIndex;
    await markSportsPredictionResolved({ predictionId: prediction.id, resolution });
    sportsResolved.push({
      sportsPredictionId: prediction.id,
      marketId: prediction.marketId,
      selectedOption: prediction.selectedOption,
      resolvedOutcome: resolution.resolvedOutcome,
      result: pushed ? "push" : won ? "win" : "loss",
      roiBps: pushed ? 0 : realizedSelectedOutcomePnlBps(prediction.marketPriceBps, won),
      brierScoreBps: pushed ? 0 : brierScoreBps(prediction.agentProbabilityBps, won),
    });
  }

  return { expired, checked: openCalls.length, resolved, skipped, failed, sportsChecked: sportsCandidates.length, sportsResolved, sportsSkipped };
}
