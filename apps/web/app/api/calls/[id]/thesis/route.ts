import { NextResponse } from "next/server";
import { getCall, hasUnlock } from "../../../../../lib/queries";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet query param is required." }, { status: 400 });

  const call = await getCall(Number(id));
  if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  const unlocked = await hasUnlock(call.id, wallet);
  if (!unlocked) return NextResponse.json({ error: "Thesis is locked for this wallet." }, { status: 403 });
  return NextResponse.json({ thesis: call.thesis, counterarguments: call.counterarguments });
}
