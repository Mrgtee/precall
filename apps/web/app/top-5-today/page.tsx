import Link from "next/link";
import { CallCard } from "../../components/call-card";
import { bpsToPercent } from "../../lib/format";
import { getCalls, getStrongSportsPredictions } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function TopFiveTodayPage() {
  const calls = (await getCalls(50))
    .filter((call) => call.status === "published" && !call.legacy)
    .sort((a, b) => Number(b.edgeBps) + Number(b.confidenceBps) - (Number(a.edgeBps) + Number(a.confidenceBps)))
    .slice(0, 5);
  const sportsCalls = await getStrongSportsPredictions(5);

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Daily shortlist</p>
          <h1>Top 5 Today</h1>
        </div>
        <p>Shareable daily list of the strongest bonded Precall signals, plus a separate Sports Live Calls shortlist when active sports edges exist.</p>
      </section>
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
          <p>Strong active sports calls are shown separately and remain unresolved until sports settlement is implemented.</p>
        </section>
        <section className="grid">
          {sportsCalls.length ? sportsCalls.map((idea) => (
            <article className="panel" key={idea.id}>
              <p className="eyebrow">{idea.category} · {idea.marketKind}</p>
              <h3>{idea.marketTitle}</h3>
              <p className="muted">AI Prediction: <strong>{idea.selectedOption}</strong></p>
              <div className="pill-row">
                <span className="pill">Market {bpsToPercent(idea.marketPriceBps)}</span>
                <span className="pill">AI {bpsToPercent(idea.agentProbabilityBps)}</span>
                <span className="pill">Edge {bpsToPercent(idea.edgeBps)}</span>
                <span className="pill">Risk {idea.riskLevel}</span>
              </div>
              <p className="muted">Full reasoning unlocks on the Sports Live Calls board.</p>
              <Link className="button secondary" href="/sports">Open Sports Live Calls</Link>
            </article>
          )) : <p className="muted">No active strong sports calls right now.</p>}
        </section>
      </section>
    </main>
  );
}
