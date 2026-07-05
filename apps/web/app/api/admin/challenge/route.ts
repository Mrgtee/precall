import { createAdminChallenge, isAdminAction, isAdminWallet, isAdminWalletAction } from "../../../../lib/admin-auth";
import { errorJson, noStoreJson, parseJsonBody, requireSameOrigin } from "../../../../lib/api-security";
import { z } from "zod";

const challengeBodySchema = z.object({
  action: z.string(),
  address: z.string(),
  targetAddress: z.string().optional(),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, challengeBodySchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  if (!isAdminAction(body.action)) {
    return errorJson("Valid admin action is required.", 400);
  }
  if (!(await isAdminWallet(body.address))) {
    return errorJson("Wallet is not whitelisted for admin access.", 403);
  }
  if (isAdminWalletAction(body.action) && !body.targetAddress) {
    return errorJson("Target wallet is required for this admin action.", 400);
  }

  try {
    return noStoreJson(createAdminChallenge({ action: body.action, address: body.address, targetAddress: body.targetAddress }));
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : String(error), 400);
  }
}
