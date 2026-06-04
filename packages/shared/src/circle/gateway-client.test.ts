import test from "node:test";
import assert from "node:assert/strict";
import type { Balances, DepositResult, PayResult, SupportedChainName, SupportsResult } from "@circle-fin/x402-batching/client";
import { depositGatewayUsdc, gatewayRuntimeConfig, getGatewayBalances, payX402Resource, supportsX402Resource, type GatewayRuntimeConfig } from "./gateway-client";

function atomicUsdc(value: string) {
  return BigInt(Math.round(Number(value) * 1_000_000));
}

function formatUsdc(value: number) {
  return value.toFixed(6);
}

function baseX402Config(overrides: Partial<GatewayRuntimeConfig> = {}): Partial<GatewayRuntimeConfig> {
  return {
    enabled: true,
    privateKey: "",
    chain: "base",
    acceptedNetworks: ["eip155:8453"],
    facilitatorUrl: "https://gateway-api.circle.com",
    maxPaymentUsdc: "0.005",
    dailyBudgetUsdc: "0.10",
    allowedHosts: ["api.aisa.one"],
    ...overrides,
  };
}

function arcX402Config(overrides: Partial<GatewayRuntimeConfig> = {}): Partial<GatewayRuntimeConfig> {
  return {
    enabled: true,
    privateKey: "",
    chain: "arcTestnet",
    acceptedNetworks: ["eip155:5042002"],
    facilitatorUrl: "https://gateway-api-testnet.circle.com",
    maxPaymentUsdc: "0.005",
    dailyBudgetUsdc: "0.10",
    allowedHosts: ["api.aisa.one"],
    ...overrides,
  };
}

function balances(availableUsdc = "1.000000", walletUsdc = "0"): Balances {
  const gatewayAtomic = atomicUsdc(availableUsdc);
  const walletAtomic = atomicUsdc(walletUsdc);
  return {
    wallet: { balance: walletAtomic, formatted: walletUsdc },
    gateway: {
      total: gatewayAtomic,
      available: gatewayAtomic,
      withdrawing: 0n,
      withdrawable: gatewayAtomic,
      formattedTotal: availableUsdc,
      formattedAvailable: availableUsdc,
      formattedWithdrawing: "0",
      formattedWithdrawable: availableUsdc,
    },
  };
}

function mockClient(input: { amountAtomic?: string; availableUsdc?: string; walletUsdc?: string; supported?: boolean; chainName?: SupportedChainName; network?: string } = {}) {
  let payCalls = 0;
  let depositCalls = 0;
  let gatewayAvailable = input.availableUsdc || "1.000000";
  let walletAvailable = input.walletUsdc || "0";
  const client = {
    address: "0x0000000000000000000000000000000000000001",
    chainName: input.chainName || "arcTestnet",
    async supports(): Promise<SupportsResult> {
      if (input.supported === false) return { supported: false, error: "No x402 support" };
      return { supported: true, requirements: { amount: input.amountAtomic || "5000", network: input.network || "eip155:5042002" } };
    },
    async getBalances(): Promise<Balances> {
      return balances(gatewayAvailable, walletAvailable);
    },
    async pay<T>(): Promise<PayResult<T>> {
      payCalls += 1;
      return { data: { ok: true } as T, amount: BigInt(input.amountAtomic || "5000"), formattedAmount: "0.005000", transaction: "0xpayment", status: 200 };
    },
    async deposit(amount: string): Promise<DepositResult> {
      depositCalls += 1;
      const parsedAmount = Number(amount);
      gatewayAvailable = formatUsdc(Number(gatewayAvailable) + parsedAmount);
      walletAvailable = formatUsdc(Number(walletAvailable) - parsedAmount);
      return {
        approvalTxHash: "0xapproval",
        depositTxHash: "0xdeposit",
        amount: atomicUsdc(amount),
        formattedAmount: formatUsdc(parsedAmount),
        depositor: "0x0000000000000000000000000000000000000001",
      };
    },
    payCalls: () => payCalls,
    depositCalls: () => depositCalls,
  };
  return client;
}

test("x402 disabled does not attempt payment", async () => {
  const client = mockClient();
  const result = await payX402Resource({ url: "https://api.aisa.one/paid", client, config: { enabled: false } });

  assert.equal(result.status, "disabled");
  assert.equal(result.paid, false);
  assert.equal(client.payCalls(), 0);
});

test("Gateway deposit is disabled when x402 is disabled", async () => {
  const client = mockClient({ walletUsdc: "2.000000", availableUsdc: "0.000000" });
  const result = await depositGatewayUsdc({ amountUsdc: "1", client, config: { enabled: false } });

  assert.equal(result.status, "disabled");
  assert.equal(client.depositCalls(), 0);
});

