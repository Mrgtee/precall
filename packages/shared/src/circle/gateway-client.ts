import { GatewayClient, type Balances, type DepositResult, type PayResult, type SupportedChainName, type SupportsResult } from "@circle-fin/x402-batching/client";
import { formatUnits, type Hex } from "viem";
import { boolEnv, optionalEnv } from "../env";

export type GatewayClientLike = {
  readonly address?: string | undefined;
  readonly chainName?: string | undefined;
  supports(url: string): Promise<SupportsResult>;
  pay<T = unknown>(url: string, options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; headers?: Record<string, string> }): Promise<PayResult<T>>;
  getBalances(): Promise<Balances>;
  deposit?(amount: string, options?: { approveAmount?: string; skipApprovalCheck?: boolean }): Promise<DepositResult>;
};

export type GatewayX402Status =
  | "disabled"
  | "unsupported"
  | "blocked"
  | "insufficient_balance"
  | "success"
  | "failed";

const X402_PAYMENT_CHAIN: SupportedChainName = "base";

function x402PaymentChainCandidates() {
  return [X402_PAYMENT_CHAIN];
}

export type GatewayRuntimeConfig = {
  enabled: boolean;
  chain: SupportedChainName;
  chainCandidates: SupportedChainName[];
  privateKey: Hex | "";
  rpcUrl?: string | undefined;
  maxPaymentUsdc: string;
  dailyBudgetUsdc: string;
  allowedHosts: string[];
  minGatewayBalanceUsdc: string;
  maxDepositUsdc: string;
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

export type GatewayDepositResult = {
  enabled: boolean;
  status: "disabled" | "success" | "blocked" | "insufficient_balance" | "failed";
  chain: string;
  address?: string | undefined;
  amountUsdc: string;
  maxDepositUsdc: string;
  approvalTxHash?: string | undefined;
  depositTxHash?: string | undefined;
  gatewayAvailableUsdcBefore?: string | undefined;
  gatewayAvailableUsdcAfter?: string | undefined;
  walletBalanceUsdcBefore?: string | undefined;
  walletBalanceUsdcAfter?: string | undefined;
  error?: string | undefined;
};

export type DepositGatewayUsdcInput = {
  amountUsdc: string;
  chain?: SupportedChainName | undefined;
  client?: GatewayClientLike | undefined;
  config?: Partial<GatewayRuntimeConfig> | undefined;
};

export type GatewaySupportCheck = {
  chain: string;
  status: "success" | "unsupported" | "failed";
  supported: boolean;
  amountUsdc?: string | undefined;
  paymentNetwork?: string | undefined;
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
  clients?: Partial<Record<SupportedChainName, GatewayClientLike>> | undefined;
  chainCandidates?: SupportedChainName[] | undefined;
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
  selectedChain?: string | undefined;
  supportChecks?: GatewaySupportCheck[] | undefined;
  failureReason?: string | undefined;
  paymentRef?: string | undefined;
  txHash?: string | undefined;
  data?: T | undefined;
  error?: string | undefined;
};

function toNumber(value: string | number | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUsdcAmount(value: string | number | undefined) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) {
    return { ok: false as const, value: raw, error: "Amount must be a positive USDC decimal with up to 6 decimals." };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false as const, value: raw, error: "Amount must be greater than 0 USDC." };
  }
  return { ok: true as const, value: parsed.toFixed(6).replace(/\.?0+$/, "") };
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

function parseChainCandidates(value: string | undefined, fallback: SupportedChainName) {
  const rawCandidates = (value || "")
    .split(",")
    .map((chain) => chain.trim())
    .filter(Boolean) as SupportedChainName[];
  const candidates = rawCandidates.length > 0 ? rawCandidates : [fallback];
  const seen = new Set<string>();
  const normalized = candidates.filter((chain) => {
    if (seen.has(chain)) return false;
    seen.add(chain);
    return true;
  });
  return normalized.length > 0 ? normalized : [fallback];
}

function hostnameForUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

function rpcEnvNameForChain(chain: string) {
  return `CIRCLE_GATEWAY_${chain.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_RPC_URL`;
}

function rpcUrlForChain(chain: SupportedChainName, config: GatewayRuntimeConfig) {
  if (chain === config.chain && config.rpcUrl) return config.rpcUrl;
  const chainSpecificRpc = optionalEnv(rpcEnvNameForChain(chain));
  if (chainSpecificRpc) return chainSpecificRpc;
  if (chain === "arcTestnet") return optionalEnv("CIRCLE_GATEWAY_RPC_URL", optionalEnv("ARC_TESTNET_RPC_URL"));
  return undefined;
}

