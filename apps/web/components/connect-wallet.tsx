"use client";

import { Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "../lib/format";

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button className="button secondary" onClick={() => disconnect()} type="button">
        <Wallet size={17} />
        {shortAddress(address)}
      </button>
    );
  }

  return (
    <button
      className="button"
      disabled={isPending || !connectors[0]}
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      type="button"
    >
      <Wallet size={17} />
      Connect wallet
    </button>
  );
}
