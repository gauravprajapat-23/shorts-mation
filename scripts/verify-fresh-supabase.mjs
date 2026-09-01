#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const dbUrl = process.env.SUPABASE_TEST_DB_URL;
if (!dbUrl) { console.error("[BLOCKED] SUPABASE_TEST_DB_URL is required. Use a disposable/fresh database only."); process.exit(2); }
const psql = spawnSync("psql", ["--version"], { encoding: "utf8" });
if (psql.status !== 0) { console.error("[BLOCKED] psql is required to verify migrations on a fresh Supabase/Postgres database."); process.exit(2); }
const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
for (const migration of migrations) {
  console.log(`[migration] ${migration}`);
  const r = spawnSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", `supabase/migrations/${migration}`], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (!process.env.SUPABASE_TEST_URL || !process.env.SUPABASE_TEST_SERVICE_ROLE_KEY) {
  console.error("[BLOCKED] Migrations applied, but SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY are required for integration verification."); process.exit(2);
}
const test = spawnSync("npm", ["run", "test:integration"], { stdio: "inherit", env: process.env });
process.exit(test.status ?? 1);
