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

export default async function SportsPage() {
  let ideas: Awaited<ReturnType<typeof getSportsPredictions>> = [];
  let setupError = "";
  try {
    ideas = await getSportsPredictions(20);
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  return (
    <main className="shell page">
      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">Daily Sports Edge</p>
          <h1>Sports ideas from live Polymarket markets.</h1>
        </div>
        <div className="hero-card">
          <p>
            Precall scans daily sports markets separately from bonded calls. These are non-bonded intelligence ideas until sports resolution is generalized, and they are never guarantees.
          </p>
          <div className="pill-row">
            <span className="pill"><Trophy size={14} /> Sports scanner</span>
            <span className="pill"><ShieldCheck size={14} /> No auto-trading</span>
          </div>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Today</p>
          <h2>Latest sports prediction ideas</h2>
        </div>
        <p>Target is 5 strong ideas per day, but weak or unsupported picks are filtered instead of forced.</p>
      </section>

      {setupError ? (
        <section className="empty"><h2>Sports board setup required</h2><p className="muted">{setupError}</p></section>
      ) : ideas.length === 0 ? (
        <section className="empty">
          <h2>No sports ideas have passed the gates yet</h2>
          <p className="muted">Run <code>npm run worker:sports</code> on Railway. If no ideas appear, the worker will show filtered reasons instead of publishing weak picks.</p>
        </section>
      ) : (
        <section className="grid">
          {ideas.map((idea) => (
            <article className="panel" key={idea.id}>
              <p className="eyebrow">{idea.category} · {idea.marketKind} · {freshness(idea.updatedAt)}</p>
              <h2 className="call-title">{idea.marketTitle}</h2>
              <div className="pill-row">
                <span className="pill">Pick: {idea.selectedOption}</span>
                <span className="pill">Market {bpsToPercent(idea.marketPriceBps)}</span>
                <span className="pill">Agent {bpsToPercent(idea.agentProbabilityBps)}</span>
                <span className="pill">Edge {bpsToPercent(idea.edgeBps)}</span>
                <span className="pill">Risk {idea.riskLevel}</span>
              </div>
              <p className="muted"><strong>Why it looks stronger:</strong> {idea.rationale}</p>
              <p className="muted"><strong>Context:</strong> {idea.matchupContext}</p>
              <p className="muted"><strong>Market movement:</strong> {idea.marketMovement}</p>
              {idea.risks.length ? <p className="muted"><strong>Risks:</strong> {idea.risks.join("; ")}</p> : null}
              <p><strong>Verdict:</strong> {idea.verdict}</p>
              <Link href={idea.marketUrl} target="_blank">Open Polymarket <ExternalLink size={14} /></Link>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
