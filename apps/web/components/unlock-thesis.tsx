"use client";

import { useState } from "react";
import { createPublicClient, custom, http, parseUnits, type EIP1193Provider } from "viem";
import { useAccount, useConnect, useWriteContract } from "wagmi";
import { arcTestnet } from "@precall/shared/chains";
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
  const { connect, connectors } = useConnect();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<string>("");
  const [thesis, setThesis] = useState<string>("");

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

    setStatus("Approving USDC...");
    const amount = parseUnits(unlockPrice, 6);
    const approveHash = await writeContractAsync({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [registry, amount],
    });
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport:
        typeof window !== "undefined" && window.ethereum
          ? custom(window.ethereum)
          : http(arcTestnet.rpcUrls.default.http[0]),
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    setStatus("Unlocking thesis on Arc...");
    const txHash = await writeContractAsync({
      address: registry,
      abi: precallRegistryAbi,
      functionName: "unlockThesis",
      args: [BigInt(onchainCallId)],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    setStatus("Indexing unlock...");
    await fetch("/api/unlocks/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ callId, wallet: address, txHash, amount: unlockPrice }),
    });
    const thesisResponse = await fetch(`/api/calls/${callId}/thesis?wallet=${address}`);
    if (thesisResponse.ok) {
      const payload = (await thesisResponse.json()) as { thesis: string };
      setThesis(payload.thesis);
      setStatus("Unlocked");
    } else {
      setStatus("Unlock indexed, but thesis fetch failed. Refresh and reconnect your wallet.");
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
    </section>
  );
}
