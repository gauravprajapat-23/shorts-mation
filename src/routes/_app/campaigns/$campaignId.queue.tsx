import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AlertTriangle, ArrowLeft, CalendarClock, Download, ExternalLink, History, Loader2, RefreshCw, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { bulkUpdateQueue, getQueueItemDetail, retryQueueItem, updateQueueItemPrivacy, updateQueueItemSchedule, type QueueAttempt } from "@/lib/queue-control.functions";
import { buildScheduleCsv, parseScheduleCsv, spreadSchedule, toLocalInput, type ScheduleRow, type ScheduleUpdate } from "@/lib/schedule-bulk";

export const Route = createFileRoute("/_app/campaigns/$campaignId/queue")({
  head: () => ({ meta: [
    { title: "Queue control center — ShortsForge" },
    { name: "description", content: "Control rendering, upload scheduling, retries and YouTube publication for a campaign." },
  ] }),
  component: QueuePage,
});

type QueueRow = Awaited<ReturnType<typeof fetchQueue>>["items"][number];
type PendingPlan = { title: string; updates: ScheduleUpdate[] } | null;

async function fetchQueue(campaignId: string) {
  const [itemsRes, campaignRes] = await Promise.all([
    supabase.from("campaign_items").select("*").eq("campaign_id", campaignId).order("schedule_at", { ascending: true, nullsFirst: false }).limit(1000),
    supabase.from("campaigns").select("id,timezone,status").eq("id", campaignId).single(),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (campaignRes.error) throw campaignRes.error;
  return { items: itemsRes.data ?? [], campaign: campaignRes.data };
}

function isScheduleLocked(row: QueueRow) {
  return row.status === "uploading" || row.status === "uploaded";
}
function isRemoteScheduled(row: QueueRow) {
  return row.status === "scheduled" && !!row.youtube_video_id;
}
function stageLabel(row: QueueRow) {
  if (row.status === "failed") return row.rendered_video_url ? "Upload failed" : "Render failed";
  if (row.status === "rendering") return "Rendering";
  if (row.status === "rendered" || row.status === "upload_pending") return "Rendered · waiting upload";
  if (row.status === "uploading") return "Uploading to YouTube";
  if (row.status === "scheduled") return "Scheduled on YouTube";
  if (row.status === "uploaded") return "Published / uploaded";
  return "Waiting for render";
}

function QueuePage() {
  const { campaignId } = useParams({ from: "/_app/campaigns/$campaignId/queue" });
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const retryFn = useServerFn(retryQueueItem);
  const bulkFn = useServerFn(bulkUpdateQueue);
  const updateFn = useServerFn(updateQueueItemSchedule);
  const detailFn = useServerFn(getQueueItemDetail);
  const privacyFn = useServerFn(updateQueueItemPrivacy);
  const [everyHours, setEveryHours] = useState(24);
  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 3600_000).toISOString()));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [pendingPlan, setPendingPlan] = useState<PendingPlan>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["queue", campaignId], queryFn: () => fetchQueue(campaignId), refetchInterval: 5000 });
  const items = q.data?.items ?? [];
  const campaignTimezone = q.data?.campaign.timezone || "UTC";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      for (const row of items) {
        if (!dirtyIds.has(row.id)) next[row.id] = toLocalInput(row.schedule_at);
      }
      return next;
    });
  }, [items, dirtyIds]);

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { itemId: id } }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["queue", campaignId] }); toast.success(`Retry queued for ${res.stage}`, { description: `Attempt ${res.retryCount}` }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (updates: ScheduleUpdate[]) => bulkFn({ data: { campaignId, updates } }),
    onSuccess: (res) => { setPendingPlan(null); qc.invalidateQueries({ queryKey: ["queue", campaignId] }); toast.success(`Updated ${res.updated} queue item${res.updated === 1 ? "" : "s"}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const single = useMutation({
    mutationFn: ({ row, value }: { row: QueueRow; value: string }) => {
      const trimmed = value.trim();
      const d = trimmed ? new Date(trimmed.replace(" ", "T")) : null;
      if (trimmed && (!d || Number.isNaN(d.getTime()))) throw new Error("Use a valid local date/time such as 2026-09-02 18:30");
      return updateFn({ data: { itemId: row.id, scheduleAt: d ? d.toISOString() : null } });
    },
    onSuccess: (res, variables) => { setDirtyIds((set) => { const next = new Set(set); next.delete(variables.row.id); return next; }); qc.invalidateQueries({ queryKey: ["queue", campaignId] }); toast.success(res.synchronized ? "YouTube schedule synchronized" : "Schedule updated"); },
    onError: (e: Error) => { toast.error(e.message); qc.invalidateQueries({ queryKey: ["queue", campaignId] }); },
  });

  const privacyMutation = useMutation({
    mutationFn: ({ row, privacy }: { row: QueueRow; privacy: "private" | "unlisted" | "public" }) => privacyFn({ data: { itemId: row.id, privacy } }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["queue", campaignId] }); toast.success(res.synchronized ? "YouTube privacy synchronized" : "Privacy updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const detail = useQuery({
    queryKey: ["queue-item-detail", detailId],
    queryFn: () => detailFn({ data: { itemId: detailId! } }),
    enabled: !!detailId,
  });

  const counts = useMemo(() => ({
    total: items.length,
    processing: items.filter((i) => i.status === "rendering" || i.status === "uploading").length,
    scheduled: items.filter((i) => i.status === "scheduled").length,
    failed: items.filter((i) => i.status === "failed").length,
  }), [items]);

  function exportCsv() {
    const rows: ScheduleRow[] = items.map((i) => ({
      id: i.id, video_file_name: i.video_file_name,
      title: ((i.seo_json ?? {}) as { title?: string }).title ?? "", status: i.status,
      schedule_at: i.schedule_at, privacy: ((i.youtube_settings_json ?? {}) as { privacy?: string }).privacy ?? "private",
      timezone,
    }));
    const blob = new Blob([buildScheduleCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `schedule-${campaignId.slice(0, 8)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const { updates, errors } = parseScheduleCsv(text, new Set(items.map((i) => i.id)));
    errors.slice(0, 6).forEach((e) => toast.error(e));
    if (!updates.length) { if (!errors.length) toast.error("No rows found in that file."); return; }
    const byId = new Map(items.map((i) => [i.id, i]));
    const changed = updates.filter((u) => {
      const r = byId.get(u.id); if (!r) return false;
      const sameTime = (u.schedule_at ? new Date(u.schedule_at).getTime() : null) === (r.schedule_at ? new Date(r.schedule_at).getTime() : null);
      const currentPrivacy = ((r.youtube_settings_json ?? {}) as { privacy?: string }).privacy ?? "private";
      return !sameTime || (!!u.privacy && u.privacy !== currentPrivacy);
    });
    if (!changed.length) { toast.info("No schedule changes found in the CSV"); return; }
    const remote = changed.filter((u) => { const r = byId.get(u.id); return !!r && (r.status === "scheduled" || r.status === "uploading" || r.status === "uploaded"); });
    if (remote.length) {
      toast.error(`${remote.length} changed remote-bound row${remote.length === 1 ? "" : "s"} cannot be bulk imported`, { description: "Reschedule YouTube-scheduled videos individually so the remote video stays synchronized." });
      return;
    }
    setPendingPlan({ title: `Import ${changed.length} schedule change${changed.length === 1 ? "" : "s"}`, updates: changed });
  }

  function autoSpread() {
    const start = new Date(startAt.replace(" ", "T"));
    if (Number.isNaN(start.getTime())) { toast.error("Enter a valid start time"); return; }
    const editable = items.filter((i) => !["uploading", "scheduled", "uploaded"].includes(i.status));
    if (!editable.length) { toast.error("No editable queue items remain"); return; }
    setPendingPlan({ title: `Auto-schedule ${editable.length} remaining video${editable.length === 1 ? "" : "s"}`, updates: spreadSchedule(editable.map((i) => i.id), start, Math.max(0.25, everyHours)) });
  }

  if (q.isLoading) return <div className="p-8 max-w-7xl mx-auto"><div className="rounded-2xl border border-border bg-panel p-10 text-center text-zinc-400"><Loader2 className="size-5 animate-spin mx-auto mb-3" />Loading queue…</div></div>;
  if (q.isError) return <div className="p-8 max-w-7xl mx-auto"><div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6"><div className="font-semibold text-red-300">Queue could not be loaded</div><div className="text-sm text-red-200/70 mt-1">{q.error instanceof Error ? q.error.message : "Unknown error"}</div><button onClick={() => q.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-500/40 px-3 py-2 text-xs"><RefreshCw className="size-3.5" /> Retry</button></div></div>;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <Link to="/campaigns/$campaignId" params={{ campaignId }} className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white mb-4"><ArrowLeft className="size-3" /> Back to campaign</Link>
      <PageHeader title="Queue control center" description={`Render, upload and YouTube scheduling state. Auto-refreshes every 5 seconds · editing in ${timezone}${campaignTimezone !== timezone ? ` · campaign ${campaignTimezone}` : ""}.`} />

      <div className="mb-5 flex gap-2 border-b border-border">
        <span className="px-3 py-2 text-xs font-semibold text-white border-b-2 border-brand">Queue & schedule</span>
        <Link to="/campaigns/$campaignId/automation" params={{ campaignId }} className="px-3 py-2 text-xs text-zinc-400 hover:text-white">Activity</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Total" value={counts.total} /><MiniStat label="Processing" value={counts.processing} /><MiniStat label="Scheduled" value={counts.scheduled} /><MiniStat label="Needs attention" value={counts.failed} danger={counts.failed > 0} />
      </div>

      <div className="rounded-2xl border border-border bg-panel p-4 mb-5 flex flex-wrap items-end gap-3">
        <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:border-brand/50"><Download className="size-3.5" /> Export CSV</button>
        <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-xs font-semibold hover:border-brand/50"><Upload className="size-3.5" /> Import CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
        <div className="h-8 w-px bg-border mx-1 hidden sm:block" />
        <label className="text-xs text-zinc-400"><span className="block mb-1">Start at · {timezone}</span><input value={startAt} onChange={(e) => setStartAt(e.target.value)} className="h-9 w-44 rounded-md bg-canvas border border-border px-2 text-xs font-mono" /></label>
        <label className="text-xs text-zinc-400"><span className="block mb-1">Every (hours)</span><input type="number" min={0.25} step={0.25} value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))} className="h-9 w-24 rounded-md bg-canvas border border-border px-2 text-xs font-mono" /></label>
        <button onClick={autoSpread} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand text-white text-xs font-bold hover:bg-brand/90"><CalendarClock className="size-3.5" /> Preview auto-schedule</button>
        <p className="text-[11px] text-zinc-500 basis-full">Bulk edits are validated first and committed atomically. Rows already uploading or scheduled on YouTube are intentionally excluded and must be changed through their synchronized row action.</p>
      </div>

      <div className="hidden md:block rounded-2xl border border-border bg-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50"><tr><th className="text-left px-4 py-3">Video</th><th className="text-left px-4 py-3">Pipeline</th><th className="text-left px-4 py-3">Schedule</th><th className="text-left px-4 py-3">Error</th><th className="text-right px-4 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-border">{items.map((row) => <QueueDesktopRow key={row.id} row={row} draft={drafts[row.id] ?? ""} setDraft={(v) => { setDirtyIds((set) => new Set(set).add(row.id)); setDrafts((d) => ({ ...d, [row.id]: v })); }} save={() => single.mutate({ row, value: drafts[row.id] ?? "" })} retry={() => retry.mutate(row.id)} details={() => setDetailId(row.id)} privacyChange={(privacy) => privacyMutation.mutate({ row, privacy })} busy={single.isPending || retry.isPending || privacyMutation.isPending} />)}</tbody>
          </table>
        </div>
        {!items.length && <div className="p-8 text-center text-sm text-zinc-500">Queue is empty.</div>}
      </div>

      <div className="md:hidden space-y-3">{items.map((row) => <QueueMobileCard key={row.id} row={row} draft={drafts[row.id] ?? ""} setDraft={(v) => { setDirtyIds((set) => new Set(set).add(row.id)); setDrafts((d) => ({ ...d, [row.id]: v })); }} save={() => single.mutate({ row, value: drafts[row.id] ?? "" })} retry={() => retry.mutate(row.id)} details={() => setDetailId(row.id)} privacyChange={(privacy) => privacyMutation.mutate({ row, privacy })} />)}</div>

      {pendingPlan && <SchedulePreview plan={pendingPlan} timezone={timezone} onClose={() => setPendingPlan(null)} onApply={() => bulk.mutate(pendingPlan.updates)} pending={bulk.isPending} />}
      {detailId && <AttemptDrawer item={items.find((i) => i.id === detailId)} attempts={detail.data?.attempts ?? []} loading={detail.isLoading} error={detail.error instanceof Error ? detail.error.message : null} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function QueueDesktopRow({ row, draft, setDraft, save, retry, details, privacyChange, busy }: { row: QueueRow; draft:string; setDraft:(v:string)=>void; save:()=>void; retry:()=>void; details:()=>void; privacyChange:(privacy:"private"|"unlisted"|"public")=>void; busy:boolean }) {
  const title = ((row.seo_json ?? {}) as { title?: string }).title || row.video_file_name || `Video ${row.id.slice(0,8)}`;
  const locked = isScheduleLocked(row); const remote = isRemoteScheduled(row); const changed = draft !== toLocalInput(row.schedule_at);
  return <tr className="align-top hover:bg-white/[0.02]">
    <td className="px-4 py-3 max-w-[260px]"><div className="font-medium truncate">{title}</div><div className="text-[11px] text-zinc-500 font-mono truncate">{row.video_file_name ?? row.id.slice(0,8)}</div></td>
    <td className="px-4 py-3"><StatusBadge status={row.status} /><div className="mt-1 text-[11px] text-zinc-500">{stageLabel(row)}{row.retry_count ? ` · retry ${row.retry_count}` : ""}</div></td>
    <td className="px-4 py-3"><div className="flex items-center gap-2"><input value={draft} disabled={locked} onChange={(e)=>setDraft(e.target.value)} className="h-8 w-40 rounded-md bg-canvas border border-border px-2 font-mono text-xs disabled:opacity-50" placeholder="not scheduled" />{changed && !locked && <button disabled={busy} onClick={save} className="px-2 py-1 rounded bg-brand text-white text-[11px] font-semibold">{remote ? "Sync YouTube" : "Save"}</button>}</div><div className="mt-2 flex items-center gap-2"><span className="text-[10px] text-zinc-500">Privacy</span><select disabled={row.status === "uploading" || row.status === "scheduled"} value={row.status === "scheduled" ? "public" : (((row.youtube_settings_json ?? {}) as {privacy?:string}).privacy ?? "private")} onChange={(e)=>privacyChange(e.target.value as "private"|"unlisted"|"public")} className="h-7 rounded bg-canvas border border-border px-1 text-[11px] disabled:opacity-50"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div>{remote && <div className="text-[10px] text-sky-400 mt-1">Changes are sent to YouTube first · scheduled videos publish public</div>}{locked && row.status !== "uploaded" && <div className="text-[10px] text-zinc-600 mt-1">Locked while uploading</div>}</td>
    <td className="px-4 py-3 max-w-[260px]">{row.error_message ? <button onClick={details} className="text-left text-xs text-red-400 hover:underline line-clamp-2">{row.error_message}</button> : <span className="text-zinc-700">—</span>}</td>
    <td className="px-4 py-3 text-right whitespace-nowrap">{row.youtube_url && <a href={row.youtube_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline mr-3"><ExternalLink className="size-3" /> YouTube</a>}<button onClick={details} className="inline-flex items-center gap-1 text-xs mr-3 text-zinc-400 hover:text-white"><History className="size-3" /> Details</button>{row.status === "failed" && <button onClick={retry} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:border-brand/50"><RotateCcw className="size-3" /> {row.rendered_video_url ? "Retry upload" : "Retry render"}</button>}</td>
  </tr>;
}

function QueueMobileCard(props: Omit<Parameters<typeof QueueDesktopRow>[0], "busy">) {
  const { row, draft, setDraft, save, retry, details, privacyChange } = props;
  const title = ((row.seo_json ?? {}) as { title?: string }).title || row.video_file_name || `Video ${row.id.slice(0,8)}`;
  const locked = isScheduleLocked(row); const changed = draft !== toLocalInput(row.schedule_at);
  return <div className="rounded-xl border border-border bg-panel p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold truncate">{title}</div><div className="text-[11px] text-zinc-500 mt-1">{stageLabel(row)}</div></div><StatusBadge status={row.status} /></div><div className="mt-3"><div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Publish · local time</div><div className="flex gap-2"><input value={draft} disabled={locked} onChange={(e)=>setDraft(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md bg-canvas border border-border px-2 font-mono text-xs disabled:opacity-50" />{changed && !locked && <button onClick={save} className="px-3 rounded-md bg-brand text-white text-xs font-bold">{isRemoteScheduled(row) ? "Sync" : "Save"}</button>}</div><div className="mt-2 flex items-center gap-2"><span className="text-[10px] text-zinc-500">Privacy</span><select disabled={row.status === "uploading" || row.status === "scheduled"} value={row.status === "scheduled" ? "public" : (((row.youtube_settings_json ?? {}) as {privacy?:string}).privacy ?? "private")} onChange={(e)=>privacyChange(e.target.value as "private"|"unlisted"|"public")} className="h-8 rounded bg-canvas border border-border px-2 text-xs disabled:opacity-50"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div></div>{row.error_message && <button onClick={details} className="mt-3 flex items-start gap-2 text-left text-xs text-red-400"><AlertTriangle className="size-3.5 mt-0.5 shrink-0" /><span className="line-clamp-2">{row.error_message}</span></button>}<div className="mt-4 flex flex-wrap gap-3 text-xs"><button onClick={details} className="text-zinc-400">Attempt history</button>{row.youtube_url && <a href={row.youtube_url} target="_blank" rel="noreferrer" className="text-sky-400">Open YouTube</a>}{row.status === "failed" && <button onClick={retry} className="text-brand">{row.rendered_video_url ? "Retry upload" : "Retry render"}</button>}</div></div>;
}

function MiniStat({ label, value, danger=false }: {label:string;value:number;danger?:boolean}) { return <div className={`rounded-xl border p-3 ${danger ? "border-red-500/30 bg-red-500/10" : "border-border bg-panel"}`}><div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div><div className={`text-xl font-bold mt-1 ${danger ? "text-red-300" : ""}`}>{value}</div></div>; }

function SchedulePreview({ plan, timezone, onClose, onApply, pending }: { plan:NonNullable<PendingPlan>; timezone:string; onClose:()=>void; onApply:()=>void; pending:boolean }) {
  return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"><div className="w-full max-w-lg rounded-2xl border border-border bg-panel shadow-2xl"><div className="p-5 border-b border-border flex justify-between"><div><div className="font-bold">{plan.title}</div><div className="text-xs text-zinc-500 mt-1">Timezone: {timezone}. All rows validate before the transaction commits.</div></div><button onClick={onClose}><X className="size-4" /></button></div><div className="max-h-72 overflow-auto divide-y divide-border/60">{plan.updates.slice(0,50).map((u,i)=><div key={u.id} className="px-5 py-2.5 flex justify-between text-xs"><span className="text-zinc-500">Video {i+1}</span><span className="font-mono">{toLocalInput(u.schedule_at)}</span></div>)}{plan.updates.length>50 && <div className="p-3 text-center text-xs text-zinc-500">+ {plan.updates.length-50} more</div>}</div><div className="p-4 flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 rounded-md border border-border text-xs">Cancel</button><button onClick={onApply} disabled={pending} className="px-3 py-2 rounded-md bg-brand text-white text-xs font-bold disabled:opacity-50">{pending ? "Applying…" : "Apply changes"}</button></div></div></div>;
}

function AttemptDrawer({ item, attempts, loading, error, onClose }: { item:QueueRow|undefined; attempts:QueueAttempt[]; loading:boolean; error:string|null; onClose:()=>void }) {
  return <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><aside className="h-full w-full max-w-md bg-panel border-l border-border shadow-2xl overflow-y-auto"><header className="sticky top-0 bg-panel border-b border-border p-5 flex items-start justify-between"><div><div className="font-bold">Queue item details</div><div className="text-xs text-zinc-500 mt-1 truncate max-w-xs">{item?.video_file_name ?? item?.id}</div></div><button onClick={onClose}><X className="size-4" /></button></header><div className="p-5">{item?.error_message && <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><div className="font-semibold mb-1">Latest error</div>{item.error_message}</div>}{loading && <div className="text-sm text-zinc-500"><Loader2 className="size-4 animate-spin inline mr-2" />Loading attempts…</div>}{error && <div className="text-sm text-red-400">{error}</div>}<div className="space-y-3">{attempts.map((a)=><div key={`${a.kind}-${a.id}`} className="rounded-lg border border-border p-3"><div className="flex justify-between"><div className="text-sm font-semibold capitalize">{a.kind} · {a.status}</div><div className="text-[10px] text-zinc-500">{new Date(a.claimed_at).toLocaleString()}</div></div>{a.provider_ref && <div className="mt-2 text-[11px] font-mono text-zinc-500 break-all">{a.provider_ref}</div>}{a.error_message && <div className="mt-2 text-xs text-red-400">{a.error_message}</div>}{a.finished_at && <div className="mt-2 text-[10px] text-zinc-600">Finished {new Date(a.finished_at).toLocaleString()}</div>}</div>)}{!loading && !attempts.length && <div className="text-sm text-zinc-500">No render or upload attempts yet.</div>}</div></div></aside></div>;
}
