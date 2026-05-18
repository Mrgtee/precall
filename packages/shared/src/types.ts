export type CallAction = "BUY_YES" | "BUY_NO" | "WATCH";

export type AgentName = "MacroScout" | "NewsHawk" | "CrowdPulse" | "BookWatcher" | "Skeptic";

export interface PolymarketMarket {
  source: "polymarket";
  marketId: string;
  conditionId: string;
  slug: string;
  title: string;
  description: string;
  url: string;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  liquidityUsd: number;
  volume24hUsd: number;
  closeTime: string | null;
  status: "active" | "closed";
}

export interface MarketSnapshot {
  marketId: string;
  yesPriceBps: number;
  noPriceBps: number;
  spreadBps: number;
  depthUsd: number;
  capturedAt: string;
}

export interface MarketResolution {
  marketId: string;
  outcomeYes: boolean;
  finalYesPriceBps: number;
  sourceUrl: string;
  resolvedAt: string;
}

export interface EvidenceItemInput {
  sourceUrl: string;
  title: string;
  excerpt: string;
  credibilityScore: number;
}

export interface AgentVote {
  agent: AgentName;
  probabilityBps: number;
  confidenceBps: number;
  action: CallAction;
  thesis: string;
  risks: string[];
  evidence: EvidenceItemInput[];
}

export interface AggregatedCall {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  action: CallAction;
  agentProbabilityBps: number;
  marketPriceBps: number;
  edgeBps: number;
  confidenceBps: number;
  suggestedSizeBps: number;
  thesis: string;
  counterarguments: string[];
  evidence: EvidenceItemInput[];
  votes: AgentVote[];
}
