"use client";

import { useState } from "react";
import { createPublicClient, http, parseUnits } from "viem";
import { getWalletClient } from "@wagmi/core";
import { useAccount, useConfig, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { arcTestnet, arcTxUrl } from "@precall/shared/chains";
import { erc20Abi, precallRegistryAbi } from "@precall/shared/contracts/abi";
import { LockKeyhole, Unlock } from "lucide-react";
import { usdc } from "../lib/format";
import { FeedbackCapture } from "./feedback-capture";


export function UnlockThesis({
  callId,
  onchainCallId,
  unlockPrice,
}: {
  callId: number;
  onchainCallId: number | null;
  unlockPrice: string;
}) {
  const registry = process.env.NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const usdcAddress = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as `0x${string}` | undefined;
  const { address, isConnected } = useAccount();
  const config = useConfig();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<string>("");
  const [txHash, setTxHash] = useState<`0x${string}` | "">("");
  const [thesis, setThesis] = useState<string>("");

  async function waitForReceiptWithTimeout(
    publicClient: ReturnType<typeof createPublicClient>,
    hash: `0x${string}`,
    label: string,
  ) {
    return Promise.race([
      publicClient.waitForTransactionReceipt({ hash }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} is still pending. Check your wallet or ArcScan, then refresh.`)), 75_000),
      ),
    ]);
  }

  function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  async function getConnectedWalletChainId() {
    const walletClient = await getWalletClient(config, { account: address, assertChainId: false });
    return walletClient.getChainId();
  }

  async function loadExistingThesis(wallet: string, successStatus = "Already unlocked") {
    setStatus("Checking existing unlock...");
    const thesisResponse = await fetch(`/api/calls/${callId}/thesis?wallet=${wallet}`);
    if (!thesisResponse.ok) return false;

    const payload = (await thesisResponse.json()) as { thesis: string };
    setThesis(payload.thesis);
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

      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport: http(arcTestnet.rpcUrls.default.http[0]),
      });

      setStatus("Approve the USDC spend in your wallet...");
      const amount = parseUnits(unlockPrice, 6);
      const approveHash = await writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [registry, amount],
        chainId: arcTestnet.id,
      });
      setTxHash(approveHash);
      setStatus("Approval submitted. Waiting for Arc confirmation...");
      await waitForReceiptWithTimeout(publicClient, approveHash, "Approval transaction");

      setStatus("Approve thesis unlock in your wallet...");
      const unlockHash = await writeContractAsync({
        address: registry,
        abi: precallRegistryAbi,
        functionName: "unlockThesis",
        args: [BigInt(onchainCallId)],
        chainId: arcTestnet.id,
      });
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

  if (thesis) {
    return (
      <section className="panel">
        <h3><Unlock size={18} /> Full thesis</h3>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{thesis}</p>
        <FeedbackCapture callId={callId} context="post-unlock" />
      </section>
    );
  }

  return (
    <section className="thesis-lock">
      <h3><LockKeyhole size={18} /> Thesis locked</h3>
      <p className="muted">
        Pay {usdc(unlockPrice)} on Arc to unlock the full reasoning trace, evidence, risks, and sizing logic.
      </p>
      <button className="button" onClick={unlock} type="button">
        <Unlock size={17} />
        {isConnected ? "Unlock thesis" : "Connect to unlock"}
      </button>
      {status ? <p className="muted">{status}</p> : null}
      {txHash ? (
        <p className="muted">
          Transaction: <a href={arcTxUrl(txHash)} rel="noreferrer" target="_blank">view on ArcScan</a>
        </p>
      ) : null}
    </section>
  );
}
