import { NextResponse } from "next/server";
import { isAdminWallet } from "../../../../lib/admin-auth";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") || "";
  return NextResponse.json({ isAdmin: address ? await isAdminWallet(address) : false });
}
