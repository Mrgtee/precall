"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Play, ShieldAlert, ShieldCheck, Stethoscope, UserMinus, UserPlus, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { shortAddress, usdc } from "../lib/format";

type AdminAction = "health" | "run-once" | "sports" | "resolve" | "expire";
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
    liveCallsStored?: number;
    sportsCalls?: unknown[];
    callsByStatus?: Record<string, number>;
    skipped?: unknown[];
    failed?: unknown[];
    resolved?: unknown[];
    expired?: number;
    sportsExpired?: number;
    total?: number;
    message?: string;
  };
  error?: string;
  status?: string;
  async?: boolean;
  alreadyRunning?: boolean;
  job?: { id?: string; status?: string; startedAt?: string; durationMs?: number; error?: string };
  timedOut?: boolean;
  timeoutMs?: number;
  suggestedCommand?: string;
  message?: string;
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
    unlocks?: number;
    thesisUnlocks?: number;
    unlockVolume?: string;
    dailyX402Spend?: string;
    x402ApiPayments?: number;
    bondVolume?: string;
    thesisUnlockVolume?: string;
    sportsUnlockVolume?: string;
    activeSportsCalls?: number;
    expiredSportsCalls?: number;
    sportsUnlocks?: number;
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
    x402ChainCandidates?: string[];
    gatewayBalanceStatus: string;
    gatewayAvailableUsdc?: string;
    gatewayBalancesByChain?: Array<{ chain: string; status: string; gatewayAvailableUsdc?: string; error?: string }>;
    allowedHosts: string[];
    latestX402SelectedChain?: string;
    latestX402FailureReason?: string;
    latestX402SupportChecks?: unknown;
    gatewayError?: string;
    dailyBudgetUsdc: string;
    maxPaymentUsdc: string;
  };
  latestX402Payment?: { provider?: string; amountUsdc?: string; amount?: string; status?: string; error?: string; chain?: string } | null;
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
    action: "sports",
    title: "Run sports scan",
    description: "Scan daily sports markets, pay x402 evidence when available, run the sports council, and store non-bonded Sports Live Calls with risk labels.",
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

function resultCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.expired === "number") return record.expired;
    if (Array.isArray(record.calls)) return record.calls.length;
  }
  return 0;
}

function resultArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
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
  const publishedCount = result?.command === "run-once" ? resultArrayLength(result.result?.published) : null;
  const skippedCount = result?.command === "run-once" || result?.command === "sports" ? resultArrayLength(result.result?.skipped) : null;
  const sportsLiveCallsStored = result?.command === "sports" ? (result.result?.liveCallsStored ?? resultArrayLength(result.result?.sportsCalls)) : null;
  const sportsStatusCounts = result?.command === "sports" ? result.result?.callsByStatus : null;
  const failedCount = resultArrayLength(result?.result?.failed);
  const resolvedCount = resultCount(result?.result?.resolved);
  const expiredCount = resultCount(result?.result?.expired);
  const timedOut = Boolean(result?.timedOut || result?.status === "timeout");
  const asyncStarted = Boolean(result?.async || result?.status === "running");

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
      setStatus(action === "run-once" ? "Triggering Railway agent cycle. This can take a few minutes..." : action === "sports" ? "Triggering Railway sports scan. This can take a few minutes..." : "Submitting admin action...");
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
      const actionTimedOut = Boolean(runPayload.timedOut || runPayload.status === "timeout");
      const actionStartedAsync = Boolean(runPayload.async || runPayload.status === "running");
      setStatus(runResponse.ok
        ? actionStartedAsync
          ? "Railway job started. Long-running worker commands continue in Railway; check logs or job status before re-running."
          : runPayload.proxiedToRailway ? "Action complete via Railway." : "Action complete."
        : actionTimedOut ? "Railway action did not finish before the Vercel proxy timeout. Check Railway logs before re-running." : "Action failed.");
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
              <p className="muted">Settlement chain: Arc Testnet · Default Gateway chain: {summary.circleStack.gatewayChain}</p>
              <p className="muted">x402 candidates: {(summary.circleStack.x402ChainCandidates || [summary.circleStack.gatewayChain]).join(", ")}</p>
              <p className="muted">Gateway available: {summary.circleStack.gatewayAvailableUsdc ? usdc(summary.circleStack.gatewayAvailableUsdc) : "not available"} · Balance status: {summary.circleStack.gatewayBalanceStatus}</p>
              {summary.circleStack.gatewayBalancesByChain?.length ? <p className="muted">Balances by chain: {summary.circleStack.gatewayBalancesByChain.map((balance) => `${balance.chain}: ${balance.gatewayAvailableUsdc ? usdc(balance.gatewayAvailableUsdc) : balance.status}`).join(" · ")}</p> : null}
              <p className="muted">Worker execution: {summary.config.workerTriggerConfigured ? "proxied to Railway" : summary.config.scheduledWorkersDisabled ? "disabled on Vercel" : "local Vercel runtime"}</p>
              <p className="muted">Allowed hosts: {summary.circleStack.allowedHosts.join(", ") || "none"}</p>
              {summary.circleStack.latestX402SelectedChain ? <p className="muted">Latest selected x402 chain: {summary.circleStack.latestX402SelectedChain}</p> : null}
              {summary.circleStack.latestX402FailureReason ? <p className="muted">Latest x402 failure: {summary.circleStack.latestX402FailureReason}</p> : null}
              {summary.circleStack.gatewayError ? <p className="muted">Last Gateway error: {summary.circleStack.gatewayError}</p> : null}
            </div>
            <aside className="panel info-note">
              <h3>Spend controls</h3>
              <p className="muted">Daily x402 spend: {usdc(summary.counts?.dailyX402Spend || 0)} / {usdc(summary.circleStack.dailyBudgetUsdc)}</p>
              <p className="muted">Max x402 request: {usdc(summary.circleStack.maxPaymentUsdc)}</p>
              <p className="muted">x402 API payments: {summary.counts?.x402ApiPayments ?? 0}</p>
              {summary.latestX402Payment ? <p className="muted">Latest x402: {summary.latestX402Payment.provider || "x402"} · {usdc(summary.latestX402Payment.amountUsdc || summary.latestX402Payment.amount || 0)} · {summary.latestX402Payment.status}{summary.latestX402Payment.chain ? ` · ${summary.latestX402Payment.chain}` : ""}{summary.latestX402Payment.error ? ` · ${summary.latestX402Payment.error}` : ""}</p> : <p className="muted">Latest x402: none recorded</p>}
              <p className="muted">Arc bond volume: {usdc(summary.counts?.bondVolume || 0)}</p>
              <p className="muted">Total unlocks: {summary.counts?.unlocks ?? 0} · Bonded thesis {summary.counts?.thesisUnlocks ?? 0} · Sports {summary.counts?.sportsUnlocks ?? 0}</p>
              <p className="muted">Thesis unlock volume: {usdc(summary.counts?.thesisUnlockVolume || summary.counts?.unlockVolume || 0)}</p>
              <p className="muted">Sports unlock volume: {usdc(summary.counts?.sportsUnlockVolume || 0)} · Active sports calls: {summary.counts?.activeSportsCalls ?? 0}</p>
            </aside>
          </section>
        </>
      ) : null}

      <div className="admin-actions">
        {actions.map((item) => (
          <article className={`panel admin-action ${item.danger ? "danger" : ""}`} key={item.action}>
            <h3>{item.icon} {item.title}</h3>
            <p className="muted">{item.description}</p>
            {item.action === "run-once" || item.action === "sports" ? <p className="muted"><strong>Spend note:</strong> Railway should have Gateway/x402 enabled; keep x402 not-required until a provider/chain support check succeeds.</p> : null}
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
        {asyncStarted ? <p className="muted"><strong>Async Railway job:</strong> {result?.message || "The worker job has started and will continue outside this browser request."}{result?.job?.id ? <> Job ID <code>{result.job.id}</code>.</> : null} Use <code>{result?.suggestedCommand}</code> for a direct terminal run if needed.</p> : null}
        {timedOut ? <p className="muted"><strong>Timeout:</strong> Railway did not return before the Vercel proxy timeout. The worker may still be running; check Railway logs and use <code>{result?.suggestedCommand}</code> if you need to run it directly.</p> : null}
        {result?.ok && !asyncStarted && publishedCount === 0 ? <p className="muted">No new call was published, so the dashboard will not change yet. The agent cycle ran, but every candidate was filtered out or failed required evidence/payment gates.</p> : null}
        {!asyncStarted && publishedCount && publishedCount > 0 ? <p className="muted">Published {publishedCount} new call{publishedCount === 1 ? "" : "s"}. Refresh the dashboard to see the latest bonded signal.</p> : null}
        {!asyncStarted && sportsLiveCallsStored && sportsLiveCallsStored > 0 ? <p className="muted">Stored {sportsLiveCallsStored} Sports Live Call{sportsLiveCallsStored === 1 ? "" : "s"}. Refresh /sports to see the latest board.</p> : null}
        {!asyncStarted && sportsStatusCounts ? <p className="muted">Sports status counts: strong {sportsStatusCounts.strong_call || 0}, lean {sportsStatusCounts.lean_call || 0}, high-risk {sportsStatusCounts.high_risk_call || 0}, avoid {sportsStatusCounts.avoid_call || 0}.</p> : null}
        {result?.command === "expire" && result.result?.sportsExpired !== undefined ? <p className="muted">Expired {result.result.sportsExpired} sports live call{result.result.sportsExpired === 1 ? "" : "s"}. Expired sports calls are excluded from active counts.</p> : null}
        {skippedCount && skippedCount > 0 ? <p className="muted">Skipped {skippedCount} market{skippedCount === 1 ? "" : "s"}. Sports skips are reserved for invalid, expired, low-liquidity, unsupported, or unclear markets.</p> : null}
        {result ? (
          <div className="admin-result-grid" aria-label="Latest admin run summary">
            <div><span>Command</span><strong>{result.command || "unknown"}</strong></div>
            <div><span>Duration</span><strong>{result.durationMs ? `${Math.round(result.durationMs / 1000)}s` : asyncStarted ? "started" : "n/a"}</strong></div>
            <div><span>Skipped</span><strong>{skippedCount ?? 0}</strong></div>
            <div><span>Failed</span><strong>{failedCount}</strong></div>
            <div><span>Resolved</span><strong>{resolvedCount}</strong></div>
            <div><span>Expired</span><strong>{expiredCount}</strong></div>
            {asyncStarted ? <div><span>Railway job</span><strong>{result.job?.status || "running"}</strong></div> : null}
            {timedOut ? <div><span>Timeout</span><strong>{result?.timeoutMs ? `${Math.round(result.timeoutMs / 1000)}s` : "yes"}</strong></div> : null}
          </div>
        ) : null}
        {failedCount > 0 ? <p className="muted"><strong>Latest error:</strong> {(result?.result?.failed?.[0] as { error?: string } | undefined)?.error || result?.error || "See raw output for details."}</p> : null}
        {result ? (
          <details className="raw-json-toggle">
            <summary>Show raw worker JSON</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        ) : null}
        <p className="muted">If a bonded run returns an empty <code>published</code> list, the dashboard will not gain new bonded calls. If a sports run returns zero <code>liveCallsStored</code>, every discovered sports market was invalid, unsupported, or failed before analysis.</p>
      </section>
    </section>
  );
}
