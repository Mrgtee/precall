import { AgentManageConsole } from "../../../components/agent-manage-console";

export const dynamic = "force-dynamic";

export default function ManageAgentsPage() {
  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Owner console</p>
          <h1>Manage hosted agents</h1>
        </div>
        <p>Update the scope, unlock price, logical x402 budget, and live visibility of every agent your wallet owns. Review status remains admin-controlled.</p>
      </section>
      <AgentManageConsole />
    </main>
  );
}
