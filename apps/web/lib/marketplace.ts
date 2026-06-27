import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createDb } from "@precall/shared/db/client";
import {
  agentConfigs,
  agentPayouts,
  agentRevenueEvents,
  agents,
  calls,
  feedback,
  follows,
  markets,
  resolutions,
  sportsPredictions,
  sportsUnlocks,
  thesisUnlocks,
} from "@precall/shared/db/schema";
import { getCalls } from "./queries";

const marketplaceActiveSportsStatuses = ["strong_call", "lean_call", "high_risk_call", "avoid_call"] as const;

function activeSportsPredicate(statuses: readonly string[] = marketplaceActiveSportsStatuses) {
  return and(
    inArray(sportsPredictions.status, [...statuses]),
    eq(sportsPredictions.resolutionStatus, "unresolved"),
    sql`(${sportsPredictions.expiresAt} is null or ${sportsPredictions.expiresAt} > now())`
  );
}

const sportsStatusRank = sql`case ${sportsPredictions.status}
  when 'strong_call' then 1
  when 'lean_call' then 2
  when 'high_risk_call' then 3
  when 'avoid_call' then 4
  else 5
end`;

type AgentMeta = {
  id: number;
  name: string;
  role: string;
  ownerWallet: string;
  active: boolean;
  slug: string | null;
  tagline: string | null;
  strategyMode: string | null;
  riskProfile: string | null;
  reviewStatus: string | null;
  visibility: string | null;
  unlockPriceUsdc: string | null;
  agentShareBps: number | null;
  platformShareBps: number | null;
};

async function getAgentMetaMap(agentIds: number[]) {
  if (!agentIds.length) return new Map<number, AgentMeta>();
  const rows = await createDb()
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      ownerWallet: agents.ownerWallet,
      active: agents.active,
      slug: agentConfigs.slug,
      tagline: agentConfigs.tagline,
      strategyMode: agentConfigs.strategyMode,
      riskProfile: agentConfigs.riskProfile,
      reviewStatus: agentConfigs.reviewStatus,
      visibility: agentConfigs.visibility,
      unlockPriceUsdc: agentConfigs.unlockPriceUsdc,
      agentShareBps: agentConfigs.agentShareBps,
      platformShareBps: agentConfigs.platformShareBps,
    })
    .from(agents)
    .leftJoin(agentConfigs, eq(agentConfigs.agentId, agents.id))
    .where(inArray(agents.id, agentIds));

  return new Map(rows.map((row) => [row.id, row]));
}

function sportsUnlockableStatus(status: string) {
  return status === "avoid_call" ? "high_risk_call" : status;
}

export async function getMarketplaceSportsPredictions(limit = 12, statuses: readonly string[] = marketplaceActiveSportsStatuses) {
  const db = createDb();
  const rows = await db
    .select()
    .from(sportsPredictions)
    .where(activeSportsPredicate(statuses))
    .orderBy(sportsStatusRank, desc(sportsPredictions.agentProbabilityBps), desc(sportsPredictions.marketPriceBps), desc(sportsPredictions.confidenceBps), desc(sportsPredictions.edgeBps), desc(sportsPredictions.updatedAt))
    .limit(limit);

  const agentMap = await getAgentMetaMap([...new Set(rows.map((row) => row.agentId))]);
  return rows.map((row) => {
    const meta = agentMap.get(row.agentId);
    return {
      ...row,
      status: sportsUnlockableStatus(row.status),
      agentName: meta?.name || `Agent ${row.agentId}`,
      agentRole: meta?.role || "Hosted prediction market agent",
      agentSlug: meta?.slug || null,
      agentTagline: meta?.tagline || "",
      agentOwnerWallet: meta?.ownerWallet || "",
      agentReviewStatus: meta?.reviewStatus || null,
      agentVisibility: meta?.visibility || null,
    };
  });
}

export type MarketplaceSportsPredictionRow = Awaited<ReturnType<typeof getMarketplaceSportsPredictions>>[number];

export async function getMarketplaceSportsPrediction(id: number) {
  const db = createDb();
  const row = await db.query.sportsPredictions.findFirst({ where: eq(sportsPredictions.id, id) });
  if (!row) return null;
  const meta = (await getAgentMetaMap([row.agentId])).get(row.agentId);
  return {
    ...row,
    status: sportsUnlockableStatus(row.status),
    agentName: meta?.name || `Agent ${row.agentId}`,
    agentRole: meta?.role || "Hosted prediction market agent",
    agentSlug: meta?.slug || null,
    agentTagline: meta?.tagline || "",
    agentOwnerWallet: meta?.ownerWallet || "",
    agentReviewStatus: meta?.reviewStatus || null,
    agentVisibility: meta?.visibility || null,
  };
}

