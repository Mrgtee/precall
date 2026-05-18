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
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
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
