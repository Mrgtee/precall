import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { createDb } from "@precall/shared/db/client";
import { adminChallengeUses, adminWallets as adminWalletRows } from "@precall/shared/db/schema";

export type WorkerAdminAction = "health" | "run-once" | "sports" | "resolve" | "expire";
export type AdminWalletAction = "admin-add" | "admin-remove";
export type AdminAction = WorkerAdminAction | AdminWalletAction;

const workerActions = new Set<WorkerAdminAction>(["health", "run-once", "sports", "resolve", "expire"]);
const walletActions = new Set<AdminWalletAction>(["admin-add", "admin-remove"]);
const allowedActions = new Set<AdminAction>([...workerActions, ...walletActions]);
const challengeTtlMs = 10 * 60 * 1000;

export type AdminChallenge = {
  action: AdminAction;
  address: string;
  targetAddress?: string | undefined;
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

export function configuredAdminWallets() {
  const raw = process.env.ADMIN_WALLETS || process.env.NEXT_PUBLIC_ADMIN_WALLETS || process.env.AGENT_OWNER_WALLET || "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => isAddress(item))
    .map(normalizeAddress);
}

async function dbAdminRows() {
  try {
    return await createDb().query.adminWallets.findMany();
  } catch {
    return [];
  }
}

type ListedAdminWallet = { walletAddress: string; active: boolean; source: "env" | "database"; label: string; addedBy: string };

export async function listAdminWallets() {
  const configured: ListedAdminWallet[] = configuredAdminWallets().map((walletAddress) => ({
    walletAddress,
    active: true,
    source: "env" as const,
    label: "Configured admin",
    addedBy: "env",
  }));
  const rows = await dbAdminRows();
  const merged = new Map<string, ListedAdminWallet>(configured.map((item) => [item.walletAddress, item]));

  for (const row of rows) {
    merged.set(normalizeAddress(row.walletAddress), {
      walletAddress: normalizeAddress(row.walletAddress),
      active: row.active,
      source: "database" as const,
      label: row.label,
      addedBy: row.addedBy,
    });
  }

  return [...merged.values()].sort((left, right) => Number(right.active) - Number(left.active) || left.walletAddress.localeCompare(right.walletAddress));
}

export async function isAdminWallet(address: string) {
  if (!isAddress(address)) return false;
  const normalized = normalizeAddress(address);
  const row = await createDb().query.adminWallets.findFirst({ where: eq(adminWalletRows.walletAddress, normalized) }).catch(() => undefined);
  if (row) return row.active;
  return configuredAdminWallets().includes(normalized);
}

export async function setAdminWallet(input: { walletAddress: string; active: boolean; actor: string; label?: string | undefined }) {
  const walletAddress = normalizeAddress(input.walletAddress);
  const actor = normalizeAddress(input.actor);
  const db = createDb();
  const [row] = await db
    .insert(adminWalletRows)
    .values({
      walletAddress,
      active: input.active,
      label: input.label || "",
      addedBy: actor,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: adminWalletRows.walletAddress,
      set: { active: input.active, label: input.label || "", addedBy: actor, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function activeAdminCount() {
  const list = await listAdminWallets();
  return list.filter((item) => item.active).length;
}

export function isWorkerAdminAction(action: string): action is WorkerAdminAction {
  return workerActions.has(action as WorkerAdminAction);
}

export function isAdminWalletAction(action: string): action is AdminWalletAction {
  return walletActions.has(action as AdminWalletAction);
}

export function isAdminAction(action: string): action is AdminAction {
  return allowedActions.has(action as AdminAction);
}

function challengePayload(challenge: Omit<AdminChallenge, "mac">) {
  return JSON.stringify({
    action: challenge.action,
    address: normalizeAddress(challenge.address),
    targetAddress: challenge.targetAddress ? normalizeAddress(challenge.targetAddress) : "",
    issuedAt: challenge.issuedAt,
    nonce: challenge.nonce,
  });
}

function signChallenge(challenge: Omit<AdminChallenge, "mac">) {
  return createHmac("sha256", secret()).update(challengePayload(challenge)).digest("hex");
}

export function challengeMessage(challenge: Omit<AdminChallenge, "mac">) {
  const lines = [
    "Precall Arena admin action",
    "",
    `Action: ${challenge.action}`,
    `Wallet: ${getAddress(challenge.address)}`,
  ];
  if (challenge.targetAddress) lines.push(`Target Wallet: ${getAddress(challenge.targetAddress)}`);
  lines.push(
    `Issued At: ${challenge.issuedAt}`,
    `Nonce: ${challenge.nonce}`,
    "",
    "Only sign this if you are intentionally operating the Precall admin console.",
  );
  return lines.join("\n");
}

export function createAdminChallenge(input: { action: AdminAction; address: string; targetAddress?: string | undefined }) {
  const needsTarget = isAdminWalletAction(input.action);
  if (needsTarget && (!input.targetAddress || !isAddress(input.targetAddress))) {
    throw new Error("A valid target wallet is required for this admin action.");
  }
  const unsigned = {
    action: input.action,
    address: getAddress(input.address),
    targetAddress: input.targetAddress ? getAddress(input.targetAddress) : undefined,
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

async function consumeAdminChallenge(input: { challenge: AdminChallenge; address: string; targetAddress?: string | undefined }) {
  try {
    await createDb().insert(adminChallengeUses).values({
      challengeMac: input.challenge.mac,
      nonce: input.challenge.nonce,
      action: input.challenge.action,
      signerWallet: normalizeAddress(input.address),
      targetWallet: input.targetAddress ? normalizeAddress(input.targetAddress) : "",
    });
    return { ok: true as const };
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : String(error);
    if (code === "23505" || /duplicate key|unique/i.test(message)) {
      return { ok: false as const, error: "Admin challenge has already been used. Please request a new challenge." };
    }
    return { ok: false as const, error: "Admin challenge replay protection failed. Run database migrations and try again." };
  }
}

export async function verifyAdminSignature(input: {
  action: AdminAction;
  address: string;
  message: string;
  signature: Hex;
  challenge: AdminChallenge;
  targetAddress?: string | undefined;
}) {
  if (!(await isAdminWallet(input.address))) return { ok: false, error: "Wallet is not whitelisted for admin access." };
  if (input.challenge.action !== input.action) return { ok: false, error: "Challenge action does not match request." };
  if (normalizeAddress(input.challenge.address) !== normalizeAddress(input.address)) {
    return { ok: false, error: "Challenge wallet does not match request wallet." };
  }
  const challengeTarget = input.challenge.targetAddress ? normalizeAddress(input.challenge.targetAddress) : "";
  const inputTarget = input.targetAddress ? normalizeAddress(input.targetAddress) : "";
  if (challengeTarget !== inputTarget) return { ok: false, error: "Challenge target wallet does not match request." };

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

  const consumed = await consumeAdminChallenge({
    challenge: input.challenge,
    address: input.address,
    targetAddress: input.targetAddress,
  });
  if (!consumed.ok) return consumed;

  return { ok: true };
}
