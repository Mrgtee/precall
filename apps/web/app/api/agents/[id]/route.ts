import { eq } from "drizzle-orm";
import { getAddress, verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agentConfigs, agents } from "@precall/shared/db/schema";
import { updateAgentMessage, sanitizeSlug, type UpdatableAgentInput } from "../../../../lib/agent-marketplace-auth";
import { getMarketplaceAgentProfile } from "../../../../lib/marketplace";
import { addressSchema, errorJson, noStoreJson, parseJsonBody, requireSameOrigin } from "../../../../lib/api-security";
import { z } from "zod";

const updateBodySchema = z.object({
  wallet: addressSchema,
  message: z.string().min(1),
  signature: z.custom<Hex>((value) => typeof value === "string" && value.startsWith("0x")),
  name: z.string().optional().default(""),
  tagline: z.string().optional().default(""),
  description: z.string().optional().default(""),
  categoryScope: z.array(z.string()).optional(),
  strategyMode: z.enum(["hit_rate", "balanced", "contrarian"]).optional(),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]).optional(),
  unlockPriceUsdc: z.string().optional(),
  dailyX402BudgetUsdc: z.string().optional(),
  maxX402PaymentUsdc: z.string().optional(),
  maxCallsPerRun: z.number().optional(),
  requireX402: z.boolean().optional(),
  visibility: z.enum(["public", "hidden"]).optional(),
});

function validMoney(value: string | undefined, fallback: string) {
  const candidate = String(value || fallback).trim();
  return /^\d+(?:\.\d{1,6})?$/.test(candidate) ? candidate : fallback;
}

function cleanScope(scope: string[] | undefined) {
  const allowed = new Set(["soccer"]);
  return [...new Set((scope || []).map((item) => item.trim().toLowerCase()).filter((item) => allowed.has(item)))];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isInteger(agentId) || agentId <= 0) return errorJson("Valid agent id is required.", 400);
  const profile = await getMarketplaceAgentProfile(agentId);
  if (!profile) return errorJson("Agent not found.", 404);
  return noStoreJson({ ok: true, profile });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isInteger(agentId) || agentId <= 0) return errorJson("Valid agent id is required.", 400);

  const parsed = await parseJsonBody(request, updateBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const wallet = body.wallet as `0x${string}`;

  const payload: UpdatableAgentInput = {
    agentId,
    name: body.name.trim().slice(0, 80),
    tagline: body.tagline.trim().slice(0, 140),
    description: body.description.trim().slice(0, 700),
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

  const expectedMessage = updateAgentMessage({ wallet, payload });
  if (body.message !== expectedMessage) return errorJson("Signed update message does not match request.", 401);
  const verified = await verifyMessage({ address: wallet, message: body.message, signature: body.signature });
  if (!verified) return errorJson("Update signature verification failed.", 401);

  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!agent) return errorJson("Agent not found.", 404);
  if (getAddress(agent.ownerWallet).toLowerCase() !== wallet.toLowerCase()) {
    return errorJson("Only the owning wallet can update this agent.", 403);
  }

  if (payload.name) {
    await db.update(agents).set({
      name: payload.name,
      role: `Hosted ${payload.strategyMode || "hit_rate"} ${payload.riskProfile || "balanced"} sports market agent.`,
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
  return noStoreJson({ ok: true, profile });
}
