import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "../env";

export function createDbConnection(databaseUrl = requireEnv("DATABASE_URL")) {
  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
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
