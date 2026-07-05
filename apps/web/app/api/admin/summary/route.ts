import { isAdminWallet } from "../../../../lib/admin-auth";
import { errorJson, noStoreJson } from "../../../../lib/api-security";
import { getDemoData } from "../../../../lib/queries";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") || "";
  if (!address || !(await isAdminWallet(address))) {
    return errorJson("Wallet is not whitelisted for admin access.", 403);
  }
  return noStoreJson(await getDemoData());
}
