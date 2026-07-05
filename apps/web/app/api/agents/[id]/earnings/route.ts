import { errorJson, noStoreJson } from "../../../../../lib/api-security";
import { getAgentEarnings } from "../../../../../lib/marketplace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agentId = Number(id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return errorJson("Valid agent id is required.", 400);
  }
  return noStoreJson({ ok: true, earnings: await getAgentEarnings(agentId) });
}
