import { GatewayClient, type Balances, type PayResult, type SupportedChainName, type SupportsResult } from "@circle-fin/x402-batching/client";
import { formatUnits, type Hex } from "viem";
import { boolEnv, optionalEnv } from "../env";

type GatewayClientLike = {
  readonly address?: string | undefined;
  readonly chainName?: string | undefined;
  supports(url: string): Promise<SupportsResult>;
  pay<T = unknown>(url: string, options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; headers?: Record<string, string> }): Promise<PayResult<T>>;
  getBalances(): Promise<Balances>;
};

export type GatewayX402Status =
  | "disabled"
  | "unsupported"
  | "blocked"
  | "insufficient_balance"
  | "success"
  | "failed";

export type GatewayRuntimeConfig = {
  enabled: boolean;
  chain: SupportedChainName;
  privateKey: Hex | "";
  rpcUrl?: string | undefined;
  maxPaymentUsdc: string;
  dailyBudgetUsdc: string;
  allowedHosts: string[];
  minGatewayBalanceUsdc: string;
};

export type GatewayBalanceResult = {
  enabled: boolean;
  status: "disabled" | "success" | "failed";
  chain: string;
  address?: string | undefined;
  balances?: Balances | undefined;
  gatewayAvailableUsdc?: string | undefined;
  error?: string | undefined;
};

export type PayX402ResourceInput = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
  dailySpendUsdc?: string | number | undefined;
  client?: GatewayClientLike | undefined;
  config?: Partial<GatewayRuntimeConfig> | undefined;
};

export type PayX402ResourceResult<T = unknown> = {
  enabled: boolean;
  status: GatewayX402Status;
  paid: boolean;
  supported?: boolean | undefined;
  url: string;
  providerHost?: string | undefined;
  amountUsdc?: string | undefined;
  maxPaymentUsdc: string;
  dailySpendUsdc: string;
  dailyBudgetUsdc: string;
  paymentNetwork?: string | undefined;
  paymentRef?: string | undefined;
  txHash?: string | undefined;
  data?: T | undefined;
  error?: string | undefined;
};