export function gatewayRuntimeConfig(overrides: Partial<GatewayRuntimeConfig> = {}): GatewayRuntimeConfig {
  const chain = overrides.chain ?? (optionalEnv("CIRCLE_GATEWAY_CHAIN", "arcTestnet") as SupportedChainName);
  return {
    enabled: overrides.enabled ?? boolEnv("ENABLE_CIRCLE_GATEWAY_X402", false),
    chain,
    chainCandidates: overrides.chainCandidates ?? x402PaymentChainCandidates(),
    privateKey: overrides.privateKey ?? (optionalEnv("CIRCLE_AGENT_PRIVATE_KEY") as Hex | ""),
    rpcUrl: overrides.rpcUrl ?? optionalEnv("CIRCLE_GATEWAY_RPC_URL", chain === "arcTestnet" ? optionalEnv("ARC_TESTNET_RPC_URL") : undefined),
    maxPaymentUsdc: overrides.maxPaymentUsdc ?? optionalEnv("CIRCLE_X402_MAX_PAYMENT_USDC", "0.005"),
    dailyBudgetUsdc: overrides.dailyBudgetUsdc ?? optionalEnv("CIRCLE_X402_DAILY_BUDGET_USDC", "0.10"),
    allowedHosts: overrides.allowedHosts ?? parseAllowedHosts(optionalEnv("CIRCLE_X402_ALLOWED_HOSTS", "api.aisa.one")),
    minGatewayBalanceUsdc: overrides.minGatewayBalanceUsdc ?? optionalEnv("CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC", "0.25"),
    maxDepositUsdc: overrides.maxDepositUsdc ?? optionalEnv("CIRCLE_GATEWAY_MAX_DEPOSIT_USDC", "10"),
  };
}

export function gatewayX402Enabled() {
  return gatewayRuntimeConfig().enabled;
}

export function createGatewayClient(overrides: Partial<GatewayRuntimeConfig> = {}) {
  const config = gatewayRuntimeConfig(overrides);
  return createGatewayClientForChain(config.chain, config);
}

