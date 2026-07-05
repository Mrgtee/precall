import { eq, sql } from "drizzle-orm";
import { verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agents, follows, users } from "@precall/shared/db/schema";
import { addressSchema, errorJson, noStoreJson, parseJsonBody, positiveIntSchema, requireSameOrigin } from "../../../lib/api-security";
import { z } from "zod";

const followBodySchema = z.object({
  agentId: positiveIntSchema,
  wallet: addressSchema,
  message: z.string().min(1),
  signature: z.custom<Hex>((value) => typeof value === "string" && value.startsWith("0x")),
});

function expectedFollowMessage(agentId: number, wallet: string) {
  return [`Precall Arena follow`, `Agent: ${agentId}`, `Wallet: ${wallet}`].join("\n");
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, followBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.message !== expectedFollowMessage(body.agentId, body.wallet)) return errorJson("Signed follow message does not match request.", 401);
  const verified = await verifyMessage({ address: body.wallet, message: body.message, signature: body.signature });
  if (!verified) return errorJson("Follow signature verification failed.", 401);

  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, body.agentId) });
  if (!agent) return errorJson("Agent not found.", 404);

  await db.insert(users).values({ walletAddress: body.wallet }).onConflictDoNothing();
  await db.insert(follows).values({ agentId: body.agentId, userWallet: body.wallet, signature: body.signature, signedMessage: body.message, signatureStatus: "verified" }).onConflictDoNothing();

  const [stats] = await db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.agentId, body.agentId));
  return noStoreJson({ ok: true, followers: stats?.followers ?? 0 });
}
