import { NextResponse } from "next/server";
import { activeAdminCount, isAdminWallet, listAdminWallets, setAdminWallet, verifyAdminSignature, type AdminChallenge } from "../../../../lib/admin-auth";

type WalletBody = {
  address?: string;
  targetAddress?: string;
  label?: string;
  message?: string;
  signature?: `0x${string}`;
  challenge?: AdminChallenge;
};

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") || "";
  if (!address || !(await isAdminWallet(address))) {
    return NextResponse.json({ error: "Wallet is not whitelisted for admin access." }, { status: 403 });
  }
  return NextResponse.json({ wallets: await listAdminWallets() });
}

async function verifyWalletChange(body: WalletBody, action: "admin-add" | "admin-remove") {
  if (!body.address || !body.targetAddress || !body.message || !body.signature || !body.challenge) {
    return { ok: false, error: "Wallet signature and target wallet are required." };
  }
  return verifyAdminSignature({
    action,
    address: body.address,
    targetAddress: body.targetAddress,
    message: body.message,
    signature: body.signature,
    challenge: body.challenge,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as WalletBody;
  const verification = await verifyWalletChange(body, "admin-add");
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: 401 });

  const row = await setAdminWallet({ walletAddress: body.targetAddress!, active: true, actor: body.address!, label: body.label });
  return NextResponse.json({ ok: true, wallet: row, wallets: await listAdminWallets() });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as WalletBody;
  const verification = await verifyWalletChange(body, "admin-remove");
  if (!verification.ok) return NextResponse.json({ error: verification.error }, { status: 401 });
  if (body.address?.toLowerCase() === body.targetAddress?.toLowerCase()) {
    return NextResponse.json({ error: "You cannot dewhitelist the wallet currently signing this action." }, { status: 400 });
  }
  if ((await activeAdminCount()) <= 1) {
    return NextResponse.json({ error: "Cannot remove the last active admin wallet." }, { status: 400 });
  }

  const row = await setAdminWallet({ walletAddress: body.targetAddress!, active: false, actor: body.address! });
  return NextResponse.json({ ok: true, wallet: row, wallets: await listAdminWallets() });
}
