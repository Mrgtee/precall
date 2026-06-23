import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAddress, verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agentConfigs, agents, users } from "@precall/shared/db/schema";
import type { HostedAgentConfigInput } from "@precall/shared/types";
import { deployAgentMessage, sanitizeSlug, type DeployableAgentInput } from "../../../../lib/agent-marketplace-auth";

type Body = {
  wallet?: string;
  message?: string;
  signature?: Hex;
  name?: string;
  slug?: string;
  tagline?: string;
  description?: string;
  categoryScope?: string[];
  strategyMode?: HostedAgentConfigInput["strategyMode"];
  riskProfile?: HostedAgentConfigInput["riskProfile"];
  unlockPriceUsdc?: string;
  dailyX402BudgetUsdc?: string;
  maxX402PaymentUsdc?: string;
  maxCallsPerRun?: number;
  requireX402?: boolean;
};

function validMoney(value: string, fallback: string) {
  const candidate = String(value || fallback).trim();
  return /^\d+(?:\.\d{1,6})?$/.test(candidate) ? candidate : fallback;
}

function cleanScope(scope: string[] | undefined) {
  const allowed = new Set(["soccer", "nba", "mlb", "nhl", "ufc", "football", "esports", "tennis", "cricket", "golf", "rugby", "other_sports"]);
  return [...new Set((scope || []).map((item) => item.trim().toLowerCase()).filter((item) => allowed.has(item)))];
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;

  let wallet: `0x${string}`;
  try {
    wallet = getAddress(body.wallet || "") as `0x${string}`;
  } catch {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const payload: DeployableAgentInput = {
    name: (body.name || "").trim().slice(0, 80),
    slug: sanitizeSlug(body.slug || body.name || ""),
    tagline: (body.tagline || "").trim().slice(0, 140),
    description: (body.description || "").trim().slice(0, 700),
    categoryScope: cleanScope(body.categoryScope),
    strategyMode: body.strategyMode === "contrarian" || body.strategyMode === "balanced" ? body.strategyMode : "hit_rate",
    riskProfile: body.riskProfile === "conservative" || body.riskProfile === "aggressive" ? body.riskProfile : "balanced",
    unlockPriceUsdc: validMoney(body.unlockPriceUsdc || "0.05", "0.05"),
    dailyX402BudgetUsdc: validMoney(body.dailyX402BudgetUsdc || "0.10", "0.10"),
    maxX402PaymentUsdc: validMoney(body.maxX402PaymentUsdc || "0.005", "0.005"),
    maxCallsPerRun: Number.isInteger(body.maxCallsPerRun) ? Math.min(24, Math.max(1, Number(body.maxCallsPerRun))) : 3,
    requireX402: body.requireX402 !== false,
  };

  if (!payload.name || payload.name.length < 3) {
    return NextResponse.json({ error: "Agent name must be at least 3 characters." }, { status: 400 });
  }
  if (!payload.slug) {
    return NextResponse.json({ error: "Agent slug is required." }, { status: 400 });
  }
  if (!body.message || !body.signature) {
    return NextResponse.json({ error: "A signed deploy message is required." }, { status: 401 });
  }

  const expectedMessage = deployAgentMessage({ wallet, payload });
  if (body.message !== expectedMessage) {
    return NextResponse.json({ error: "Signed deploy message does not match request." }, { status: 401 });
  }

  const verified = await verifyMessage({ address: wallet, message: body.message, signature: body.signature });
  if (!verified) {
    return NextResponse.json({ error: "Deploy signature verification failed." }, { status: 401 });
  }

  const db = createDb();
  const existingSlug = await db.query.agentConfigs.findFirst({ where: eq(agentConfigs.slug, payload.slug) });
  if (existingSlug) return NextResponse.json({ error: "This agent slug is already taken." }, { status: 409 });

  await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();
  const [agent] = await db.insert(agents).values({
    name: payload.name,
    role: `Hosted ${payload.strategyMode} ${payload.riskProfile} sports market agent.`,
    ownerWallet: wallet,
    metadataUri: `https://precall.arena/agents/${payload.slug}`,
    active: true,
  }).returning();

  if (!agent) return NextResponse.json({ error: "Failed to create agent." }, { status: 500 });

  const [config] = await db.insert(agentConfigs).values({
    agentId: agent.id,
    slug: payload.slug,
    tagline: payload.tagline,
    description: payload.description,
    categoryScope: payload.categoryScope,
    strategyMode: payload.strategyMode,
    riskProfile: payload.riskProfile,
    unlockPriceUsdc: payload.unlockPriceUsdc,
    dailyX402BudgetUsdc: payload.dailyX402BudgetUsdc,
    maxX402PaymentUsdc: payload.maxX402PaymentUsdc,
    maxCallsPerRun: payload.maxCallsPerRun,
    requireX402: payload.requireX402,
    reviewStatus: "pending_review",
    visibility: "public",
    agentShareBps: 7000,
    platformShareBps: 3000,
    updatedAt: new Date(),
  }).returning();

  return NextResponse.json({ ok: true, agent, config });
}
