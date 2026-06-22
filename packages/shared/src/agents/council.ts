import { numberEnv, optionalEnv, requireEnv } from "../env";
import { validateEvidenceIds } from "../evidence";
import type { AgentCouncilResult, AgentFailure, AgentName, AgentVote, EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "../types";
import { clampBps } from "../scoring";

const AGENTS: { name: AgentName; role: string; required?: boolean }[] = [
  { name: "MacroScout", role: "macro, policy, rates, elections, and public-event priors" },
  { name: "NewsHawk", role: "fresh news and event-catalyst interpretation" },
  { name: "CrowdPulse", role: "social narrative and attention-cycle analysis" },
  { name: "BookWatcher", role: "market microstructure, liquidity, spread, and price action" },
  { name: "Skeptic", role: "adversarial review and reasons the trade is wrong", required: true },
];

export async function runAgentCouncil(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  evidence: EvidenceItemInput[];
}): Promise<AgentVote[]> {
  return (await runAgentCouncilDetailed(input)).votes;
}

export async function runAgentCouncilDetailed(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  evidence: EvidenceItemInput[];
}): Promise<AgentCouncilResult> {
  const model = optionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const baseUrl = optionalEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
  const startedAt = Date.now();
  const votes: AgentVote[] = [];
  const failures: AgentFailure[] = [];

  for (const agent of AGENTS) {
    const agentStartedAt = Date.now();
    try {
      const vote = await runSingleAgent({ ...input, agent, model, baseUrl });
      votes.push(vote);
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
    throw new Error(`Skeptic agent failed; refusing to publish. Failures: ${JSON.stringify(failures)}`);
  }
  if (votes.length < 4) {
    throw new Error(`Only ${votes.length} valid agent votes returned; refusing to publish. Failures: ${JSON.stringify(failures)}`);
  }

  return {
    votes,
    failures,
    model,
    baseUrl,
    totalLatencyMs: Date.now() - startedAt,
  };
}

async function runSingleAgent(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  evidence: EvidenceItemInput[];
  agent: { name: AgentName; role: string };
  model: string;
  baseUrl: string;
}) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const retries = numberEnv("MODEL_RETRY_COUNT", 2);
  let lastError: unknown;

  const filteredEvidence = filterEvidenceForAgent(input.agent.name, input.evidence);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const content = await requestAgentVote({ ...input, evidence: filteredEvidence }, apiKey, attempt);
      return validateVote(JSON.parse(content) as unknown, input.agent.name, filteredEvidence, Date.now() - startedAt, attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await delay(Math.min(2_000 * 2 ** attempt, 8_000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function requestAgentVote(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  evidence: EvidenceItemInput[];
  agent: { name: AgentName; role: string };
  model: string;
  baseUrl: string;
}, apiKey: string, attempt: number) {
  const timeoutMs = numberEnv("MODEL_TIMEOUT_MS", 45_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(chatCompletionsUrl(input.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are one specialized Precall market agent. Return strict JSON only. Do not invent source URLs or market data. Use only supplied evidence IDs. yesProbabilityBps always means probability that the first listed/YES outcome happens, even if action is BUY_NO. If evidence is weak, choose WATCH or lower confidence.",
          },
          { role: "user", content: buildPrompt(input) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Model provider request failed ${response.status} on attempt ${attempt + 1}: ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Model provider returned no content.");
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

function buildPrompt(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  evidence: EvidenceItemInput[];
  agent: { name: AgentName; role: string };
}) {
  const evidence = input.evidence
    .map((item) => `- ${item.evidenceId} [${item.sourceType}, provider ${item.provider}, paid ${item.paid ? "yes" : "no"}, score ${item.credibilityScore}, ${item.fetchedAt}] ${item.title}: ${item.excerpt} (${item.sourceUrl})`)
    .join("\n");

  return `
You are ${input.agent.name}: ${input.agent.role}.

Analyze this STRICT YES/NO prediction market. If it is not a clean YES/NO market, return WATCH.

Canonical probability rule:
- yesProbabilityBps must always mean probability that YES / first outcome happens.
- BUY_YES means YES is underpriced.
- BUY_NO means NO is underpriced, but yesProbabilityBps must still be the YES probability.
- Never return selected-side probability as yesProbabilityBps for BUY_NO.

Market:
Title: ${input.market.title}
Description: ${input.market.description || "No description provided"}
URL: ${input.market.url}
Outcomes: ${input.market.outcomes.join(", ")}
Current YES price bps: ${input.snapshot.yesPriceBps}
Current NO price bps: ${input.snapshot.noPriceBps}
Spread bps: ${input.snapshot.spreadBps}
Liquidity USD: ${input.market.liquidityUsd}
Volume 24h USD: ${input.market.volume24hUsd}
Close time: ${input.market.closeTime || "unknown"}

Verified evidence. Use only these evidence IDs. Do not create URLs:
${evidence}

Return JSON with this exact shape:
{
  "agent": "${input.agent.name}",
  "yesProbabilityBps": 0-10000,
  "confidenceBps": 0-10000,
  "action": "BUY_YES" | "BUY_NO" | "WATCH",
  "thesis": "specific concise thesis tied to evidence IDs",
  "risks": ["specific risk"],
  "evidenceIds": ["pm-market", "pm-orderbook"]
}
`;
}

function validateVote(payload: unknown, agent: AgentName, evidence: EvidenceItemInput[], latencyMs: number, retryCount: number): AgentVote {
  const raw = payload as Partial<AgentVote> & { probabilityBps?: number };
  if (raw.agent !== agent) throw new Error(`Agent response must be from ${agent}.`);
  const evidenceIds = Array.isArray(raw.evidenceIds) ? raw.evidenceIds.map(String).slice(0, 8) : [];
  if (evidenceIds.length === 0) throw new Error(`${agent} did not reference any supplied evidence IDs.`);
  if (!validateEvidenceIds(evidenceIds, evidence)) throw new Error(`${agent} referenced unknown evidence IDs: ${evidenceIds.join(", ")}`);

  return {
    agent,
    yesProbabilityBps: clampBps(Number(raw.yesProbabilityBps ?? raw.probabilityBps)),
    confidenceBps: clampBps(Number(raw.confidenceBps)),
    action: raw.action === "BUY_NO" || raw.action === "BUY_YES" ? raw.action : "WATCH",
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

export function filterEvidenceForAgent(agentName: AgentName, evidence: EvidenceItemInput[]): EvidenceItemInput[] {
  if (agentName === "Skeptic") {
    return evidence;
  }

  return evidence.filter((item) => {
    if (item.evidenceId === "pm-market" || item.sourceType === "polymarket_market") {
      return true;
    }

    if (agentName === "MacroScout") {
      return item.sourceType === "admin_note";
    }

    if (agentName === "NewsHawk") {
      return item.sourceType === "circle_x402_news" || item.sourceType === "free_web";
    }

    if (agentName === "CrowdPulse") {
      return item.sourceType === "circle_x402_social";
    }

    if (agentName === "BookWatcher") {
      return item.evidenceId === "pm-orderbook" || item.sourceType === "polymarket_orderbook";
    }

    return false;
  });
}