export async function getMarketplaceLeaderboard() {
  const db = createDb();
  const rows = await db
    .select({
      agentId: agents.id,
      name: agents.name,
      role: agents.role,
      ownerWallet: agents.ownerWallet,
      active: agents.active,
      slug: agentConfigs.slug,
      tagline: agentConfigs.tagline,
      strategyMode: agentConfigs.strategyMode,
      riskProfile: agentConfigs.riskProfile,
      reviewStatus: agentConfigs.reviewStatus,
      visibility: agentConfigs.visibility,
      unlockPriceUsdc: agentConfigs.unlockPriceUsdc,
      agentShareBps: agentConfigs.agentShareBps,
      platformShareBps: agentConfigs.platformShareBps,
      bondedCalls: sql<number>`(select count(*)::int from ${calls} c where c.agent_id = agents.id)`,
      liveBondedCalls: sql<number>`(select count(*)::int from ${calls} c where c.agent_id = agents.id and c.status = 'published' and c.legacy = false and (c.expires_at is null or c.expires_at > now()))`,
      bondedResolved: sql<number>`(select count(*)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id)`,
      bondedWins: sql<number>`(select count(*)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id and r.roi_bps > 0)`,
      bondedLosses: sql<number>`(select count(*)::int from ${resolutions} r inner join ${calls} c on c.id = r.call_id where c.agent_id = agents.id and r.roi_bps <= 0)`,
      liveSportsCalls: sql<number>`(select count(*)::int from ${sportsPredictions} sp where sp.agent_id = agents.id and sp.status in ('strong_call', 'lean_call', 'high_risk_call', 'avoid_call') and (sp.expires_at is null or sp.expires_at > now()) and sp.event_start_time is not null and sp.event_start_time > now())`,
      sportsResolved: sql<number>`(select count(*)::int from ${sportsPredictions} sp where sp.agent_id = agents.id and sp.resolution_status = 'resolved')`,
      sportsWins: sql<number>`(select count(*)::int from ${sportsPredictions} sp where sp.agent_id = agents.id and sp.resolution_status = 'resolved' and sp.resolved_outcome_index is not null and sp.resolved_outcome_index = sp.selected_outcome_index)`,
      sportsLosses: sql<number>`(select count(*)::int from ${sportsPredictions} sp where sp.agent_id = agents.id and sp.resolution_status = 'resolved' and sp.resolved_outcome_index is not null and sp.resolved_outcome_index <> sp.selected_outcome_index)`,
      sportsPushes: sql<number>`(select count(*)::int from ${sportsPredictions} sp where sp.agent_id = agents.id and sp.resolution_status = 'resolved' and sp.resolved_outcome_index is null)`,
      thesisUnlocks: sql<number>`(select count(*)::int from ${thesisUnlocks} u inner join ${calls} c on c.id = u.call_id where c.agent_id = agents.id)`,
      sportsUnlocks: sql<number>`(select count(*)::int from ${sportsUnlocks} u inner join ${sportsPredictions} sp on sp.id = u.sports_prediction_id where sp.agent_id = agents.id)`,
      followers: sql<number>`(select count(*)::int from ${follows} f where f.agent_id = agents.id)`,
      feedbackCount: sql<number>`(select count(*)::int from ${feedback} fb where fb.agent_id = agents.id)`,
      avgBrier: sql<number>`coalesce((
        select avg(score)::int
        from (
          select r.brier_score_bps::numeric as score
          from ${resolutions} r
          inner join ${calls} c on c.id = r.call_id
          where c.agent_id = agents.id
          union all
          select case
            when sp.resolved_outcome_index is null then 0::numeric
            when sp.resolved_outcome_index = sp.selected_outcome_index then round(power((sp.agent_probability_bps - 10000)::numeric / 10000, 2) * 10000)
            else round(power(sp.agent_probability_bps::numeric / 10000, 2) * 10000)
          end::numeric as score
          from ${sportsPredictions} sp
          where sp.agent_id = agents.id and sp.resolution_status = 'resolved'
        ) scores
      ), 0)`,
      avgRoi: sql<number>`coalesce((
        select avg(score)::int
        from (
          select r.roi_bps::numeric as score
          from ${resolutions} r
          inner join ${calls} c on c.id = r.call_id
          where c.agent_id = agents.id
          union all
          select case
            when sp.resolved_outcome_index is null then 0::numeric
            when sp.resolved_outcome_index = sp.selected_outcome_index then round(((10000 - greatest(sp.market_price_bps, 1))::numeric / greatest(sp.market_price_bps, 1)) * 10000)
            else -10000::numeric
          end::numeric as score
          from ${sportsPredictions} sp
          where sp.agent_id = agents.id and sp.resolution_status = 'resolved'
        ) scores
      ), 0)`,
      accruedRevenueUsdc: sql<string>`coalesce((select sum(evt.agent_share_usdc)::text from ${agentRevenueEvents} evt where evt.agent_id = agents.id and evt.status = 'accrued'), '0')`,
      grossRevenueUsdc: sql<string>`coalesce((select sum(evt.gross_amount_usdc)::text from ${agentRevenueEvents} evt where evt.agent_id = agents.id), '0')`,
      paidOutRevenueUsdc: sql<string>`coalesce((select sum(evt.agent_share_usdc)::text from ${agentRevenueEvents} evt where evt.agent_id = agents.id and evt.status = 'paid_out'), '0')`,
      payoutCount: sql<number>`(select count(*)::int from ${agentPayouts} payout where payout.agent_id = agents.id)`,
      paidPayoutCount: sql<number>`(select count(*)::int from ${agentPayouts} payout where payout.agent_id = agents.id and payout.status = 'paid')`,
      totalPayoutUsdc: sql<string>`coalesce((select sum(payout.amount_usdc)::text from ${agentPayouts} payout where payout.agent_id = agents.id and payout.status = 'paid'), '0')`,
    })
    .from(agents)
    .leftJoin(agentConfigs, eq(agentConfigs.agentId, agents.id));

  return rows
    .map((row) => {
      const resolved = Number(row.bondedResolved || 0) + Number(row.sportsResolved || 0);
      const wins = Number(row.bondedWins || 0) + Number(row.sportsWins || 0);
      const losses = Number(row.bondedLosses || 0) + Number(row.sportsLosses || 0);
      const pushes = Number(row.sportsPushes || 0);
      const published = Number(row.liveBondedCalls || 0) + Number(row.liveSportsCalls || 0);
      const unlocks = Number(row.thesisUnlocks || 0) + Number(row.sportsUnlocks || 0);
      const decided = wins + losses;
      const winRate = decided ? Math.round((wins / decided) * 100) : 0;
      return {
        ...row,
        resolved,
        wins,
        losses,
        pushes,
        published,
        unlocks,
        winRate,
      };
    })
    .sort((left, right) =>
      right.wins - left.wins ||
      right.winRate - left.winRate ||
      right.resolved - left.resolved ||
      right.unlocks - left.unlocks ||
      Number(right.followers || 0) - Number(left.followers || 0),
    );
}

