import Link from "next/link";
import { CallCard } from "../../components/call-card";
import { bpsToPercent, friendlySetupError, isExpiredDate } from "../../lib/format";
import { getCalls, getTopSportsPredictions } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function TopFiveTodayPage() {
  let calls: Awaited<ReturnType<typeof getCalls>> = [];
  let sportsCalls: Awaited<ReturnType<typeof getTopSportsPredictions>> = [];
  let setupError = "";

  try {
    calls = (await getCalls(50))
      .filter((call) => call.status === "published" && !call.legacy && !isExpiredDate(call.expiresAt))
      .sort((a, b) => Number(b.edgeBps) + Number(b.confidenceBps) - (Number(a.edgeBps) + Number(a.confidenceBps)))
      .slice(0, 5);
    sportsCalls = await getTopSportsPredictions(5);
  } catch (error) {
    setupError = friendlySetupError(error);
  }

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Daily shortlist</p>
          <h1>Top 5 Today</h1>
        </div>
        <p>Shareable daily shortlist with bonded Arc calls separated from active Sports Live Calls so unresolved sports activity never masquerades as resolved reputation.</p>
      </section>
      {setupError ? (
        <section className="empty">
          <h2>Top 5 data is temporarily unavailable</h2>
          <p className="muted">Precall is waiting for the latest shortlist data to load.</p>
        </section>
      ) : null}
      <section className="section-heading">
        <div><p className="eyebrow">Bonded Arc Calls</p><h2>Top bonded calls</h2></div>
        <p>These are strict YES/NO calls bonded on Arc and resolved through the normal Precall flow.</p>
      </section>
      <section className="grid">
        {calls.length ? calls.map((call) => <CallCard key={call.id} call={call} />) : <p className="muted">No live bonded calls currently pass the hardened V1 gates. Precall would rather show no call than a weak call.</p>}
      </section>

      <section style={{ marginTop: 34 }}>
        <section className="section-heading">
          <div><p className="eyebrow">Sports Live Calls</p><h2>Top Sports Calls</h2></div>
          <p>Top active sports calls are shown separately and remain unresolved until sports settlement is implemented.</p>
        </section>
        <section className="grid preview-grid">
          {sportsCalls.length ? sportsCalls.map((idea) => (
            <article className="panel sports-preview-card" key={idea.id}>
              <p className="eyebrow">{idea.category} · {idea.marketKind} · active/unresolved</p>
              <h3>{idea.marketTitle}</h3>
              <p className="muted">AI Prediction: <strong>{idea.selectedOption}</strong></p>
              <div className="analysis-metric-grid sports-metrics">
                <div><span>Market</span><strong>{bpsToPercent(idea.marketPriceBps)}</strong></div>
                <div><span>AI</span><strong>{bpsToPercent(idea.agentProbabilityBps)}</strong></div>
                <div><span>Edge</span><strong>{bpsToPercent(idea.edgeBps)}</strong></div>
                <div><span>Risk</span><strong>{idea.riskLevel}</strong></div>
              </div>
              <p className="muted">Full reasoning and market link unlock on the Sports Live Calls board.</p>
              <Link className="button secondary" href="/sports">Open Sports Live Calls</Link>
            </article>
          )) : <section className="empty"><h2>No active top sports calls right now</h2><p className="muted">Sports scans may still create Lean or High Risk calls on the Sports Live Calls page.</p></section>}
        </section>
      </section>
    </main>
  );
}