test("Gateway deposit rejects invalid amounts before moving funds", async () => {
  const client = mockClient({ walletUsdc: "2.000000", availableUsdc: "0.000000" });
  const result = await depositGatewayUsdc({ amountUsdc: "1.0000001", client, config: { enabled: true, privateKey: "" } });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /up to 6 decimals/i);
  assert.equal(client.depositCalls(), 0);
});

test("Gateway deposit enforces the configured safety cap", async () => {
  const client = mockClient({ walletUsdc: "20.000000", availableUsdc: "0.000000" });
  const result = await depositGatewayUsdc({ amountUsdc: "11", client, config: { enabled: true, privateKey: "", maxDepositUsdc: "10" } });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /exceeds safety cap/i);
  assert.equal(client.depositCalls(), 0);
});

test("Gateway deposit reports insufficient wallet balance safely", async () => {
  const client = mockClient({ walletUsdc: "0.500000", availableUsdc: "0.000000" });
  const result = await depositGatewayUsdc({ amountUsdc: "1", client, config: { enabled: true, privateKey: "", maxDepositUsdc: "10" } });

  assert.equal(result.status, "insufficient_balance");
  assert.equal(result.walletBalanceUsdcBefore, "0.500000");
  assert.equal(client.depositCalls(), 0);
});

test("Gateway deposit returns tx hashes and updated balances", async () => {
  const client = mockClient({ walletUsdc: "2.000000", availableUsdc: "0.000000" });
  const result = await depositGatewayUsdc({ amountUsdc: "1", client, config: { enabled: true, privateKey: "", maxDepositUsdc: "10" } });

  assert.equal(result.status, "success");
  assert.equal(result.amountUsdc, "1.000000");
  assert.equal(result.approvalTxHash, "0xapproval");
  assert.equal(result.depositTxHash, "0xdeposit");
  assert.equal(result.gatewayAvailableUsdcBefore, "0.000000");
  assert.equal(result.gatewayAvailableUsdcAfter, "1.000000");
  assert.equal(result.walletBalanceUsdcBefore, "2.000000");
  assert.equal(result.walletBalanceUsdcAfter, "1.000000");
  assert.equal(client.depositCalls(), 1);
});

test("non-allowlisted x402 host is rejected before support/payment", async () => {
  const client = mockClient();
  const result = await payX402Resource({
    url: "https://evil.example/paid",
    client,
    config: { enabled: true, privateKey: "", allowedHosts: ["api.aisa.one"] },
  });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /not allowlisted/i);
  assert.equal(client.payCalls(), 0);
});

test("per-request max payment is enforced", async () => {
  const client = mockClient({ chainName: "base", network: "eip155:8453", amountAtomic: "10000" });
  const result = await payX402Resource({
    url: "https://api.aisa.one/paid",
    client,
    config: baseX402Config({ maxPaymentUsdc: "0.005" }),
  });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /exceeds per-request cap/i);
  assert.equal(client.payCalls(), 0);
});

test("daily budget is enforced before payment", async () => {
  const client = mockClient({ chainName: "base", network: "eip155:8453", amountAtomic: "5000" });
  const result = await payX402Resource({
    url: "https://api.aisa.one/paid",
    client,
    dailySpendUsdc: "0.098",
    config: baseX402Config({ dailyBudgetUsdc: "0.10" }),
  });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /Daily x402 budget/i);
  assert.equal(client.payCalls(), 0);
});

test("insufficient Gateway balance is handled safely", async () => {
  const client = mockClient({ chainName: "base", network: "eip155:8453", amountAtomic: "5000", availableUsdc: "0.001000" });
  const result = await payX402Resource({
    url: "https://api.aisa.one/paid",
    client,
    config: baseX402Config({ minGatewayBalanceUsdc: "0.25" }),
  });

  assert.equal(result.status, "insufficient_balance");
  assert.equal(client.payCalls(), 0);
});

