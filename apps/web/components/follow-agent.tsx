"use client";

import { useState } from "react";
import { BellPlus, CheckCircle2 } from "lucide-react";
import { useAccount, useConnect, useSignMessage } from "wagmi";

function followMessage(agentId: number, wallet: string) {
  return [`Precall Arena follow`, `Agent: ${agentId}`, `Wallet: ${wallet}`].join("\n");
}

export function FollowAgent({ agentId, initialFollowers = 0 }: { agentId: number; initialFollowers?: number }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const [followers, setFollowers] = useState(initialFollowers);
  const [status, setStatus] = useState("");
  const [followed, setFollowed] = useState(false);

  async function follow() {
    if (!isConnected || !address) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }

    setStatus("Sign follow intent in your wallet...");
    const message = followMessage(agentId, address);
    const signature = await signMessageAsync({ message });
    setStatus("Saving signed follow...");
    const response = await fetch("/api/follows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, wallet: address, message, signature }),
    });
    const payload = (await response.json()) as { followers?: number; error?: string };
    if (!response.ok) {
      setStatus(payload.error || "Follow failed.");
      return;
    }

    setFollowers(payload.followers ?? followers);
    setFollowed(true);
    setStatus("Following. This signed action counts toward real user demand.");
  }

  return (
    <div className="mini-stack">
      <button className="button secondary" onClick={follow} type="button">
        {followed ? <CheckCircle2 size={17} /> : <BellPlus size={17} />}
        {isConnected ? "Follow agent" : "Connect to follow"}
      </button>
      <p className="muted">{followers} follower{followers === 1 ? "" : "s"}</p>
      {status ? <p className="muted">{status}</p> : null}
    </div>
  );
}
