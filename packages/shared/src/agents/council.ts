import { optionalEnv, requireEnv } from "../env";
import type { AgentName, AgentVote, MarketSnapshot, PolymarketMarket } from "../types";

const AGENTS: { name: AgentName; role: string }[] = [
  { name: "MacroScout", role: "macro, policy, rates, elections, and public-event priors" },
  { name: "NewsHawk", role: "fresh news and event-catalyst interpretation" },
  { name: "CrowdPulse", role: "social narrative and attention-cycle analysis" },
  { name: "BookWatcher", role: "market microstructure, liquidity, spread, and price action" },
  { name: "Skeptic", role: "adversarial review and reasons the trade is wrong" },
];

export async function runAgentCouncil(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  extraEvidence?: string[];
}): Promise<AgentVote[]> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = optionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
  const prompt = buildPrompt(input);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Precall Arena's agent council. Return only strict JSON. Do not invent market data. If evidence is weak, lower confidence.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content.");
  return validateVotes(JSON.parse(content) as unknown, input.market);
}

function buildPrompt(input: {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  extraEvidence?: string[];
}) {
  const agentList = AGENTS.map((agent) => `- ${agent.name}: ${agent.role}`).join("\n");
  return `
Analyze this live prediction market. Produce exactly one vote for each agent below.

Agents:
${agentList}

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
Extra evidence:
${(input.extraEvidence || []).map((item) => `- ${item}`).join("\n") || "- none"}

Return JSON with this exact shape:
{
  "votes": [
    {
      "agent": "MacroScout",
      "probabilityBps": 0-10000,
      "confidenceBps": 0-10000,
      "action": "BUY_YES" | "BUY_NO" | "WATCH",
      "thesis": "specific concise thesis",
      "risks": ["specific risk"],
      "evidence": [{"sourceUrl":"url","title":"source title","excerpt":"why it matters","credibilityScore":0-100}]
    }
  ]
}
`;
}

function validateVotes(payload: unknown, market: PolymarketMarket): AgentVote[] {
  const votes = (payload as { votes?: unknown[] }).votes;
  if (!Array.isArray(votes)) throw new Error("Agent council response missing votes array.");

  const byAgent = new Map<string, AgentVote>();
  for (const raw of votes) {
    const vote = raw as Partial<AgentVote>;
    if (!vote.agent || !AGENTS.some((agent) => agent.name === vote.agent)) continue;
    byAgent.set(vote.agent, {
      agent: vote.agent,
      probabilityBps: clamp(Number(vote.probabilityBps)),
      confidenceBps: clamp(Number(vote.confidenceBps)),
      action: vote.action === "BUY_NO" || vote.action === "BUY_YES" ? vote.action : "WATCH",
      thesis: String(vote.thesis || "").slice(0, 1_500),
      risks: Array.isArray(vote.risks) ? vote.risks.map(String).slice(0, 5) : [],
      evidence: normalizeEvidence(vote.evidence, market),
    });
  }

  for (const agent of AGENTS) {
    if (!byAgent.has(agent.name)) {
      throw new Error(`Agent council response missing ${agent.name}.`);
    }
  }

  return AGENTS.map((agent) => byAgent.get(agent.name)!);
}

function normalizeEvidence(value: unknown, market: PolymarketMarket) {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      {
        sourceUrl: market.url,
        title: market.title,
        excerpt: "Live Polymarket market metadata and price snapshot.",
        credibilityScore: 70,
      },
    ];
  }
  return value.slice(0, 4).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      sourceUrl: String(row.sourceUrl || market.url),
      title: String(row.title || market.title).slice(0, 180),
      excerpt: String(row.excerpt || "").slice(0, 500),
      credibilityScore: Math.max(0, Math.min(100, Number(row.credibilityScore) || 50)),
    };
  });
}

function clamp(value: number) {
  return Math.max(0, Math.min(10_000, Math.round(Number.isFinite(value) ? value : 0)));
}
