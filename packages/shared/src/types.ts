export type CallAction = "BUY_YES" | "BUY_NO" | "WATCH";

export type AgentName = "MacroScout" | "NewsHawk" | "CrowdPulse" | "BookWatcher" | "Skeptic";

export type CallStatus = "draft" | "published" | "expired" | "resolving" | "resolved" | "failed_resolution" | "archived";

export type EvidenceSourceType =
  | "polymarket_market"
  | "polymarket_orderbook"
  | "circle_x402_social"
  | "circle_x402_news"
  | "free_web"
  | "admin_note";

export type CircleActionType =
  | "x402_api_payment"
  | "arc_bond"
  | "thesis_unlock"
  | "gateway_deposit"
  | "gateway_withdrawal"
  | "bond_call"
  | "unlock_thesis"
  | "x402_evidence_payment";

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
  evidenceId: string;
  sourceType: EvidenceSourceType;
  provider: string;
  sourceUrl: string;
  title: string;
  excerpt: string;
  credibilityScore: number;
  fetchedAt: string;
  capturedAt: string;
  paid: boolean;
  paymentAmountUsdc?: string | undefined;
  paymentNetwork?: string | undefined;
  paymentRef?: string | undefined;
  txHash?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface AgentVote {
  agent: AgentName;
  yesProbabilityBps: number;
  confidenceBps: number;
  action: CallAction;
  thesis: string;
  risks: string[];
  evidenceIds: string[];
  latencyMs?: number;
  retryCount?: number;
}

export interface AgentFailure {
  agent: AgentName;
  error: string;
  latencyMs: number;
  retryCount: number;
}

export interface AgentCouncilResult {
  votes: AgentVote[];
  failures: AgentFailure[];
  model: string;
  baseUrl: string;
  totalLatencyMs: number;
}

export interface AggregatedCall {
  market: PolymarketMarket;
  snapshot: MarketSnapshot;
  action: CallAction;
  yesProbabilityBps: number;
  selectedSideProbabilityBps: number;
  marketPriceBps: number;
  yesMarketPriceBps: number;
  edgeBps: number;
  confidenceBps: number;
  suggestedSizeBps: number;
  thesis: string;
  counterarguments: string[];
  evidence: EvidenceItemInput[];
  votes: AgentVote[];
  marketType: "strict_yes_no";
}
