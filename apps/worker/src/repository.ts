import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createDbConnection, type PrecallDb } from "@precall/shared/db/client";
import {
  agents,
  agentRuns,
  calls,
  circleActions,
  evidenceItems,
  markets,
  marketSnapshots,
  resolutions,
} from "@precall/shared/db/schema";
import { hashText } from "@precall/shared/scoring";
import type { AggregatedCall, CircleActionType, EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "@precall/shared/types";

let dbClient: PrecallDb | undefined;
let closeDbClient: (() => Promise<void>) | undefined;

function db() {
  if (!dbClient) {
    const connection = createDbConnection();
    dbClient = connection.db;
    closeDbClient = () => connection.client.end();
  }
  return dbClient;
}

export async function closeRepository() {
  if (!closeDbClient) return;
  await closeDbClient();
  dbClient = undefined;
  closeDbClient = undefined;
}

export async function upsertMarket(market: PolymarketMarket) {
  await db()
    .insert(markets)
    .values({
      source: market.source,
      marketId: market.marketId,
      conditionId: market.conditionId,
      slug: market.slug,
      title: market.title,
      url: market.url,
      outcomes: market.outcomes,
      closeTime: market.closeTime ? new Date(market.closeTime) : null,
      liquidityUsd: String(market.liquidityUsd),
      status: market.status,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [markets.source, markets.marketId],
      set: {
        title: market.title,
        url: market.url,
        outcomes: market.outcomes,
        liquidityUsd: String(market.liquidityUsd),
        status: market.status,
        updatedAt: new Date(),
      },
    });
}

export async function insertSnapshot(snapshot: MarketSnapshot) {
  await db().insert(marketSnapshots).values({
    marketId: snapshot.marketId,
    yesPriceBps: snapshot.yesPriceBps,
    noPriceBps: snapshot.noPriceBps,
    spreadBps: snapshot.spreadBps,
    depthUsd: String(snapshot.depthUsd),
    capturedAt: new Date(snapshot.capturedAt),
  });
}

export async function ensureCouncilAgent(input: { onchainAgentId: number | undefined; ownerWallet: string }) {
  const existing = await db().query.agents.findFirst({ where: eq(agents.name, "Precall Council") });
  if (existing) return existing;

  const [created] = await db()
    .insert(agents)
    .values({
      name: "Precall Council",
      role: "Five-role reasoning council: MacroScout, NewsHawk, CrowdPulse, BookWatcher, and Skeptic run as separate model calls.",
      ownerWallet: input.ownerWallet,
      onchainAgentId: input.onchainAgentId,
      metadataUri: "https://precall.arena/agents/precall-council",
      active: true,
    })
    .returning();
  if (!created) throw new Error("Failed to create Precall Council agent row.");
  return created;
}

export async function recordAgentRun(input: {
  status: string;
  model: string;
  inputs: unknown;
  outputs?: unknown;
  costs?: unknown;
  failure?: string;
  publishedCallId?: number;
  evidenceContext?: unknown;
  retryCount?: number;
  latencyMs?: number;
}) {
  const [row] = await db()
    .insert(agentRuns)
    .values({
      status: input.status,
      model: input.model,
      inputs: input.inputs,
      outputs: input.outputs,
      costs: input.costs,
      failure: input.failure,
      publishedCallId: input.publishedCallId,
      evidenceContext: input.evidenceContext,
      retryCount: input.retryCount ?? 0,
      latencyMs: input.latencyMs ?? 0,
    })
    .returning();
  return row;
}

export async function getAgentRunById(id: number) {
  return db().query.agentRuns.findFirst({ where: eq(agentRuns.id, id) });
}

export async function insertPublishedCall(input: {
  agentId: number;
  onchainCallId: number | undefined;
  txHash: string | undefined;
  registryAddress: string;
  call: AggregatedCall;
  bondAmount: string;
  unlockPrice: string;
  copyUrl: string;
}) {
  const [row] = await db()
    .insert(calls)
    .values({
      agentId: input.agentId,
      onchainCallId: input.onchainCallId,
      marketId: input.call.market.marketId,
      action: input.call.action,
      marketPriceBps: input.call.marketPriceBps,
      agentProbabilityBps: input.call.yesProbabilityBps,
      yesProbabilityBps: input.call.yesProbabilityBps,
      edgeBps: input.call.edgeBps,
      confidenceBps: input.call.confidenceBps,
      suggestedSizeBps: input.call.suggestedSizeBps,
      thesisHash: hashText(input.call.thesis),
      evidenceHash: hashText(JSON.stringify(input.call.evidence)),
      thesis: input.call.thesis,
      counterarguments: input.call.counterarguments,
      bondAmount: input.bondAmount,
      unlockPrice: input.unlockPrice,
      status: input.txHash ? "published" : "draft",
      statusReason: "Passed strict V1 YES/NO eligibility and quality gates.",
      marketType: input.call.marketType,
      registryAddress: input.registryAddress,
      legacy: false,
      txHash: input.txHash,
      copyUrl: input.copyUrl,
      expiresAt: input.call.market.closeTime ? new Date(input.call.market.closeTime) : null,
    })
    .returning();
  if (!row) throw new Error("Failed to insert published call.");

  await insertEvidenceItems(row.id, input.call.evidence);
  return row;
}

export async function insertEvidenceItems(callId: number, evidence: EvidenceItemInput[]) {
  for (const item of evidence) {
    await db().insert(evidenceItems).values({
      callId,
      sourceUrl: item.sourceUrl,
      title: item.title,
      excerpt: item.excerpt,
      credibilityScore: item.credibilityScore,
      evidenceId: item.evidenceId,
      sourceType: item.sourceType,
      provider: item.provider,
      fetchedAt: new Date(item.fetchedAt),
      capturedAt: new Date(item.capturedAt),
      paid: item.paid,
      paymentAmountUsdc: item.paymentAmountUsdc,
      paymentNetwork: item.paymentNetwork,
      paymentRef: item.paymentRef,
      txHash: item.txHash,
      metadata: item.metadata,
    });
  }
}

export async function getOpenPublishedCalls() {
  return db().query.calls.findMany({
    where: inArray(calls.status, ["published", "expired"]),
    orderBy: desc(calls.publishedAt),
  });
}

export async function markExpiredCalls(now = new Date()) {
  const expired = await db()
    .update(calls)
    .set({ status: "expired", statusReason: "Expired and awaiting supported market resolution." })
    .where(and(eq(calls.status, "published"), lt(calls.expiresAt, now)))
    .returning({ id: calls.id, marketId: calls.marketId });
  return expired;
}

export async function markCallResolving(callId: number) {
  await db().update(calls).set({ status: "resolving", statusReason: "Resolution worker is checking market outcome." }).where(eq(calls.id, callId));
}

export async function markCallResolutionFailed(callId: number, reason: string) {
  await db().update(calls).set({ status: "failed_resolution", statusReason: reason.slice(0, 500) }).where(eq(calls.id, callId));
}

export async function insertResolution(input: {
  callId: number;
  finalOutcome: string;
  finalPriceBps: number;
  roiBps: number;
  brierScoreBps: number;
  resolverTx: string | undefined;
}) {
  await db().insert(resolutions).values(input).onConflictDoNothing();
  await db().update(calls).set({ status: "resolved", statusReason: "Resolved with supported YES/NO market outcome." }).where(eq(calls.id, input.callId));
}

export type CircleActionInput = {
  actionType: CircleActionType;
  provider?: string | undefined;
  url?: string | undefined;
  walletAddress?: string | undefined;
  amount?: string | undefined;
  amountUsdc?: string | undefined;
  chain?: string | undefined;
  txHash?: string | undefined;
  paymentReference?: string | undefined;
  paymentRef?: string | undefined;
  relatedMarketId?: string | undefined;
  relatedCallId?: number | undefined;
  agentRunId?: number | undefined;
  relatedAgentRunId?: number | undefined;
  status?: string | undefined;
  error?: string | undefined;
  metadata?: unknown;
};

export function normalizeCircleActionInput(input: CircleActionInput) {
  const amount = input.amountUsdc || input.amount || "0";
  const paymentRef = input.paymentRef || input.paymentReference;
  const relatedAgentRunId = input.relatedAgentRunId ?? input.agentRunId;
  return {
    actionType: input.actionType,
    provider: input.provider || "",
    url: input.url,
    walletAddress: input.walletAddress || "",
    amount,
    amountUsdc: amount,
    chain: input.chain || "Arc Testnet",
    txHash: input.txHash,
    paymentReference: paymentRef,
    paymentRef,
    relatedMarketId: input.relatedMarketId,
    relatedCallId: input.relatedCallId,
    agentRunId: relatedAgentRunId,
    relatedAgentRunId,
    status: input.status || "success",
    error: input.error,
    metadata: input.metadata,
  };
}

export async function recordCircleAction(input: CircleActionInput) {
  const [row] = await db()
    .insert(circleActions)
    .values(normalizeCircleActionInput(input))
    .returning();
  return row;
}

export async function getTodayX402SpendUsdc(now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db()
    .select({ total: sql<string>`coalesce(sum(${circleActions.amountUsdc}), 0)::text` })
    .from(circleActions)
    .where(and(eq(circleActions.actionType, "x402_api_payment"), eq(circleActions.status, "success"), sql`${circleActions.createdAt} >= ${start}`));
  return row?.total || "0";
}

export async function adminSummary() {
  const [counts] = await db().select({
    calls: sql<number>`count(*)::int`,
    liveCalls: sql<number>`count(*) filter (where ${calls.status} = 'published')::int`,
    expiredCalls: sql<number>`count(*) filter (where ${calls.status} = 'expired')::int`,
    resolvedCalls: sql<number>`count(*) filter (where ${calls.status} = 'resolved')::int`,
  }).from(calls);
  const latestRuns = await db().query.agentRuns.findMany({ orderBy: desc(agentRuns.createdAt), limit: 10 });
  return { counts, latestRuns };
}
