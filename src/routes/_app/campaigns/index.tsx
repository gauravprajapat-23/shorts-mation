import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Rocket, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — ShortsForge" }] }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const { data } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}