import {
  boolEnv,
  numberEnv,
  optionalEnv,
  requireEnv,
} from "@precall/shared/env";
import { fetchCircleSocialEvidence } from "@precall/shared/circle/enrichment";
import { publishAggregatedCallOnchain, registerAgentOnchain, resolveCallOnchain } from "@precall/shared/onchain/precall";
import {
  discoverPolymarketMarkets,
  fetchMarketSnapshot,
  fetchPolymarketResolution,
  polymarketCopyUrl,
} from "@precall/shared/polymarket";
import { aggregateVotes, brierScoreBps, hashText, passesPublishThresholds } from "@precall/shared/scoring";
import { runAgentCouncil } from "@precall/shared/agents/council";
import {
  ensureCouncilAgent,
  getAgentRunById,
  getOpenPublishedCalls,
  insertPublishedCall,
  insertResolution,
  insertSnapshot,
  recordAgentRun,
  upsertMarket,
} from "./repository";

export async function health() {
  const markets = await discoverPolymarketMarkets(1);
  return {
    ok: true,
    livePolymarketMarkets: markets.length,
    databaseUrl: Boolean(process.env.DATABASE_URL),
    modelApiKey: Boolean(process.env.OPENAI_API_KEY),
    modelBaseUrl: optionalEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
    model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
    registryAddress: Boolean(process.env.PRECALL_REGISTRY_ADDRESS),
  };
}

function publishThresholds() {
  return {
    minLiquidityUsd: numberEnv("MIN_LIQUIDITY_USD", 500),
    minEdgeBps: numberEnv("MIN_EDGE_BPS", 650),
    maxSpreadBps: numberEnv("MAX_SPREAD_BPS", 900),
    minConfidenceBps: numberEnv("MIN_CONFIDENCE_BPS", 5200),
    minSuggestedSizeBps: numberEnv("MIN_SUGGESTED_SIZE_BPS", 50),
  };
}

export async function discover() {
  const limit = numberEnv("MAX_MARKETS_PER_RUN", 8);
  const markets = await discoverPolymarketMarkets(limit);
  for (const market of markets) {
    const snapshot = await fetchMarketSnapshot(market);
    await upsertMarket(market);
    await insertSnapshot(snapshot);
  }
  return { markets: markets.length };
}

export async function registerCouncilAgent() {
  const result = await registerAgentOnchain({
    name: "Precall Council",
    metadataUri: "https://precall.arena/agents/precall-council",
  });
  return {
    message: "Registered Precall Council on Arc. Set DEFAULT_ONCHAIN_AGENT_ID to this value.",
    ...result,
  };
}

