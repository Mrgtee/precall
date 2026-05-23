import { desc, eq, sql } from "drizzle-orm";
import { createDb } from "@precall/shared/db/client";
import { getGatewayBalancesByChain, gatewayRuntimeConfig } from "@precall/shared/circle/gateway-client";
import {
  agents,
  agentRuns,
  calls,
  circleActions,
  evidenceItems,
  feedback,
  follows,
  markets,
  marketSnapshots,
  resolutions,
  thesisUnlocks,
  users,
} from "@precall/shared/db/schema";

export type CallRow = Awaited<ReturnType<typeof getCalls>>[number];

function objectMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const callSelect = {
  id: calls.id,
  onchainCallId: calls.onchainCallId,
  action: calls.action,
  marketPriceBps: calls.marketPriceBps,
  agentProbabilityBps: calls.agentProbabilityBps,
  yesProbabilityBps: calls.yesProbabilityBps,
  edgeBps: calls.edgeBps,
  confidenceBps: calls.confidenceBps,
  suggestedSizeBps: calls.suggestedSizeBps,
  bondAmount: calls.bondAmount,
  unlockPrice: calls.unlockPrice,
  status: calls.status,
  statusReason: calls.statusReason,
  marketType: calls.marketType,
  registryAddress: calls.registryAddress,
  legacy: calls.legacy,
  txHash: calls.txHash,
  copyUrl: calls.copyUrl,
  publishedAt: calls.publishedAt,
  expiresAt: calls.expiresAt,
  marketTitle: markets.title,
  marketUrl: markets.url,
  outcomes: markets.outcomes,
  liquidityUsd: markets.liquidityUsd,
  agentId: agents.id,
  agentName: agents.name,
  finalOutcome: resolutions.finalOutcome,
  roiBps: resolutions.roiBps,
  brierScoreBps: resolutions.brierScoreBps,
  resolverTx: resolutions.resolverTx,
};

export async function getCalls(limit = 30) {
  const db = createDb();
  return db
    .select(callSelect)
    .from(calls)
    .leftJoin(markets, eq(calls.marketId, markets.marketId))
    .leftJoin(agents, eq(calls.agentId, agents.id))
    .leftJoin(resolutions, eq(resolutions.callId, calls.id))
    .orderBy(desc(calls.publishedAt))
    .limit(limit);
}

export async function getCall(id: number) {
  const db = createDb();
  const [row] = await db
    .select({ ...callSelect, thesis: calls.thesis, counterarguments: calls.counterarguments })
    .from(calls)
    .leftJoin(markets, eq(calls.marketId, markets.marketId))
    .leftJoin(agents, eq(calls.agentId, agents.id))
    .leftJoin(resolutions, eq(resolutions.callId, calls.id))
    .where(eq(calls.id, id))
    .limit(1);
  return row;
}

export async function getEvidence(callId: number) {
  const db = createDb();
  return db.select().from(evidenceItems).where(eq(evidenceItems.callId, callId));
}

export async function hasUnlock(callId: number, wallet: string) {
  const db = createDb();
  const [row] = await db
    .select({ id: thesisUnlocks.id })
    .from(thesisUnlocks)
    .where(sql`${thesisUnlocks.callId} = ${callId} and lower(${thesisUnlocks.userWallet}) = lower(${wallet})`)
    .limit(1);
  return Boolean(row);
}

export async function getLeaderboard() {
  const db = createDb();
  return db
    .select({
      agentId: agents.id,
      name: agents.name,
      role: agents.role,
      calls: sql<number>`count(distinct ${calls.id})::int`,
      published: sql<number>`count(distinct ${calls.id}) filter (where ${calls.status} = 'published')::int`,
      resolved: sql<number>`count(distinct ${resolutions.id})::int`,
      wins: sql<number>`count(distinct ${resolutions.id}) filter (where ${resolutions.roiBps} > 0)::int`,
      unlocks: sql<number>`count(distinct ${thesisUnlocks.id})::int`,
      followers: sql<number>`count(distinct ${follows.id})::int`,
      avgBrier: sql<number>`coalesce(avg(${resolutions.brierScoreBps}), 0)::int`,
      avgRoi: sql<number>`coalesce(avg(${resolutions.roiBps}), 0)::int`,
    })
    .from(agents)
    .leftJoin(calls, eq(calls.agentId, agents.id))
    .leftJoin(thesisUnlocks, eq(thesisUnlocks.callId, calls.id))
    .leftJoin(resolutions, eq(resolutions.callId, calls.id))
    .leftJoin(follows, eq(follows.agentId, agents.id))
    .groupBy(agents.id)
    .orderBy(sql`count(distinct ${resolutions.id}) desc`, sql`count(distinct ${thesisUnlocks.id}) desc`, sql`count(distinct ${calls.id}) desc`);
}

export async function getAgent(id: number) {
  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  const agentCalls = await getCalls(100);
  const [followStats] = await db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.agentId, id));
  const [feedbackStats] = await db.select({ feedbackCount: sql<number>`count(*)::int` }).from(feedback).where(eq(feedback.agentId, id));
  return { agent, calls: agentCalls.filter((call) => call.agentId === id), followers: followStats?.followers ?? 0, feedbackCount: feedbackStats?.feedbackCount ?? 0 };
}

