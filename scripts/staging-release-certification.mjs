#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const gates = [
  ["release verification", ["npm", ["run", "verify:release"]]],
  ["Playwright E2E", ["npm", ["run", "test:e2e"]]],
  ["browser memory profile", ["npm", ["run", "profile:browser"]]],
];
const results = [];
for (const [name, [cmd, args]] of gates) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  results.push({ name, status: r.status === 0 ? "passed" : r.status === 2 ? "blocked" : "failed", exitCode: r.status });
  if (r.status && r.status !== 2) break;
}
const externalRequired = ["STAGING_CAMPAIGN_ID", "STAGING_SUPABASE_URL", "STAGING_SUPABASE_SERVICE_ROLE_KEY", "STAGING_EXPECT_YOUTUBE_UPLOAD"];
const missing = externalRequired.filter((k) => !process.env[k]);
if (missing.length) results.push({ name: "dynamic render → storage → YouTube", status: "blocked", reason: `Missing: ${missing.join(", ")}` });
else {
  const base = process.env.STAGING_SUPABASE_URL.replace(/\/$/, "");
  const headers = { apikey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY}` };
  const campaignId = encodeURIComponent(process.env.STAGING_CAMPAIGN_ID);
  const response = await fetch(`${base}/rest/v1/campaign_items?campaign_id=eq.${campaignId}&select=id,status,render_output_path,youtube_video_id,youtube_url,schedule_at`, { headers });
  if (!response.ok) results.push({ name: "dynamic render → storage → YouTube", status: "failed", reason: await response.text() });
  else {
    const items = await response.json();
    const complete = items.some((i) => i.render_output_path && i.youtube_video_id && i.youtube_url && ["scheduled","uploaded"].includes(i.status));
    results.push({ name: "dynamic render → storage → YouTube", status: complete ? "passed" : "failed", items });
  }
}
console.log("\nV2.14 certification summary\n" + JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.status === "failed") ? 1 : results.some((r) => r.status === "blocked") ? 2 : 0);