export type MarketplaceLeaderboardRow = Awaited<ReturnType<typeof getMarketplaceLeaderboard>>[number];

export async function getMarketplaceResolvedHistory(limit = 25) {
  const db = createDb();
  const bonded = await db
    .select({
      kind: sql<string>`'Bonded Arc'`,
      itemId: calls.id,
      marketId: calls.marketId,
      marketTitle: markets.title,
      marketUrl: markets.url,
      subtitle: sql<string>`case when ${calls.action} = 'BUY_NO' then 'Agent side: NO' when ${calls.action} = 'BUY_YES' then 'Agent side: YES' else ${calls.action} end`,
      agentId: agents.id,
      agentName: agents.name,
      agentSlug: agentConfigs.slug,
      outcome: resolutions.finalOutcome,
      result: sql<string>`case when ${resolutions.roiBps} > 0 then 'Win' else 'Loss' end`,
      roiBps: resolutions.roiBps,
      brierScoreBps: resolutions.brierScoreBps,
      resolvedAt: resolutions.createdAt,
    })
    .from(resolutions)
    .innerJoin(calls, eq(resolutions.callId, calls.id))
    .leftJoin(markets, eq(calls.marketId, markets.marketId))
    .leftJoin(agents, eq(calls.agentId, agents.id))
    .leftJoin(agentConfigs, eq(agentConfigs.agentId, agents.id))
    .orderBy(desc(resolutions.createdAt))
    .limit(limit);

  const pushedExpr = sql`${sportsPredictions.resolvedOutcomeIndex} is null`;
  const wonExpr = sql`${sportsPredictions.resolvedOutcomeIndex} = ${sportsPredictions.selectedOutcomeIndex}`;
  const sports = await db
    .select({
      kind: sql<string>`'Sports Live'`,
      itemId: sportsPredictions.id,
      marketId: sportsPredictions.marketId,
      marketTitle: sportsPredictions.marketTitle,
      marketUrl: sportsPredictions.marketUrl,
      subtitle: sql<string>`${sportsPredictions.category} || ' · ' || ${sportsPredictions.marketKind} || ' · AI side: ' || ${sportsPredictions.selectedOption}`,
      agentId: agents.id,
      agentName: agents.name,
      agentSlug: agentConfigs.slug,
      outcome: sportsPredictions.resolvedOutcome,
      result: sql<string>`case when ${pushedExpr} then 'Push' when ${wonExpr} then 'Win' else 'Loss' end`,
      roiBps: sql<number>`case when ${pushedExpr} then 0 when ${wonExpr} then round(((10000 - greatest(${sportsPredictions.marketPriceBps}, 1))::numeric / greatest(${sportsPredictions.marketPriceBps}, 1)) * 10000)::int else -10000 end`,
      brierScoreBps: sql<number>`case when ${pushedExpr} then 0 when ${wonExpr} then round(power((${sportsPredictions.agentProbabilityBps} - 10000)::numeric / 10000, 2) * 10000)::int else round(power(${sportsPredictions.agentProbabilityBps}::numeric / 10000, 2) * 10000)::int end`,
      resolvedAt: sportsPredictions.resolvedAt,
    })
    .from(sportsPredictions)
    .leftJoin(agents, eq(sportsPredictions.agentId, agents.id))
    .leftJoin(agentConfigs, eq(agentConfigs.agentId, agents.id))
    .where(sql`${sportsPredictions.resolutionStatus} = 'resolved'`)
    .orderBy(desc(sportsPredictions.resolvedAt))
    .limit(limit);

  return [...bonded, ...sports]
    .sort((left, right) => new Date(String(right.resolvedAt || 0)).getTime() - new Date(String(left.resolvedAt || 0)).getTime())
    .slice(0, limit)
    .map((row) => ({
      ...row,
      href: row.kind === 'Bonded Arc' ? `/calls/${row.itemId}` : `/sports#sports-call-${row.itemId}`,
      agentHref: row.agentId ? `/agents/${row.agentId}` : null,
    }));
}

