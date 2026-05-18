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

export function actionLabel(action: string): string {
  if (action === "BUY_YES") return "Buy YES";
  if (action === "BUY_NO") return "Buy NO";
  return "Watch";
}
