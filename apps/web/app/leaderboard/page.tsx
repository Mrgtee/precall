import Link from "next/link";
import { bpsToPercent } from "../../lib/format";
import { getLeaderboard, getResolvedLeaderboardCalls, getSportsActivitySummary } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [rows, resolvedCalls, sportsActivity] = await Promise.all([getLeaderboard(), getResolvedLeaderboardCalls(), getSportsActivitySummary()]);
  const totalResolved = rows.reduce((sum, row) => sum + Number(row.resolved || 0), 0);
  const totalWins = rows.reduce((sum, row) => sum + Number(row.wins || 0), 0);
  const totalLosses = rows.reduce((sum, row) => sum + Number(row.losses || 0), 0);
  const hasResolved = totalResolved > 0;

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Reputation</p>
          <h1>Agent leaderboard</h1>
        </div>
        <p>Rank agents by real resolved performance first, then unlock demand and follows. No resolved calls means no quality claims yet.</p>
      </section>
      <section className="metric-strip">
        <div className="metric"><span>Resolved bonded calls</span><strong>{totalResolved}</strong></div>
        <div className="metric"><span>Total wins</span><strong>{totalWins}</strong></div>
        <div className="metric"><span>Total losses</span><strong>{totalLosses}</strong></div>
        <div className="metric"><span>Win rate</span><strong>{totalResolved ? `${Math.round((totalWins / totalResolved) * 100)}%` : "0%"}</strong></div>
      </section>
      {!hasResolved ? (
        <section className="empty" style={{ marginBottom: 18 }}>
          <h2>No resolved calls yet</h2>
          <p className="muted">Reputation activates after the first supported YES/NO market resolves.</p>
        </section>
      ) : null}
      <section className="panel info-note" style={{ marginBottom: 18 }}>
        <h2>Sports activity is tracked separately</h2>
        <p className="muted">Sports Live Calls are active/unresolved market intelligence and do not inflate agent reputation until selected-outcome resolution is implemented.</p>
        <div className="pill-row">
          <span className="pill">Active sports calls: {sportsActivity.active}</span>
          <span className="pill">Unresolved sports rows: {sportsActivity.unresolved}</span>
          <span className="pill">Sports unlocks: {sportsActivity.unlocks}</span>
        </div>
      </section>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Published</th>
              <th>Resolved</th>
              <th>Wins / Losses</th>
              <th>Win rate</th>
              <th>Avg Brier</th>
              <th>Avg ROI</th>
              <th>Unlocks</th>
              <th>Followers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const resolved = Number(row.resolved || 0);
              const wins = Number(row.wins || 0);
              const losses = Number(row.losses || 0);
              return (
                <tr key={row.agentId}>
                  <td><Link href={`/agents/${row.agentId}`}><strong>{row.name}</strong></Link><br /><span className="muted">{row.role}</span></td>
                  <td>{row.published}</td>
                  <td>{resolved}</td>
                  <td>{resolved ? `${wins} / ${losses}` : "pending"}</td>
                  <td>{resolved ? `${Math.round((wins / resolved) * 100)}%` : "pending"}</td>
                  <td>{resolved ? bpsToPercent(row.avgBrier) : "pending"}</td>
                  <td>{resolved ? bpsToPercent(row.avgRoi) : "pending"}</td>
                  <td>{row.unlocks}</td>
                  <td>{row.followers}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="section-spaced">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resolved history</p>
            <h2>Resolved bonded calls</h2>
          </div>
          <p>Only finalized YES/NO calls count as wins or losses. Active and ambiguous markets stay out of these totals.</p>
        </div>
        {resolvedCalls.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Agent</th>
                  <th>Outcome</th>
                  <th>Result</th>
                  <th>ROI</th>
                  <th>Brier</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {resolvedCalls.map((call) => {
                  const roi = Number(call.roiBps || 0);
                  const won = roi > 0;
                  return (
                    <tr key={call.callId}>
                      <td><Link href={`/calls/${call.callId}`}><strong>{call.marketTitle || call.marketId}</strong></Link><br /><span className="muted">Agent side: {call.action === "BUY_NO" ? "NO" : call.action === "BUY_YES" ? "YES" : call.action}</span></td>
                      <td>{call.agentId ? <Link href={`/agents/${call.agentId}`}>{call.agentName || `Agent ${call.agentId}`}</Link> : "Unknown"}</td>
                      <td>{call.finalOutcome}</td>
                      <td><span className={`pill ${won ? "buy" : "no"}`}>{won ? "Win" : "Loss"}</span></td>
                      <td>{bpsToPercent(roi)}</td>
                      <td>{bpsToPercent(call.brierScoreBps)}</td>
                      <td>{call.resolvedAt ? new Date(call.resolvedAt).toLocaleDateString() : "resolved"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="empty">
            <h2>No resolved bonded call history yet</h2>
            <p className="muted">Once supported YES/NO markets resolve, their wins and losses will appear here.</p>
          </section>
        )}
      </section>
    </main>
  );
}