export type MarketplaceResolvedHistoryRow = Awaited<ReturnType<typeof getMarketplaceResolvedHistory>>[number];

export async function getMarketplaceAgentProfile(id: number) {
  const db = createDb();
  const [agentRow] = await db
    .select({
      id: agents.id,
      onchainAgentId: agents.onchainAgentId,
      name: agents.name,
      role: agents.role,
      ownerWallet: agents.ownerWallet,
      metadataUri: agents.metadataUri,
      active: agents.active,
      createdAt: agents.createdAt,
      slug: agentConfigs.slug,
      tagline: agentConfigs.tagline,
      description: agentConfigs.description,
      categoryScope: agentConfigs.categoryScope,
      strategyMode: agentConfigs.strategyMode,
      riskProfile: agentConfigs.riskProfile,
      unlockPriceUsdc: agentConfigs.unlockPriceUsdc,
      dailyX402BudgetUsdc: agentConfigs.dailyX402BudgetUsdc,
      maxX402PaymentUsdc: agentConfigs.maxX402PaymentUsdc,
      maxCallsPerRun: agentConfigs.maxCallsPerRun,
      requireX402: agentConfigs.requireX402,
      reviewStatus: agentConfigs.reviewStatus,
      visibility: agentConfigs.visibility,
      agentShareBps: agentConfigs.agentShareBps,
      platformShareBps: agentConfigs.platformShareBps,
    })
    .from(agents)
    .leftJoin(agentConfigs, eq(agentConfigs.agentId, agents.id))
    .where(eq(agents.id, id))
    .limit(1);
  if (!agentRow) return null;

  const leaderboard = await getMarketplaceLeaderboard();
  const stats = leaderboard.find((row) => row.agentId === id) || null;
  const allCalls = await getCalls(200);
  const bondedCalls = allCalls.filter((call) => call.agentId === id && call.status === 'published' && !call.legacy && (!call.expiresAt || new Date(call.expiresAt).getTime() > Date.now()));
  const sportsCalls = await getMarketplaceSportsPredictions(80);
  const agentSportsCalls = sportsCalls.filter((call) => call.agentId === id);
  const revenueEvents = await db.query.agentRevenueEvents.findMany({ where: eq(agentRevenueEvents.agentId, id), orderBy: desc(agentRevenueEvents.createdAt), limit: 20 });
  const payouts = await db.query.agentPayouts.findMany({ where: eq(agentPayouts.agentId, id), orderBy: desc(agentPayouts.createdAt), limit: 20 });
  const [followStats] = await db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.agentId, id));
  const [feedbackStats] = await db.select({ feedbackCount: sql<number>`count(*)::int` }).from(feedback).where(eq(feedback.agentId, id));
  const resolvedHistory = (await getMarketplaceResolvedHistory(80)).filter((item) => item.agentId === id).slice(0, 20);

  return {
    agent: agentRow,
    stats,
    bondedCalls,
    sportsCalls: agentSportsCalls,
    revenueEvents,
    payouts,
    followers: followStats?.followers ?? 0,
    feedbackCount: feedbackStats?.feedbackCount ?? 0,
    resolvedHistory,
  };
}

