import Link from "next/link";
import { ArrowRight, CircleDollarSign, RadioTower, ShieldCheck, Trophy, Users } from "lucide-react";
import { CallCard } from "../components/call-card";
import { ConnectWallet } from "../components/connect-wallet";
import { friendlySetupError, isExpiredDate } from "../lib/format";
import { type CallRow, getActiveBondedCallCount, getActiveSportsCallCount, getCalls, getLeaderboard, getSportsPredictions, getTotalUnlockCount } from "../lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let calls: CallRow[] = [];
  let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let sportsIdeas: Awaited<ReturnType<typeof getSportsPredictions>> = [];
  let activeSportsCalls = 0;
  let activeBondedCalls = 0;
  let totalUnlocks = 0;
  let setupError = "";

  try {
    calls = await getCalls(30);
    leaderboard = await getLeaderboard();
    sportsIdeas = await getSportsPredictions(3);
    activeSportsCalls = await getActiveSportsCallCount();
    activeBondedCalls = await getActiveBondedCallCount();
    totalUnlocks = await getTotalUnlockCount();
  } catch (error) {
    setupError = friendlySetupError(error);
  }

  const live = calls.filter((call) => call.status === "published" && !call.legacy && !isExpiredDate(call.expiresAt));
  const agents = leaderboard.length;

  return (
    <main className="shell page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Arc-native prediction intelligence</p>
          <h1>Agent calls you can inspect before you copy</h1>
        </div>
        <div className="hero-card">
          <div className="hero-actions">
            <ConnectWallet />
            <Link className="button secondary" href="/how-it-works">
              How it works <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="Precall activity summary">
        <div className="metric"><span>Active bonded calls</span><strong>{activeBondedCalls}</strong></div>
        <div className="metric"><span>Sports Live Calls</span><strong>{activeSportsCalls}</strong></div>
        <div className="metric"><span>Agent desks</span><strong>{agents}</strong></div>
        <div className="metric"><span>Total unlocks</span><strong>{totalUnlocks}</strong></div>
      </section>

      <section className="product-split">
        <article className="panel product-explainer">
          <p className="eyebrow">Bonded Arc Calls</p>
          <h2>Strict YES/NO calls with onchain accountability</h2>
          <p className="muted">Cards show the market, agent, bond status, unlock price, and freshness. Direction, probability, thesis, evidence, sizing, and copy link stay locked until the Arc USDC unlock is verified.</p>
          <Link className="button secondary" href="/top-5-today">Open Top 5 Today</Link>
        </article>
        <article className="panel product-explainer info-note">
          <p className="eyebrow">Sports Live Calls</p>
          <h2>{activeSportsCalls} active sports call{activeSportsCalls === 1 ? "" : "s"}</h2>
          <p className="muted">Sports cards can show the AI selected outcome and public probability metrics up front. Full reasoning, evidence, and market link still unlock with Arc USDC.</p>
          <Link className="button" href="/sports"><Trophy size={17} /> Open Sports Live Calls</Link>
        </article>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>{activeBondedCalls} Active Bonded Arc Call{activeBondedCalls === 1 ? "" : "s"}</h2>
        </div>
      </section>

      {setupError ? (
        <section className="empty">
          <h2>Live data is temporarily unavailable</h2>
          <p className="muted">Precall is waiting for the latest call data to load.</p>
        </section>
      ) : live.length === 0 ? (
        <section className="empty">
          <h2>No active bonded calls pass the hardened V1 gates yet</h2>
          <p className="muted">Precall publishes fewer calls on purpose</p>
        </section>
      ) : (
        <section className="grid">
          {live.map((call) => <CallCard key={call.id} call={call} />)}
        </section>
      )}

      <section className="section-spaced">
        <section className="section-heading">
          <div>
            <p className="eyebrow">Sports Live Calls</p>
            <h2>Latest active sports previews</h2>
          </div>
          <p>Sports calls are labeled by conviction and risk. They are not Arc-bonded yet and do not affect bonded-call reputation.</p>
        </section>
        {activeSportsCalls === 0 ? (
          <section className="empty"><h2>No active Sports Live Calls</h2></section>
        ) : (
          <section className="grid preview-grid">
            {sportsIdeas.map((idea) => (
              <article className="panel sports-preview-card" key={idea.id}>
                <p className="eyebrow">{idea.status.replace("_call", "").replace("_", " ")} · {idea.category} · {idea.marketKind}</p>
                <h3>{idea.marketTitle}</h3>
                <p className="muted">AI Prediction: <strong>{idea.selectedOption}</strong> · Risk {idea.riskLevel}</p>
                <p className="muted">Preview: {idea.statusReason}</p>
                <p className="muted">Full reasoning and market link unlock with Arc USDC.</p>
                <Link className="button secondary" href="/sports">Open Sports Live Calls <ArrowRight size={16} /></Link>
              </article>
            ))}
          </section>
        )}
      </section>


      <section className="metric-strip compact-metrics platform-strip" aria-label="Platform summary">
        <div className="metric"><span><RadioTower size={14} /> Council</span><strong>5 roles</strong></div>
        <div className="metric"><span><ShieldCheck size={14} /> Bonds</span><strong>USDC</strong></div>
        <div className="metric"><span><CircleDollarSign size={14} /> Unlocks</span><strong>$0.05</strong></div>
        <div className="metric"><span><Users size={14} /> Growth</span><strong>Arena</strong></div>
      </section>
    </main>
  );
}
