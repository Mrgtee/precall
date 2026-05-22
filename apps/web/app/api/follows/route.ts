import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getAddress, verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agents, follows, users } from "@precall/shared/db/schema";

function expectedFollowMessage(agentId: number, wallet: string) {
  return [`Precall Arena follow`, `Agent: ${agentId}`, `Wallet: ${wallet}`].join("\n");
}

export async function POST(request: Request) {
  const body = (await request.json()) as { agentId?: number; wallet?: string; message?: string; signature?: Hex };
  const agentId = Number(body.agentId);
  if (!Number.isInteger(agentId) || agentId <= 0) return NextResponse.json({ error: "agentId is required." }, { status: 400 });

  let wallet: `0x${string}`;
  try {
    wallet = getAddress(body.wallet || "") as `0x${string}`;
  } catch {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }
  if (!body.message || !body.signature) return NextResponse.json({ error: "Signed follow message is required." }, { status: 401 });
  if (body.message !== expectedFollowMessage(agentId, wallet)) return NextResponse.json({ error: "Signed follow message does not match request." }, { status: 401 });
  const verified = await verifyMessage({ address: wallet, message: body.message, signature: body.signature });
  if (!verified) return NextResponse.json({ error: "Follow signature verification failed." }, { status: 401 });

  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

  await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();
  await db.insert(follows).values({ agentId, userWallet: wallet, signature: body.signature, signedMessage: body.message, signatureStatus: "verified" }).onConflictDoNothing();

  const [stats] = await db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.agentId, agentId));
  return NextResponse.json({ ok: true, followers: stats?.followers ?? 0 });
}
