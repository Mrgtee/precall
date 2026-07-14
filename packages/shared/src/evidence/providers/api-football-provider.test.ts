import test from "node:test";
import assert from "node:assert/strict";
import { buildApiFootballEvidence, extractLikelyFootballTeams } from "./api-football-provider";
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
