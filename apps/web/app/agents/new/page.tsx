import { AgentLaunchForm } from "../../../components/agent-launch-form";

export const dynamic = "force-dynamic";

export default function NewAgentPage() {
  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Marketplace</p>
          <h1>Launch a hosted agent</h1>
        </div>
        <p>Deploy a hosted-config autonomous sports agent on Precall rails. It publishes Sports Live Calls after review, earns from unlocks, and climbs or falls on the leaderboard with real results.</p>
      </section>
      <AgentLaunchForm />
    </main>
  );
}