function toNumber(value: string | number | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toUsdcFromAtomic(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return undefined;
  try {
    return formatUnits(BigInt(value), 6);
  } catch {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : undefined;
  }
}

function extractRequirementAmountUsdc(requirements: unknown) {
  const amount = (requirements as { amount?: unknown } | undefined)?.amount;
  return toUsdcFromAtomic(amount);
}

function extractRequirementNetwork(requirements: unknown) {
  return (requirements as { network?: string } | undefined)?.network;
}

function parseAllowedHosts(value: string) {
  return value.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

function hostnameForUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

export function gatewayRuntimeConfig(overrides: Partial<GatewayRuntimeConfig> = {}): GatewayRuntimeConfig {
  return {
    enabled: overrides.enabled ?? boolEnv("ENABLE_CIRCLE_GATEWAY_X402", false),
    chain: overrides.chain ?? (optionalEnv("CIRCLE_GATEWAY_CHAIN", "arcTestnet") as SupportedChainName),
    privateKey: overrides.privateKey ?? (optionalEnv("CIRCLE_AGENT_PRIVATE_KEY") as Hex | ""),
    rpcUrl: overrides.rpcUrl ?? optionalEnv("CIRCLE_GATEWAY_RPC_URL", optionalEnv("ARC_TESTNET_RPC_URL")),
    maxPaymentUsdc: overrides.maxPaymentUsdc ?? optionalEnv("CIRCLE_X402_MAX_PAYMENT_USDC", "0.005"),
    dailyBudgetUsdc: overrides.dailyBudgetUsdc ?? optionalEnv("CIRCLE_X402_DAILY_BUDGET_USDC", "0.10"),
    allowedHosts: overrides.allowedHosts ?? parseAllowedHosts(optionalEnv("CIRCLE_X402_ALLOWED_HOSTS", "api.aisa.one")),
    minGatewayBalanceUsdc: overrides.minGatewayBalanceUsdc ?? optionalEnv("CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC", "0.25"),
  };
}

export function gatewayX402Enabled() {
  return gatewayRuntimeConfig().enabled;
}

export function createGatewayClient(overrides: Partial<GatewayRuntimeConfig> = {}) {
  const config = gatewayRuntimeConfig(overrides);
  if (!config.enabled) return null;
  if (!config.privateKey) throw new Error("CIRCLE_AGENT_PRIVATE_KEY is required when ENABLE_CIRCLE_GATEWAY_X402=true.");
  const clientConfig = config.rpcUrl
    ? { chain: config.chain, privateKey: config.privateKey, rpcUrl: config.rpcUrl }
    : { chain: config.chain, privateKey: config.privateKey };
  return new GatewayClient(clientConfig);
}

export function isAllowedX402Host(url: string, allowedHosts = gatewayRuntimeConfig().allowedHosts) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

async function resolveClient(inputClient: GatewayClientLike | undefined, config: GatewayRuntimeConfig) {
  if (inputClient) return inputClient;
  return createGatewayClient(config);
}

export async function getGatewayBalances(input: { client?: GatewayClientLike; config?: Partial<GatewayRuntimeConfig> } = {}): Promise<GatewayBalanceResult> {
  const config = gatewayRuntimeConfig(input.config);
  if (!config.enabled) return { enabled: false, status: "disabled", chain: config.chain };
  if (!config.privateKey && !input.client) return { enabled: true, status: "failed", chain: config.chain, error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };

  try {
    const client = await resolveClient(input.client, config);
    if (!client) return { enabled: false, status: "disabled", chain: config.chain };
    const balances = await client.getBalances();
    return {
      enabled: true,
      status: "success",
      chain: config.chain,
      address: client.address,
      balances,
      gatewayAvailableUsdc: balances.gateway.formattedAvailable,
    };
  } catch (error) {
    return { enabled: true, status: "failed", chain: config.chain, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function supportsX402Resource(url: string, input: { client?: GatewayClientLike; config?: Partial<GatewayRuntimeConfig> } = {}) {
  const config = gatewayRuntimeConfig(input.config);
  if (!config.enabled) return { enabled: false, supported: false, status: "disabled" as const, error: "Gateway x402 is disabled." };
  if (!isAllowedX402Host(url, config.allowedHosts)) return { enabled: true, supported: false, status: "blocked" as const, error: `Host is not allowlisted: ${hostnameForUrl(url)}` };
  if (!config.privateKey && !input.client) return { enabled: true, supported: false, status: "failed" as const, error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };

  const client = await resolveClient(input.client, config);
  if (!client) return { enabled: false, supported: false, status: "disabled" as const, error: "Gateway x402 is disabled." };
  const result = await client.supports(url);
  return { enabled: true, status: result.supported ? "success" as const : "unsupported" as const, ...result };
}

export async function payX402Resource<T = unknown>(input: PayX402ResourceInput): Promise<PayX402ResourceResult<T>> {
  const config = gatewayRuntimeConfig(input.config);
  const dailySpend = toNumber(input.dailySpendUsdc, 0);
  const base = {
    enabled: config.enabled,
    paid: false,
    url: input.url,
    maxPaymentUsdc: config.maxPaymentUsdc,
    dailySpendUsdc: dailySpend.toFixed(6),
    dailyBudgetUsdc: config.dailyBudgetUsdc,
  };

  if (!config.enabled) return { ...base, status: "disabled", error: "Gateway x402 is disabled." };
  if (!isAllowedX402Host(input.url, config.allowedHosts)) {
    const providerHost = hostnameForUrl(input.url);
    return { ...base, status: "blocked", providerHost, error: `Host is not allowlisted: ${providerHost}` };
  }
  if (!config.privateKey && !input.client) return { ...base, status: "failed", error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };

  try {
    const client = await resolveClient(input.client, config);
    if (!client) return { ...base, status: "disabled", error: "Gateway x402 is disabled." };

    const support = await client.supports(input.url);
    if (!support.supported) return { ...base, status: "unsupported", supported: false, error: support.error || "Resource does not support Gateway x402." };

    const amountUsdc = extractRequirementAmountUsdc(support.requirements);
    if (!amountUsdc) return { ...base, status: "blocked", supported: true, error: "x402 payment amount was not published by the seller." };

    const amount = toNumber(amountUsdc);
    const maxPayment = toNumber(config.maxPaymentUsdc);
    const budget = toNumber(config.dailyBudgetUsdc);
    if (amount > maxPayment) return { ...base, status: "blocked", supported: true, amountUsdc, error: `x402 payment ${amountUsdc} USDC exceeds per-request cap ${config.maxPaymentUsdc} USDC.` };
    if (dailySpend + amount > budget) return { ...base, status: "blocked", supported: true, amountUsdc, error: `Daily x402 budget would be exceeded (${(dailySpend + amount).toFixed(6)} > ${config.dailyBudgetUsdc} USDC).` };

    const balances = await client.getBalances();
    const available = toNumber(balances.gateway.formattedAvailable);
    const minGatewayBalance = toNumber(config.minGatewayBalanceUsdc);
    if (available < minGatewayBalance || available < amount) {
      return {
        ...base,
        status: "insufficient_balance",
        supported: true,
        amountUsdc,
        error: `Gateway available balance ${balances.gateway.formattedAvailable} USDC is below required minimum ${config.minGatewayBalanceUsdc} USDC or payment amount ${amountUsdc} USDC.`,
      };
    }

    const payOptions: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; headers?: Record<string, string> } = {};
    if (input.method) payOptions.method = input.method;
    if (input.body !== undefined) payOptions.body = input.body;
    if (input.headers) payOptions.headers = input.headers;
    const paid = await client.pay<T>(input.url, payOptions);
    const paidAmount = paid.formattedAmount || amountUsdc;
    return {
      ...base,
      status: "success",
      paid: Number(paidAmount) > 0,
      supported: true,
      amountUsdc: paidAmount,
      paymentNetwork: extractRequirementNetwork(support.requirements),
      paymentRef: paid.transaction || undefined,
      txHash: paid.transaction || undefined,
      data: paid.data,
    };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
