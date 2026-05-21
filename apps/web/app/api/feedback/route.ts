import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createDb } from "@precall/shared/db/client";
import { agents, calls, feedback, users } from "@precall/shared/db/schema";

const walletPattern = /^0x[a-fA-F0-9]{40}$/;
const allowedSentiments = new Set(["useful", "unclear", "wrong", "copied", "followed"]);

export async function POST(request: Request) {
  const body = (await request.json()) as {
    callId?: number;
    agentId?: number;
    wallet?: string;
    sentiment?: string;
    comment?: string;
    context?: string;
  };

  const callId = body.callId ? Number(body.callId) : undefined;
  const agentId = body.agentId ? Number(body.agentId) : undefined;
  const wallet = body.wallet?.trim();
  const sentiment = body.sentiment?.trim().toLowerCase();
  const comment = (body.comment || "").trim().slice(0, 700);
  const context = (body.context || "").trim().slice(0, 80);

  if (!callId && !agentId) {
    return NextResponse.json({ error: "callId or agentId is required." }, { status: 400 });
  }
  if (!sentiment || !allowedSentiments.has(sentiment)) {
    return NextResponse.json({ error: "A valid sentiment is required." }, { status: 400 });
  }
  if (wallet && !walletPattern.test(wallet)) {
    return NextResponse.json({ error: "Wallet address is invalid." }, { status: 400 });
  }

  const db = createDb();
  if (callId) {
    const call = await db.query.calls.findFirst({ where: eq(calls.id, callId) });
    if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  }
  if (agentId) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  if (wallet) await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();

  await db.insert(feedback).values({
    callId,
    agentId,
    userWallet: wallet,
    sentiment,
    comment,
    context,
  });

  return NextResponse.json({ ok: true });
}
