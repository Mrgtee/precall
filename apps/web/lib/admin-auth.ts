import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";

export type AdminAction = "health" | "run-once" | "resolve";

const allowedActions = new Set<AdminAction>(["health", "run-once", "resolve"]);
const challengeTtlMs = 10 * 60 * 1000;

export type AdminChallenge = {
  action: AdminAction;
  address: string;
  issuedAt: string;
  nonce: string;
  mac: string;
};

function secret() {
  const value = process.env.ADMIN_SECRET;
  if (!value) throw new Error("ADMIN_SECRET is required for admin wallet auth.");
  return value;
}

function normalizeAddress(address: string) {
  return getAddress(address).toLowerCase();
}

export function adminWallets() {
  const raw = process.env.ADMIN_WALLETS || process.env.NEXT_PUBLIC_ADMIN_WALLETS || process.env.AGENT_OWNER_WALLET || "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => isAddress(item))
    .map(normalizeAddress);
}

export function isAdminWallet(address: string) {
  if (!isAddress(address)) return false;
  return adminWallets().includes(normalizeAddress(address));
}

export function isAdminAction(action: string): action is AdminAction {
  return allowedActions.has(action as AdminAction);
}

function challengePayload(challenge: Omit<AdminChallenge, "mac">) {
  return JSON.stringify({
    action: challenge.action,
    address: normalizeAddress(challenge.address),
    issuedAt: challenge.issuedAt,
    nonce: challenge.nonce,
  });
}

function signChallenge(challenge: Omit<AdminChallenge, "mac">) {
  return createHmac("sha256", secret()).update(challengePayload(challenge)).digest("hex");
}

export function challengeMessage(challenge: Omit<AdminChallenge, "mac">) {
  return [
    "Precall Arena admin action",
    "",
    `Action: ${challenge.action}`,
    `Wallet: ${getAddress(challenge.address)}`,
    `Issued At: ${challenge.issuedAt}`,
    `Nonce: ${challenge.nonce}`,
    "",
    "Only sign this if you are intentionally operating the Precall admin console.",
  ].join("\n");
}

export function createAdminChallenge(input: { action: AdminAction; address: string }) {
  const unsigned = {
    action: input.action,
    address: getAddress(input.address),
    issuedAt: new Date().toISOString(),
    nonce: randomBytes(16).toString("hex"),
  } satisfies Omit<AdminChallenge, "mac">;

  return {
    challenge: { ...unsigned, mac: signChallenge(unsigned) },
    message: challengeMessage(unsigned),
  };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyAdminSignature(input: {
  action: AdminAction;
  address: string;
  message: string;
  signature: Hex;
  challenge: AdminChallenge;
}) {
  if (!isAdminWallet(input.address)) return { ok: false, error: "Wallet is not whitelisted for admin access." };
  if (input.challenge.action !== input.action) return { ok: false, error: "Challenge action does not match request." };
  if (normalizeAddress(input.challenge.address) !== normalizeAddress(input.address)) {
    return { ok: false, error: "Challenge wallet does not match request wallet." };
  }

  const issuedAt = Date.parse(input.challenge.issuedAt);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > challengeTtlMs || issuedAt - Date.now() > 60_000) {
    return { ok: false, error: "Admin challenge expired. Please try again." };
  }

  const expectedMac = signChallenge(input.challenge);
  if (!safeEqual(expectedMac, input.challenge.mac)) return { ok: false, error: "Invalid admin challenge." };

  const expectedMessage = challengeMessage(input.challenge);
  if (input.message !== expectedMessage) return { ok: false, error: "Signed message does not match challenge." };

  const verified = await verifyMessage({
    address: getAddress(input.address),
    message: input.message,
    signature: input.signature,
  });
  if (!verified) return { ok: false, error: "Wallet signature verification failed." };

  return { ok: true };
}
