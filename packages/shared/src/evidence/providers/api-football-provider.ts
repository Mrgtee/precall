import { boolEnv, optionalEnv } from "../../env";
import type { EvidenceItemInput, PolymarketMarket, SportsEvidenceTag } from "../../types";
import { mergeSportsEvidenceTags } from "../sports-tags";

export type SportsStructuredEvidenceProviderStatus = "disabled" | "success" | "failed";

export type SportsStructuredEvidenceProviderResult = {
  enabled: boolean;
  provider: "api_football";
  status: SportsStructuredEvidenceProviderStatus;
  evidence: EvidenceItemInput[];
  teams?: { home?: ApiFootballTeam | undefined; away?: ApiFootballTeam | undefined } | undefined;
  fixtureId?: number | undefined;
  failureReason?: string | undefined;
  error?: string | undefined;
};

export type ApiFootballTeam = {
  id?: number | undefined;
  name?: string | undefined;
  country?: string | undefined;
  logo?: string | undefined;
};

type ApiFootballTeamSearchItem = {
  team?: ApiFootballTeam | undefined;
};

type ApiFootballFixtureTeam = ApiFootballTeam & { winner?: boolean | null | undefined };

type ApiFootballFixture = {
  fixture?: {
    id?: number | undefined;
    date?: string | undefined;
    timezone?: string | undefined;
    venue?: { name?: string | undefined; city?: string | undefined } | undefined;
    status?: { short?: string | undefined; long?: string | undefined } | undefined;
  } | undefined;
  league?: { id?: number | undefined; name?: string | undefined; country?: string | undefined; season?: number | undefined; round?: string | undefined } | undefined;
  teams?: { home?: ApiFootballFixtureTeam | undefined; away?: ApiFootballFixtureTeam | undefined } | undefined;
  goals?: { home?: number | null | undefined; away?: number | null | undefined } | undefined;
};

type ApiFootballInjury = {
  player?: { name?: string | undefined; type?: string | undefined; reason?: string | undefined } | undefined;
  team?: ApiFootballTeam | undefined;
  fixture?: { id?: number | undefined; date?: string | undefined } | undefined;
};

type ApiFootballStandingRow = {
  rank?: number | undefined;
  team?: ApiFootballTeam | undefined;
  points?: number | undefined;
  goalsDiff?: number | undefined;
  form?: string | undefined;
  all?: {
    played?: number | undefined;
    win?: number | undefined;
    draw?: number | undefined;
    lose?: number | undefined;
    goals?: { for?: number | undefined; against?: number | undefined } | undefined;
  } | undefined;
};

type ApiFootballStandingLeague = {
  league?: {
    id?: number | undefined;
    name?: string | undefined;
    country?: string | undefined;
    season?: number | undefined;
    standings?: ApiFootballStandingRow[][] | undefined;
  } | undefined;
};

type ApiFootballLineup = {
  team?: ApiFootballTeam | undefined;
  coach?: { name?: string | undefined } | undefined;
  formation?: string | undefined;
  startXI?: Array<{ player?: { name?: string | undefined; pos?: string | undefined } | undefined }> | undefined;
};

type ApiFootballEnvelope<T> = {
  response?: T | undefined;
  results?: number | undefined;
  errors?: unknown;
};

type ApiFootballFetch = typeof fetch;

let apiFootballActiveRequests = 0;
const apiFootballQueue: Array<() => void> = [];

type ApiFootballConfig = {
  enabled: boolean;
  provider: string;
  apiKey: string;
  baseUrl: string;
  fetchFn: ApiFootballFetch;
};

export type ApiFootballEvidencePayload = {
  market: PolymarketMarket;
  homeTeam?: ApiFootballTeam | undefined;
  awayTeam?: ApiFootballTeam | undefined;
  fixtures?: ApiFootballFixture[] | undefined;
  recentFixtures?: ApiFootballFixture[] | undefined;
  h2hFixtures?: ApiFootballFixture[] | undefined;
  injuries?: ApiFootballInjury[] | undefined;
  injuriesFetched?: boolean | undefined;
  standings?: ApiFootballStandingLeague[] | undefined;
  lineups?: ApiFootballLineup[] | undefined;
  fetchedAt?: string | undefined;
  sourceBaseUrl?: string | undefined;
};

