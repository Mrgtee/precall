import Link from "next/link";
import { ArrowRight, BadgeDollarSign, ExternalLink, ShieldCheck } from "lucide-react";
import type { CallRow } from "../lib/queries";
import { statusLabel, usdc } from "../lib/format";

function freshness(date: Date | string | null) {
  if (!date) return "unknown age";
  const createdAt = new Date(date).getTime();
  const diffMinutes = Math.max(0, Math.round((Date.now() - createdAt) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m old`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function categoryForCall(call: CallRow) {
  if (call.marketType === "strict_yes_no") return "Strict YES/NO";
  return call.marketType || "Prediction market";
}

export function CallCard({ call }: { call: CallRow }) {
  return (
    <article className={`call-card ${call.legacy ? "legacy-call" : ""}`}>
      <div>
        <p className="muted" style={{ margin: "0 0 8px", fontWeight: 800 }}>
          {call.agentName || "Precall Council"} · <span className="status-chip">{statusLabel(call.status, call.legacy)}</span>
        </p>
        <h2 className="call-title">{call.marketTitle}</h2>
        <div className="pill-row">
          <span className="pill">{categoryForCall(call)}</span>
          <span className="pill"><ShieldCheck size={14} /> Bonded on Arc</span>
          <span className="pill"><BadgeDollarSign size={14} /> {usdc(call.unlockPrice)} unlock</span>
          <span className="pill">Freshness {freshness(call.publishedAt)}</span>
        </div>
        <p className="muted">
          Pick direction, probability, edge, evidence, sizing, and Polymarket copy link are revealed only after a verified USDC thesis unlock on Arc.
        </p>
        {call.txHash ? (
          <Link href={`https://testnet.arcscan.app/tx/${call.txHash}`} target="_blank">
            Arc bond tx <ExternalLink size={14} />
          </Link>
        ) : null}
      </div>
      <aside className="side-score">
        <div>
          <span className="muted" style={{ fontWeight: 900 }}>LOCKED</span>
          <div className="score">{usdc(call.unlockPrice)}</div>
        </div>
        <Link className="button" href={`/calls/${call.id}`}>
          Open call <ArrowRight size={17} />
        </Link>
      </aside>
    </article>
  );
}
