import test from "node:test";
import assert from "node:assert/strict";
import { apiFootballMatchCacheKey, buildApiFootballEvidence, extractLikelyFootballTeams, fetchApiFootballEvidence } from "./api-football-provider";
import type { PolymarketMarket } from "../../types";

function market(overrides: Partial<PolymarketMarket> = {}): PolymarketMarket {
  return {
    source: "polymarket",
    marketId: "sports-1",
    conditionId: "condition-1",
    slug: "france-spain-team-to-advance",
    title: "France vs. Spain: Team to Advance",
    description: "International football knockout market.",
    url: "https://polymarket.com/event/france-spain",
    outcomes: ["France", "Spain"],
    outcomePrices: [0.59, 0.41],
    clobTokenIds: ["france", "spain"],
    liquidityUsd: 2_500_000,
    volume24hUsd: 1_000_000,
    closeTime: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    status: "active",
    ...overrides,
  };
}

function fixture(input: { id: number; date: string; homeId: number; home: string; awayId: number; away: string; homeGoals?: number | null; awayGoals?: number | null }) {
  return {
    fixture: {
      id: input.id,
      date: input.date,
      venue: { name: "National Stadium", city: "Berlin" },
      status: { short: input.homeGoals === undefined ? "NS" : "FT", long: input.homeGoals === undefined ? "Not Started" : "Match Finished" },
    },
    league: { id: 100, name: "Euro", country: "Europe", season: 2026, round: "Semi-finals" },
    teams: {
      home: { id: input.homeId, name: input.home },
      away: { id: input.awayId, name: input.away },
    },
    goals: {
      home: input.homeGoals ?? null,
      away: input.awayGoals ?? null,
    },
  };
}

test("extractLikelyFootballTeams handles common Polymarket football titles", () => {
  assert.deepEqual(extractLikelyFootballTeams(market()), ["France", "Spain"]);
  assert.deepEqual(extractLikelyFootballTeams(market({ title: "Will Arsenal beat Chelsea?", outcomes: ["Yes", "No"] })), ["Arsenal", "Chelsea"]);
  assert.deepEqual(extractLikelyFootballTeams(market({ title: "Match Winner", outcomes: ["Inter", "Milan", "Draw"] })), ["Inter", "Milan"]);
});

test("buildApiFootballEvidence creates tagged structured sports evidence", () => {
  const futureDate = new Date(Date.now() + 6 * 86_400_000).toISOString();
  const recentDate = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const olderDate = new Date(Date.now() - 12 * 86_400_000).toISOString();
  const m = market({ closeTime: futureDate });
  const evidence = buildApiFootballEvidence({
    market: m,
    homeTeam: { id: 1, name: "France", country: "France" },
    awayTeam: { id: 2, name: "Spain", country: "Spain" },
    fixtures: [fixture({ id: 50, date: futureDate, homeId: 1, home: "France", awayId: 2, away: "Spain" })],
    recentFixtures: [
      fixture({ id: 40, date: recentDate, homeId: 1, home: "France", awayId: 3, away: "Germany", homeGoals: 2, awayGoals: 1 }),
      fixture({ id: 41, date: recentDate, homeId: 4, home: "Portugal", awayId: 2, away: "Spain", homeGoals: 0, awayGoals: 1 }),
    ],
    h2hFixtures: [fixture({ id: 30, date: olderDate, homeId: 1, home: "France", awayId: 2, away: "Spain", homeGoals: 1, awayGoals: 1 })],
    injuries: [],
    injuriesFetched: true,
    standings: [{
      league: {
        id: 100,
        name: "Euro",
        standings: [[
          { rank: 1, team: { id: 1, name: "France" }, points: 9, goalsDiff: 4, form: "WWW" },
          { rank: 2, team: { id: 2, name: "Spain" }, points: 7, goalsDiff: 3, form: "WDW" },
        ]],
      },
    }],
    lineups: [{
      team: { id: 1, name: "France" },
      coach: { name: "France Coach" },
      formation: "4-3-3",
      startXI: [{ player: { name: "France Starter", pos: "F" } }],
    }],
    fetchedAt: "2026-07-14T00:00:00.000Z",
  });

  const ids = evidence.map((item) => item.evidenceId);
  assert.ok(ids.includes("api-football-fixture-context"));
  assert.ok(ids.includes("api-football-form-home"));
  assert.ok(ids.includes("api-football-form-away"));
  assert.ok(ids.includes("api-football-h2h"));
  assert.ok(ids.includes("api-football-injuries"));
  assert.ok(ids.includes("api-football-standings"));
  assert.ok(ids.includes("api-football-lineups"));
  assert.equal(evidence.every((item) => item.sourceType === "sports_structured"), true);
  assert.equal(evidence.every((item) => item.provider === "api_football"), true);

  const injuries = evidence.find((item) => item.evidenceId === "api-football-injuries");
  assert.match(injuries?.excerpt || "", /no confirmed injuries/i);
  assert.deepEqual(injuries?.metadata?.evidenceTags, ["injury_lineup"]);

  const form = evidence.find((item) => item.evidenceId === "api-football-form-home");
  assert.deepEqual(form?.metadata?.evidenceTags, ["form_stats"]);

  const lineup = evidence.find((item) => item.evidenceId === "api-football-lineups");
  assert.ok((lineup?.metadata?.evidenceTags as string[]).includes("tactical_news"));
});


