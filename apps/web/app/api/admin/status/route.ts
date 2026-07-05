import { isAdminWallet } from "../../../../lib/admin-auth";
import { noStoreJson } from "../../../../lib/api-security";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") || "";
  return noStoreJson({ isAdmin: address ? await isAdminWallet(address) : false });
}
