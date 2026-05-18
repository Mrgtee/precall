#!/usr/bin/env node
import { loadDotenv } from "./dotenv";
import { discover, health, registerCouncilAgent, resolveMatureCalls, runOnce } from "./run-cycle";

loadDotenv();

const command = process.argv[2] || "health";

async function main() {
  if (command === "health") return health();
  if (command === "discover") return discover();
  if (command === "run-once") return runOnce();
  if (command === "resolve") return resolveMatureCalls();
  if (command === "register-agent") return registerCouncilAgent();
  throw new Error(`Unknown command "${command}". Use health, discover, register-agent, run-once, or resolve.`);
}

main()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
