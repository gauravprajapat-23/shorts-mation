// Backend render pipeline. Runs from the cron hook, so MP4s are produced and
// stored without the website being open:
//   1. submitDueRenders()  — sends jobs to the render provider, but only for
//      videos whose render lead time (60 min before publish) has arrived, and
//      only a few per tick, so the queue is spread out instead of bursting.
//   2. collectFinishedRenders() — downloads finished MP4s into Supabase
//      Storage (`renders` bucket) and marks the item `rendered`.
import { CANVAS_DIMS } from "@/lib/editor-defaults";
import type { EditorDocument, TextElement, VideoElement } from "@/lib/types";
import { buildFfmpegWorkerManifest } from "@/lib/ffmpeg-worker-manifest.server";
import { submitFfmpegWorkerJob, getFfmpegWorkerJob, cancelFfmpegWorkerJob } from "@/lib/ffmpeg-worker.server";
import { DEFAULT_RENDER_BUDGET, estimateRenderCostUsd, renderTimeoutMs, retryBackoffMs, shouldDeadLetter, type RenderBudget } from "@/lib/render-reliability";
import { getRenderWorkerConfig, renderCallbackBaseUrl, renderManifestBaseUrl } from "@/lib/render-settings.server";
import { parseEditorDocument } from "@/lib/editor-document-schema";
import { campaignAutomationInput, campaignStringVariables, materializeCampaignRenderDocument } from "@/lib/render-materialization";
import { createHash, randomUUID } from "node:crypto";
import { effectiveCap, getAutomationLimits, getUserLimitOverrides, inFlightRenders, RENDER_STALE_MINUTES } from "@/lib/automation-limits.server";
import { hydrateDocumentAssetRefsServer } from "@/lib/asset-refs.server";

export const RENDER_LEAD_MINUTES = 60;
export const UPLOAD_LEAD_MINUTES = 20;
const COLLECT_PER_TICK = 6;
const SIGN_TTL_SECONDS = 60 * 60 * 6;

function fallbackDocument(vars: Record<string, string>): EditorDocument {
  const dims = CANVAS_DIMS["9:16"];
  const entries = Object.entries(vars).filter(([, v]) => String(v ?? "").trim()).slice(0, 3);
  const elements: TextElement[] = entries.map(([key, value], i) => ({
    id: `auto_${key}`,
    type: "text",
    x: 80,
    y: 420 + i * 420,
    w: dims.w - 160,
    h: 340,
    rotation: 0,
    opacity: 1,
    locked: false,
    text: value,
    fontSize: i === 0 ? 96 : 64,
    fontWeight: i === 0 ? 800 : 600,
    fontFamily: "Inter",
    color: "#FFFFFF",
    align: "center",
    reveal: "wordByWord",
    animations: { in: { type: "fade", delayMs: 200 * i, durationMs: 500 } },
  }));
  return {
    version: 1,
    aspect: "9:16",
    scenes: [{ id: "auto_scene", name: "Auto", durationMs: 6000, background: "#0A0A0A", elements }],
    audio: { volume: 0.7 },
    variables: Object.keys(vars),
  };
}

