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
  assert.match(queries, /eventStartTime.+is null.+eventStartTime.+> now\(\)/s);
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


test("bonded call detail keeps recommendation and evidence fields locked in the server-rendered preview", () => {
  const callPage = file("apps/web/app/calls/[id]/page.tsx");
  assert.match(callPage, /selected side, probability, edge, thesis, evidence, sizing/);
  assert.match(callPage, /<UnlockThesis/);
  assert.doesNotMatch(callPage, /call\.action/);
  assert.doesNotMatch(callPage, /call\.edgeBps/);
  assert.doesNotMatch(callPage, /call\.confidenceBps/);
  assert.doesNotMatch(callPage, /call\.suggestedSizeBps/);
  assert.doesNotMatch(callPage, /call\.copyUrl/);
  assert.doesNotMatch(callPage, /call\.thesis/);
});

test("unlocked bonded analysis is organized into readable sections after verified unlock", () => {
  const component = file("apps/web/components/unlock-thesis.tsx");
  assert.match(component, /analysis-metric-grid/);
  assert.match(component, /Recommendation summary/);
  assert.match(component, /Counterarguments and risk notes/);
  assert.match(component, /Evidence used/);
  assert.match(component, /Agent votes/);
});

test("admin run output has readable summary before collapsible raw JSON", () => {
  const admin = file("apps/web/components/admin-console.tsx");
  assert.match(admin, /admin-result-grid/);
  assert.match(admin, /Show raw worker JSON/);
  assert.match(admin, /Latest error/);
});

test("homepage and top five exclude expired published bonded calls from active sections", () => {
  const homepage = file("apps/web/app/page.tsx");
  const topFive = file("apps/web/app/top-5-today/page.tsx");
  const queries = file("apps/web/lib/queries.ts");
  assert.match(homepage, /getActiveBondedCallCount/);
  assert.match(homepage, /!isExpiredDate\(call\.expiresAt\)/);
  assert.match(topFive, /!isExpiredDate\(call\.expiresAt\)/);
  assert.match(queries, /getActiveBondedCallCount/);
  assert.match(queries, /expiresAt.+> now\(\)/s);
});

test("responsive audit styles support wide desktop detail pages and mobile stacking", () => {
  const css = file("apps/web/app/globals.css");
  assert.match(css, /shell\.detail-layout/);
  assert.match(css, /analysis-metric-grid/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /evidence-grid[\s\S]+grid-template-columns: 1fr/);
});


test("top five uses active top sports calls beyond only strong calls", () => {
  const queries = file("apps/web/lib/queries.ts");
  const topFive = file("apps/web/app/top-5-today/page.tsx");
  assert.match(queries, /getTopSportsPredictions/);
  assert.match(queries, /strong_call", "lean_call", "high_risk_call/);
  assert.match(topFive, /getTopSportsPredictions\(5\)/);
  assert.doesNotMatch(topFive, /getStrongSportsPredictions/);
});

test("public homepage no longer displays old resolved call audit cards", () => {
  const homepage = file("apps/web/app/page.tsx");
  const leaderboard = file("apps/web/app/leaderboard/page.tsx");
  const queries = file("apps/web/lib/queries.ts");
  assert.doesNotMatch(homepage, /Past and legacy calls/);
  assert.match(leaderboard, /Wins \/ Losses/);
  assert.match(queries, /losses:/);
});

test("admin long-running commands start async Railway jobs and do not render nested expire objects", () => {
  const runner = file("apps/web/lib/worker-runner.ts");
  const admin = file("apps/web/components/admin-console.tsx");
  const server = file("apps/worker/src/server.ts");
  assert.match(runner, /defaultAsyncRemoteCommands/);
  assert.match(runner, /mode=async/);
  assert.match(server, /startAsyncJob/);
  assert.match(admin, /resultCount/);
  assert.match(admin, /Async Railway job/);
});

test("admin Railway proxy timeout is reported with direct command guidance", () => {
  const runner = file("apps/web/lib/worker-runner.ts");
  const admin = file("apps/web/components/admin-console.tsx");
  const route = file("apps/web/app/api/admin/run/route.ts");
  assert.match(runner, /status: "timeout"/);
  assert.match(runner, /maxHttpProxyTimeoutMs = 295_000/);
  assert.match(runner, /Math.max\(globalTimeout \|\| baseline, baseline\)/);
  assert.match(runner, /suggestedCommand: workerCommandHints\[command\]/);
  assert.match(runner, /railway run npm run worker:run-once/);
  assert.match(admin, /Railway action did not finish before the Vercel proxy timeout/);
  assert.match(admin, /check Railway logs/i);
  assert.match(route, /export const maxDuration = 300/);
});
