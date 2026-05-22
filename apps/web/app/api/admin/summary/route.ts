import { NextResponse } from "next/server";
import { isAdminWallet } from "../../../../lib/admin-auth";
import { getDemoData } from "../../../../lib/queries";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") || "";
  if (!address || !(await isAdminWallet(address))) {
    return NextResponse.json({ error: "Wallet is not whitelisted for admin access." }, { status: 403 });
  }
  return NextResponse.json(await getDemoData());
}
