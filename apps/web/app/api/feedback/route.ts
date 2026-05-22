import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAddress, verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { agents, calls, feedback, users } from "@precall/shared/db/schema";

const allowedSentiments = new Set(["useful", "unclear", "wrong", "copied", "followed"]);

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
  const body = (await request.json()) as { callId?: number; agentId?: number; wallet?: string; sentiment?: string; comment?: string; context?: string; message?: string; signature?: Hex };
  const callId = body.callId ? Number(body.callId) : undefined;
  const agentId = body.agentId ? Number(body.agentId) : undefined;
  const sentiment = body.sentiment?.trim().toLowerCase();
  const comment = (body.comment || "").trim().slice(0, 700);
  const context = (body.context || "").trim().slice(0, 80);
  if (!callId && !agentId) return NextResponse.json({ error: "callId or agentId is required." }, { status: 400 });
  if (!sentiment || !allowedSentiments.has(sentiment)) return NextResponse.json({ error: "A valid sentiment is required." }, { status: 400 });

  let wallet: `0x${string}`;
  try {
    wallet = getAddress(body.wallet || "") as `0x${string}`;
  } catch {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }
  if (!body.message || !body.signature) return NextResponse.json({ error: "Signed feedback message is required." }, { status: 401 });
  const expected = expectedFeedbackMessage({ callId, agentId, wallet, sentiment, context, comment });
  if (body.message !== expected) return NextResponse.json({ error: "Signed feedback message does not match request." }, { status: 401 });
  const verified = await verifyMessage({ address: wallet, message: body.message, signature: body.signature });
  if (!verified) return NextResponse.json({ error: "Feedback signature verification failed." }, { status: 401 });

  const db = createDb();
  if (callId) {
    const call = await db.query.calls.findFirst({ where: eq(calls.id, callId) });
    if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  }
  if (agentId) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
    if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  await db.insert(users).values({ walletAddress: wallet }).onConflictDoNothing();
  await db.insert(feedback).values({ callId, agentId, userWallet: wallet, sentiment, comment, context, signature: body.signature, signedMessage: body.message, signatureStatus: "verified" });
  return NextResponse.json({ ok: true });
}