function nowIso() {
  return new Date().toISOString();
}

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(optionalEnv(name, String(fallback)));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeIntegerEnv(name: string, fallback: number) {
  const parsed = Number(optionalEnv(name, String(fallback)));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function apiFootballConcurrency() {
  return positiveIntegerEnv("API_FOOTBALL_CONCURRENCY", 2);
}

function apiFootballRetryCount() {
  return nonNegativeIntegerEnv("API_FOOTBALL_RETRY_COUNT", 2);
}

function apiFootballRetryDelayMs() {
  return nonNegativeIntegerEnv("API_FOOTBALL_RETRY_DELAY_MS", 750);
}

async function wait(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withApiFootballLimit<T>(run: () => Promise<T>): Promise<T> {
  const concurrency = apiFootballConcurrency();
  if (apiFootballActiveRequests >= concurrency) {
    await new Promise<void>((resolve) => apiFootballQueue.push(resolve));
  }
  apiFootballActiveRequests += 1;
  try {
    return await run();
  } finally {
    apiFootballActiveRequests = Math.max(0, apiFootballActiveRequests - 1);
    apiFootballQueue.shift()?.();
  }
}

function config(overrides?: { fetchFn?: ApiFootballFetch | undefined }): ApiFootballConfig {
  return {
    enabled: boolEnv("ENABLE_SPORTS_STRUCTURED_EVIDENCE", false) && optionalEnv("SPORTS_DATA_PROVIDER", "api-football").toLowerCase() === "api-football",
    provider: optionalEnv("SPORTS_DATA_PROVIDER", "api-football").toLowerCase(),
    apiKey: optionalEnv("API_FOOTBALL_KEY", ""),
    baseUrl: optionalEnv("API_FOOTBALL_BASE_URL", "https://v3.football.api-sports.io"),
    fetchFn: overrides?.fetchFn || fetch,
  };
}

function compactRecord(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function cleanTeamName(raw: string) {
  return raw
    .replace(/^will\s+/i, "")
    .replace(/\b(?:team to advance|to advance|match winner|winner|moneyline|draw no bet|double chance|total goals?|spread)\b/gi, "")
    .replace(/\b(?:on|by)\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[?:]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—]+|[\s\-–—]+$/g, "")
    .trim();
}

function outcomeLooksLikeTeam(outcome: string) {
  return outcome.trim().length > 1 && !/^(yes|no|draw|over|under|home|away|tie)$/i.test(outcome.trim());
}

export function extractLikelyFootballTeams(market: Pick<PolymarketMarket, "title" | "description" | "outcomes">): string[] {
  const text = `${market.title} ${market.description || ""}`.replace(/\s+/g, " ").trim();
  const patterns = [
    /(?:^|\b)(.+?)\s+(?:vs\.?|v\.?|versus)\s+(.+?)(?::|\s+-\s+|\s+on\s+20\d{2}-\d{2}-\d{2}|\?|$)/i,
    /^will\s+(.+?)\s+(?:beat|defeat|advance past|win against)\s+(.+?)(?:\?|$)/i,
    /^(.+?)\s+(?:to beat|to defeat|to advance past)\s+(.+?)(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const left = match?.[1] ? cleanTeamName(match[1]) : "";
    const right = match?.[2] ? cleanTeamName(match[2]) : "";
    if (left && right && left.toLowerCase() !== right.toLowerCase()) return [left, right];
  }

  const outcomeTeams = market.outcomes.map(cleanTeamName).filter(outcomeLooksLikeTeam);
  return [...new Set(outcomeTeams)].slice(0, 2);
}

function normalizeCacheTeamName(team: string) {
  return cleanTeamName(team).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function apiFootballMatchCacheKey(market: Pick<PolymarketMarket, "marketId" | "title" | "description" | "outcomes" | "closeTime">) {
  const teams = extractLikelyFootballTeams(market).map(normalizeCacheTeamName).filter(Boolean);
  if (teams.length < 2) return `market:${market.marketId}`;
  return `api-football:${teams.slice(0, 2).sort().join("|")}:${eventDate(market) || "no-date"}`;
}

function apiFootballUrl(baseUrl: string, path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function hasApiFootballErrors(errors: unknown) {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return true;
}

async function requestApiFootball<T>(cfg: ApiFootballConfig, path: string, params: Record<string, string | number | undefined>) {
  const url = apiFootballUrl(cfg.baseUrl, path, params);
  const retries = apiFootballRetryCount();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await withApiFootballLimit(() => cfg.fetchFn(url.toString(), { headers: { "x-apisports-key": cfg.apiKey } }));
      const payload = await response.json().catch(() => ({})) as ApiFootballEnvelope<T>;
      if (!response.ok) {
        const detail = hasApiFootballErrors(payload.errors) ? `: ${JSON.stringify(payload.errors).slice(0, 300)}` : "";
        if (response.status === 429 && attempt < retries) {
          await wait(apiFootballRetryDelayMs() * (attempt + 1));
          continue;
        }
        throw new Error(`API-Football ${path} failed with HTTP ${response.status}${detail}`);
      }
      if (hasApiFootballErrors(payload.errors) && !payload.response) {
        throw new Error(`API-Football ${path} returned errors: ${JSON.stringify(payload.errors).slice(0, 300)}`);
      }
      return payload.response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !/HTTP 429/i.test(error instanceof Error ? error.message : String(error))) break;
      await wait(apiFootballRetryDelayMs() * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || `API-Football ${path} request failed`));
}

async function safeArrayRequest<T>(cfg: ApiFootballConfig, path: string, params: Record<string, string | number | undefined>, errors: string[]) {
  try {
    const response = await requestApiFootball<T[]>(cfg, path, params);
    return Array.isArray(response) ? response : [];
  } catch (error) {
    errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function selectTeam(searchResults: ApiFootballTeamSearchItem[], fallbackName: string): ApiFootballTeam | undefined {
  const exact = searchResults.find((item) => item.team?.name?.toLowerCase() === fallbackName.toLowerCase())?.team;
  return exact || searchResults.find((item) => item.team?.id && item.team.name)?.team || searchResults[0]?.team;
}

function seasonFromMarket(market: PolymarketMarket) {
  const date = market.closeTime ? new Date(market.closeTime) : new Date();
  const year = Number.isFinite(date.getTime()) ? date.getUTCFullYear() : new Date().getUTCFullYear();
  const month = Number.isFinite(date.getTime()) ? date.getUTCMonth() + 1 : new Date().getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

function eventDate(market: Pick<PolymarketMarket, "closeTime">) {
  if (!market.closeTime) return undefined;
  const date = new Date(market.closeTime);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function fixtureTeamIds(fixture: ApiFootballFixture) {
  return [fixture.teams?.home?.id, fixture.teams?.away?.id].filter((id): id is number => typeof id === "number");
}

function fixtureHasTeams(fixture: ApiFootballFixture, homeId?: number, awayId?: number) {
  const ids = fixtureTeamIds(fixture);
  return Boolean(homeId && awayId && ids.includes(homeId) && ids.includes(awayId));
}

function selectFixture(fixtures: ApiFootballFixture[], homeId?: number, awayId?: number, market?: PolymarketMarket) {
  const targetDate = market ? eventDate(market) : undefined;
  const matching = fixtures.filter((fixture) => fixtureHasTeams(fixture, homeId, awayId));
  if (targetDate) {
    const sameDate = matching.find((fixture) => fixture.fixture?.date?.slice(0, 10) === targetDate);
    if (sameDate) return sameDate;
  }
  const future = matching
    .filter((fixture) => {
      const date = fixture.fixture?.date ? new Date(fixture.fixture.date).getTime() : Number.NaN;
      return Number.isFinite(date) && date >= Date.now() - 6 * 3_600_000;
    })
    .sort((left, right) => new Date(left.fixture?.date || 0).getTime() - new Date(right.fixture?.date || 0).getTime());
  return future[0] || matching[0];
}

function sourceUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function evidenceItem(input: {
  evidenceId: string;
  market: PolymarketMarket;
  title: string;
  excerpt: string;
  sourceUrl: string;
  fetchedAt: string;
  tags: SportsEvidenceTag[];
  credibilityScore?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}): EvidenceItemInput {
  return {
    evidenceId: input.evidenceId,
    sourceType: "sports_structured",
    provider: "api_football",
    sourceUrl: input.sourceUrl,
    title: input.title,
    excerpt: input.excerpt.slice(0, 1_000),
    credibilityScore: input.credibilityScore ?? 88,
    fetchedAt: input.fetchedAt,
    capturedAt: input.fetchedAt,
    paid: false,
    metadata: compactRecord({
      provider: "api_football",
      marketId: input.market.marketId,
      evidenceTags: input.tags,
      ...input.metadata,
    }),
  };
}

function teamLabel(team: ApiFootballTeam | undefined, fallback: string) {
  return team?.name || fallback;
}

function fixtureLabel(fixture: ApiFootballFixture) {
  const home = fixture.teams?.home?.name || "Home";
  const away = fixture.teams?.away?.name || "Away";
  const date = fixture.fixture?.date ? new Date(fixture.fixture.date).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "date unknown";
  const league = [fixture.league?.name, fixture.league?.round].filter(Boolean).join(" - ") || "competition unknown";
  const venue = [fixture.fixture?.venue?.name, fixture.fixture?.venue?.city].filter(Boolean).join(", ") || "venue unknown";
  return `${home} vs ${away}, ${date}, ${league}, ${venue}`;
}

function resultLineForTeam(fixture: ApiFootballFixture, teamId: number | undefined) {
  const home = fixture.teams?.home;
  const away = fixture.teams?.away;
  const homeGoals = fixture.goals?.home;
  const awayGoals = fixture.goals?.away;
  const date = fixture.fixture?.date ? fixture.fixture.date.slice(0, 10) : "date unknown";
  const homeName = home?.name || "Home";
  const awayName = away?.name || "Away";
  if (typeof homeGoals !== "number" || typeof awayGoals !== "number") return `${date}: ${homeName} vs ${awayName} scheduled`;
  let outcome = "D";
  if (teamId && home?.id === teamId) outcome = homeGoals > awayGoals ? "W" : homeGoals < awayGoals ? "L" : "D";
  if (teamId && away?.id === teamId) outcome = awayGoals > homeGoals ? "W" : awayGoals < homeGoals ? "L" : "D";
  return `${date}: ${homeName} ${homeGoals}-${awayGoals} ${awayName} (${outcome})`;
}

function recentForTeam(fixtures: ApiFootballFixture[], teamId?: number) {
  return fixtures
    .filter((fixture) => !teamId || fixtureTeamIds(fixture).includes(teamId))
    .filter((fixture) => typeof fixture.goals?.home === "number" && typeof fixture.goals?.away === "number")
    .sort((left, right) => new Date(right.fixture?.date || 0).getTime() - new Date(left.fixture?.date || 0).getTime())
    .slice(0, 5);
}

function flattenStandings(standings: ApiFootballStandingLeague[]) {
  return standings.flatMap((league) => (league.league?.standings || []).flat().map((row) => ({ league: league.league, row })));
}

function standingForTeam(standings: ApiFootballStandingLeague[], team?: ApiFootballTeam) {
  const rows = flattenStandings(standings);
  return rows.find((entry) => entry.row.team?.id && team?.id && entry.row.team.id === team.id)
    || rows.find((entry) => entry.row.team?.name && team?.name && entry.row.team.name.toLowerCase() === team.name.toLowerCase());
}

export function buildApiFootballEvidence(input: ApiFootballEvidencePayload): EvidenceItemInput[] {
  const fetchedAt = input.fetchedAt || nowIso();
  const baseUrl = input.sourceBaseUrl || "https://v3.football.api-sports.io";
  const homeName = teamLabel(input.homeTeam, "Home team");
  const awayName = teamLabel(input.awayTeam, "Away team");
  const fixture = selectFixture([...(input.fixtures || []), ...(input.h2hFixtures || [])], input.homeTeam?.id, input.awayTeam?.id, input.market);
  const items: EvidenceItemInput[] = [];

  if (fixture) {
    items.push(evidenceItem({
      evidenceId: "api-football-fixture-context",
      market: input.market,
      title: `API-Football fixture context: ${homeName} vs ${awayName}`,
      excerpt: `Fixture context from API-Football: ${fixtureLabel(fixture)}. Status: ${fixture.fixture?.status?.long || fixture.fixture?.status?.short || "unknown"}.`,
      sourceUrl: sourceUrl(baseUrl, "fixtures"),
      fetchedAt,
      tags: ["fixture_context"],
      metadata: compactRecord({ fixtureId: fixture.fixture?.id, leagueId: fixture.league?.id, leagueName: fixture.league?.name, homeTeamId: input.homeTeam?.id, awayTeamId: input.awayTeam?.id }),
    }));
  }

  const homeRecent = recentForTeam(input.recentFixtures || [], input.homeTeam?.id);
  const awayRecent = recentForTeam(input.recentFixtures || [], input.awayTeam?.id);
  for (const [role, team, recent] of [["home", input.homeTeam, homeRecent], ["away", input.awayTeam, awayRecent]] as const) {
    if (!team?.id || recent.length === 0) continue;
    const lines = recent.map((match) => resultLineForTeam(match, team.id)).join("; ");
    items.push(evidenceItem({
      evidenceId: `api-football-form-${role}`,
      market: input.market,
      title: `API-Football recent form: ${team.name || role}`,
      excerpt: `${team.name || role} recent completed fixtures: ${lines}.`,
      sourceUrl: sourceUrl(baseUrl, "fixtures"),
      fetchedAt,
      tags: ["form_stats"],
      metadata: compactRecord({ teamId: team.id, teamName: team.name, fixtureCount: recent.length }),
    }));
  }

  const h2h = (input.h2hFixtures || [])
    .filter((match) => fixtureHasTeams(match, input.homeTeam?.id, input.awayTeam?.id))
    .sort((left, right) => new Date(right.fixture?.date || 0).getTime() - new Date(left.fixture?.date || 0).getTime())
    .slice(0, 5);
  if (h2h.length > 0) {
    items.push(evidenceItem({
      evidenceId: "api-football-h2h",
      market: input.market,
      title: `API-Football head-to-head: ${homeName} vs ${awayName}`,
      excerpt: `Recent head-to-head meetings: ${h2h.map((match) => resultLineForTeam(match, input.homeTeam?.id)).join("; ")}.`,
      sourceUrl: sourceUrl(baseUrl, "fixtures/headtohead"),
      fetchedAt,
      tags: ["head_to_head", "form_stats"],
      metadata: compactRecord({ homeTeamId: input.homeTeam?.id, awayTeamId: input.awayTeam?.id, fixtureCount: h2h.length }),
    }));
  }

  if (input.injuriesFetched) {
    const injuries = input.injuries || [];
    const excerpt = injuries.length > 0
      ? `Confirmed API-Football injury/suspension records: ${injuries.slice(0, 10).map((injury) => {
        const team = injury.team?.name || "unknown team";
        const player = injury.player?.name || "unknown player";
        const reason = [injury.player?.type, injury.player?.reason].filter(Boolean).join(" - ") || "reason unspecified";
        return `${team}: ${player} (${reason})`;
      }).join("; ")}.`
      : `API-Football injury endpoint returned no confirmed injuries or suspensions for ${homeName} or ${awayName} at fetch time.`;
    items.push(evidenceItem({
      evidenceId: "api-football-injuries",
      market: input.market,
      title: `API-Football injury and availability check: ${homeName} vs ${awayName}`,
      excerpt,
      sourceUrl: sourceUrl(baseUrl, "injuries"),
      fetchedAt,
      tags: ["injury_lineup"],
      metadata: compactRecord({ homeTeamId: input.homeTeam?.id, awayTeamId: input.awayTeam?.id, injuryCount: injuries.length, coverageNote: injuries.length ? "confirmed_injuries_returned" : "no_confirmed_injuries_returned" }),
    }));
  }

  const homeStanding = standingForTeam(input.standings || [], input.homeTeam);
  const awayStanding = standingForTeam(input.standings || [], input.awayTeam);
  if (homeStanding || awayStanding) {
    const standingText = [homeStanding, awayStanding].filter(Boolean).map((entry) => {
      const row = entry!.row;
      const league = entry!.league?.name || "league";
      return `${row.team?.name || "team"}: rank ${row.rank ?? "n/a"}, ${row.points ?? "n/a"} pts, GD ${row.goalsDiff ?? "n/a"}, form ${row.form || "n/a"} in ${league}`;
    }).join("; ");
    items.push(evidenceItem({
      evidenceId: "api-football-standings",
      market: input.market,
      title: `API-Football standings context: ${homeName} vs ${awayName}`,
      excerpt: `Standings context: ${standingText}.`,
      sourceUrl: sourceUrl(baseUrl, "standings"),
      fetchedAt,
      tags: ["standings", "form_stats"],
      metadata: compactRecord({ homeTeamId: input.homeTeam?.id, awayTeamId: input.awayTeam?.id, leagueId: homeStanding?.league?.id || awayStanding?.league?.id }),
    }));
  }

  const lineups = (input.lineups || []).filter((lineup) => lineup.team?.id === input.homeTeam?.id || lineup.team?.id === input.awayTeam?.id);
  if (lineups.length > 0) {
    const lineupText = lineups.map((lineup) => {
      const starters = (lineup.startXI || []).map((entry) => entry.player?.name).filter(Boolean).slice(0, 8).join(", ");
      return `${lineup.team?.name || "team"}: ${lineup.formation || "formation unknown"}, coach ${lineup.coach?.name || "unknown"}${starters ? `, starters include ${starters}` : ""}`;
    }).join("; ");
    items.push(evidenceItem({
      evidenceId: "api-football-lineups",
      market: input.market,
      title: `API-Football lineup context: ${homeName} vs ${awayName}`,
      excerpt: lineupText,
      sourceUrl: sourceUrl(baseUrl, "fixtures/lineups"),
      fetchedAt,
      tags: ["injury_lineup", "fixture_context", "tactical_news"],
      metadata: compactRecord({ fixtureId: fixture?.fixture?.id, lineupCount: lineups.length }),
    }));
  }

  return items.map((item) => ({
    ...item,
    metadata: {
      ...(item.metadata || {}),
      evidenceTags: mergeSportsEvidenceTags(item.metadata?.evidenceTags as SportsEvidenceTag[] | undefined),
    },
  }));
}

export async function fetchApiFootballEvidence(input: {
  market: PolymarketMarket;
  fetchFn?: ApiFootballFetch | undefined;
}): Promise<SportsStructuredEvidenceProviderResult> {
  const cfg = config({ fetchFn: input.fetchFn });
  if (!cfg.enabled) {
    return { enabled: false, provider: "api_football", status: "disabled", evidence: [], failureReason: "structured_sports_evidence_disabled" };
  }
  if (!cfg.apiKey) {
    return { enabled: true, provider: "api_football", status: "failed", evidence: [], failureReason: "missing_api_football_key", error: "API_FOOTBALL_KEY is required when ENABLE_SPORTS_STRUCTURED_EVIDENCE=true." };
  }

  const errors: string[] = [];
  const [homeName, awayName] = extractLikelyFootballTeams(input.market);
  if (!homeName || !awayName) {
    return { enabled: true, provider: "api_football", status: "failed", evidence: [], failureReason: "unable_to_extract_football_teams", error: `Could not extract two teams from market title: ${input.market.title}` };
  }

  const [homeSearch, awaySearch] = await Promise.all([
    safeArrayRequest<ApiFootballTeamSearchItem>(cfg, "teams", { search: homeName }, errors),
    safeArrayRequest<ApiFootballTeamSearchItem>(cfg, "teams", { search: awayName }, errors),
  ]);
  const homeTeam = selectTeam(homeSearch, homeName);
  const awayTeam = selectTeam(awaySearch, awayName);
  if (!homeTeam?.id || !awayTeam?.id) {
    return { enabled: true, provider: "api_football", status: "failed", evidence: [], failureReason: "api_football_team_lookup_failed", error: [`Could not resolve API-Football teams for ${homeName} vs ${awayName}.`, ...errors].join(" ") };
  }

  const season = seasonFromMarket(input.market);
  const date = eventDate(input.market);
  const from = date;
  const to = date;
  const [homeRecent, awayRecent, h2hFixtures, homeNext, awayNext, homeInjuries, awayInjuries] = await Promise.all([
    safeArrayRequest<ApiFootballFixture>(cfg, "fixtures", { team: homeTeam.id, last: 5 }, errors),
    safeArrayRequest<ApiFootballFixture>(cfg, "fixtures", { team: awayTeam.id, last: 5 }, errors),
    safeArrayRequest<ApiFootballFixture>(cfg, "fixtures/headtohead", { h2h: `${homeTeam.id}-${awayTeam.id}`, last: 10 }, errors),
    safeArrayRequest<ApiFootballFixture>(cfg, "fixtures", { team: homeTeam.id, next: 10, from, to }, errors),
    safeArrayRequest<ApiFootballFixture>(cfg, "fixtures", { team: awayTeam.id, next: 10, from, to }, errors),
    safeArrayRequest<ApiFootballInjury>(cfg, "injuries", { team: homeTeam.id, season }, errors),
    safeArrayRequest<ApiFootballInjury>(cfg, "injuries", { team: awayTeam.id, season }, errors),
  ]);

  const fixtures = [...homeNext, ...awayNext];
  const recentFixtures = [...homeRecent, ...awayRecent];
  const fixture = selectFixture([...fixtures, ...h2hFixtures], homeTeam.id, awayTeam.id, input.market);
  const fixtureId = fixture?.fixture?.id;
  const leagueId = fixture?.league?.id;
  const fixtureSeason = fixture?.league?.season || season;
  const [standings, lineups] = await Promise.all([
    leagueId ? safeArrayRequest<ApiFootballStandingLeague>(cfg, "standings", { league: leagueId, season: fixtureSeason }, errors) : Promise.resolve([]),
    fixtureId ? safeArrayRequest<ApiFootballLineup>(cfg, "fixtures/lineups", { fixture: fixtureId }, errors) : Promise.resolve([]),
  ]);

  const evidence = buildApiFootballEvidence({
    market: input.market,
    homeTeam,
    awayTeam,
    fixtures,
    recentFixtures,
    h2hFixtures,
    injuries: [...homeInjuries, ...awayInjuries],
    injuriesFetched: true,
    standings,
    lineups,
    sourceBaseUrl: cfg.baseUrl,
  });

  if (evidence.length === 0) {
    return { enabled: true, provider: "api_football", status: "failed", evidence: [], teams: { home: homeTeam, away: awayTeam }, fixtureId, failureReason: "api_football_no_usable_evidence", error: errors.join(" | ") || "API-Football returned no usable sports evidence." };
  }

  return {
    enabled: true,
    provider: "api_football",
    status: "success",
    evidence,
    teams: { home: homeTeam, away: awayTeam },
    fixtureId,
    error: errors.length ? errors.join(" | ") : undefined,
  };
}
