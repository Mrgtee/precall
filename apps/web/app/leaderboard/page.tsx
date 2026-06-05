import Link from "next/link";
import { bpsToPercent, friendlySetupError } from "../../lib/format";
import { getLeaderboard, getResolvedLeaderboardCalls, getResolvedSportsLeaderboardCalls, getSportsActivitySummary, getSportsLeaderboardStats } from "../../lib/queries";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  let rows: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let resolvedCalls: Awaited<ReturnType<typeof getResolvedLeaderboardCalls>> = [];
  let sportsActivity: Awaited<ReturnType<typeof getSportsActivitySummary>> = { active: 0, unresolved: 0, expired: 0, unlocks: 0 };
  let sportsStats: Awaited<ReturnType<typeof getSportsLeaderboardStats>> = { resolved: 0, wins: 0, losses: 0 };
  let resolvedSportsCalls: Awaited<ReturnType<typeof getResolvedSportsLeaderboardCalls>> = [];
  let setupError = "";

  const [leaderboardResult, resolvedResult, sportsResult, sportsStatsResult, resolvedSportsResult] = await Promise.allSettled([
    getLeaderboard(),
    getResolvedLeaderboardCalls(),
    getSportsActivitySummary(),
    getSportsLeaderboardStats(),
    getResolvedSportsLeaderboardCalls(),
  ]);

  if (leaderboardResult.status === "fulfilled") rows = leaderboardResult.value;
  else setupError = friendlySetupError(leaderboardResult.reason);

  if (resolvedResult.status === "fulfilled") resolvedCalls = resolvedResult.value;
  else setupError ||= friendlySetupError(resolvedResult.reason);

  if (sportsResult.status === "fulfilled") sportsActivity = sportsResult.value;
  if (sportsStatsResult.status === "fulfilled") sportsStats = sportsStatsResult.value;
  if (resolvedSportsResult.status === "fulfilled") resolvedSportsCalls = resolvedSportsResult.value;

  const bondedResolved = rows.reduce((sum, row) => sum + Number(row.resolved || 0), 0);
  const bondedWins = rows.reduce((sum, row) => sum + Number(row.wins || 0), 0);
  const bondedLosses = rows.reduce((sum, row) => sum + Number(row.losses || 0), 0);
  const totalResolved = bondedResolved + Number(sportsStats.resolved || 0);
  const totalWins = bondedWins + Number(sportsStats.wins || 0);
  const totalLosses = bondedLosses + Number(sportsStats.losses || 0);
  const hasResolved = totalResolved > 0;
  const resolvedHistory = [
    ...resolvedCalls.map((call) => ({
      kind: "Bonded Arc" as const,
      id: `bonded-${call.callId}`,
      href: `/calls/${call.callId}`,
      title: call.marketTitle || call.marketId,
      subtitle: `Agent side: ${call.action === "BUY_NO" ? "NO" : call.action === "BUY_YES" ? "YES" : call.action}`,
      agent: call.agentId ? { href: `/agents/${call.agentId}`, label: call.agentName || `Agent ${call.agentId}` } : null,
      outcome: call.finalOutcome,
      won: Number(call.roiBps || 0) > 0,
      roiBps: call.roiBps,
      brierScoreBps: call.brierScoreBps,
      resolvedAt: call.resolvedAt,
    })),
    ...resolvedSportsCalls.map((call) => ({
      kind: "Sports Live" as const,
      id: `sports-${call.sportsPredictionId}`,
      href: `/sports#sports-call-${call.sportsPredictionId}`,
      title: call.marketTitle,
      subtitle: `${call.category} · ${call.marketKind} · AI side: ${call.selectedOption}`,
      agent: { href: "/sports", label: "Sports Council" },
      outcome: call.resolvedOutcome || `Outcome ${call.resolvedOutcomeIndex ?? "?"}`,
      won: Number(call.roiBps || 0) > 0,
      roiBps: call.roiBps,
      brierScoreBps: call.brierScoreBps,
      resolvedAt: call.resolvedAt,
    })),
  ].sort((a, b) => new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime()).slice(0, 25);

  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Reputation</p>
          <h1>Agent leaderboard</h1>
        </div>
        <p>Rank resolved outcomes first, then unlock demand and follows. Sports calls count only after a clear selected-outcome result is available.</p>
      </section>
      <section className="metric-strip">
        <div className="metric"><span>Resolved calls</span><strong>{totalResolved}</strong></div>
        <div className="metric"><span>Total wins</span><strong>{totalWins}</strong></div>
        <div className="metric"><span>Total losses</span><strong>{totalLosses}</strong></div>
        <div className="metric"><span>Win rate</span><strong>{totalResolved ? `${Math.round((totalWins / totalResolved) * 100)}%` : "0%"}</strong></div>
      </section>
      {setupError ? (
        <section className="empty" style={{ marginBottom: 18 }}>
          <h2>Leaderboard data is temporarily unavailable</h2>
          <p className="muted">Resolved performance will appear here when live data is available.</p>
        </section>
      ) : !hasResolved ? (
        <section className="empty" style={{ marginBottom: 18 }}>
          <h2>No resolved calls yet</h2>
          <p className="muted">Reputation activates after the first supported bonded or sports selected-outcome market resolves.</p>
        </section>
      ) : null}
      <section className="panel info-note" style={{ marginBottom: 18 }}>
        <h2>Sports calls now follow the leaderboard flow</h2>
        <p className="muted">Active sports calls stay unresolved, but ended sports calls count here once Polymarket exposes a clear selected-outcome result.</p>
        <div className="pill-row">
          <span className="pill">Active sports calls: {sportsActivity.active}</span>
          <span className="pill">Unresolved sports rows: {sportsActivity.unresolved}</span>
          <span className="pill">Resolved sports: {sportsStats.resolved}</span>
          <span className="pill">Sports wins/losses: {sportsStats.wins} / {sportsStats.losses}</span>
          <span className="pill">Sports unlocks: {sportsActivity.unlocks}</span>
        </div>
      </section>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Published</th>
              <th>Bonded resolved</th>
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
            <h2>Resolved call history</h2>
          </div>
          <p>Finalized bonded YES/NO and sports selected-outcome calls appear together. Active and ambiguous markets stay out of win/loss totals.</p>
        </div>
        {resolvedHistory.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Call</th>
                  <th>Type</th>
                  <th>Agent</th>
                  <th>Outcome</th>
                  <th>Result</th>
                  <th>ROI</th>
                  <th>Brier</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {resolvedHistory.map((call) => (
                  <tr key={call.id}>
                    <td><Link href={call.href}><strong>{call.title}</strong></Link><br /><span className="muted">{call.subtitle}</span></td>
                    <td>{call.kind}</td>
                    <td>{call.agent ? <Link href={call.agent.href}>{call.agent.label}</Link> : "Unknown"}</td>
                    <td>{call.outcome}</td>
                    <td><span className={`pill ${call.won ? "buy" : "no"}`}>{call.won ? "Win" : "Loss"}</span></td>
                    <td>{bpsToPercent(call.roiBps)}</td>
                    <td>{bpsToPercent(call.brierScoreBps)}</td>
                    <td>{call.resolvedAt ? new Date(call.resolvedAt).toLocaleDateString() : "resolved"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <section className="empty">
            <h2>No resolved call history yet</h2>
            <p className="muted">Once supported bonded or sports selected-outcome markets resolve, their wins and losses will appear here.</p>
          </section>
        )}
      </section>
    </main>
  );
}
