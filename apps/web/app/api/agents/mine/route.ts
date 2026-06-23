import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getOwnedAgents } from "../../../../lib/marketplace";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("address") || "";
  try {
    const address = getAddress(wallet).toLowerCase();
    return NextResponse.json({ ok: true, agents: await getOwnedAgents(address) });
  } catch {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }
}
