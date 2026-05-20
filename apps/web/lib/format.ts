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

function displayOutcome(value: string): string {
  if (/^yes$/i.test(value)) return "YES";
  if (/^no$/i.test(value)) return "NO";
  return value;
}

export function outcomeForAction(action: string, outcomes?: string[] | null): string {
  const first = displayOutcome(outcomes?.[0] || "YES");
  const second = displayOutcome(outcomes?.[1] || "NO");
  if (action === "BUY_YES") return first;
  if (action === "BUY_NO") return second;
  return "market";
}

export function selectedAgentProbabilityBps(action: string, agentProbabilityBps: number | null | undefined): number {
  const probability = Number(agentProbabilityBps || 0);
  if (action === "BUY_NO") return 10_000 - probability;
  return probability;
}

export function actionLabel(action: string, outcomes?: string[] | null): string {
  if (action === "BUY_YES" || action === "BUY_NO") return `Buy ${outcomeForAction(action, outcomes)}`;
  return "Watch";
}

export function recommendationLabel(
  action: string,
  outcomes: string[] | null | undefined,
  confidenceBps: number | null | undefined,
  suggestedSizeBps: number | null | undefined,
): string {
  if (action !== "BUY_YES" && action !== "BUY_NO") return "Watch";

  const outcome = outcomeForAction(action, outcomes);
  const confidence = Number(confidenceBps || 0);
  const size = Number(suggestedSizeBps || 0);

  if (confidence < 1_000 || size < 25) return `Watchlist: ${outcome}`;
  if (confidence < 3_500 || size < 75) return `Speculative ${outcome}`;
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
  if (confidence < 1_000 || size < 25) {
    return "Weak signal: possible mispricing, but confidence and suggested size are too low for a direct buy call.";
  }
  if (confidence < 3_500 || size < 75) {
    return "Speculative signal: only consider a tiny position if you agree with the thesis.";
  }
  return "Directional signal: the agent found enough edge and confidence to label this as a buy idea.";
}
