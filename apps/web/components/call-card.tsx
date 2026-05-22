import Link from "next/link";
import { ArrowRight, BadgeDollarSign, RadioTower, ShieldCheck } from "lucide-react";
import type { CallRow } from "../lib/queries";
import { bpsToPercent, outcomeForAction, recommendationHelp, recommendationLabel, selectedProbabilityForAction, statusLabel, usdc } from "../lib/format";

export function CallCard({ call }: { call: CallRow }) {
  const actionClass = call.action === "BUY_YES" ? "buy" : call.action === "BUY_NO" ? "no" : "";
  const outcome = outcomeForAction(call.action, call.outcomes);
  const yesProbability = Number(call.yesProbabilityBps || call.agentProbabilityBps || 0);
  const selectedProbability = selectedProbabilityForAction(call.action, yesProbability);
  const recommendation = recommendationLabel(call.action, call.outcomes, call.confidenceBps, call.suggestedSizeBps);

  return (
    <article className={`call-card ${call.legacy ? "legacy-call" : ""}`}>
      <div>
        <p className="muted" style={{ margin: "0 0 8px", fontWeight: 800 }}>
          {call.agentName || "Precall Council"} · <span className="status-chip">{statusLabel(call.status, call.legacy)}</span>
        </p>
        <h2 className="call-title">{call.marketTitle}</h2>
        <div className="pill-row">
          <span className={`pill ${actionClass}`}><RadioTower size={14} />{recommendation}</span>
          <span className="pill">Agent {outcome} {bpsToPercent(selectedProbability)}</span>
          <span className="pill">YES probability {bpsToPercent(yesProbability)}</span>
          <span className="pill">Market {outcome} {bpsToPercent(call.marketPriceBps)}</span>
          <span className="pill"><ShieldCheck size={14} />{usdc(call.bondAmount)} bond</span>
          <span className="pill"><BadgeDollarSign size={14} />{usdc(call.unlockPrice)} unlock</span>
        </div>
        <p className="muted">
          {recommendationHelp(call.action, call.confidenceBps, call.suggestedSizeBps)} · Confidence {bpsToPercent(call.confidenceBps)} · Size {bpsToPercent(call.suggestedSizeBps)}
        </p>
        {call.statusReason ? <p className="muted compact"><strong>Status note:</strong> {call.statusReason}</p> : null}
      </div>
      <aside className="side-score">
        <div>
          <span className="muted" style={{ fontWeight: 900 }}>EDGE</span>
          <div className="score">{bpsToPercent(call.edgeBps)}</div>
        </div>
        <Link className="button" href={`/calls/${call.id}`}>
          Open call <ArrowRight size={17} />
        </Link>
      </aside>
    </article>
  );
}
