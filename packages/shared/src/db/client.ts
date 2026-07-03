import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "../env";

function databaseConnectTimeoutSeconds() {
  const parsed = Number(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS || 15);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
}

let globalDb: any;
let globalClient: any;

export function createDbConnection(databaseUrl = requireEnv("DATABASE_URL")) {
  const globalRef = globalThis as any;
  if (globalRef.db && globalRef.client) {
    return { db: globalRef.db, client: globalRef.client };
  }
  if (globalDb && globalClient) {
    return { db: globalDb, client: globalClient };
  }

  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
    connect_timeout: databaseConnectTimeoutSeconds(),
  });

  const db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalRef.db = db;
    globalRef.client = client;
  }
  globalDb = db;
  globalClient = client;

  return { db, client };
}

export function createDb(databaseUrl = requireEnv("DATABASE_URL")) {
  return createDbConnection(databaseUrl).db;
}

export type PrecallDb = ReturnType<typeof createDb>;
