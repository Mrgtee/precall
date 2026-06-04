import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
  sportsPredictions,
  sportsUnlocks,
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

export async function getActiveBondedCallCount() {
  const db = createDb();
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(calls)
    .where(and(eq(calls.status, "published"), eq(calls.legacy, false), sql`(${calls.expiresAt} is null or ${calls.expiresAt} > now())`));
  return row?.total ?? 0;
}

export async function getEvidence(callId: number) {
  const db = createDb();
  return db.select().from(evidenceItems).where(eq(evidenceItems.callId, callId));
}

export const activeSportsCallStatuses = ["strong_call", "lean_call", "high_risk_call", "avoid_call"] as const;

function activeSportsPredicate(statuses: readonly string[] = activeSportsCallStatuses) {
  return and(
    inArray(sportsPredictions.status, [...statuses]),
    sql`(${sportsPredictions.expiresAt} is null or ${sportsPredictions.expiresAt} > now())`,
    sql`${sportsPredictions.eventStartTime} is not null`,
    sql`${sportsPredictions.eventStartTime} > now()`,
  );
}

const sportsStatusRank = sql`case ${sportsPredictions.status}
  when 'strong_call' then 1
  when 'lean_call' then 2
  when 'high_risk_call' then 3
  when 'avoid_call' then 4
  else 5
end`;

export type SportsPredictionRow = Awaited<ReturnType<typeof getSportsPredictions>>[number];

export async function getSportsPredictions(limit = 12, statuses: readonly string[] = activeSportsCallStatuses) {
  const db = createDb();
  return db
    .select()
    .from(sportsPredictions)
    .where(activeSportsPredicate(statuses))
    .orderBy(sportsStatusRank, desc(sportsPredictions.edgeBps), desc(sportsPredictions.confidenceBps), desc(sportsPredictions.updatedAt))
    .limit(limit);
}

export async function getStrongSportsPredictions(limit = 5) {
  return getSportsPredictions(limit, ["strong_call"]);
}

export async function getTopSportsPredictions(limit = 5) {
  return getSportsPredictions(limit, ["strong_call", "lean_call", "high_risk_call"]);
}

export async function getActiveSportsCallCount() {
  const db = createDb();
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(sportsPredictions)
    .where(activeSportsPredicate());
  return row?.total ?? 0;
}

export async function getTotalUnlockCount() {
  const db = createDb();
  const [row] = await db
    .select({
      total: sql<number>`(
        (select count(*)::int from ${thesisUnlocks}) +
        (select count(*)::int from ${sportsUnlocks})
      )::int`,
    })
    .from(sql`(select 1) as unlock_counts`)
    .limit(1);
  return row?.total ?? 0;
}

