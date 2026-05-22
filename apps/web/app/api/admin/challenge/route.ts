import { NextResponse } from "next/server";
import { createAdminChallenge, isAdminAction, isAdminWallet, isAdminWalletAction } from "../../../../lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; address?: string; targetAddress?: string };
  if (!body.action || !isAdminAction(body.action)) {
    return NextResponse.json({ error: "Valid admin action is required." }, { status: 400 });
  }
  if (!body.address || !(await isAdminWallet(body.address))) {
    return NextResponse.json({ error: "Wallet is not whitelisted for admin access." }, { status: 403 });
  }
  if (isAdminWalletAction(body.action) && !body.targetAddress) {
    return NextResponse.json({ error: "Target wallet is required for this admin action." }, { status: 400 });
  }

  try {
    return NextResponse.json(createAdminChallenge({ action: body.action, address: body.address, targetAddress: body.targetAddress }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
