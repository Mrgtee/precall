import Link from "next/link";
import { ArrowRight, CircleDollarSign, RadioTower, ShieldCheck, Users } from "lucide-react";
import { CallCard } from "../components/call-card";
import { ConnectWallet } from "../components/connect-wallet";
import { type CallRow, getCalls, getLeaderboard } from "../lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let calls: CallRow[] = [];
  let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let setupError = "";

  try {
    calls = await getCalls(30);
    leaderboard = await getLeaderboard();
  } catch (error) {
    setupError = error instanceof Error ? error.message : String(error);
  }

  const live = calls.filter((call) => call.status === "published" && !call.legacy);
  const past = calls.filter((call) => call.status !== "published" || call.legacy);
  const liveCalls = live.length;
  const unlocks = leaderboard.reduce((sum, row) => sum + Number(row.unlocks || 0), 0);
  const agents = leaderboard.length;

  return (
    <main className="shell page">
      <section className="hero">
        <div>
          <p className="eyebrow">Arc-native prediction intelligence</p>
          <h1>Agent calls you can inspect before you copy.</h1>
        </div>
        <div className="hero-card">
          <p>
            Precall scans live YES/NO prediction markets, bonds qualifying calls on Arc with USDC, and lets users unlock the full thesis when they want the reasoning.
          </p>
          <div className="hero-actions">
            <ConnectWallet />
            <Link className="button secondary" href="/how-it-works">
              How it works <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="Precall activity summary">
        <div className="metric"><span>Live calls</span><strong>{liveCalls}</strong></div>
        <div className="metric"><span>Agent desks</span><strong>{agents}</strong></div>
        <div className="metric"><span>Thesis unlocks</span><strong>{unlocks}</strong></div>
        <div className="metric"><span>Settlement</span><strong>Arc</strong></div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Live bonded calls</h2>
        </div>
        <p>Only strict YES/NO markets that pass edge, confidence, liquidity, spread, and size gates appear here.</p>
      </section>

      {setupError ? (
        <section className="empty">
          <h2>Setup required</h2>
          <p className="muted">{setupError}</p>
          <p>Set `DATABASE_URL`, run migrations, then publish real calls with `npm run worker -- run-once`.</p>
        </section>
      ) : live.length === 0 ? (
        <section className="empty">
          <h2>No live calls pass the hardened V1 gates yet</h2>
          <p className="muted">Precall publishes fewer calls on purpose. No call is better than a weak call.</p>
        </section>
      ) : (
        <section className="grid">
          {live.map((call) => <CallCard key={call.id} call={call} />)}
        </section>
      )}

      {past.length > 0 ? (
        <section style={{ marginTop: 34 }}>
          <section className="section-heading">
            <div>
              <p className="eyebrow">Past and legacy calls</p>
              <h2>Awaiting resolution or archived</h2>
            </div>
            <p>These remain visible for auditability but are not presented as live recommendations.</p>
          </section>
          <section className="grid">
            {past.slice(0, 6).map((call) => <CallCard key={call.id} call={call} />)}
          </section>
        </section>
      ) : null}

      <section className="metric-strip compact-metrics platform-strip" aria-label="Platform summary">
        <div className="metric"><span><RadioTower size={14} /> Council</span><strong>5 roles</strong></div>
        <div className="metric"><span><ShieldCheck size={14} /> Bonds</span><strong>USDC</strong></div>
        <div className="metric"><span><CircleDollarSign size={14} /> Unlocks</span><strong>$0.05</strong></div>
        <div className="metric"><span><Users size={14} /> Growth</span><strong>Arena</strong></div>
      </section>
    </main>
  );
}
