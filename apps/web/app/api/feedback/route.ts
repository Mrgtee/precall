import { eq } from "drizzle-orm";
import { verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agents, calls, feedback, users } from "@precall/shared/db/schema";
import { addressSchema, errorJson, noStoreJson, parseJsonBody, positiveIntSchema, requireSameOrigin } from "../../../lib/api-security";
import { z } from "zod";

const allowedSentiments = new Set(["useful", "unclear", "wrong", "copied", "followed"]);

const feedbackBodySchema = z.object({
  callId: positiveIntSchema.optional(),
  agentId: positiveIntSchema.optional(),
  wallet: addressSchema,
  sentiment: z.string().trim().toLowerCase(),
  comment: z.string().optional().default(""),
  context: z.string().optional().default(""),
  message: z.string().min(1),
  signature: z.custom<Hex>((value) => typeof value === "string" && value.startsWith("0x")),
}).refine((value) => Boolean(value.callId) || Boolean(value.agentId), {
  message: "callId or agentId is required.",
});

function expectedFeedbackMessage(input: { callId: number | undefined; agentId: number | undefined; wallet: string; sentiment: string; context: string; comment: string }) {
  return [
    "Precall Arena feedback",
    `Call: ${input.callId ?? "none"}`,
    `Agent: ${input.agentId ?? "none"}`,
    `Wallet: ${input.wallet}`,
    `Sentiment: ${input.sentiment}`,
    `Context: ${input.context}`,
    `Comment: ${input.comment.slice(0, 700)}`,
  ].join("\n");
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, feedbackBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const sentiment = body.sentiment;
  const comment = body.comment.trim().slice(0, 700);
  const context = body.context.trim().slice(0, 80);

  if (!allowedSentiments.has(sentiment)) return errorJson("A valid sentiment is required.", 400);

  const expected = expectedFeedbackMessage({ callId: body.callId, agentId: body.agentId, wallet: body.wallet, sentiment, context, comment });
  if (body.message !== expected) return errorJson("Signed feedback message does not match request.", 401);
  const verified = await verifyMessage({ address: body.wallet, message: body.message, signature: body.signature });
  if (!verified) return errorJson("Feedback signature verification failed.", 401);

  const db = createDb();
  if (body.callId) {
    const call = await db.query.calls.findFirst({ where: eq(calls.id, body.callId) });
    if (!call) return errorJson("Call not found.", 404);
  }
  if (body.agentId) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, body.agentId) });
    if (!agent) return errorJson("Agent not found.", 404);
  }
  await db.insert(users).values({ walletAddress: body.wallet }).onConflictDoNothing();
  await db.insert(feedback).values({ callId: body.callId, agentId: body.agentId, userWallet: body.wallet, sentiment, comment, context, signature: body.signature, signedMessage: body.message, signatureStatus: "verified" });
  return noStoreJson({ ok: true });
}