export function createGatewayClientForChain(chain: SupportedChainName, overrides: Partial<GatewayRuntimeConfig> = {}) {
  const config = gatewayRuntimeConfig(overrides);
  if (!config.enabled) return null;
  if (!config.privateKey) throw new Error("CIRCLE_AGENT_PRIVATE_KEY is required when ENABLE_CIRCLE_GATEWAY_X402=true.");
  const rpcUrl = rpcUrlForChain(chain, config);
  const clientConfig = rpcUrl
    ? { chain, privateKey: config.privateKey, rpcUrl }
    : { chain, privateKey: config.privateKey };
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

async function resolveClient(inputClient: GatewayClientLike | undefined, config: GatewayRuntimeConfig, chain = config.chain) {
  if (inputClient) return inputClient;
  return createGatewayClientForChain(chain, config);
}

function clientForChain(input: { client?: GatewayClientLike | undefined; clients?: Partial<Record<SupportedChainName, GatewayClientLike>> | undefined }, chain: SupportedChainName) {
  return input.clients?.[chain] || input.client;
}

export async function getGatewayBalances(input: { client?: GatewayClientLike; config?: Partial<GatewayRuntimeConfig>; chain?: SupportedChainName | undefined } = {}): Promise<GatewayBalanceResult> {
  const config = gatewayRuntimeConfig(input.config);
  const chain = input.chain || config.chain;
  if (!config.enabled) return { enabled: false, status: "disabled", chain };
  if (!config.privateKey && !input.client) return { enabled: true, status: "failed", chain, error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };

  try {
    const client = await resolveClient(input.client, config, chain);
    if (!client) return { enabled: false, status: "disabled", chain };
    const balances = await client.getBalances();
    return {
      enabled: true,
      status: "success",
      chain,
      address: client.address,
      balances,
      gatewayAvailableUsdc: balances.gateway.formattedAvailable,
    };
  } catch (error) {
    return { enabled: true, status: "failed", chain, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getGatewayBalancesByChain(input: { clients?: Partial<Record<SupportedChainName, GatewayClientLike>>; config?: Partial<GatewayRuntimeConfig>; chains?: SupportedChainName[] | undefined } = {}) {
  const config = gatewayRuntimeConfig(input.config);
  const chains = input.chains || config.chainCandidates;
  const balances: GatewayBalanceResult[] = [];
  for (const chain of chains) {
    const client = input.clients?.[chain];
    balances.push(await getGatewayBalances(client ? { client, config, chain } : { config, chain }));
  }
  return balances;
}

export async function depositGatewayUsdc(input: DepositGatewayUsdcInput): Promise<GatewayDepositResult> {
  const config = gatewayRuntimeConfig(input.config);
  const chain = input.chain || config.chain;
  const normalizedAmount = normalizeUsdcAmount(input.amountUsdc);
  const normalizedMaxDeposit = normalizeUsdcAmount(config.maxDepositUsdc);
  const amountUsdc = normalizedAmount.value;
  const maxDepositUsdc = normalizedMaxDeposit.ok ? normalizedMaxDeposit.value : config.maxDepositUsdc;

  if (!config.enabled) {
    return { enabled: false, status: "disabled", chain, amountUsdc, maxDepositUsdc, error: "Gateway x402 is disabled." };
  }
  if (!normalizedAmount.ok) {
    return { enabled: true, status: "blocked", chain, amountUsdc, maxDepositUsdc, error: normalizedAmount.error };
  }
  if (!normalizedMaxDeposit.ok) {
    return { enabled: true, status: "blocked", chain, amountUsdc, maxDepositUsdc, error: "CIRCLE_GATEWAY_MAX_DEPOSIT_USDC must be a positive USDC decimal with up to 6 decimals." };
  }
  if (toNumber(normalizedAmount.value) > toNumber(normalizedMaxDeposit.value)) {
    return {
      enabled: true,
      status: "blocked",
      chain,
      amountUsdc,
      maxDepositUsdc,
      error: `Deposit amount ${amountUsdc} USDC exceeds safety cap ${maxDepositUsdc} USDC.`,
    };
  }
  if (!config.privateKey && !input.client) {
    return { enabled: true, status: "failed", chain, amountUsdc, maxDepositUsdc, error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };
  }

  try {
    const client = await resolveClient(input.client, config, chain);
    if (!client) return { enabled: false, status: "disabled", chain, amountUsdc, maxDepositUsdc, error: "Gateway x402 is disabled." };
    if (!client.deposit) return { enabled: true, status: "failed", chain, address: client.address, amountUsdc, maxDepositUsdc, error: "Gateway client does not support deposits." };

    const before = await client.getBalances();
    const walletBefore = toNumber(before.wallet.formatted);
    if (walletBefore < toNumber(amountUsdc)) {
      return {
        enabled: true,
        status: "insufficient_balance",
        chain,
        address: client.address,
        amountUsdc,
        maxDepositUsdc,
        gatewayAvailableUsdcBefore: before.gateway.formattedAvailable,
        walletBalanceUsdcBefore: before.wallet.formatted,
        error: `Wallet USDC balance ${before.wallet.formatted} is below requested deposit ${amountUsdc} USDC.`,
      };
    }

    const deposit = await client.deposit(amountUsdc);
    const after = await client.getBalances();
    return {
      enabled: true,
      status: "success",
      chain,
      address: client.address || deposit.depositor,
      amountUsdc: deposit.formattedAmount || amountUsdc,
      maxDepositUsdc,
      approvalTxHash: deposit.approvalTxHash,
      depositTxHash: deposit.depositTxHash,
      gatewayAvailableUsdcBefore: before.gateway.formattedAvailable,
      gatewayAvailableUsdcAfter: after.gateway.formattedAvailable,
      walletBalanceUsdcBefore: before.wallet.formatted,
      walletBalanceUsdcAfter: after.wallet.formatted,
    };
  } catch (error) {
    return { enabled: true, status: "failed", chain, amountUsdc, maxDepositUsdc, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function supportsX402Resource(url: string, input: { client?: GatewayClientLike; clients?: Partial<Record<SupportedChainName, GatewayClientLike>>; chainCandidates?: SupportedChainName[] | undefined; config?: Partial<GatewayRuntimeConfig> } = {}) {
  const config = gatewayRuntimeConfig(input.config);
  const chainCandidates = x402PaymentChainCandidates();
  const supportChecks: GatewaySupportCheck[] = [];
  if (!config.enabled) return { enabled: false, supported: false, status: "disabled" as const, url, supportChecks, error: "Gateway x402 is disabled." };
  if (!isAllowedX402Host(url, config.allowedHosts)) return { enabled: true, supported: false, status: "blocked" as const, url, supportChecks, error: `Host is not allowlisted: ${hostnameForUrl(url)}` };
  if (!config.privateKey && !input.client && !input.clients) return { enabled: true, supported: false, status: "failed" as const, url, supportChecks, error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };

  for (const chain of chainCandidates) {
    try {
      const client = await resolveClient(clientForChain(input, chain), config, chain);
      if (!client) {
        supportChecks.push({ chain, status: "failed", supported: false, error: "Gateway x402 is disabled." });
        continue;
      }
      const result = await client.supports(url);
      const amountUsdc = extractRequirementAmountUsdc(result.requirements);
      const paymentNetwork = extractRequirementNetwork(result.requirements);
      supportChecks.push({
        chain,
        status: result.supported ? "success" : "unsupported",
        supported: result.supported,
        amountUsdc,
        paymentNetwork,
        error: result.supported ? undefined : result.error || "Resource does not support Gateway x402 on this chain.",
      });
      if (result.supported) {
        const { supported, ...supportMetadata } = result;
        return { enabled: true, status: "success" as const, supported, url, selectedChain: chain, supportChecks, ...supportMetadata };
      }
    } catch (error) {
      supportChecks.push({ chain, status: "failed", supported: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    enabled: true,
    supported: false,
    status: "unsupported" as const,
    url,
    supportChecks,
    failureReason: "unsupported_network",
    error: `unsupported_network: no Gateway batching option available for candidate chains ${chainCandidates.join(", ")}`,
  };
}

export async function payX402Resource<T = unknown>(input: PayX402ResourceInput): Promise<PayX402ResourceResult<T>> {
  const config = gatewayRuntimeConfig(input.config);
  const dailySpend = toNumber(input.dailySpendUsdc, 0);
  const chainCandidates = x402PaymentChainCandidates();
  const supportChecks: GatewaySupportCheck[] = [];
  const base = {
    enabled: config.enabled,
    paid: false,
    url: input.url,
    maxPaymentUsdc: config.maxPaymentUsdc,
    dailySpendUsdc: dailySpend.toFixed(6),
    dailyBudgetUsdc: config.dailyBudgetUsdc,
    supportChecks,
  };

  if (!config.enabled) return { ...base, status: "disabled", error: "Gateway x402 is disabled." };
  if (!isAllowedX402Host(input.url, config.allowedHosts)) {
    const providerHost = hostnameForUrl(input.url);
    return { ...base, status: "blocked", providerHost, error: `Host is not allowlisted: ${providerHost}` };
  }
  if (!config.privateKey && !input.client && !input.clients) return { ...base, status: "failed", error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };

  for (const chain of chainCandidates) {
    try {
      const client = await resolveClient(clientForChain(input, chain), config, chain);
      if (!client) {
        supportChecks.push({ chain, status: "failed", supported: false, error: "Gateway x402 is disabled." });
        continue;
      }

      const support = await client.supports(input.url);
      if (!support.supported) {
        supportChecks.push({ chain, status: "unsupported", supported: false, error: support.error || "Resource does not support Gateway x402 on this chain." });
        continue;
      }

      const amountUsdc = extractRequirementAmountUsdc(support.requirements);
      const paymentNetwork = extractRequirementNetwork(support.requirements);
      const supportCheck: GatewaySupportCheck = { chain, status: "success", supported: true, amountUsdc, paymentNetwork };
      supportChecks.push(supportCheck);
      if (!amountUsdc) return { ...base, status: "blocked", supported: true, selectedChain: chain, error: "x402 payment amount was not published by the seller." };

      const amount = toNumber(amountUsdc);
      const maxPayment = toNumber(config.maxPaymentUsdc);
      const budget = toNumber(config.dailyBudgetUsdc);
      if (amount > maxPayment) return { ...base, status: "blocked", supported: true, selectedChain: chain, amountUsdc, error: `x402 payment ${amountUsdc} USDC exceeds per-request cap ${config.maxPaymentUsdc} USDC.` };
      if (dailySpend + amount > budget) return { ...base, status: "blocked", supported: true, selectedChain: chain, amountUsdc, error: `Daily x402 budget would be exceeded (${(dailySpend + amount).toFixed(6)} > ${config.dailyBudgetUsdc} USDC).` };

      const balances = await client.getBalances();
      supportCheck.gatewayAvailableUsdc = balances.gateway.formattedAvailable;
      const available = toNumber(balances.gateway.formattedAvailable);
      const minGatewayBalance = toNumber(config.minGatewayBalanceUsdc);
      if (available < minGatewayBalance || available < amount) {
        return {
          ...base,
          status: "insufficient_balance",
          supported: true,
          selectedChain: chain,
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
        selectedChain: chain,
        amountUsdc: paidAmount,
        paymentNetwork,
        paymentRef: paid.transaction || undefined,
        txHash: paid.transaction || undefined,
        data: paid.data,
      };
    } catch (error) {
      supportChecks.push({ chain, status: "failed", supported: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    ...base,
    status: "unsupported",
    supported: false,
    failureReason: "unsupported_network",
    error: `unsupported_network: no Gateway batching option available for candidate chains ${chainCandidates.join(", ")}`,
  };
}