test("apiFootballMatchCacheKey groups related markets for the same fixture", () => {
  const closeTime = "2026-07-15T20:00:00.000Z";
  const first = market({ marketId: "m-team", title: "England vs. Argentina: Team to Advance", outcomes: ["England", "Argentina"], closeTime });
  const second = market({ marketId: "m-total", title: "England vs. Argentina: O/U 2.5", outcomes: ["Over", "Under"], closeTime });

  assert.equal(apiFootballMatchCacheKey(first), "api-football:argentina|england:2026-07-15");
  assert.equal(apiFootballMatchCacheKey(second), apiFootballMatchCacheKey(first));
});

test("fetchApiFootballEvidence retries HTTP 429 team lookup and returns structured evidence", async () => {
  const keys = [
    "ENABLE_SPORTS_STRUCTURED_EVIDENCE",
    "SPORTS_DATA_PROVIDER",
    "API_FOOTBALL_KEY",
    "API_FOOTBALL_BASE_URL",
    "API_FOOTBALL_RETRY_COUNT",
    "API_FOOTBALL_RETRY_DELAY_MS",
    "API_FOOTBALL_CONCURRENCY",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.ENABLE_SPORTS_STRUCTURED_EVIDENCE = "true";
  process.env.SPORTS_DATA_PROVIDER = "api-football";
  process.env.API_FOOTBALL_KEY = "test-key";
  process.env.API_FOOTBALL_BASE_URL = "https://api-football.test";
  process.env.API_FOOTBALL_RETRY_COUNT = "1";
  process.env.API_FOOTBALL_RETRY_DELAY_MS = "0";
  process.env.API_FOOTBALL_CONCURRENCY = "1";

  const closeTime = "2026-07-15T20:00:00.000Z";
  const m = market({ title: "England vs. Argentina: Team to Advance", outcomes: ["England", "Argentina"], closeTime });
  let englandTeamLookups = 0;
  const calls: string[] = [];
  const jsonResponse = (response: unknown, status = 200) => new Response(JSON.stringify({ response, errors: status === 429 ? { rateLimit: "slow down" } : [] }), { status, headers: { "content-type": "application/json" } });
  const teamFixture = (id: number, name: string, opponentId: number, opponent: string, date: string, goals?: [number, number]) => ({
    fixture: { id: id * 10, date, venue: { name: "Stadium", city: "City" }, status: { short: goals ? "FT" : "NS", long: goals ? "Match Finished" : "Not Started" } },
    league: { id: 200, name: "World Cup", season: 2026, round: "Final" },
    teams: { home: { id, name }, away: { id: opponentId, name: opponent } },
    goals: { home: goals?.[0] ?? null, away: goals?.[1] ?? null },
  });

  const fetchFn: typeof fetch = async (rawUrl) => {
    const url = new URL(String(rawUrl));
    calls.push(url.pathname + "?" + url.searchParams.toString());
    if (url.pathname.endsWith("/teams")) {
      const search = url.searchParams.get("search");
      if (search === "England") {
        englandTeamLookups += 1;
        if (englandTeamLookups === 1) return jsonResponse([], 429);
        return jsonResponse([{ team: { id: 10, name: "England", country: "England" } }]);
      }
      if (search === "Argentina") return jsonResponse([{ team: { id: 20, name: "Argentina", country: "Argentina" } }]);
    }
    if (url.pathname.endsWith("/fixtures/headtohead")) {
      return jsonResponse([teamFixture(10, "England", 20, "Argentina", "2024-07-15T20:00:00.000Z", [2, 1])]);
    }
    if (url.pathname.endsWith("/fixtures") && url.searchParams.has("last")) {
      const teamId = Number(url.searchParams.get("team"));
      return jsonResponse([teamFixture(teamId, teamId === 10 ? "England" : "Argentina", teamId === 10 ? 99 : 98, teamId === 10 ? "Brazil" : "Spain", "2026-07-01T20:00:00.000Z", [1, 0])]);
    }
    if (url.pathname.endsWith("/fixtures") && url.searchParams.has("next")) {
      return jsonResponse([teamFixture(10, "England", 20, "Argentina", closeTime)]);
    }
    if (url.pathname.endsWith("/injuries")) return jsonResponse([]);
    if (url.pathname.endsWith("/standings")) return jsonResponse([]);
    if (url.pathname.endsWith("/fixtures/lineups")) return jsonResponse([]);
    return jsonResponse([]);
  };

  try {
    const result = await fetchApiFootballEvidence({ market: m, fetchFn });

    assert.equal(result.status, "success");
    assert.equal(englandTeamLookups, 2);
    assert.ok(calls.some((call) => call.includes("/fixtures/headtohead")));
    assert.ok(result.evidence.some((item) => item.evidenceId === "api-football-fixture-context"));
    assert.ok(result.evidence.some((item) => item.evidenceId === "api-football-injuries"));
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