async function signAsset(userId: string, fileName?: string | null): Promise<string | null> {
  if (!fileName) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let path: string | null = fileName.startsWith(`${userId}/`) ? fileName : null;
  if (!path) {
    const { data } = await supabaseAdmin
      .from("assets")
      .select("storage_path")
      .eq("user_id", userId)
      .eq("file_name", fileName)
      .eq("lifecycle_status", "active")
      .limit(1)
      .maybeSingle();
    path = data?.storage_path ?? null;
  }
  if (!path) return null;
  const { data } = await supabaseAdmin.storage.from("assets").createSignedUrl(path.replace(/^assets\//, ""), SIGN_TTL_SECONDS);
  return data?.signedUrl ?? null;
}


async function signDocumentMediaUrls(doc:EditorDocument,userId:string):Promise<EditorDocument>{
  const copy=structuredClone(doc) as EditorDocument;
  const sign=async(src:string)=>{
    if(/^https:\/\//i.test(src))return src;
    if(src.startsWith("asset://")){
      const id=src.slice(8);const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const {data}=await supabaseAdmin.from("assets").select("storage_path").eq("id",id).eq("user_id",userId).eq("lifecycle_status","active").maybeSingle();if(!data?.storage_path)throw new Error(`Render asset ${id} is unavailable`);const signed=await supabaseAdmin.storage.from("assets").createSignedUrl(String(data.storage_path).replace(/^assets\//,""),SIGN_TTL_SECONDS);if(signed.error||!signed.data?.signedUrl)throw signed.error??new Error("Could not sign render asset");return signed.data.signedUrl;
    }
    return src;
  };
  for(const scene of copy.scenes)for(const el of scene.elements){if((el.type==="video"||el.type==="image")&&"src" in el&&typeof el.src==="string"&&el.src)el.src=await sign(el.src);}
  if(copy.version===2){for(const clip of copy.audioClips)if(clip.src)clip.src=await sign(clip.src);}
  return copy;
}

function backgroundFromDoc(doc: EditorDocument, vars: Record<string, string>): string | null {
  for (const s of doc.scenes) {
    for (const el of s.elements) {
      if (el.type !== "video") continue;
      const raw = (el as VideoElement).src;
      if (!raw) continue;
      if (raw.startsWith("{{")) {
        const key = raw.replace(/[{}\s]/g, "");
        if (vars[key]) return vars[key];
      } else if (/^https:\/\//i.test(raw)) return raw;
    }
  }
  return null;
}

async function log(row: { user_id: string; campaign_id: string; id: string }, level: "info" | "warn" | "error", message: string, event = "render", attemptId?: string | null, metadata: Record<string, unknown> = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await Promise.all([
    supabaseAdmin.from("automation_logs").insert({ user_id: row.user_id, campaign_id: row.campaign_id, campaign_item_id: row.id, level, message, metadata_json: metadata as never }),
    (supabaseAdmin as any).from("render_logs").insert({ user_id: row.user_id, campaign_id: row.campaign_id, campaign_item_id: row.id, render_attempt_id: attemptId ?? null, level, event, message, metadata_json: metadata as never }),
  ]);
}

async function budgetFor(userId: string): Promise<RenderBudget> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any).from("render_budgets").select("*").eq("user_id", userId).maybeSingle();
  return data ? {
    monthlyBudgetUsd: Number(data.monthly_budget_usd),
    maxCostPerRenderUsd: Number(data.max_cost_per_render_usd),
    maxRenderSeconds: Number(data.max_render_seconds),
    maxRetries: Number(data.max_retries),
    baseBackoffSeconds: Number(data.base_backoff_seconds),
  } : DEFAULT_RENDER_BUDGET;
}

async function monthSpend(userId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
  const { data } = await (supabaseAdmin as any).from("render_attempts").select("estimated_cost_usd").eq("user_id", userId).gte("claimed_at", start.toISOString()).in("status", ["submitted","completed"]);
  return (data ?? []).reduce((sum: number, r: any) => sum + Number(r.estimated_cost_usd ?? 0), 0);
}

export async function submitDueRenders(opts?: {
  campaignId?: string;
  ignoreLeadTime?: boolean;
  limit?: number;
}): Promise<{ submitted: number; errors: number; skipped?: string }> {
  await reclaimStaleRenders();
  return submitDueRendersInner(opts);
}

/** Frees rows whose render claim was abandoned — a closed browser tab that left
 *  `status = rendering`, or a provider job that never called back. Without this
 *  a few stuck rows permanently consume the concurrency caps and the whole
 *  queue stops rendering and uploading. */
export async function reclaimStaleRenders(): Promise<{ reclaimed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - RENDER_STALE_MINUTES * 60_000).toISOString();
  const { data: stale } = await supabaseAdmin
    .from("campaign_items")
    .select("id, user_id, campaign_id, render_job_ref, render_submitted_at, updated_at")
    .eq("status", "rendering")
    .is("rendered_video_url", null)
    .lt("updated_at", cutoff)
    .limit(200);
  const rows = ((stale ?? []) as any[]).filter(
    (r) => (r.render_submitted_at ?? r.updated_at ?? "") < cutoff,
  );
  for (const row of rows) {
    const { data: current } = await supabaseAdmin.from("campaign_items").select("active_render_attempt_id").eq("id", row.id).maybeSingle();
    const attemptId = (current as any)?.active_render_attempt_id as string | null;
    // Before starting a second paid render, ask the provider whether the first
    // stale-looking job is actually still alive or already finished.
    if (row.render_job_ref) {
      try {
        const cred = await getRenderWorkerConfig(row.user_id);
        if (cred) {
          const provider = await getFfmpegWorkerJob(cred, row.render_job_ref);
          if (provider.status === "completed" && provider.outputUrl) {
            await storeFinishedRender(row, provider.outputUrl!, attemptId);
            continue;
          }
          if (provider.status !== "failed") {
            await log(row, "warn", `Render exceeded local stale timeout but provider still reports ${provider.status}; keeping the active attempt`);
            continue;
          }
        }
      } catch {
        // If provider reconciliation itself is unavailable, do not create a
        // duplicate paid job. The next cron pass can try reconciliation again.
        await log(row, "warn", "Could not reconcile stale render with provider; keeping the active attempt to avoid a duplicate render");
        continue;
      }
    }
    if (attemptId) {
      await (supabaseAdmin as any).from("render_attempts").update({ status: "abandoned", error_message: "provider confirmed stale/failed render", finished_at: new Date().toISOString() }).eq("id", attemptId);
    }
    await supabaseAdmin
      .from("campaign_items")
      .update({ status: "pending", render_job_ref: null, render_submitted_at: null, active_render_attempt_id: null })
      .eq("id", row.id)
      .eq("status", "rendering");
    await log(row, "warn", "Provider confirmed the stale render was no longer processing; item requeued");
  }
  return { reclaimed: rows.length };
}

async function submitDueRendersInner(opts?: {
  campaignId?: string;
  ignoreLeadTime?: boolean;
  limit?: number;
}): Promise<{ submitted: number; errors: number; skipped?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const limits = await getAutomationLimits();
  const flight = await inFlightRenders();
  const overrides = await getUserLimitOverrides();
  const globalRoom = Math.max(0, limits.max_global_concurrent_renders - flight.total);
  if (globalRoom === 0) return { submitted: 0, errors: 0, skipped: "global render concurrency limit reached" };
  const perTick = Math.min(opts?.limit ?? limits.max_renders_per_tick, limits.max_renders_per_tick, globalRoom);
  const nowIso = new Date().toISOString();
  let query = supabaseAdmin
    .from("campaign_items")
    .select("id, user_id, campaign_id, content_json, asset_json, audio_json, schedule_at, render_priority, render_retry_count, render_next_attempt_at, render_dead_lettered_at, render_cancel_requested_at, campaigns!inner(status, template_id, settings_json)")
    .in("status", ["pending", "upload_pending"])
    .is("rendered_video_url", null)
    .is("render_job_ref", null)
    .is("render_dead_lettered_at", null)
    .is("render_cancel_requested_at", null)
    .eq("is_paused", false);
  if (opts?.campaignId) query = query.eq("campaign_id", opts.campaignId);
  if (!opts?.ignoreLeadTime) {
    query = query.not("render_due_at", "is", null).lte("render_due_at", nowIso);
  }
  const { data: rows } = await query
    .order("render_priority", { ascending: false })
    .order("schedule_at", { ascending: true, nullsFirst: false })
    .limit(perTick * 4);

  const callbackBaseUrl = renderCallbackBaseUrl();
  const workerId = `render-worker:${randomUUID()}`;
  const perUser = { ...flight.perUser };
  const credCache = new Map<string, Awaited<ReturnType<typeof getRenderWorkerConfig>>>();
  let submitted = 0, errors = 0, throttled = 0;
  for (const row of (rows ?? []) as any[]) {
    if (submitted >= perTick) break;
    if (row.campaigns?.status !== "active") continue;
    if (row.render_next_attempt_at && new Date(row.render_next_attempt_at).getTime() > Date.now()) continue;
    const cap = effectiveCap(overrides, row.user_id, "renders", limits.max_user_concurrent_renders);
    if ((perUser[row.user_id] ?? 0) >= cap) { throttled++; continue; }
    if (!credCache.has(row.user_id)) credCache.set(row.user_id, await getRenderWorkerConfig(row.user_id));
    const cred = credCache.get(row.user_id) ?? null;
    if (!cred) continue;
    let attemptId: string | undefined;
    try {
      const idempotencyKey = `render:${row.id}:retry:${Number(row.render_retry_count ?? 0)}`;
      const claim = await (supabaseAdmin as any).rpc("claim_render_item", {
        p_item_id: row.id,
        p_worker_id: workerId,
        p_idempotency_key: idempotencyKey,
      });
      attemptId = claim.data?.[0]?.attempt_id as string | undefined;
      if (!attemptId) continue;
      const callbackToken = randomUUID();
      const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
      await (supabaseAdmin as any).from("render_attempts").update({ callback_token_hash: callbackTokenHash }).eq("id", attemptId);
      const callbackUrl = `${callbackBaseUrl}?attempt=${encodeURIComponent(attemptId)}&token=${encodeURIComponent(callbackToken)}`;

      const rawVars = campaignAutomationInput(row.content_json);
      let doc: EditorDocument | null = null;
      if (row.campaigns?.template_id) {
        const { data: tpl } = await supabaseAdmin.from("templates").select("template_json").eq("id", row.campaigns.template_id).maybeSingle();
        if (tpl?.template_json) doc = parseEditorDocument(tpl.template_json);
      }
      if (!doc?.scenes?.length) doc = fallbackDocument(campaignStringVariables(row.content_json));
      const concrete = materializeCampaignRenderDocument(doc, rawVars);
      doc = await hydrateDocumentAssetRefsServer(concrete.document, row.user_id);
      doc = await signDocumentMediaUrls(doc,row.user_id);
      const vars = concrete.values;
      const budget = await budgetFor(row.user_id);
      const estimatedCost = estimateRenderCostUsd(concrete.durationMs);
      const spent = await monthSpend(row.user_id);
      if (estimatedCost > budget.maxCostPerRenderUsd) throw new Error(`Render budget blocked: estimated $${estimatedCost.toFixed(4)} exceeds per-render limit $${budget.maxCostPerRenderUsd.toFixed(4)}`);
      if (spent + estimatedCost > budget.monthlyBudgetUsd) throw new Error(`Render budget blocked: monthly budget $${budget.monthlyBudgetUsd.toFixed(2)} would be exceeded`);
      await (supabaseAdmin as any).from("render_attempts").update({ estimated_cost_usd: estimatedCost, retry_number: Number(row.render_retry_count ?? 0) }).eq("id", attemptId);
      await supabaseAdmin.from("campaign_items").update({ render_estimated_cost_usd: estimatedCost }).eq("id", row.id);

      const asset = (row.asset_json ?? {}) as { background_file_name?: string };
      const audio = (row.audio_json ?? {}) as { audio_file_name?: string; volume?: number };
      const backgroundVideoUrl = (await signAsset(row.user_id, asset.background_file_name)) ?? backgroundFromDoc(doc, vars);
      const audioUrl = await signAsset(row.user_id, audio.audio_file_name);

      const manifest = buildFfmpegWorkerManifest({
        doc, vars, backgroundVideoUrl, audioUrl,
        audioVolume: audio.volume ?? doc.audio?.volume ?? 0.7,
        resolution: "1080p", fps: 25,
      });
      const manifestToken=randomUUID();
      const manifestTokenHash=createHash("sha256").update(manifestToken).digest("hex");
      await (supabaseAdmin as any).from("render_attempts").update({metadata_json:{manifest_token_hash:manifestTokenHash}}).eq("id",attemptId);
      const {error:manifestError}=await supabaseAdmin.storage.from("assets").upload(`${row.user_id}/render-manifests/${attemptId}.json`,new TextEncoder().encode(JSON.stringify(manifest)),{contentType:"application/json",upsert:true});
      if(manifestError)throw manifestError;
      const manifestUrl=`${renderManifestBaseUrl()}?attempt=${encodeURIComponent(attemptId)}&token=${encodeURIComponent(manifestToken)}`;
      const jobId = await submitFfmpegWorkerJob(cred,{idempotencyKey,attemptId,manifestUrl,callbackUrl});
      await (supabaseAdmin as any).from("render_attempts").update({ provider_job_ref: jobId, status: "submitted", submitted_at: new Date().toISOString() }).eq("id", attemptId);
      await supabaseAdmin.from("campaign_items").update({ render_job_ref: jobId }).eq("id", row.id).eq("active_render_attempt_id", attemptId);
      await log(row, "info", `Server render submitted (attempt ${attemptId}, job ${jobId})`, "submitted", attemptId, { job_id: jobId });
      perUser[row.user_id] = (perUser[row.user_id] ?? 0) + 1;
      submitted++;
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : "Server render submit failed";
      if (attemptId) {
        const budget = await budgetFor(row.user_id);
        const nextRetry = Number(row.render_retry_count ?? 0) + 1;
        const dead = shouldDeadLetter(nextRetry, budget.maxRetries);
        const nextAt = new Date(Date.now() + retryBackoffMs(nextRetry, budget.baseBackoffSeconds)).toISOString();
        await (supabaseAdmin as any).from("render_attempts").update({ status: dead ? "dead_letter" : "failed", error_message: msg, finished_at: new Date().toISOString(), next_retry_at: dead ? null : nextAt }).eq("id", attemptId);
        await supabaseAdmin.from("campaign_items").update({
          status: dead ? "failed" : "pending", render_job_ref: null, active_render_attempt_id: null, error_message: msg,
          render_retry_count: nextRetry, render_next_attempt_at: dead ? null : nextAt, render_dead_lettered_at: dead ? new Date().toISOString() : null,
        }).eq("id", row.id).eq("active_render_attempt_id", attemptId);
        await log(row, dead ? "error" : "warn", dead ? `Render moved to dead letter after ${nextRetry} attempts: ${msg}` : `Render retry ${nextRetry} scheduled with backoff: ${msg}`, dead ? "dead_letter" : "retry_scheduled", attemptId, { retry: nextRetry, next_at: dead ? null : nextAt });
      } else await log(row, "error", msg, "submit_failed");
    }
  }
  return { submitted, errors, ...(throttled ? { skipped: `${throttled} item(s) throttled by per-user render limit` } : {}) };
}

export async function collectFinishedRenders(): Promise<{ completed: number; pending: number; errors: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("campaign_items")
    .select("id, user_id, campaign_id, render_job_ref, active_render_attempt_id, render_cancel_requested_at, render_submitted_at, render_retry_count")
    .not("render_job_ref", "is", null)
    .is("rendered_video_url", null)
    .limit(COLLECT_PER_TICK);

  let completed = 0, pending = 0, errors = 0;
  for (const row of (rows ?? []) as any[]) {
    try {
      const cred = await getRenderWorkerConfig(row.user_id);
      if (!cred) { pending++; continue; }
      if (row.render_cancel_requested_at) {
        await cancelFfmpegWorkerJob(cred, row.render_job_ref as string);
        if (row.active_render_attempt_id) await (supabaseAdmin as any).from("render_attempts").update({ status: "cancelled", cancelled_at: new Date().toISOString(), finished_at: new Date().toISOString() }).eq("id", row.active_render_attempt_id);
        await supabaseAdmin.from("campaign_items").update({ status: "pending", render_job_ref: null, active_render_attempt_id: null, render_cancel_requested_at: null, error_message: "Render cancelled" }).eq("id", row.id);
        await log(row, "warn", "Render cancelled by user", "cancelled", row.active_render_attempt_id);
        continue;
      }
      const budget = await budgetFor(row.user_id);
      const submittedAt = row.render_submitted_at ? new Date(row.render_submitted_at).getTime() : Date.now();
      if (Date.now() - submittedAt > renderTimeoutMs(budget.maxRenderSeconds)) {
        try { await cancelFfmpegWorkerJob(cred, row.render_job_ref as string); } catch {}
        throw new Error(`Render timed out after ${budget.maxRenderSeconds}s`);
      }
      const status = await getFfmpegWorkerJob(cred, row.render_job_ref as string);
      if (row.active_render_attempt_id) await (supabaseAdmin as any).from("render_attempts").update({ provider_status: status.status, progress_percent: Math.max(0,Math.min(100,Math.round(Number(status.progress??0)))), progress_updated_at:new Date().toISOString() }).eq("id", row.active_render_attempt_id);
      if (status.status === "failed") throw new Error(status.error || "Render provider reported a failed render");
      if (status.status !== "completed" || !status.outputUrl) { pending++; continue; }
      await storeFinishedRender(row, status.outputUrl, (row as any).active_render_attempt_id);
      completed++;
    } catch (e) {
      errors++;
      await failRender(row, e instanceof Error ? e.message : "Server render failed", (row as any).active_render_attempt_id);
    }
  }
  return { completed, pending, errors };
}

type ItemRef = { id: string; user_id: string; campaign_id: string; active_render_attempt_id?: string | null };

async function allowedRenderOutputUrl(raw: string, userId: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    const localDev=process.env.NODE_ENV!=="production" && url.protocol==="http:" && ["localhost","127.0.0.1"].includes(url.hostname);
    if(!localDev) throw new Error("Render output must use HTTPS");
  }
  const configured = (process.env.RENDER_OUTPUT_HOSTS ?? "")
    .split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const host = url.hostname.toLowerCase();
  let workerOrigin=""; try{const config=await getRenderWorkerConfig(userId);workerOrigin=config?new URL(config.url).origin:"";}catch{}
  const workerHost=workerOrigin?new URL(workerOrigin).hostname.toLowerCase():"";
  const explicitlyAllowed = host===workerHost || configured.some((allowed) => host === allowed || (allowed.startsWith("*.") && host.endsWith(allowed.slice(1))));
  if (!explicitlyAllowed) throw new Error(`Untrusted render output host: ${host}. Configure FFMPEG_WORKER_URL or RENDER_OUTPUT_HOSTS for the worker output host.`);
  if(workerOrigin && url.origin===workerOrigin && !url.pathname.startsWith("/outputs/")) throw new Error("Worker output URL must use the protected /outputs/ path");
  return url;
}

/** Downloads an authoritative provider output into storage. The active attempt
 * compare-and-set prevents late callbacks from overwriting a newer render. */
export async function storeFinishedRender(row: ItemRef, url: string, attemptId?: string | null): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const safeUrl = await allowedRenderOutputUrl(url, row.user_id);
  const res = await fetch(safeUrl);
  if (!res.ok) throw new Error(`Could not download the finished MP4 [${res.status}]`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !contentType.startsWith("video/") && contentType !== "application/octet-stream") {
    throw new Error(`Render output was not a video (${contentType})`);
  }
  const declaredLength = Number(res.headers.get("content-length") ?? 0);
  const configuredMax=Number(process.env.MAX_RENDER_OUTPUT_BYTES||512*1024*1024);
  const maxBytes=Number.isFinite(configuredMax)?Math.max(10*1024*1024,Math.min(2*1024*1024*1024,configuredMax)):512*1024*1024;
  if(declaredLength>maxBytes)throw new Error("Finished MP4 exceeds the configured output limit");
  if(!res.body)throw new Error("The finished MP4 had no response body");
  const reader=res.body.getReader();const chunks:Uint8Array[]=[];let contentLength=0;
  while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;contentLength+=value.byteLength;if(contentLength>maxBytes){await reader.cancel();throw new Error("Finished MP4 exceeded the configured output limit");}chunks.push(value);}
  if(!contentLength)throw new Error("The finished MP4 was empty");
  const bytes=new Uint8Array(contentLength);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const path = `${row.user_id}/${row.id}-${Date.now()}.mp4`;
  const up = await supabaseAdmin.storage.from("renders").upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (up.error) throw up.error;

  let update = supabaseAdmin.from("campaign_items").update({
    rendered_video_url: path, status: "rendered", error_message: null,
    active_render_attempt_id: null, render_retry_count: 0, render_next_attempt_at: null,
    render_dead_lettered_at: null, render_cancel_requested_at: null,
  }).eq("id", row.id);
  if (attemptId) update = update.eq("active_render_attempt_id", attemptId);
  const { data: changed } = await update.select("id");
  if (attemptId && !changed?.length) {
    await supabaseAdmin.storage.from("renders").remove([path]);
    throw new Error("Render attempt is no longer active; refusing stale completion");
  }
  if (attemptId) {
    await (supabaseAdmin as any).from("render_attempts").update({ status: "completed", finished_at: new Date().toISOString(), finalized_at: new Date().toISOString(), output_bytes: contentLength || null, provider_status: "completed", progress_percent: 100, progress_updated_at: new Date().toISOString() }).eq("id", attemptId);
  }
  if(attemptId) await supabaseAdmin.storage.from("assets").remove([`${row.user_id}/render-manifests/${attemptId}.json`]).catch(()=>undefined);
  await log(row, "info", "Server render finished and stored", "finalized", attemptId, { output_bytes: contentLength || null, storage_path: path });
}

