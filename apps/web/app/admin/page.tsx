import { AdminConsole } from "../../components/admin-console";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="shell page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Operator console</p>
          <h1>Admin arena</h1>
        </div>
        <p>
          Connect a whitelisted wallet to reveal private Precall operations. Non-admin wallets cannot see or run the worker controls.
        </p>
      </section>
      <AdminConsole />
    </main>
  );
}
