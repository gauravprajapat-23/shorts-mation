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

const v216 = files.find((f) => f.includes("v2_16_workflow_consistency"));
if (!v216) errors.push("missing V2.16 workflow-consistency migration");
else {
  const sql = readFileSync(`supabase/migrations/${v216}`, "utf8");
  for (const needle of ["create_campaign_with_items", "intended_publish_at", "intended_final_status", "complete_finished_campaigns", "schedule every campaign item before activating automation"]) {
    if (!sql.includes(needle)) errors.push(`${v216}: missing ${needle}`);
  }
}

const v217 = files.find((f) => f.includes("v2_17_durable_asset_architecture"));
if (!v217) errors.push("missing V2.17 durable-asset migration");
else {
  const sql = readFileSync(`supabase/migrations/${v217}`, "utf8");
  for (const needle of ["content_hash", "asset_usages", "asset_storage_usage", "replace_asset_everywhere", "list_unused_asset_candidates", "sync_template_asset_usages", "sync_campaign_item_asset_usages"]) {
    if (!sql.includes(needle)) errors.push(`${v217}: missing ${needle}`);
  }
}

const v218 = files.find((f) => f.includes("v2_18_render_reliability_cost_control"));
if (!v218) errors.push("missing V2.18 render-reliability migration");
else {
  const sql = readFileSync(`supabase/migrations/${v218}`, "utf8");
  for (const needle of ["render_budgets", "render_logs", "render_priority", "render_dead_lettered_at", "cancel_render_item", "recover_dead_letter_render"]) {
    if (!sql.includes(needle)) errors.push(`${v218}: missing ${needle}`);
  }
}

const v219 = files.find((f) => f.includes("v2_19_campaign_operations"));
if (!v219) errors.push("missing V2.19 campaign-operations migration");
else {
  const sql = readFileSync(`supabase/migrations/${v219}`, "utf8");
  for (const needle of ["is_paused", "set_campaign_item_paused", "retry_selected_campaign_items", "duplicate_campaign", "claim_render_item", "claim_upload_item"]) {
    if (!sql.includes(needle)) errors.push(`${v219}: missing ${needle}`);
  }
}

const v220 = files.find((f) => f.includes("v2_20_template_marketplace"));
if (!v220) errors.push("missing V2.20 template-marketplace migration");
else {
  const sql = readFileSync(`supabase/migrations/${v220}`, "utf8");
  for (const needle of ["template_favorites", "template_versions", "visibility", "validation_score", "required_variables", "remix_template", "restore_template_version"]) {
    if (!sql.includes(needle)) errors.push(`${v220}: missing ${needle}`);
  }
}

const v221 = files.find((f) => f.includes("v2_21_automation_data_studio"));
if (!v221) errors.push("missing V2.21 automation-data-studio migration");
else {
  const sql = readFileSync(`supabase/migrations/${v221}`, "utf8");
  for (const needle of ["automation_data_studios", "columns_json", "rows_json", "mapping_json", "mark_data_studio_generated", "users manage own automation data studios"]) {
    if (!sql.includes(needle)) errors.push(`${v221}: missing ${needle}`);
  }
}

const v222 = files.find((f) => f.includes("v2_22_ai_content_generation"));
if (!v222) errors.push("missing V2.22 AI-content migration");
else {
  const sql = readFileSync(`supabase/migrations/${v222}`, "utf8");
  for (const needle of ["ai_providers", "api_key_encrypted", "ai_generation_runs", "requested_count", "usage_json"]) {
    if (!sql.includes(needle)) errors.push(`${v222}: missing ${needle}`);
  }
}

const v224 = files.find((f) => f.includes("v2_24_audio_voice_automation"));
if (!v224) errors.push("missing V2.24 audio/voice automation migration");
else {
  const sql = readFileSync(`supabase/migrations/${v224}`, "utf8");
  for (const needle of ["tts_providers", "voice_presets", "audio_presets", "audio_library_items", "tts_generation_runs"]) {
    if (!sql.includes(needle)) errors.push(`${v224}: missing ${needle}`);
  }
}

const v225 = files.find((f) => f.includes("v2_25_youtube_intelligence_publishing"));
if (!v225) errors.push("missing V2.25 YouTube intelligence migration");
else {
  const sql = readFileSync(`supabase/migrations/${v225}`, "utf8");
  for (const needle of ["youtube_channel_snapshots","youtube_video_performance","youtube_publish_presets","upload_defaults_json","youtube_thumbnail_asset_id"]) {
    if (!sql.includes(needle)) errors.push(`${v225}: missing ${needle}`);
  }
}

const v226 = files.find((f) => f.includes("v2_26_winning_template_intelligence"));
if (!v226) errors.push("missing V2.26 winning-template intelligence migration");
else {
  const sql = readFileSync(`supabase/migrations/${v226}`, "utf8");
  for (const needle of ["analytics_recommendation_runs","retention_proxy","first_3s_proxy","template_id","campaign_id","hook","cta","topic","variant","ctr"]) {
    if (!sql.includes(needle)) errors.push(`${v226}: missing ${needle}`);
  }
}

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Migration integrity OK: ${files.length} SQL migrations, unique ordering, V2.13 + V2.15 + V2.16 + V2.17 + V2.18 + V2.19 + V2.20 + V2.21 + V2.22 + V2.24 + V2.25 + V2.26 invariants present.`);