export async function failRender(row: ItemRef, message: string, attemptId?: string | null): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: current } = await supabaseAdmin.from("campaign_items").select("render_retry_count").eq("id", row.id).maybeSingle();
  const budget = await budgetFor(row.user_id);
  const retry = Number((current as any)?.render_retry_count ?? 0) + 1;
  const dead = shouldDeadLetter(retry, budget.maxRetries);
  const nextAt = dead ? null : new Date(Date.now() + retryBackoffMs(retry, budget.baseBackoffSeconds)).toISOString();
  if (attemptId) {
    await (supabaseAdmin as any).from("render_attempts").update({
      status: dead ? "dead_letter" : (message.toLowerCase().includes("timed out") ? "timed_out" : "failed"),
      error_message: message, finished_at: new Date().toISOString(), next_retry_at: nextAt,
    }).eq("id", attemptId);
  }
  let update = supabaseAdmin.from("campaign_items").update({
    status: dead ? "failed" : "pending", render_job_ref: null, active_render_attempt_id: null, error_message: message,
    render_retry_count: retry, render_next_attempt_at: nextAt, render_dead_lettered_at: dead ? new Date().toISOString() : null,
  }).eq("id", row.id);
  if (attemptId) update = update.eq("active_render_attempt_id", attemptId);
  await update;
  await log(row, dead ? "error" : "warn", dead ? `Render dead-lettered: ${message}` : `Render failed; retry ${retry} scheduled: ${message}`, dead ? "dead_letter" : "retry_scheduled", attemptId, { retry, next_at: nextAt });
}

