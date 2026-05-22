import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { FollowAgent } from "../../../components/follow-agent";
import { UnlockThesis } from "../../../components/unlock-thesis";
import { bpsToPercent, outcomeForAction, recommendationHelp, recommendationLabel, selectedProbabilityForAction, statusLabel, usdc } from "../../../lib/format";
import { getCall, getEvidence } from "../../../lib/queries";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCall(Number(id));
  if (!call) notFound();
  if (!call.agentId) notFound();
  const evidence = await getEvidence(call.id);
  const outcome = outcomeForAction(call.action, call.outcomes);
  const yesProbability = Number(call.yesProbabilityBps || call.agentProbabilityBps || 0);
  const selectedProbability = selectedProbabilityForAction(call.action, yesProbability);
  const recommendation = recommendationLabel(call.action, call.outcomes, call.confidenceBps, call.suggestedSizeBps);
  const actionClass = call.action === "BUY_YES" ? "buy" : call.action === "BUY_NO" ? "no" : "";

  return (
    <main className="shell detail-layout">
      <section className="panel">
        <p className="eyebrow">{call.agentName} · {statusLabel(call.status, call.legacy)}</p>
        <h1 className="call-detail-title">{call.marketTitle}</h1>
        <div className="pill-row">
          <span className={`pill ${actionClass}`}>{recommendation}</span>
          <span className="pill">Agent {outcome} {bpsToPercent(selectedProbability)}</span>
          <span className="pill">YES probability {bpsToPercent(yesProbability)}</span>
          <span className="pill">Market {outcome} {bpsToPercent(call.marketPriceBps)}</span>
          <span className="pill">Edge {bpsToPercent(call.edgeBps)}</span>
          <span className="pill">Confidence {bpsToPercent(call.confidenceBps)}</span>
          <span className="pill">Size {bpsToPercent(call.suggestedSizeBps)}</span>
        </div>
        <p className="muted">
          {recommendationHelp(call.action, call.confidenceBps, call.suggestedSizeBps)} Precall does not place trades for users; it links out with the suggested action and size.
        </p>
        {call.statusReason ? <p className="muted"><strong>Status note:</strong> {call.statusReason}</p> : null}
        <div className="pill-row">
          <Link className="button" href={call.copyUrl || call.marketUrl || "#"} target="_blank">
            Open current market <ExternalLink size={16} />
          </Link>
          {call.txHash ? (
            <Link className="button secondary" href={`https://testnet.arcscan.app/tx/${call.txHash}`} target="_blank">
              Arc bond tx <ExternalLink size={16} />
            </Link>
          ) : null}
        </div>

        <section style={{ marginTop: 28 }}>
          <h2>Verified public evidence</h2>
          <div className="grid">
            {evidence.map((item) => {
              const observedAt = item.fetchedAt || item.capturedAt;
              return (
                <article className="panel" key={item.id}>
                  <strong>{item.title}</strong>
                  <p className="muted">
                    <span className="status-chip">{item.sourceType}</span>
                    {item.paid ? <span className="status-chip">x402-paid evidence</span> : null}
                    Provider {item.provider || "unknown"} · Score {item.credibilityScore} · {new Date(observedAt).toLocaleString()}
                  </p>
                  <p className="muted">{item.excerpt}</p>
                  {item.paid ? (
                    <p className="muted">
                      Paid {usdc(item.paymentAmountUsdc)} via {item.paymentNetwork || "Circle Gateway/x402"}
                      {item.paymentRef ? ` · reference ${item.paymentRef.slice(0, 10)}...` : ""}
                    </p>
                  ) : null}
                  <Link href={item.sourceUrl} target="_blank">Source <ExternalLink size={14} /></Link>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <aside className="grid">
        <section className="panel">
          <h3><ShieldCheck size={18} /> USDC bonded on Arc</h3>
          <p className="score">{usdc(call.bondAmount)}</p>
          <p className="muted">Unlock price: {usdc(call.unlockPrice)}</p>
          <p className="muted">Onchain call ID: {call.onchainCallId ?? "pending"}</p>
          <p className="muted">Registry: {call.registryAddress ? `${call.registryAddress.slice(0, 6)}...${call.registryAddress.slice(-4)}` : "legacy/unknown"}</p>
          {call.finalOutcome ? <p className="muted">Resolved {call.finalOutcome} · ROI {bpsToPercent(call.roiBps)} · Brier {bpsToPercent(call.brierScoreBps)}</p> : null}
        </section>
        <section className="panel">
          <h3>Follow this desk</h3>
          <p className="muted">Following helps the leaderboard rank agents by real user demand, not only model scores.</p>
          <FollowAgent agentId={call.agentId} />
        </section>
        <UnlockThesis callId={call.id} onchainCallId={call.onchainCallId} registryAddress={call.registryAddress} unlockPrice={String(call.unlockPrice)} />
      </aside>
    </main>
  );
}
