"use client";

import { useState } from "react";
import { createPublicClient, http, parseUnits } from "viem";
import { getWalletClient } from "@wagmi/core";
import { useAccount, useConfig, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { arcTestnet, arcTxUrl } from "@precall/shared/chains";
import { erc20Abi } from "@precall/shared/contracts/abi";
import { ExternalLink, LockKeyhole, Unlock } from "lucide-react";
import { bpsToPercent, usdc } from "../lib/format";

type SportsAnalysisPayload = {
  call: {
    id: number;
    marketTitle: string;
    marketUrl: string;
    category: string;
    marketKind: string;
    selectedOption: string;
    selectedOutcomeIndex: number;
    marketPriceBps: number;
    agentProbabilityBps: number;
    edgeBps: number;
    confidenceBps: number;
    riskLevel: string;
    reasoning: string;
    matchupContext: string;
    marketMovement: string;
    risks: string[];
    verdict: string;
    evidenceIds: string[];
    sourceUrls: string[];
    x402PaidEvidenceUsed: boolean;
    resolutionStatus: string;
  };
  evidence: Array<{
    evidenceId?: string;
    sourceType?: string;
    provider?: string;
    sourceUrl?: string;
    title?: string;
    excerpt?: string;
    credibilityScore?: number;
    paid?: boolean;
    paymentAmountUsdc?: string | null;
    paymentNetwork?: string | null;
  }>;
  votes: Array<{
    agent?: string;
    selectedOutcomeIndex?: number;
    agentProbabilityBps?: number;
    confidenceBps?: number;
    thesis?: string;
    risks?: string[];
    evidenceIds?: string[];
  }>;
};

export function UnlockSportsCall({ sportsPredictionId, unlockPrice }: { sportsPredictionId: number; unlockPrice: string }) {
  const receiver = process.env.NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS as `0x${string}` | undefined;
  const usdcAddress = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as `0x${string}` | undefined;
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | "">("");
  const [details, setDetails] = useState<SportsAnalysisPayload | null>(null);

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

  async function loadExistingAnalysis(wallet: string, successStatus = "Already unlocked") {
    setStatus("Checking existing sports unlock...");
    const response = await fetch(`/api/sports/${sportsPredictionId}/analysis?wallet=${wallet}`);
    if (!response.ok) return false;
    setDetails((await response.json()) as SportsAnalysisPayload);
    setStatus(successStatus);
    return true;
  }

  async function unlock() {
    if (!receiver || !usdcAddress) {
      setStatus("Missing public sports unlock receiver or Arc USDC address.");
      return;
    }
    if (!isConnected || !address) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }

    try {
      if (await loadExistingAnalysis(address)) return;

      let activeChainId = await getConnectedWalletChainId();
      if (activeChainId !== arcTestnet.id) {
        setStatus("Switch to Arc Testnet when prompted.");
        await switchChainAsync({ chainId: arcTestnet.id });
        activeChainId = await getConnectedWalletChainId();
      }
      if (activeChainId !== arcTestnet.id) {
        setStatus(`Connected wallet reports chain ${activeChainId}, not Arc Testnet (${arcTestnet.id}). Switch networks and try again.`);
        return;
      }

      const publicClient = createPublicClient({ chain: arcTestnet, transport: http(arcTestnet.rpcUrls.default.http[0]) });
      const amount = parseUnits(unlockPrice, 6);
      setStatus("Approve the Arc USDC sports unlock transfer in your wallet...");
      const transferHash = await writeContractAsync({ address: usdcAddress, abi: erc20Abi, functionName: "transfer", args: [receiver, amount], chainId: arcTestnet.id });
      setTxHash(transferHash);
      setStatus("Sports unlock submitted. Waiting for Arc confirmation...");
      await waitForReceiptWithTimeout(publicClient, transferHash, "Sports unlock transaction");

      setStatus("Indexing sports unlock...");
      const indexResponse = await fetch("/api/sports/unlocks/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sportsPredictionId, wallet: address, txHash: transferHash }),
      });
      if (!indexResponse.ok) {
        const payload = (await indexResponse.json().catch(() => ({}))) as { error?: string };
        setStatus(payload.error || "Unlock confirmed, but indexing failed. Refresh and try loading the analysis again.");
        return;
      }

      if (!(await loadExistingAnalysis(address, "Sports analysis unlocked"))) {
        setStatus("Unlock indexed, but analysis fetch failed. Refresh and reconnect your wallet.");
      }
    } catch (error) {
      if (address && (await loadExistingAnalysis(address))) return;
      setStatus(`Sports unlock failed: ${errorMessage(error)}`);
    }
  }

  if (details) {
    return (
      <section className="sports-unlocked-analysis">
        <h3><Unlock size={18} /> Full sports analysis unlocked</h3>
        <div className="pill-row">
          <span className="pill">Selected option: {details.call.selectedOption}</span>
          <span className="pill">Market {bpsToPercent(details.call.marketPriceBps)}</span>
          <span className="pill">AI {bpsToPercent(details.call.agentProbabilityBps)}</span>
          <span className="pill">Edge {bpsToPercent(details.call.edgeBps)}</span>
          <span className="pill">Confidence {bpsToPercent(details.call.confidenceBps)}</span>
          <span className="pill">Risk {details.call.riskLevel}</span>
          <span className="pill">Resolution {details.call.resolutionStatus}</span>
          {details.call.x402PaidEvidenceUsed ? <span className="pill">x402 evidence</span> : null}
        </div>
        <p><strong>Reasoning:</strong> {details.call.reasoning}</p>
        <p className="muted"><strong>Context:</strong> {details.call.matchupContext || "Form/injury context was not available in supplied evidence."}</p>
        <p className="muted"><strong>Market movement:</strong> {details.call.marketMovement || "Market movement evidence was not available."}</p>
        {details.call.risks.length ? <p className="muted"><strong>Risk notes:</strong> {details.call.risks.join("; ")}</p> : null}
        <p><strong>Verdict:</strong> {details.call.verdict}</p>
        <p><a href={details.call.marketUrl} rel="noreferrer" target="_blank">Open Polymarket market <ExternalLink size={14} /></a></p>
        <h4>Evidence</h4>
        <div className="grid compact-grid">
          {details.evidence.map((item, index) => (
            <article className="panel" key={`${item.evidenceId || "evidence"}-${index}`}>
              <strong>{item.title || item.evidenceId || "Evidence"}</strong>
              <p className="muted"><span className="status-chip">{item.sourceType || "evidence"}</span>{item.paid ? <span className="status-chip">x402-paid</span> : null} Provider {item.provider || "unknown"} · Score {item.credibilityScore ?? "n/a"}</p>
              <p className="muted">{item.excerpt || "No excerpt available."}</p>
              {item.paid ? <p className="muted">Paid {usdc(item.paymentAmountUsdc || 0)} via {item.paymentNetwork || "Circle Gateway/x402"}</p> : null}
              {item.sourceUrl ? <a href={item.sourceUrl} rel="noreferrer" target="_blank">Source <ExternalLink size={14} /></a> : null}
            </article>
          ))}
        </div>
        {details.votes.length ? (
          <>
            <h4>Probability breakdown</h4>
            <div className="grid compact-grid">
              {details.votes.map((vote, index) => (
                <article className="panel" key={`${vote.agent || "agent"}-${index}`}>
                  <strong>{vote.agent || "Sports agent"}</strong>
                  <p className="muted">Outcome index {vote.selectedOutcomeIndex ?? "n/a"} · AI {bpsToPercent(vote.agentProbabilityBps || 0)} · Confidence {bpsToPercent(vote.confidenceBps || 0)}</p>
                  <p className="muted">{vote.thesis || "No thesis supplied."}</p>
                  {vote.risks?.length ? <p className="muted">Risks: {vote.risks.join("; ")}</p> : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
        <p className="muted">NFA: Sports Live Calls are AI-generated market intelligence, not financial advice. They are not guaranteed outcomes. Always do your own research.</p>
      </section>
    );
  }

  return (
    <section className="thesis-lock sports-lock">
      <h3><LockKeyhole size={18} /> Sports analysis locked</h3>
      <p className="muted">Pay {usdc(unlockPrice)} with Arc USDC to unlock full reasoning, evidence, market link, deeper probability breakdown, and risk notes.</p>
      <button className="button" onClick={unlock} type="button">
        <Unlock size={17} />
        {isConnected ? "Unlock sports call" : "Connect to unlock"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
      {txHash ? <p className="muted">Transaction: <a href={arcTxUrl(txHash)} rel="noreferrer" target="_blank">view on ArcScan</a></p> : null}
    </section>
  );
}
