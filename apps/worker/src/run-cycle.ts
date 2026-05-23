import { buildEvidenceContext } from "@precall/shared/evidence";
import { boolEnv, numberEnv, optionalEnv, requireEnv } from "@precall/shared/env";
import { getGatewayBalances, gatewayRuntimeConfig } from "@precall/shared/circle/gateway-client";
import { fetchAisaX402SocialEvidence, type X402EvidenceProviderResult } from "@precall/shared/evidence/providers/x402-provider";
import { evaluateMarketEligibility, summarizeSkipReasons } from "@precall/shared/market-eligibility";
import { publishAggregatedCallOnchain, registerAgentOnchain, resolveCallOnchain } from "@precall/shared/onchain/precall";
import {
  discoverPolymarketMarkets,
  fetchMarketSnapshot,
  fetchPolymarketResolution,
  polymarketCopyUrl,
} from "@precall/shared/polymarket";
import { aggregateVotes, brierScoreBps, hashText, passesPublishThresholds, publishThresholdFailures, type PublishThresholds } from "@precall/shared/scoring";
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
    databaseUrl: Boolean(process.env.DATABASE_URL),
    modelApiKey: Boolean(process.env.OPENAI_API_KEY),
    modelBaseUrl: optionalEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
    modelTimeoutMs: numberEnv("MODEL_TIMEOUT_MS", 45_000),
    modelRetryCount: numberEnv("MODEL_RETRY_COUNT", 2),
    registryAddress: Boolean(process.env.PRECALL_REGISTRY_ADDRESS),
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

export async function discover() {
  const limit = numberEnv("MAX_MARKETS_PER_RUN", 8);
  const thresholds = publishThresholds();
  const markets = await discoverPolymarketMarkets(limit);
  const skipped = [];
  let eligible = 0;

  for (const market of markets) {
    const snapshot = await fetchMarketSnapshot(market);
    await upsertMarket(market);
    await insertSnapshot(snapshot);
    const eligibility = evaluateMarketEligibility(market, { snapshot, thresholds });
    if (eligibility.eligible) eligible += 1;
    else skipped.push({ marketId: market.marketId, title: market.title, reasons: eligibility.reasons });
  }
  return { checked: markets.length, eligible, skipped, skippedByReason: summarizeSkipReasons(skipped) };
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
  const maxMarkets = numberEnv("MAX_MARKETS_PER_RUN", 8);
  const maxAnalyzedMarkets = numberEnv("MAX_ANALYZED_MARKETS_PER_RUN", 4);
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

  const markets = await discoverPolymarketMarkets(maxMarkets);
  let dailyX402SpendUsdc = await getTodayX402SpendUsdc();
  const published = [];
  const skipped = [];
  const failed = [];
  let analyzed = 0;
  let eligible = 0;

  for (const market of markets) {
    let snapshot;
    try {
      await upsertMarket(market);
      snapshot = await fetchMarketSnapshot(market);
      await insertSnapshot(snapshot);
    } catch (error) {
      failed.push({ marketId: market.marketId, title: market.title, stage: "snapshot", error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const eligibility = evaluateMarketEligibility(market, { snapshot, thresholds });
    if (!eligibility.eligible) {
      skipped.push({ marketId: market.marketId, title: market.title, reasons: eligibility.reasons });
      continue;
    }
    eligible += 1;
    if (analyzed >= maxAnalyzedMarkets) {
      skipped.push({ marketId: market.marketId, title: market.title, reasons: ["analysis_limit"] });
      continue;
    }
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
          inputs: { market, snapshot, requireX402: true },
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
        inputs: { market, snapshot, thresholds, evidenceIds: evidenceContext.map((item) => item.evidenceId) },
        outputs: { call, votes: councilResult.votes, failures: councilResult.failures, thresholdFailures },
        evidenceContext,
        retryCount: councilResult.votes.reduce((sum, vote) => sum + (vote.retryCount || 0), 0),
        latencyMs: councilResult.totalLatencyMs,
      });

      if (x402Result) await recordX402CircleAction({ result: x402Result, marketId: market.marketId, agentRunId: candidateRun?.id });

      if (!publishable) {
        skipped.push({ marketId: market.marketId, title: market.title, reasons: thresholdFailures, edgeBps: call.edgeBps, confidenceBps: call.confidenceBps, suggestedSizeBps: call.suggestedSizeBps });
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
        inputs: { market, snapshot, evidenceIds: evidenceContext.map((item) => item.evidenceId) },
        outputs: { call, thesisHash: hashText(call.thesis), evidenceHash: hashText(JSON.stringify(call.evidence)) },
        evidenceContext,
        publishedCallId: row.id,
        retryCount: councilResult.votes.reduce((sum, vote) => sum + (vote.retryCount || 0), 0),
        latencyMs: councilResult.totalLatencyMs,
      });
      published.push({ id: row.id, onchainCallId, market: market.title, txHash, edgeBps: call.edgeBps, confidenceBps: call.confidenceBps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedRun = await recordAgentRun({ status: "failed", model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"), inputs: { market, snapshot }, failure: message });
      if (x402Result) await recordX402CircleAction({ result: x402Result, marketId: market.marketId, agentRunId: failedRun?.id });
      failed.push({ marketId: market.marketId, title: market.title, stage: "analysis_or_publish", error: message });
      continue;
    }
  }

  return { checked: markets.length, eligible, analyzed, published, skipped, failed, skippedByReason: summarizeSkipReasons(skipped) };
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
