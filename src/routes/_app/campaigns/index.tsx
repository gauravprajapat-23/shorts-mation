import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Rocket, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { deleteCampaignFully } from "@/lib/data-management.functions";

export const Route = createFileRoute("/_app/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — ShortsForge" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const qc = useQueryClient();
  const deleteCampaign = useServerFn(deleteCampaignFully);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const campaigns = useQuery({
    queryKey: ["campaigns", page],
    queryFn: async () => {
      const from = page * pageSize;
      const { data, error, count } = await supabase.from("campaigns").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  // Live counts: the DB trigger recounts campaigns whenever an item transitions,
  // so listening to both tables keeps the numbers trustworthy mid-run.
  useEffect(() => {
    const channel = supabase
      .channel("campaign-progress")
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns" }, () => {
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_items" }, () => {
        qc.invalidateQueries({ queryKey: ["campaigns"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const data = campaigns.data?.rows;
  const total = campaigns.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteCampaign({ data: { campaignId: id } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success("Campaign deleted"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Campaigns"
        description="Each campaign is a batch of videos that ShortsForge generates and uploads on a schedule."
        action={
          <Link to="/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
            <Plus className="size-4" /> New campaign
          </Link>
        }
      />
      {campaigns.isLoading ? (
        <div className="rounded-2xl border border-border bg-panel p-10 text-center text-sm text-zinc-500">Loading campaigns…</div>
      ) : campaigns.isError ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
          <div className="font-semibold">Campaigns could not be loaded</div>
          <div className="mt-1 text-red-200/70">{campaigns.error instanceof Error ? campaigns.error.message : "Unknown error"}</div>
          <button onClick={() => campaigns.refetch()} className="mt-4 rounded-md border border-red-500/40 px-3 py-2 text-xs">Retry</button>
        </div>
      ) : !data || data.length === 0 ? (
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
        <div className="rounded-2xl border border-border bg-panel overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Generated</th>
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
                  <td className="px-4 py-3 text-right tabular-nums">{c.generated_count}</td>
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
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-zinc-400">
          <span>{total} campaign{total === 1 ? "" : "s"} · Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-30">Previous</button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-md border border-border px-3 py-1.5 disabled:opacity-30">Next</button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}