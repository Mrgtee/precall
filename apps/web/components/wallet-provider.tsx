"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { connectorsForWallets, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, WagmiProvider } from "wagmi";
import { arcTestnet } from "@precall/shared/chains";
import { useState } from "react";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, rainbowWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
  {
    appName: "Precall Arena",
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "precall-arena",
  }
);

const config = createConfig({
  connectors,
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
  },
  ssr: true,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
