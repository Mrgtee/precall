import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "../env";

function databaseConnectTimeoutSeconds() {
  const parsed = Number(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS || 5);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

export function createDbConnection(databaseUrl = requireEnv("DATABASE_URL")) {
  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
    connect_timeout: databaseConnectTimeoutSeconds(),
  });

  return {
    db: drizzle(client, { schema }),
    client,
  };
}

export function createDb(databaseUrl = requireEnv("DATABASE_URL")) {
  return createDbConnection(databaseUrl).db;
}

export type PrecallDb = ReturnType<typeof createDb>;
