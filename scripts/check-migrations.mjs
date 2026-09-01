#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const seen = new Set();
const errors = [];
for (const file of files) {
  const prefix = file.split("_")[0];
  if (seen.has(prefix)) errors.push(`duplicate migration timestamp: ${prefix}`);
  seen.add(prefix);
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  if (!sql.trim()) errors.push(`${file}: empty migration`);
  if (/SECURITY DEFINER/i.test(sql) && !/SET\s+search_path/i.test(sql)) errors.push(`${file}: SECURITY DEFINER without SET search_path`);
}
const v213 = files.find((f) => f.includes("v2_13_security_queue_integrity"));
if (!v213) errors.push("missing V2.13 queue/security migration");
else {
  const sql = readFileSync(`supabase/migrations/${v213}`, "utf8");
  for (const needle of ["claim_render_item", "claim_upload_item", "render_attempts", "upload_attempts", "trg_campaign_tenant_integrity", "users update own private templates"]) {
    if (!sql.includes(needle)) errors.push(`${v213}: missing ${needle}`);
  }
}

const v215 = files.find((f) => f.includes("v2_15_queue_control_state_integrity"));
if (!v215) errors.push("missing V2.15 queue-control migration");
else {
  const sql = readFileSync(`supabase/migrations/${v215}`, "utf8");
  for (const needle of ["REVOKE UPDATE, DELETE ON public.campaign_items FROM authenticated", "retry_campaign_item", "bulk_update_queue_items", "users select own items", "users insert own items"]) {
    if (!sql.includes(needle)) errors.push(`${v215}: missing ${needle}`);
  }
}

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Migration integrity OK: ${files.length} SQL migrations, unique ordering, V2.13 + V2.15 queue invariants present.`);
