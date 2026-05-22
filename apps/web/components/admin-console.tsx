"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Play, ShieldAlert, ShieldCheck, Stethoscope, UserMinus, UserPlus, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { shortAddress, usdc } from "../lib/format";

type AdminAction = "health" | "run-once" | "resolve" | "expire";
type WalletAction = "admin-add" | "admin-remove";

type ChallengeResponse = {
  challenge: unknown;
  message: string;
  error?: string;
};

type AdminResult = {
  ok?: boolean;
  command?: string;
  durationMs?: number;
  proxiedToRailway?: boolean;
  result?: {
    checked?: unknown[];
    eligible?: unknown[];
    analyzed?: unknown[];
    published?: unknown[];
    skipped?: unknown[];
    failed?: unknown[];
    resolved?: unknown[];
    expired?: number;
    total?: number;
    message?: string;
  };
  error?: string;
};

type AdminWallet = {
  walletAddress: string;
  active: boolean;
  source: "env" | "database";
  label?: string;
  addedBy?: string;
};

type AdminSummary = {
  counts?: {
    liveCalls?: number;
    expiredCalls?: number;
    resolvedCalls?: number;
    unlockVolume?: string;
    dailyX402Spend?: string;
    x402ApiPayments?: number;
    bondVolume?: string;
    thesisUnlockVolume?: string;
  };
  config: {
    database: boolean;
    model: boolean;
    registry: boolean;
    circleEnrichment: boolean;
    workerTriggerConfigured?: boolean;
    scheduledWorkersDisabled?: boolean;
  };
  circleStack: {
    gatewayX402Enabled: boolean;
    gatewayX402Required?: boolean;
    gatewayChain: string;
    gatewayBalanceStatus: string;
    gatewayAvailableUsdc?: string;
    allowedHosts: string[];
    gatewayError?: string;
    dailyBudgetUsdc: string;
    maxPaymentUsdc: string;
  };
  latestX402Payment?: { provider?: string; amountUsdc?: string; amount?: string; status?: string; error?: string } | null;
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
    description: "Verify Railway worker, DB, model provider, Polymarket, Circle Gateway/x402, and registry configuration without publishing.",
    icon: <Stethoscope size={18} />,
  },
  {
    action: "run-once",
    title: "Run agent now",
    description: "Trigger Railway to scan markets, pay required x402 evidence, run the council, and publish qualifying bonded calls on Arc.",
    icon: <Play size={18} />,
    danger: true,
  },
  {
    action: "expire",
    title: "Mark expired calls",
    description: "Move matured but unresolved published calls into the awaiting-resolution state without spending USDC.",
    icon: <Activity size={18} />,
  },
  {
    action: "resolve",
    title: "Resolve mature calls",
    description: "Check supported calls against live market resolution data and submit reputation updates on Arc.",
    icon: <Activity size={18} />,
    danger: true,
  },
];

function Bool({ value }: { value: boolean }) {
  return <span className={`status-chip ${value ? "ok" : "warn"}`}>{value ? "true" : "false"}</span>;
}

