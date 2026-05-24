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
    ideas = await getSportsPredictions(20, ["active", "watchlist"]);
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  const strongIdeas = ideas.filter((idea) => idea.status === "active");
  const watchlistIdeas = ideas.filter((idea) => idea.status === "watchlist");

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
          <h2>No sports ideas or watchlist items yet</h2>
          <p className="muted">Run <code>npm run worker:sports</code> on Railway. Strong ideas must still pass quality gates; filtered analysis can appear as a clearly labeled watchlist.</p>
        </section>
      ) : (
        <>
          {strongIdeas.length > 0 ? (
            <section className="grid">
              {strongIdeas.map((idea) => (
                <article className="panel" key={idea.id}>
                  <p className="eyebrow">Strong idea · {idea.category} · {idea.marketKind} · {freshness(idea.updatedAt)}</p>
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
          ) : (
            <section className="empty">
              <h2>No strong sports ideas passed all gates yet</h2>
              <p className="muted">The scanner found and analyzed sports markets, but it did not promote weak edges as strong recommendations.</p>
            </section>
          )}

          {watchlistIdeas.length > 0 ? (
            <>
              <section className="section-heading" style={{ marginTop: 34 }}>
                <div>
                  <p className="eyebrow">Watchlist</p>
                  <h2>Filtered sports analysis</h2>
                </div>
                <p>These are useful market reads, not strong ideas. They failed one or more quality gates and should be treated as observation-only.</p>
              </section>
              <section className="grid">
                {watchlistIdeas.map((idea) => (
                  <article className="panel" key={idea.id}>
                    <p className="eyebrow">Watchlist · {idea.category} · {idea.marketKind} · {freshness(idea.updatedAt)}</p>
                    <h2 className="call-title">{idea.marketTitle}</h2>
                    <div className="pill-row">
                      <span className="pill">Lean: {idea.selectedOption}</span>
                      <span className="pill">Market {bpsToPercent(idea.marketPriceBps)}</span>
                      <span className="pill">Agent {bpsToPercent(idea.agentProbabilityBps)}</span>
                      <span className="pill">Edge {bpsToPercent(idea.edgeBps)}</span>
                      <span className="pill">Risk {idea.riskLevel}</span>
                    </div>
                    <p className="muted"><strong>Why it stayed watchlist:</strong> {idea.statusReason}</p>
                    <p className="muted"><strong>Analysis:</strong> {idea.rationale}</p>
                    <p className="muted"><strong>Context:</strong> {idea.matchupContext}</p>
                    <p><strong>Verdict:</strong> Observation-only. Not a guaranteed pick and not promoted as a strong Sports Edge idea.</p>
                    <Link href={idea.marketUrl} target="_blank">Open Polymarket <ExternalLink size={14} /></Link>
                  </article>
                ))}
              </section>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
