import { keccak256, stringToBytes } from "viem";
import type { AgentVote, AggregatedCall, CallAction, MarketSnapshot, PolymarketMarket } from "./types";

const AGENT_WEIGHTS: Record<string, number> = {
  MacroScout: 1.05,
  NewsHawk: 1,
  CrowdPulse: 0.9,
  BookWatcher: 1.15,
  Skeptic: 0.85,
};

export function clampBps(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

export function calculateEdgeBps(action: CallAction, probabilityBps: number, marketPriceBps: number) {
  if (action === "BUY_NO") return clampBps(10_000 - probabilityBps - (10_000 - marketPriceBps));
  if (action === "BUY_YES") return clampBps(probabilityBps - marketPriceBps);
  return 0;
}

export function suggestedSizeBps(edgeBps: number, confidenceBps: number): number {
  const confidence = confidenceBps / 10_000;
  const edge = edgeBps / 10_000;
  const rawKelly = edge * confidence * 0.5;
  return clampBps(Math.min(rawKelly, 0.035) * 10_000);
}

export function brierScoreBps(probabilityBps: number, outcomeYes: boolean): number {
  const p = probabilityBps / 10_000;
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
): AggregatedCall {
  if (votes.length === 0) throw new Error("Cannot aggregate without agent votes.");

  let weightedProbability = 0;
  let weightedConfidence = 0;
  let totalWeight = 0;

  for (const vote of votes) {
    const weight = (AGENT_WEIGHTS[vote.agent] || 1) * Math.max(0.2, vote.confidenceBps / 10_000);
    weightedProbability += vote.probabilityBps * weight;
    weightedConfidence += vote.confidenceBps * weight;
    totalWeight += weight;
  }

  const agentProbabilityBps = clampBps(weightedProbability / totalWeight);
  const confidenceBps = clampBps(weightedConfidence / totalWeight);
  const yesEdge = agentProbabilityBps - snapshot.yesPriceBps;
  const noEdge = snapshot.yesPriceBps - agentProbabilityBps;
  const action: CallAction = yesEdge > noEdge && yesEdge > 0 ? "BUY_YES" : noEdge > 0 ? "BUY_NO" : "WATCH";
  const marketPriceBps = action === "BUY_NO" ? 10_000 - snapshot.yesPriceBps : snapshot.yesPriceBps;
  const edgeBps = calculateEdgeBps(action, agentProbabilityBps, snapshot.yesPriceBps);
  const evidence = votes.flatMap((vote) => vote.evidence).slice(0, 8);
  const counterarguments = votes.find((vote) => vote.agent === "Skeptic")?.risks || [];
  const thesis = votes
    .filter((vote) => vote.agent !== "Skeptic")
    .map((vote) => `${vote.agent}: ${vote.thesis}`)
    .join("\n\n");

  return {
    market,
    snapshot,
    action,
    agentProbabilityBps,
    marketPriceBps,
    edgeBps,
    confidenceBps,
    suggestedSizeBps: suggestedSizeBps(edgeBps, confidenceBps),
    thesis,
    counterarguments,
    evidence,
    votes,
  };
}

export function passesPublishThresholds(call: AggregatedCall, thresholds: {
  minLiquidityUsd: number;
  minEdgeBps: number;
  maxSpreadBps: number;
  minConfidenceBps: number;
}): boolean {
  if (call.action === "WATCH") return false;
  if (call.market.liquidityUsd < thresholds.minLiquidityUsd) return false;
  if (call.edgeBps < thresholds.minEdgeBps) return false;
  if (call.snapshot.spreadBps > thresholds.maxSpreadBps) return false;
  if (call.confidenceBps < thresholds.minConfidenceBps) return false;
  if (call.market.closeTime && new Date(call.market.closeTime).getTime() < Date.now()) return false;
  return true;
}
