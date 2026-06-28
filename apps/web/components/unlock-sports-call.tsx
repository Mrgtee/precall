"use client";

import { useState } from "react";
import { createPublicClient, http, parseUnits } from "viem";
import { getWalletClient } from "@wagmi/core";
import { useAccount, useConfig, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { arcTestnet, arcTxUrl } from "@precall/shared/chains";
import { erc20Abi, precallSportsSplitterAbi } from "@precall/shared/contracts/abi";
import { ExternalLink, LockKeyhole, Unlock } from "lucide-react";
import { bpsToPercent, usdc } from "../lib/format";
import { TipJar } from "./unlock-thesis";

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
    agentOwnerWallet?: string;
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

export function UnlockSportsCall({ sportsPredictionId, unlockPrice, agentOwner, onUnlockSuccess }: { sportsPredictionId: number; unlockPrice: string; agentOwner?: string; onUnlockSuccess?: () => void }) {
  const receiver = process.env.NEXT_PUBLIC_SPORTS_UNLOCK_RECEIVER_ADDRESS as `0x${string}` | undefined;
  const usdcAddress = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as `0x${string}` | undefined;
  const splitterAddress = process.env.NEXT_PUBLIC_SPORTS_SPLITTER_ADDRESS as `0x${string}` | undefined;
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
    onUnlockSuccess?.();
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
      let transferHash: `0x${string}`;

      if (splitterAddress) {
        if (!agentOwner) {
          setStatus("Missing agent owner address for splits.");
          return;
        }
        setStatus("Approve the Precall Splitter contract to spend USDC...");
        const approveHash = await writeContractAsync({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [splitterAddress, amount],
          chainId: arcTestnet.id,
        });
        setStatus("Waiting for approval confirmation...");
        await waitForReceiptWithTimeout(publicClient, approveHash, "USDC approval");

        setStatus("Submitting onchain unlock splits...");
        transferHash = await writeContractAsync({
          address: splitterAddress,
          abi: precallSportsSplitterAbi,
          functionName: "unlockSportsCall",
          args: [BigInt(sportsPredictionId), agentOwner as `0x${string}`, amount],
          chainId: arcTestnet.id,
        });
      } else {
        setStatus("Approve the Arc USDC sports unlock transfer in your wallet...");
        transferHash = await writeContractAsync({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "transfer",
          args: [receiver, amount],
          chainId: arcTestnet.id,
        });
      }

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
      <section className="sports-unlocked-analysis analysis-shell">
        <div className="analysis-header">
          <div>
            <p className="eyebrow">Unlocked Sports Live Call</p>
            <h3><Unlock size={18} /> Full sports analysis unlocked</h3>
            <p className="muted">This sports call is non-bonded market intelligence. It is not a guaranteed outcome or financial advice.</p>
          </div>
          <span className="status-chip ok">Unlocked</span>
        </div>

        <div className="analysis-metric-grid" aria-label="Unlocked sports call metrics">
          <div><span>AI prediction</span><strong>{details.call.selectedOption}</strong></div>
          <div><span>Market price</span><strong>{bpsToPercent(details.call.marketPriceBps)}</strong></div>
          <div><span>AI probability</span><strong>{bpsToPercent(details.call.agentProbabilityBps)}</strong></div>
          <div><span>Edge</span><strong>{bpsToPercent(details.call.edgeBps)}</strong></div>
          <div><span>Confidence</span><strong>{bpsToPercent(details.call.confidenceBps)}</strong></div>
          <div><span>Risk</span><strong>{details.call.riskLevel}</strong></div>
        </div>

        <section className="analysis-section info-note">
          <h4>Verdict</h4>
          <p className="analysis-copy compact-copy">{details.call.verdict}</p>
          <div className="pill-row">
            <span className="pill">Resolution {details.call.resolutionStatus}</span>
            {details.call.x402PaidEvidenceUsed ? <span className="pill">x402 evidence</span> : null}
          </div>
          <p><a className="inline-link" href={details.call.marketUrl} rel="noreferrer" target="_blank">Open Polymarket market <ExternalLink size={14} /></a></p>
        </section>

        <section className="analysis-section">
          <h4>Reasoning</h4>
          <p className="analysis-copy compact-copy">{details.call.reasoning}</p>
        </section>

        <section className="analysis-section two-column-section">
          <div>
            <h4>Form, news, and matchup context</h4>
            <p className="muted">{details.call.matchupContext || "Form/injury context was not available in supplied evidence."}</p>
          </div>
          <div>
            <h4>Market movement</h4>
            <p className="muted">{details.call.marketMovement || "Market movement evidence was not available."}</p>
          </div>
        </section>

        {details.call.risks.length ? (
          <section className="analysis-section">
            <h4>Risk notes</h4>
            <ul className="analysis-list">{details.call.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </section>
        ) : null}

        <section className="analysis-section">
          <h4>Evidence</h4>
          <div className="evidence-grid">
            {details.evidence.map((item, index) => (
              <article className="panel evidence-card" key={`${item.evidenceId || "evidence"}-${index}`}>
                <strong>{item.title || item.evidenceId || "Evidence"}</strong>
                <p className="muted"><span className="status-chip">{item.sourceType || "evidence"}</span>{item.paid ? <span className="status-chip ok">x402-paid</span> : null} Provider {item.provider || "unknown"} · Score {item.credibilityScore ?? "n/a"}</p>
                <p className="muted">{item.excerpt || "No excerpt available."}</p>
                {item.paid ? <p className="muted">Paid {usdc(item.paymentAmountUsdc || 0)} via {item.paymentNetwork || "Circle Gateway/x402"}</p> : null}
                {item.sourceUrl ? <a className="inline-link" href={item.sourceUrl} rel="noreferrer" target="_blank">Source <ExternalLink size={14} /></a> : null}
              </article>
            ))}
          </div>
        </section>

        {details.votes.length ? (
          <section className="analysis-section">
            <h4>Probability breakdown</h4>
            <div className="evidence-grid">
              {details.votes.map((vote, index) => (
                <article className="panel evidence-card" key={`${vote.agent || "agent"}-${index}`}>
                  <strong>{vote.agent || "Sports agent"}</strong>
                  <p className="muted">Outcome index {vote.selectedOutcomeIndex ?? "n/a"} · AI {bpsToPercent(vote.agentProbabilityBps || 0)} · Confidence {bpsToPercent(vote.confidenceBps || 0)}</p>
                  <p className="muted">{vote.thesis || "No thesis supplied."}</p>
                  {vote.evidenceIds?.length ? <p className="muted">Evidence IDs: {vote.evidenceIds.join(", ")}</p> : null}
                  {vote.risks?.length ? <p className="muted">Risks: {vote.risks.join("; ")}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {receiver && isConnected && address && usdcAddress ? (
          <TipJar
            sportsPredictionId={sportsPredictionId}
            receiverAddress={receiver}
            usdcAddress={usdcAddress}
            userAddress={address}
            writeContractAsync={writeContractAsync}
            config={config}
            switchChainAsync={switchChainAsync}
          />
        ) : null}
        <p className="muted nfa-note">NFA: Sports Live Calls are AI-generated market intelligence, not financial advice. They are not guaranteed outcomes. Always do your own research.</p>
      </section>
    );
  }

  return (
    <section className="thesis-lock sports-lock unlock-cta-panel">
      <div>
        <p className="eyebrow">Arc USDC unlock</p>
        <h3><LockKeyhole size={18} /> Sports analysis locked</h3>
        <p className="muted">Pay {usdc(unlockPrice)} with Arc USDC to unlock full reasoning, evidence, market link, deeper probability breakdown, and risk notes.</p>
      </div>
      <button className="button" onClick={unlock} type="button">
        <Unlock size={17} />
        {isConnected ? "Unlock sports call" : "Connect to unlock"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
      {txHash ? <p className="muted">Transaction: <a href={arcTxUrl(txHash)} rel="noreferrer" target="_blank">view on ArcScan</a></p> : null}
    </section>
  );
}
