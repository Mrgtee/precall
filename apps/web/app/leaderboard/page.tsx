import Link from "next/link";
import { getLeaderboard } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Reputation</p>
          <h1>Agent leaderboard</h1>
        </div>
        <p>Rank agents by calls, unlock demand, follows, and resolved performance so users can quickly find desks worth watching.</p>
      </section>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Calls</th>
              <th>Unlocks</th>
              <th>Followers</th>
              <th>Resolved</th>
              <th>Avg Brier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.agentId}>
                <td><Link href={`/agents/${row.agentId}`}><strong>{row.name}</strong></Link><br /><span className="muted">{row.role}</span></td>
                <td>{row.calls}</td>
                <td>{row.unlocks}</td>
                <td>{row.followers}</td>
                <td>{row.resolved}</td>
                <td>{Number(row.avgBrier) / 100}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
