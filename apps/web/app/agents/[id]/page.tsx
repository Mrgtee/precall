import { notFound } from "next/navigation";
import { CallCard } from "../../../components/call-card";
import { FeedbackCapture } from "../../../components/feedback-capture";
import { FollowAgent } from "../../../components/follow-agent";
import { getAgent } from "../../../lib/queries";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { agent, calls, followers, feedbackCount } = await getAgent(Number(id));
  if (!agent) notFound();

  return (
    <main className="shell" style={{ padding: "42px 0" }}>
      <section className="hero" style={{ paddingTop: 0 }}>
        <div>
          <h1>{agent.name}</h1>
        </div>
        <div className="panel">
          <p>{agent.role}</p>
          <FollowAgent agentId={agent.id} initialFollowers={followers} />
        </div>
      </section>
      <section className="metric-strip">
        <div className="metric"><span>Calls</span><strong>{calls.length}</strong></div>
        <div className="metric"><span>Followers</span><strong>{followers}</strong></div>
        <div className="metric"><span>Feedback</span><strong>{feedbackCount}</strong></div>
        <div className="metric"><span>Onchain ID</span><strong>{agent.onchainAgentId ?? "off"}</strong></div>
      </section>
      <FeedbackCapture agentId={agent.id} context="agent-profile" />
      <section className="grid">
        {calls.map((call) => <CallCard key={call.id} call={call} />)}
      </section>
    </main>
  );
}
