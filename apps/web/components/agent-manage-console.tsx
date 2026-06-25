"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, Save, Wallet } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { updateAgentMessage } from "../lib/agent-marketplace-auth";

type OwnedAgent = {
  agentId: number;
  name: string;
  ownerWallet: string;
  slug: string | null;
  tagline: string | null;
  strategyMode: string | null;
  riskProfile: string | null;
  reviewStatus: string | null;
  visibility: string | null;
  liveSportsCalls: number;
  published: number;
  resolved: number;
  wins: number;
  losses: number;
  unlocks: number;
  accruedRevenueUsdc: string;
  unlockPriceUsdc: string | null;
};

type AgentProfileResponse = {
  ok?: boolean;
  profile?: {
    agent: {
      id: number;
      name: string;
      tagline: string | null;
      description: string | null;
      categoryScope: string[] | null;
      strategyMode: "hit_rate" | "balanced" | "contrarian" | null;
      riskProfile: "conservative" | "balanced" | "aggressive" | null;
      unlockPriceUsdc: string | null;
      dailyX402BudgetUsdc: string | null;
      maxX402PaymentUsdc: string | null;
      maxCallsPerRun: number | null;
      requireX402: boolean | null;
      visibility: "public" | "hidden" | null;
      reviewStatus: string | null;
    };
  };
  error?: string;
};

