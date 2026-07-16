import { CHAIN_CONFIGS, GatewayClient, registerBatchScheme, type Balances, type DepositResult, type PayResult, type SupportedChainName, type SupportsResult } from "@circle-fin/x402-batching/client";
import { ExactEvmScheme } from "@x402/evm";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client, type PaymentRequirements } from "@x402/fetch";
import { formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { boolEnv, numberEnv, optionalEnv } from "../env";

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

const BASE_MAINNET_NETWORK = "eip155:8453";
const ARC_TESTNET_NETWORK = "eip155:5042002";
const MAINNET_FACILITATOR_URL = "https://gateway-api.circle.com";
const TESTNET_FACILITATOR_URL = "https://gateway-api-testnet.circle.com";

export type GatewayRuntimeConfig = {
  enabled: boolean;
  chain: SupportedChainName;
  chainCandidates: SupportedChainName[];
  acceptedNetworks: string[];
  facilitatorUrl: string;
  paymentNetworkLabel: string;
  productionMode: boolean;
  configWarnings: string[];
  configErrors: string[];
  privateKey: Hex | "";
  rpcUrl?: string | undefined;
  maxPaymentUsdc: string;
  dailyBudgetUsdc: string;
  allowedHosts: string[];
  minGatewayBalanceUsdc: string;
  maxDepositUsdc: string;
  requestTimeoutMs: number;
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
  fetch?: typeof globalThis.fetch | undefined;
};

export type GatewaySupportCheck = {
  chain: string;
  status: "success" | "unsupported" | "failed";
  supported: boolean;
  amountUsdc?: string | undefined;
  paymentNetwork?: string | undefined;
  paymentScheme?: "gateway-batched" | "standard-exact" | undefined;
  gatewayAvailableUsdc?: string | undefined;
  walletBalanceUsdc?: string | undefined;
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
  balanceClient?: GatewayClientLike | undefined;
  balanceClients?: Partial<Record<SupportedChainName, GatewayClientLike>> | undefined;
  chainCandidates?: SupportedChainName[] | undefined;
  config?: Partial<GatewayRuntimeConfig> | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  requestTimeoutMs?: number | undefined;
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
  paymentScheme?: "gateway-batched" | "standard-exact" | undefined;
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

function uniqueValues<T extends string>(values: T[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function parseChainCandidates(value: string | undefined, fallback: SupportedChainName) {
  const rawCandidates = (value || "")
    .split(",")
    .map((chain) => chain.trim())
    .filter((chain): chain is SupportedChainName => isSupportedChainName(chain));
  const candidates = rawCandidates.length > 0 ? rawCandidates : [fallback];
  const normalized = uniqueValues(candidates);
  return normalized.length > 0 ? normalized : [fallback];
}

function isSupportedChainName(value: string): value is SupportedChainName {
  return value in CHAIN_CONFIGS;
}

function chainForNetwork(network: string): SupportedChainName | undefined {
  const normalized = network.trim();
  return (Object.keys(CHAIN_CONFIGS) as SupportedChainName[]).find((chain) => networkForChain(chain) === normalized);
}

export function gatewayChainLabel(chain: string | undefined) {
  if (chain === "base") return "Base Mainnet";
  if (chain === "arcTestnet") return "Arc Testnet";
  if (chain === "baseSepolia") return "Base Sepolia";
  if (!chain) return "Not configured";
  return chain.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

export function gatewayNetworkLabel(network: string | undefined) {
  if (!network) return "Not configured";
  const chain = chainForNetwork(network);
  return chain ? gatewayChainLabel(chain) : network;
}

function parseAcceptedNetworks(value: string | undefined, fallbackChain: SupportedChainName) {
  const networks = (value || "")
    .split(",")
    .map((network) => network.trim())
    .filter(Boolean);
  return uniqueValues(networks.length > 0 ? networks : [networkForChain(fallbackChain)]);
}

function chainCandidatesFromAcceptedNetworks(acceptedNetworks: string[], fallbackChain: SupportedChainName) {
  const candidates = acceptedNetworks
    .map((network) => chainForNetwork(network))
    .filter((chain): chain is SupportedChainName => Boolean(chain));
  return uniqueValues(candidates.length > 0 ? candidates : [fallbackChain]);
}

function defaultFacilitatorUrl(chain: SupportedChainName) {
  return chain === "base" ? MAINNET_FACILITATOR_URL : TESTNET_FACILITATOR_URL;
}

function normalizeFacilitatorUrl(value: string) {
  return value.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function hasOverride(overrides: Partial<GatewayRuntimeConfig>, key: keyof GatewayRuntimeConfig) {
  return Object.prototype.hasOwnProperty.call(overrides, key);
}

function validateGatewayRuntimeConfig(config: Omit<GatewayRuntimeConfig, "configWarnings" | "configErrors">, overrides: Partial<GatewayRuntimeConfig>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const expectedNetwork = networkForChain(config.chain);
  const normalizedFacilitator = normalizeFacilitatorUrl(config.facilitatorUrl);
  const maxPayment = normalizeUsdcAmount(config.maxPaymentUsdc);
  const dailyBudget = normalizeUsdcAmount(config.dailyBudgetUsdc);

  for (const network of config.acceptedNetworks) {
    if (!chainForNetwork(network)) errors.push(`Unsupported x402 accepted network: ${network}.`);
  }
  if (!config.acceptedNetworks.includes(expectedNetwork)) {
    errors.push(`CIRCLE_GATEWAY_CHAIN=${config.chain} requires X402_ACCEPTED_NETWORKS to include ${expectedNetwork}.`);
  }
  if (!maxPayment.ok) errors.push("CIRCLE_X402_MAX_PAYMENT_USDC must be a positive USDC decimal with up to 6 decimals.");
  if (!dailyBudget.ok) errors.push("CIRCLE_X402_DAILY_BUDGET_USDC must be a positive USDC decimal with up to 6 decimals.");
  if (maxPayment.ok && dailyBudget.ok && toNumber(maxPayment.value) > toNumber(dailyBudget.value)) {
    errors.push("CIRCLE_X402_MAX_PAYMENT_USDC must not exceed CIRCLE_X402_DAILY_BUDGET_USDC.");
  }

  if (config.chain === "base") {
    warnings.push("Base Mainnet x402 uses real USDC. Keep Railway spending limits tight before enabling required mode.");
    if (!config.acceptedNetworks.includes(BASE_MAINNET_NETWORK)) errors.push(`Base mainnet x402 requires X402_ACCEPTED_NETWORKS=${BASE_MAINNET_NETWORK}.`);
    if (normalizedFacilitator !== MAINNET_FACILITATOR_URL) errors.push(`Base mainnet x402 requires X402_FACILITATOR_URL=${MAINNET_FACILITATOR_URL}.`);
    if (!hasOverride(overrides, "dailyBudgetUsdc") && !process.env.CIRCLE_X402_DAILY_BUDGET_USDC) errors.push("Base mainnet x402 requires CIRCLE_X402_DAILY_BUDGET_USDC to be set explicitly.");
    if (!hasOverride(overrides, "maxPaymentUsdc") && !process.env.CIRCLE_X402_MAX_PAYMENT_USDC) errors.push("Base mainnet x402 requires CIRCLE_X402_MAX_PAYMENT_USDC to be set explicitly.");
  }

  if (config.chain === "arcTestnet") {
    if (!config.acceptedNetworks.includes(ARC_TESTNET_NETWORK)) errors.push(`Arc Testnet x402 requires X402_ACCEPTED_NETWORKS=${ARC_TESTNET_NETWORK}.`);
    if (normalizedFacilitator !== TESTNET_FACILITATOR_URL) errors.push(`Arc Testnet x402 requires X402_FACILITATOR_URL=${TESTNET_FACILITATOR_URL}.`);
  }

  return { errors, warnings };
}

function configuredChainCandidates(inputCandidates: SupportedChainName[] | undefined, config: GatewayRuntimeConfig) {
  const candidates = inputCandidates && inputCandidates.length > 0 ? inputCandidates : config.chainCandidates;
  return uniqueValues(candidates.length > 0 ? candidates : [config.chain]);
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
  const legacyChainCandidateEnv = optionalEnv("CIRCLE_X402_CHAIN_CANDIDATES");
  const acceptedNetworks = overrides.acceptedNetworks ?? (process.env.X402_ACCEPTED_NETWORKS
    ? parseAcceptedNetworks(process.env.X402_ACCEPTED_NETWORKS, chain)
    : legacyChainCandidateEnv
      ? parseChainCandidates(legacyChainCandidateEnv, chain).map(networkForChain)
      : parseAcceptedNetworks(undefined, chain));
  const chainCandidates = overrides.chainCandidates ?? chainCandidatesFromAcceptedNetworks(acceptedNetworks, chain);
  const facilitatorUrl = overrides.facilitatorUrl ?? optionalEnv("X402_FACILITATOR_URL", defaultFacilitatorUrl(chain));
  const baseConfig = {
    enabled: overrides.enabled ?? (boolEnv("ENABLE_CIRCLE_GATEWAY_X402", false) || boolEnv("ENABLE_CIRCLE_ENRICHMENT", false)),
    chain,
    chainCandidates,
    acceptedNetworks,
    facilitatorUrl,
    paymentNetworkLabel: uniqueValues(acceptedNetworks.map(gatewayNetworkLabel)).join(", "),
    productionMode: chain === "base",
    privateKey: overrides.privateKey ?? (optionalEnv("CIRCLE_AGENT_PRIVATE_KEY") as Hex | ""),
    rpcUrl: overrides.rpcUrl ?? optionalEnv("CIRCLE_GATEWAY_RPC_URL", chain === "arcTestnet" ? optionalEnv("ARC_TESTNET_RPC_URL") : undefined),
    maxPaymentUsdc: overrides.maxPaymentUsdc ?? optionalEnv("CIRCLE_X402_MAX_PAYMENT_USDC", "0.005"),
    dailyBudgetUsdc: overrides.dailyBudgetUsdc ?? optionalEnv("CIRCLE_X402_DAILY_BUDGET_USDC", "0.10"),
    allowedHosts: overrides.allowedHosts ?? parseAllowedHosts(optionalEnv("CIRCLE_X402_ALLOWED_HOSTS", "api.aisa.one")),
    minGatewayBalanceUsdc: overrides.minGatewayBalanceUsdc ?? optionalEnv("CIRCLE_X402_MIN_GATEWAY_BALANCE_USDC", "0.25"),
    maxDepositUsdc: overrides.maxDepositUsdc ?? optionalEnv("CIRCLE_GATEWAY_MAX_DEPOSIT_USDC", "10"),
    requestTimeoutMs: Math.max(1, Math.round(overrides.requestTimeoutMs ?? numberEnv("CIRCLE_X402_REQUEST_TIMEOUT_MS", 30_000))),
  };
  const validation = validateGatewayRuntimeConfig(baseConfig, overrides);
  return { ...baseConfig, configWarnings: validation.warnings, configErrors: validation.errors };
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
  const chainCandidates = configuredChainCandidates(input.chainCandidates, config);
  const supportChecks: GatewaySupportCheck[] = [];
  if (!config.enabled) return { enabled: false, supported: false, status: "disabled" as const, url, supportChecks, error: "Gateway x402 is disabled." };
  if (config.configErrors.length > 0) return { enabled: true, supported: false, status: "blocked" as const, url, supportChecks, error: config.configErrors.join(" ") };
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

function networkForChain(chain: SupportedChainName): `${string}:${string}` {
  return `eip155:${CHAIN_CONFIGS[chain].chain.id}` as `${string}:${string}`;
}

function isGatewayBatchingRequirement(requirement: PaymentRequirements) {
  return requirement.scheme === "exact" &&
    typeof requirement.network === "string" &&
    requirement.network.startsWith("eip155:") &&
    requirement.extra?.name === "GatewayWalletBatched" &&
    requirement.extra?.version === "1" &&
    typeof requirement.extra?.verifyingContract === "string";
}

function isStandardExactEvmRequirement(requirement: PaymentRequirements) {
  return requirement.scheme === "exact" &&
    typeof requirement.network === "string" &&
    requirement.network.startsWith("eip155:") &&
    !isGatewayBatchingRequirement(requirement);
}

function selectRequirementForNetwork(requirements: PaymentRequirements[], network: string) {
  return requirements.find((candidate) => candidate.network === network && isGatewayBatchingRequirement(candidate)) ||
    requirements.find((candidate) => candidate.network === network && isStandardExactEvmRequirement(candidate));
}

function readPaymentResponseRef(response: Response) {
  const header = response.headers.get("PAYMENT-RESPONSE") || response.headers.get("X-PAYMENT-RESPONSE");
  if (!header) return undefined;
  try {
    const decoded = decodePaymentResponseHeader(header) as unknown as Record<string, unknown>;
    for (const key of ["transaction", "txHash", "id", "paymentId"]) {
      const value = decoded[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function statusFromPaymentError(message: string): GatewayX402Status {
  if (/not allowlisted|exceeds|budget|amount was not published/i.test(message)) return "blocked";
  if (/insufficient|below required minimum|below required x402 payment amount/i.test(message)) return "insufficient_balance";
  if (/unsupported|no Gateway batching|no supported/i.test(message)) return "unsupported";
  return "failed";
}

function paymentFailureReasonFromError(message: string, timedOut = false) {
  if (/unsupported|no Gateway batching|no supported exact x402/i.test(message)) return "unsupported_network";
  if (timedOut || /AbortError|aborted|terminated|timeout|ETIMEDOUT|UND_ERR/i.test(message)) return "provider_timeout";
  if (/HTTP 5\d\d|HTTP 403|Cloudflare|Just a moment|noindex,nofollow|Bad Gateway|fetch failed|ECONNRESET/i.test(message)) return "provider_unavailable";
  return undefined;
}

function paymentErrorMessage(message: string, timedOut: boolean, timeoutMs: number) {
  if (timedOut) return `x402 provider request timed out after ${timeoutMs} ms before evidence was returned.`;
  if (/^terminated$/i.test(message.trim())) return "x402 provider request terminated before evidence was returned.";
  return message;
}

async function payX402ResourceWithFetch<T = unknown>(input: PayX402ResourceInput, config: GatewayRuntimeConfig, dailySpend: number, base: Omit<PayX402ResourceResult<T>, "status">): Promise<PayX402ResourceResult<T>> {
  const chainCandidates = configuredChainCandidates(input.chainCandidates, config);
  const supportChecks = base.supportChecks || [];
  const primaryChain = chainCandidates[0] || config.chain;
  let selectedChain: SupportedChainName | undefined;
  let selectedRequirement: PaymentRequirements | undefined;
  let selectedAmountUsdc: string | undefined;
  let selectedPaymentNetwork: string | undefined;
  let selectedPaymentScheme: "gateway-batched" | "standard-exact" | undefined;
  const balancesByChain = new Map<SupportedChainName, Balances>();

  for (const chain of chainCandidates) {
    try {
      const balanceClient = await resolveClient(clientForChain({ client: input.balanceClient, clients: input.balanceClients }, chain), config, chain);
      if (!balanceClient) {
        supportChecks.push({ chain, status: "failed", supported: false, error: "Gateway x402 is disabled." });
        continue;
      }
      balancesByChain.set(chain, await balanceClient.getBalances());
    } catch (error) {
      supportChecks.push({ chain, status: "failed", supported: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (balancesByChain.size === 0) {
    return { ...base, status: "failed", selectedChain: primaryChain, error: supportChecks.find((check) => check.error)?.error || "Unable to read x402 wallet balances." };
  }

  const privateKey = config.privateKey;
  if (!privateKey) return { ...base, status: "failed", selectedChain: primaryChain, error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };
  const account = privateKeyToAccount(privateKey);
  const paymentClient = new x402Client((_, requirements) => {
    const seen = new Set<string>();
    for (const chain of chainCandidates) {
      const network = networkForChain(chain);
      if (seen.has(network)) continue;
      seen.add(network);
      const requirement = selectRequirementForNetwork(requirements, network);
      if (!requirement) {
        supportChecks.push({ chain, status: "unsupported", supported: false, paymentNetwork: network, error: "Seller did not advertise a supported exact x402 option for this chain." });
        continue;
      }

      const paymentScheme = isGatewayBatchingRequirement(requirement) ? "gateway-batched" : "standard-exact";
      const amountUsdc = extractRequirementAmountUsdc(requirement);
      const paymentNetwork = extractRequirementNetwork(requirement) || requirement.network;
      if (!amountUsdc) {
        throw new Error("x402 payment amount was not published by the seller.");
      }
      const amount = toNumber(amountUsdc);
      const maxPayment = toNumber(config.maxPaymentUsdc);
      const budget = toNumber(config.dailyBudgetUsdc);
      if (amount > maxPayment) {
        throw new Error(`x402 payment ${amountUsdc} USDC exceeds per-request cap ${config.maxPaymentUsdc} USDC.`);
      }
      if (dailySpend + amount > budget) {
        throw new Error(`Daily x402 budget would be exceeded (${(dailySpend + amount).toFixed(6)} > ${config.dailyBudgetUsdc} USDC).`);
      }

      const balances = balancesByChain.get(chain);
      if (!balances) {
        supportChecks.push({ chain, status: "failed", supported: false, paymentNetwork, paymentScheme, error: "Unable to read x402 wallet balances for this chain." });
        continue;
      }
      if (paymentScheme === "gateway-batched") {
        const gatewayAvailable = toNumber(balances.gateway.formattedAvailable);
        const minGatewayBalance = toNumber(config.minGatewayBalanceUsdc);
        if (gatewayAvailable < minGatewayBalance || gatewayAvailable < amount) {
          throw new Error(`Gateway available balance ${balances.gateway.formattedAvailable} USDC is below required minimum ${config.minGatewayBalanceUsdc} USDC or payment amount ${amountUsdc} USDC.`);
        }
      } else {
        const walletAvailable = toNumber(balances.wallet.formatted);
        if (walletAvailable < amount) {
          throw new Error(`Wallet USDC balance ${balances.wallet.formatted} is below required x402 payment amount ${amountUsdc} USDC for standard exact payment.`);
        }
      }

      selectedChain = chain;
      selectedRequirement = requirement;
      selectedAmountUsdc = amountUsdc;
      selectedPaymentNetwork = paymentNetwork;
      selectedPaymentScheme = paymentScheme;
      supportChecks.push({ chain, status: "success", supported: true, amountUsdc, paymentNetwork, paymentScheme, gatewayAvailableUsdc: balances.gateway.formattedAvailable, walletBalanceUsdc: balances.wallet.formatted });
      return requirement;
    }

    const acceptedNetworks = [...new Set(requirements.map((requirement) => requirement.network).filter(Boolean))].join(", ") || "none";
    throw new Error(`unsupported_network: no supported exact x402 option for candidate chains ${chainCandidates.join(", ")}. Seller accepts: ${acceptedNetworks}`);
  });

  registerBatchScheme(paymentClient, {
    signer: account,
    networks: chainCandidates.map(networkForChain),
    fallbackScheme: new ExactEvmScheme(account),
  });

  const fetchWithPayment = wrapFetchWithPayment(input.fetch || globalThis.fetch, paymentClient);
  const controller = new AbortController();
  const requestTimeoutMs = Math.max(1, Math.round(input.requestTimeoutMs ?? config.requestTimeoutMs));
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);
  const requestInit: RequestInit = {
    headers: { "Content-Type": "application/json", ...(input.headers || {}) },
    signal: controller.signal,
  };
  if (input.method) requestInit.method = input.method;
  if (input.body !== undefined) {
    requestInit.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  }

  try {
    const response = await fetchWithPayment(input.url, requestInit);
    const rawBody = await response.text();
    let data: T | undefined;
    try {
      data = rawBody ? JSON.parse(rawBody) as T : undefined;
    } catch {
      data = rawBody as T;
    }

    if (response.status === 401) {
      return {
        ...base,
        status: "failed",
        selectedChain,
        amountUsdc: selectedAmountUsdc,
        paymentNetwork: selectedPaymentNetwork,
        paymentScheme: selectedPaymentScheme,
        error: `x402 provider returned 401 instead of HTTP 402 Payment Required. Body: ${rawBody.slice(0, 240)}`,
      };
    }
    if (response.status === 402) {
      return {
        ...base,
        status: "failed",
        selectedChain,
        amountUsdc: selectedAmountUsdc,
        paymentNetwork: selectedPaymentNetwork,
        paymentScheme: selectedPaymentScheme,
        error: "x402 payment was attempted but the provider still returned HTTP 402 Payment Required.",
      };
    }
    if (!response.ok) {
      return {
        ...base,
        status: "failed",
        selectedChain,
        amountUsdc: selectedAmountUsdc,
        paymentNetwork: selectedPaymentNetwork,
        paymentScheme: selectedPaymentScheme,
        failureReason: response.status >= 500 || (response.status === 403 && /Cloudflare|Just a moment|noindex,nofollow/i.test(rawBody)) ? "provider_unavailable" : undefined,
        error: `x402 provider request failed with HTTP ${response.status}. Body: ${rawBody.slice(0, 240)}`,
      };
    }

    const paymentRef = readPaymentResponseRef(response);
    return {
      ...base,
      status: "success",
      paid: toNumber(selectedAmountUsdc) > 0,
      supported: true,
      selectedChain,
      amountUsdc: selectedAmountUsdc,
      paymentNetwork: selectedPaymentNetwork || selectedRequirement?.network,
      paymentScheme: selectedPaymentScheme,
      paymentRef,
      txHash: paymentRef,
      data,
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = paymentErrorMessage(rawMessage, timedOut, requestTimeoutMs);
    return {
      ...base,
      status: statusFromPaymentError(message),
      supported: selectedRequirement ? true : false,
      selectedChain,
      amountUsdc: selectedAmountUsdc,
      paymentNetwork: selectedPaymentNetwork || selectedRequirement?.network,
      paymentScheme: selectedPaymentScheme,
      failureReason: paymentFailureReasonFromError(message, timedOut),
      error: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function payX402ResourceWithGatewayClient<T = unknown>(input: PayX402ResourceInput, config: GatewayRuntimeConfig, dailySpend: number, base: Omit<PayX402ResourceResult<T>, "status">): Promise<PayX402ResourceResult<T>> {
  const chainCandidates = configuredChainCandidates(input.chainCandidates, config);
  const supportChecks = base.supportChecks || [];

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
        paymentScheme: "gateway-batched",
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

export async function payX402Resource<T = unknown>(input: PayX402ResourceInput): Promise<PayX402ResourceResult<T>> {
  const config = gatewayRuntimeConfig(input.config);
  const dailySpend = toNumber(input.dailySpendUsdc, 0);
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
  if (config.configErrors.length > 0) return { ...base, status: "blocked", failureReason: "invalid_x402_config", error: config.configErrors.join(" ") };
  if (!isAllowedX402Host(input.url, config.allowedHosts)) {
    const providerHost = hostnameForUrl(input.url);
    return { ...base, status: "blocked", providerHost, error: `Host is not allowlisted: ${providerHost}` };
  }
  if (!config.privateKey && !input.client && !input.clients) return { ...base, status: "failed", error: "CIRCLE_AGENT_PRIVATE_KEY is required when Gateway x402 is enabled." };

  if (input.client || input.clients) {
    return payX402ResourceWithGatewayClient(input, config, dailySpend, base);
  }

  return payX402ResourceWithFetch(input, config, dailySpend, base);
}