export async function getDemoData() {
  const db = createDb();
  const [counts] = await db.select({
    markets: sql<number>`(select count(*)::int from ${markets})`,
    snapshots: sql<number>`(select count(*)::int from ${marketSnapshots})`,
    calls: sql<number>`(select count(*)::int from ${calls})`,
    liveCalls: sql<number>`(select count(*)::int from ${calls} where status = 'published' and legacy = false)`,
    expiredCalls: sql<number>`(select count(*)::int from ${calls} where status = 'expired')`,
    resolvedCalls: sql<number>`(select count(*)::int from ${calls} where status = 'resolved')`,
    unlocks: sql<number>`(select count(*)::int from ${thesisUnlocks})`,
    follows: sql<number>`(select count(*)::int from ${follows})`,
    feedback: sql<number>`(select count(*)::int from ${feedback})`,
    uniqueWallets: sql<number>`(select count(distinct wallet_address)::int from ${users})`,
    unlockVolume: sql<string>`(select coalesce(sum(amount), 0)::text from ${thesisUnlocks})`,
    thesisUnlockVolume: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('thesis_unlock', 'unlock_thesis'))`,
    bondVolume: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('arc_bond', 'bond_call'))`,
    x402Spend: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('x402_api_payment', 'x402_evidence_payment') and status = 'success')`,
    dailyX402Spend: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('x402_api_payment', 'x402_evidence_payment') and status = 'success' and created_at >= date_trunc('day', now()))`,
    x402ApiPayments: sql<number>`(select count(*)::int from ${circleActions} where action_type in ('x402_api_payment', 'x402_evidence_payment'))`,
    circleActions: sql<number>`(select count(*)::int from ${circleActions})`,
  }).from(sql`(select 1) as precall_counts`).limit(1);

  const latestRuns = await db.query.agentRuns.findMany({ orderBy: desc(agentRuns.createdAt), limit: 8 });
  const latestCalls = await getCalls(10);
  const latestUnlocks = await db.query.thesisUnlocks.findMany({ orderBy: desc(thesisUnlocks.createdAt), limit: 5 });
  const latestCircleActions = await db.query.circleActions.findMany({ orderBy: desc(circleActions.createdAt), limit: 8 });
  const latestX402Payment = await db.query.circleActions.findFirst({ where: sql`${circleActions.actionType} in ('x402_api_payment', 'x402_evidence_payment')`, orderBy: desc(circleActions.createdAt) });
  const latestArcBond = await db.query.circleActions.findFirst({ where: sql`${circleActions.actionType} in ('arc_bond', 'bond_call')`, orderBy: desc(circleActions.createdAt) });
  const latestThesisUnlock = await db.query.circleActions.findFirst({ where: sql`${circleActions.actionType} in ('thesis_unlock', 'unlock_thesis')`, orderBy: desc(circleActions.createdAt) });
  const gatewayConfig = gatewayRuntimeConfig();
  const gatewayBalances = gatewayConfig.enabled ? await getGatewayBalancesByChain().catch((error) => [{ enabled: true, status: "failed" as const, chain: gatewayConfig.chain, error: error instanceof Error ? error.message : String(error) }]) : [];
  const primaryGatewayBalance = gatewayBalances.find((balance) => balance.chain === gatewayConfig.chain) || gatewayBalances[0];
  const latestX402Metadata = objectMetadata(latestX402Payment?.metadata);

  return {
    counts,
    latestRuns,
    latestLiveCall: latestCalls.find((call) => call.status === "published" && !call.legacy),
    awaitingResolution: latestCalls.filter((call) => call.status === "expired"),
    resolvedCalls: latestCalls.filter((call) => call.status === "resolved"),
    latestUnlock: latestUnlocks[0],
    latestCircleActions,
    latestX402Payment,
    latestArcBond,
    latestThesisUnlock,
    circleStack: {
      gatewayX402Enabled: gatewayConfig.enabled,
      gatewayX402Required: process.env.REQUIRE_CIRCLE_GATEWAY_X402 === "true",
      gatewayChain: gatewayConfig.chain,
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
      latestX402SelectedChain: typeof latestX402Metadata.selectedChain === "string" ? latestX402Metadata.selectedChain : latestX402Payment?.chain,
      latestX402FailureReason: typeof latestX402Metadata.failureReason === "string" ? latestX402Metadata.failureReason : latestX402Payment?.error,
      latestX402SupportChecks: latestX402Metadata.supportChecks,
      gatewayError: primaryGatewayBalance?.error,
    },
    config: {
      database: Boolean(process.env.DATABASE_URL),
      registry: Boolean(process.env.PRECALL_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS),
      model: Boolean(process.env.OPENAI_API_KEY),
      circleEnrichment: gatewayConfig.enabled,
      circleWallet: Boolean(gatewayConfig.privateKey),
      workerTriggerConfigured: Boolean(process.env.WORKER_TRIGGER_URL && process.env.WORKER_TRIGGER_SECRET),
      scheduledWorkersDisabled: process.env.DISABLE_SCHEDULED_WORKERS === "true",
    },
  };
}
