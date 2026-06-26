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

type HostedSportsAgentPromptContext = {
  name: string;
  slug?: string;
  description?: string;
  strategyMode?: string;
  riskProfile?: string;
  categoryScope?: string[];
};

export async function runSportsCouncilDetailed(input: {
  market: PolymarketMarket;
  snapshot: OutcomeSnapshot;
  evidence: EvidenceItemInput[];
  candidateOutcomeIndexes: number[];
  category: string;
  marketKind: string;
  hostedAgent?: HostedSportsAgentPromptContext | undefined;
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
    throw new Error(`Skeptic sports agent failed; refusing to store Sports Live Call. Failures: ${JSON.stringify(failures)}`);
  }
  if (votes.length < 4) {
    throw new Error(`Only ${votes.length} valid sports agent votes returned; refusing to store Sports Live Call. Failures: ${JSON.stringify(failures)}`);
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
  hostedAgent?: HostedSportsAgentPromptContext | undefined;
  agent: { name: SportsAgentName; role: string };
  model: string;
  baseUrl: string;
}) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const retries = numberEnv("MODEL_RETRY_COUNT", 2);
  let lastError: unknown;

  const filteredEvidence = filterSportsEvidenceForAgent(input.agent.name, input.evidence);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const content = await requestSportsVote({ ...input, evidence: filteredEvidence }, apiKey, attempt);
      return validateSportsVote(JSON.parse(content) as unknown, input.agent.name, filteredEvidence, input.candidateOutcomeIndexes, Date.now() - startedAt, attempt);
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
  hostedAgent?: HostedSportsAgentPromptContext | undefined;
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
  hostedAgent?: HostedSportsAgentPromptContext | undefined;
  agent: { name: SportsAgentName; role: string };
}) {
  const outcomes = input.market.outcomes
    .map((outcome, index) => `${index}: ${outcome} at ${Math.round((input.market.outcomePrices[index] || 0) * 10_000)} bps`)
    .join("\n");
  const evidence = input.evidence
    .map((item) => `- ${item.evidenceId} [${item.sourceType}, provider ${item.provider}, paid ${item.paid ? "yes" : "no"}, score ${item.credibilityScore}, ${item.fetchedAt}] ${item.title}: ${item.excerpt} (${item.sourceUrl})`)
    .join("\n");
  const strategyMode = (input.hostedAgent?.strategyMode || "hit_rate").trim().toLowerCase();
  const riskProfile = (input.hostedAgent?.riskProfile || "balanced").trim().toLowerCase();
  const categoryScope = (input.hostedAgent?.categoryScope || []).filter(Boolean).join(", ") || "all sports categories";
  const hostedAgentHeader = input.hostedAgent
    ? `Hosted agent profile:\n- Name: ${input.hostedAgent.name}\n- Slug: ${input.hostedAgent.slug || "n/a"}\n- Strategy mode: ${strategyMode}\n- Risk profile: ${riskProfile}\n- Category scope: ${categoryScope}\n- Public description: ${input.hostedAgent.description || "No additional description supplied."}`
    : "Hosted agent profile:\n- Name: Precall Sports Council\n- Strategy mode: hit_rate\n- Risk profile: balanced\n- Category scope: all sports categories";
  const strategyInstruction = strategyMode === "contrarian"
    ? "This hosted agent is contrarian: stay evidence-based and probability-aware, but you may fade the crowd when the supplied evidence clearly justifies it."
    : strategyMode === "balanced"
      ? "This hosted agent is balanced: weigh win likelihood and mispricing together instead of optimizing only for the biggest favorite."
      : "This hosted agent is hit-rate focused: optimize for the side most likely to win, even when the edge and payout are modest.";
  const riskInstruction = riskProfile === "aggressive"
    ? "Aggressive risk profile: you may tolerate thinner market consensus if the supplied evidence is coherent, but you must say so and reduce confidence when evidence is weak."
    : riskProfile === "conservative"
      ? "Conservative risk profile: stay close to market-implied probability unless the supplied evidence clearly supports a change, and strongly penalize uncertain calls."
      : "Balanced risk profile: use the market as a baseline while allowing moderate evidence-backed deviations.";

  return `
You are ${input.agent.name}: ${input.agent.role}.

${hostedAgentHeader}
${strategyInstruction}
${riskInstruction}

Analyze this sports prediction market for a selected AI side. Precall is currently optimizing for high-potential wins before profit size. Use market-implied probability as a strong baseline, prefer the outcome most likely to win even when profit/edge is small, and do not chase underdogs only because the payout is larger. If the highest-probability side has clear supplied-evidence red flags, explain that and choose the better-supported alternative. If no side has a playable edge, still select the least bad/most plausible candidate outcome, set low confidence, and explain why it should be treated as high risk. If evidence is thin, say evidence was not available and lower confidence.

Specific Football Analysis Instructions for your role:
- FormScout: Look at recent team form, head-to-head records, shooting efficiency, expected goals (xG), and underlying performance metrics from the evidence.
- InjuryNews: Identify key starters/lineup changes, suspended players, squad depth/rotations, and fatigue/fixture congestion concerns.
- MarketMover: Inspect Polymarket outcome price movements, bookmaker odds/spread dynamics, and volume/liquidity context.
- MatchupDesk: Assess tactical formations, managers' strategies, pressing style (low block vs high line), home/away venue, weather, and referee factors.
- Skeptic: Perform adversarial review to challenge the consensus, identify card/penalty variance, lucky/unlucky runs of form (e.g. xG over/underperformance), and structural risk factors.

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
  "evidenceIds": ${JSON.stringify(input.evidence.slice(0, 2).map((e) => e.evidenceId))}
}
`;
}

