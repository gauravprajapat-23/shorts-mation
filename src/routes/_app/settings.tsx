import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Download, LogOut } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — ShortsForge" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("*").maybeSingle()).data,
  });

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = "/auth"; };

  const deleteAll = async () => {
    if (!confirm("Permanently delete ALL your campaigns, templates, assets and connections? This cannot be undone.")) return;
    const tables = ["campaign_items", "campaigns", "templates", "assets", "youtube_connections", "automation_logs"] as const;
    for (const t of tables) await supabase.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    toast.success("Data wiped");
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="Settings" description="Profile, security, and data controls." />

      <section className="rounded-2xl border border-border bg-panel p-6">
        <h2 className="font-display font-bold mb-3">Profile</h2>
        <div className="text-sm space-y-1">
          <div><span className="text-zinc-500">Name:</span> {profile?.full_name ?? "—"}</div>
          <div><span className="text-zinc-500">Email:</span> {profile?.email ?? "—"}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-panel p-6">
        <h2 className="font-display font-bold mb-3">Compliance</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          ShortsForge stores OAuth tokens encrypted on the backend. We never write tokens to localStorage and never expose them to the frontend.
          We respect YouTube Data API quota limits and use idempotency keys to prevent duplicate uploads. By starting a campaign you give consent for ShortsForge to schedule and upload videos to your connected channel.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-panel p-6 space-y-3">
        <h2 className="font-display font-bold">Data & account</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={signOut} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5"><LogOut className="size-3.5" /> Sign out</button>
          <a href="/sample.json" download className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5"><Download className="size-3.5" /> Download sample JSON</a>
          <a href="/sample.csv" download className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5"><Download className="size-3.5" /> Download sample CSV</a>
        </div>
      </section>

      <section className="rounded-2xl border border-brand/30 bg-brand/5 p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="size-5 text-brand shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-display font-bold text-brand">Danger zone</h2>
            <p className="text-xs text-zinc-300 mt-1 mb-3">Delete all campaigns, templates, assets, and the YouTube connection associated with your account.</p>
            <button onClick={deleteAll} className="text-sm px-3 py-1.5 rounded-md bg-brand text-white font-semibold hover:bg-brand/90">Delete all my data</button>
          </div>
        </div>
      </section>
    </div>
  );
}