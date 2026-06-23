import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAddress, verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agentConfigs, agents } from "@precall/shared/db/schema";
import { updateAgentMessage, sanitizeSlug, type UpdatableAgentInput } from "../../../../lib/agent-marketplace-auth";
import { getMarketplaceAgentProfile } from "../../../../lib/marketplace";

type Body = {
  wallet?: string;
  message?: string;
  signature?: Hex;
  name?: string;
  tagline?: string;
  description?: string;
  categoryScope?: string[];
  strategyMode?: "hit_rate" | "balanced" | "contrarian";
  riskProfile?: "conservative" | "balanced" | "aggressive";
  unlockPriceUsdc?: string;
  dailyX402BudgetUsdc?: string;
  maxX402PaymentUsdc?: string;
  maxCallsPerRun?: number;
  requireX402?: boolean;
  visibility?: "public" | "hidden";
};

function validMoney(value: string | undefined, fallback: string) {
  const candidate = String(value || fallback).trim();
  return /^\d+(?:\.\d{1,6})?$/.test(candidate) ? candidate : fallback;
}

function cleanScope(scope: string[] | undefined) {
  const allowed = new Set(["soccer", "nba", "mlb", "nhl", "ufc", "football", "esports", "tennis", "cricket", "golf", "rugby", "other_sports"]);
  return [...new Set((scope || []).map((item) => item.trim().toLowerCase()).filter((item) => allowed.has(item)))];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getMarketplaceAgentProfile(Number(id));
  if (!profile) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  return NextResponse.json({ ok: true, profile });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isInteger(agentId) || agentId <= 0) return NextResponse.json({ error: "Valid agent id is required." }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Body;
  let wallet: `0x${string}`;
  try {
    wallet = getAddress(body.wallet || "") as `0x${string}`;
  } catch {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const payload: UpdatableAgentInput = {
    agentId,
    name: (body.name || "").trim().slice(0, 80),
    tagline: (body.tagline || "").trim().slice(0, 140),
    description: (body.description || "").trim().slice(0, 700),
    categoryScope: cleanScope(body.categoryScope),
    strategyMode: body.strategyMode,
    riskProfile: body.riskProfile,
    unlockPriceUsdc: validMoney(body.unlockPriceUsdc, "0.05"),
    dailyX402BudgetUsdc: validMoney(body.dailyX402BudgetUsdc, "0.10"),
    maxX402PaymentUsdc: validMoney(body.maxX402PaymentUsdc, "0.005"),
    maxCallsPerRun: Number.isInteger(body.maxCallsPerRun) ? Math.min(24, Math.max(1, Number(body.maxCallsPerRun))) : 3,
    requireX402: body.requireX402 !== false,
    visibility: body.visibility === "hidden" ? "hidden" : "public",
  };

  if (!body.message || !body.signature) {
    return NextResponse.json({ error: "A signed update message is required." }, { status: 401 });
  }
  const expectedMessage = updateAgentMessage({ wallet, payload });
  if (body.message !== expectedMessage) {
    return NextResponse.json({ error: "Signed update message does not match request." }, { status: 401 });
  }
  const verified = await verifyMessage({ address: wallet, message: body.message, signature: body.signature });
  if (!verified) {
    return NextResponse.json({ error: "Update signature verification failed." }, { status: 401 });
  }

  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  if (getAddress(agent.ownerWallet).toLowerCase() !== wallet.toLowerCase()) {
    return NextResponse.json({ error: "Only the owning wallet can update this agent." }, { status: 403 });
  }

  if (payload.name) {
    await db.update(agents).set({
      name: payload.name,
      role: `Hosted ${payload.strategyMode || 'hit_rate'} ${payload.riskProfile || 'balanced'} sports market agent.`,
      metadataUri: `https://precall.arena/agents/${sanitizeSlug(payload.name)}`,
    }).where(eq(agents.id, agentId));
  }

  const existingConfig = await db.query.agentConfigs.findFirst({ where: eq(agentConfigs.agentId, agentId) });
  const configValues = {
    tagline: payload.tagline || "",
    description: payload.description || "",
    categoryScope: payload.categoryScope || [],
    strategyMode: payload.strategyMode || "hit_rate",
    riskProfile: payload.riskProfile || "balanced",
    unlockPriceUsdc: payload.unlockPriceUsdc || "0.05",
    dailyX402BudgetUsdc: payload.dailyX402BudgetUsdc || "0.10",
    maxX402PaymentUsdc: payload.maxX402PaymentUsdc || "0.005",
    maxCallsPerRun: payload.maxCallsPerRun || 3,
    requireX402: payload.requireX402 !== false,
    visibility: payload.visibility || "public",
    updatedAt: new Date(),
  };

  if (existingConfig) {
    await db.update(agentConfigs).set(configValues).where(eq(agentConfigs.agentId, agentId));
  } else {
    await db.insert(agentConfigs).values({
      agentId,
      slug: sanitizeSlug(payload.name || agent.name),
      reviewStatus: "pending_review",
      agentShareBps: 7000,
      platformShareBps: 3000,
      ...configValues,
    });
  }

  const profile = await getMarketplaceAgentProfile(agentId);
  return NextResponse.json({ ok: true, profile });
}
