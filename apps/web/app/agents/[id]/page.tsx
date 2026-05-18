import { notFound } from "next/navigation";
import { CallCard } from "../../../components/call-card";
import { getAgent } from "../../../lib/queries";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agent, calls } = await getAgent(Number(id));
  if (!agent) notFound();

  return (
    <main className="shell" style={{ padding: "42px 0" }}>
      <section className="hero" style={{ paddingTop: 0 }}>
        <div>
          <h1>{agent.name}</h1>
        </div>
        <p>{agent.role}</p>
      </section>
      <section className="metric-strip">
        <div className="metric"><span>Calls</span><strong>{calls.length}</strong></div>
        <div className="metric"><span>Onchain ID</span><strong>{agent.onchainAgentId ?? "off"}</strong></div>
        <div className="metric"><span>Status</span><strong>{agent.active ? "Live" : "Paused"}</strong></div>
        <div className="metric"><span>Owner</span><strong>{agent.ownerWallet.slice(0, 6)}</strong></div>
      </section>
      <section className="grid">
        {calls.map((call) => <CallCard key={call.id} call={call} />)}
      </section>
    </main>
  );
}
