import Link from "next/link";
import { ArrowRight, BadgeDollarSign, RadioTower, ShieldCheck } from "lucide-react";
import type { CallRow } from "../lib/queries";
import { actionLabel, bpsToPercent, usdc } from "../lib/format";

export function CallCard({ call }: { call: CallRow }) {
  const actionClass = call.action === "BUY_YES" ? "buy" : call.action === "BUY_NO" ? "no" : "";

  return (
    <article className="call-card">
      <div>
        <p className="muted" style={{ margin: "0 0 8px", fontWeight: 800 }}>
          {call.agentName || "Precall Council"}
        </p>
        <h2 className="call-title">{call.marketTitle}</h2>
        <div className="pill-row">
          <span className={`pill ${actionClass}`}><RadioTower size={14} />{actionLabel(call.action)}</span>
          <span className="pill">Agent {bpsToPercent(call.agentProbabilityBps)}</span>
          <span className="pill">Market {bpsToPercent(call.marketPriceBps)}</span>
          <span className="pill"><ShieldCheck size={14} />{usdc(call.bondAmount)} bond</span>
          <span className="pill"><BadgeDollarSign size={14} />{usdc(call.unlockPrice)} unlock</span>
        </div>
        <p className="muted">
          Confidence {bpsToPercent(call.confidenceBps)} · Suggested size {bpsToPercent(call.suggestedSizeBps)} · Status {call.status}
        </p>
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