export async function runOnce() {
  requireEnv("OPENAI_API_KEY");
  const publishOnchain = boolEnv("PUBLISH_ONCHAIN", true);
  const maxMarkets = numberEnv("MAX_MARKETS_PER_RUN", 8);
  const bondAmount = optionalEnv("BOND_AMOUNT_USDC", "1");
  const unlockPrice = optionalEnv("UNLOCK_PRICE_USDC", "0.05");
  const thresholds = publishThresholds();
  const onchainAgentId = Number(optionalEnv("DEFAULT_ONCHAIN_AGENT_ID", "0"));
  if (publishOnchain && (!Number.isFinite(onchainAgentId) || onchainAgentId <= 0)) {
    throw new Error("DEFAULT_ONCHAIN_AGENT_ID is required when PUBLISH_ONCHAIN=true. Run `npm run worker -- register-agent` first.");
  }

  const council = await ensureCouncilAgent({
    onchainAgentId: onchainAgentId || undefined,
    ownerWallet: optionalEnv("AGENT_OWNER_WALLET", "0x0000000000000000000000000000000000000000"),
  });

  const markets = await discoverPolymarketMarkets(maxMarkets);
  const published = [];
  const skipped = [];

  for (const market of markets) {
    await upsertMarket(market);
    const snapshot = await fetchMarketSnapshot(market);
    await insertSnapshot(snapshot);

    try {
      const socialEvidence = fetchCircleSocialEvidence(`${market.title} Polymarket`);
      const votes = await runAgentCouncil({ market, snapshot, extraEvidence: socialEvidence });
      const call = aggregateVotes(market, snapshot, votes);
      const publishable = passesPublishThresholds(call, thresholds);

      await recordAgentRun({
        status: publishable ? "candidate" : "filtered",
        model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
        inputs: { market, snapshot, thresholds },
        outputs: { call, votes },
      });

      if (!publishable) {
        skipped.push({ marketId: market.marketId, title: market.title, edgeBps: call.edgeBps });
        continue;
      }

      let txHash: string | undefined;
      let onchainCallId: number | undefined;
      if (publishOnchain) {
        const onchain = await publishAggregatedCallOnchain({
          call,
          onchainAgentId: BigInt(onchainAgentId),
          bondAmountUsdc: bondAmount,
          unlockPriceUsdc: unlockPrice,
        });
        txHash = onchain.txHash;
        onchainCallId = onchain.onchainCallId ? Number(onchain.onchainCallId) : undefined;
      }

      const row = await insertPublishedCall({
        agentId: council.id,
        onchainCallId,
        txHash,
        call: {
          ...call,
          thesis: call.thesis,
          evidence: call.evidence,
        },
        bondAmount,
        unlockPrice,
        copyUrl: polymarketCopyUrl(market),
      });

      await recordAgentRun({
        status: "published",
        model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
        inputs: { market, snapshot },
        outputs: { call, thesisHash: hashText(call.thesis), evidenceHash: hashText(JSON.stringify(call.evidence)) },
        publishedCallId: row.id,
      });
      published.push({ id: row.id, onchainCallId, market: market.title, txHash });
    } catch (error) {
      await recordAgentRun({
        status: "failed",
        model: optionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
        inputs: { market, snapshot },
        failure: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  return { checked: markets.length, published, skipped };
}

export async function publishStoredRun(runId: number) {
  if (!Number.isFinite(runId) || runId <= 0) {
    throw new Error("Usage: npm run worker -- publish-run <agentRunId>");
  }

  const sourceRun = await getAgentRunById(runId);
  if (!sourceRun) throw new Error(`Agent run ${runId} was not found.`);

  const output = sourceRun.outputs as { call?: unknown } | null;
  const call = output?.call as ReturnType<typeof aggregateVotes> | undefined;
  if (!call) throw new Error(`Agent run ${runId} does not contain a call output.`);
  if (call.action === "WATCH") throw new Error(`Agent run ${runId} is WATCH-only and cannot be published.`);

  const thresholds = publishThresholds();
  if (!boolEnv("ALLOW_PUBLISH_FILTERED_RUN", false) && !passesPublishThresholds(call, thresholds)) {
    throw new Error(
      `Agent run ${runId} does not pass publish thresholds: edge=${call.edgeBps}, confidence=${call.confidenceBps}, size=${call.suggestedSizeBps}, liquidity=${call.market.liquidityUsd}, spread=${call.snapshot.spreadBps}. Set ALLOW_PUBLISH_FILTERED_RUN=true only for explicit demos.`,
    );
  }

  const onchainAgentId = Number(optionalEnv("DEFAULT_ONCHAIN_AGENT_ID", "0"));
  if (!Number.isFinite(onchainAgentId) || onchainAgentId <= 0) {
    throw new Error("DEFAULT_ONCHAIN_AGENT_ID is required. Run `npm run worker -- register-agent` first.");
  }

  const bondAmount = optionalEnv("BOND_AMOUNT_USDC", "1");
  const unlockPrice = optionalEnv("UNLOCK_PRICE_USDC", "0.05");
  const council = await ensureCouncilAgent({
    onchainAgentId,
    ownerWallet: optionalEnv("AGENT_OWNER_WALLET", "0x0000000000000000000000000000000000000000"),
  });

  const onchain = await publishAggregatedCallOnchain({
    call,
    onchainAgentId: BigInt(onchainAgentId),
    bondAmountUsdc: bondAmount,
    unlockPriceUsdc: unlockPrice,
  });

  const row = await insertPublishedCall({
    agentId: council.id,
    onchainCallId: onchain.onchainCallId ? Number(onchain.onchainCallId) : undefined,
    txHash: onchain.txHash,
    call,
    bondAmount,
    unlockPrice,
    copyUrl: polymarketCopyUrl(call.market),
  });

  await recordAgentRun({
    status: "published-stored",
    model: sourceRun.model,
    inputs: { sourceAgentRunId: runId },
    outputs: { call, thesisHash: hashText(call.thesis), evidenceHash: hashText(JSON.stringify(call.evidence)) },
    publishedCallId: row.id,
  });

  return {
    id: row.id,
    sourceAgentRunId: runId,
    onchainCallId: onchain.onchainCallId,
    market: call.market.title,
    action: call.action,
    edgeBps: call.edgeBps,
    confidenceBps: call.confidenceBps,
    txHash: onchain.txHash,
  };
}

function realizedPnlBps(action: string, entryPriceBps: number, outcomeYes: boolean) {
  const wins = (action === "BUY_YES" && outcomeYes) || (action === "BUY_NO" && !outcomeYes);
  if (!wins) return -10_000;
  const entry = Math.max(1, Math.min(9_999, entryPriceBps));
  return Math.round(((10_000 - entry) / entry) * 10_000);
}

export async function resolveMatureCalls() {
  const publishOnchain = boolEnv("RESOLVE_ONCHAIN", true);
  const openCalls = await getOpenPublishedCalls();
  const resolved = [];
  const skipped = [];

  for (const call of openCalls) {
    if (!call.onchainCallId) {
      skipped.push({ callId: call.id, reason: "missing onchain call id" });
      continue;
    }

    const resolution = await fetchPolymarketResolution(call.marketId);
    if (!resolution) {
      skipped.push({ callId: call.id, marketId: call.marketId, reason: "not resolved or ambiguous" });
      continue;
    }

    const roiBps = realizedPnlBps(call.action, call.marketPriceBps, resolution.outcomeYes);
    const brier = brierScoreBps(call.agentProbabilityBps, resolution.outcomeYes);
    let txHash: string | undefined;

    if (publishOnchain) {
      const tx = await resolveCallOnchain({
        onchainCallId: BigInt(call.onchainCallId),
        outcomeYes: resolution.outcomeYes,
        realizedPnlBps: roiBps,
        brierScoreBps: brier,
      });
      txHash = tx.txHash;
    }

    await insertResolution({
      callId: call.id,
      finalOutcome: resolution.outcomeYes ? "YES" : "NO",
      finalPriceBps: resolution.finalYesPriceBps,
      roiBps,
      brierScoreBps: brier,
      resolverTx: txHash,
    });
    resolved.push({ callId: call.id, marketId: call.marketId, outcome: resolution.outcomeYes ? "YES" : "NO", txHash });
  }

  return { checked: openCalls.length, resolved, skipped };
}
