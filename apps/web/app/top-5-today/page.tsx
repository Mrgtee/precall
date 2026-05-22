import { CallCard } from "../../components/call-card";
import { getCalls } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function TopFiveTodayPage() {
  const calls = (await getCalls(50))
    .filter((call) => call.status === "published" && !call.legacy)
    .sort((a, b) => Number(b.edgeBps) + Number(b.confidenceBps) - (Number(a.edgeBps) + Number(a.confidenceBps)))
    .slice(0, 5);

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Daily shortlist</p>
          <h1>Top 5 Today</h1>
        </div>
        <p>Shareable daily list of the strongest bonded Precall signals, sorted by edge and confidence.</p>
      </section>
      <section className="grid">
        {calls.length ? calls.map((call) => <CallCard key={call.id} call={call} />) : <p className="muted">No live calls currently pass the hardened V1 gates. Precall would rather show no call than a weak call.</p>}
      </section>
    </main>
  );
}