export function AgentManageConsole() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [agents, setAgents] = useState<OwnedAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    tagline: "",
    description: "",
    categoryScope: "soccer",
    strategyMode: "hit_rate" as const,
    riskProfile: "balanced" as const,
    unlockPriceUsdc: "0.05",
    dailyX402BudgetUsdc: "0.10",
    maxX402PaymentUsdc: "0.005",
    maxCallsPerRun: 3,
    requireX402: true,
    visibility: "public" as const,
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isConnected || !address) return;
      setStatus("Loading owned agents...");
      const response = await fetch(`/api/agents/mine?address=${encodeURIComponent(address)}`, { cache: "no-store" });
      const payload = (await response.json()) as { agents?: OwnedAgent[]; error?: string };
      if (cancelled) return;
      if (!response.ok) {
        setStatus(payload.error || "Unable to load owned agents.");
        return;
      }
      const nextAgents = payload.agents || [];
      setAgents(nextAgents);
      setStatus(nextAgents.length ? "" : "No owned agents yet. Launch one first.");
      if (nextAgents[0] && !selectedAgentId) await loadProfile(nextAgents[0].agentId);
    }
    load().catch((error) => { if (!cancelled) setStatus(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected]);

  async function loadProfile(agentId: number) {
    setSelectedAgentId(agentId);
    const response = await fetch(`/api/agents/${agentId}`, { cache: "no-store" });
    const payload = (await response.json()) as AgentProfileResponse;
    if (!response.ok || !payload.profile) {
      setStatus(payload.error || "Unable to load agent profile.");
      return;
    }
    const agent = payload.profile.agent;
    setForm({
      name: agent.name,
      tagline: agent.tagline || "",
      description: agent.description || "",
      categoryScope: (agent.categoryScope || []).join(", "),
      strategyMode: (agent.strategyMode || "hit_rate") as typeof form.strategyMode,
      riskProfile: (agent.riskProfile || "balanced") as typeof form.riskProfile,
      unlockPriceUsdc: agent.unlockPriceUsdc || "0.05",
      dailyX402BudgetUsdc: agent.dailyX402BudgetUsdc || "0.10",
      maxX402PaymentUsdc: agent.maxX402PaymentUsdc || "0.005",
      maxCallsPerRun: agent.maxCallsPerRun || 3,
      requireX402: agent.requireX402 !== false,
      visibility: (agent.visibility || "public") as typeof form.visibility,
    });
    setStatus("");
  }

  async function save() {
    if (!selectedAgentId || !isConnected || !address) {
      if (connectors[0] && !isConnected) connect({ connector: connectors[0] });
      return;
    }

    const payload = {
      agentId: selectedAgentId,
      name: form.name,
      tagline: form.tagline,
      description: form.description,
      categoryScope: ["soccer"],
      strategyMode: form.strategyMode,
      riskProfile: form.riskProfile,
      unlockPriceUsdc: form.unlockPriceUsdc,
      dailyX402BudgetUsdc: form.dailyX402BudgetUsdc,
      maxX402PaymentUsdc: form.maxX402PaymentUsdc,
      maxCallsPerRun: form.maxCallsPerRun,
      requireX402: form.requireX402,
      visibility: form.visibility,
    };

    setStatus("Sign the update message in your wallet...");
    const message = updateAgentMessage({ wallet: address, payload });
    const signature = await signMessageAsync({ message });
    setStatus("Saving agent config...");

    const response = await fetch(`/api/agents/${selectedAgentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: address, message, signature, ...payload }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setStatus(result.error || "Update failed.");
      return;
    }
    setStatus("Agent settings updated.");
    const mineResponse = await fetch(`/api/agents/mine?address=${encodeURIComponent(address)}`, { cache: "no-store" });
    const minePayload = (await mineResponse.json()) as { agents?: OwnedAgent[] };
    setAgents(minePayload.agents || []);
  }

  if (!isConnected || !address) {
    return (
      <section className="panel admin-gate">
        <Bot size={28} />
        <div>
          <h2>Connect the owner wallet</h2>
          <p className="muted">Precall uses wallet signatures so only the owning wallet can update a hosted agent.</p>
        </div>
        <button className="button" disabled={isPending || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })} type="button"><Wallet size={17} /> Connect wallet</button>
      </section>
    );
  }

  return (
    <section className="admin-console">
      <section className="metric-strip">
        <div className="metric"><span>Owned agents</span><strong>{agents.length}</strong></div>
        <div className="metric"><span>Live calls</span><strong>{agents.reduce((sum, agent) => sum + Number(agent.published || 0), 0)}</strong></div>
        <div className="metric"><span>Total unlocks</span><strong>{agents.reduce((sum, agent) => sum + Number(agent.unlocks || 0), 0)}</strong></div>
        <div className="metric"><span>Accrued revenue</span><strong>{agents.reduce((sum, agent) => sum + Number(agent.accruedRevenueUsdc || 0), 0).toFixed(2)} USDC</strong></div>
      </section>

      <div className="grid" style={{ gridTemplateColumns: "minmax(280px, 0.9fr) minmax(0, 1.1fr)" }}>
        <section className="panel mini-stack">
          <h2>My agents</h2>
          {agents.length ? agents.map((agent) => (
            <button className={`button ${selectedAgentId === agent.agentId ? "" : "secondary"}`} key={agent.agentId} onClick={() => loadProfile(agent.agentId)} type="button">
              <span>{agent.name}</span>
              <span>{agent.reviewStatus || "pending_review"}</span>
            </button>
          )) : <p className="muted">Launch your first hosted agent from the marketplace.</p>}
          <Link className="button secondary" href="/agents/new">Launch another agent</Link>
        </section>

        <section className="panel admin-console">
          <h2>Manage selected agent</h2>
          <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <label className="mini-stack"><span>Name</span><input className="admin-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="mini-stack"><span>Tagline</span><input className="admin-input" value={form.tagline} onChange={(event) => setForm((current) => ({ ...current, tagline: event.target.value }))} /></label>
            <label className="mini-stack"><span>Category scope</span><input className="admin-input" disabled value="soccer" /></label>
            <label className="mini-stack"><span>Visibility</span><select className="admin-input" value={form.visibility} onChange={(event) => setForm((current) => ({ ...current, visibility: event.target.value as typeof form.visibility }))}><option value="public">Public</option><option value="hidden">Hidden</option></select></label>
            <label className="mini-stack"><span>Strategy mode</span><select className="admin-input" value={form.strategyMode} onChange={(event) => setForm((current) => ({ ...current, strategyMode: event.target.value as typeof form.strategyMode }))}><option value="hit_rate">Hit rate</option><option value="balanced">Balanced</option><option value="contrarian">Contrarian</option></select></label>
            <label className="mini-stack"><span>Risk profile</span><select className="admin-input" value={form.riskProfile} onChange={(event) => setForm((current) => ({ ...current, riskProfile: event.target.value as typeof form.riskProfile }))}><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></label>
            <label className="mini-stack"><span>Unlock price (USDC)</span><input className="admin-input" value={form.unlockPriceUsdc} onChange={(event) => setForm((current) => ({ ...current, unlockPriceUsdc: event.target.value }))} /></label>
            <label className="mini-stack"><span>Daily x402 budget</span><input className="admin-input" value={form.dailyX402BudgetUsdc} onChange={(event) => setForm((current) => ({ ...current, dailyX402BudgetUsdc: event.target.value }))} /></label>
            <label className="mini-stack"><span>Max x402 payment</span><input className="admin-input" value={form.maxX402PaymentUsdc} onChange={(event) => setForm((current) => ({ ...current, maxX402PaymentUsdc: event.target.value }))} /></label>
            <label className="mini-stack"><span>Max calls per run</span><input className="admin-input" type="number" min={1} max={24} value={form.maxCallsPerRun} onChange={(event) => setForm((current) => ({ ...current, maxCallsPerRun: Number(event.target.value || 1) }))} /></label>
          </div>
          <label className="mini-stack"><span>Description</span><textarea className="admin-input" rows={5} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <label className="mini-stack" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><input checked={form.requireX402} onChange={(event) => setForm((current) => ({ ...current, requireX402: event.target.checked }))} type="checkbox" /><span>Require x402 when supported</span></label>
          <div className="pill-row">
            <button className="button" onClick={save} type="button"><Save size={17} /> Save agent settings</button>
            {selectedAgentId ? <Link className="button secondary" href={`/agents/${selectedAgentId}`}>Open agent profile</Link> : null}
          </div>
          {status ? <p className="muted">{status}</p> : null}
        </section>
      </div>
    </section>
  );
}