/** Webhook entry point. The callback URL carries a one-attempt token. We ignore
 * provider-supplied output URLs and re-query the FFmpeg worker for authoritative state. */
export async function handleRenderCallback(payload: {
  id?: string;
  status?: string;
  url?: string | null;
  error?: string | null;
  progress?: number;
}, auth: { attemptId?: string | null; token?: string | null }): Promise<{ ok: boolean; detail: string }> {
  const jobId = payload.id;
  if (!jobId || !auth.attemptId || !auth.token) return { ok: false, detail: "missing render callback identity" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: attempt } = await (supabaseAdmin as any).from("render_attempts")
    .select("id,user_id,campaign_id,campaign_item_id,provider_job_ref,callback_token_hash,status")
    .eq("id", auth.attemptId).maybeSingle();
  if (!attempt) return { ok: false, detail: "render attempt mismatch" };
  const tokenHash = createHash("sha256").update(auth.token).digest("hex");
  const expected = String(attempt.callback_token_hash ?? "");
  if (!expected || expected.length !== tokenHash.length) return { ok: false, detail: "invalid callback token" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ tokenHash.charCodeAt(i);
  if (diff !== 0) return { ok: false, detail: "invalid callback token" };
  if (attempt.provider_job_ref && attempt.provider_job_ref !== jobId) return { ok: false, detail: "render job mismatch" };
  if (!attempt.provider_job_ref) {
    const { data: recovered } = await (supabaseAdmin as any).from("render_attempts")
      .update({ provider_job_ref: jobId, status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", attempt.id).is("provider_job_ref", null).select("id");
    if (!recovered?.length) return { ok: false, detail: "could not recover render job" };
    await supabaseAdmin.from("campaign_items").update({ render_job_ref: jobId }).eq("active_render_attempt_id", attempt.id);
  }
  if (attempt.status === "completed") return { ok: true, detail: "already stored" };

  const { data: row } = await supabaseAdmin.from("campaign_items")
    .select("id,user_id,campaign_id,rendered_video_url,active_render_attempt_id")
    .eq("id", attempt.campaign_item_id).maybeSingle();
  if (!row || (row as any).active_render_attempt_id !== attempt.id) return { ok: true, detail: "stale attempt ignored" };
  const progress=Math.max(0,Math.min(100,Math.round(Number(payload.progress??0))));
  if(payload.status==="queued"||payload.status==="rendering"){
    await (supabaseAdmin as any).from("render_attempts").update({provider_status:payload.status,progress_percent:progress,progress_updated_at:new Date().toISOString()}).eq("id",attempt.id).eq("status","submitted");
    return {ok:true,detail:`${payload.status} ${progress}%`};
  }

  const cred = await getRenderWorkerConfig(attempt.user_id);
  if (!cred) return { ok: false, detail: "render credentials unavailable" };
  try {
    const authoritative = await getFfmpegWorkerJob(cred, jobId);
    if (authoritative.status === "failed") {
      await failRender(row as ItemRef, authoritative.error || payload.error || "Render provider reported failure", attempt.id);
      return { ok: true, detail: "marked failed" };
    }
    if (authoritative.status !== "completed" || !authoritative.outputUrl) return { ok: true, detail: `provider status ${authoritative.status}` };
    await storeFinishedRender(row as ItemRef, authoritative.outputUrl, attempt.id);
    return { ok: true, detail: "stored" };
  } catch (e) {
    await failRender(row as ItemRef, e instanceof Error ? e.message : "Could not store finished render", attempt.id);
    return { ok: false, detail: "store failed" };
  }
}

