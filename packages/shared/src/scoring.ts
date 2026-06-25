import { keccak256, stringToBytes } from "viem";
import type { AgentVote, AggregatedCall, CallAction, EvidenceItemInput, MarketSnapshot, PolymarketMarket } from "./types";

const AGENT_WEIGHTS: Record<string, number> = {
  TacticsScout: 1.15,
  StatsEngine: 1.10,
  SquadDesk: 1.00,
  ContextScout: 0.95,
  Skeptic: 0.85,
};

export type PublishThresholds = {
  minLiquidityUsd: number;
  minEdgeBps: number;
  maxSpreadBps: number;
  minConfidenceBps: number;
  minSuggestedSizeBps?: number;
};

export function clampBps(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

export function selectedSideProbabilityBps(action: CallAction, yesProbabilityBps: number) {
  if (action === "BUY_NO") return 10_000 - clampBps(yesProbabilityBps);
  return clampBps(yesProbabilityBps);
}

export function selectedMarketPriceBps(action: CallAction, yesMarketPriceBps: number) {
  if (action === "BUY_NO") return 10_000 - clampBps(yesMarketPriceBps);
  return clampBps(yesMarketPriceBps);
}

export function calculateEdgeBps(action: CallAction, yesProbabilityBps: number, yesMarketPriceBps: number) {
  if (action === "BUY_NO") return clampBps(yesMarketPriceBps - yesProbabilityBps);
  if (action === "BUY_YES") return clampBps(yesProbabilityBps - yesMarketPriceBps);
  return 0;
}

export function suggestedSizeBps(edgeBps: number, confidenceBps: number): number {
  const confidence = confidenceBps / 10_000;
  const edge = edgeBps / 10_000;
  const rawKelly = edge * confidence * 0.5;
  return clampBps(Math.min(rawKelly, 0.035) * 10_000);
}

export function brierScoreBps(yesProbabilityBps: number, outcomeYes: boolean): number {
  const p = yesProbabilityBps / 10_000;
  const y = outcomeYes ? 1 : 0;
  return clampBps((p - y) ** 2 * 10_000);
}

export function hashText(value: string): `0x${string}` {
  return keccak256(stringToBytes(value));
}

export function aggregateVotes(
  market: PolymarketMarket,
  snapshot: MarketSnapshot,
  votes: AgentVote[],
  evidence: EvidenceItemInput[] = [],
): AggregatedCall {
  if (votes.length === 0) throw new Error("Cannot aggregate without agent votes.");
  if (!votes.some((vote) => vote.agent === "Skeptic")) throw new Error("Skeptic vote is required before publishing.");
  if (votes.length < 4) throw new Error("At least four valid agent votes are required before publishing.");

  let weightedProbability = 0;
  let weightedConfidence = 0;
  let totalWeight = 0;

  for (const vote of votes) {
    const weight = (AGENT_WEIGHTS[vote.agent] || 1) * Math.max(0.2, vote.confidenceBps / 10_000);
    weightedProbability += vote.yesProbabilityBps * weight;
    weightedConfidence += vote.confidenceBps * weight;
    totalWeight += weight;
  }

  const yesProbabilityBps = clampBps(weightedProbability / totalWeight);
  const confidenceBps = clampBps(weightedConfidence / totalWeight);
  const yesEdge = yesProbabilityBps - snapshot.yesPriceBps;
  const noEdge = snapshot.yesPriceBps - yesProbabilityBps;
  const action: CallAction = yesEdge > noEdge && yesEdge > 0 ? "BUY_YES" : noEdge > 0 ? "BUY_NO" : "WATCH";
  const marketPriceBps = selectedMarketPriceBps(action, snapshot.yesPriceBps);
  const edgeBps = calculateEdgeBps(action, yesProbabilityBps, snapshot.yesPriceBps);
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const usedEvidence = votes
    .flatMap((vote) => vote.evidenceIds)
    .map((id) => evidenceById.get(id))
    .filter((item): item is EvidenceItemInput => Boolean(item));
  const uniqueEvidence = Array.from(new Map((usedEvidence.length ? usedEvidence : evidence).map((item) => [item.evidenceId, item])).values()).slice(0, 10);
  const counterarguments = votes.find((vote) => vote.agent === "Skeptic")?.risks || [];
  const thesis = votes
    .filter((vote) => vote.agent !== "Skeptic")
    .map((vote) => `${vote.agent}: ${vote.thesis}`)
    .join("\n\n");

  return {
    market,
    snapshot,
    action,
    yesProbabilityBps,
    selectedSideProbabilityBps: selectedSideProbabilityBps(action, yesProbabilityBps),
    marketPriceBps,
    yesMarketPriceBps: snapshot.yesPriceBps,
    edgeBps,
    confidenceBps,
    suggestedSizeBps: suggestedSizeBps(edgeBps, confidenceBps),
    thesis,
    counterarguments,
    evidence: uniqueEvidence,
    votes,
    marketType: "strict_yes_no",
    selectedOutcomeIndex: action === "BUY_NO" ? 1 : 0,
  };
}

export function publishThresholdFailures(call: AggregatedCall, thresholds: PublishThresholds): string[] {
  const failures: string[] = [];
  if (call.action === "WATCH") failures.push("watch_action");
  if (call.market.liquidityUsd < thresholds.minLiquidityUsd) failures.push("low_liquidity");
  if (call.edgeBps < thresholds.minEdgeBps) failures.push("low_edge");
  if (call.snapshot.spreadBps > thresholds.maxSpreadBps) failures.push("wide_spread");
  if (call.confidenceBps < thresholds.minConfidenceBps) failures.push("low_confidence");
  if (call.suggestedSizeBps < (thresholds.minSuggestedSizeBps ?? 0)) failures.push("tiny_size");
  if (!call.market.closeTime || new Date(call.market.closeTime).getTime() < Date.now()) failures.push("expired");
  return failures;
}

export function passesPublishThresholds(call: AggregatedCall, thresholds: PublishThresholds): boolean {
  return publishThresholdFailures(call, thresholds).length === 0;
}
