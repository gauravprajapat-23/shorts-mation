import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ArrowLeft, RotateCcw, ExternalLink, Download, Upload, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  buildScheduleCsv,
  parseScheduleCsv,
  spreadSchedule,
  toLocalInput,
  type ScheduleRow,
  type ScheduleUpdate,
} from "@/lib/schedule-bulk";

export const Route = createFileRoute("/_app/campaigns/$campaignId/queue")({
  head: () => ({
    meta: [
      { title: "Upload queue & schedule — ShortsForge" },
      { name: "description", content: "Live upload queue for your campaign: watch render and publish status, and bulk-edit publish times from a spreadsheet." },
      { property: "og:title", content: "Upload queue & schedule — ShortsForge" },
      { property: "og:description", content: "Watch every video render and publish, and bulk-edit schedules via CSV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const { campaignId } = useParams({ from: "/_app/campaigns/$campaignId/queue" });
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [everyHours, setEveryHours] = useState(24);
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 3600_000).toISOString()));

  const { data } = useQuery({
    queryKey: ["queue", campaignId],
    queryFn: async () =>
      (await supabase.from("campaign_items").select("*").eq("campaign_id", campaignId).order("schedule_at", { ascending: true, nullsFirst: false })).data ?? [],
    refetchInterval: 5000,
  });

  const items = data ?? [];

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaign_items").update({ status: "pending", error_message: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["queue", campaignId] }); toast.success("Re-queued"); },
    onError: (e) => toast.error(e.message),
  });

  const applyUpdates = useMutation({
    mutationFn: async (updates: ScheduleUpdate[]) => {
      for (const u of updates) {
        const patch: Record<string, unknown> = { schedule_at: u.schedule_at };
        if (u.privacy) {
          const row = items.find((i) => i.id === u.id);
          patch.youtube_settings_json = { ...(row?.youtube_settings_json as object ?? {}), privacy: u.privacy };
        }
        const { error } = await supabase.from("campaign_items").update(patch).eq("id", u.id);
        if (error) throw error;
      }
      return updates.length;
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["queue", campaignId] }); toast.success(`Updated ${n} schedule${n === 1 ? "" : "s"}`); },
    onError: (e) => toast.error(e.message),
  });

  function exportCsv() {
    const rows: ScheduleRow[] = items.map((i) => ({
      id: i.id,
      video_file_name: i.video_file_name,
      title: ((i.seo_json ?? {}) as { title?: string }).title ?? "",
      status: i.status,
      schedule_at: i.schedule_at,
      privacy: ((i.youtube_settings_json ?? {}) as { privacy?: string }).privacy ?? "private",
    }));
    const blob = new Blob([buildScheduleCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${campaignId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const { updates, errors } = parseScheduleCsv(text, new Set(items.map((i) => i.id)));
    errors.slice(0, 4).forEach((e) => toast.error(e));
    if (updates.length) applyUpdates.mutate(updates);
    else if (!errors.length) toast.error("No rows found in that file.");
  }

  function autoSpread() {
    const start = new Date(startAt.replace(" ", "T"));
    if (isNaN(start.getTime())) { toast.error("Enter a valid start time"); return; }
    const ids = items.filter((i) => i.status !== "uploaded").map((i) => i.id);
    if (!ids.length) { toast.error("Nothing left to schedule"); return; }
    applyUpdates.mutate(spreadSchedule(ids, start, Math.max(0.25, everyHours)));
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to="/campaigns/$campaignId" params={{ campaignId }} className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white mb-4"><ArrowLeft className="size-3" /> Back to campaign</Link>
      <PageHeader title="Upload queue & schedule" description="The backend publishes each video at its scheduled time, even with this site closed. Updates every 5 seconds." />

      <div className="rounded-2xl border border-border bg-panel p-4 mb-4 flex flex-wrap items-end gap-3">
        <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:border-brand/50">
          <Download className="size-3.5" /> Export schedule CSV
        </button>
        <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:border-brand/50">
          <Upload className="size-3.5" /> Import updated CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />

        <div className="h-8 w-px bg-border mx-1 hidden sm:block" />

        <label className="text-xs text-zinc-400">
          <span className="block mb-1">Start at</span>
          <input value={startAt} onChange={(e) => setStartAt(e.target.value)} placeholder="2026-08-05 18:30"
            className="h-9 w-44 rounded-md bg-canvas border border-border px-2 text-xs font-mono" />
        </label>
        <label className="text-xs text-zinc-400">
          <span className="block mb-1">Every (hours)</span>
          <input type="number" min={0.25} step={0.25} value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))}
            className="h-9 w-24 rounded-md bg-canvas border border-border px-2 text-xs font-mono" />
        </label>
        <button onClick={autoSpread} disabled={applyUpdates.isPending}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand text-white text-xs font-bold hover:bg-brand/90 disabled:opacity-50">
          <CalendarClock className="size-3.5" /> Auto-schedule remaining
        </button>
        <p className="text-[11px] text-zinc-500 basis-full">
          Edit the <span className="font-mono">schedule_at</span> column in Excel or Sheets (format <span className="font-mono">2026-08-05 18:30</span>, your local time), keep the <span className="font-mono">id</span> column, then import. Blank clears a schedule.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">File</th>
              <th className="text-left px-4 py-3 font-semibold">Title</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Schedule</th>
              <th className="text-left px-4 py-3 font-semibold">Error</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => {
              const seo = (i.seo_json ?? {}) as { title?: string };
              return (
                <tr key={i.id} className="hover:bg-white/[0.02] align-top">
                  <td className="px-4 py-2.5 font-mono text-xs">{i.video_file_name}</td>
                  <td className="px-4 py-2.5 truncate max-w-xs">{seo.title ?? "—"}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">
                    <input
                      defaultValue={toLocalInput(i.schedule_at)}
                      placeholder="not scheduled"
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next === toLocalInput(i.schedule_at)) return;
                        const d = next ? new Date(next.replace(" ", "T")) : null;
                        if (next && (!d || isNaN(d.getTime()))) { toast.error("Use 2026-08-05 18:30"); return; }
                        applyUpdates.mutate([{ id: i.id, schedule_at: d ? d.toISOString() : null }]);
                      }}
                      className="h-8 w-40 rounded-md bg-canvas border border-border px-2 font-mono text-xs"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-brand max-w-xs truncate">{i.error_message ?? ""}</td>
                  <td className="px-4 py-2.5 text-right">
                    {i.youtube_url && <a href={i.youtube_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline mr-2"><ExternalLink className="size-3" /> YT</a>}
                    {i.status === "failed" && (
                      <button onClick={() => retry.mutate(i.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:border-brand/50"><RotateCcw className="size-3" /> Retry</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">Queue is empty.</div>}
      </div>
    </div>
  );
}
