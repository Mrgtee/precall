import { ShieldCheck, Trophy } from "lucide-react";
import { friendlySetupError } from "../../lib/format";
import { getActiveSportsCallCount } from "../../lib/queries";
import { getMarketplaceSportsPredictions } from "../../lib/marketplace";
import { SportsCard } from "../../components/sports-card";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  if (status === "strong_call") return "Strong";
  if (status === "lean_call") return "Lean";
  return "High Risk";
}

function statusIntro(status: string) {
  if (status === "strong_call") return "Strong Calls";
  if (status === "lean_call") return "Lean Calls";
  return "High Risk Calls";
}

function statusDescription(status: string) {
  if (status === "strong_call") return "Edge, confidence, market spread, and risk are all acceptable.";
  if (status === "lean_call") return "The selected side is clear, but conviction is moderate.";
  return "The model found a side, but evidence, confidence, or market conditions make it risky.";
}

export default async function SportsPage() {
  let ideas: Awaited<ReturnType<typeof getMarketplaceSportsPredictions>> = [];
  let activeCount = 0;
  let setupError = "";
  try {
    [ideas, activeCount] = await Promise.all([getMarketplaceSportsPredictions(40), getActiveSportsCallCount()]);
  } catch (error) {
    setupError = friendlySetupError(error);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const grouped = ["strong_call", "lean_call", "high_risk_call"].map((status) => ({
    status,
    ideas: ideas.filter((idea: any) => idea.status === status),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <main className="shell page sports-page">
      <section className="hero compact-hero">
        <div>
          <p className="eyebrow">Sports Live Calls</p>
          <h1>AI predictions for active Polymarket sports markets.</h1>
        </div>
        <div className="hero-card">
          <div className="pill-row">
            <span className="pill"><Trophy size={14} /> {activeCount} Active Sports Live Call{activeCount === 1 ? "" : "s"}</span>
            <span className="pill"><ShieldCheck size={14} /> Hosted agent marketplace</span>
          </div>
        </div>
      </section>

      <section className="metric-strip" aria-label="Sports Live Calls summary">
        <div className="metric"><span>Active Sports Live Calls</span><strong>{activeCount}</strong></div>
        <div className="metric"><span>Strong</span><strong>{grouped.find((group) => group.status === "strong_call")?.ideas.length ?? 0}</strong></div>
        <div className="metric"><span>Lean / High Risk</span><strong>{(grouped.find((group) => group.status === "lean_call")?.ideas.length ?? 0) + (grouped.find((group) => group.status === "high_risk_call")?.ideas.length ?? 0)}</strong></div>
        <div className="metric"><span>Unlock rail</span><strong>Arc USDC</strong></div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Today</p>
          <h2>{activeCount} Active Sports Live Call{activeCount === 1 ? "" : "s"}</h2>
        </div>
      </section>

      <section className="panel info-note">
        <p>
          Live calls are AI-generated market intelligence, and not financial advice.
        </p>
      </section>

      {setupError ? (
        <section className="empty"><h2>Sports Live Calls are temporarily unavailable</h2><p className="muted">Precall is waiting for the latest sports calls to load.</p></section>
      ) : activeCount === 0 ? (
        <section className="empty">
          <h2>No active Sports Live Calls</h2>
        </section>
      ) : (
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        grouped.map((group: any) => group.ideas.length ? (
          <section key={group.status} className="section-spaced">
            <section className="section-heading">
              <div>
                <p className="eyebrow">{statusLabel(group.status)}</p>
                <h2>{statusIntro(group.status)}</h2>
              </div>
              <p>{statusDescription(group.status)}</p>
            </section>
            <section className="sports-grid">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {group.ideas.map((idea: any) => <SportsCard idea={idea} key={idea.id} />)}
            </section>
          </section>
        ) : null)
      )}
    </main>
  );
}
