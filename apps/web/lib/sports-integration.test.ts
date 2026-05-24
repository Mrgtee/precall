import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function file(path: string) {
  return readFileSync(path, "utf8");
}

test("active sports calls count only non-expired live sports statuses", () => {
  const queries = file("apps/web/lib/queries.ts");
  assert.match(queries, /getActiveSportsCallCount/);
  assert.match(queries, /strong_call.+lean_call.+high_risk_call.+avoid_call/s);
  assert.match(queries, /expiresAt.+is null.+expiresAt.+> now\(\)/s);
  assert.match(queries, /expiredSportsCalls/);
});

test("sports unlock flow uses Arc USDC transfer and verified server indexing", () => {
  const component = file("apps/web/components/unlock-sports-call.tsx");
  const recordRoute = file("apps/web/app/api/sports/unlocks/record/route.ts");
  assert.match(component, /arcTestnet\.id/);
  assert.match(component, /functionName: "transfer"/);
  assert.match(component, /\/api\/sports\/unlocks\/record/);
  assert.match(recordRoute, /parseEventLogs/);
  assert.match(recordRoute, /eventName: "Transfer"/);
  assert.match(recordRoute, /actionType: "sports_unlock"/);
});

test("locked sports page does not render full analysis before unlock", () => {
  const sportsPage = file("apps/web/app/sports/page.tsx");
  assert.doesNotMatch(sportsPage, /idea\.reasoning/);
  assert.doesNotMatch(sportsPage, /idea\.matchupContext/);
  assert.doesNotMatch(sportsPage, /idea\.marketMovement/);
  assert.doesNotMatch(sportsPage, /idea\.risks/);
  assert.doesNotMatch(sportsPage, /idea\.verdict/);
  assert.doesNotMatch(sportsPage, /idea\.marketUrl/);
  assert.match(sportsPage, /UnlockSportsCall/);
});

test("unlocked sports analysis exposes full payload only through verified analysis route", () => {
  const analysisRoute = file("apps/web/app/api/sports/[id]/analysis/route.ts");
  const component = file("apps/web/components/unlock-sports-call.tsx");
  assert.match(analysisRoute, /hasSportsUnlock/);
  assert.match(analysisRoute, /Sports analysis is locked/);
  assert.match(analysisRoute, /reasoning/);
  assert.match(analysisRoute, /evidence/);
  assert.match(analysisRoute, /votes/);
  assert.match(component, /Full sports analysis unlocked/);
});

test("sports calls are wired into dashboard, sports page, top five, leaderboard, admin, and demo", () => {
  for (const path of [
    "apps/web/app/page.tsx",
    "apps/web/app/sports/page.tsx",
    "apps/web/app/top-5-today/page.tsx",
    "apps/web/app/leaderboard/page.tsx",
    "apps/web/components/admin-console.tsx",
    "apps/web/app/demo/page.tsx",
  ]) {
    assert.match(file(path), /Sports Live Calls|sports/i, path);
  }
});

test("sports NFA disclaimer remains visible", () => {
  const sportsPage = file("apps/web/app/sports/page.tsx");
  const unlockComponent = file("apps/web/components/unlock-sports-call.tsx");
  assert.match(sportsPage, /not financial advice/i);
  assert.match(unlockComponent, /not financial advice/i);
});

test("bonded YES\/NO resolve path remains strict and onchain-capable", () => {
  const runCycle = file("apps/worker/src/run-cycle.ts");
  assert.match(runCycle, /resolveMatureCalls/);
  assert.match(runCycle, /marketType !== "strict_yes_no"/);
  assert.match(runCycle, /fetchPolymarketResolution/);
  assert.match(runCycle, /resolveCallOnchain/);
});
