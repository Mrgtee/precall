import { spawnSync } from "node:child_process";
import { boolEnv, optionalEnv } from "../env";

const TWITTER_SEARCH_ENDPOINT = "https://api.aisa.one/apis/v2/twitter/tweet/advanced_search";

export type CircleEnrichmentEvidence = {
  sourceUrl: string;
  title: string;
  excerpt: string;
  credibilityScore?: number;
  capturedAt?: string;
  metadata?: Record<string, unknown> | undefined;
};

export type CircleEnrichmentResult = {
  enabled: boolean;
  walletConfigured: boolean;
  status: "disabled" | "success" | "failed";
  walletAddress?: string | undefined;
  chain?: string | undefined;
  maxAmount?: string | undefined;
  amount?: string | undefined;
  paymentReference?: string | undefined;
  error?: string | undefined;
  evidence: CircleEnrichmentEvidence[];
  metadata?: Record<string, unknown> | undefined;
};

export function circleEnrichmentEnabled(): boolean {
  return boolEnv("ENABLE_CIRCLE_ENRICHMENT", false);
}

export function circleEnrichmentStatus() {
  return {
    enabled: circleEnrichmentEnabled(),
    walletConfigured: Boolean(optionalEnv("CIRCLE_WALLET_ADDRESS")),
    walletAddress: optionalEnv("CIRCLE_WALLET_ADDRESS"),
    chain: optionalEnv("CIRCLE_CHAIN", "MATIC"),
    maxAmount: optionalEnv("CIRCLE_READ_MAX_AMOUNT", "0.005"),
  };
}

function disabledResult(): CircleEnrichmentResult {
  const status = circleEnrichmentStatus();
  return {
    enabled: status.enabled,
    walletConfigured: status.walletConfigured,
    status: "disabled",
    walletAddress: status.walletAddress,
    chain: status.chain,
    maxAmount: status.maxAmount,
    evidence: [],
  };
}

export function fetchCircleSocialEvidence(query: string): CircleEnrichmentResult {
  if (!circleEnrichmentEnabled()) return disabledResult();

  const cli = optionalEnv("CIRCLE_CLI", "/home/gtee/.local/bin/circle");
  const wallet = optionalEnv("CIRCLE_WALLET_ADDRESS");
  const chain = optionalEnv("CIRCLE_CHAIN", "MATIC");
  const maxAmount = optionalEnv("CIRCLE_READ_MAX_AMOUNT", "0.005");
  const timeout = optionalEnv("CIRCLE_TIMEOUT_SECONDS", "60");
  if (!wallet) {
    return { ...disabledResult(), enabled: true, status: "failed", error: "CIRCLE_WALLET_ADDRESS is required when Circle enrichment is enabled." };
  }

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
    return {
      enabled: true,
      walletConfigured: true,
      status: "failed",
      walletAddress: wallet,
      chain,
      maxAmount,
      evidence: [],
      error: (result.stderr || result.stdout).slice(0, 800),
    };
  }

  const payload = JSON.parse(result.stdout) as {
    payment?: { amount?: string | undefined; reference?: string; txHash?: string };
    data?: { response?: { tweets?: unknown[] } };
  };
  const evidence = (payload.data?.response?.tweets || [])
    .slice(0, 5)
    .map((tweet, index) => {
      const row = tweet as { text?: string; url?: string; author?: { userName?: string } };
      return {
        sourceUrl: row.url || url.toString(),
        title: `x402 social signal ${index + 1}${row.author?.userName ? ` by @${row.author.userName}` : ""}`,
        excerpt: `${row.author?.userName || "unknown"}: ${row.text || ""}`.trim(),
        credibilityScore: 62,
        capturedAt: new Date().toISOString(),
        metadata: { provider: "circle_x402", endpoint: TWITTER_SEARCH_ENDPOINT },
      };
    })
    .filter((item) => item.excerpt.length > 0);

  return {
    enabled: true,
    walletConfigured: true,
    status: "success",
    walletAddress: wallet,
    chain,
    maxAmount,
    amount: payload.payment?.amount,
    paymentReference: payload.payment?.reference || payload.payment?.txHash,
    evidence,
    metadata: { endpoint: TWITTER_SEARCH_ENDPOINT, query },
  };
}
