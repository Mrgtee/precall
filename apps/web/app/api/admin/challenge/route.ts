import { NextResponse } from "next/server";
import { createAdminChallenge, isAdminAction, isAdminWallet } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; address?: string };
  if (!body.action || !isAdminAction(body.action)) {
    return NextResponse.json({ error: "Valid admin action is required." }, { status: 400 });
  }
  if (!body.address || !isAdminWallet(body.address)) {
    return NextResponse.json({ error: "Wallet is not whitelisted for admin access." }, { status: 403 });
  }

  return NextResponse.json(createAdminChallenge({ action: body.action, address: body.address }));
}