export async function getOwnedAgents(ownerWallet: string) {
  const normalized = ownerWallet.trim().toLowerCase();
  if (!normalized) return [];
  const leaderboard = await getMarketplaceLeaderboard();
  return leaderboard.filter((row) => String(row.ownerWallet || '').toLowerCase() === normalized);
}

export async function getAgentEarnings(agentId: number) {
  const db = createDb();
  const [summary] = await db
    .select({
      grossRevenueUsdc: sql<string>`coalesce(sum(${agentRevenueEvents.grossAmountUsdc})::text, '0')`,
      accruedRevenueUsdc: sql<string>`coalesce(sum(case when ${agentRevenueEvents.status} = 'accrued' then ${agentRevenueEvents.agentShareUsdc} else 0 end)::text, '0')`,
      paidRevenueUsdc: sql<string>`coalesce(sum(case when ${agentRevenueEvents.status} = 'paid_out' then ${agentRevenueEvents.agentShareUsdc} else 0 end)::text, '0')`,
      totalEvents: sql<number>`count(*)::int`,
    })
    .from(agentRevenueEvents)
    .where(eq(agentRevenueEvents.agentId, agentId));
  const events = await db.query.agentRevenueEvents.findMany({ where: eq(agentRevenueEvents.agentId, agentId), orderBy: desc(agentRevenueEvents.createdAt), limit: 50 });
  const payouts = await db.query.agentPayouts.findMany({ where: eq(agentPayouts.agentId, agentId), orderBy: desc(agentPayouts.createdAt), limit: 20 });
  return {
    summary: summary || { grossRevenueUsdc: '0', accruedRevenueUsdc: '0', paidRevenueUsdc: '0', totalEvents: 0 },
    events,
    payouts,
  };
}

export async function getMarketplaceMetrics() {
  const db = createDb();
  const [metrics] = await db
    .select({
      activeAgents: sql<number>`count(*) filter (where ${agentConfigs.reviewStatus} = 'active' and ${agents.active} = true and ${agentConfigs.visibility} = 'public')::int`,
      pendingAgents: sql<number>`count(*) filter (where ${agentConfigs.reviewStatus} = 'pending_review')::int`,
      pausedAgents: sql<number>`count(*) filter (where ${agentConfigs.reviewStatus} = 'paused' or ${agents.active} = false)::int`,
      grossRevenueUsdc: sql<string>`coalesce((select sum(${agentRevenueEvents.grossAmountUsdc})::text from ${agentRevenueEvents}), '0')`,
      accruedRevenueUsdc: sql<string>`coalesce((select sum(${agentRevenueEvents.agentShareUsdc})::text from ${agentRevenueEvents} where ${agentRevenueEvents.status} = 'accrued'), '0')`,
      paidRevenueUsdc: sql<string>`coalesce((select sum(${agentRevenueEvents.agentShareUsdc})::text from ${agentRevenueEvents} where ${agentRevenueEvents.status} = 'paid_out'), '0')`,
      payoutVolumeUsdc: sql<string>`coalesce((select sum(${agentPayouts.amountUsdc})::text from ${agentPayouts} where ${agentPayouts.status} = 'paid'), '0')`,
      totalRevenueEvents: sql<number>`(select count(*)::int from ${agentRevenueEvents})`,
    })
    .from(agents)
    .leftJoin(agentConfigs, eq(agentConfigs.agentId, agents.id))
    .limit(1);

  const leaderboard = await getMarketplaceLeaderboard();
  return {
    ...(metrics || {
      activeAgents: 0,
      pendingAgents: 0,
      pausedAgents: 0,
      grossRevenueUsdc: '0',
      accruedRevenueUsdc: '0',
      paidRevenueUsdc: '0',
      payoutVolumeUsdc: '0',
      totalRevenueEvents: 0,
    }),
    topPerformingAgents: leaderboard.slice(0, 5),
    topEarningAgents: [...leaderboard].sort((left, right) => Number(right.accruedRevenueUsdc || 0) - Number(left.accruedRevenueUsdc || 0) || right.unlocks - left.unlocks).slice(0, 5),
  };
}
