import { readFile } from "node:fs/promises";

const checks = [];
const check = (name, ok) => { checks.push([name, !!ok]); console.log(`${ok ? "PASS" : "FAIL"} ${name}`); };
const read = (p) => readFile(p, "utf8");

const automation = await read("src/lib/automation.functions.ts");
const pipeline = await read("src/lib/render-pipeline.server.ts");
const page = await read("src/routes/_app/campaigns/$campaignId.test-render.tsx");
const campaign = await read("src/routes/_app/campaigns/$campaignId.tsx");
const r2 = await read("src/lib/r2-publish-source.server.ts");
const migration = await read("supabase/migrations/20260907235900_manual_mp4_render_download.sql");

check("manual render uses native production queue", page.includes("renderCampaignItemNow") && page.includes("Native Chromium + FFmpeg"));
check("browser ffmpeg removed from manual MP4 page", !page.includes('import("@/lib/ffmpeg-render")') && !page.includes("attachBrowserRenderedOutput"));
check("manual render polls authoritative worker", automation.includes("getCampaignItemRenderStatus") && automation.includes("getFfmpegWorkerJob"));
check("manual render finalizes R2 immediately", automation.includes("finalizeR2Render") && automation.includes("worker.outputObjectKey"));
check("secure completed-render download command", automation.includes("getCampaignItemRenderDownload") && automation.includes("presignR2Get"));
check("R2 download is attachment-capable", r2.includes("response-content-disposition") && r2.includes("video/mp4"));
check("campaign row exposes Download action", campaign.includes("downloadMp4") && campaign.includes("Download MP4") || campaign.includes('"Download"'));
check("manual re-render supported", automation.includes("force?: boolean") && campaign.includes("Re-render"));
check("paused automation can still be manually rendered", migration.includes("claim_render_item_manual") && pipeline.includes('opts?.allowPausedItem ? "claim_render_item_manual"'));
check("manual claim remains service-role only", migration.includes("REVOKE ALL ON FUNCTION public.claim_render_item_manual") && migration.includes("GRANT EXECUTE ON FUNCTION public.claim_render_item_manual") && migration.includes("TO service_role"));

const failed = checks.filter(([,ok]) => !ok);
console.log(`${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
