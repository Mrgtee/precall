"use client";

import { useState } from "react";
import { createPublicClient, custom, http, parseUnits, type EIP1193Provider } from "viem";
import { useAccount, useChainId, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { arcTestnet, arcTxUrl } from "@precall/shared/chains";
import { erc20Abi, precallRegistryAbi } from "@precall/shared/contracts/abi";
import { LockKeyhole, Unlock } from "lucide-react";
import { usdc } from "../lib/format";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

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
  const chainId = useChainId();
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
      if (chainId !== arcTestnet.id) {
        setStatus("Your wallet is on the wrong network. Switch to Arc Testnet when prompted.");
        await switchChainAsync({ chainId: arcTestnet.id });
      }

      const activeChainId = await window.ethereum?.request({ method: "eth_chainId" });
      if (activeChainId !== `0x${arcTestnet.id.toString(16)}`) {
        setStatus("Wallet is still not on Arc Testnet. Please switch from Ethereum/Mainnet to Arc Testnet and try again.");
        return;
      }

      const publicClient = createPublicClient({
        chain: arcTestnet,
        transport:
          typeof window !== "undefined" && window.ethereum
            ? custom(window.ethereum)
            : http(arcTestnet.rpcUrls.default.http[0]),
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

      const thesisResponse = await fetch(`/api/calls/${callId}/thesis?wallet=${address}`);
      if (thesisResponse.ok) {
        const payload = (await thesisResponse.json()) as { thesis: string };
        setThesis(payload.thesis);
        setStatus("Unlocked");
      } else {
        setStatus("Unlock indexed, but thesis fetch failed. Refresh and reconnect your wallet.");
      }
    } catch (error) {
      setStatus(`Unlock failed: ${errorMessage(error)}`);
    }
  }

  if (thesis) {
    return (
      <section className="panel">
        <h3><Unlock size={18} /> Full thesis</h3>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{thesis}</p>
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
