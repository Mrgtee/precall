import Link from "next/link";
import { ArrowRight, CircleDollarSign, RadioTower, ShieldCheck, Trophy, Users } from "lucide-react";
import { CallCard } from "../components/call-card";
import { ConnectWallet } from "../components/connect-wallet";
import { HomeMotion } from "../components/home-motion";
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

  const [callsResult, leaderboardResult, sportsIdeasResult, activeSportsResult, activeBondedResult, totalUnlocksResult] = await Promise.allSettled([
    getCalls(30),
    getLeaderboard(),
    getSportsPredictions(3),
    getActiveSportsCallCount(),
    getActiveBondedCallCount(),
    getTotalUnlockCount(),
  ]);

  if (callsResult.status === "fulfilled") calls = callsResult.value;
  else setupError = friendlySetupError(callsResult.reason);

  if (leaderboardResult.status === "fulfilled") leaderboard = leaderboardResult.value;
  if (sportsIdeasResult.status === "fulfilled") sportsIdeas = sportsIdeasResult.value;
  if (activeSportsResult.status === "fulfilled") activeSportsCalls = activeSportsResult.value;
  if (activeBondedResult.status === "fulfilled") activeBondedCalls = activeBondedResult.value;
  if (totalUnlocksResult.status === "fulfilled") totalUnlocks = totalUnlocksResult.value;

  const live = calls.filter((call) => call.status === "published" && !call.legacy && !isExpiredDate(call.expiresAt));
  if (callsResult.status === "fulfilled" && activeBondedResult.status !== "fulfilled") activeBondedCalls = live.length;
  if (sportsIdeasResult.status === "fulfilled" && activeSportsResult.status !== "fulfilled") activeSportsCalls = sportsIdeas.length;
  const agents = leaderboard.length;

  return (
    <main className="taste-page">
      <HomeMotion />
      <section className="taste-hero taste-shell">
        <div className="taste-hero-copy">
          <p className="taste-kicker">Arc-native prediction intelligence</p>
          <h1>Agent calls you can inspect before you copy</h1>
          <p className="taste-hero-lede">Precall scans live markets, separates public signal from paid reasoning, and lets users unlock the full thesis only after a verified Arc USDC payment.</p>
        </div>
        <div className="taste-hero-actions">
          <ConnectWallet />
          <Link className="taste-button taste-button-light" href="/how-it-works">
            How it works <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <section className="taste-metrics taste-shell" aria-label="Precall activity summary">
        <div><span>Active bonded calls</span><strong>{activeBondedCalls}</strong></div>
        <div><span>Sports Live Calls</span><strong>{activeSportsCalls}</strong></div>
        <div><span>Agent desks</span><strong>{agents}</strong></div>
        <div><span>Total unlocks</span><strong>{totalUnlocks}</strong></div>
      </section>

      <section className="taste-bento taste-shell" aria-label="Precall product surfaces">
        <article className="taste-bento-card taste-bento-large group-card">
          <div>
            <p className="taste-kicker">Bonded Arc Calls</p>
            <h2>Strict YES/NO calls with onchain accountability.</h2>
          </div>
          <p>Cards show market, agent, bond status, unlock price, and freshness. Direction, probability, thesis, evidence, sizing, and copy link stay locked until the Arc USDC unlock is verified.</p>
          <Link className="taste-button taste-button-light" href="/top-5-today">Open Top 5 Today</Link>
        </article>

        <article className="taste-bento-card taste-bento-accent group-card">
          <p className="taste-kicker">Sports Live Calls</p>
          <h2>{activeSportsCalls} active sports call{activeSportsCalls === 1 ? "" : "s"}</h2>
          <p>Sports calls stay separate from bonded reputation, but still show selected outcome, risk, confidence, and Arc USDC unlock flow.</p>
          <Link className="taste-button" href="/sports"><Trophy size={17} /> Open Sports</Link>
        </article>

        <article className="taste-bento-card group-card">
          <CircleDollarSign size={22} />
          <h3>Reasoning unlocks</h3>
          <p>Full analysis reveals only after verified Arc USDC payment.</p>
        </article>

        <article className="taste-bento-card group-card">
          <RadioTower size={22} />
          <h3>Five-role council</h3>
          <p>Macro, news, crowd, book, and skeptic agents challenge every call.</p>
        </article>

        <article className="taste-bento-card group-card">
          <ShieldCheck size={22} />
          <h3>Resolved reputation</h3>
          <p>Leaderboards count real resolved wins and losses, not unresolved hype.</p>
        </article>
      </section>

      <section className="taste-marquee" aria-label="Precall platform loop">
        <div>Polymarket prediction call live on Arc testnet, powered by Circle agentic stack x402 nanopayment. </div>
        <div aria-hidden="true">Polymarket prediction call live on Arc testnet, powered by Circle agentic stack x402 nanopayment. </div>
      </section>

      <section className="taste-desire taste-shell">
        <div className="taste-live-grid">
          <section className="taste-stack">
            <div className="taste-section-head">
              <p className="taste-kicker">Dashboard</p>
              <h2>{activeBondedCalls} Active Bonded Arc Call{activeBondedCalls === 1 ? "" : "s"}</h2>
            </div>
            {setupError && live.length === 0 ? (
              <section className="empty taste-stack-card">
                <h2>Live data is temporarily unavailable</h2>
                <p className="muted">Precall is waiting for the latest call data to load.</p>
              </section>
            ) : live.length === 0 ? (
              <section className="empty taste-stack-card">
                <h2>No active bonded calls pass the hardened V1 gates yet</h2>
                <p className="muted">Precall publishes fewer calls on purpose</p>
              </section>
            ) : (
              <section className="grid taste-stack-list">
                {live.map((call) => <div className="taste-stack-card" key={call.id}><CallCard call={call} /></div>)}
              </section>
            )}
          </section>

          <section className="taste-accordion" aria-label="Sports Live Calls preview">
            <div className="taste-section-head">
              <p className="taste-kicker">Sports Live Calls</p>
              <h2>Latest active sports previews</h2>
            </div>
            {activeSportsCalls === 0 ? (
              <section className="empty"><h2>No active Sports Live Calls</h2></section>
            ) : (
              <div className="taste-accordion-track">
                {sportsIdeas.map((idea) => (
                  <article className="taste-accordion-item group-card" key={idea.id}>
                    <p className="taste-kicker">{idea.status.replace("_call", "").replace("_", " ")} · {idea.category}</p>
                    <h3>{idea.marketTitle}</h3>
                    <p>AI Prediction: <strong>{idea.selectedOption}</strong></p>
                    <span>Risk {idea.riskLevel}</span>
                    <Link href="/sports">Open board <ArrowRight size={14} /></Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="taste-platform-strip taste-shell" aria-label="Platform summary">
        <div><span><RadioTower size={14} /> Council</span><strong>5 roles</strong></div>
        <div><span><ShieldCheck size={14} /> Bonds</span><strong>USDC</strong></div>
        <div><span><CircleDollarSign size={14} /> Unlocks</span><strong>$0.05</strong></div>
        <div><span><Users size={14} /> Growth</span><strong>Arena</strong></div>
      </section>
    </main>
  );
}
