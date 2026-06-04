import Link from "next/link";
import { Activity, CircleDollarSign, ExternalLink, RadioTower, ShieldCheck } from "lucide-react";
import { shortAddress, usdc } from "../../lib/format";
import { getDemoData } from "../../lib/queries";

export const dynamic = "force-dynamic";

function Bool({ value }: { value: boolean }) {
  return <span className={`status-chip ${value ? "ok" : "warn"}`}>{value ? "true" : "false"}</span>;
}

export default async function DemoPage() {
  let data: Awaited<ReturnType<typeof getDemoData>> | null = null;

  try {
    data = await getDemoData();
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <main className="shell page info-page">
        <section className="page-hero">
          <div>
            <p className="eyebrow">Judge demo</p>
            <h1>Precall in 60 seconds</h1>
          </div>
          <p>Live proof loads from the platform database when available. The public app stays readable even while data is temporarily unavailable.</p>
        </section>
        <section className="empty">
          <h2>Demo data is temporarily unavailable</h2>
          <p className="muted">Precall is waiting for the latest platform data to load.</p>
        </section>
      </main>
    );
  }

  const call = data.latestLiveCall;
  const latestRun = data.latestRuns[0];
  const latestUnlock = data.latestUnlock;

  return (
    <main className="shell page info-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Judge demo</p>
          <h1>Precall in 60 seconds</h1>
        </div>
        <p>Live proof that Precall separates bonded Arc calls, Sports Live Calls, x402 evidence, and unlock rails without faking data. Empty states are shown honestly.</p>
      </section>

      <section className="metric-strip">
        <div className="metric"><span><RadioTower size={14} /> Calls</span><strong>{data.counts?.calls ?? 0}</strong></div>
        <div className="metric"><span><ShieldCheck size={14} /> Live</span><strong>{data.counts?.liveCalls ?? 0}</strong></div>
        <div className="metric"><span><CircleDollarSign size={14} /> Total unlocks</span><strong>{data.counts?.unlocks ?? 0}</strong></div>
        <div className="metric"><span><Activity size={14} /> Active sports</span><strong>{data.counts?.activeSportsCalls ?? 0}</strong></div>
      </section>

      <section className="info-grid">
        <article className="panel info-card"><h2>System status</h2><p>DB <Bool value={data.config.database} /></p><p>Model <Bool value={data.config.model} /></p><p>Arc registry <Bool value={data.config.registry} /></p><p>Railway trigger <Bool value={data.config.workerTriggerConfigured} /></p></article>
        <article className="panel info-card"><h2>Circle stack</h2><p>Gateway x402 <Bool value={data.circleStack.gatewayX402Enabled} /></p><p>Network: {data.circleStack.x402PaymentNetworkLabel || data.circleStack.gatewayChain}</p><p>Gateway balance: {data.circleStack.gatewayAvailableUsdc ? usdc(data.circleStack.gatewayAvailableUsdc) : "not available"}</p><p>Daily spend: {usdc(data.counts?.x402Spend || 0)} / {usdc(data.circleStack.dailyBudgetUsdc)}</p></article>
        <article className="panel info-card"><h2>Resolution</h2><p>Resolved bonded calls: {data.counts?.resolvedCalls ?? 0}</p><p>Awaiting bonded: {data.awaitingResolution.length}</p><p>Expired sports: {data.counts?.expiredSportsCalls ?? 0}</p><p className="muted">Sports calls are expiry-safe but not selected-outcome resolved yet.</p></article>
        <article className="panel info-card"><h2>Latest run</h2><p>Status: {latestRun?.status || "none"}</p><p>Model: {latestRun?.model || "none"}</p><p>{latestRun?.failure ? "Failure recorded" : "No latest failure"}</p></article>
      </section>


      <section className="panel info-split">
        <div>
          <h2>Circle Agent Stack proof</h2>
          {data.latestX402Payment ? (
            <div className="pill-row">
              <span className="pill">Successful payment</span>
              <span className="pill">Cost {usdc(data.latestX402Payment.amountUsdc || data.latestX402Payment.amount || 0)}</span>
              <span className="pill">Network {data.circleStack.x402PaymentNetworkLabel || data.latestX402Payment.chain || data.circleStack.latestX402SelectedChain || "network unknown"}</span>
              <span className="pill">Source {data.latestX402Payment.provider || "x402 provider"}</span>
            </div>
          ) : (
            <p className="muted">No successful x402 payment recorded yet.</p>
          )}
        </div>
        <aside className="panel info-note">
          <h3>Latest paid evidence</h3>
          {data.latestX402Payment ? <p>success · {usdc(data.latestX402Payment.amountUsdc || data.latestX402Payment.amount || 0)} · {data.circleStack.x402PaymentNetworkLabel || data.latestX402Payment.chain || data.circleStack.latestX402SelectedChain || "network unknown"} · {data.latestX402Payment.provider || "x402 provider"}</p> : <p className="muted">No successful x402 payment recorded yet.</p>}
          <h3>Latest Arc bond</h3>
          {data.latestArcBond?.txHash ? <p>{usdc(data.latestArcBond.amountUsdc || data.latestArcBond.amount)} <Link href={`https://testnet.arcscan.app/tx/${data.latestArcBond.txHash}`} target="_blank">tx <ExternalLink size={14} /></Link></p> : <p className="muted">No Arc bond action recorded yet.</p>}
          <h3>Latest thesis unlock</h3>
          {data.latestThesisUnlock?.txHash ? <p>{usdc(data.latestThesisUnlock.amountUsdc || data.latestThesisUnlock.amount)} <Link href={`https://testnet.arcscan.app/tx/${data.latestThesisUnlock.txHash}`} target="_blank">tx <ExternalLink size={14} /></Link></p> : <p className="muted">No thesis unlock action recorded yet.</p>}
        </aside>
      </section>

      <section className="panel info-split">
        <div>
          <h2>Latest live bonded call</h2>
          {call ? (
            <>
              <p className="eyebrow">{call.marketTitle}</p>
              <div className="pill-row">
                <span className="pill">Category {call.marketType}</span>
                <span className="pill">Bonded on Arc</span>
                <span className="pill">Unlock {usdc(call.unlockPrice)}</span>
              </div>
              <p className="muted">Pick direction, probability, edge, thesis, evidence, and Polymarket link stay locked until a user pays the USDC unlock fee.</p>
              {call.txHash ? <Link href={`https://testnet.arcscan.app/tx/${call.txHash}`} target="_blank">Arc tx <ExternalLink size={14} /></Link> : null}
            </>
          ) : <p className="muted">No current live call passes hardened V1 filters. Run the worker from admin or cron.</p>}
        </div>
        <aside className="panel info-note">
          <h3>Latest bonded thesis unlock</h3>
          {latestUnlock ? <p>{shortAddress(latestUnlock.userWallet)} paid {usdc(latestUnlock.amount)} <Link href={`https://testnet.arcscan.app/tx/${latestUnlock.txHash}`} target="_blank">tx <ExternalLink size={14} /></Link></p> : <p className="muted">No bonded thesis unlock recorded yet.</p>}
          <h3>Circle-powered rails</h3>
          <p className="muted">Agent bonds, bonded thesis unlocks, sports unlocks, and optional x402 evidence payments are tracked as Circle actions when real events exist.</p>
        </aside>
      </section>

      <section className="panel">
        <h2>Latest Sports Live Calls</h2>
        {data.latestSportsIdeas?.length ? (
          <div className="grid">
            {data.latestSportsIdeas.map((idea) => (
              <article className="panel" key={idea.id}>
                <p className="eyebrow">{idea.category} · {idea.marketKind}</p>
                <strong>{idea.marketTitle}</strong>
                <p className="muted">AI Prediction {idea.selectedOption} · Risk {idea.riskLevel}</p>
                <p className="muted">Full sports reasoning and market link unlock with Arc USDC.</p>
              </article>
            ))}
          </div>
        ) : <p className="muted">No Sports Live Calls stored yet. Run Sports Scan from Admin or Railway.</p>}
      </section>

      <section className="panel">
        <h2>60-second demo script</h2>
        <ol className="step-list">
          <li>Open Admin and run health to show DB, Polymarket, model, Arc, and Circle status.</li>
          <li>Run the agent. It either publishes a bonded call or explains filtered skip reasons.</li>
          <li>Open a live call and inspect the public market title, Arc bond status, unlock price, freshness, and bond transaction.</li>
          <li>Unlock the thesis with USDC on Arc to reveal the selected side, evidence, risk notes, and analysis, then refresh this page to show the unlock.</li>
          <li>Run resolution for mature YES/NO markets and show leaderboard reputation updates.</li>
          <li>Open Sports Live Calls to show active count, locked preview, and Arc USDC unlock flow.</li>
        </ol>
      </section>
    </main>
  );
}
