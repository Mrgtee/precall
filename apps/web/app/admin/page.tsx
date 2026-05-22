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
        <div className="metric"><span>Railway trigger</span><strong><Bool value={data.config.workerTriggerConfigured} /></strong></div>
      </section>

      <section className="metric-strip compact-metrics">
        <div className="metric"><span>Live calls</span><strong>{data.counts?.liveCalls ?? 0}</strong></div>
        <div className="metric"><span>Expired</span><strong>{data.counts?.expiredCalls ?? 0}</strong></div>
        <div className="metric"><span>Resolved</span><strong>{data.counts?.resolvedCalls ?? 0}</strong></div>
        <div className="metric"><span>Unlock volume</span><strong>{usdc(data.counts?.unlockVolume || 0)}</strong></div>
      </section>


      <section className="panel info-split">
        <div>
          <h2>Circle Agent Stack status</h2>
          <p>Gateway x402 enabled <Bool value={data.circleStack.gatewayX402Enabled} /></p>
          <p className="muted">Chain: {data.circleStack.gatewayChain} · Balance status: {data.circleStack.gatewayBalanceStatus}</p>
          <p className="muted">Gateway available: {data.circleStack.gatewayAvailableUsdc ? usdc(data.circleStack.gatewayAvailableUsdc) : "not available"}</p>
          <p className="muted">Worker execution: {data.config.workerTriggerConfigured ? "proxied to Railway" : data.config.scheduledWorkersDisabled ? "disabled on Vercel" : "local Vercel runtime"}</p>
          <p className="muted">Allowed hosts: {data.circleStack.allowedHosts.join(", ") || "none"}</p>
          {data.circleStack.gatewayError ? <p className="muted">Last Gateway error: {data.circleStack.gatewayError}</p> : null}
        </div>
        <aside className="panel info-note">
          <h3>Spend controls</h3>
          <p className="muted">Daily x402 spend: {usdc(data.counts?.dailyX402Spend || 0)} / {usdc(data.circleStack.dailyBudgetUsdc)}</p>
          <p className="muted">Max x402 request: {usdc(data.circleStack.maxPaymentUsdc)}</p>
          <p className="muted">x402 API payments: {data.counts?.x402ApiPayments ?? 0}</p>
          {data.latestX402Payment ? (
            <p className="muted">
              Latest x402: {data.latestX402Payment.provider || "x402"} · {usdc(data.latestX402Payment.amountUsdc || data.latestX402Payment.amount || 0)} · {data.latestX402Payment.status}
              {data.latestX402Payment.error ? ` · ${data.latestX402Payment.error}` : ""}
            </p>
          ) : <p className="muted">Latest x402: none recorded</p>}
          <p className="muted">Arc bond volume: {usdc(data.counts?.bondVolume || 0)}</p>
          <p className="muted">Thesis unlock volume: {usdc(data.counts?.thesisUnlockVolume || data.counts?.unlockVolume || 0)}</p>
        </aside>
      </section>

      <AdminConsole />
    </main>
  );
}
