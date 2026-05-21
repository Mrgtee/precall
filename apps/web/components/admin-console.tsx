"use client";

import { useMemo, useState } from "react";
import { Activity, Play, ShieldAlert, ShieldCheck, Stethoscope, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { shortAddress } from "../lib/format";

type AdminAction = "health" | "run-once" | "resolve";

type ChallengeResponse = {
  challenge: unknown;
  message: string;
  error?: string;
};

type AdminResult = {
  ok?: boolean;
  command?: string;
  durationMs?: number;
  result?: {
    published?: unknown[];
    resolved?: unknown[];
    total?: number;
    message?: string;
  };
  error?: string;
};

const actions: Array<{
  action: AdminAction;
  title: string;
  description: string;
  icon: React.ReactNode;
  danger?: boolean;
}> = [
  {
    action: "health",
    title: "Check worker health",
    description: "Verify hosted DB, model provider, Polymarket, and registry configuration without spending USDC.",
    icon: <Stethoscope size={18} />,
  },
  {
    action: "run-once",
    title: "Run agent now",
    description: "Scan live markets, run the agent council, and publish qualifying bonded calls on Arc.",
    icon: <Play size={18} />,
    danger: true,
  },
  {
    action: "resolve",
    title: "Resolve mature calls",
    description: "Check published calls against live market resolution data and submit reputation updates on Arc.",
    icon: <Activity size={18} />,
    danger: true,
  },
];

function adminWallets() {
  return (process.env.NEXT_PUBLIC_ADMIN_WALLETS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function AdminConsole() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const whitelist = useMemo(adminWallets, []);
  const normalized = address?.toLowerCase();
  const isWhitelisted = Boolean(normalized && whitelist.includes(normalized));
  const [active, setActive] = useState<AdminAction | "">("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<AdminResult | null>(null);
  const publishedCount = result?.command === "run-once" ? (result.result?.published?.length ?? 0) : null;

  async function runAction(action: AdminAction) {
    if (!address) return;
    setActive(action);
    setStatus("Preparing wallet challenge...");
    setResult(null);

    try {
      const challengeResponse = await fetch("/api/admin/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, address }),
      });
      const challengePayload = (await challengeResponse.json()) as ChallengeResponse;
      if (!challengeResponse.ok) throw new Error(challengePayload.error || "Challenge failed.");

      setStatus("Sign the admin action in your wallet...");
      const signature = await signMessageAsync({ message: challengePayload.message });

      setStatus(action === "run-once" ? "Running agent cycle. This can take a few minutes..." : "Submitting admin action...");
      const runResponse = await fetch("/api/admin/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          address,
          message: challengePayload.message,
          signature,
          challenge: challengePayload.challenge,
        }),
      });
      const runPayload = (await runResponse.json()) as AdminResult;
      setResult(runPayload);
      setStatus(runResponse.ok ? "Action complete." : "Action failed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setActive("");
    }
  }

  if (!isConnected || !address) {
    return (
      <section className="panel admin-gate">
        <ShieldCheck size={28} />
        <h2>Admin wallet required</h2>
        <p className="muted">Connect your whitelisted wallet to operate live Precall agents.</p>
        <button className="button" disabled={isPending || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })} type="button">
          <Wallet size={17} /> Connect admin wallet
        </button>
      </section>
    );
  }

  if (!isWhitelisted) {
    return (
      <section className="panel admin-gate warning">
        <ShieldAlert size={28} />
        <h2>Wallet not whitelisted</h2>
        <p className="muted">Connected wallet {shortAddress(address)} is not allowed to run admin actions.</p>
      </section>
    );
  }

  return (
    <section className="admin-console">
      <div className="panel admin-gate success">
        <ShieldCheck size={28} />
        <div>
          <h2>Admin access active</h2>
          <p className="muted">Connected as {shortAddress(address)}. Each action requires a fresh wallet signature.</p>
        </div>
      </div>

      <div className="admin-actions">
        {actions.map((item) => (
          <article className={`panel admin-action ${item.danger ? "danger" : ""}`} key={item.action}>
            <h3>{item.icon} {item.title}</h3>
            <p className="muted">{item.description}</p>
            {item.action === "run-once" ? (
              <p className="muted"><strong>Spend note:</strong> can lock up to 8 USDC in Arc testnet bonds per full run.</p>
            ) : null}
            <button className={item.danger ? "button" : "button secondary"} disabled={Boolean(active)} onClick={() => runAction(item.action)} type="button">
              {active === item.action ? "Running..." : item.title}
            </button>
          </article>
        ))}
      </div>

      <section className="panel admin-output">
        <h3>Run output</h3>
        {status ? <p className="muted">{status}</p> : <p className="muted">No action run yet.</p>}
        {result?.ok && publishedCount === 0 ? (
          <p className="muted">
            No new call was published, so the dashboard will not change yet. The agent cycle ran, but every candidate was filtered out by liquidity, spread, confidence, edge, expiry, or duplicate-call checks.
          </p>
        ) : null}
        {publishedCount && publishedCount > 0 ? (
          <p className="muted">
            Published {publishedCount} new call{publishedCount === 1 ? "" : "s"}. Refresh the dashboard to see the latest bonded signal.
          </p>
        ) : null}
        {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
        <p className="muted">
          If a run returns an empty <code>published</code> list, the dashboard will not show a new call. That means the agent checked live markets but none passed the configured publish filters.
        </p>
      </section>
    </section>
  );
}
