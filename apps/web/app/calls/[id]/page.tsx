import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { UnlockThesis } from "../../../components/unlock-thesis";
import { actionLabel, bpsToPercent, usdc } from "../../../lib/format";
import { getCall, getEvidence } from "../../../lib/queries";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCall(Number(id));
  if (!call) notFound();
  const evidence = await getEvidence(call.id);

  return (
    <main className="shell detail-layout">
      <section className="panel">
        <p className="muted" style={{ fontWeight: 900 }}>{call.agentName}</p>
        <h1 style={{ fontSize: 48, lineHeight: 1, marginTop: 0 }}>{call.marketTitle}</h1>
        <div className="pill-row">
          <span className="pill buy">{actionLabel(call.action)}</span>
          <span className="pill">Agent {bpsToPercent(call.agentProbabilityBps)}</span>
          <span className="pill">Market {bpsToPercent(call.marketPriceBps)}</span>
          <span className="pill">Edge {bpsToPercent(call.edgeBps)}</span>
          <span className="pill">Confidence {bpsToPercent(call.confidenceBps)}</span>
          <span className="pill">Size {bpsToPercent(call.suggestedSizeBps)}</span>
        </div>
        <p className="muted">
          Non-custodial copy signal. Precall does not place trades for users; it links out with the suggested action and size.
        </p>
        <div className="pill-row">
          <Link className="button" href={call.copyUrl || call.marketUrl || "#"} target="_blank">
            Copy on market <ExternalLink size={16} />
          </Link>
          {call.txHash ? (
            <Link className="button secondary" href={`https://testnet.arcscan.app/tx/${call.txHash}`} target="_blank">
              Arc bond tx <ExternalLink size={16} />
            </Link>
          ) : null}
        </div>

        <section style={{ marginTop: 28 }}>
          <h2>Public evidence</h2>
          <div className="grid">
            {evidence.map((item) => (
              <article className="panel" key={item.id}>
                <strong>{item.title}</strong>
                <p className="muted">{item.excerpt}</p>
                <Link href={item.sourceUrl} target="_blank">Source <ExternalLink size={14} /></Link>
              </article>
            ))}
          </div>
        </section>
      </section>

      <aside className="grid">
        <section className="panel">
          <h3><ShieldCheck size={18} /> Bonded on Arc</h3>
          <p className="score">{usdc(call.bondAmount)}</p>
          <p className="muted">Unlock price: {usdc(call.unlockPrice)}</p>
          <p className="muted">Onchain call ID: {call.onchainCallId ?? "pending"}</p>
        </section>
        <UnlockThesis callId={call.id} onchainCallId={call.onchainCallId} unlockPrice={String(call.unlockPrice)} />
      </aside>
    </main>
  );
}
