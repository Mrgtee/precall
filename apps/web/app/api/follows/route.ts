import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@precall/shared/db/client";
import { agents, follows, users } from "@precall/shared/db/schema";

const walletPattern = /^0x[a-fA-F0-9]{40}$/;

export async function POST(request: Request) {
  const body = (await request.json()) as { agentId?: number; wallet?: string };
  const agentId = Number(body.agentId);
  const wallet = body.wallet?.trim();

  if (!Number.isInteger(agentId) || agentId <= 0) {
    return NextResponse.json({ error: "agentId is required." }, { status: 400 });
  }
  if (!wallet || !walletPattern.test(wallet)) {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const db = createDb();
  const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

  await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();
  await db.insert(follows).values({ agentId, userWallet: wallet }).onConflictDoNothing();

  const [stats] = await db
    .select({ followers: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.agentId, agentId));

  return NextResponse.json({ ok: true, followers: stats?.followers ?? 0 });
}
