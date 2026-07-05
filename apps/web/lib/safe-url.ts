import { isHex } from "viem";
import { arcTxUrl } from "@precall/shared/chains";

export function safeExternalUrl(value: string | null | undefined, fallback = "#") {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function safeArcTxUrl(hash: string | null | undefined, fallback = "#") {
  return hash && isHex(hash, { strict: true }) && hash.length === 66 ? arcTxUrl(hash) : fallback;
}
