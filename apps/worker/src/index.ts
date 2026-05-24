#!/usr/bin/env node
import { depositGatewayUsdc, getGatewayBalances, supportsX402Resource } from "@precall/shared/circle/gateway-client";
import type { SupportedChainName } from "@circle-fin/x402-batching/client";
import { loadDotenv } from "./dotenv";
import { discover, expirePublishedCalls, health, publishStoredRun, registerCouncilAgent, resolveMatureCalls, runOnce, runSportsEdge } from "./run-cycle";
import { closeRepository } from "./repository";

loadDotenv();

const command = process.argv[2] || "health";

async function main() {
  if (command === "health") return health();
  if (command === "discover") return discover();
  if (command === "run-once") return runOnce();
  if (command === "sports") return runSportsEdge();
  if (command === "publish-run") return publishStoredRun(Number(process.argv[3]));
  if (command === "resolve") return resolveMatureCalls();
  if (command === "expire") return expirePublishedCalls();
  if (command === "register-agent") return registerCouncilAgent();
  if (command === "x402:supports") {
    const url = process.argv[3];
    if (!url) throw new Error("Usage: npm run worker:x402:supports -- <url>");
    return supportsX402Resource(url);
  }
  if (command === "gateway:balance") return getGatewayBalances({ chain: process.argv[3] as SupportedChainName | undefined });
  if (command === "gateway:deposit") {
    const first = process.argv[3];
    const second = process.argv[4];
    const chain = second ? first as SupportedChainName : undefined;
    const amountUsdc = second || first || "1";
    return depositGatewayUsdc({ chain, amountUsdc });
  }
  throw new Error(`Unknown command "${command}". Use health, discover, register-agent, run-once, sports, publish-run, expire, resolve, x402:supports, gateway:balance, or gateway:deposit.`);
}

function stringifyResult(result: unknown) {
  return JSON.stringify(
    result,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

main()
  .then((result) => {
    console.log(stringifyResult(result));
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeRepository();
  });
