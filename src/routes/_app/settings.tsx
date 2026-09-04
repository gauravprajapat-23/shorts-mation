import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert, Download, LogOut, Server, Loader2, CheckCircle2, Sparkles, Mic2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteAllAccountData } from "@/lib/data-management.functions";
import { SAMPLE_CSV, SAMPLE_JSON } from "@/lib/csv-parser";
import { useState } from "react";
import { getRenderSettings, saveRenderSettings, clearRenderSettings } from "@/lib/render-settings.functions";
import { AutomationLimitsPanel } from "@/components/automation-limits-panel";
import { getAiSettings, saveAiSettings, clearAiSettings } from "@/lib/ai-content.functions";
import { getTtsSettings, saveTtsSettings, clearTtsSettings } from "@/lib/tts.functions";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — ShortsForge" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const deleteAccountData = useServerFn(deleteAllAccountData);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => (await supabase.from("profiles").select("*").maybeSingle()).data,
  });

  const qc = useQueryClient();
  const fetchRender = useServerFn(getRenderSettings);
  const saveRender = useServerFn(saveRenderSettings);
  const clearRender = useServerFn(clearRenderSettings);
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerSecret, setWorkerSecret] = useState("");
  const [aiProvider,setAiProvider]=useState<"openai"|"openrouter">("openrouter");
  const [aiKey,setAiKey]=useState("");
  const [aiModel,setAiModel]=useState("openai/gpt-4o-mini");
  const fetchAi=useServerFn(getAiSettings);
  const saveAi=useServerFn(saveAiSettings);
  const clearAi=useServerFn(clearAiSettings);
  const ai=useQuery({queryKey:["ai-settings"],queryFn:()=>fetchAi({data:{} as never})});
  const saveAiMutation=useMutation({
    mutationFn:()=>saveAi({data:{provider:aiProvider,apiKey:aiKey,model:aiModel}}),
    onSuccess:(res)=>{if(res.ok){toast.success("AI provider verified and saved");setAiKey("");qc.invalidateQueries({queryKey:["ai-settings"]});}else toast.error(res.error??"Could not verify AI key");},
    onError:(e:Error)=>toast.error(e.message),
  });
  const clearAiMutation=useMutation({mutationFn:()=>clearAi({data:{} as never}),onSuccess:()=>{toast.success("AI provider key removed");qc.invalidateQueries({queryKey:["ai-settings"]});}});

  const [ttsProvider,setTtsProvider]=useState<"openai"|"elevenlabs">("openai");
  const [ttsKey,setTtsKey]=useState("");
  const [ttsModel,setTtsModel]=useState("gpt-4o-mini-tts");
  const [ttsVoice,setTtsVoice]=useState("alloy");
  const fetchTts=useServerFn(getTtsSettings);
  const saveTts=useServerFn(saveTtsSettings);
  const clearTts=useServerFn(clearTtsSettings);
  const tts=useQuery({queryKey:["tts-settings"],queryFn:()=>fetchTts({data:{} as never})});
  const saveTtsMutation=useMutation({
    mutationFn:()=>saveTts({data:{provider:ttsProvider,apiKey:ttsKey,model:ttsModel,defaultVoice:ttsVoice}}),
    onSuccess:(res)=>{if(res.ok){toast.success("TTS provider verified and saved");setTtsKey("");qc.invalidateQueries({queryKey:["tts-settings"]});}else toast.error(res.error??"Could not verify TTS key");},
    onError:(e:Error)=>toast.error(e.message),
  });
  const clearTtsMutation=useMutation({
    mutationFn:()=>clearTts({data:{provider:ttsProvider}}),
    onSuccess:()=>{toast.success("TTS provider key removed");qc.invalidateQueries({queryKey:["tts-settings"]});},
  });

  const render = useQuery({ queryKey: ["render-settings"], queryFn: () => fetchRender({ data: {} as never }) });

  const save = useMutation({
    mutationFn: () => saveRender({ data: { workerUrl, workerSecret } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("FFmpeg worker verified and saved");
        setWorkerSecret("");
        qc.invalidateQueries({ queryKey: ["render-settings"] });
      } else {
        toast.error(res.error ?? "Could not verify FFmpeg worker");
        qc.invalidateQueries({ queryKey: ["render-settings"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => clearRender({ data: {} as never }),
    onSuccess: () => {
      toast.success("FFmpeg worker connection removed");
      qc.invalidateQueries({ queryKey: ["render-settings"] });
    },
  });

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = "/auth"; };

  const deleteAll = async () => {
    if (!confirm("Permanently delete ALL your campaigns, templates, assets and connections? This cannot be undone.")) return;
    try {
      const result = await deleteAccountData({ data: {} as never });
      toast.success(`Account data removed · ${result.renderFilesRemoved} renders and ${result.assetFilesRemoved} assets cleaned from storage`);
      qc.invalidateQueries();
    } catch (error) {
      toast.error("Could not remove all data", { description: error instanceof Error ? error.message : "Unknown error" });
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="Settings" description="Profile, security, and data controls." />

      <section className="rounded-2xl border border-border bg-panel p-6">
        <h2 className="font-display font-bold mb-3">Profile</h2>
        <div className="text-sm space-y-1">
          <div><span className="text-zinc-500">Name:</span> {profile?.full_name ?? "—"}</div>
          <div><span className="text-zinc-500">Email:</span> {profile?.email ?? "—"}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex items-center gap-2 mb-1"><Server className="size-4 text-brand"/><h2 className="font-display font-bold">Native FFmpeg worker</h2>{render.data?.health === "healthy" && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 rounded-full px-2 py-0.5"><CheckCircle2 className="size-3"/> Connected</span>}</div>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">Campaign automation sends signed jobs to your separately deployed native FFmpeg worker. The worker secret stays encrypted on the server and is never returned to the browser. Browser MP4 rendering remains available only from the explicit legacy/test-render screen.</p>
        {render.data && <div className="text-xs text-zinc-400 mb-4 space-y-1"><div><span className="text-zinc-500">Status:</span> {render.data.configured ? `${render.data.health} (${render.data.source})` : "Not configured"}</div><div><span className="text-zinc-500">Worker URL:</span> {render.data.workerUrl ?? "—"}</div><div><span className="text-zinc-500">Last verified:</span> {render.data.verifiedAt ? new Date(render.data.verifiedAt).toLocaleString() : "—"}</div><div><span className="text-zinc-500">Signed callback:</span> {render.data.callbackConfigured ? "enabled" : "disabled"}</div>{render.data.lastError && <div className="text-red-400">{render.data.lastError}</div>}</div>}
        <form className="space-y-3" onSubmit={(e)=>{e.preventDefault();if(workerUrl.trim()&&workerSecret.trim())save.mutate();}}><input type="url" value={workerUrl} onChange={(e)=>setWorkerUrl(e.target.value)} placeholder="https://render-worker.example.com" className="w-full rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-brand"/><input type="password" autoComplete="off" value={workerSecret} onChange={(e)=>setWorkerSecret(e.target.value)} placeholder="FFMPEG_WORKER_SECRET" className="w-full rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm outline-none focus:border-brand"/><div className="flex flex-wrap gap-2"><button type="submit" disabled={!workerUrl.trim()||!workerSecret.trim()||save.isPending} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand text-white text-sm font-semibold disabled:opacity-50">{save.isPending&&<Loader2 className="size-3.5 animate-spin"/>} Verify & save worker</button>{render.data?.source === "user" && <button type="button" onClick={()=>remove.mutate()} className="px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5">Remove worker</button>}</div></form>
        {render.data && <div className="mt-4 border-t border-border pt-3 text-xs text-zinc-500 leading-relaxed">Throttling: {render.data.limits.maxGlobalConcurrentRenders} renders globally, {render.data.limits.maxUserConcurrentRenders} per account, {render.data.limits.maxRendersPerTick} starts per minute · uploads {render.data.limits.maxGlobalConcurrentUploads} global / {render.data.limits.maxUserConcurrentUploads} per account.</div>}
      </section>

      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex items-center gap-2 mb-1"><Sparkles className="size-4 text-brand"/><h2 className="font-display font-bold">AI content generation</h2>
          {ai.data?.configured&&<span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 rounded-full px-2 py-0.5"><CheckCircle2 className="size-3"/> Connected</span>}
        </div>
        <p className="text-xs text-zinc-400 mb-4">Use your own OpenAI or OpenRouter key. Keys are encrypted at rest and AI requests run only on the server.</p>
        {ai.data&&<div className="text-xs text-zinc-400 mb-4 space-y-1"><div><span className="text-zinc-500">Status:</span> {ai.data.configured?`${ai.data.provider} · ${ai.data.model} · ${ai.data.source}`:"Not configured"}</div>{ai.data.keyHint&&<div><span className="text-zinc-500">Key:</span> {ai.data.keyHint}</div>}{ai.data.lastError&&<div className="text-red-400">{ai.data.lastError}</div>}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <select value={aiProvider} onChange={(e)=>{const p=e.target.value as "openai"|"openrouter";setAiProvider(p);setAiModel(p==="openai"?"gpt-5-mini":"openai/gpt-4o-mini");}} className="rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm"><option value="openrouter">OpenRouter</option><option value="openai">OpenAI</option></select>
          <input value={aiModel} onChange={(e)=>setAiModel(e.target.value)} className="rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm" placeholder="Model"/>
        </div>
        <input type="password" autoComplete="off" value={aiKey} onChange={(e)=>setAiKey(e.target.value)} className="mt-3 w-full rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm" placeholder={aiProvider==="openai"?"OpenAI API key":"OpenRouter API key"}/>
        <div className="flex gap-2 mt-3"><button disabled={!aiKey.trim()||saveAiMutation.isPending} onClick={()=>saveAiMutation.mutate()} className="px-3 py-2 rounded-md bg-brand text-white text-sm font-semibold disabled:opacity-50">{saveAiMutation.isPending?"Verifying…":"Verify & save AI key"}</button>{ai.data?.source==="user"&&<button onClick={()=>clearAiMutation.mutate()} className="px-3 py-2 rounded-md border border-border text-sm">Remove key</button>}</div>
      </section>

      <section className="rounded-2xl border border-border bg-panel p-6">
        <div className="flex items-center gap-2 mb-1"><Mic2 className="size-4 text-brand"/><h2 className="font-display font-bold">TTS / voice providers</h2></div>
        <p className="text-xs text-zinc-400 mb-4">Configure OpenAI TTS or ElevenLabs. Keys are encrypted at rest and narration generation runs server-side.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <select value={ttsProvider} onChange={(e)=>{const provider=e.target.value as "openai"|"elevenlabs";setTtsProvider(provider);if(provider==="openai"){setTtsModel("gpt-4o-mini-tts");setTtsVoice("alloy");}else{setTtsModel("eleven_multilingual_v2");setTtsVoice("");}}} className="rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm"><option value="openai">OpenAI TTS</option><option value="elevenlabs">ElevenLabs</option></select>
          <input value={ttsModel} onChange={(e)=>setTtsModel(e.target.value)} className="rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm" placeholder="Model"/>
          <input value={ttsVoice} onChange={(e)=>setTtsVoice(e.target.value)} className="rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm" placeholder={ttsProvider==="openai"?"Voice, e.g. alloy":"ElevenLabs voice ID"}/>
        </div>
        <input type="password" autoComplete="off" value={ttsKey} onChange={(e)=>setTtsKey(e.target.value)} className="mt-3 w-full rounded-md border border-border bg-zinc-950/60 px-3 py-2 text-sm" placeholder={`${ttsProvider} API key`}/>
        <div className="mt-3 space-y-1">{(tts.data??[]).map((row:any)=><div key={row.provider} className="text-xs text-zinc-400">{row.provider} · {row.model} {row.configured?<span className="text-emerald-400">· connected</span>:null} {row.keyHint?`· ${row.keyHint}`:""}</div>)}</div>
        <div className="flex gap-2 mt-3"><button disabled={!ttsKey.trim()||saveTtsMutation.isPending} onClick={()=>saveTtsMutation.mutate()} className="px-3 py-2 rounded-md bg-brand text-white text-sm font-semibold disabled:opacity-50">{saveTtsMutation.isPending?"Verifying…":"Verify & save TTS key"}</button><button onClick={()=>clearTtsMutation.mutate()} className="px-3 py-2 rounded-md border border-border text-sm">Remove selected provider</button></div>
      </section>

      <AutomationLimitsPanel />

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
          <a href={`data:application/json,${encodeURIComponent(SAMPLE_JSON)}`} download="sample.json" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5"><Download className="size-3.5" /> Download sample JSON</a>
          <a href={`data:text/csv,${encodeURIComponent(SAMPLE_CSV)}`} download="sample.csv" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5"><Download className="size-3.5" /> Download sample CSV</a>
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