import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCircleActionInput } from "./repository";

test("Circle action normalizer records successful paid evidence metadata", () => {
  const action = normalizeCircleActionInput({
    actionType: "x402_api_payment",
    provider: "aisa_x402_social",
    url: "https://api.aisa.one/resource",
    amountUsdc: "0.005",
    chain: "arcTestnet",
    paymentRef: "0xpayment",
    relatedMarketId: "m1",
    relatedAgentRunId: 7,
    status: "success",
  });

  assert.equal(action.actionType, "x402_api_payment");
  assert.equal(action.amount, "0.005");
  assert.equal(action.amountUsdc, "0.005");
  assert.equal(action.paymentReference, "0xpayment");
  assert.equal(action.paymentRef, "0xpayment");
  assert.equal(action.relatedMarketId, "m1");
  assert.equal(action.agentRunId, 7);
  assert.equal(action.relatedAgentRunId, 7);
});

test("Circle action normalizer records failed paid evidence metadata", () => {
  const action = normalizeCircleActionInput({
    actionType: "x402_api_payment",
    provider: "aisa_x402_social",
    url: "https://api.aisa.one/resource",
    amountUsdc: "0",
    status: "blocked",
    error: "Host is not allowlisted",
  });

  assert.equal(action.status, "blocked");
  assert.equal(action.error, "Host is not allowlisted");
  assert.equal(action.amountUsdc, "0");
});
