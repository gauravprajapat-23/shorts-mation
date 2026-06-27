import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { parseFile, SAMPLE_CSV, SAMPLE_JSON, type ParsedCampaign, type ValidationIssue } from "@/lib/csv-parser";
import { Upload, Check, AlertTriangle, Download, ArrowRight, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/campaigns/new")({
  head: () => ({ meta: [{ title: "New campaign — ShortsForge" }] }),
  component: NewCampaignPage,
});

const STEPS = ["Channel", "Template", "Data", "Schedule", "Review"] as const;

function NewCampaignPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [ytId, setYtId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCampaign | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [scheduleMode, setScheduleMode] = useState<"file" | "x_per_day" | "daily_time">("file");
  const [perDay, setPerDay] = useState(3);
  const [dailyTime, setDailyTime] = useState("18:00");
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [defaultPrivacy, setDefaultPrivacy] = useState<"private" | "unlisted" | "public">("private");
  const [busy, setBusy] = useState(false);

  const yt = useQuery({
    queryKey: ["yt-list"],
    queryFn: async () => (await supabase.from("youtube_connections").select("*").eq("is_connected", true)).data ?? [],
  });
  const templates = useQuery({
    queryKey: ["templates-pick"],
    queryFn: async () => (await supabase.from("templates").select("id,name,aspect_ratio,type,is_default").order("is_default", { ascending: false })).data ?? [],
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    try {
      const { campaign, issues } = parseFile(text, file.name);
      setParsed(campaign);
      setIssues(issues);
      toast.success(`${campaign.videos.length} videos detected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to parse file");
    }
  };

  const create = async () => {
    if (!parsed || !templateId) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: c, error } = await supabase.from("campaigns").insert({
        user_id: u.user.id,
        youtube_connection_id: ytId,
        name: parsed.campaign_name,
        template_id: templateId,
        status: "draft",
        timezone: parsed.timezone ?? "UTC",
        total_videos: parsed.videos.length,
        settings_json: {
          schedule: { mode: scheduleMode, perDay, dailyTime, skipWeekends },
          default_privacy: defaultPrivacy,
        } as never,
      }).select("id").single();
      if (error) throw error;
      const items = parsed.videos.map((v) => ({
        campaign_id: c.id,
        user_id: u.user.id,
        video_file_name: v.video_file_name,
        content_json: v.content as never,
        seo_json: v.seo as never,
        youtube_settings_json: v.youtube as never,
        audio_json: v.audio as never,
        asset_json: v.asset as never,
        status: "pending" as const,
        schedule_at: v.youtube.schedule_at ?? null,
      }));
      const { error: e2 } = await supabase.from("campaign_items").insert(items);
      if (e2) throw e2;
      toast.success("Campaign created");
      navigate({ to: "/campaigns/$campaignId", params: { campaignId: c.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const canNext = () =>
    (step === 0) ||
    (step === 1 && !!templateId) ||
    (step === 2 && !!parsed && issues.filter((i) => i.severity === "error").length === 0) ||
    (step === 3) ||
    step === 4;

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PageHeader title="New campaign" description="Five-step wizard. After this, everything runs automatically." />

      {/* Stepper */}
      <ol className="flex items-center gap-2 mb-8 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <div className={`size-6 rounded-full grid place-items-center font-bold ${i<=step?"bg-brand text-white":"bg-zinc-800 text-zinc-500"}`}>{i+1}</div>
            <span className={i===step ? "text-white font-semibold" : "text-zinc-500"}>{s}</span>
            {i < STEPS.length-1 && <div className="w-8 h-px bg-border" />}
          </li>
        ))}
      </ol>

      <div className="bg-panel border border-border rounded-2xl p-6 min-h-[400px]">
        {step === 0 && (
          <div>
            <h2 className="font-display font-bold text-lg mb-4">Select YouTube channel</h2>
            {yt.data && yt.data.length > 0 ? (
              <div className="grid gap-2">
                {yt.data.map((c) => (
                  <button key={c.id} onClick={() => setYtId(c.id)} className={`flex items-center gap-3 p-3 rounded-lg border ${ytId===c.id?"border-brand bg-brand/5":"border-border hover:border-brand/50"}`}>
                    {c.channel_avatar ? <img src={c.channel_avatar} className="size-9 rounded-full" alt="" /> : <div className="size-9 rounded-full bg-zinc-800" />}
                    <div className="text-left flex-1">
                      <div className="text-sm font-semibold">{c.channel_name}</div>
                      <div className="text-xs text-zinc-500">{c.channel_id}</div>
                    </div>
                    {ytId===c.id && <Check className="size-4 text-brand" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">
                No channel connected yet. <a href="/youtube-connect" className="text-brand">Connect one</a> first, or continue without and add later.
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="font-display font-bold text-lg mb-4">Select a template</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {templates.data?.map((t) => (
                <button key={t.id} onClick={() => setTemplateId(t.id)} className={`p-3 rounded-lg border text-left ${templateId===t.id?"border-brand bg-brand/5":"border-border hover:border-brand/50"}`}>
                  <div className={`${t.aspect_ratio==="9:16"?"aspect-[9/16]":t.aspect_ratio==="16:9"?"aspect-video":"aspect-square"} mb-2 rounded bg-zinc-950 grid place-items-center text-[10px] text-zinc-600`}>{t.aspect_ratio}</div>
                  <div className="text-sm font-semibold truncate">{t.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">{t.type.replace(/_/g," ")}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-display font-bold text-lg mb-4">Upload your data</h2>
            <div className="grid md:grid-cols-[1fr_280px] gap-4">
              <div>
                <label className="block">
                  <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-brand/60 cursor-pointer">
                    <Upload className="size-6 text-brand mx-auto mb-3" />
                    <div className="text-sm font-semibold">Drop JSON or CSV</div>
                    <div className="text-xs text-zinc-500 mt-1">Or click to choose a file</div>
                    <input type="file" accept=".json,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                  </div>
                </label>
                {parsed && (
                  <div className="mt-4 p-4 rounded-xl border border-border">
                    <div className="text-sm font-semibold mb-2">{parsed.campaign_name} · {parsed.videos.length} videos</div>
                    <div className="flex gap-4 text-xs">
                      <span className={errorCount?"text-brand font-bold":"text-zinc-500"}>{errorCount} errors</span>
                      <span className={warnCount?"text-amber-400":"text-zinc-500"}>{warnCount} warnings</span>
                    </div>
                    {issues.length > 0 && (
                      <ul className="mt-3 max-h-40 overflow-auto text-xs space-y-1">
                        {issues.slice(0, 30).map((iss, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <AlertTriangle className={`size-3 ${iss.severity==="error"?"text-brand":"text-amber-400"}`} />
                            <span>Row {iss.row+1} · {iss.field}: {iss.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <aside className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Samples</div>
                <a download="sample.json" href={`data:application/json,${encodeURIComponent(SAMPLE_JSON)}`} className="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-brand/50 text-sm"><FileJson className="size-4 text-brand" /> Download sample JSON <Download className="size-3 ml-auto" /></a>
                <a download="sample.csv" href={`data:text/csv,${encodeURIComponent(SAMPLE_CSV)}`} className="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-brand/50 text-sm"><FileSpreadsheet className="size-4 text-brand" /> Download sample CSV <Download className="size-3 ml-auto" /></a>
              </aside>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-display font-bold text-lg">Schedule rules</h2>
            <div className="grid md:grid-cols-3 gap-2">
              {([
                { id: "file", label: "Use schedule_at from file" },
                { id: "x_per_day", label: "Upload X per day" },
                { id: "daily_time", label: "Upload at daily time" },
              ] as const).map((m) => (
                <button key={m.id} onClick={() => setScheduleMode(m.id)} className={`p-3 rounded-lg border text-left text-sm font-semibold ${scheduleMode===m.id?"border-brand bg-brand/5":"border-border hover:border-brand/50"}`}>{m.label}</button>
              ))}
            </div>
            {scheduleMode === "x_per_day" && (
              <label className="block">
                <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Videos per day</div>
                <input type="number" min={1} max={50} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} className="w-32 h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm" />
              </label>
            )}
            {scheduleMode === "daily_time" && (
              <label className="block">
                <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Daily upload time</div>
                <input type="time" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} className="w-40 h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm" />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} /> Skip weekends
            </label>
            <div>
              <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-2">Default privacy</div>
              <div className="flex gap-2">
                {(["private","unlisted","public"] as const).map((p) => (
                  <button key={p} onClick={() => setDefaultPrivacy(p)} className={`px-3 py-1.5 rounded-md border text-xs font-bold uppercase ${defaultPrivacy===p?"border-brand text-brand bg-brand/10":"border-border text-zinc-400"}`}>{p}</button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">Tip: start with <span className="text-white">private</span> for a safe first run.</p>
            </div>
          </div>
        )}

        {step === 4 && parsed && (
          <div>
            <h2 className="font-display font-bold text-lg mb-4">Review & start</h2>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-zinc-500">Campaign</dt><dd className="font-semibold">{parsed.campaign_name}</dd>
              <dt className="text-zinc-500">Videos</dt><dd className="font-semibold tabular-nums">{parsed.videos.length}</dd>
              <dt className="text-zinc-500">Template</dt><dd className="font-semibold">{templates.data?.find((t) => t.id === templateId)?.name ?? "—"}</dd>
              <dt className="text-zinc-500">YouTube</dt><dd className="font-semibold">{yt.data?.find((c) => c.id === ytId)?.channel_name ?? "(none — add later)"}</dd>
              <dt className="text-zinc-500">Schedule</dt><dd className="font-semibold">{scheduleMode}</dd>
              <dt className="text-zinc-500">Privacy</dt><dd className="font-semibold uppercase">{defaultPrivacy}</dd>
            </dl>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button disabled={step===0} onClick={() => setStep((s) => s - 1)} className="px-4 py-2 rounded-md border border-border text-sm disabled:opacity-30">Back</button>
        {step < STEPS.length - 1 ? (
          <button disabled={!canNext()} onClick={() => setStep((s) => s + 1)} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-bold disabled:opacity-30">
            Continue <ArrowRight className="size-3.5" />
          </button>
        ) : (
          <button onClick={create} disabled={busy} className="px-4 py-2 rounded-md bg-brand text-white text-sm font-bold disabled:opacity-50">
            {busy ? "Creating…" : "Create campaign"}
          </button>
        )}
      </div>
    </div>
  );
}