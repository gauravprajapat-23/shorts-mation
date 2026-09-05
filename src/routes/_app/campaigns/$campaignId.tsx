import { createFileRoute, useParams, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { Play, Pause, Trash2, Video, CheckCircle2, AlertTriangle, CalendarClock, Sparkles, Upload, ExternalLink, Activity, Copy, Clock3, ListTodo, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { deleteCampaignFully } from "@/lib/data-management.functions";
import { publishItemNow } from "@/lib/youtube-upload.functions";
import { kickCampaignAutomation, renderCampaignItemNow } from "@/lib/automation.functions";
import { useState } from "react";
import { effectivePublishAt, formatDateTime } from "@/lib/date-display";
import { duplicateCampaign } from "@/lib/campaign-operations.functions";
import { campaignEta, campaignProgress, scheduleConflictIds } from "@/lib/campaign-operations";

export const Route = createFileRoute("/_app/campaigns/$campaignId")({
  head: () => ({ meta: [{ title: "Campaign — ShortsForge" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { campaignId } = useParams({ from: "/_app/campaigns/$campaignId" });
  const isChildRoute = useRouterState({
    select: (s) => s.location.pathname !== `/campaigns/${campaignId}`,
  });
  const qc = useQueryClient();
  const publishFn = useServerFn(publishItemNow);
  const kickFn = useServerFn(kickCampaignAutomation);
  const renderItemFn = useServerFn(renderCampaignItemNow);
  const deleteCampaign = useServerFn(deleteCampaignFully);
  const duplicateFn = useServerFn(duplicateCampaign);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const publish = async (itemId: string) => {
    setPublishingId(itemId);
    try {
      const r = await publishFn({ data: { itemId } });
      if (!r.ok) {
        toast.error(r.error);
        qc.invalidateQueries({ queryKey: ["campaign-items", campaignId] });
        return;
      }
      toast.success("Uploaded to YouTube", { description: r.videoId });
      qc.invalidateQueries({ queryKey: ["campaign-items", campaignId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPublishingId(null);
    }
  };
  const renderMp4 = async (itemId: string) => {
    setRenderingId(itemId);
    try {
      const result = await renderItemFn({ data: { campaignId, itemId } });
      if (result.submitted > 0) toast.success("MP4 render queued", { description: "Native FFmpeg worker will render this video." });
      else if (result.skipped) toast.info(result.skipped);
      else if (result.errors > 0) toast.error("Render could not be submitted. Check Automation status.");
      qc.invalidateQueries({ queryKey: ["campaign-items", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-operations", campaignId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not queue MP4 render"); }
    finally { setRenderingId(null); }
  };
  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
      if (error) throw error;
      return data;
    },
  });
  const items = useQuery({
    queryKey: ["campaign-items", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_items")
        .select("id,video_file_name,seo_json,status,schedule_at,youtube_publish_at,youtube_video_id,youtube_url,rendered_video_url,render_provider,render_job_ref,render_submitted_at,error_message,is_paused,active_render_attempt_id")
        .eq("campaign_id", campaignId).order("schedule_at", { ascending: true, nullsFirst: false }).range(0, 24);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });
  const operations = useQuery({
    queryKey: ["campaign-operations", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_items").select("id,status,schedule_at,youtube_publish_at,is_paused").eq("campaign_id", campaignId).limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });
  const scheduledCount = useQuery({
    queryKey: ["campaign-scheduled-count", campaignId],
    queryFn: async () => {
      const { count, error } = await supabase.from("campaign_items").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).in("status", ["scheduled", "upload_pending"]);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 15_000,
  });
  const setStatus = useMutation({
    mutationFn: async (status: "active" | "paused" | "completed" | "failed" | "draft") => {
      const { error } = await supabase.from("campaigns").update({ status }).eq("id", campaignId);
      if (error) throw error;
      if (status === "active") {
        // Start server-side rendering right away; the cron keeps feeding the
        // queue at each video's render lead time afterwards.
        try {
          const r = await kickFn({ data: { campaignId, limit: 2 } });
          if (r.skipped) toast.info("Automation started — server rendering needs the render provider API key.");
          else if (r.submitted > 0) toast.success(`Server rendering started for ${r.submitted} video(s)`);
        } catch {
          /* automation still runs from the scheduled backend pass */
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
    onError: (e) => toast.error(e.message),
  });
  const duplicate = useMutation({
    mutationFn: () => duplicateFn({ data: { campaignId } }),
    onSuccess: (res) => { toast.success("Campaign duplicated as draft"); window.location.href = `/campaigns/${res.campaignId}`; },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async () => {
      await deleteCampaign({ data: { campaignId } });
    },
    onSuccess: () => { toast.success("Deleted"); window.location.href = "/campaigns"; },
    onError: (e) => toast.error(e.message),
  });
  const c = campaign.data;
  const its = items.data ?? [];
  const operationalItems = operations.data ?? [];
  const progress = campaignProgress(operationalItems as any);
  const eta = campaignEta(operationalItems as any);
  const conflictCount = scheduleConflictIds(operationalItems as any).size;
  const uploaded = progress.completed;
  const scheduled = scheduledCount.data ?? 0;
  const failed = progress.failed;
  if (isChildRoute) return <Outlet />;
  if (campaign.isLoading) return <div className="p-4 sm:p-6 lg:p-8 text-zinc-400">Loading campaign…</div>;
  if (campaign.isError) return <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto"><div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-200"><div className="font-semibold">Campaign could not be loaded</div><div className="mt-1 text-sm text-red-200/70">{campaign.error instanceof Error ? campaign.error.message : "Unknown error"}</div></div></div>;
  if (!c) return <div className="p-4 sm:p-6 lg:p-8 text-zinc-400">Campaign not found.</div>;
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={c.name}
        description={`Created ${new Date(c.created_at).toLocaleString()} · ${c.total_videos} videos`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/campaigns/$campaignId/calendar" params={{ campaignId }} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm font-semibold hover:bg-white/5"><CalendarClock className="size-3.5" /> Calendar</Link>
            <button onClick={() => duplicate.mutate()} disabled={duplicate.isPending} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm font-semibold hover:bg-white/5 disabled:opacity-50"><Copy className="size-3.5" /> Duplicate</button>
            <Link
              to="/campaigns/$campaignId/test-render"
              params={{ campaignId }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-brand/40 text-brand text-sm font-semibold hover:bg-brand/10"
            >
              <Sparkles className="size-3.5" /> Test render 1 video
            </Link>
            <Link
              to="/campaigns/$campaignId/automation"
              params={{ campaignId }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm font-semibold hover:bg-white/5"
            >
              <Activity className="size-3.5" /> Automation status
            </Link>
            {c.status === "active" ? (
              <button onClick={() => setStatus.mutate("paused")} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm font-semibold hover:bg-white/5"><Pause className="size-3.5" /> Pause</button>
            ) : (
              <button onClick={() => setStatus.mutate("active")} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand text-white text-sm font-bold hover:bg-brand/90"><Play className="size-3.5" /> Start automation</button>
            )}
            <button onClick={() => { if (confirm("Delete this campaign?")) del.mutate(); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-brand/10 hover:text-brand"><Trash2 className="size-3.5" /></button>
          </div>
        }
      />
      <div className="flex items-center gap-2 mb-6">
        <StatusBadge status={c.status} />
        <span className="text-xs text-zinc-500">{c.timezone}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 mb-5">
        <StatCard label="Progress" value={`${progress.percent}%`} icon={CheckCircle2} accent />
        <StatCard label="Total" value={progress.total || c.total_videos} icon={Video} />
        <StatCard label="Remaining" value={progress.remaining} icon={ListTodo} />
        <StatCard label="Uploaded" value={uploaded} icon={CheckCircle2} />
        <StatCard label="Scheduled" value={scheduled} icon={CalendarClock} />
        <StatCard label="Paused" value={progress.paused} icon={Pause} />
        <StatCard label="Conflicts" value={conflictCount} icon={AlertTriangle} />
        <StatCard label="Failed" value={failed || progress.failed} icon={AlertTriangle} />
      </div>
      <div className="mb-8 rounded-xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between gap-4 text-sm"><div><div className="font-semibold">Campaign completion</div><div className="text-xs text-zinc-500 mt-1">{progress.completed} of {progress.total || c.total_videos} published · {progress.remaining} remaining{eta ? ` · ETA ${formatDateTime(eta, c.timezone)}` : ""}</div></div><Clock3 className="size-5 text-zinc-500" /></div>
        <div className="mt-3 h-2 rounded-full bg-zinc-900 overflow-hidden"><div className="h-full bg-brand transition-all" style={{ width: `${progress.percent}%` }} /></div>
      </div>
      <div className="rounded-2xl border border-border bg-panel overflow-hidden">
        <header className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold">Upload queue</h2>
          <Link to="/campaigns/$campaignId/queue" params={{ campaignId }} className="text-xs text-zinc-400 hover:text-white">Full queue →</Link>
        </header>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">File</th>
              <th className="text-left px-4 py-3 font-semibold">Title</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Render</th>
              <th className="text-left px-4 py-3 font-semibold">Scheduled</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {its.map((i) => {
              const seo = (i.seo_json ?? {}) as { title?: string };
              return (
                <tr key={i.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-xs">{i.video_file_name}</td>
                  <td className="px-4 py-2.5 truncate max-w-xs">{seo.title ?? "—"}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {i.rendered_video_url ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="size-3.5" /> MP4 ready</span>
                    : i.status === "rendering" || i.active_render_attempt_id ? <span className="inline-flex items-center gap-1 text-sky-300"><RefreshCw className="size-3.5 animate-spin" /> Rendering</span>
                    : i.status === "failed" ? <span className="inline-flex items-center gap-1 text-red-300"><AlertTriangle className="size-3.5" /> Failed</span>
                    : <span className="text-zinc-500">Not generated</span>}
                    {i.render_provider && <div className="mt-0.5 text-[10px] text-zinc-500">{i.render_provider}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400 whitespace-nowrap">
                    <div>{formatDateTime(effectivePublishAt(i), c.timezone)}</div>
                    {i.youtube_publish_at && i.schedule_at && i.youtube_publish_at !== i.schedule_at && (
                      <div className="mt-0.5 text-[10px] text-sky-400">Synced from YouTube</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {i.youtube_url && (
                        <a href={i.youtube_url} target="_blank" rel="noreferrer" className="p-1.5 rounded-md hover:bg-white/10 text-brand" title="Open on YouTube"><ExternalLink className="size-3.5" /></a>
                      )}
                      {i.status==="failed" && !i.youtube_video_id && (
                        <button onClick={()=>repairUpload.mutate(i.id)} disabled={repairUpload.isPending} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/40 text-amber-300 text-xs font-semibold hover:bg-amber-500/10" title="Repair failed upload state after duplicate-safety checks"><RefreshCw className="size-3"/> Repair</button>
                      )}
                      {!i.rendered_video_url && !i.youtube_video_id && !["rendering","uploading","scheduled","uploaded"].includes(i.status) && !i.active_render_attempt_id && (
                        <button onClick={() => renderMp4(i.id)} disabled={renderingId === i.id || i.is_paused}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-sky-500/40 text-sky-300 text-xs font-semibold hover:bg-sky-500/10 disabled:opacity-50"
                          title={i.is_paused ? "Resume this video before rendering" : "Render this row as MP4 with the native FFmpeg worker"}>
                          <Video className="size-3" />{renderingId === i.id ? "Queuing…" : i.status === "failed" ? "Render again" : "Render MP4"}
                        </button>
                      )}
                      {!!i.rendered_video_url && !i.youtube_video_id && ["pending", "rendered", "upload_pending", "failed"].includes(i.status) && (
                        <button
                          onClick={() => publish(i.id)}
                          disabled={publishingId === i.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand/40 text-brand text-xs font-semibold hover:bg-brand/10 disabled:opacity-50"
                          title="Upload this row to YouTube now"
                        >
                          <Upload className="size-3" />
                          {publishingId === i.id ? "Uploading…" : "Publish"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {items.isError && <div className="p-5 border-t border-red-500/20 bg-red-500/5 text-sm text-red-300">Queue items could not be refreshed: {items.error instanceof Error ? items.error.message : "Unknown error"}</div>}
        {its.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">No items yet.</div>}
      </div>
      <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-100 text-xs">
        <strong className="font-bold">Heads up:</strong> ShortsForge will only upload to public YouTube once your project completes Google's API verification. Start with private/unlisted for safety.
      </div>
    </div>
  );
}