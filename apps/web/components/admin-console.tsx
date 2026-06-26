"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Play, ShieldAlert, ShieldCheck, Stethoscope, UserMinus, UserPlus, Wallet, Clock, Coins, ExternalLink } from "lucide-react";
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
    x402RailStatusLabel?: string;
    gatewayChain: string;
    x402PaymentNetworkLabel?: string;
    x402AcceptedNetworks?: string[];
    x402FacilitatorUrl?: string;
    x402ProductionMode?: boolean;
    x402ConfigWarnings?: string[];
    x402ConfigErrors?: string[];
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
  latestRuns?: Array<{
    id: number;
    status: string;
    model: string;
    inputs: unknown;
    outputs: unknown;
    costs: unknown;
    failure: string | null;
    publishedCallId: number | null;
    evidenceContext: unknown;
    retryCount: number;
    latencyMs: number;
    createdAt: string;
  }>;
  awaitingResolution?: Array<{
    id: number;
    onchainCallId: number | null;
    action: string;
    marketPriceBps: number;
    agentProbabilityBps: number;
    yesProbabilityBps: number;
    edgeBps: number;
    confidenceBps: number;
    suggestedSizeBps: number;
    bondAmount: string;
    unlockPrice: string;
    status: string;
    statusReason: string;
    marketType: string;
    registryAddress: string;
    legacy: boolean;
    txHash: string | null;
    copyUrl: string;
    publishedAt: string;
    expiresAt: string | null;
    marketTitle: string;
    marketUrl: string;
    outcomes: string[];
    liquidityUsd: string;
    agentId: number;
    agentName: string;
    finalOutcome: string | null;
    roiBps: number | null;
    brierScoreBps: number | null;
    resolverTx: string | null;
  }>;
  latestCircleActions?: Array<{
    id: number;
    actionType: string;
    provider: string;
    url: string | null;
    walletAddress: string;
    amount: string;
    amountUsdc: string;
    chain: string;
    txHash: string | null;
    paymentReference: string | null;
    paymentRef: string | null;
    relatedMarketId: string | null;
    relatedCallId: number | null;
    relatedAgentId: number | null;
    agentRunId: number | null;
    relatedAgentRunId: number | null;
    status: string;
    error: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
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
      <div className="panel admin-gate success" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <ShieldCheck size={28} />
          <div>
            <h2>Admin access active</h2>
            <p className="muted">Connected as {shortAddress(address)}. Each action requires a fresh wallet signature.</p>
          </div>
        </div>
        <button className="button secondary" onClick={() => refreshAdminData()} type="button">
          Refresh console
        </button>
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
              <p>x402 rail: {summary.circleStack.x402RailStatusLabel || "Worker-managed on Railway"}</p>
              {summary.circleStack.gatewayX402Required ? <p>Required mode: enabled for this runtime</p> : null}
              <p className="muted">Vercel does not hold the Circle buyer private key; Railway worker health is the source of truth for live x402 execution.</p>
              <p className="muted">Settlement chain: Arc · x402 payment network: {summary.circleStack.x402PaymentNetworkLabel || summary.circleStack.gatewayChain}</p>
              <p className="muted">Gateway chain: {summary.circleStack.gatewayChain} · Accepted networks: {(summary.circleStack.x402AcceptedNetworks || []).join(", ") || "not configured"}</p>
              <p className="muted">Facilitator: {summary.circleStack.x402FacilitatorUrl || "not configured"}</p>
              {summary.circleStack.x402ProductionMode ? <p className="muted"><strong>Production mode:</strong> Base Mainnet x402 uses real USDC with Railway spend caps.</p> : null}
              {summary.circleStack.x402ConfigWarnings?.length ? <p className="muted">x402 warnings: {summary.circleStack.x402ConfigWarnings.join(" ")}</p> : null}
              {summary.circleStack.x402ConfigErrors?.length ? <p className="muted">x402 config errors: {summary.circleStack.x402ConfigErrors.join(" ")}</p> : null}
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
              {summary.latestX402Payment ? <p className="muted">Latest x402: {summary.latestX402Payment.provider || "x402"} · {usdc(summary.latestX402Payment.amountUsdc || summary.latestX402Payment.amount || 0)} · {summary.latestX402Payment.status} · {summary.circleStack.x402PaymentNetworkLabel || summary.latestX402Payment.chain || "network unknown"}{summary.latestX402Payment.error ? ` · ${summary.latestX402Payment.error}` : ""}</p> : <p className="muted">Latest x402: none recorded</p>}
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
            {item.action === "run-once" || item.action === "sports" ? <p className="muted"><strong>Spend note:</strong> Railway should have Gateway/x402 enabled with explicit accepted networks and tight daily/per-request caps.</p> : null}
            <button className={item.danger ? "button" : "button secondary"} disabled={Boolean(active)} onClick={() => runAction(item.action)} type="button">
              {active === item.action ? "Running..." : item.title}
            </button>
          </article>
        ))}
      </div>

      {summary?.awaitingResolution && summary.awaitingResolution.length > 0 ? (
        <section className="panel admin-output">
          <h3><Clock size={18} /> Predictions awaiting resolution ({summary.awaitingResolution.length})</h3>
          <p className="muted">These calls are expired or failed resolution. You can trigger resolution by running the Resolve command.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Market</th>
                  <th>Outcome</th>
                  <th>Price</th>
                  <th>Bond</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {summary.awaitingResolution.map((call) => (
                  <tr key={call.id}>
                    <td><code>{call.onchainCallId ?? call.id}</code></td>
                    <td>
                      <a href={call.marketUrl} target="_blank" rel="noopener noreferrer" className="link-hover">
                        {call.marketTitle}
                      </a>
                    </td>
                    <td><span className="status-chip">{call.action}</span></td>
                    <td>{call.marketPriceBps / 100}%</td>
                    <td>{call.bondAmount} USDC</td>
                    <td>
                      <span className={`status-chip ${call.status === "failed_resolution" ? "warn" : "muted"}`}>
                        {call.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button secondary"
                        style={{ padding: "6px 12px", fontSize: "12px", width: "auto" }}
                        disabled={Boolean(active)}
                        onClick={() => runAction("resolve")}
                        type="button"
                      >
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        summary && (
          <section className="panel admin-output">
            <h3><Clock size={18} /> Predictions awaiting resolution</h3>
            <p className="muted">All published bonded calls are currently active or resolved. No predictions are awaiting resolution.</p>
          </section>
        )
      )}

      {summary?.latestRuns && summary.latestRuns.length > 0 ? (
        <section className="panel admin-output">
          <h3><Activity size={18} /> Latest agent runs</h3>
          <p className="muted">Recent worker cycles and their consensus results.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Model</th>
                  <th>Latency</th>
                  <th>Errors / Failure Details</th>
                </tr>
              </thead>
              <tbody>
                {summary.latestRuns.map((run) => (
                  <tr key={run.id}>
                    <td><code>#{run.id}</code></td>
                    <td>{new Date(run.createdAt).toLocaleTimeString()}</td>
                    <td>
                      <span className={`status-chip ${
                        run.status === "published" || run.status === "published-stored" ? "ok" :
                        run.status === "filtered" || run.status === "sports_analyzed" ? "muted" : "warn"
                      }`}>
                        {run.status}
                      </span>
                    </td>
                    <td><code>{run.model}</code></td>
                    <td>{run.latencyMs ? `${(run.latencyMs / 1000).toFixed(1)}s` : "n/a"}</td>
                    <td>
                      {run.failure ? (
                        <span className="error-text text-sm" style={{ color: "var(--red)", fontSize: "13px" }}>{run.failure}</span>
                      ) : run.publishedCallId ? (
                        <span className="success-text text-sm" style={{ color: "var(--green)", fontSize: "13px" }}>Published call ID: <code>{run.publishedCallId}</code></span>
                      ) : (
                        <span className="muted-text text-sm" style={{ color: "var(--muted)", fontSize: "13px" }}>No action required</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {summary?.latestCircleActions && summary.latestCircleActions.length > 0 ? (
        <section className="panel admin-output">
          <h3><Coins size={18} /> Latest onchain activity</h3>
          <p className="muted">Recent USDC transactions, bonds, unlocks, and Gateway x402 payments.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Network</th>
                  <th>Status</th>
                  <th>Transaction</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {summary.latestCircleActions.map((action) => (
                  <tr key={action.id}>
                    <td>
                      <span className="status-chip">{action.actionType.replace(/_/g, " ")}</span>
                    </td>
                    <td><strong>{usdc(action.amountUsdc || action.amount || 0)}</strong></td>
                    <td>{action.chain}</td>
                    <td>
                      <span className={`status-chip ${action.status === "success" ? "ok" : "warn"}`}>
                        {action.status}
                      </span>
                    </td>
                    <td>
                      {action.txHash ? (
                        <a
                          href={`https://testnet.arcscan.app/tx/${action.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="link-hover"
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          {shortAddress(action.txHash)} <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="muted">n/a</span>
                      )}
                    </td>
                    <td>{new Date(action.createdAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
        {!asyncStarted && sportsStatusCounts ? <p className="muted">Sports status counts: strong {sportsStatusCounts.strong_call || 0}, lean {sportsStatusCounts.lean_call || 0}, high-risk {(sportsStatusCounts.high_risk_call || 0) + (sportsStatusCounts.avoid_call || 0)}.</p> : null}
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
