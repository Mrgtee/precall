import { gatewayRuntimeConfig, gatewayX402Enabled } from "./gateway-client";

export function circleEnrichmentEnabled(): boolean {
  return gatewayX402Enabled();
}

export function circleEnrichmentStatus() {
  const config = gatewayRuntimeConfig();
  return {
    enabled: config.enabled,
    walletConfigured: Boolean(config.privateKey),
    walletAddress: "",
    chain: config.chain,
    maxAmount: config.maxPaymentUsdc,
    allowedHosts: config.allowedHosts,
  };
}

export function fetchCircleSocialEvidence() {
  return {
    enabled: gatewayX402Enabled(),
    walletConfigured: Boolean(gatewayRuntimeConfig().privateKey),
    status: "disabled" as const,
    evidence: [],
    error: "Legacy Circle CLI enrichment was replaced by Gateway/x402 providers.",
  };
}
