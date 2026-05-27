import { ShieldCheck, Trophy } from "lucide-react";
import { UnlockSportsCall } from "../../components/unlock-sports-call";
import { bpsToPercent, usdc } from "../../lib/format";
import { getActiveSportsCallCount, getSportsPredictions } from "../../lib/queries";

export const dynamic = "force-dynamic";

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
  if (status === "high_risk_call") return "High Risk";
  if (status === "avoid_call") return "Avoid";
  return status.replace(/_/g, " ");
}

function statusIntro(status: string) {
  if (status === "strong_call") return "Strong Calls";
  if (status === "lean_call") return "Lean Calls";
  if (status === "high_risk_call") return "High Risk Calls";
  return "Avoided Markets";
}

function statusDescription(status: string) {
  if (status === "strong_call") return "Edge, confidence, market spread, and risk are all acceptable.";
  if (status === "lean_call") return "The selected side is clear, but conviction is moderate.";
  if (status === "high_risk_call") return "The model found a side, but evidence, confidence, or market conditions make it risky.";
  return "Valid markets the AI recommends avoiding rather than following.";
}

function previewReason(statusReason: string) {
  return statusReason || "AI selected a side from the supplied market, price, and evidence context. Unlock for the complete reasoning trail.";
}

type SportsIdea = Awaited<ReturnType<typeof getSportsPredictions>>[number];

function SportsCard({ idea }: { idea: SportsIdea }) {
  const x402Status = idea.x402Status as { status?: unknown } | null;
  const paidEvidenceUsed = Boolean(idea.x402PaidEvidenceUsed || x402Status?.status === "success");
  return (
    <article className={`panel sports-call-card sports-status-${idea.status}`}>
      <div className="sports-card-main">
        <div className="card-topline">
          <span className="status-chip ok">{statusLabel(idea.status)}</span>
          <span className="muted">{idea.category} · {idea.marketKind} · {freshness(idea.updatedAt)}</span>
        </div>
        <h2 className="call-title">{idea.marketTitle}</h2>
        <div className="sports-prediction-banner">
          <span>AI Prediction</span>
          <strong>{idea.selectedOption}</strong>
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
        <p className="muted nfa-note">NFA: Sports Live Calls are AI-generated market intelligence, not financial advice. They are not guaranteed outcomes. Always do your own research.</p>
        {paidEvidenceUsed ? <span className="status-chip ok">x402 paid evidence used</span> : null}
      </div>
      <UnlockSportsCall sportsPredictionId={idea.id} unlockPrice={String(idea.unlockPrice)} />
    </article>
  );
}

export default async function SportsPage() {
  let ideas: Awaited<ReturnType<typeof getSportsPredictions>> = [];
  let activeCount = 0;
  let setupError = "";
  try {
    [ideas, activeCount] = await Promise.all([getSportsPredictions(40), getActiveSportsCallCount()]);
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  const grouped = ["strong_call", "lean_call", "high_risk_call", "avoid_call"].map((status) => ({
    status,
    ideas: ideas.filter((idea) => idea.status === status),
  }));

  return (
    <main className="shell page sports-page">
      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">Sports Live Calls</p>
          <h1>AI predictions for active Polymarket sports markets.</h1>
        </div>
        <div className="hero-card">
          <div className="pill-row">
            <span className="pill"><Trophy size={14} /> {activeCount} Active Sports Live Call{activeCount === 1 ? "" : "s"}</span>
            <span className="pill"><ShieldCheck size={14} /> Non-bonded sports intelligence</span>
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="Sports Live Calls summary">
        <div className="metric"><span>Active Sports Live Calls</span><strong>{activeCount}</strong></div>
        <div className="metric"><span>Strong</span><strong>{grouped.find((group) => group.status === "strong_call")?.ideas.length ?? 0}</strong></div>
        <div className="metric"><span>Lean / High Risk</span><strong>{(grouped.find((group) => group.status === "lean_call")?.ideas.length ?? 0) + (grouped.find((group) => group.status === "high_risk_call")?.ideas.length ?? 0)}</strong></div>
        <div className="metric"><span>Unlock rail</span><strong>Arc USDC</strong></div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Today</p>
          <h2>{activeCount} Active Sports Live Call{activeCount === 1 ? "" : "s"}</h2>
        </div>
      </section>

      <section className="panel info-note">
        <p>
          Live calls are AI-generated market intelligence, and not financial advice.
        </p>
      </section>

      {setupError ? (
        <section className="empty"><h2>Sports Live Calls setup required</h2><p className="muted">{setupError}</p></section>
      ) : activeCount === 0 ? (
        <section className="empty">
          <h2>No active Sports Live Calls</h2>
        </section>
      ) : (
        grouped.map((group) => group.ideas.length ? (
          <section key={group.status} className="section-spaced">
            <section className="section-heading">
              <div>
                <p className="eyebrow">{statusLabel(group.status)}</p>
                <h2>{statusIntro(group.status)}</h2>
              </div>
              <p>{statusDescription(group.status)}</p>
            </section>
            <section className="sports-grid">
              {group.ideas.map((idea) => <SportsCard idea={idea} key={idea.id} />)}
            </section>
          </section>
        ) : null)
      )}
    </main>
  );
}
