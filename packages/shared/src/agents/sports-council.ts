import { numberEnv, optionalEnv, requireEnv } from "../env";
import { validateEvidenceIds } from "../evidence";
import { clampBps } from "../scoring";
import type { EvidenceItemInput, OutcomeSnapshot, PolymarketMarket, SportsAgentFailure, SportsAgentName, SportsCouncilResult, SportsVote } from "../types";

const SPORTS_AGENTS: { name: SportsAgentName; role: string; required?: boolean }[] = [
  { name: "FormScout", role: "recent form, schedule spot, and team/player context" },
  { name: "InjuryNews", role: "injury, lineup, roster, and availability risk from supplied evidence only" },
  { name: "MarketMover", role: "Polymarket price movement, crowd positioning, and relative value" },
  { name: "MatchupDesk", role: "matchup style, totals, spread, moneyline, and sport-specific context" },
  { name: "Skeptic", role: "adversarial review; why the sports idea may be wrong", required: true },
];

export async function runSportsCouncilDetailed(input: {
  market: PolymarketMarket;
  snapshot: OutcomeSnapshot;
  evidence: EvidenceItemInput[];
  candidateOutcomeIndexes: number[];
  category: string;
  marketKind: string;
}): Promise<SportsCouncilResult> {
  const model = optionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const baseUrl = optionalEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
  const startedAt = Date.now();
  const votes: SportsVote[] = [];
  const failures: SportsAgentFailure[] = [];

  for (const agent of SPORTS_AGENTS) {
    const agentStartedAt = Date.now();
    try {
      votes.push(await runSingleSportsAgent({ ...input, agent, model, baseUrl }));
    } catch (error) {
      failures.push({
        agent: agent.name,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - agentStartedAt,
        retryCount: numberEnv("MODEL_RETRY_COUNT", 2),
      });
    }
  }

  if (!votes.some((vote) => vote.agent === "Skeptic")) {
    throw new Error(`Skeptic sports agent failed; refusing to store strong sports idea. Failures: ${JSON.stringify(failures)}`);
  }
  if (votes.length < 4) {
    throw new Error(`Only ${votes.length} valid sports agent votes returned; refusing to store strong sports idea. Failures: ${JSON.stringify(failures)}`);
  }

  return { votes, failures, model, baseUrl, totalLatencyMs: Date.now() - startedAt };
}

