import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Rocket, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — ShortsForge" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("render_jobs").delete().eq("campaign_id", id);
      await supabase.from("campaign_items").delete().eq("campaign_id", id);
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Campaign deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Campaigns"
        description="Each campaign is a batch of videos that ShortsForge generates and uploads on a schedule."
        action={
          <Link to="/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
            <Plus className="size-4" /> New campaign
          </Link>
        }
      />
      {!data || data.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No campaigns yet"
          description="Start your first bulk campaign — choose a template, upload a CSV, and let ShortsForge handle the rest."
          action={
            <Link to="/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
              <Plus className="size-4" /> Create campaign
            </Link>
          }
        />
      ) : (
        <div className="rounded-2xl border border-border bg-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Uploaded</th>
                <th className="text-right px-4 py-3 font-semibold">Failed</th>
                <th className="text-right px-4 py-3 font-semibold">Total</th>
                <th className="text-right px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link to="/campaigns/$campaignId" params={{ campaignId: c.id }} className="font-semibold hover:text-brand">{c.name}</Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.uploaded_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.failed_count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.total_videos}</td>
                  <td className="px-4 py-3 text-right text-zinc-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (confirm(`Delete campaign "${c.name}"? This removes all its items and render jobs.`)) del.mutate(c.id);
                      }}
                      disabled={del.isPending}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-brand hover:bg-brand/10 disabled:opacity-40"
                      title="Delete campaign"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}