import { buildEvidenceContext } from "@precall/shared/evidence";
import { boolEnv, numberEnv, optionalEnv, requireEnv } from "@precall/shared/env";
import { getGatewayBalances, gatewayRuntimeConfig } from "@precall/shared/circle/gateway-client";
import { fetchAisaX402SocialEvidence, type X402EvidenceProviderResult } from "@precall/shared/evidence/providers/x402-provider";
import { evaluateMarketEligibility, rankMarketCandidates, scoreMarketCandidate, summarizeSkipReasons, type MarketCandidateScore } from "@precall/shared/market-eligibility";
import { publishAggregatedCallOnchain, registerAgentOnchain, resolveCallOnchain } from "@precall/shared/onchain/precall";
import {
  discoverPolymarketMarkets,
  fetchMarketSnapshot,
  fetchPolymarketResolution,
  polymarketCopyUrl,
} from "@precall/shared/polymarket";
import { aggregateVotes, brierScoreBps, hashText, passesPublishThresholds, publishThresholdFailures, type PublishThresholds } from "@precall/shared/scoring";
import type { MarketSnapshot, PolymarketMarket } from "@precall/shared/types";
import { runAgentCouncilDetailed } from "@precall/shared/agents/council";
import {
  ensureCouncilAgent,
  getAgentRunById,
  getOpenPublishedCalls,
  insertPublishedCall,
  insertResolution,
  insertSnapshot,
  markCallResolutionFailed,
  markCallResolving,
  markExpiredCalls,
  recordAgentRun,
  recordCircleAction,
  getTodayX402SpendUsdc,
  checkCircleActionsSchemaHealth,
  upsertMarket,
} from "./repository";

export async function health() {
  const thresholds = publishThresholds();
  const gatewayConfig = gatewayRuntimeConfig();
  const gatewayBalance = gatewayConfig.enabled ? await getGatewayBalances().catch((error) => ({ enabled: true, status: "failed" as const, chain: gatewayConfig.chain, error: error instanceof Error ? error.message : String(error) })) : undefined;
  const circleActionsSchema = await checkCircleActionsSchemaHealth();
  const base = {
    worker: {
      commitSha: optionalEnv("RAILWAY_GIT_COMMIT_SHA", optionalEnv("GIT_COMMIT_SHA", "unknown")),
      schemaRepair: "0005_circle_actions_core_columns",
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
    },
    database: {
      circleActions: circleActionsSchema,
    },
    circle: {
      gatewayX402Enabled: gatewayConfig.enabled,
      gatewayX402Required: boolEnv("REQUIRE_CIRCLE_GATEWAY_X402", false),
      gatewayChain: gatewayConfig.chain,
      gatewayWalletConfigured: Boolean(gatewayConfig.privateKey),
      allowedHosts: gatewayConfig.allowedHosts,
      maxPaymentUsdc: gatewayConfig.maxPaymentUsdc,
      dailyBudgetUsdc: gatewayConfig.dailyBudgetUsdc,
      minGatewayBalanceUsdc: gatewayConfig.minGatewayBalanceUsdc,
      gatewayBalanceStatus: gatewayBalance?.status || "disabled",
      gatewayAvailableUsdc: gatewayBalance && "gatewayAvailableUsdc" in gatewayBalance ? gatewayBalance.gatewayAvailableUsdc : undefined,
      gatewayError: gatewayBalance?.error,
    },
    thresholds,
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
  return numberEnv("DISCOVERY_MARKET_LIMIT", 75);
}

function maxAnalyzedMarketsPerRun() {
  return numberEnv("MAX_ANALYZED_MARKETS_PER_RUN", 8);
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

async function discoverRankedMarketPool(input: { thresholds: PublishThresholds; discoveryLimit: number; topLimit: number }) {
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
  });

  return {
    discoveryLimit: discovery.discoveryLimit,
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
    chain: input.result.paymentNetwork || optionalEnv("CIRCLE_GATEWAY_CHAIN", "arcTestnet"),
    paymentRef: input.result.paymentRef,
    txHash: input.result.txHash,
    relatedMarketId: input.marketId,
    relatedAgentRunId: input.agentRunId,
    status: input.result.status === "success" ? "success" : input.result.status,
    error: input.result.error,
    metadata: { evidenceCount: input.result.evidence.length },
  });
}

function addUsdc(left: string | number, right: string | number | undefined) {
  const total = Number(left || 0) + Number(right || 0);
  return Number.isFinite(total) ? total.toFixed(6) : String(left);
}

