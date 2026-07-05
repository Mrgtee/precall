import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

const defaultMaxJsonBytes = 64 * 1024;

export const addressSchema = z
  .string()
  .trim()
  .refine((value) => isAddress(value), "Valid EVM address is required.")
  .transform((value) => getAddress(value) as Address);

export const normalizedAddressSchema = addressSchema.transform((value) => value.toLowerCase() as Address);

export const txHashSchema = z
  .string()
  .trim()
  .refine((value) => isHex(value, { strict: true }) && value.length === 66, "Valid transaction hash is required.")
  .transform((value) => value as Hex);

export const positiveIntSchema = z.coerce.number().int().positive();

type JsonInit = ResponseInit & {
  headers?: HeadersInit;
};

export function noStoreJson(payload: unknown, init: JsonInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return NextResponse.json(payload, { ...init, headers });
}

export function errorJson(message: string, status = 400) {
  return noStoreJson({ error: message }, { status });
}

export type ParsedJson<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
  options: { maxBytes?: number } = {},
): Promise<ParsedJson<z.infer<T>>> {
  const maxBytes = options.maxBytes ?? defaultMaxJsonBytes;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, response: errorJson("Request body is too large.", 413) };
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: errorJson("Request body could not be read.", 400) };
  }

  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return { ok: false, response: errorJson("Request body is too large.", 413) };
  }

  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, response: errorJson("Request body must be valid JSON.", 400) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, response: errorJson("Request body is invalid.", 400) };
  return { ok: true, data: parsed.data };
}

function configuredOrigins() {
  return [process.env.APP_ORIGIN, process.env.NEXT_PUBLIC_APP_URL]
    .map((value) => value?.replace(/\/+$/, ""))
    .filter((value): value is string => Boolean(value));
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const expectedOrigin = host ? `${forwardedProto || requestUrl.protocol.replace(":", "")}://${host}` : requestUrl.origin;
  const allowed = new Set([requestUrl.origin, expectedOrigin, ...configuredOrigins()]);

  return allowed.has(origin.replace(/\/+$/, "")) ? null : errorJson("Request origin is not allowed.", 403);
}

export function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasBearerSecret(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const value = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  return value.startsWith(prefix) && timingSafeStringEqual(value.slice(prefix.length), secret);
}

export function normalizedAddress(value: string) {
  return getAddress(value).toLowerCase() as Address;
}
