import { desc, eq, sql } from "drizzle-orm";
import { createDb } from "@precall/shared/db/client";
import {
  agents,
  calls,
  evidenceItems,
  feedback,
  follows,
  markets,
  resolutions,
  thesisUnlocks,
} from "@precall/shared/db/schema";

export type CallRow = Awaited<ReturnType<typeof getCalls>>[number];

export async function getCalls(limit = 30) {
  const db = createDb();
  return db
    .select({
      id: calls.id,
      onchainCallId: calls.onchainCallId,
      action: calls.action,
      marketPriceBps: calls.marketPriceBps,
      agentProbabilityBps: calls.agentProbabilityBps,
      edgeBps: calls.edgeBps,
      confidenceBps: calls.confidenceBps,
      suggestedSizeBps: calls.suggestedSizeBps,
      bondAmount: calls.bondAmount,
      unlockPrice: calls.unlockPrice,
      status: calls.status,
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
    })
    .from(calls)
    .leftJoin(markets, eq(calls.marketId, markets.marketId))
    .leftJoin(agents, eq(calls.agentId, agents.id))
    .orderBy(desc(calls.publishedAt))
    .limit(limit);
}

export async function getCall(id: number) {
  const db = createDb();
  const [row] = await db
    .select({
      id: calls.id,
      onchainCallId: calls.onchainCallId,
      action: calls.action,
      marketPriceBps: calls.marketPriceBps,
      agentProbabilityBps: calls.agentProbabilityBps,
      edgeBps: calls.edgeBps,
      confidenceBps: calls.confidenceBps,
      suggestedSizeBps: calls.suggestedSizeBps,
      bondAmount: calls.bondAmount,
      unlockPrice: calls.unlockPrice,
      status: calls.status,
      txHash: calls.txHash,
      copyUrl: calls.copyUrl,
      publishedAt: calls.publishedAt,
      expiresAt: calls.expiresAt,
      thesis: calls.thesis,
      counterarguments: calls.counterarguments,
      marketTitle: markets.title,
      marketUrl: markets.url,
      outcomes: markets.outcomes,
      liquidityUsd: markets.liquidityUsd,
      agentId: agents.id,
      agentName: agents.name,
    })
    .from(calls)
    .leftJoin(markets, eq(calls.marketId, markets.marketId))
    .leftJoin(agents, eq(calls.agentId, agents.id))
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
      unlocks: sql<number>`count(distinct ${thesisUnlocks.id})::int`,
      resolved: sql<number>`count(distinct ${resolutions.id})::int`,
      followers: sql<number>`count(distinct ${follows.id})::int`,
      avgBrier: sql<number>`coalesce(avg(${resolutions.brierScoreBps}), 0)::int`,
    })
    .from(agents)
    .leftJoin(calls, eq(calls.agentId, agents.id))
    .leftJoin(thesisUnlocks, eq(thesisUnlocks.callId, calls.id))
    .leftJoin(resolutions, eq(resolutions.callId, calls.id))
    .leftJoin(follows, eq(follows.agentId, agents.id))
    .groupBy(agents.id)
    .orderBy(sql`count(distinct ${thesisUnlocks.id}) desc`, sql`count(distinct ${calls.id}) desc`);
}

export async function getAgent(id: number) {
  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, id) });
  const agentCalls = await getCalls(100);
  const [followStats] = await db
    .select({ followers: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.agentId, id));
  const [feedbackStats] = await db
    .select({ feedbackCount: sql<number>`count(*)::int` })
    .from(feedback)
    .where(eq(feedback.agentId, id));

  return {
    agent,
    calls: agentCalls.filter((call) => call.agentId === id),
    followers: followStats?.followers ?? 0,
    feedbackCount: feedbackStats?.feedbackCount ?? 0,
  };
}