export async function runOnce() {
  requireEnv("OPENAI_API_KEY");
  const publishOnchain = boolEnv("PUBLISH_ONCHAIN", true);
  const discoveryLimit = discoveryMarketLimit();
  const maxAnalyzedMarkets = maxAnalyzedMarketsPerRun();
  const bondAmount = optionalEnv("BOND_AMOUNT_USDC", "1");
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

  const discovery = await discoverRankedMarketPool({ thresholds, discoveryLimit, topLimit: maxAnalyzedMarkets });
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
    try {
      x402Result = await fetchAisaX402SocialEvidence({ market, snapshot, dailySpendUsdc: dailyX402SpendUsdc });
      if (x402Result.status === "success") dailyX402SpendUsdc = addUsdc(dailyX402SpendUsdc, x402Result.paymentAmountUsdc);
      if (requireX402 && (x402Result.status !== "success" || x402Result.evidence.length === 0)) {
        const failure = x402Result.error || `Required Gateway/x402 evidence failed with status ${x402Result.status}.`;
        const failedRun = await recordAgentRun({
          status: "failed_x402_required",
          model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
          inputs: { market, snapshot, requireX402: true, candidateScore: candidate.candidateScore },
          failure,
        });
        await recordX402CircleAction({ result: x402Result, marketId: market.marketId, agentRunId: failedRun?.id });
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
        inputs: { market, snapshot, thresholds, candidateScore: candidate.candidateScore, evidenceIds: evidenceContext.map((item) => item.evidenceId) },
        outputs: { call, votes: councilResult.votes, failures: councilResult.failures, thresholdFailures },
        evidenceContext,
        retryCount: councilResult.votes.reduce((sum, vote) => sum + (vote.retryCount || 0), 0),
        latencyMs: councilResult.totalLatencyMs,
      });

      if (x402Result) await recordX402CircleAction({ result: x402Result, marketId: market.marketId, agentRunId: candidateRun?.id });

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

      await recordAgentRun({
        status: "published",
        model: councilResult.model,
        inputs: { market, snapshot, candidateScore: candidate.candidateScore, evidenceIds: evidenceContext.map((item) => item.evidenceId) },
        outputs: { call, thesisHash: hashText(call.thesis), evidenceHash: hashText(JSON.stringify(call.evidence)) },
        evidenceContext,
        publishedCallId: row.id,
        retryCount: councilResult.votes.reduce((sum, vote) => sum + (vote.retryCount || 0), 0),
        latencyMs: councilResult.totalLatencyMs,
      });
      published.push({ id: row.id, onchainCallId, market: market.title, txHash, edgeBps: call.edgeBps, confidenceBps: call.confidenceBps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedRun = await recordAgentRun({ status: "failed", model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"), inputs: { market, snapshot, candidateScore: candidate.candidateScore }, failure: message });
      if (x402Result) await recordX402CircleAction({ result: x402Result, marketId: market.marketId, agentRunId: failedRun?.id });
      failed.push({ marketId: market.marketId, title: market.title, stage: "analysis_or_publish", error: message });
      continue;
    }
  }

  return {
    discoveryLimit,
    maxAnalyzedMarkets,
    discovered: discovery.discovered,
    checked: discovery.checked,
    eligible: discovery.eligibleCandidates.length,
    analyzed,
    published,
    skipped,
    failed,
    skippedByReason: summarizeSkipReasons(skipped),
    topRejectedMarkets: discovery.topRejectedMarkets,
    topEligibleCandidates: discovery.topEligibleCandidates,
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

  const bondAmount = optionalEnv("BOND_AMOUNT_USDC", "1");
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

export async function expirePublishedCalls() {
  const expired = await markExpiredCalls();
  return { expired: expired.length, calls: expired };
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
      const roiBps = realizedPnlBps(call.action, call.marketPriceBps, resolution.outcomeYes);
      const brier = brierScoreBps(call.yesProbabilityBps || call.agentProbabilityBps, resolution.outcomeYes);
      let txHash: string | undefined;

      if (publishOnchain) {
        const tx = await resolveCallOnchain({ onchainCallId: BigInt(call.onchainCallId), outcomeYes: resolution.outcomeYes, realizedPnlBps: roiBps, brierScoreBps: brier });
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

  return { expired, checked: openCalls.length, resolved, skipped, failed };
}
