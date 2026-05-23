#!/usr/bin/env node
import { depositGatewayUsdc, getGatewayBalances } from "@precall/shared/circle/gateway-client";
import { loadDotenv } from "./dotenv";
import { discover, expirePublishedCalls, health, publishStoredRun, registerCouncilAgent, resolveMatureCalls, runOnce } from "./run-cycle";
import { closeRepository } from "./repository";

loadDotenv();

const command = process.argv[2] || "health";

async function main() {
  if (command === "health") return health();
  if (command === "discover") return discover();
  if (command === "run-once") return runOnce();
  if (command === "publish-run") return publishStoredRun(Number(process.argv[3]));
  if (command === "resolve") return resolveMatureCalls();
  if (command === "expire") return expirePublishedCalls();
  if (command === "register-agent") return registerCouncilAgent();
  if (command === "gateway:balance") return getGatewayBalances();
  if (command === "gateway:deposit") return depositGatewayUsdc({ amountUsdc: process.argv[3] || "1" });
  throw new Error(`Unknown command "${command}". Use health, discover, register-agent, run-once, publish-run, expire, resolve, gateway:balance, or gateway:deposit.`);
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
