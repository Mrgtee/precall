import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, getAddress, http, parseAbiItem, type Address } from "viem";
import { arcTestnet } from "@precall/shared/chains";
import { precallRegistryAbi } from "@precall/shared/contracts/abi";
import { createDb } from "@precall/shared/db/client";
import { circleActions, thesisUnlocks, users } from "@precall/shared/db/schema";
import { getCall, hasUnlock } from "../../../../../lib/queries";

const thesisUnlockedEvent = parseAbiItem(
  "event ThesisUnlocked(uint256 indexed callId, address indexed buyer, uint256 amount)",
);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = new URL(request.url).searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet query param is required." }, { status: 400 });

  let walletAddress: Address;
  try {
    walletAddress = getAddress(wallet);
  } catch {
    return NextResponse.json({ error: "wallet query param must be a valid address." }, { status: 400 });
  }

  const call = await getCall(Number(id));
  if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });

  let unlocked = await hasUnlock(call.id, walletAddress);
  const registry = (call.registryAddress || process.env.PRECALL_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_PRECALL_REGISTRY_ADDRESS) as
    | Address
    | undefined;

  if (!unlocked && call.onchainCallId && registry) {
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(process.env.ARC_TESTNET_RPC_URL || arcTestnet.rpcUrls.default.http[0]),
    });

    try {
      unlocked = await publicClient.readContract({
        address: registry,
        abi: precallRegistryAbi,
        functionName: "thesisUnlocked",
        args: [BigInt(call.onchainCallId), walletAddress],
      });

      if (unlocked) {
        const logs = await publicClient.getLogs({
          address: registry,
          event: thesisUnlockedEvent,
          args: { callId: BigInt(call.onchainCallId), buyer: walletAddress },
          fromBlock: 0n,
          toBlock: "latest",
        });
        const latestLog = logs.at(-1);

        if (latestLog?.transactionHash) {
          const db = createDb();
          const amount = formatUnits(latestLog.args.amount ?? 0n, 6);
          await db.insert(users).values({ walletAddress }).onConflictDoNothing();
          await db
            .insert(thesisUnlocks)
            .values({
              callId: call.id,
              userWallet: walletAddress,
              amount,
              txHash: latestLog.transactionHash,
            })
            .onConflictDoNothing();
          await db
            .insert(circleActions)
            .values({
              actionType: "unlock_thesis",
              walletAddress,
              amount,
              chain: "Arc Testnet",
              txHash: latestLog.transactionHash,
              relatedCallId: call.id,
              status: "success",
              metadata: { onchainCallId: call.onchainCallId, registryAddress: registry },
            })
            .onConflictDoNothing();
        }
      }
    } catch (error) {
      console.warn("Onchain thesis unlock check failed", error);
    }
  }

  if (!unlocked) return NextResponse.json({ error: "Thesis is locked for this wallet." }, { status: 403 });
  return NextResponse.json({ thesis: call.thesis, counterarguments: call.counterarguments });
}
