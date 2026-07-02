import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createDbConnection, type PrecallDb } from "@precall/shared/db/client";
import {
  agentConfigs,
  agents,
  agentRuns,
  calls,
  circleActions,
  evidenceItems,
  markets,
  marketSnapshots,
  resolutions,
  sportsPredictions,
} from "@precall/shared/db/schema";
import { optionalEnv } from "@precall/shared/env";
import { hashText } from "@precall/shared/scoring";
import { sportsEventTime } from "@precall/shared/sports";
import type { AggregatedCall, CircleActionType, EvidenceItemInput, MarketSnapshot, PolymarketMarket, SelectedOutcomeResolution, SportsPredictionIdea } from "@precall/shared/types";
import type { SportsCallStatus } from "@precall/shared/sports";

let dbClient: PrecallDb | undefined;
let closeDbClient: (() => Promise<void>) | undefined;


const CIRCLE_ACTIONS_REQUIRED_COLUMNS = ["amount_usdc", "action_type", "status", "created_at"] as const;
type CircleActionsRequiredColumn = typeof CIRCLE_ACTIONS_REQUIRED_COLUMNS[number];

function rowsFromSqlResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows as T[] : [];
  }
  return [];
}

export type CircleActionsSchemaHealth = {
  tableExists: boolean;
  columns: Record<CircleActionsRequiredColumn, boolean>;
  columnTypes: Partial<Record<CircleActionsRequiredColumn | "amount", string>>;
  legacyAmountColumnExists: boolean;
  ok: boolean;
  missingColumns: CircleActionsRequiredColumn[];
  error?: string | undefined;
};

function circleActionsSchemaHealthBase(tableExists: boolean, presentColumns = new Set<string>(), columnTypes: Partial<Record<CircleActionsRequiredColumn | "amount", string>> = {}): CircleActionsSchemaHealth {
  const columns = Object.fromEntries(CIRCLE_ACTIONS_REQUIRED_COLUMNS.map((column) => [column, presentColumns.has(column)])) as Record<CircleActionsRequiredColumn, boolean>;
  const missingColumns = CIRCLE_ACTIONS_REQUIRED_COLUMNS.filter((column) => !columns[column]);
  return {
    tableExists,
    columns,
    columnTypes,
    legacyAmountColumnExists: presentColumns.has("amount"),
    ok: tableExists && missingColumns.length === 0,
    missingColumns,
  };
}

