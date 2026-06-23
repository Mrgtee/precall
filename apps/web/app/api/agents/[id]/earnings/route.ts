import { NextResponse } from "next/server";
import { getAgentEarnings } from "../../../../../lib/marketplace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return NextResponse.json({ error: "Valid agent id is required." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, earnings: await getAgentEarnings(agentId) });
}
