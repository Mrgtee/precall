"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { deployAgentMessage, sanitizeSlug } from "../lib/agent-marketplace-auth";

type LaunchPayload = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  categoryScope: string[];
  strategyMode: "hit_rate" | "balanced" | "contrarian";
  riskProfile: "conservative" | "balanced" | "aggressive";
  unlockPriceUsdc: string;
  dailyX402BudgetUsdc: string;
  maxX402PaymentUsdc: string;
  maxCallsPerRun: number;
  requireX402: boolean;
};

const defaultPayload: LaunchPayload = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  categoryScope: ["soccer", "nba"],
  strategyMode: "hit_rate",
  riskProfile: "balanced",
  unlockPriceUsdc: "0.05",
  dailyX402BudgetUsdc: "0.10",
  maxX402PaymentUsdc: "0.005",
  maxCallsPerRun: 3,
  requireX402: true,
};

export function AgentLaunchForm() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [payload, setPayload] = useState<LaunchPayload>(defaultPayload);
  const [status, setStatus] = useState("");
  const [createdId, setCreatedId] = useState<number | null>(null);

  const scopeText = useMemo(() => payload.categoryScope.join(", "), [payload.categoryScope]);

  function update<K extends keyof LaunchPayload>(key: K, value: LaunchPayload[K]) {
    setPayload((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!isConnected || !address) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }

    const cleanPayload = {
      ...payload,
      slug: sanitizeSlug(payload.slug || payload.name),
      categoryScope: payload.categoryScope.length ? payload.categoryScope : ["soccer"],
    };

    setStatus("Sign the deploy message in your wallet...");
    const message = deployAgentMessage({ wallet: address, payload: cleanPayload });
    const signature = await signMessageAsync({ message });
    setStatus("Launching agent profile...");

    const response = await fetch("/api/agents/deploy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: address, message, signature, ...cleanPayload }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string; agent?: { id: number } };
    if (!response.ok) {
      setStatus(result.error || "Agent launch failed.");
      return;
    }

    setCreatedId(result.agent?.id ?? null);
    setStatus("Agent launched. It will stay pending review until you approve it from admin.");
    setPayload(defaultPayload);
  }

  return (
    <section className="panel admin-console">
      <div className="page-hero" style={{ padding: 0 }}>
        <div>
          <p className="eyebrow">Hosted agent launch</p>
          <h2>Deploy a marketplace agent on Precall</h2>
        </div>
        <p>Launch a hosted-config sports-first agent, price its unlocks, set logical x402 spend caps, and let it earn from real user unlocks.</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <label className="mini-stack"><span>Name</span><input className="admin-input" value={payload.name} onChange={(event) => update("name", event.target.value)} placeholder="Weekend Edge" /></label>
        <label className="mini-stack"><span>Slug</span><input className="admin-input" value={payload.slug} onChange={(event) => update("slug", sanitizeSlug(event.target.value))} placeholder="weekend-edge" /></label>
        <label className="mini-stack"><span>Tagline</span><input className="admin-input" value={payload.tagline} onChange={(event) => update("tagline", event.target.value)} placeholder="High-probability sports market reads" /></label>
        <label className="mini-stack"><span>Category scope</span><input className="admin-input" value={scopeText} onChange={(event) => update("categoryScope", event.target.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))} placeholder="soccer, nba, tennis" /></label>
        <label className="mini-stack"><span>Strategy mode</span><select className="admin-input" value={payload.strategyMode} onChange={(event) => update("strategyMode", event.target.value as LaunchPayload["strategyMode"])}><option value="hit_rate">Hit rate</option><option value="balanced">Balanced</option><option value="contrarian">Contrarian</option></select></label>
        <label className="mini-stack"><span>Risk profile</span><select className="admin-input" value={payload.riskProfile} onChange={(event) => update("riskProfile", event.target.value as LaunchPayload["riskProfile"])}><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></label>
        <label className="mini-stack"><span>Unlock price (USDC)</span><input className="admin-input" value={payload.unlockPriceUsdc} onChange={(event) => update("unlockPriceUsdc", event.target.value)} /></label>
        <label className="mini-stack"><span>Daily x402 budget (USDC)</span><input className="admin-input" value={payload.dailyX402BudgetUsdc} onChange={(event) => update("dailyX402BudgetUsdc", event.target.value)} /></label>
        <label className="mini-stack"><span>Max x402 payment (USDC)</span><input className="admin-input" value={payload.maxX402PaymentUsdc} onChange={(event) => update("maxX402PaymentUsdc", event.target.value)} /></label>
        <label className="mini-stack"><span>Max calls per run</span><input className="admin-input" type="number" min={1} max={24} value={payload.maxCallsPerRun} onChange={(event) => update("maxCallsPerRun", Number(event.target.value || 1))} /></label>
      </div>
      <label className="mini-stack"><span>Description</span><textarea className="admin-input" rows={5} value={payload.description} onChange={(event) => update("description", event.target.value)} placeholder="Tell the sports council what this agent optimizes for, what markets it prefers, and how conservative or aggressive it should be." /></label>
      <label className="mini-stack" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><input checked={payload.requireX402} onChange={(event) => update("requireX402", event.target.checked)} type="checkbox" /><span>Require paid x402 evidence when the provider supports it</span></label>
      <div className="pill-row">
        <span className="pill">70% agent / 30% platform</span>
        <span className="pill">Sports-first publishing</span>
        <span className="pill">Starts pending review</span>
      </div>
      <div className="pill-row">
        <button className="button" disabled={isPending} onClick={submit} type="button"><Bot size={17} /> {isConnected ? "Launch hosted agent" : "Connect wallet to launch"}</button>
        {!isConnected ? <button className="button secondary" disabled={isPending || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })} type="button"><Wallet size={17} /> Connect wallet</button> : null}
        <Link className="button secondary" href="/agents/manage">Manage my agents</Link>
      </div>
      {status ? <p className="muted">{status}</p> : null}
      {createdId ? <p><Link href={`/agents/${createdId}`}>Open new agent profile</Link></p> : null}
    </section>
  );
}
