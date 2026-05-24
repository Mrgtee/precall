import { selectedSideProbabilityBps } from "@precall/shared/scoring";

export function bpsToPercent(value: number | null | undefined, digits = 1): string {
  const parsed = Number(value || 0) / 100;
  return `${parsed.toFixed(digits)}%`;
}

export function usdc(value: string | number | null | undefined): string {
  const parsed = Number(value || 0);
  return `${parsed.toFixed(parsed >= 1 ? 2 : 4)} USDC`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function normalizeOutcomes(outcomes?: string[] | string | null): string[] {
  if (Array.isArray(outcomes)) return outcomes.map(String);
  if (typeof outcomes === "string" && outcomes.trim()) {
    try {
      const parsed = JSON.parse(outcomes) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return outcomes.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return ["Yes", "No"];
}

function displayOutcome(value: string): string {
  if (/^yes$/i.test(value)) return "YES";
  if (/^no$/i.test(value)) return "NO";
  return value;
}

export function outcomeForAction(action: string, outcomes?: string[] | string | null): string {
  const normalized = normalizeOutcomes(outcomes);
  const first = displayOutcome(normalized[0] || "YES");
  const second = displayOutcome(normalized[1] || "NO");
  if (action === "BUY_YES") return first;
  if (action === "BUY_NO") return second;
  return "market";
}

export function selectedProbabilityForAction(action: string, yesProbabilityBps: number | null | undefined): number {
  if (action === "BUY_NO" || action === "BUY_YES") return selectedSideProbabilityBps(action, Number(yesProbabilityBps || 0));
  return Number(yesProbabilityBps || 0);
}

export const selectedAgentProbabilityBps = selectedProbabilityForAction;

export function actionLabel(action: string, outcomes?: string[] | string | null): string {
  if (action === "BUY_YES" || action === "BUY_NO") return `Buy ${outcomeForAction(action, outcomes)}`;
  return "Watch";
}

export function statusLabel(status: string, legacy?: boolean) {
  if (legacy) return "Legacy";
  if (status === "published") return "Live";
  if (status === "expired") return "Awaiting resolution";
  if (status === "resolved") return "Resolved";
  if (status === "archived") return "Archived";
  if (status === "failed_resolution") return "Resolution failed";
  return status;
}

export function recommendationLabel(
  action: string,
  outcomes: string[] | string | null | undefined,
  confidenceBps: number | null | undefined,
  suggestedSizeBps: number | null | undefined,
): string {
  if (action !== "BUY_YES" && action !== "BUY_NO") return "Watch";
  const outcome = outcomeForAction(action, outcomes);
  const confidence = Number(confidenceBps || 0);
  const size = Number(suggestedSizeBps || 0);
  if (confidence < 5_200 || size < 100) return `Lean ${outcome}`;
  return `Buy ${outcome}`;
}

export function recommendationHelp(
  action: string,
  confidenceBps: number | null | undefined,
  suggestedSizeBps: number | null | undefined,
): string {
  if (action !== "BUY_YES" && action !== "BUY_NO") return "No trade: the agent did not find enough edge.";
  const confidence = Number(confidenceBps || 0);
  const size = Number(suggestedSizeBps || 0);
  if (confidence < 5_200 || size < 100) return "Weak or legacy signal: Precall would not publish this under the hardened V1 quality gates.";
  return "Directional signal: the agent found enough edge and confidence to label this as a buy idea.";
}