export async function checkCircleActionsSchemaHealth(): Promise<CircleActionsSchemaHealth> {
  try {
    const tableResult = await db().execute(sql<{ exists: boolean }>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = current_schema()
          and table_name = 'circle_actions'
      ) as "exists"
    `);
    const tableRows = rowsFromSqlResult<{ exists: boolean }>(tableResult);
    const tableExists = Boolean(tableRows[0]?.exists);

    const columnResult = await db().execute(sql<{ column_name: string; data_type: string; udt_name: string; numeric_precision: number | null; numeric_scale: number | null }>`
      select column_name, data_type, udt_name, numeric_precision, numeric_scale
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'circle_actions'
        and column_name in ('amount_usdc', 'amount', 'action_type', 'status', 'created_at')
    `);
    const columnRows = rowsFromSqlResult<{ column_name: string; data_type: string; udt_name: string; numeric_precision: number | null; numeric_scale: number | null }>(columnResult);
    const columnTypes = Object.fromEntries(columnRows.map((row) => {
      const numericSuffix = row.numeric_precision ? `(${row.numeric_precision},${row.numeric_scale ?? 0})` : "";
      return [row.column_name, `${row.data_type}${numericSuffix}`];
    })) as Partial<Record<CircleActionsRequiredColumn | "amount", string>>;
    return circleActionsSchemaHealthBase(tableExists, new Set(columnRows.map((row) => row.column_name)), columnTypes);
  } catch (error) {
    return {
      ...circleActionsSchemaHealthBase(false),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function db() {
  if (!dbClient) {
    const connection = createDbConnection();
    dbClient = connection.db;
    closeDbClient = () => connection.client.end({ timeout: 5 });
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

async function ensurePlatformAgent(input: { name: string; role: string; ownerWallet: string; metadataUri: string; onchainAgentId?: number | undefined }) {
  const existing = await db().query.agents.findFirst({ where: eq(agents.name, input.name) });
  if (existing) return existing;

  const [created] = await db()
    .insert(agents)
    .values({
      name: input.name,
      role: input.role,
      ownerWallet: input.ownerWallet,
      onchainAgentId: input.onchainAgentId,
      metadataUri: input.metadataUri,
      active: true,
    })
    .returning();
  if (!created) throw new Error(`Failed to create ${input.name} agent row.`);
  return created;
}

export async function ensureCouncilAgent(input: { onchainAgentId: number | undefined; ownerWallet: string }) {
  return ensurePlatformAgent({
    name: "Precall Council",
    role: "Five-role reasoning council: TacticsScout, StatsEngine, SquadDesk, ContextScout, and Skeptic run as separate model calls.",
    ownerWallet: input.ownerWallet,
    onchainAgentId: input.onchainAgentId,
    metadataUri: "https://precall.arena/agents/precall-council",
  });
}

export async function ensureSportsCouncilAgent(input: { ownerWallet: string }) {
  return ensurePlatformAgent({
    name: "Precall Sports Council",
    role: "First-party hosted sports council that publishes Sports Live Calls across approved sports markets.",
    ownerWallet: input.ownerWallet,
    metadataUri: "https://precall.arena/agents/precall-sports-council",
  });
}

export type HostedSportsAgentRuntime = {
  agentId: number;
  name: string;
  role: string;
  ownerWallet: string;
  active: boolean;
  slug: string;
  tagline: string;
  description: string;
  categoryScope: string[];
  strategyMode: string;
  riskProfile: string;
  unlockPriceUsdc: string;
  dailyX402BudgetUsdc: string;
  maxX402PaymentUsdc: string;
  maxCallsPerRun: number;
  requireX402: boolean;
  reviewStatus: string;
  visibility: string;
  agentShareBps: number;
  platformShareBps: number;
};

export async function getActiveHostedSportsAgents(): Promise<HostedSportsAgentRuntime[]> {
  const rows = await db()
    .select({
      agentId: agents.id,
      name: agents.name,
      role: agents.role,
      ownerWallet: agents.ownerWallet,
      active: agents.active,
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
    .innerJoin(agentConfigs, eq(agentConfigs.agentId, agents.id))
    .where(and(eq(agents.active, true), eq(agentConfigs.reviewStatus, "active")))
    .orderBy(desc(agentConfigs.updatedAt), agents.id);

  return rows.map((row: any) => ({
    ...row,
    slug: row.slug || `agent-${row.agentId}`,
    tagline: row.tagline || "",
    description: row.description || "",
    categoryScope: Array.isArray(row.categoryScope) ? row.categoryScope.map(String) : [],
    strategyMode: row.strategyMode || "hit_rate",
    riskProfile: row.riskProfile || "balanced",
    unlockPriceUsdc: String(row.unlockPriceUsdc || "0.05"),
    dailyX402BudgetUsdc: String(row.dailyX402BudgetUsdc || "0.10"),
    maxX402PaymentUsdc: String(row.maxX402PaymentUsdc || "0.005"),
    maxCallsPerRun: Number(row.maxCallsPerRun || 1),
    requireX402: Boolean(row.requireX402),
    reviewStatus: row.reviewStatus || "active",
    visibility: row.visibility || "public",
    agentShareBps: Number(row.agentShareBps || 7000),
    platformShareBps: Number(row.platformShareBps || 3000),
  }));
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

export async function updateAgentRun(id: number, set: { status?: string; publishedCallId?: number; outputs?: unknown }) {
  await db()
    .update(agentRuns)
    .set(set)
    .where(eq(agentRuns.id, id));
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
      selectedOutcomeIndex: input.call.selectedOutcomeIndex,
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

function sportsExpiryTime(eventStartTime?: string | null, marketCloseTime?: string | null) {
  const event = eventStartTime ? new Date(eventStartTime) : null;
  if (event && Number.isFinite(event.getTime())) {
    const graceMinutes = Math.max(0, Number(optionalEnv("SPORTS_EVENT_EXPIRY_GRACE_MINUTES", "360")));
    return new Date(event.getTime() + graceMinutes * 60_000);
  }
  return marketCloseTime ? new Date(marketCloseTime) : null;
}

export async function upsertSportsPrediction(input: { agentId: number; idea: SportsPredictionIdea; sourceRunId?: number | undefined; x402Status?: unknown; status: SportsCallStatus; statusReason?: string | undefined; eventStartTime?: string | null | undefined; unlockPriceUsdc?: string | undefined }) {
  const status = input.status;
  const evidenceIds = input.idea.evidence.map((item) => item.evidenceId);
  const sourceUrls = [...new Set(input.idea.evidence.map((item) => item.sourceUrl).filter(Boolean))];
  const x402PaidEvidenceUsed = input.idea.evidence.some((item) => item.paid);

  const values = {
    agentId: input.agentId,
    marketId: input.idea.market.marketId,
    marketTitle: input.idea.market.title,
    marketUrl: input.idea.market.url,
    category: input.idea.category,
    marketKind: input.idea.marketKind,
    selectedOption: input.idea.selectedOption,
    selectedOutcomeIndex: input.idea.selectedOutcomeIndex,
    marketPriceBps: input.idea.marketPriceBps,
    agentProbabilityBps: input.idea.agentProbabilityBps,
    edgeBps: input.idea.edgeBps,
    confidenceBps: input.idea.confidenceBps,
    riskLevel: input.idea.riskLevel,
    rationale: input.idea.rationale,
    reasoning: input.idea.rationale,
    matchupContext: input.idea.matchupContext,
    marketMovement: input.idea.marketMovement,
    risks: input.idea.risks,
    verdict: input.idea.verdict,
    evidenceContext: input.idea.evidence,
    evidenceIds,
    sourceUrls,
    x402PaidEvidenceUsed,
    votes: input.idea.votes,
    x402Status: input.x402Status,
    unlockPrice: input.unlockPriceUsdc || optionalEnv("SPORTS_UNLOCK_PRICE_USDC", optionalEnv("UNLOCK_PRICE_USDC", "0.05")),
    resolutionStatus: "unresolved",
    resolvedOutcomeIndex: null,
    resolvedOutcome: null,
    resolvedAt: null,
    status,
    statusReason: input.statusReason || "Sports Live Call generated from analyzed valid sports market.",
    sourceRunId: input.sourceRunId,
    eventStartTime: input.eventStartTime ? new Date(input.eventStartTime) : null,
    expiresAt: sportsExpiryTime(input.eventStartTime, input.idea.market.closeTime),
    updatedAt: new Date(),
  };
  const [row] = await db()
    .insert(sportsPredictions)
    .values(values)
    .onConflictDoUpdate({
      target: [sportsPredictions.agentId, sportsPredictions.marketId, sportsPredictions.selectedOutcomeIndex],
      set: values,
    })
    .returning();
  if (!row) throw new Error("Failed to upsert sports prediction.");
  return row;
}

const activeSportsStatuses = ["strong_call", "lean_call", "high_risk_call", "avoid_call"];

function activeSportsSql() {
  return and(
    inArray(sportsPredictions.status, activeSportsStatuses),
    sql`(${sportsPredictions.expiresAt} is null or ${sportsPredictions.expiresAt} > now())`,
    sql`${sportsPredictions.eventStartTime} is not null`,
    sql`${sportsPredictions.eventStartTime} > now()`,
  );
}

export async function getLatestSportsPredictions(limit = 10) {
  return db().query.sportsPredictions.findMany({
    where: activeSportsSql(),
    orderBy: desc(sportsPredictions.updatedAt),
    limit,
  });
}

export async function markExpiredSportsPredictions(now = new Date()) {
  const cutoffIso = now.toISOString();
  const expired = await db()
    .update(sportsPredictions)
    .set({
      status: "expired",
      resolutionStatus: "expired",
      statusReason: "Expired sports live call. Awaiting clear selected-outcome resolution from Polymarket.",
      updatedAt: now,
    })
    .where(and(
      inArray(sportsPredictions.status, activeSportsStatuses),
      sql`((${sportsPredictions.eventStartTime} is not null and ${sportsPredictions.eventStartTime} <= ${cutoffIso}::timestamptz) or (${sportsPredictions.expiresAt} is not null and ${sportsPredictions.expiresAt} <= ${cutoffIso}::timestamptz))`,
    ))
    .returning({ id: sportsPredictions.id, marketId: sportsPredictions.marketId, selectedOutcomeIndex: sportsPredictions.selectedOutcomeIndex });
  const backfilledExpired = await backfillMissingSportsEventTimes(now);
  return [...expired, ...backfilledExpired];
}

async function backfillMissingSportsEventTimes(now: Date) {
  const candidates = await db()
    .select({
      id: sportsPredictions.id,
      marketId: sportsPredictions.marketId,
      marketTitle: sportsPredictions.marketTitle,
      marketUrl: sportsPredictions.marketUrl,
      expiresAt: sportsPredictions.expiresAt,
      selectedOutcomeIndex: sportsPredictions.selectedOutcomeIndex,
    })
    .from(sportsPredictions)
    .where(and(
      inArray(sportsPredictions.status, activeSportsStatuses),
      sql`${sportsPredictions.eventStartTime} is null`,
    ));

  const expired = [];
  for (const candidate of candidates) {
    const derivedEventTime = sportsEventTime({
      source: "polymarket",
      marketId: candidate.marketId,
      conditionId: "",
      slug: candidate.marketUrl,
      title: candidate.marketTitle,
      description: "",
      url: candidate.marketUrl,
      outcomes: [],
      outcomePrices: [],
      clobTokenIds: [],
      liquidityUsd: 0,
      volume24hUsd: 0,
      closeTime: candidate.expiresAt ? candidate.expiresAt.toISOString() : null,
      status: "active",
    });
    if (!derivedEventTime) continue;

    const eventStartTime = new Date(derivedEventTime);
    if (!Number.isFinite(eventStartTime.getTime())) continue;

    if (eventStartTime <= now) {
      const [row] = await db()
        .update(sportsPredictions)
        .set({
          eventStartTime,
          status: "expired",
          resolutionStatus: "expired",
          statusReason: "Expired sports live call. Awaiting clear selected-outcome resolution from Polymarket.",
          updatedAt: now,
        })
        .where(eq(sportsPredictions.id, candidate.id))
        .returning({ id: sportsPredictions.id, marketId: sportsPredictions.marketId, selectedOutcomeIndex: sportsPredictions.selectedOutcomeIndex });
      if (row) expired.push(row);
    } else {
      await db()
        .update(sportsPredictions)
        .set({ eventStartTime, updatedAt: now })
        .where(eq(sportsPredictions.id, candidate.id));
    }
  }
  return expired;
}

export async function getSportsPredictionsForResolution(limit = 100) {
  return db()
    .select({
      id: sportsPredictions.id,
      marketId: sportsPredictions.marketId,
      marketTitle: sportsPredictions.marketTitle,
      selectedOption: sportsPredictions.selectedOption,
      selectedOutcomeIndex: sportsPredictions.selectedOutcomeIndex,
      marketPriceBps: sportsPredictions.marketPriceBps,
      agentProbabilityBps: sportsPredictions.agentProbabilityBps,
      eventStartTime: sportsPredictions.eventStartTime,
      expiresAt: sportsPredictions.expiresAt,
      status: sportsPredictions.status,
      resolutionStatus: sportsPredictions.resolutionStatus,
    })
    .from(sportsPredictions)
    .where(and(
      inArray(sportsPredictions.resolutionStatus, ["unresolved", "expired", "failed_resolution"]),
      sql`(${sportsPredictions.status} = 'expired' or (${sportsPredictions.eventStartTime} is not null and ${sportsPredictions.eventStartTime} <= now()) or (${sportsPredictions.expiresAt} is not null and ${sportsPredictions.expiresAt} <= now()))`,
    ))
    .orderBy(desc(sportsPredictions.updatedAt))
    .limit(limit);
}

export async function markSportsPredictionResolved(input: { predictionId: number; resolution: SelectedOutcomeResolution }) {
  await db()
    .update(sportsPredictions)
    .set({
      status: "resolved",
      resolutionStatus: "resolved",
      resolvedOutcomeIndex: input.resolution.resolvedOutcomeIndex,
      resolvedOutcome: input.resolution.resolvedOutcome,
      resolvedAt: new Date(input.resolution.resolvedAt),
      statusReason: input.resolution.resolvedOutcomeIndex === null ? "Resolved as 50-50 push; no selected outcome won." : "Resolved with supported selected-outcome Polymarket result.",
      updatedAt: new Date(),
    })
    .where(eq(sportsPredictions.id, input.predictionId));
}

export async function getOpenPublishedCalls() {
  return db().query.calls.findMany({
    where: inArray(calls.status, ["published", "expired", "failed_resolution"]),
    orderBy: desc(calls.publishedAt),
  });
}

export async function markExpiredCalls(now = new Date()) {
  const cutoffIso = now.toISOString();
  const expired = await db()
    .update(calls)
    .set({ status: "expired", statusReason: "Expired and awaiting supported market resolution." })
    .where(and(eq(calls.status, "published"), sql`${calls.expiresAt} < ${cutoffIso}::timestamptz`))
    .returning({ id: calls.id, marketId: calls.marketId });
  return expired;
}

export async function markCallResolving(callId: number) {
  await db().update(calls).set({ status: "resolving", statusReason: "Resolution worker is checking market outcome." }).where(eq(calls.id, callId));
}

export async function markCallResolutionFailed(callId: number, reason: string) {
  await db().update(calls).set({ status: "failed_resolution", statusReason: `Resolution failed; retryable. ${reason}`.slice(0, 500) }).where(eq(calls.id, callId));
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
  relatedAgentId?: number | undefined;
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
    relatedAgentId: input.relatedAgentId,
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
  const health = await checkCircleActionsSchemaHealth();
  if (!health.tableExists || !health.columns.action_type || !health.columns.status || !health.columns.created_at) return "0";
  if (!health.columns.amount_usdc && !health.legacyAmountColumnExists) return "0";

  const amountColumn = health.columns.amount_usdc ? sql.raw('"amount_usdc"') : sql.raw('"amount"');
  try {
    const result = await db().execute(sql<{ total: string | null }>`
      select coalesce(sum(
        case
          when ${amountColumn} is null then 0::numeric
          when btrim(${amountColumn}::text) ~ '^-?\d+(\.\d+)?$' then btrim(${amountColumn}::text)::numeric
          else 0::numeric
        end
      ), 0)::text as "total"
      from "circle_actions"
      where "action_type" = 'x402_api_payment'
        and "status" = 'success'
        and "created_at" >= ${start}
    `);
    const rows = rowsFromSqlResult<{ total: string | null }>(result);
    return rows[0]?.total || "0";
  } catch {
    return "0";
  }
}

export async function getTodayX402SpendUsdcByAgent(agentId: number, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const health = await checkCircleActionsSchemaHealth();
  if (!health.tableExists || !health.columns.action_type || !health.columns.status || !health.columns.created_at) return "0";
  if (!health.columns.amount_usdc && !health.legacyAmountColumnExists) return "0";

  const amountColumn = health.columns.amount_usdc ? sql.raw('"amount_usdc"') : sql.raw('"amount"');
  try {
    const result = await db().execute(sql<{ total: string | null }>`
      select coalesce(sum(
        case
          when ${amountColumn} is null then 0::numeric
          when btrim(${amountColumn}::text) ~ '^-?\d+(\.\d+)?$' then btrim(${amountColumn}::text)::numeric
          else 0::numeric
        end
      ), 0)::text as "total"
      from "circle_actions"
      where "action_type" in ('x402_api_payment', 'x402_evidence_payment')
        and "related_agent_id" = ${agentId}
        and "status" = 'success'
        and "created_at" >= ${start}
    `);
    const rows = rowsFromSqlResult<{ total: string | null }>(result);
    return rows[0]?.total || "0";
  } catch {
    return "0";
  }
}

export async function adminSummary() {
  const [counts] = await db().select({
    calls: sql<number>`count(*)::int`,
    liveCalls: sql<number>`count(*) filter (where ${calls.status} = 'published' and (${calls.expiresAt} is null or ${calls.expiresAt} > now()))::int`,
    expiredCalls: sql<number>`count(*) filter (where ${calls.status} = 'expired')::int`,
    resolvedCalls: sql<number>`count(*) filter (where ${calls.status} = 'resolved')::int`,
    sportsIdeas: sql<number>`(select count(*)::int from ${sportsPredictions} where status in ('strong_call', 'lean_call', 'high_risk_call', 'avoid_call'))`,
  }).from(calls);
  const latestRuns = await db().query.agentRuns.findMany({ orderBy: desc(agentRuns.createdAt), limit: 10 });
  return { counts, latestRuns };
}
