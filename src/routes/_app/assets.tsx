import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Folder, Upload, Music, Image as ImageIcon, Film, Trash2, HardDrive, RefreshCw, Repeat2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useRef, useState } from "react";
import { storageUsage, uploadDurableAsset } from "@/lib/asset-client";
import { cleanupUnusedAssets, deleteAssetSafely } from "@/lib/asset-management.functions";
import { collectAssetIds } from "@/lib/asset-refs";

export const Route = createFileRoute("/_app/assets")({
  head: () => ({ meta: [{ title: "Assets — ShortsForge" }] }),
  component: AssetsPage,
});

function humanBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function AssetsPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const cleanupFn = useServerFn(cleanupUnusedAssets);
  const deleteFn = useServerFn(deleteAssetSafely);
  const [replacement, setReplacement] = useState<Record<string, string>>({});

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("assets").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const quota = useQuery({ queryKey: ["asset-storage-usage"], queryFn: storageUsage });
  const audioLibrary = useQuery({
    queryKey:["audio-library"],
    queryFn:async()=>{const {data,error}=await (supabase as any).from("audio_library_items").select("id,asset_id,role,name,bpm,tags");if(error)throw error;return data??[];},
  });
  const catalogAudio=useMutation({
    mutationFn:async({asset,role}:{asset:any;role:"music"|"sfx"})=>{
      let bpm:number|null=null;
      if(role==="music"){const raw=prompt("BPM for beat sync (optional)","120");bpm=raw&&Number(raw)>0?Number(raw):null;}
      const {error}=await (supabase as any).from("audio_library_items").upsert({asset_id:asset.id,role,name:asset.file_name,bpm,beat_offset_ms:0,tags:[]},{onConflict:"user_id,asset_id"});
      if(error)throw error;
    },
    onSuccess:()=>{toast.success("Audio library updated");qc.invalidateQueries({queryKey:["audio-library"]});},
    onError:(e:Error)=>toast.error(e.message),
  });

  const templates = useQuery({
    queryKey: ["asset-reference-health"],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("id,name,template_json").eq("is_default", false);
      if (error) throw error;
      return data ?? [];
    },
  });
  const health = useQuery({
    queryKey: ["asset-storage-health", assets.data?.length],
    enabled: !!assets.data,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const paths = new Set<string>();
      for (let offset = 0; offset < 10_000; offset += 1000) {
        const { data, error } = await supabase.storage.from("assets").list(auth.user.id, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw error;
        for (const entry of data ?? []) paths.add(`${auth.user.id}/${entry.name}`);
        if ((data ?? []).length < 1000) break;
      }
      return paths;
    },
  });

  const upload = useMutation({
    mutationFn: uploadDurableAsset,
    onSuccess: (asset) => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["asset-storage-usage"] });
      void qc.invalidateQueries({ queryKey: ["asset-storage-health"] });
      toast.success(asset.deduplicated ? "Already uploaded — reused existing asset" : "Asset uploaded");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { assetId: id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["asset-storage-usage"] });
      toast.success("Asset deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const replace = useMutation({
    mutationFn: async ({ oldId, newId }: { oldId: string; newId: string }) => {
      const { data, error } = await (supabase as any).rpc("replace_asset_everywhere", { p_old_asset: oldId, p_new_asset: newId });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (result, vars) => {
      setReplacement((value) => ({ ...value, [vars.oldId]: "" }));
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success(`Replaced in ${Number(result?.templates_updated ?? 0)} template(s) and ${Number(result?.campaign_items_updated ?? 0)} campaign item(s)`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Replace failed"),
  });

  const cleanup = useMutation({
    mutationFn: async () => cleanupFn({ data: { olderThanDays: 7 } }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["asset-storage-usage"] });
      void qc.invalidateQueries({ queryKey: ["asset-storage-health"] });
      toast.success(`Removed ${result.removed} unused asset record(s) + ${result.storageOrphansRemoved} storage orphan(s), freed ${humanBytes(result.bytesFreed)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Cleanup failed"),
  });

  const data = assets.data ?? [];
  const missingIds = useMemo(() => {
    const known = health.data;
    if (!known) return new Set<string>();
    return new Set(data.filter((a) => a.storage_path && !known.has(String(a.storage_path).replace(/^assets\//, ""))).map((a) => a.id));
  }, [data, health.data]);
  const knownAssetIds = useMemo(() => new Set(data.map((a) => String(a.id).toLowerCase())), [data]);
  const brokenTemplateRefs = useMemo(() => (templates.data ?? []).flatMap((tpl) =>
    collectAssetIds(tpl.template_json).filter((id) => !knownAssetIds.has(id.toLowerCase())).map((id) => ({ templateId: tpl.id, templateName: tpl.name, assetId: id }))
  ), [templates.data, knownAssetIds]);
  const used = quota.data?.usedBytes ?? 0;
  const limit = quota.data?.quotaBytes ?? 5 * 1024 ** 3;
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const ICON = { image: ImageIcon, video: Film, audio: Music, logo: ImageIcon } as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Assets"
        description="Durable media library with deduplication, usage tracking, quota protection, and fresh runtime URLs."
        action={<div className="flex flex-wrap gap-2">
          <button onClick={() => { if (window.confirm("Remove assets older than 7 days that are not referenced by any template or campaign?")) cleanup.mutate(); }} disabled={cleanup.isPending} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-white/5 disabled:opacity-50"><RefreshCw className="size-4" /> Clean unused</button>
          <input ref={inputRef} type="file" className="hidden" accept="image/*,video/*,audio/*" onChange={(e) => { const f=e.target.files?.[0]; if(f) upload.mutate(f); e.currentTarget.value=""; }} />
          <button onClick={() => inputRef.current?.click()} disabled={upload.isPending} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90 disabled:opacity-50"><Upload className="size-4" /> {upload.isPending ? "Uploading…" : "Upload asset"}</button>
        </div>}
      />

      {brokenTemplateRefs.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> {brokenTemplateRefs.length} missing durable asset reference(s) detected</div>
          <div className="mt-1 text-xs text-amber-100/70">Affected templates: {Array.from(new Set(brokenTemplateRefs.map((r) => r.templateName))).slice(0, 5).join(", ")}. Replace the missing asset reference by importing/restoring the original asset or editing the affected template.</div>
        </div>
      )}
      <div className="mb-6 rounded-xl border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="inline-flex items-center gap-2 font-semibold"><HardDrive className="size-4 text-brand" /> Storage {humanBytes(used)} / {humanBytes(limit)}</div>
          <div className="text-xs text-zinc-500">Exact duplicate files are reused automatically.</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
      </div>

      {assets.isLoading ? (
        <div className="rounded-xl border border-border bg-panel p-10 text-center text-sm text-zinc-500">Loading assets…</div>
      ) : assets.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">Assets could not be loaded. <button onClick={() => assets.refetch()} className="underline">Retry</button></div>
      ) : data.length === 0 ? (
        <EmptyState icon={Folder} title="No assets yet" description="Upload backgrounds, videos, music, and logos. Durable references stay valid even after signed preview URLs expire." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {data.map((a) => {
            const Icon = ICON[a.type as keyof typeof ICON] ?? Folder;
            const missing = missingIds.has(a.id) || a.lifecycle_status === "missing";
            const choices = data.filter((candidate) => candidate.id !== a.id && candidate.type === a.type && candidate.lifecycle_status !== "missing");
            return (
              <div key={a.id} className={`rounded-xl border bg-panel p-4 ${missing ? "border-amber-500/50" : "border-border"}`}>
                <div className="flex items-start gap-3">
                  <div className="size-12 rounded-lg bg-zinc-950 grid place-items-center shrink-0"><Icon className="size-5 text-brand" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate" title={a.file_name}>{a.file_name}</div>
                    <div className="mt-1 text-[10px] text-zinc-500 uppercase tracking-widest">{a.type} · {humanBytes(Number(a.size ?? 0))}</div>
                    <div className={`mt-2 inline-flex items-center gap-1 text-[11px] ${missing ? "text-amber-300" : "text-emerald-300"}`}>{missing ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}{missing ? "Missing storage object" : `${Number(a.usage_count ?? 0)} tracked reference(s)`}</div>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-border p-2">
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-zinc-500">Replace everywhere</div>
                  <div className="flex gap-2">
                    <select value={replacement[a.id] ?? ""} onChange={(e) => setReplacement((value) => ({ ...value, [a.id]: e.target.value }))} className="min-w-0 flex-1 rounded bg-zinc-950 border border-border px-2 py-1.5 text-xs">
                      <option value="">Choose {a.type}</option>
                      {choices.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.file_name}</option>)}
                    </select>
                    <button disabled={!replacement[a.id] || replace.isPending} onClick={() => { if (window.confirm(`Replace “${a.file_name}” everywhere with the selected asset?`)) replace.mutate({ oldId: a.id, newId: replacement[a.id] }); }} className="rounded border border-border px-2 text-zinc-300 hover:text-white disabled:opacity-40" title="Replace this asset in every template and campaign reference"><Repeat2 className="size-4" /></button>
                  </div>
                </div>
                {a.type==="audio"&&<div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={()=>catalogAudio.mutate({asset:a,role:"music"})} className="rounded border border-border px-2 py-1.5 text-[10px] hover:border-brand/50">Add as Music</button>
                  <button onClick={()=>catalogAudio.mutate({asset:a,role:"sfx"})} className="rounded border border-border px-2 py-1.5 text-[10px] hover:border-brand/50">Add as SFX</button>
                </div>}
                <button onClick={() => { if (window.confirm(`Delete “${a.file_name}” from storage?`)) del.mutate(a.id); }} disabled={del.isPending || Number(a.usage_count ?? 0) > 0} className="mt-3 w-full text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40 inline-flex items-center justify-center gap-1"><Trash2 className="size-3" /> {Number(a.usage_count ?? 0) > 0 ? "In use — replace first" : "Delete asset"}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
