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
          Operate live Precall agents from a whitelisted wallet. Actions are signed in your wallet and executed server-side with production secrets.
        </p>
      </section>
      <AdminConsole />
    </main>
  );
}
