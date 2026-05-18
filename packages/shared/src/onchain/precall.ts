import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, ARC_TESTNET_USDC } from "../chains";
import { erc20Abi, precallRegistryAbi } from "../contracts/abi";
import { optionalEnv, requireEnv } from "../env";
import type { AggregatedCall } from "../types";
import { hashText } from "../scoring";

export function createArcPublicClient() {
  return createPublicClient({
    chain: {
      ...arcTestnet,
      rpcUrls: {
        default: { http: [optionalEnv("ARC_TESTNET_RPC_URL", arcTestnet.rpcUrls.default.http[0])] },
      },
    },
    transport: http(optionalEnv("ARC_TESTNET_RPC_URL", arcTestnet.rpcUrls.default.http[0])),
  });
}

export function createArcWalletClient(privateKey = requireEnv("AGENT_OWNER_PRIVATE_KEY") as Hex) {
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = optionalEnv("ARC_TESTNET_RPC_URL", arcTestnet.rpcUrls.default.http[0]);
  return createWalletClient({
    account,
    chain: { ...arcTestnet, rpcUrls: { default: { http: [rpcUrl] } } },
    transport: http(rpcUrl),
  });
}

export async function publishAggregatedCallOnchain(input: {
  call: AggregatedCall;
  onchainAgentId: bigint;
  registryAddress?: Address;
  usdcAddress?: Address;
  bondAmountUsdc: string;
  unlockPriceUsdc: string;
}) {
  const registryAddress = input.registryAddress || (requireEnv("PRECALL_REGISTRY_ADDRESS") as Address);
  const usdcAddress = input.usdcAddress || (optionalEnv("ARC_USDC_ADDRESS", ARC_TESTNET_USDC) as Address);
  const wallet = createArcWalletClient();
  const publicClient = createArcPublicClient();
  const account = wallet.account.address;
  const bondAmount = parseUnits(input.bondAmountUsdc, 6);
  const unlockPrice = parseUnits(input.unlockPriceUsdc, 6);
  const expiry = BigInt(
    Math.floor(
      new Date(input.call.market.closeTime || Date.now() + 7 * 24 * 60 * 60 * 1000).getTime() / 1000,
    ),
  );

  const allowance = await publicClient.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, registryAddress],
  });

  if (allowance < bondAmount) {
    const approveHash = await wallet.writeContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [registryAddress, bondAmount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const direction = input.call.action === "BUY_NO" ? 2 : 1;
  const evidenceHash = hashText(JSON.stringify(input.call.evidence));
  const txHash = await wallet.writeContract({
    address: registryAddress,
    abi: precallRegistryAbi,
    functionName: "publishCall",
    args: [
      input.onchainAgentId,
      input.call.market.marketId,
      direction,
      input.call.marketPriceBps,
      input.call.agentProbabilityBps,
      input.call.confidenceBps,
      expiry,
      hashText(input.call.thesis),
      evidenceHash,
      bondAmount,
      unlockPrice,
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const events = parseEventLogs({
    abi: precallRegistryAbi,
    eventName: "CallPublished",
    logs: receipt.logs,
  });
  const onchainCallId = events[0]?.args.callId;

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    onchainCallId,
  };
}

export async function registerAgentOnchain(input: {
  name: string;
  metadataUri: string;
  registryAddress?: Address;
}) {
  const registryAddress = input.registryAddress || (requireEnv("PRECALL_REGISTRY_ADDRESS") as Address);
  const wallet = createArcWalletClient();
  const publicClient = createArcPublicClient();
  const txHash = await wallet.writeContract({
    address: registryAddress,
    abi: precallRegistryAbi,
    functionName: "registerAgent",
    args: [input.name, input.metadataUri],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  const events = parseEventLogs({
    abi: precallRegistryAbi,
    eventName: "AgentRegistered",
    logs: receipt.logs,
  });
  return {
    txHash,
    onchainAgentId: events[0]?.args.agentId,
  };
}

export async function resolveCallOnchain(input: {
  onchainCallId: bigint;
  outcomeYes: boolean;
  realizedPnlBps: number;
  brierScoreBps: number;
  registryAddress?: Address;
}) {
  const registryAddress = input.registryAddress || (requireEnv("PRECALL_REGISTRY_ADDRESS") as Address);
  const resolverPrivateKey = (process.env.RESOLVER_PRIVATE_KEY || requireEnv("AGENT_OWNER_PRIVATE_KEY")) as Hex;
  const wallet = createArcWalletClient(resolverPrivateKey);
  const publicClient = createArcPublicClient();
  const txHash = await wallet.writeContract({
    address: registryAddress,
    abi: precallRegistryAbi,
    functionName: "resolveCall",
    args: [
      input.onchainCallId,
      input.outcomeYes,
      BigInt(input.realizedPnlBps),
      input.brierScoreBps,
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return {
    txHash,
    blockNumber: receipt.blockNumber,
  };
}
