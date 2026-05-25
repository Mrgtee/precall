"use client";

import { useState } from "react";
import { createPublicClient, http, parseUnits } from "viem";
import { getWalletClient } from "@wagmi/core";
import { useAccount, useConfig, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { arcTestnet, arcTxUrl } from "@precall/shared/chains";
import { erc20Abi, precallRegistryAbi } from "@precall/shared/contracts/abi";
import { ExternalLink, LockKeyhole, Unlock } from "lucide-react";
import { actionLabel, bpsToPercent, outcomeForAction, recommendationHelp, recommendationLabel, selectedProbabilityForAction, usdc } from "../lib/format";
import { FeedbackCapture } from "./feedback-capture";

type UnlockedPayload = {
  call: {
    title: string;
    action: string;
    outcomes?: string[] | null;
    marketUrl?: string | null;
    copyUrl?: string | null;
    marketPriceBps: number;
    yesProbabilityBps: number;
    edgeBps: number;
    confidenceBps: number;
    suggestedSizeBps: number;
    thesis: string;
    counterarguments?: string[] | null;
  };
  evidence: Array<{
    id: number;
    evidenceId: string;
    sourceType: string;
    provider: string;
    sourceUrl: string;
    title: string;
    excerpt: string;
    credibilityScore: number;
    fetchedAt: string | Date;
    capturedAt: string | Date;
    paid: boolean;
    paymentAmountUsdc?: string | null;
    paymentNetwork?: string | null;
    paymentRef?: string | null;
  }>;
  votes: Array<{ agent?: string; thesis?: string; confidenceBps?: number; evidenceIds?: string[]; risks?: string[] }>;
};

export function UnlockThesis({
  callId,
  onchainCallId,
  unlockPrice,
  registryAddress,
}: {
  callId: number;
  onchainCallId: number | null;
  unlockPrice: string;
  registryAddress?: string | null;
}) {
  const registry = (registryAddress || process.env.NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS) as `0x${string}` | undefined;
  const usdcAddress = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as `0x${string}` | undefined;
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<string>("");
  const [txHash, setTxHash] = useState<`0x${string}` | "">("");
  const [details, setDetails] = useState<UnlockedPayload | null>(null);

  async function waitForReceiptWithTimeout(publicClient: ReturnType<typeof createPublicClient>, hash: `0x${string}`, label: string) {
    return Promise.race([
      publicClient.waitForTransactionReceipt({ hash }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} is still pending. Check your wallet or ArcScan, then refresh.`)), 75_000)),
    ]);
  }

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  async function getConnectedWalletChainId() {
    const walletClient = await getWalletClient(config, { account: address, assertChainId: false });
    return walletClient.getChainId();
  }

  async function loadExistingThesis(wallet: string, successStatus = "Already unlocked") {
    setStatus("Checking existing unlock...");
    const thesisResponse = await fetch(`/api/calls/${callId}/thesis?wallet=${wallet}`);
    if (!thesisResponse.ok) return false;

    const payload = (await thesisResponse.json()) as UnlockedPayload;
    setDetails(payload);
    setStatus(successStatus);
    return true;
  }

  async function unlock() {
    if (!registry || !usdcAddress) {
      setStatus("Missing registry or USDC address in public env.");
      return;
    }
    if (!onchainCallId) {
      setStatus("This call is not published onchain yet.");
      return;
    }
    if (!isConnected || !address) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }

    try {
      if (await loadExistingThesis(address)) return;

      let activeChainId = await getConnectedWalletChainId();
      if (activeChainId !== arcTestnet.id) {
        setStatus("Your connected wallet is on the wrong network. Switch to Arc Testnet when prompted.");
        await switchChainAsync({ chainId: arcTestnet.id });
        activeChainId = await getConnectedWalletChainId();
      }

      if (activeChainId !== arcTestnet.id) {
        setStatus(`Connected wallet reports chain ${activeChainId}, not Arc Testnet (${arcTestnet.id}). Open the wallet connected to this site, switch it to Arc Testnet, then try again.`);
        return;
      }

      const publicClient = createPublicClient({ chain: arcTestnet, transport: http(arcTestnet.rpcUrls.default.http[0]) });

      setStatus("Approve the USDC spend in your wallet...");
      const amount = parseUnits(unlockPrice, 6);
      const approveHash = await writeContractAsync({ address: usdcAddress, abi: erc20Abi, functionName: "approve", args: [registry, amount], chainId: arcTestnet.id });
      setTxHash(approveHash);
      setStatus("Approval submitted. Waiting for Arc confirmation...");
      await waitForReceiptWithTimeout(publicClient, approveHash, "Approval transaction");

      setStatus("Approve thesis unlock in your wallet...");
      const unlockHash = await writeContractAsync({ address: registry, abi: precallRegistryAbi, functionName: "unlockThesis", args: [BigInt(onchainCallId)], chainId: arcTestnet.id });
      setTxHash(unlockHash);
      setStatus("Unlock submitted. Waiting for Arc confirmation...");
      await waitForReceiptWithTimeout(publicClient, unlockHash, "Unlock transaction");

      setStatus("Indexing unlock...");
      const indexResponse = await fetch("/api/unlocks/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId, wallet: address, txHash: unlockHash, amount: unlockPrice }),
      });
      if (!indexResponse.ok) {
        setStatus("Unlock confirmed, but indexing failed. Refresh and try loading the thesis again.");
        return;
      }

      if (!(await loadExistingThesis(address, "Unlocked"))) {
        setStatus("Unlock indexed, but thesis fetch failed. Refresh and reconnect your wallet.");
      }
    } catch (error) {
      if (address && (await loadExistingThesis(address))) return;
      setStatus(`Unlock failed: ${errorMessage(error)}`);
    }
  }

  if (details) {
    const selectedOutcome = outcomeForAction(details.call.action, details.call.outcomes || []);
    const recommendation = recommendationLabel(details.call.action, details.call.outcomes || [], details.call.confidenceBps, details.call.suggestedSizeBps);
    const action = actionLabel(details.call.action, details.call.outcomes || []);
    const selectedAgentProbabilityBps = selectedProbabilityForAction(details.call.action, details.call.yesProbabilityBps);
    const help = recommendationHelp(details.call.action, details.call.confidenceBps, details.call.suggestedSizeBps);
    return (
      <section className="panel unlocked-analysis analysis-shell">
        <div className="analysis-header">
          <div>
            <p className="eyebrow">Unlocked recommendation</p>
            <h2>{action}</h2>
            <p className="muted">{help}</p>
          </div>
          <span className="status-chip ok"><Unlock size={14} /> Unlocked</span>
        </div>

        <div className="analysis-metric-grid" aria-label="Unlocked call metrics">
          <div><span>Selected option</span><strong>{selectedOutcome}</strong></div>
          <div><span>Market price</span><strong>{bpsToPercent(details.call.marketPriceBps)}</strong></div>
          <div><span>AI probability</span><strong>{bpsToPercent(selectedAgentProbabilityBps)}</strong></div>
          <div><span>Edge</span><strong>{bpsToPercent(details.call.edgeBps)}</strong></div>
          <div><span>Confidence</span><strong>{bpsToPercent(details.call.confidenceBps)}</strong></div>
          <div><span>Suggested size</span><strong>{bpsToPercent(details.call.suggestedSizeBps)}</strong></div>
        </div>

        <section className="analysis-section info-note">
          <h3>Recommendation summary</h3>
          <div className="pill-row">
            <span className="pill buy">{recommendation}</span>
            <span className="pill">Action: {details.call.action.replace("_", " ")}</span>
          </div>
          <p className="muted">This is probability-based analysis, not a guarantee or automatic trade instruction.</p>
          {(details.call.copyUrl || details.call.marketUrl) ? (
            <p><a className="inline-link" href={details.call.copyUrl || details.call.marketUrl || "#"} rel="noreferrer" target="_blank">Open Polymarket market <ExternalLink size={14} /></a></p>
          ) : null}
        </section>

        <section className="analysis-section">
          <h3>Thesis</h3>
          <p className="analysis-copy">{details.call.thesis}</p>
        </section>

        {details.call.counterarguments?.length ? (
          <section className="analysis-section">
            <h3>Counterarguments and risk notes</h3>
            <ul className="analysis-list">{details.call.counterarguments.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ) : null}

        <section className="analysis-section">
          <h3>Evidence used</h3>
          <div className="evidence-grid">
            {details.evidence.map((item) => (
              <article className="panel evidence-card" key={item.id}>
                <strong>{item.title}</strong>
                <p className="muted"><span className="status-chip">{item.sourceType}</span>{item.paid ? <span className="status-chip ok">x402-paid evidence</span> : null} Provider {item.provider || "unknown"} · Score {item.credibilityScore}</p>
                <p className="muted">{item.excerpt}</p>
                {item.paid ? <p className="muted">Paid {usdc(item.paymentAmountUsdc || 0)} via {item.paymentNetwork || "Circle Gateway/x402"}</p> : null}
                <a className="inline-link" href={item.sourceUrl} rel="noreferrer" target="_blank">Source <ExternalLink size={14} /></a>
              </article>
            ))}
          </div>
        </section>

        {details.votes.length ? (
          <section className="analysis-section">
            <h3>Agent votes</h3>
            <div className="evidence-grid">
              {details.votes.map((vote, index) => (
                <article className="panel evidence-card" key={`${vote.agent || "agent"}-${index}`}>
                  <strong>{vote.agent || "Agent"}</strong>
                  <p className="muted">Confidence {bpsToPercent(vote.confidenceBps || 0)}</p>
                  <p className="muted">{vote.thesis}</p>
                  {vote.evidenceIds?.length ? <p className="muted">Evidence IDs: {vote.evidenceIds.join(", ")}</p> : null}
                  {vote.risks?.length ? <p className="muted">Risks: {vote.risks.join("; ")}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <FeedbackCapture callId={callId} context="post-unlock" />
      </section>
    );
  }

  return (
    <section className="thesis-lock unlock-cta-panel">
      <div>
        <p className="eyebrow">Arc USDC unlock</p>
        <h3><LockKeyhole size={18} /> Thesis locked</h3>
        <p className="muted">Pay {usdc(unlockPrice)} on Arc to unlock the selected option, Polymarket link, thesis, evidence, risks, sizing logic, and agent votes.</p>
      </div>
      <button className="button" onClick={unlock} type="button">
        <Unlock size={17} />
        {isConnected ? "Unlock thesis" : "Connect to unlock"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
      {txHash ? <p className="muted">Transaction: <a href={arcTxUrl(txHash)} rel="noreferrer" target="_blank">view on ArcScan</a></p> : null}
    </section>
  );
}