test("successful payment returns Circle payment metadata", async () => {
  const client = mockClient({ chainName: "base", network: "eip155:8453", amountAtomic: "5000", availableUsdc: "1.000000" });
  const result = await payX402Resource<{ ok: boolean }>({
    url: "https://api.aisa.one/paid",
    client,
    config: baseX402Config({ maxPaymentUsdc: "0.005" }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.paid, true);
  assert.equal(result.amountUsdc, "0.005000");
  assert.equal(result.paymentNetwork, "eip155:8453");
  assert.equal(result.selectedChain, "base");
  assert.equal(result.paymentRef, "0xpayment");
  assert.equal(client.payCalls(), 1);
});

test("Gateway balance lookup reports disabled without a key", async () => {
  const disabled = await getGatewayBalances({ config: { enabled: false } });
  assert.equal(disabled.status, "disabled");
});

test("supportsX402Resource blocks non-allowlisted hosts", async () => {
  const result = await supportsX402Resource("https://not-allowed.example/resource", { config: { enabled: true, privateKey: "", allowedHosts: ["api.aisa.one"] } });
  assert.equal(result.status, "blocked");
  assert.equal(result.supported, false);
});


test("gatewayRuntimeConfig accepts Base mainnet x402 configuration", () => {
  const config = gatewayRuntimeConfig(baseX402Config());

  assert.equal(config.chain, "base");
  assert.deepEqual(config.acceptedNetworks, ["eip155:8453"]);
  assert.deepEqual(config.chainCandidates, ["base"]);
  assert.equal(config.facilitatorUrl, "https://gateway-api.circle.com");
  assert.equal(config.paymentNetworkLabel, "Base Mainnet");
  assert.equal(config.productionMode, true);
  assert.deepEqual(config.configErrors, []);
  assert.match(config.configWarnings.join(" "), /real USDC/i);
});

test("gatewayRuntimeConfig accepts Arc Testnet x402 configuration", () => {
  const config = gatewayRuntimeConfig(arcX402Config());

  assert.equal(config.chain, "arcTestnet");
  assert.deepEqual(config.acceptedNetworks, ["eip155:5042002"]);
  assert.deepEqual(config.chainCandidates, ["arcTestnet"]);
  assert.equal(config.facilitatorUrl, "https://gateway-api-testnet.circle.com");
  assert.equal(config.paymentNetworkLabel, "Arc Testnet");
  assert.equal(config.productionMode, false);
  assert.deepEqual(config.configErrors, []);
});

test("wrong x402 network configuration fails clearly", async () => {
  const base = mockClient({ chainName: "base", network: "eip155:8453", amountAtomic: "5000", availableUsdc: "1.000000" });
  const result = await payX402Resource<{ ok: boolean }>({
    url: "https://api.aisa.one/paid",
    clients: { base },
    config: baseX402Config({ acceptedNetworks: ["eip155:5042002"] }),
  });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /requires X402_ACCEPTED_NETWORKS to include eip155:8453/i);
  assert.equal(base.payCalls(), 0);
});

test("x402 payment uses Base mainnet when configured", async () => {
  const arc = mockClient({ chainName: "arcTestnet", network: "eip155:5042002", amountAtomic: "5000", availableUsdc: "1.000000" });
  const base = mockClient({ chainName: "base", network: "eip155:8453", amountAtomic: "5000", availableUsdc: "1.000000" });
  const result = await payX402Resource<{ ok: boolean }>({
    url: "https://api.aisa.one/paid",
    clients: { arcTestnet: arc, base },
    config: baseX402Config(),
  });

  assert.equal(result.status, "success");
  assert.equal(result.selectedChain, "base");
  assert.equal(result.paymentNetwork, "eip155:8453");
  assert.equal(arc.payCalls(), 0);
  assert.equal(base.payCalls(), 1);
  assert.deepEqual(result.supportChecks?.map((check) => [check.chain, check.status]), [["base", "success"]]);
});

test("x402 payment uses Arc Testnet when configured", async () => {
  const arc = mockClient({ chainName: "arcTestnet", network: "eip155:5042002", amountAtomic: "5000", availableUsdc: "1.000000" });
  const base = mockClient({ chainName: "base", network: "eip155:8453", amountAtomic: "5000", availableUsdc: "1.000000" });
  const result = await payX402Resource<{ ok: boolean }>({
    url: "https://api.aisa.one/paid",
    clients: { arcTestnet: arc, base },
    config: arcX402Config(),
  });

  assert.equal(result.status, "success");
  assert.equal(result.selectedChain, "arcTestnet");
  assert.equal(result.paymentNetwork, "eip155:5042002");
  assert.equal(arc.payCalls(), 1);
  assert.equal(base.payCalls(), 0);
  assert.deepEqual(result.supportChecks?.map((check) => [check.chain, check.status]), [["arcTestnet", "success"]]);
});

test("no supported x402 chains returns unsupported_network without paying", async () => {
  const base = mockClient({ chainName: "base", supported: false });
  const result = await payX402Resource({
    url: "https://api.aisa.one/paid",
    clients: { base },
    config: baseX402Config(),
  });

  assert.equal(result.status, "unsupported");
  assert.equal(result.failureReason, "unsupported_network");
  assert.equal(result.paid, false);
  assert.equal(base.payCalls(), 0);
});

test("supportsX402Resource reports selected configured chain", async () => {
  const base = mockClient({ chainName: "base", network: "eip155:8453" });
  const result = await supportsX402Resource("https://api.aisa.one/paid", {
    clients: { base },
    config: baseX402Config(),
  });

  assert.equal(result.status, "success");
  assert.equal(result.selectedChain, "base");
  assert.equal(result.supportChecks.length, 1);
});
