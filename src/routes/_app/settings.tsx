import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Download, LogOut, Server, Loader2, CheckCircle2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getRenderSettings, saveRenderSettings, clearRenderSettings } from "@/lib/render-settings.functions";
import { AutomationLimitsPanel } from "@/components/automation-limits-panel";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — ShortsForge" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("*").maybeSingle()).data,
  });

  const qc = useQueryClient();
  const fetchRender = useServerFn(getRenderSettings);
  const saveRender = useServerFn(saveRenderSettings);
  const clearRender = useServerFn(clearRenderSettings);
  const [apiKey, setApiKey] = useState("");
  const [env, setEnv] = useState<"v1" | "stage">("v1");

  const render = useQuery({ queryKey: ["render-settings"], queryFn: () => fetchRender({ data: {} as never }) });

  const save = useMutation({
    mutationFn: () => saveRender({ data: { apiKey, env } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Render provider key verified and saved");
        setApiKey("");
        qc.invalidateQueries({ queryKey: ["render-settings"] });
      } else {
        toast.error(res.error ?? "Could not verify that key");
        qc.invalidateQueries({ queryKey: ["render-settings"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => clearRender({ data: {} as never }),
    onSuccess: () => {
      toast.success("Render provider key removed");
      qc.invalidateQueries({ queryKey: ["render-settings"] });
    },
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
        <div className="flex items-center gap-2 mb-1">
          <Server className="size-4 text-brand" />
          <h2 className="font-display font-bold">Server rendering</h2>
          {render.data?.configured && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 rounded-full px-2 py-0.5">
              <CheckCircle2 className="size-3" /> Connected
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Paste your render-farm API key so MP4s are encoded on the backend — no browser tab required. The key is
          verified with the provider, then stored encrypted and only ever read by the server.
        </p>

        {render.data && (
          <div className="text-xs text-zinc-400 mb-4 space-y-1">
            <div><span className="text-zinc-500">Status:</span> {render.data.configured ? `Active (${render.data.source === "user" ? "your key" : "project key"}${render.data.keyHint ? ` · ${render.data.keyHint}` : ""})` : "Not configured"}</div>
            <div><span className="text-zinc-500">Environment:</span> {render.data.env === "stage" ? "stage (sandbox)" : "v1 (production)"}</div>
            <div><span className="text-zinc-500">Last verified:</span> {render.data.verifiedAt ? new Date(render.data.verifiedAt).toLocaleString() : "—"}</div>
            <div><span className="text-zinc-500">Completion webhook:</span> {render.data.webhookConfigured ? "enabled (no polling needed)" : "disabled"}</div>
            {render.data.lastError && <div className="text-red-400">{render.data.lastError}</div>}
          </div>
        )}

        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); if (apiKey.trim()) save.mutate(); }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              maxLength={256}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="SHOTSTACK_API_KEY"
              className="w-full rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value === "stage" ? "stage" : "v1")}
              className="rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="v1">v1 (production)</option>
              <option value="stage">stage (sandbox)</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!apiKey.trim() || save.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand text-white text-sm font-semibold disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="size-3.5 animate-spin" />} Verify & save key
            </button>
            {render.data?.source === "user" && (
              <button type="button" onClick={() => remove.mutate()} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5">
                Remove key
              </button>
            )}
          </div>
        </form>

        {render.data && (
          <div className="mt-4 border-t border-border pt-3 text-xs text-zinc-500 leading-relaxed">
            Throttling (database-driven): up to {render.data.limits.maxGlobalConcurrentRenders} renders in flight globally,
            {" "}{render.data.limits.maxUserConcurrentRenders} per account, {render.data.limits.maxRendersPerTick} started per minute ·
            uploads {render.data.limits.maxGlobalConcurrentUploads} global / {render.data.limits.maxUserConcurrentUploads} per account.
          </div>
        )}
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