async function runSingleSportsAgent(input: {
  market: PolymarketMarket;
  snapshot: OutcomeSnapshot;
  evidence: EvidenceItemInput[];
  candidateOutcomeIndexes: number[];
  category: string;
  marketKind: string;
  agent: { name: SportsAgentName; role: string };
  model: string;
  baseUrl: string;
}) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const retries = numberEnv("MODEL_RETRY_COUNT", 2);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const content = await requestSportsVote(input, apiKey, attempt);
      return validateSportsVote(JSON.parse(content) as unknown, input.agent.name, input.evidence, input.candidateOutcomeIndexes, Date.now() - startedAt, attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(Math.min(2_000 * 2 ** attempt, 8_000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function requestSportsVote(input: {
  market: PolymarketMarket;
  snapshot: OutcomeSnapshot;
  evidence: EvidenceItemInput[];
  candidateOutcomeIndexes: number[];
  category: string;
  marketKind: string;
  agent: { name: SportsAgentName; role: string };
  model: string;
  baseUrl: string;
}, apiKey: string, attempt: number) {
  const timeoutMs = numberEnv("MODEL_TIMEOUT_MS", 45_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(chatCompletionsUrl(input.baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are one specialized Precall sports-market agent. Return strict JSON only. Do not invent URLs, injuries, statistics, or market data. Use only supplied evidence IDs. Pick a selectedOutcomeIndex only from the supplied candidateOutcomeIndexes. Keep analysis probability-based, neutral, and never guaranteed.",
          },
          { role: "user", content: buildSportsPrompt(input) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Model provider request failed ${response.status} on sports attempt ${attempt + 1}: ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Model provider returned no sports content.");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function chatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  return `${normalized}/chat/completions`;
}

function buildSportsPrompt(input: {
  market: PolymarketMarket;
  snapshot: OutcomeSnapshot;
  evidence: EvidenceItemInput[];
  candidateOutcomeIndexes: number[];
  category: string;
  marketKind: string;
  agent: { name: SportsAgentName; role: string };
}) {
  const outcomes = input.market.outcomes
    .map((outcome, index) => `${index}: ${outcome} at ${Math.round((input.market.outcomePrices[index] || 0) * 10_000)} bps`)
    .join("\n");
  const evidence = input.evidence
    .map((item) => `- ${item.evidenceId} [${item.sourceType}, provider ${item.provider}, paid ${item.paid ? "yes" : "no"}, score ${item.credibilityScore}, ${item.fetchedAt}] ${item.title}: ${item.excerpt} (${item.sourceUrl})`)
    .join("\n");

  return `
You are ${input.agent.name}: ${input.agent.role}.

Analyze this sports prediction market for a selected option/value idea. Do not choose an option only because it has the highest market probability. Choose it only if supplied evidence supports a reasonable value case versus alternatives. If evidence is thin, lower confidence.

Market category: ${input.category}
Market kind: ${input.marketKind}
Title: ${input.market.title}
Description: ${input.market.description || "No description provided"}
URL: ${input.market.url}
Close time: ${input.market.closeTime || "unknown"}
Liquidity USD: ${input.market.liquidityUsd}
Volume 24h USD: ${input.market.volume24hUsd}
Candidate outcome indexes: ${input.candidateOutcomeIndexes.join(", ")}
Outcomes/prices:
${outcomes}
Current candidate snapshot: index ${input.snapshot.outcomeIndex} ${input.snapshot.outcome}, price ${input.snapshot.priceBps} bps, spread ${input.snapshot.spreadBps} bps.

Verified evidence. Use only these evidence IDs. Do not create URLs:
${evidence}

Return JSON with this exact shape:
{
  "agent": "${input.agent.name}",
  "selectedOutcomeIndex": 0,
  "agentProbabilityBps": 0-10000,
  "confidenceBps": 0-10000,
  "thesis": "specific concise sports reasoning tied to evidence IDs",
  "risks": ["specific risk"],
  "evidenceIds": ["pm-market", "pm-selected-outcome"]
}
`;
}

function validateSportsVote(payload: unknown, agent: SportsAgentName, evidence: EvidenceItemInput[], candidateOutcomeIndexes: number[], latencyMs: number, retryCount: number): SportsVote {
  const raw = payload as Partial<SportsVote> & { probabilityBps?: number; outcomeIndex?: number };
  if (raw.agent !== agent) throw new Error(`Sports agent response must be from ${agent}.`);
  const selectedOutcomeIndex = Number(raw.selectedOutcomeIndex ?? raw.outcomeIndex);
  if (!candidateOutcomeIndexes.includes(selectedOutcomeIndex)) throw new Error(`${agent} selected invalid outcome index ${selectedOutcomeIndex}.`);
  const evidenceIds = Array.isArray(raw.evidenceIds) ? raw.evidenceIds.map(String).slice(0, 8) : [];
  if (evidenceIds.length === 0) throw new Error(`${agent} did not reference any supplied sports evidence IDs.`);
  if (!validateEvidenceIds(evidenceIds, evidence)) throw new Error(`${agent} referenced unknown evidence IDs: ${evidenceIds.join(", ")}`);

  return {
    agent,
    selectedOutcomeIndex,
    agentProbabilityBps: clampBps(Number(raw.agentProbabilityBps ?? raw.probabilityBps)),
    confidenceBps: clampBps(Number(raw.confidenceBps)),
    thesis: String(raw.thesis || "").slice(0, 1_500),
    risks: Array.isArray(raw.risks) ? raw.risks.map(String).slice(0, 5) : [],
    evidenceIds,
    latencyMs,
    retryCount,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
