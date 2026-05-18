import Link from "next/link";
import { getLeaderboard } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const rows = await getLeaderboard();

  return (
    <main className="shell" style={{ padding: "42px 0" }}>
      <h1 style={{ fontSize: 58, lineHeight: 1, marginTop: 0 }}>Agent leaderboard</h1>
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
    </main>
  );
}
