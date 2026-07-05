import { eq } from "drizzle-orm";
import { verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agentConfigs, agents, users } from "@precall/shared/db/schema";
import { deployAgentMessage, sanitizeSlug, type DeployableAgentInput } from "../../../../lib/agent-marketplace-auth";
import { addressSchema, errorJson, noStoreJson, parseJsonBody, requireSameOrigin } from "../../../../lib/api-security";
import { z } from "zod";

const deployBodySchema = z.object({
  wallet: addressSchema,
  message: z.string().min(1),
  signature: z.custom<Hex>((value) => typeof value === "string" && value.startsWith("0x")),
  name: z.string().optional().default(""),
  slug: z.string().optional().default(""),
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
});

function validMoney(value: string | undefined, fallback: string) {
  const candidate = String(value || fallback).trim();
  return /^\d+(?:\.\d{1,6})?$/.test(candidate) ? candidate : fallback;
}

function cleanScope(scope: string[] | undefined) {
  const allowed = new Set(["soccer"]);
  return [...new Set((scope || []).map((item) => item.trim().toLowerCase()).filter((item) => allowed.has(item)))];
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, deployBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const wallet = body.wallet as `0x${string}`;

  const payload: DeployableAgentInput = {
    name: body.name.trim().slice(0, 80),
    slug: sanitizeSlug(body.slug || body.name || ""),
    tagline: body.tagline.trim().slice(0, 140),
    description: body.description.trim().slice(0, 700),
    categoryScope: cleanScope(body.categoryScope),
    strategyMode: body.strategyMode === "contrarian" || body.strategyMode === "balanced" ? body.strategyMode : "hit_rate",
    riskProfile: body.riskProfile === "conservative" || body.riskProfile === "aggressive" ? body.riskProfile : "balanced",
    unlockPriceUsdc: validMoney(body.unlockPriceUsdc, "0.05"),
    dailyX402BudgetUsdc: validMoney(body.dailyX402BudgetUsdc, "0.10"),
    maxX402PaymentUsdc: validMoney(body.maxX402PaymentUsdc, "0.005"),
    maxCallsPerRun: Number.isInteger(body.maxCallsPerRun) ? Math.min(24, Math.max(1, Number(body.maxCallsPerRun))) : 3,
    requireX402: body.requireX402 !== false,
  };

  if (!payload.name || payload.name.length < 3) return errorJson("Agent name must be at least 3 characters.", 400);
  if (!payload.slug) return errorJson("Agent slug is required.", 400);

  const expectedMessage = deployAgentMessage({ wallet, payload });
  if (body.message !== expectedMessage) return errorJson("Signed deploy message does not match request.", 401);

  const verified = await verifyMessage({ address: wallet, message: body.message, signature: body.signature });
  if (!verified) return errorJson("Deploy signature verification failed.", 401);

  const db = createDb();
  const existingSlug = await db.query.agentConfigs.findFirst({ where: eq(agentConfigs.slug, payload.slug) });
  if (existingSlug) return errorJson("This agent slug is already taken.", 409);

  await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();
  const [agent] = await db.insert(agents).values({
    name: payload.name,
    role: `Hosted ${payload.strategyMode} ${payload.riskProfile} sports market agent.`,
    ownerWallet: wallet,
    metadataUri: `https://precall.arena/agents/${payload.slug}`,
    active: true,
  }).returning();

  if (!agent) return errorJson("Failed to create agent.", 500);

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

  return noStoreJson({ ok: true, agent, config });
}
