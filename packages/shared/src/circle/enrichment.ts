import { spawnSync } from "node:child_process";
import { boolEnv, optionalEnv } from "../env";

const TWITTER_SEARCH_ENDPOINT = "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search";

export function circleEnrichmentEnabled(): boolean {
  return boolEnv("ENABLE_CIRCLE_ENRICHMENT", false);
}

export function fetchCircleSocialEvidence(query: string): string[] {
  if (!circleEnrichmentEnabled()) return [];

  const cli = optionalEnv("CIRCLE_CLI", "/home/gtee/.local/bin/circle");
  const wallet = optionalEnv("CIRCLE_WALLET_ADDRESS");
  const chain = optionalEnv("CIRCLE_CHAIN", "MATIC");
  const maxAmount = optionalEnv("CIRCLE_READ_MAX_AMOUNT", "0.005");
  const timeout = optionalEnv("CIRCLE_TIMEOUT_SECONDS", "60");
  if (!wallet) throw new Error("CIRCLE_WALLET_ADDRESS is required when Circle enrichment is enabled.");

  const url = new URL(TWITTER_SEARCH_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("queryType", "Top");

  const result = spawnSync(
    cli,
    [
      "services",
      "pay",
      url.toString(),
      "--address",
      wallet,
      "--chain",
      chain,
      "--max-amount",
      maxAmount,
      "--timeout",
      timeout,
      "--output",
      "json",
    ],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    throw new Error(`Circle x402 enrichment failed: ${(result.stderr || result.stdout).slice(0, 800)}`);
  }

  const payload = JSON.parse(result.stdout) as { data?: { response?: { tweets?: unknown[] } } };
  return (payload.data?.response?.tweets || [])
    .slice(0, 5)
    .map((tweet) => {
      const row = tweet as { text?: string; url?: string; author?: { userName?: string } };
      return `${row.author?.userName || "unknown"}: ${row.text || ""} ${row.url || ""}`.trim();
    })
    .filter(Boolean);
}
