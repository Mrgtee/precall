import type { HostedAgentConfigInput } from "@precall/shared/types";

export type DeployableAgentInput = Omit<HostedAgentConfigInput, "agentId" | "reviewStatus" | "visibility" | "agentShareBps" | "platformShareBps"> & {
  name: string;
};

export type UpdatableAgentInput = {
  agentId: number;
  name?: string | undefined;
  tagline?: string | undefined;
  description?: string | undefined;
  categoryScope?: string[] | undefined;
  strategyMode?: DeployableAgentInput["strategyMode"] | undefined;
  riskProfile?: DeployableAgentInput["riskProfile"] | undefined;
  unlockPriceUsdc?: string | undefined;
  dailyX402BudgetUsdc?: string | undefined;
  maxX402PaymentUsdc?: string | undefined;
  maxCallsPerRun?: number | undefined;
  requireX402?: boolean | undefined;
  visibility?: "public" | "hidden" | undefined;
};

export function sanitizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function scopeText(scope: string[]) {
  return scope.map((item) => item.trim().toLowerCase()).filter(Boolean).join(", ") || "sports";
}

export function deployAgentMessage(input: { wallet: string; payload: DeployableAgentInput }) {
  return [
    "Precall Marketplace deploy agent",
    `Wallet: ${input.wallet}`,
    `Name: ${input.payload.name.trim()}`,
    `Slug: ${sanitizeSlug(input.payload.slug)}`,
    `Tagline: ${input.payload.tagline.trim()}`,
    `Strategy: ${input.payload.strategyMode}`,
    `Risk: ${input.payload.riskProfile}`,
    `Scope: ${scopeText(input.payload.categoryScope)}`,
    `Unlock Price USDC: ${input.payload.unlockPriceUsdc}`,
    `Daily x402 Budget USDC: ${input.payload.dailyX402BudgetUsdc}`,
    `Max x402 Payment USDC: ${input.payload.maxX402PaymentUsdc}`,
    `Max Calls Per Run: ${input.payload.maxCallsPerRun}`,
    `Require x402: ${input.payload.requireX402 ? "true" : "false"}`,
    `Description: ${input.payload.description.trim().slice(0, 700)}`,
  ].join("\n");
}

export function updateAgentMessage(input: { wallet: string; payload: UpdatableAgentInput }) {
  return [
    "Precall Marketplace update agent",
    `Wallet: ${input.wallet}`,
    `Agent: ${input.payload.agentId}`,
    `Name: ${(input.payload.name || "").trim()}`,
    `Tagline: ${(input.payload.tagline || "").trim()}`,
    `Strategy: ${input.payload.strategyMode || ""}`,
    `Risk: ${input.payload.riskProfile || ""}`,
    `Scope: ${scopeText(input.payload.categoryScope || [])}`,
    `Unlock Price USDC: ${input.payload.unlockPriceUsdc || ""}`,
    `Daily x402 Budget USDC: ${input.payload.dailyX402BudgetUsdc || ""}`,
    `Max x402 Payment USDC: ${input.payload.maxX402PaymentUsdc || ""}`,
    `Max Calls Per Run: ${input.payload.maxCallsPerRun ?? ""}`,
    `Require x402: ${typeof input.payload.requireX402 === "boolean" ? (input.payload.requireX402 ? "true" : "false") : ""}`,
    `Visibility: ${input.payload.visibility || ""}`,
    `Description: ${(input.payload.description || "").trim().slice(0, 700)}`,
  ].join("\n");
}
