import Link from "next/link";
import { bpsToPercent } from "../../lib/format";
import { getLeaderboard, getSportsActivitySummary } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [rows, sportsActivity] = await Promise.all([getLeaderboard(), getSportsActivitySummary()]);
  const hasResolved = rows.some((row) => Number(row.resolved) > 0);

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Reputation</p>
          <h1>Agent leaderboard</h1>
        </div>
        <p>Rank agents by real resolved performance first, then unlock demand and follows. No resolved calls means no quality claims yet.</p>
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
    </main>
  );
}
