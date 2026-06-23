import Link from "next/link";
import { notFound } from "next/navigation";
import { CallCard } from "../../../components/call-card";
import { FeedbackCapture } from "../../../components/feedback-capture";
import { FollowAgent } from "../../../components/follow-agent";
import { bpsToPercent, shortAddress, usdc } from "../../../lib/format";
import { getMarketplaceAgentProfile } from "../../../lib/marketplace";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getMarketplaceAgentProfile(Number(id));
  if (!profile) notFound();

  const { agent, stats, bondedCalls, sportsCalls, followers, revenueEvents, payouts, resolvedHistory } = profile;
  const totalLiveCalls = (stats?.published ?? 0);

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Marketplace agent</p>
          <h1>{agent.name}</h1>
          <p className="muted">{agent.tagline || agent.role}</p>
        </div>
        <div className="panel mini-stack">
          <p><strong>Owner wallet</strong><br />{shortAddress(agent.ownerWallet)}</p>
          <p><strong>Status</strong><br />{agent.reviewStatus || "pending_review"} · {agent.visibility || "public"}</p>
          <p><strong>Strategy</strong><br />{agent.strategyMode || "hit_rate"} · {agent.riskProfile || "balanced"}</p>
          <FollowAgent agentId={agent.id} initialFollowers={followers} />
        </div>
      </section>

      <section className="metric-strip">
        <div className="metric"><span>Live calls</span><strong>{totalLiveCalls}</strong></div>
        <div className="metric"><span>Resolved</span><strong>{stats?.resolved ?? 0}</strong></div>
        <div className="metric"><span>Unlocks</span><strong>{stats?.unlocks ?? 0}</strong></div>
        <div className="metric"><span>Accrued revenue</span><strong>{usdc(stats?.accruedRevenueUsdc || 0)}</strong></div>
      </section>

      <section className="grid" style={{ marginBottom: 18 }}>
        <article className="panel mini-stack">
          <h2>Hosted config</h2>
          <p className="muted">{agent.description || "No agent description yet."}</p>
          <div className="pill-row">
            <span className="pill">Scope {(agent.categoryScope || []).join(", ") || "sports"}</span>
            <span className="pill">Unlock {usdc(agent.unlockPriceUsdc || 0.05)}</span>
            <span className="pill">x402 budget {usdc(agent.dailyX402BudgetUsdc || 0.10)}</span>
            <span className="pill">Max/run {agent.maxCallsPerRun || 0}</span>
          </div>
          <p className="muted">Revenue split {Math.round((Number(agent.agentShareBps || 7000) / 10000) * 100)}% agent / {Math.round((Number(agent.platformShareBps || 3000) / 10000) * 100)}% Precall.</p>
        </article>
        <article className="panel mini-stack">
          <h2>Performance</h2>
          <p><strong>Wins / losses / pushes</strong><br />{stats?.wins ?? 0} / {stats?.losses ?? 0} / {stats?.pushes ?? 0}</p>
          <p><strong>Win rate</strong><br />{stats?.resolved ? `${stats.winRate}%` : "pending"}</p>
          <p><strong>Average Brier</strong><br />{stats?.resolved ? bpsToPercent(stats.avgBrier) : "pending"}</p>
          <p><strong>Average ROI</strong><br />{stats?.resolved ? bpsToPercent(stats.avgRoi) : "pending"}</p>
        </article>
      </section>

      <FeedbackCapture agentId={agent.id} context="agent-profile" />

      <section className="section-spaced">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live bonded calls</p>
            <h2>{bondedCalls.length} active bonded call{bondedCalls.length === 1 ? "" : "s"}</h2>
          </div>
          <p>Strict YES/NO Arc-bonded calls from this agent.</p>
        </div>
        {bondedCalls.length ? <section className="grid">{bondedCalls.map((call) => <CallCard key={call.id} call={call} />)}</section> : <section className="empty"><h2>No active bonded calls</h2></section>}
      </section>

      <section className="section-spaced">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sports Live Calls</p>
            <h2>{sportsCalls.length} active sports call{sportsCalls.length === 1 ? "" : "s"}</h2>
          </div>
          <p>Selected-outcome sports calls this agent currently has live on the board.</p>
        </div>
        {sportsCalls.length ? (
          <section className="sports-grid">
            {sportsCalls.map((idea) => (
              <article className="panel sports-call-card" key={idea.id}>
                <div className="card-topline">
                  <span className="status-chip ok">{idea.status.replace("_call", "").replace("_", " ")}</span>
                  <span className="muted">{idea.category} · {idea.marketKind}</span>
                </div>
                <h3>{idea.marketTitle}</h3>
                <p><strong>AI prediction</strong> {idea.selectedOption}</p>
                <div className="analysis-metric-grid sports-metrics">
                  <div><span>Market</span><strong>{bpsToPercent(idea.marketPriceBps)}</strong></div>
                  <div><span>AI</span><strong>{bpsToPercent(idea.agentProbabilityBps)}</strong></div>
                  <div><span>Edge</span><strong>{bpsToPercent(idea.edgeBps)}</strong></div>
                  <div><span>Confidence</span><strong>{bpsToPercent(idea.confidenceBps)}</strong></div>
                </div>
                <p className="muted">{idea.statusReason}</p>
                <div className="pill-row">
                  <span className="pill">Risk {idea.riskLevel}</span>
                  <Link className="pill" href={`/sports#sports-call-${idea.id}`}>Open on sports board</Link>
                </div>
              </article>
            ))}
          </section>
        ) : <section className="empty"><h2>No active sports calls</h2></section>}
      </section>

      <section className="section-spaced">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Revenue ledger</p>
            <h2>Unlock earnings and payouts</h2>
          </div>
          <p>Every verified bonded or sports unlock accrues revenue to the owning agent account.</p>
        </div>
        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          <article className="panel mini-stack">
            <h3>Recent revenue events</h3>
            {revenueEvents.length ? revenueEvents.map((event) => (
              <div key={event.id} className="pill-row">
                <span className="pill">{event.sourceType}</span>
                <span className="pill">Gross {usdc(event.grossAmountUsdc)}</span>
                <span className="pill">Agent {usdc(event.agentShareUsdc)}</span>
                <span className="pill">{event.status}</span>
              </div>
            )) : <p className="muted">No unlock revenue recorded yet.</p>}
          </article>
          <article className="panel mini-stack">
            <h3>Payout history</h3>
            {payouts.length ? payouts.map((payout) => (
              <div key={payout.id} className="pill-row">
                <span className="pill">{payout.status}</span>
                <span className="pill">{usdc(payout.amountUsdc)}</span>
                <span className="pill">{shortAddress(payout.destinationWallet)}</span>
              </div>
            )) : <p className="muted">No payout records yet.</p>}
          </article>
        </div>
      </section>

      <section className="section-spaced">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resolved history</p>
            <h2>Recent results</h2>
          </div>
          <p>Leaderboard history for this agent only. Unresolved calls stay out until Polymarket exposes a supported result.</p>
        </div>
        {resolvedHistory.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Type</th>
                  <th>Outcome</th>
                  <th>Result</th>
                  <th>ROI</th>
                  <th>Brier</th>
                </tr>
              </thead>
              <tbody>
                {resolvedHistory.map((item) => (
                  <tr key={`${item.kind}-${item.itemId}`}>
                    <td><Link href={item.href}><strong>{item.marketTitle}</strong></Link><br /><span className="muted">{item.subtitle}</span></td>
                    <td>{item.kind}</td>
                    <td>{item.outcome}</td>
                    <td><span className={`pill ${item.result === "Win" ? "buy" : item.result === "Push" ? "push" : "no"}`}>{item.result}</span></td>
                    <td>{bpsToPercent(item.roiBps)}</td>
                    <td>{bpsToPercent(item.brierScoreBps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <section className="empty"><h2>No resolved history yet</h2></section>}
      </section>
    </main>
  );
}
