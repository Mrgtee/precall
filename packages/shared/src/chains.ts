import type { Chain } from "viem";

export const ARC_TESTNET_CHAIN_ID = 5_042_002;

export const arcTestnet = {
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || process.env.ARC_RPC_URL || process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc-node.thecanteenapp.com/v1/swrm_9199d41912495c50f474948f27c3ef4d86681a072ac89fc694d2d00c525a5630"] },
    public: { http: [process.env.NEXT_PUBLIC_ARC_RPC_URL || process.env.ARC_RPC_URL || process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc-node.thecanteenapp.com/v1/swrm_9199d41912495c50f474948f27c3ef4d86681a072ac89fc694d2d00c525a5630"] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
} as const satisfies Chain;

export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;

export function arcTxUrl(hash: string): string {
  return `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;
}

export function arcAddressUrl(address: string): string {
  return `${arcTestnet.blockExplorers.default.url}/address/${address}`;
}
