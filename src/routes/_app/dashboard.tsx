import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Rocket, Video, CalendarClock, Upload, AlertTriangle, Youtube, Plus, FileUp, Wand2, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ShortsForge" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [campaigns, items, yt] = await Promise.all([
        supabase.from("campaigns").select("id,status,name,created_at,total_videos,uploaded_count,failed_count").order("created_at", { ascending: false }),
        supabase.from("campaign_items").select("status"),
        supabase.from("youtube_connections").select("channel_name,channel_avatar,is_connected").eq("is_connected", true).maybeSingle(),
      ]);
      const tpl = await supabase.from("templates").select("id,user_id").limit(50);
      const itemsArr = items.data ?? [];
      return {
        campaigns: campaigns.data ?? [],
        totalVideos: itemsArr.length,
        scheduled: itemsArr.filter((i) => i.status === "scheduled" || i.status === "upload_pending").length,
        uploaded: itemsArr.filter((i) => i.status === "uploaded").length,
        failed: itemsArr.filter((i) => i.status === "failed").length,
        yt: yt.data,
        userTemplates: (tpl.data ?? []).filter((t) => t.user_id).length,
        totalTemplates: (tpl.data ?? []).length,
      };
    },
  });

  const d = stats.data;

  const onboarding = {
    connectedYouTube: !!d?.yt,
    hasTemplate: (d?.userTemplates ?? 0) > 0 || (d?.totalTemplates ?? 0) > 0,
    hasUpload: (d?.campaigns.length ?? 0) > 0,
    previewed: (d?.campaigns.length ?? 0) > 0,
    started: !!d?.campaigns.some((c) => c.status === "active" || c.status === "completed"),
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard"
        description="Your automation control room. Connect once, upload once, ship forever."
        action={
          <Link to="/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
            <Plus className="size-4" /> New campaign
          </Link>
        }
      />

      {d && <OnboardingChecklist status={onboarding} />}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Campaigns" value={d?.campaigns.length ?? 0} icon={Rocket} accent />
        <StatCard label="Videos generated" value={d?.totalVideos ?? 0} icon={Video} />
        <StatCard label="Scheduled" value={d?.scheduled ?? 0} icon={CalendarClock} />
        <StatCard label="Uploaded" value={d?.uploaded ?? 0} icon={Upload} />
        <StatCard label="Failed" value={d?.failed ?? 0} icon={AlertTriangle} />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <section className="rounded-2xl border border-border bg-panel overflow-hidden">
          <header className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-display font-bold">Recent campaigns</h2>
            <Link to="/campaigns" className="text-xs text-zinc-400 hover:text-white">View all →</Link>
          </header>
          {d && d.campaigns.length > 0 ? (
            <ul className="divide-y divide-border">
              {d.campaigns.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link to="/campaigns/$campaignId" params={{ campaignId: c.id }} className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02]">
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {c.uploaded_count}/{c.total_videos} uploaded · {c.failed_count} failed
                      </div>
                    </div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={Rocket}
                title="No campaigns yet"
                description="Create your first bulk campaign — pick a template, upload a CSV, and start automating."
                action={
                  <Link to="/campaigns/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
                    <Plus className="size-4" /> Create campaign
                  </Link>
                }
              />
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-panel p-5">
            <h3 className="font-display font-bold mb-3">Quick actions</h3>
            <div className="grid gap-2">
              <Link to="/templates/new" className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50 hover:bg-white/[0.02] transition-colors">
                <Wand2 className="size-4 text-brand" />
                <span className="text-sm font-semibold">Create template</span>
              </Link>
              <Link to="/campaigns/new" className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50 hover:bg-white/[0.02] transition-colors">
                <FileUp className="size-4 text-brand" />
                <span className="text-sm font-semibold">Upload JSON/CSV</span>
              </Link>
              <Link to="/campaigns" className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50 hover:bg-white/[0.02] transition-colors">
                <ListChecks className="size-4 text-brand" />
                <span className="text-sm font-semibold">View upload queue</span>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-panel p-5">
            <h3 className="font-display font-bold mb-3">YouTube channel</h3>
            {d?.yt ? (
              <div className="flex items-center gap-3">
                {d.yt.channel_avatar ? (
                  <img src={d.yt.channel_avatar} alt="" className="size-10 rounded-full" />
                ) : (
                  <div className="size-10 rounded-full bg-zinc-800 grid place-items-center"><Youtube className="size-4" /></div>
                )}
                <div>
                  <div className="text-sm font-semibold">{d.yt.channel_name}</div>
                  <div className="text-xs text-emerald-400">Connected</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-400">No channel connected.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}