export async function getSportsActivitySummary() {
  const db = createDb();
  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${sportsPredictions.status} in ('strong_call', 'lean_call', 'high_risk_call', 'avoid_call') and (${sportsPredictions.expiresAt} is null or ${sportsPredictions.expiresAt} > now()) and ${sportsPredictions.eventStartTime} is not null and ${sportsPredictions.eventStartTime} > now())::int`,
      unresolved: sql<number>`count(*) filter (where ${sportsPredictions.resolutionStatus} = 'unresolved')::int`,
      expired: sql<number>`count(*) filter (where ${sportsPredictions.status} = 'expired' or (${sportsPredictions.expiresAt} is not null and ${sportsPredictions.expiresAt} <= now()) or (${sportsPredictions.eventStartTime} is not null and ${sportsPredictions.eventStartTime} <= now()))::int`,
      unlocks: sql<number>`(select count(*)::int from ${sportsUnlocks})`,
    })
    .from(sportsPredictions);
  return row || { active: 0, unresolved: 0, expired: 0, unlocks: 0 };
}

export async function getSportsPrediction(id: number) {
  const db = createDb();
  return db.query.sportsPredictions.findFirst({ where: eq(sportsPredictions.id, id) });
}

export async function hasSportsUnlock(sportsPredictionId: number, wallet: string) {
  const db = createDb();
  const [row] = await db
    .select({ id: sportsUnlocks.id })
    .from(sportsUnlocks)
    .where(sql`${sportsUnlocks.sportsPredictionId} = ${sportsPredictionId} and lower(${sportsUnlocks.userWallet}) = lower(${wallet})`)
    .limit(1);
  return Boolean(row);
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
      calls: sql<number>`(select count(*)::int from ${calls} c where c.agent_id = agents.id)`,
      published: sql<number>`(select count(*)::int from ${calls} c where c.agent_id = agents.id and c.status = 'published' and c.legacy = false and (c.expires_at is null or c.expires_at > now()))`,
      resolved: sql<number>`(select count(*)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id)`,
      wins: sql<number>`(select count(*)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id and r.roi_bps > 0)`,
      losses: sql<number>`(select count(*)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id and r.roi_bps <= 0)`,
      unlocks: sql<number>`(select count(*)::int from ${thesisUnlocks} u inner join ${calls} c on c.id = u.call_id where c.agent_id = agents.id)`,
      followers: sql<number>`(select count(*)::int from ${follows} f where f.agent_id = agents.id)`,
      avgBrier: sql<number>`coalesce((select avg(r.brier_score_bps)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id), 0)`,
      avgRoi: sql<number>`coalesce((select avg(r.roi_bps)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id), 0)`,
    })
    .from(agents)
    .orderBy(
      sql`(select count(*) from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id) desc`,
      sql`(select count(*) from ${thesisUnlocks} u inner join ${calls} c on c.id = u.call_id where c.agent_id = agents.id) desc`,
      sql`(select count(*) from ${calls} c where c.agent_id = agents.id) desc`,
    );
}

export async function getResolvedLeaderboardCalls(limit = 25) {
  const db = createDb();
  return db
    .select({
      callId: calls.id,
      marketId: calls.marketId,
      marketTitle: markets.title,
      marketUrl: markets.url,
      action: calls.action,
      marketPriceBps: calls.marketPriceBps,
      agentProbabilityBps: calls.agentProbabilityBps,
      yesProbabilityBps: calls.yesProbabilityBps,
      agentId: agents.id,
      agentName: agents.name,
      finalOutcome: resolutions.finalOutcome,
      finalPriceBps: resolutions.finalPriceBps,
      roiBps: resolutions.roiBps,
      brierScoreBps: resolutions.brierScoreBps,
      resolverTx: resolutions.resolverTx,
      resolvedAt: resolutions.createdAt,
      publishedAt: calls.publishedAt,
    })
    .from(resolutions)
    .innerJoin(calls, eq(resolutions.callId, calls.id))
    .leftJoin(markets, eq(calls.marketId, markets.marketId))
    .leftJoin(agents, eq(calls.agentId, agents.id))
    .orderBy(desc(resolutions.createdAt))
    .limit(limit);
}

export async function getAgent(id: number) {
  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  const agentCalls = await getCalls(100);
  const [followStats] = await db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.agentId, id));
  const [feedbackStats] = await db.select({ feedbackCount: sql<number>`count(*)::int` }).from(feedback).where(eq(feedback.agentId, id));
  const now = Date.now();
  const activeAgentCalls = agentCalls.filter((call) =>
    call.agentId === id &&
    call.status === "published" &&
    !call.legacy &&
    (!call.expiresAt || new Date(call.expiresAt).getTime() > now),
  );
  return { agent, calls: activeAgentCalls, followers: followStats?.followers ?? 0, feedbackCount: feedbackStats?.feedbackCount ?? 0 };
}

export async function getDemoData() {
  const db = createDb();
  const [counts] = await db.select({
    markets: sql<number>`(select count(*)::int from ${markets})`,
    snapshots: sql<number>`(select count(*)::int from ${marketSnapshots})`,
    calls: sql<number>`(select count(*)::int from ${calls})`,
    liveCalls: sql<number>`(select count(*)::int from ${calls} where status = 'published' and legacy = false and (expires_at is null or expires_at > now()))`,
    expiredCalls: sql<number>`(select count(*)::int from ${calls} where status = 'expired')`,
    resolvedCalls: sql<number>`(select count(*)::int from ${resolutions})`,
    unlocks: sql<number>`((select count(*)::int from ${thesisUnlocks}) + (select count(*)::int from ${sportsUnlocks}))::int`,
    thesisUnlocks: sql<number>`(select count(*)::int from ${thesisUnlocks})`,
    follows: sql<number>`(select count(*)::int from ${follows})`,
    feedback: sql<number>`(select count(*)::int from ${feedback})`,
    uniqueWallets: sql<number>`(select count(distinct wallet_address)::int from ${users})`,
    unlockVolume: sql<string>`(select coalesce(sum(amount), 0)::text from ${thesisUnlocks})`,
    thesisUnlockVolume: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('thesis_unlock', 'unlock_thesis'))`,
    sportsUnlockVolume: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type = 'sports_unlock')`,
    bondVolume: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('arc_bond', 'bond_call'))`,
    x402Spend: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('x402_api_payment', 'x402_evidence_payment') and status = 'success')`,
    dailyX402Spend: sql<string>`(select coalesce(sum(amount_usdc), 0)::text from ${circleActions} where action_type in ('x402_api_payment', 'x402_evidence_payment') and status = 'success' and created_at >= date_trunc('day', now()))`,
    x402ApiPayments: sql<number>`(select count(*)::int from ${circleActions} where action_type in ('x402_api_payment', 'x402_evidence_payment'))`,
    circleActions: sql<number>`(select count(*)::int from ${circleActions})`,
    sportsIdeas: sql<number>`(select count(*)::int from ${sportsPredictions} where status in ('strong_call', 'lean_call', 'high_risk_call', 'avoid_call'))`,
    activeSportsCalls: sql<number>`(select count(*)::int from ${sportsPredictions} where status in ('strong_call', 'lean_call', 'high_risk_call', 'avoid_call') and (expires_at is null or expires_at > now()) and event_start_time is not null and event_start_time > now())`,
    expiredSportsCalls: sql<number>`(select count(*)::int from ${sportsPredictions} where status = 'expired' or (expires_at is not null and expires_at <= now()) or (event_start_time is not null and event_start_time <= now()))`,
    sportsUnlocks: sql<number>`(select count(*)::int from ${sportsUnlocks})`,
  }).from(sql`(select 1) as precall_counts`).limit(1);

  const latestRuns = await db.query.agentRuns.findMany({ orderBy: desc(agentRuns.createdAt), limit: 8 });
  const latestCalls = await getCalls(10);
  const latestSportsIdeas = await getSportsPredictions(5);
  const latestUnlocks = await db.query.thesisUnlocks.findMany({ orderBy: desc(thesisUnlocks.createdAt), limit: 5 });
  const latestCircleActions = await db.query.circleActions.findMany({ orderBy: desc(circleActions.createdAt), limit: 8 });
  const latestX402Payment = await db.query.circleActions.findFirst({ where: sql`${circleActions.actionType} in ('x402_api_payment', 'x402_evidence_payment') and ${circleActions.status} = 'success' and ${circleActions.amountUsdc} > 0`, orderBy: desc(circleActions.createdAt) });
  const latestArcBond = await db.query.circleActions.findFirst({ where: sql`${circleActions.actionType} in ('arc_bond', 'bond_call')`, orderBy: desc(circleActions.createdAt) });
  const latestThesisUnlock = await db.query.circleActions.findFirst({ where: sql`${circleActions.actionType} in ('thesis_unlock', 'unlock_thesis')`, orderBy: desc(circleActions.createdAt) });
  const gatewayConfig = gatewayRuntimeConfig();
  const gatewayBalances = gatewayConfig.enabled ? await getGatewayBalancesByChain().catch((error) => [{ enabled: true, status: "failed" as const, chain: gatewayConfig.chain, error: error instanceof Error ? error.message : String(error) }]) : [];
  const primaryGatewayBalance = gatewayBalances.find((balance) => balance.chain === gatewayConfig.chain) || gatewayBalances[0];
  const latestX402Metadata = objectMetadata(latestX402Payment?.metadata);

  return {
    counts,
    latestRuns,
    latestLiveCall: latestCalls.find((call) => call.status === "published" && !call.legacy && (!call.expiresAt || new Date(call.expiresAt).getTime() > Date.now())),
    awaitingResolution: latestCalls.filter((call) => call.status === "expired" || call.status === "failed_resolution"),
    resolvedCalls: latestCalls.filter((call) => call.status === "resolved"),
    latestUnlock: latestUnlocks[0],
    latestSportsIdeas,
    latestCircleActions,
    latestX402Payment,
    latestArcBond,
    latestThesisUnlock,
    circleStack: {
      gatewayX402Enabled: gatewayConfig.enabled,
      gatewayX402Required: process.env.REQUIRE_CIRCLE_GATEWAY_X402 === "true",
      gatewayChain: gatewayConfig.chain,
      x402PaymentNetworkLabel: gatewayConfig.paymentNetworkLabel,
      x402AcceptedNetworks: gatewayConfig.acceptedNetworks,
      x402FacilitatorUrl: gatewayConfig.facilitatorUrl,
      x402ProductionMode: gatewayConfig.productionMode,
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
