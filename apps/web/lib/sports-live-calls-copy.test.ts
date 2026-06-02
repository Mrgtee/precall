import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SPORTS_PRODUCT_FILES = [
  "apps/web/app/sports/page.tsx",
  "apps/web/app/page.tsx",
  "apps/web/app/top-5-today/page.tsx",
  "apps/web/app/leaderboard/page.tsx",
  "apps/web/components/admin-console.tsx",
  "apps/web/components/unlock-sports-call.tsx",
  "apps/worker/src/run-cycle.ts",
];

test("sports product copy and worker output avoid legacy filtered terminology", () => {
  for (const file of SPORTS_PRODUCT_FILES) {
    const text = readFileSync(file, "utf8");
    const banned = new RegExp([["watch", "list"].join(""), ["watch", "listed"].join(""), ["not", "an", "official", "pick"].join(" ")].join("|"), "i");
    assert.doesNotMatch(text, banned, file);
  }
});

test("sports scans do not hard-require global x402 evidence", () => {
  const worker = readFileSync("apps/worker/src/run-cycle.ts", "utf8");
  const sportsStart = worker.indexOf("export async function runSportsEdge()");
  const nextExport = worker.indexOf("export async function publishStoredRun", sportsStart);
  assert.ok(sportsStart > 0);
  assert.ok(nextExport > sportsStart);
  const sportsRun = worker.slice(sportsStart, nextExport);
  assert.match(worker, /const requireX402 = boolEnv\("REQUIRE_CIRCLE_GATEWAY_X402", false\)/);
  assert.match(sportsRun, /const requireX402 = boolEnv\("REQUIRE_SPORTS_X402", false\)/);
  assert.doesNotMatch(sportsRun, /const requireX402 = boolEnv\("REQUIRE_CIRCLE_GATEWAY_X402"/);
});
