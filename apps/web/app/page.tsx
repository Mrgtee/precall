import Link from "next/link";
import { ArrowRight, CircleDollarSign, RadioTower, ShieldCheck, Users } from "lucide-react";
import { ConnectWallet } from "../components/connect-wallet";
import { HomeMotion } from "../components/home-motion";
import { friendlySetupError } from "../lib/format";
import { getActiveSportsCallCount, getLeaderboard, getTotalUnlockCount } from "../lib/queries";
import { getMarketplaceSportsPredictions } from "../lib/marketplace";
import { SportsCard, type SportsIdea } from "../components/sports-card";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let ideas: SportsIdea[] = [];
  let leaderboard: Awaited<ReturnType<typeof getLeaderboard>> = [];
  let activeSportsCalls = 0;
  let totalUnlocks = 0;
  let setupError = "";

  const [sportsResult, leaderboardResult, activeSportsCountResult, totalUnlocksResult] = await Promise.allSettled([
    getMarketplaceSportsPredictions(12),
    getLeaderboard(),
    getActiveSportsCallCount(),
    getTotalUnlockCount(),
  ]);

  if (sportsResult.status === "fulfilled") {
    ideas = sportsResult.value as unknown as SportsIdea[];
  } else {
    setupError = friendlySetupError(sportsResult.reason);
  }

  if (leaderboardResult.status === "fulfilled") leaderboard = leaderboardResult.value;
  if (activeSportsCountResult.status === "fulfilled") activeSportsCalls = activeSportsCountResult.value;
  if (totalUnlocksResult.status === "fulfilled") totalUnlocks = totalUnlocksResult.value;

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
        <div><span>Active Soccer Calls</span><strong>{activeSportsCalls}</strong></div>
        <div><span>Soccer Coverage</span><strong>World Cup 2026</strong></div>
        <div><span>Agent Desks</span><strong>{agents}</strong></div>
        <div><span>Total unlocks</span><strong>{totalUnlocks}</strong></div>
      </section>

      <section className="taste-bento taste-shell" aria-label="Precall product surfaces">
        <article className="taste-bento-card taste-bento-large group-card">
          <div>
            <p className="taste-kicker">Soccer Predictions</p>
            <h2>Daily soccer predictions with onchain USDC accountability.</h2>
          </div>
          <p>Cards show match winner/over-under markets, agent council details, and freshness. Direction, probability, thesis, and evidence stay locked until the Arc USDC unlock is verified.</p>
          <Link className="taste-button taste-button-light" href="/sports">Open Active Calls</Link>
        </article>

        <article className="taste-bento-card taste-bento-accent group-card">
          <p className="taste-kicker">Soccer Focus Only</p>
          <h2>USDC Micro-nanopayments</h2>
          <p>Every prediction thesis is locked and can be read by unlocking it with a micro USDC transaction. Non-sports and general markets have been completely removed.</p>
          <span className="pill" style={{ display: 'inline-flex', padding: '0.2rem 0.5rem', background: 'var(--accent)', color: 'var(--black)', borderRadius: '4px', fontWeight: 'bold', width: 'fit-content' }}>Soccer Only</span>
        </article>

        <article className="taste-bento-card group-card">
          <CircleDollarSign size={22} />
          <h3>Reasoning unlocks</h3>
          <p>Full analysis reveals only after verified Arc USDC payment.</p>
        </article>

        <article className="taste-bento-card group-card">
          <RadioTower size={22} />
          <h3>Five-role council</h3>
          <p>tactical, stats, squad, context, and skeptic agents challenge every call.</p>
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
        <div className="taste-live-grid" style={{ display: "block" }}>
          <section className="taste-stack">
            <div className="taste-section-head">
              <p className="taste-kicker">Dashboard</p>
              <h2>{activeSportsCalls} Active Soccer Prediction{activeSportsCalls === 1 ? "" : "s"}</h2>
            </div>
            {setupError && ideas.length === 0 ? (
              <section className="empty taste-stack-card">
                <h2>Live data is temporarily unavailable</h2>
                <p className="muted">Precall is waiting for the latest call data to load.</p>
              </section>
            ) : ideas.length === 0 ? (
              <section className="empty taste-stack-card">
                <h2>No active soccer predictions available yet</h2>
                <p className="muted">Precall publishes fewer calls on purpose</p>
              </section>
            ) : (
              <section className="grid taste-stack-list">
                {ideas.map((idea) => <div className="taste-stack-card" key={idea.id}><SportsCard idea={idea} /></div>)}
              </section>
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
