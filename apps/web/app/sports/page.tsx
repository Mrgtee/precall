import Link from "next/link";
import { ExternalLink, ShieldCheck, Trophy } from "lucide-react";
import { bpsToPercent } from "../../lib/format";
import { getSportsPredictions } from "../../lib/queries";

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

type SportsIdea = Awaited<ReturnType<typeof getSportsPredictions>>[number];

function SportsCard({ idea }: { idea: SportsIdea }) {
  const x402Status = idea.x402Status as { status?: unknown } | null;
  const paidEvidenceUsed = Boolean(idea.x402PaidEvidenceUsed || x402Status?.status === "success");
  return (
    <article className="panel">
      <p className="eyebrow">{statusLabel(idea.status)} · {idea.category} · {idea.marketKind} · {freshness(idea.updatedAt)}</p>
      <h2 className="call-title">{idea.marketTitle}</h2>
      <div className="pill-row">
        <span className="pill">AI Prediction: {idea.selectedOption}</span>
        <span className="pill">Market {bpsToPercent(idea.marketPriceBps)}</span>
        <span className="pill">AI {bpsToPercent(idea.agentProbabilityBps)}</span>
        <span className="pill">Edge {bpsToPercent(idea.edgeBps)}</span>
        <span className="pill">Confidence {bpsToPercent(idea.confidenceBps)}</span>
        <span className="pill">Risk {idea.riskLevel}</span>
        {paidEvidenceUsed ? <span className="pill">x402 evidence</span> : null}
      </div>
      <p className="muted"><strong>Short reasoning:</strong> {idea.reasoning || idea.rationale}</p>
      <p className="muted"><strong>Context:</strong> {idea.matchupContext}</p>
      <p className="muted"><strong>Market movement:</strong> {idea.marketMovement}</p>
      {idea.risks.length ? <p className="muted"><strong>Risks:</strong> {idea.risks.join("; ")}</p> : null}
      <p><strong>Verdict:</strong> {idea.verdict}</p>
      <p className="muted">NFA: Sports Live Calls are AI-generated market intelligence, not financial advice. They are not guaranteed outcomes. Always do your own research.</p>
      <Link href={idea.marketUrl} target="_blank">Open Polymarket <ExternalLink size={14} /></Link>
    </article>
  );
}

export default async function SportsPage() {
  let ideas: Awaited<ReturnType<typeof getSportsPredictions>> = [];
  let setupError = "";
  try {
    ideas = await getSportsPredictions(40);
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  const grouped = ["strong_call", "lean_call", "high_risk_call", "avoid_call"].map((status) => ({
    status,
    ideas: ideas.filter((idea) => idea.status === status),
  }));

  return (
    <main className="shell page">
      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">Sports Live Calls</p>
          <h1>AI predictions for live Polymarket sports markets.</h1>
        </div>
        <div className="hero-card">
          <p>
            Precall scans sports markets separately from Arc-bonded calls. These Sports Live Calls are non-bonded market intelligence until selected-outcome resolution is generalized.
          </p>
          <div className="pill-row">
            <span className="pill"><Trophy size={14} /> Sports scanner</span>
            <span className="pill"><ShieldCheck size={14} /> Not Arc-bonded yet</span>
          </div>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Today</p>
          <h2>Sports Live Calls</h2>
        </div>
        <p>Valid analyzed markets are saved as Strong, Lean, High Risk, or Avoid calls. Confidence changes the label, not whether the analysis exists.</p>
      </section>

      <section className="panel info-note">
        <p>
          Sports Live Calls are AI-generated market intelligence, not financial advice. They are not guaranteed outcomes. Always do your own research.
        </p>
      </section>

      {setupError ? (
        <section className="empty"><h2>Sports Live Calls setup required</h2><p className="muted">{setupError}</p></section>
      ) : ideas.length === 0 ? (
        <section className="empty">
          <h2>No Sports Live Calls stored yet</h2>
          <p className="muted">Run <code>npm run worker:sports</code> on Railway. Invalid or unclear markets will still be skipped with transparent reasons.</p>
        </section>
      ) : (
        grouped.map((group) => group.ideas.length ? (
          <section key={group.status} style={{ marginTop: 34 }}>
            <section className="section-heading">
              <div>
                <p className="eyebrow">{statusLabel(group.status)}</p>
                <h2>{statusIntro(group.status)}</h2>
              </div>
              <p>{statusDescription(group.status)}</p>
            </section>
            <section className="grid">
              {group.ideas.map((idea) => <SportsCard idea={idea} key={idea.id} />)}
            </section>
          </section>
        ) : null)
      )}
    </main>
  );
}
