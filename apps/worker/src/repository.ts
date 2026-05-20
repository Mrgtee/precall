import { and, desc, eq, sql } from "drizzle-orm";
import { createDbConnection, type PrecallDb } from "@precall/shared/db/client";
import {
  agents,
  agentRuns,
  calls,
  evidenceItems,
  markets,
  marketSnapshots,
  resolutions,
} from "@precall/shared/db/schema";
import { hashText } from "@precall/shared/scoring";
import type { AggregatedCall, PolymarketMarket, MarketSnapshot } from "@precall/shared/types";

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

export async function ensureCouncilAgent(input: {
  onchainAgentId: number | undefined;
  ownerWallet: string;
}) {
  const existing = await db().query.agents.findFirst({
    where: eq(agents.name, "Precall Council"),
  });
  if (existing) return existing;

  const [created] = await db()
    .insert(agents)
    .values({
      name: "Precall Council",
      role: "Aggregate of MacroScout, NewsHawk, CrowdPulse, BookWatcher, and Skeptic.",
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
    })
    .returning();
  return row;
}

export async function insertPublishedCall(input: {
  agentId: number;
  onchainCallId: number | undefined;
  txHash: string | undefined;
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
      agentProbabilityBps: input.call.agentProbabilityBps,
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
      txHash: input.txHash,
      copyUrl: input.copyUrl,
      expiresAt: input.call.market.closeTime ? new Date(input.call.market.closeTime) : null,
    })
    .returning();
  if (!row) throw new Error("Failed to insert published call.");

  for (const evidence of input.call.evidence) {
    await db().insert(evidenceItems).values({
      callId: row.id,
      sourceUrl: evidence.sourceUrl,
      title: evidence.title,
      excerpt: evidence.excerpt,
      credibilityScore: evidence.credibilityScore,
    });
  }

  return row;
}

export async function getOpenPublishedCalls() {
  return db().query.calls.findMany({
    where: and(eq(calls.status, "published"), sql`${calls.expiresAt} is not null`),
    orderBy: desc(calls.publishedAt),
  });
}

export async function insertResolution(input: {
  callId: number;
  finalOutcome: string;
  finalPriceBps: number;
  roiBps: number;
  brierScoreBps: number;
  resolverTx: string | undefined;
}) {
  await db()
    .insert(resolutions)
    .values(input)
    .onConflictDoNothing();
  await db().update(calls).set({ status: "resolved" }).where(eq(calls.id, input.callId));
}
