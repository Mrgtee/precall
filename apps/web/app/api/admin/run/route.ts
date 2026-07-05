import { runWorkerCommand, type WorkerCommand } from "../../../../lib/worker-runner";
import { isWorkerAdminAction, verifyAdminSignature, type AdminChallenge } from "../../../../lib/admin-auth";
import { errorJson, noStoreJson, parseJsonBody, requireSameOrigin, timingSafeStringEqual } from "../../../../lib/api-security";
import { z } from "zod";

export const maxDuration = 300;

const adminChallengeSchema = z.object({
  action: z.string(),
  address: z.string(),
  targetAddress: z.string().optional(),
  issuedAt: z.string(),
  nonce: z.string(),
  mac: z.string().regex(/^[a-f0-9]{64}$/i),
});

const runBodySchema = z.object({
  action: z.string().optional(),
  address: z.string().optional(),
  message: z.string().optional(),
  signature: z.custom<`0x${string}`>((value) => typeof value === "string" && value.startsWith("0x")).optional(),
  challenge: adminChallengeSchema.optional(),
});

function hasLegacyAdminSecret(request: Request) {
  if (process.env.ALLOW_LEGACY_ADMIN_SECRET !== "true") return false;
  const secret = process.env.ADMIN_SECRET;
  const header = request.headers.get("x-admin-secret") || "";
  return Boolean(secret && header && timingSafeStringEqual(header, secret));
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, runBodySchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const action = body.action || "run-once";
  if (!isWorkerAdminAction(action)) {
    return errorJson("Valid worker admin action is required.", 400);
  }

  if (!hasLegacyAdminSecret(request)) {
    if (!body.address || !body.message || !body.signature || !body.challenge) {
      return errorJson("Wallet signature is required.", 401);
    }
    const verification = await verifyAdminSignature({
      action,
      address: body.address,
      message: body.message,
      signature: body.signature,
      challenge: body.challenge as AdminChallenge,
    });
    if (!verification.ok) return errorJson(verification.error || "Admin authorization failed.", 401);
  }

  const result = await runWorkerCommand(action as WorkerCommand);
  return noStoreJson(result, { status: result.ok ? 200 : 500 });
}
