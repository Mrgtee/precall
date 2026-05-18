import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { requireEnv } from "../env";

export type PrecallDb = ReturnType<typeof createDb>;

export function createDb(databaseUrl = requireEnv("DATABASE_URL")) {
  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
  });

  return drizzle(client, { schema });
}
