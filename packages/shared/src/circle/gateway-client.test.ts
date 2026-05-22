import test from "node:test";
import assert from "node:assert/strict";
import type { Balances, PayResult, SupportsResult } from "@circle-fin/x402-batching/client";
import { getGatewayBalances, payX402Resource, supportsX402Resource } from "./gateway-client";

function balances(availableUsdc = "1.000000"): Balances {
  const atomic = BigInt(Math.round(Number(availableUsdc) * 1_000_000));
  return {
    wallet: { balance: 0n, formatted: "0" },
    gateway: {
      total: atomic,
      available: atomic,
      withdrawing: 0n,
      withdrawable: atomic,
      formattedTotal: availableUsdc,
      formattedAvailable: availableUsdc,
      formattedWithdrawing: "0",
      formattedWithdrawable: availableUsdc,
    },
  };
}

function mockClient(input: { amountAtomic?: string; availableUsdc?: string; supported?: boolean } = {}) {
  let payCalls = 0;
  const client = {
    address: "0x0000000000000000000000000000000000000001",
    chainName: "arcTestnet",
    async supports(): Promise<SupportsResult> {
      if (input.supported === false) return { supported: false, error: "No x402 support" };
      return { supported: true, requirements: { amount: input.amountAtomic || "5000", network: "eip155:5042002" } };
    },
    async getBalances(): Promise<Balances> {
      return balances(input.availableUsdc || "1.000000");
    },
    async pay<T>(): Promise<PayResult<T>> {
      payCalls += 1;
      return { data: { ok: true } as T, amount: BigInt(input.amountAtomic || "5000"), formattedAmount: "0.005000", transaction: "0xpayment", status: 200 };
    },
    payCalls: () => payCalls,
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
  const client = mockClient({ amountAtomic: "10000" });
  const result = await payX402Resource({
    url: "https://api.aisa.one/paid",
    client,
    config: { enabled: true, privateKey: "", maxPaymentUsdc: "0.005", allowedHosts: ["api.aisa.one"] },
  });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /exceeds per-request cap/i);
  assert.equal(client.payCalls(), 0);
});

test("daily budget is enforced before payment", async () => {
  const client = mockClient({ amountAtomic: "5000" });
  const result = await payX402Resource({
    url: "https://api.aisa.one/paid",
    client,
    dailySpendUsdc: "0.098",
    config: { enabled: true, privateKey: "", dailyBudgetUsdc: "0.10", allowedHosts: ["api.aisa.one"] },
  });

  assert.equal(result.status, "blocked");
  assert.match(result.error || "", /Daily x402 budget/i);
  assert.equal(client.payCalls(), 0);
});

test("insufficient Gateway balance is handled safely", async () => {
  const client = mockClient({ amountAtomic: "5000", availableUsdc: "0.001000" });
  const result = await payX402Resource({
    url: "https://api.aisa.one/paid",
    client,
    config: { enabled: true, privateKey: "", minGatewayBalanceUsdc: "0.25", allowedHosts: ["api.aisa.one"] },
  });

  assert.equal(result.status, "insufficient_balance");
  assert.equal(client.payCalls(), 0);
});

test("successful payment returns Circle payment metadata", async () => {
  const client = mockClient({ amountAtomic: "5000", availableUsdc: "1.000000" });
  const result = await payX402Resource<{ ok: boolean }>({
    url: "https://api.aisa.one/paid",
    client,
    config: { enabled: true, privateKey: "", maxPaymentUsdc: "0.005", allowedHosts: ["api.aisa.one"] },
  });

  assert.equal(result.status, "success");
  assert.equal(result.paid, true);
  assert.equal(result.amountUsdc, "0.005000");
  assert.equal(result.paymentNetwork, "eip155:5042002");
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
