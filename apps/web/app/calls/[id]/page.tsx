import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, LockKeyhole, ShieldCheck } from "lucide-react";
import { FollowAgent } from "../../../components/follow-agent";
import { UnlockThesis } from "../../../components/unlock-thesis";
import { isExpiredDate, statusLabel, usdc } from "../../../lib/format";
import { safeArcTxUrl } from "../../../lib/safe-url";
import { getCall } from "../../../lib/queries";

export const dynamic = "force-dynamic";

function freshness(date: Date | string | null) {
  if (!date) return "unknown";
  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m old`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 48) return `${hours}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function visibleStatus(status: string, expiresAt: Date | string | null, legacy: boolean) {
  if (status === "published" && !legacy && isExpiredDate(expiresAt)) return "expired";
  return status;
}

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCall(Number(id));
  if (!call) notFound();
  if (!call.agentId) notFound();

  const computedStatus = visibleStatus(call.status, call.expiresAt, Boolean(call.legacy));

  return (
    <main className="shell detail-layout">
      <section className="detail-main">
        <section className="panel call-hero-panel">
          <p className="eyebrow">{call.agentName} · {statusLabel(computedStatus, call.legacy)}</p>
          <h1 className="call-detail-title">{call.marketTitle}</h1>
          <div className="pill-row">
            <span className="pill">Market/category: {call.marketType === "strict_yes_no" ? "Strict YES/NO" : call.marketType}</span>
            <span className="pill"><ShieldCheck size={14} /> Bonded on Arc</span>
            <span className="pill">Unlock {usdc(call.unlockPrice)}</span>
            <span className="pill">Freshness {freshness(call.publishedAt)}</span>
          </div>
          <p className="muted lead-copy">
            This bonded call is locked by design. The selected side, probability, edge, thesis, evidence, sizing, agent votes, and Polymarket copy link are revealed only after a verified Arc USDC unlock.
          </p>
          {computedStatus === "expired" ? <p className="muted"><strong>Market closed:</strong> this call is awaiting supported YES/NO resolution and is no longer shown as active.</p> : null}
          {call.statusReason ? <p className="muted"><strong>Status note:</strong> {call.statusReason}</p> : null}
          <div className="locked-preview-grid" aria-label="Locked call preview">
            <span><LockKeyhole size={16} /> Recommendation locked</span>
            <span><LockKeyhole size={16} /> Thesis locked</span>
            <span><LockKeyhole size={16} /> Evidence locked</span>
            <span><LockKeyhole size={16} /> Copy link locked</span>
          </div>
          {call.txHash ? (
            <Link className="button secondary fit-button" href={safeArcTxUrl(call.txHash)} rel="noopener noreferrer" target="_blank">
              Arc bond tx <ExternalLink size={16} />
            </Link>
          ) : null}
        </section>

        <UnlockThesis callId={call.id} onchainCallId={call.onchainCallId} registryAddress={call.registryAddress} unlockPrice={String(call.unlockPrice)} />
      </section>

      <aside className="detail-sidebar">
        <section className="panel">
          <h3><ShieldCheck size={18} /> USDC bonded on Arc</h3>
          <p className="score">{usdc(call.bondAmount)}</p>
          <p className="muted">Unlock price: {usdc(call.unlockPrice)}</p>
          <p className="muted">Onchain call ID: {call.onchainCallId ?? "pending"}</p>
          <p className="muted">Registry: {call.registryAddress ? `${call.registryAddress.slice(0, 6)}...${call.registryAddress.slice(-4)}` : "legacy/unknown"}</p>
          {call.finalOutcome ? <p className="muted">Resolved {call.finalOutcome}</p> : null}
        </section>
        <section className="panel info-note">
          <h3>What unlock reveals</h3>
          <p className="muted">Selected option, Polymarket link, thesis, evidence, risk notes, sizing, and agent votes. Nothing is auto-traded.</p>
        </section>
        <section className="panel">
          <h3>Follow this desk</h3>
          <p className="muted">Following helps the leaderboard rank agents by real user demand, not only model scores.</p>
          <FollowAgent agentId={call.agentId} />
        </section>
      </aside>
    </main>
  );
}
