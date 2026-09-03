import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarDays, Clock3, GripVertical, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { updateQueueItemSchedule } from "@/lib/queue-control.functions";
import { scheduleConflictIds } from "@/lib/campaign-operations";

export const Route = createFileRoute("/_app/campaigns/$campaignId/calendar")({
  head: () => ({ meta: [{ title: "Campaign calendar — ShortsMation" }] }),
  component: CampaignCalendar,
});

type Row = { id:string; video_file_name:string|null; seo_json:unknown; status:string; schedule_at:string|null; youtube_publish_at:string|null; youtube_video_id:string|null; is_paused?:boolean|null };

function localDayKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(value));
}
function dayLabel(day: Date, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, weekday:"short", month:"short", day:"numeric" }).format(day);
}
function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, hour:"numeric", minute:"2-digit" }).format(new Date(value));
}

function CampaignCalendar() {
  const { campaignId } = Route.useParams();
  const qc = useQueryClient();
  const updateSchedule = useServerFn(updateQueueItemSchedule);
  const q = useQuery({ queryKey:["campaign-calendar",campaignId], queryFn: async () => {
    const [c,i] = await Promise.all([
      supabase.from("campaigns").select("id,name,timezone").eq("id",campaignId).single(),
      supabase.from("campaign_items").select("id,video_file_name,seo_json,status,schedule_at,youtube_publish_at,youtube_video_id,is_paused").eq("campaign_id",campaignId).order("schedule_at").limit(1000),
    ]);
    if (c.error) throw c.error; if (i.error) throw i.error;
    return { campaign:c.data, items:(i.data ?? []) as Row[] };
  }, refetchInterval:15000 });
  const timezone = q.data?.campaign.timezone || "UTC";
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const items = q.data?.items ?? [];
  const conflicts = scheduleConflictIds(items);
  const scheduled = items.filter(i => i.youtube_publish_at || i.schedule_at);
  const first = scheduled.length ? Math.min(...scheduled.map(i => new Date(i.youtube_publish_at ?? i.schedule_at!).getTime())) : Date.now();
  const start = new Date(first); start.setUTCHours(0,0,0,0);
  const days = Array.from({length:35},(_,idx)=>new Date(start.getTime()+idx*86400000));
  const move = useMutation({
    mutationFn: async ({ item, day }: { item:Row; day:Date }) => {
      if (["uploading","uploaded"].includes(item.status)) throw new Error("This video is locked while uploading/published");
      const current = new Date(item.youtube_publish_at ?? item.schedule_at ?? day);
      const target = new Date(day);
      target.setUTCHours(current.getUTCHours(), current.getUTCMinutes(), 0, 0);
      return updateSchedule({ data:{ itemId:item.id, scheduleAt:target.toISOString() } });
    },
    onSuccess: (r) => { toast.success(r.synchronized ? "YouTube schedule synchronized" : "Video rescheduled"); qc.invalidateQueries({queryKey:["campaign-calendar",campaignId]}); qc.invalidateQueries({queryKey:["queue",campaignId]}); },
    onError: (e:Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-8 text-zinc-400">Loading calendar…</div>;
  if (q.isError) return <div className="p-8 text-red-300">Calendar could not be loaded.</div>;
  return <div className="p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto">
    <Link to="/campaigns/$campaignId" params={{campaignId}} className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white mb-4"><ArrowLeft className="size-3.5"/> Back to campaign</Link>
    <PageHeader title="Campaign calendar" description={`Drag videos between days to reschedule them · campaign timezone ${timezone}${localTimezone !== timezone ? ` · your device ${localTimezone}` : ""}. YouTube-scheduled rows are synchronized remotely.`} />
    <div className="mb-4 flex flex-wrap gap-3 text-xs text-zinc-500"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5"/>35-day operations view</span><span>·</span><span>{scheduled.length} scheduled videos</span><span>·</span><span className="text-red-300">{conflicts.size} conflict rows</span></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {days.map(day => {
        const key=localDayKey(day.toISOString(),timezone);
        const rows=scheduled.filter(i=>localDayKey(i.youtube_publish_at ?? i.schedule_at!,timezone)===key);
        return <section key={key} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData("text/plain");const item=items.find(i=>i.id===id);if(item)move.mutate({item,day});}} className="min-h-52 rounded-2xl border border-border bg-panel overflow-hidden">
          <header className="px-4 py-3 border-b border-border bg-white/[0.02]"><div className="font-semibold">{dayLabel(day,timezone)}</div><div className="text-[10px] text-zinc-500 mt-0.5">{rows.length} video{rows.length===1?"":"s"}</div></header>
          <div className="p-2 space-y-2">
            {rows.map(item=>{const raw=item.youtube_publish_at ?? item.schedule_at!;const title=((item.seo_json??{}) as {title?:string}).title || item.video_file_name || item.id.slice(0,8);return <article key={item.id} draggable={!item.is_paused && !["uploading","uploaded"].includes(item.status)} onDragStart={e=>e.dataTransfer.setData("text/plain",item.id)} className={`rounded-xl border p-3 ${conflicts.has(item.id)?"border-red-500/40 bg-red-500/5":"border-border bg-canvas/60"}`}>
              <div className="flex gap-2"><GripVertical className="size-4 shrink-0 text-zinc-600 mt-0.5"/><div className="min-w-0 flex-1"><div className="text-xs font-semibold truncate">{title}</div><div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400"><Clock3 className="size-3"/>{timeLabel(raw,timezone)}</div>{localTimezone !== timezone && <div className="text-[10px] text-zinc-600 mt-0.5">Your time: {timeLabel(raw,localTimezone)}</div>}<div className="mt-2"><StatusBadge status={item.status}/></div>{item.is_paused&&<div className="text-[10px] text-amber-300 mt-1">Paused</div>}{conflicts.has(item.id)&&<div className="text-[10px] text-red-300 mt-1 inline-flex items-center gap-1"><TriangleAlert className="size-3"/>Schedule conflict</div>}</div></div>
            </article>})}
            {!rows.length&&<div className="py-8 text-center text-xs text-zinc-600">Drop a video here</div>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
