import { getAddress } from "viem";
import { errorJson, noStoreJson } from "../../../../lib/api-security";
import { getOwnedAgents } from "../../../../lib/marketplace";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("address") || "";
  try {
    const address = getAddress(wallet).toLowerCase();
    return noStoreJson({ ok: true, agents: await getOwnedAgents(address) });
  } catch {
    return errorJson("A valid wallet address is required.", 400);
  }
}
