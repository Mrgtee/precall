import Link from "next/link";
import { Activity, CircleDollarSign, ExternalLink, RadioTower, ShieldCheck } from "lucide-react";
import { bpsToPercent, outcomeForAction, selectedProbabilityForAction, shortAddress, usdc } from "../../lib/format";
import { getDemoData } from "../../lib/queries";

export const dynamic = "force-dynamic";

function Bool({ value }: { value: boolean }) {
  return <span className={`status-chip ${value ? "ok" : "warn"}`}>{value ? "true" : "false"}</span>;
}

export default async function DemoPage() {
  const data = await getDemoData();
  const call = data.latestLiveCall;
  const latestRun = data.latestRuns[0];
  const latestUnlock = data.latestUnlock;
  const selectedProbability = call ? selectedProbabilityForAction(call.action, call.yesProbabilityBps || call.agentProbabilityBps) : 0;
  const outcome = call ? outcomeForAction(call.action, call.outcomes) : "YES";

  return (
    <main className="shell page info-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Judge demo</p>
          <h1>Precall proof loop</h1>
        </div>
        <p>Everything on this page is pulled from real config, database rows, Arc transactions, and worker history. Empty states are shown honestly.</p>
      </section>

      <section className="metric-strip">
        <div className="metric"><span><RadioTower size={14} /> Calls</span><strong>{data.counts?.calls ?? 0}</strong></div>
        <div className="metric"><span><ShieldCheck size={14} /> Live</span><strong>{data.counts?.liveCalls ?? 0}</strong></div>
        <div className="metric"><span><CircleDollarSign size={14} /> Unlocks</span><strong>{data.counts?.unlocks ?? 0}</strong></div>
        <div className="metric"><span><Activity size={14} /> Circle actions</span><strong>{data.counts?.circleActions ?? 0}</strong></div>
      </section>

      <section className="info-grid">
        <article className="panel info-card"><h2>System status</h2><p>DB <Bool value={data.config.database} /></p><p>Model <Bool value={data.config.model} /></p><p>Arc registry <Bool value={data.config.registry} /></p></article>
        <article className="panel info-card"><h2>Circle stack</h2><p>x402 enrichment <Bool value={data.config.circleEnrichment} /></p><p>Circle wallet <Bool value={data.config.circleWallet} /></p><p>Unlock volume {usdc(data.counts?.unlockVolume || 0)}</p></article>
        <article className="panel info-card"><h2>Resolution</h2><p>Resolved calls: {data.counts?.resolvedCalls ?? 0}</p><p>Awaiting: {data.awaitingResolution.length}</p><p className="muted">Reputation activates after resolved markets.</p></article>
        <article className="panel info-card"><h2>Latest run</h2><p>Status: {latestRun?.status || "none"}</p><p>Model: {latestRun?.model || "none"}</p><p>{latestRun?.failure ? "Failure recorded" : "No latest failure"}</p></article>
      </section>

      <section className="panel info-split">
        <div>
          <h2>Latest live call</h2>
          {call ? (
            <>
              <p className="eyebrow">{call.marketTitle}</p>
              <div className="pill-row">
                <span className="pill">Action {call.action}</span>
                <span className="pill">Agent {outcome} {bpsToPercent(selectedProbability)}</span>
                <span className="pill">YES probability {bpsToPercent(call.yesProbabilityBps || call.agentProbabilityBps)}</span>
                <span className="pill">Market {outcome} {bpsToPercent(call.marketPriceBps)}</span>
                <span className="pill">Edge {bpsToPercent(call.edgeBps)}</span>
                <span className="pill">Confidence {bpsToPercent(call.confidenceBps)}</span>
              </div>
              <p>Bond {usdc(call.bondAmount)} · Unlock {usdc(call.unlockPrice)}</p>
              {call.txHash ? <Link href={`https://testnet.arcscan.app/tx/${call.txHash}`} target="_blank">Arc tx <ExternalLink size={14} /></Link> : null}
            </>
          ) : <p className="muted">No current live call passes hardened V1 filters. Run the worker from admin or cron.</p>}
        </div>
        <aside className="panel info-note">
          <h3>Latest unlock</h3>
          {latestUnlock ? <p>{shortAddress(latestUnlock.userWallet)} paid {usdc(latestUnlock.amount)} <Link href={`https://testnet.arcscan.app/tx/${latestUnlock.txHash}`} target="_blank">tx <ExternalLink size={14} /></Link></p> : <p className="muted">No thesis unlock recorded yet.</p>}
          <h3>Circle-powered rails</h3>
          <p className="muted">Agent bonds, thesis unlocks, and optional x402 evidence payments are tracked as Circle actions when real events exist.</p>
        </aside>
      </section>

      <section className="panel">
        <h2>60-second demo script</h2>
        <ol className="step-list">
          <li>Open Admin and run health to show DB, Polymarket, model, Arc, and Circle status.</li>
          <li>Run the agent. It either publishes a bonded call or explains filtered skip reasons.</li>
          <li>Open a live call, inspect verified evidence and the Arc bond transaction.</li>
          <li>Unlock the thesis with USDC on Arc and refresh this page to show the unlock.</li>
          <li>Run resolution for mature YES/NO markets and show leaderboard reputation updates.</li>
        </ol>
      </section>
    </main>
  );
}