export function validateSportsVote(payload: unknown, agent: SportsAgentName, evidence: EvidenceItemInput[], candidateOutcomeIndexes: number[], latencyMs: number, retryCount: number): SportsVote {
  const raw = payload as Partial<SportsVote> & { probabilityBps?: number; outcomeIndex?: number };
  if (raw.agent !== agent) throw new Error(`Sports agent response must be from ${agent}.`);
  const selectedOutcomeIndex = Number(raw.selectedOutcomeIndex ?? raw.outcomeIndex);
  if (!candidateOutcomeIndexes.includes(selectedOutcomeIndex)) throw new Error(`${agent} selected invalid outcome index ${selectedOutcomeIndex}.`);
  const validIds = new Set(evidence.map((item) => item.evidenceId));
  const templatePlaceholders = ["pm-selected-outcome", "pm-orderbook"];
  const rawEvidenceIds = Array.isArray(raw.evidenceIds) ? raw.evidenceIds.map(String).slice(0, 8) : [];
  const evidenceIds = rawEvidenceIds.filter((id) => validIds.has(id) || !templatePlaceholders.includes(id));
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

export function filterSportsEvidenceForAgent(agentName: SportsAgentName, evidence: EvidenceItemInput[]): EvidenceItemInput[] {
  if (agentName === "Skeptic") {
    return evidence;
  }

  return evidence.filter((item) => {
    if (item.evidenceId === "pm-market" || item.sourceType === "polymarket_market") {
      return true;
    }

    if (agentName === "MarketMover" && (item.evidenceId === "pm-selected-outcome" || item.sourceType === "polymarket_orderbook")) {
      return true;
    }

    const text = `${item.title} ${item.excerpt}`.toLowerCase();

    if (agentName === "FormScout") {
      return /\b(stats|form|xg|expected goals?|history|h2h|records?)\b/i.test(text);
    }

    if (agentName === "InjuryNews") {
      return /\b(injury|out|suspension|roster|bench|active|lineup)\b/i.test(text);
    }

    if (agentName === "MarketMover") {
      return /\b(odds|price|spread|volume|moneyline|book)\b/i.test(text);
    }

    if (agentName === "MatchupDesk") {
      return /\b(tactic|system|manager|playstyle|pitch|weather|referee)\b/i.test(text);
    }

    return false;
  });
}
