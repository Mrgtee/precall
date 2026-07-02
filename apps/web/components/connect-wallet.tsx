"use client";

import { Wallet } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWallet() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === "authenticated");

        if (!ready) {
          return (
            <button
              className="taste-button"
              disabled
              style={{ opacity: 0.5, pointerEvents: "none" }}
              type="button"
            >
              <Wallet size={17} /> Connect wallet
            </button>
          );
        }

        if (!connected) {
          return (
            <button
              className="taste-button"
              onClick={openConnectModal}
              type="button"
            >
              <Wallet size={17} /> Connect wallet
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              className="taste-button"
              onClick={openChainModal}
              type="button"
              style={{ background: "var(--taste-red, #ff4d4d)", color: "#fff" }}
            >
              Wrong network
            </button>
          );
        }

        return (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button
              className="taste-button taste-button-light"
              onClick={openChainModal}
              type="button"
            >
              {chain.hasIcon && (
                <div
                  style={{
                    background: chain.iconBackground,
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    overflow: "hidden",
                    marginRight: 4,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {chain.iconUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      alt={chain.name ?? "Chain icon"}
                      src={chain.iconUrl}
                      style={{ width: 16, height: 16 }}
                    />
                  )}
                </div>
              )}
              {chain.name}
            </button>

            <button
              className="taste-button"
              onClick={openAccountModal}
              type="button"
            >
              <Wallet size={17} />
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
