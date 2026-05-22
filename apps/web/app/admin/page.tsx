import { AdminConsole } from "../../components/admin-console";
import { usdc } from "../../lib/format";
import { getDemoData } from "../../lib/queries";

export const dynamic = "force-dynamic";

function Bool({ value }: { value: boolean }) {
  return <span className={`status-chip ${value ? "ok" : "warn"}`}>{value ? "true" : "false"}</span>;
}

export default async function AdminPage() {
  const data = await getDemoData();

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Operator console</p>
          <h1>Admin arena</h1>
        </div>
        <p>
          Operate live Precall agents from a whitelisted wallet. Actions are signed in your wallet and executed server-side with production secrets.
        </p>
      </section>

      <section className="metric-strip">
        <div className="metric"><span>DB</span><strong><Bool value={data.config.database} /></strong></div>
        <div className="metric"><span>Model</span><strong><Bool value={data.config.model} /></strong></div>
        <div className="metric"><span>Arc registry</span><strong><Bool value={data.config.registry} /></strong></div>
        <div className="metric"><span>x402</span><strong><Bool value={data.config.circleEnrichment} /></strong></div>
      </section>

      <section className="metric-strip compact-metrics">
        <div className="metric"><span>Live calls</span><strong>{data.counts?.liveCalls ?? 0}</strong></div>
        <div className="metric"><span>Expired</span><strong>{data.counts?.expiredCalls ?? 0}</strong></div>
        <div className="metric"><span>Resolved</span><strong>{data.counts?.resolvedCalls ?? 0}</strong></div>
        <div className="metric"><span>Unlock volume</span><strong>{usdc(data.counts?.unlockVolume || 0)}</strong></div>
      </section>

      <AdminConsole />
    </main>
  );
}
