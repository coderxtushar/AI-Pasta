import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Reuse one connection pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

// postgres.js connects lazily, so importing this without DATABASE_URL is safe
// as long as no query runs. `prepare: false` keeps it compatible with
// transaction poolers (Neon pooled URLs, Supabase pgbouncer).
const client =
  globalForDb.pgClient ?? postgres(process.env.DATABASE_URL ?? "", { max: 5, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
