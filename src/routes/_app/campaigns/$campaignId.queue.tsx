import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ArrowLeft, RotateCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/campaigns/$campaignId/queue")({
  head: () => ({ meta: [{ title: "Queue — ShortsForge" }] }),
  component: QueuePage,
});

function QueuePage() {
  const { campaignId } = useParams({ from: "/_app/campaigns/$campaignId/queue" });
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["queue", campaignId],
    queryFn: async () => (await supabase.from("campaign_items").select("*").eq("campaign_id", campaignId).order("created_at")).data ?? [],
    refetchInterval: 5000,
  });
  const retry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaign_items").update({ status: "pending", error_message: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["queue", campaignId] }); toast.success("Re-queued"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to="/campaigns/$campaignId" params={{ campaignId }} className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white mb-4"><ArrowLeft className="size-3" /> Back to campaign</Link>
      <PageHeader title="Upload queue" description="Live view of every video in this campaign. Updates every 5 seconds." />
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
            {(data ?? []).map((i) => {
              const seo = (i.seo_json ?? {}) as { title?: string };
              return (
                <tr key={i.id} className="hover:bg-white/[0.02] align-top">
                  <td className="px-4 py-2.5 font-mono text-xs">{i.video_file_name}</td>
                  <td className="px-4 py-2.5 truncate max-w-xs">{seo.title ?? "—"}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-zinc-400">{i.schedule_at ? new Date(i.schedule_at).toLocaleString() : "—"}</td>
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
        {(data ?? []).length === 0 && <div className="p-6 text-center text-sm text-zinc-500">Queue is empty.</div>}
      </div>
    </div>
  );
}