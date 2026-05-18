import { CallCard } from "../../components/call-card";
import { getCalls } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function TopFiveTodayPage() {
  const calls = (await getCalls(50))
    .sort((a, b) => Number(b.edgeBps) + Number(b.confidenceBps) - (Number(a.edgeBps) + Number(a.confidenceBps)))
    .slice(0, 5);

  return (
    <main className="shell" style={{ padding: "42px 0" }}>
      <h1 style={{ fontSize: 58, lineHeight: 1, marginTop: 0 }}>Top 5 Today</h1>
      <p className="muted">Shareable daily list of the strongest bonded Precall signals.</p>
      <section className="grid">
        {calls.map((call) => <CallCard key={call.id} call={call} />)}
      </section>
    </main>
  );
}
