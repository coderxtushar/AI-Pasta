import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { E2E } from "./env";

/** Creates the test database if needed, migrates it, and seeds two signed-in users. */
export default async function globalSetup() {
  const url = new URL(E2E.databaseUrl);
  const dbName = url.pathname.slice(1);

  const admin = postgres({ ...connectionOf(url), database: "postgres", max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`;
  if (!exists) await admin.unsafe(`create database "${dbName.replace(/"/g, "")}"`);
  await admin.end();

  const sql = postgres(E2E.databaseUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql`truncate "user", "account", "session", "comparison", "response", "api_key" cascade`;
  await sql`insert into "user" (id, name, email) values
    ('e2e-owner', 'Owner Person', 'owner@e2e.test'),
    ('e2e-other', 'Other Person', 'other@e2e.test')`;
  await sql`insert into "session" ("sessionToken", "userId", expires) values
    (${E2E.ownerToken}, 'e2e-owner', now() + interval '1 day'),
    (${E2E.otherToken}, 'e2e-other', now() + interval '1 day')`;
  await sql.end();
}

function connectionOf(url: URL) {
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}