export function AdminConsole() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [active, setActive] = useState<AdminAction | "">("");
  const [walletActive, setWalletActive] = useState<WalletAction | "">("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<AdminResult | null>(null);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [adminWallets, setAdminWallets] = useState<AdminWallet[]>([]);
  const [targetWallet, setTargetWallet] = useState("");
  const [walletStatus, setWalletStatus] = useState("");
  const publishedCount = result?.command === "run-once" ? (result.result?.published?.length ?? 0) : null;
  const skippedCount = result?.command === "run-once" ? (result.result?.skipped?.length ?? 0) : null;

  const refreshAdminData = useCallback(async (currentAddress = address) => {
    if (!currentAddress) return;
    const [summaryResponse, walletsResponse] = await Promise.all([
      fetch(`/api/admin/summary?address=${encodeURIComponent(currentAddress)}`, { cache: "no-store" }),
      fetch(`/api/admin/wallets?address=${encodeURIComponent(currentAddress)}`, { cache: "no-store" }),
    ]);
    if (summaryResponse.ok) setSummary((await summaryResponse.json()) as AdminSummary);
    const walletsPayload = (await walletsResponse.json().catch(() => ({ wallets: [] }))) as { wallets?: AdminWallet[] };
    if (walletsResponse.ok) setAdminWallets(walletsPayload.wallets || []);
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isConnected || !address) {
        setIsWhitelisted(false);
        setSummary(null);
        return;
      }
      setChecking(true);
      const response = await fetch(`/api/admin/status?address=${encodeURIComponent(address)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({ isAdmin: false }))) as { isAdmin?: boolean };
      if (cancelled) return;
      const allowed = Boolean(response.ok && payload.isAdmin);
      setIsWhitelisted(allowed);
      setChecking(false);
      if (allowed) await refreshAdminData(address);
    }
    check().catch(() => {
      if (!cancelled) {
        setChecking(false);
        setIsWhitelisted(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, refreshAdminData]);

  async function getChallenge(action: AdminAction | WalletAction, targetAddress?: string) {
    if (!address) throw new Error("Connect an admin wallet first.");
    const challengeResponse = await fetch("/api/admin/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, address, targetAddress }),
    });
    const challengePayload = (await challengeResponse.json()) as ChallengeResponse;
    if (!challengeResponse.ok) throw new Error(challengePayload.error || "Challenge failed.");
    const signature = await signMessageAsync({ message: challengePayload.message });
    return { challengePayload, signature };
  }

  async function runAction(action: AdminAction) {
    if (!address) return;
    setActive(action);
    setStatus("Preparing wallet challenge...");
    setResult(null);

    try {
      const { challengePayload, signature } = await getChallenge(action);
      setStatus(action === "run-once" ? "Triggering Railway agent cycle. This can take a few minutes..." : "Submitting admin action...");
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
      setStatus(runResponse.ok ? (runPayload.proxiedToRailway ? "Action complete via Railway." : "Action complete.") : "Action failed.");
      await refreshAdminData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setActive("");
    }
  }

  async function updateAdminWallet(action: WalletAction) {
    if (!address) return;
    setWalletActive(action);
    setWalletStatus("Preparing admin wallet challenge...");

    try {
      const cleanTarget = targetWallet.trim();
      const { challengePayload, signature } = await getChallenge(action, cleanTarget);
      const response = await fetch("/api/admin/wallets", {
        method: action === "admin-add" ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address,
          targetAddress: cleanTarget,
          message: challengePayload.message,
          signature,
          challenge: challengePayload.challenge,
        }),
      });
      const payload = (await response.json()) as { wallets?: AdminWallet[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Admin wallet update failed.");
      setAdminWallets(payload.wallets || []);
      setWalletStatus(action === "admin-add" ? "Admin wallet whitelisted." : "Admin wallet dewhitelisted.");
      setTargetWallet("");
    } catch (error) {
      setWalletStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setWalletActive("");
    }
  }

  if (!isConnected || !address) {
    return (
      <section className="panel admin-gate">
        <ShieldCheck size={28} />
        <h2>Admin wallet required</h2>
        <p className="muted">Connect your whitelisted wallet to reveal Precall operator controls.</p>
        <button className="button" disabled={isPending || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })} type="button">
          <Wallet size={17} /> Connect admin wallet
        </button>
      </section>
    );
  }

  if (checking) {
    return <section className="panel admin-gate"><ShieldCheck size={28} /><h2>Checking admin access...</h2></section>;
  }

  if (!isWhitelisted) {
    return (
      <section className="panel admin-gate warning">
        <ShieldAlert size={28} />
        <h2>Admin access hidden</h2>
        <p className="muted">Connected wallet {shortAddress(address)} is not whitelisted, so operator controls are not shown.</p>
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

      {summary ? (
        <>
          <section className="metric-strip">
            <div className="metric"><span>DB</span><strong><Bool value={summary.config.database} /></strong></div>
            <div className="metric"><span>Model on Vercel</span><strong><Bool value={summary.config.model} /></strong></div>
            <div className="metric"><span>Arc registry</span><strong><Bool value={summary.config.registry} /></strong></div>
            <div className="metric"><span>Railway trigger</span><strong><Bool value={Boolean(summary.config.workerTriggerConfigured)} /></strong></div>
          </section>
          <section className="panel info-split">
            <div>
              <h2>Circle Agent Stack status</h2>
              <p>Gateway x402 enabled <Bool value={summary.circleStack.gatewayX402Enabled} /></p>
              <p>Gateway x402 required <Bool value={Boolean(summary.circleStack.gatewayX402Required)} /></p>
              <p className="muted">Chain: {summary.circleStack.gatewayChain} · Balance status: {summary.circleStack.gatewayBalanceStatus}</p>
              <p className="muted">Gateway available: {summary.circleStack.gatewayAvailableUsdc ? usdc(summary.circleStack.gatewayAvailableUsdc) : "not available"}</p>
              <p className="muted">Worker execution: {summary.config.workerTriggerConfigured ? "proxied to Railway" : summary.config.scheduledWorkersDisabled ? "disabled on Vercel" : "local Vercel runtime"}</p>
              <p className="muted">Allowed hosts: {summary.circleStack.allowedHosts.join(", ") || "none"}</p>
              {summary.circleStack.gatewayError ? <p className="muted">Last Gateway error: {summary.circleStack.gatewayError}</p> : null}
            </div>
            <aside className="panel info-note">
              <h3>Spend controls</h3>
              <p className="muted">Daily x402 spend: {usdc(summary.counts?.dailyX402Spend || 0)} / {usdc(summary.circleStack.dailyBudgetUsdc)}</p>
              <p className="muted">Max x402 request: {usdc(summary.circleStack.maxPaymentUsdc)}</p>
              <p className="muted">x402 API payments: {summary.counts?.x402ApiPayments ?? 0}</p>
              {summary.latestX402Payment ? <p className="muted">Latest x402: {summary.latestX402Payment.provider || "x402"} · {usdc(summary.latestX402Payment.amountUsdc || summary.latestX402Payment.amount || 0)} · {summary.latestX402Payment.status}{summary.latestX402Payment.error ? ` · ${summary.latestX402Payment.error}` : ""}</p> : <p className="muted">Latest x402: none recorded</p>}
              <p className="muted">Arc bond volume: {usdc(summary.counts?.bondVolume || 0)}</p>
              <p className="muted">Thesis unlock volume: {usdc(summary.counts?.thesisUnlockVolume || summary.counts?.unlockVolume || 0)}</p>
            </aside>
          </section>
        </>
      ) : null}

      <div className="admin-actions">
        {actions.map((item) => (
          <article className={`panel admin-action ${item.danger ? "danger" : ""}`} key={item.action}>
            <h3>{item.icon} {item.title}</h3>
            <p className="muted">{item.description}</p>
            {item.action === "run-once" ? <p className="muted"><strong>Spend note:</strong> Railway must have Gateway/x402 enabled and required for production admin runs.</p> : null}
            <button className={item.danger ? "button" : "button secondary"} disabled={Boolean(active)} onClick={() => runAction(item.action)} type="button">
              {active === item.action ? "Running..." : item.title}
            </button>
          </article>
        ))}
      </div>

      <section className="panel admin-output">
        <h3>Admin wallet allowlist</h3>
        <p className="muted">Whitelist or dewhitelist operator wallets. Env-configured wallets can be overridden by a database dewhitelist row.</p>
        <div className="hero-actions">
          <input aria-label="Admin wallet address" className="admin-input" onChange={(event) => setTargetWallet(event.target.value)} placeholder="0x admin wallet" value={targetWallet} />
          <button className="button secondary" disabled={Boolean(walletActive)} onClick={() => updateAdminWallet("admin-add")} type="button"><UserPlus size={16} /> Whitelist</button>
          <button className="button secondary" disabled={Boolean(walletActive)} onClick={() => updateAdminWallet("admin-remove")} type="button"><UserMinus size={16} /> Dewhitelist</button>
        </div>
        {walletStatus ? <p className="muted">{walletStatus}</p> : null}
        <div className="grid">
          {adminWallets.map((wallet) => (
            <article className="panel" key={wallet.walletAddress}>
              <strong>{shortAddress(wallet.walletAddress)}</strong>
              <p className="muted"><span className={`status-chip ${wallet.active ? "ok" : "warn"}`}>{wallet.active ? "active" : "disabled"}</span> Source {wallet.source}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel admin-output">
        <h3>Run output</h3>
        {status ? <p className="muted">{status}</p> : <p className="muted">No action run yet.</p>}
        {result?.ok && publishedCount === 0 ? <p className="muted">No new call was published, so the dashboard will not change yet. The agent cycle ran, but every candidate was filtered out or failed required evidence/payment gates.</p> : null}
        {publishedCount && publishedCount > 0 ? <p className="muted">Published {publishedCount} new call{publishedCount === 1 ? "" : "s"}. Refresh the dashboard to see the latest bonded signal.</p> : null}
        {skippedCount && skippedCount > 0 ? <p className="muted">Filtered {skippedCount} market{skippedCount === 1 ? "" : "s"}. This is expected when live markets fail V1 eligibility or quality gates.</p> : null}
        {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
        <p className="muted">If a run returns an empty <code>published</code> list, the dashboard will not show a new call. That means no live market passed all configured filters and required evidence checks.</p>
      </section>
    </section>
  );
}
