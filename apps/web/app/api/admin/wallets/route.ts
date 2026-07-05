import { activeAdminCount, isAdminWallet, listAdminWallets, setAdminWallet, verifyAdminSignature, type AdminChallenge } from "../../../../lib/admin-auth";
import { errorJson, noStoreJson, parseJsonBody, requireSameOrigin } from "../../../../lib/api-security";
import { z } from "zod";

const adminChallengeSchema = z.object({
  action: z.string(),
  address: z.string(),
  targetAddress: z.string().optional(),
  issuedAt: z.string(),
  nonce: z.string(),
  mac: z.string().regex(/^[a-f0-9]{64}$/i),
});

const walletBodySchema = z.object({
  address: z.string().optional(),
  targetAddress: z.string().optional(),
  label: z.string().trim().max(80).optional(),
  message: z.string().optional(),
  signature: z.custom<`0x${string}`>((value) => typeof value === "string" && value.startsWith("0x")).optional(),
  challenge: adminChallengeSchema.optional(),
});

type WalletBody = z.infer<typeof walletBodySchema>;

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address") || "";
  if (!address || !(await isAdminWallet(address))) {
    return errorJson("Wallet is not whitelisted for admin access.", 403);
  }
  return noStoreJson({ wallets: await listAdminWallets() });
}

async function verifyWalletChange(body: WalletBody, action: "admin-add" | "admin-remove") {
  if (!body.address || !body.targetAddress || !body.message || !body.signature || !body.challenge) {
    return { ok: false as const, error: "Wallet signature and target wallet are required." };
  }
  return verifyAdminSignature({
    action,
    address: body.address,
    targetAddress: body.targetAddress,
    message: body.message,
    signature: body.signature,
    challenge: body.challenge as AdminChallenge,
  });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const parsed = await parseJsonBody(request, walletBodySchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const verification = await verifyWalletChange(body, "admin-add");
  if (!verification.ok) return errorJson(verification.error || "Admin authorization failed.", 401);

  const row = await setAdminWallet({ walletAddress: body.targetAddress!, active: true, actor: body.address!, label: body.label });
  return noStoreJson({ ok: true, wallet: row, wallets: await listAdminWallets() });
}

export async function DELETE(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const parsed = await parseJsonBody(request, walletBodySchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const verification = await verifyWalletChange(body, "admin-remove");
  if (!verification.ok) return errorJson(verification.error || "Admin authorization failed.", 401);
  if (body.address?.toLowerCase() === body.targetAddress?.toLowerCase()) {
    return errorJson("You cannot dewhitelist the wallet currently signing this action.", 400);
  }
  if ((await activeAdminCount()) <= 1) {
    return errorJson("Cannot remove the last active admin wallet.", 400);
  }

  const row = await setAdminWallet({ walletAddress: body.targetAddress!, active: false, actor: body.address! });
  return noStoreJson({ ok: true, wallet: row, wallets: await listAdminWallets() });
}
