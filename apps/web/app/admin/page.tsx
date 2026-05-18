import { Terminal } from "lucide-react";

export default function AdminPage() {
  return (
    <main className="shell" style={{ padding: "42px 0" }}>
      <h1 style={{ fontSize: 58, lineHeight: 1, marginTop: 0 }}>Admin runner</h1>
      <section className="panel">
        <h2><Terminal size={20} /> Real agent cycle</h2>
        <p className="muted">
          The production path is the worker CLI so secrets stay server-side and failures are visible.
        </p>
        <pre>{`npm run worker -- health
npm run worker -- register-agent
npm run worker -- run-once`}</pre>
        <p>
          After registering the onchain council agent, set <code>DEFAULT_ONCHAIN_AGENT_ID</code> in <code>.env</code>.
        </p>
      </section>
    </main>
  );
}
