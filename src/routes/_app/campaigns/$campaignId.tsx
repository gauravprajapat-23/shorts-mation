import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { Play, Pause, Trash2, Video, CheckCircle2, AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/campaigns/$campaignId")({
  head: () => ({ meta: [{ title: "Campaign — ShortsForge" }] }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { campaignId } = useParams({ from: "/_app/campaigns/$campaignId" });
  const qc = useQueryClient();
  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", campaignId).single()).data,
  });
  const items = useQuery({
    queryKey: ["campaign-items", campaignId],
    queryFn: async () => (await supabase.from("campaign_items").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true })).data ?? [],
  });
  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("campaigns").update({ status }).eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); window.location.href = "/campaigns"; },
    onError: (e) => toast.error(e.message),
  });
  const c = campaign.data;
  const its = items.data ?? [];
  const uploaded = its.filter((i) => i.status === "uploaded").length;
  const scheduled = its.filter((i) => i.status === "scheduled" || i.status === "upload_pending").length;
  const failed = its.filter((i) => i.status === "failed").length;
  if (!c) return <div className="p-10 text-zinc-400">Loading…</div>;
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title={c.name}
        description={`Created ${new Date(c.created_at).toLocaleString()} · ${c.total_videos} videos`}
        action={
          <div className="flex gap-2">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total" value={c.total_videos} icon={Video} accent />
        <StatCard label="Uploaded" value={uploaded} icon={CheckCircle2} />
        <StatCard label="Scheduled" value={scheduled} icon={CalendarClock} />
        <StatCard label="Failed" value={failed} icon={AlertTriangle} />
      </div>
      <div className="rounded-2xl border border-border bg-panel overflow-hidden">
        <header className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold">Upload queue</h2>
          <Link to="/campaigns/$campaignId/queue" params={{ campaignId }} className="text-xs text-zinc-400 hover:text-white">Full queue →</Link>
        </header>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">File</th>
              <th className="text-left px-4 py-3 font-semibold">Title</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-right px-4 py-3 font-semibold">Scheduled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {its.slice(0, 25).map((i) => {
              const seo = (i.seo_json ?? {}) as { title?: string };
              return (
                <tr key={i.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-xs">{i.video_file_name}</td>
                  <td className="px-4 py-2.5 truncate max-w-xs">{seo.title ?? "—"}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-2.5 text-right text-xs text-zinc-500">{i.schedule_at ? new Date(i.schedule_at).toLocaleString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {its.length === 0 && <div className="p-6 text-center text-sm text-zinc-500">No items yet.</div>}
      </div>
      <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-100 text-xs">
        <strong className="font-bold">Heads up:</strong> ShortsForge will only upload to public YouTube once your project completes Google's API verification. Start with private/unlisted for safety.
      </div>
    </div>
  );
}