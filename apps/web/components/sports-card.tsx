"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { UnlockSportsCall } from "./unlock-sports-call";
import { bpsToPercent, usdc } from "../lib/format";
import type { getMarketplaceSportsPredictions } from "../lib/marketplace";

function freshness(date: Date | string | null) {
  if (!date) return "unknown";
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m old`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function statusLabel(status: string) {
  if (status === "strong_call") return "Strong";
  if (status === "lean_call") return "Lean";
  return "High Risk";
}

function previewReason(statusReason: string) {
  return statusReason || "AI selected a side from the supplied market, price, and evidence context. Unlock for the complete reasoning trail.";
}

export type SportsIdea = Awaited<ReturnType<typeof getMarketplaceSportsPredictions>>[number];

export function SportsCard({ idea }: { idea: SportsIdea }) {
  const { address, isConnected } = useAccount();
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    if (isConnected && address) {
      fetch(`/api/sports/${idea.id}/analysis?wallet=${address}`)
        .then((res) => {
          if (res.ok) {
            setIsUnlocked(true);
          } else {
            setIsUnlocked(false);
          }
        })
        .catch(() => setIsUnlocked(false));
    } else {
      setIsUnlocked(false);
    }
  }, [address, isConnected, idea.id]);

  const x402Status = idea.x402Status as { status?: unknown } | null;
  const paidEvidenceUsed = Boolean(idea.x402PaidEvidenceUsed || x402Status?.status === "success");

  return (
    <article id={`sports-call-${idea.id}`} className={`panel sports-call-card sports-status-${idea.status}`}>
      <div className="sports-card-main">
        <div className="card-topline">
          <span className="status-chip ok">{statusLabel(idea.status)}</span>
          <span className="muted">{idea.category} · {idea.marketKind} · {freshness(idea.updatedAt)}</span>
        </div>
        <h2 className="call-title">{idea.marketTitle}</h2>
        <p className="muted">By <Link href={`/agents/${idea.agentId}`}><strong>{idea.agentName}</strong></Link>{idea.agentTagline ? ` · ${idea.agentTagline}` : ""}</p>
        <div className="sports-prediction-banner">
          <span>AI Prediction</span>
          <strong>{isUnlocked ? idea.selectedOption : "Locked (Unlock to reveal)"}</strong>
        </div>
        <div className="analysis-metric-grid sports-metrics" aria-label="Sports Live Call public metrics">
          <div><span>Market price</span><strong>{bpsToPercent(idea.marketPriceBps)}</strong></div>
          <div><span>AI probability</span><strong>{bpsToPercent(idea.agentProbabilityBps)}</strong></div>
          <div><span>Edge</span><strong>{bpsToPercent(idea.edgeBps)}</strong></div>
          <div><span>Confidence</span><strong>{bpsToPercent(idea.confidenceBps)}</strong></div>
          <div><span>Risk</span><strong>{idea.riskLevel}</strong></div>
          <div><span>Unlock</span><strong>{usdc(idea.unlockPrice)}</strong></div>
        </div>
        <p className="muted"><strong>Short reasoning preview:</strong> {previewReason(idea.statusReason)}</p>
        <p className="muted">Full reasoning, evidence, market link, probability breakdown, and risk notes unlock with Arc USDC.</p>
        <p className="muted nfa-note">NFA: Live calls are AI-generated market intelligence, and not financial advice.</p>
        <div className="pill-row">
          <span className="pill">{idea.agentReviewStatus || "pending_review"}</span>
          {paidEvidenceUsed ? <span className="status-chip ok">x402 paid evidence used</span> : null}
        </div>
      </div>
      <UnlockSportsCall 
        sportsPredictionId={idea.id} 
        unlockPrice={String(idea.unlockPrice)} 
        onUnlockSuccess={() => setIsUnlocked(true)}
      />
    </article>
  );
}
