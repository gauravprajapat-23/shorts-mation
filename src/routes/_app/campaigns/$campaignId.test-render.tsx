import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { startRenderJob, pollRenderJob } from "@/lib/render-jobs.functions";
import { ArrowLeft, ChevronLeft, ChevronRight, Play, RefreshCw, Sparkles, FileVideo2, Download, CheckCircle2 } from "lucide-react";
import { CANVAS_DIMS, renderText } from "@/lib/editor-defaults";
import type { EditorDocument, EditorElement, TextElement, ShapeElement, ImageElement, VideoElement } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/campaigns/$campaignId/test-render")({
  head: () => ({ meta: [{ title: "Test render — ShortsForge" }] }),
  component: TestRenderPage,
});

type Settings = { field_mapping?: Record<string, string>; default_privacy?: string };

function TestRenderPage() {
  const { campaignId } = useParams({ from: "/_app/campaigns/$campaignId/test-render" });
  const [sceneIndex, setSceneIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const startFn = useServerFn(startRenderJob);
  const pollFn = useServerFn(pollRenderJob);

  const campaign = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => (await supabase.from("campaigns").select("*").eq("id", campaignId).single()).data,
  });

  const items = useQuery({
    queryKey: ["campaign-items-preview", campaignId],
    queryFn: async () => (await supabase.from("campaign_items").select("*").eq("campaign_id", campaignId).order("created_at", { ascending: true }).limit(500)).data ?? [],
  });

  const template = useQuery({
    queryKey: ["template-preview", campaign.data?.template_id],
    enabled: !!campaign.data?.template_id,
    queryFn: async () => (await supabase.from("templates").select("*").eq("id", campaign.data!.template_id!).single()).data,
  });

  const doc = template.data?.template_json as EditorDocument | undefined;
  const settings = (campaign.data?.settings_json ?? {}) as Settings;
  const mapping = settings.field_mapping ?? {};
  const item = items.data?.[rowIndex];
  const totalRows = items.data?.length ?? 0;

  // Reset render job when switching row
  useEffect(() => {
    setJobId(null);
  }, [rowIndex]);

  const job = useQuery({
    queryKey: ["render-job", jobId],
    enabled: !!jobId,
    refetchInterval: (q) => {
      const d = q.state.data as { status?: string } | undefined;
      return d?.status === "completed" || d?.status === "failed" ? false : 700;
    },
    queryFn: async () => pollFn({ data: { jobId: jobId! } }),
  });

  const previewVars = useMemo<Record<string, string>>(() => {
    if (!item) return {};
    const content = (item.content_json ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(content)) {
      if (k.startsWith("_")) continue;
      out[k] = v == null ? "" : String(v);
    }
    // also expose seo fields
    const seo = (item.seo_json ?? {}) as { title?: string; description?: string };
    if (seo.title) out["seo.title"] = seo.title;
    if (seo.description) out["seo.description"] = seo.description;
    return out;
  }, [item]);

  if (campaign.isLoading || template.isLoading) {
    return <div className="p-10 text-zinc-400">Loading…</div>;
  }

  if (!doc) {
    return (
      <div className="p-10 max-w-2xl mx-auto text-center">
        <p className="text-sm text-zinc-400">This campaign has no template attached.</p>
        <Link to="/campaigns/$campaignId" params={{ campaignId }} className="text-brand text-sm mt-3 inline-block">← Back</Link>
      </div>
    );
  }

  const scene = doc.scenes[sceneIndex];
  const dims = CANVAS_DIMS[doc.aspect];
  const mappedKeys = Object.keys(mapping);
  const seo = (item?.seo_json ?? {}) as { title?: string; description?: string };

  const runRender = async () => {
    if (!item) return;
    try {
      const res = await startFn({ data: { campaignId, campaignItemId: item.id } });
      setJobId(res.jobId);
      toast.info("Render queued", { description: `Job ${res.jobId.slice(0, 8)}…` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start render");
    }
  };

  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    const j = job.data as { id: string; status: string } | undefined;
    if (j?.status === "completed" && notifiedRef.current !== j.id) {
      notifiedRef.current = j.id;
      toast.success("Render complete");
    }
  }, [job.data]);

  const j = job.data as { status: string; progress: number; preview_url: string | null } | undefined;
  const rendering = j ? j.status !== "completed" && j.status !== "failed" : false;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="h-14 border-b border-border bg-panel flex items-center justify-between px-4">
        <Link to="/campaigns/$campaignId" params={{ campaignId }} className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="size-4" /> Back to campaign
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={() => setRowIndex((i) => Math.max(0, i - 1))}
              disabled={rowIndex === 0}
              className="size-7 grid place-items-center rounded-md border border-border hover:bg-white/5 disabled:opacity-30"
              aria-label="Previous row"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <select
              value={rowIndex}
              onChange={(e) => setRowIndex(Number(e.target.value))}
              disabled={totalRows === 0}
              className="h-7 px-2 rounded-md bg-zinc-950 border border-border text-xs font-mono min-w-[180px]"
            >
              {totalRows === 0 ? (
                <option>No rows</option>
              ) : (
                items.data!.map((it, i) => (
                  <option key={it.id} value={i}>
                    Row {i + 1}/{totalRows} · {it.video_file_name ?? `item-${i + 1}`}
                  </option>
                ))
              )}
            </select>
            <button
              onClick={() => setRowIndex((i) => Math.min(totalRows - 1, i + 1))}
              disabled={rowIndex >= totalRows - 1}
              className="size-7 grid place-items-center rounded-md border border-border hover:bg-white/5 disabled:opacity-30"
              aria-label="Next row"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <button
            onClick={runRender}
            disabled={rendering || !item}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-brand text-white text-sm font-bold hover:bg-brand/90 disabled:opacity-50"
          >
            {rendering ? <RefreshCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {rendering ? `Rendering ${j?.progress ?? 0}%` : "Render this video"}
          </button>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_360px]">
        {/* Preview canvas */}
        <div className="min-h-[calc(100vh-3.5rem)] grid place-items-center p-8 bg-[radial-gradient(circle_at_center,#1a1a1a,#0a0a0a)]">
          <div className="flex flex-col items-center gap-4">
            <PreviewCanvas doc={doc} sceneIndex={sceneIndex} previewVars={previewVars} dims={dims} />
            <div className="flex items-center gap-2 text-xs">
              <button onClick={() => setSceneIndex((i) => Math.max(0, i - 1))} disabled={sceneIndex === 0} className="size-8 grid place-items-center rounded-md border border-border hover:bg-white/5 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
              <div className="font-mono text-zinc-400">Scene {sceneIndex + 1} / {doc.scenes.length}</div>
              <button onClick={() => setSceneIndex((i) => Math.min(doc.scenes.length - 1, i + 1))} disabled={sceneIndex === doc.scenes.length - 1} className="size-8 grid place-items-center rounded-md border border-border hover:bg-white/5 disabled:opacity-30"><ChevronRight className="size-4" /></button>
              <span className="ml-3 text-zinc-500">{(scene.durationMs / 1000).toFixed(1)}s</span>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <aside className="border-l border-border bg-panel p-5 space-y-5 overflow-y-auto max-h-[calc(100vh-3.5rem)]">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center gap-1.5"><Sparkles className="size-3 text-brand" /> What you're previewing</div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This is exactly what video #{rowIndex + 1} will look like when the automation runs — using the mapping you defined and the data from this row.
            </p>
          </div>

          {/* Row picker */}
          {totalRows > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center justify-between">
                <span>Pick a row to test</span>
                <span className="text-zinc-600 font-mono normal-case tracking-normal">{rowIndex + 1} / {totalRows}</span>
              </div>
              <select
                value={rowIndex}
                onChange={(e) => setRowIndex(Number(e.target.value))}
                className="w-full h-9 px-2 rounded-md bg-zinc-950 border border-border text-sm"
              >
                {items.data!.map((it, i) => (
                  <option key={it.id} value={i}>
                    Row {i + 1}: {it.video_file_name ?? `item-${i + 1}`}
                  </option>
                ))}
              </select>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {items.data!.map((it, i) => {
                  const content = (it.content_json ?? {}) as Record<string, unknown>;
                  const firstVal = mappedKeys.length > 0 ? String(content[mappedKeys[0]] ?? "") : (it.video_file_name ?? "");
                  return (
                    <button
                      key={it.id}
                      onClick={() => setRowIndex(i)}
                      className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-white/5 ${i === rowIndex ? "bg-brand/10 text-white" : "text-zinc-400"}`}
                    >
                      <span className={`font-mono text-[10px] w-8 shrink-0 ${i === rowIndex ? "text-brand" : "text-zinc-600"}`}>#{i + 1}</span>
                      <span className="truncate flex-1">{firstVal || "(empty)"}</span>
                      {i === rowIndex && <CheckCircle2 className="size-3 text-brand shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mapping resolved */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Resolved variables</div>
            {mappedKeys.length === 0 ? (
              <p className="text-xs text-zinc-500">No mapping saved for this campaign.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {mappedKeys.map((k) => {
                  const val = previewVars[k] ?? "";
                  return (
                    <li key={k} className="grid grid-cols-[auto_1fr] gap-2 items-baseline">
                      <code className="text-brand font-mono">{`{{${k}}}`}</code>
                      <span className={`truncate ${val ? "text-zinc-200" : "text-amber-400"}`}>{val || "(empty)"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* SEO */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Upload preview</div>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="size-10 rounded bg-zinc-950 grid place-items-center"><FileVideo2 className="size-4 text-brand" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{seo.title ?? item?.video_file_name ?? "—"}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">YouTube Shorts · {doc.aspect}</div>
                </div>
              </div>
              {seo.description && <p className="text-xs text-zinc-400 line-clamp-3">{seo.description}</p>}
            </div>
          </div>

          {/* Render output */}
          {j && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2 flex items-center gap-1.5">
                {j.status === "completed" ? <CheckCircle2 className="size-3 text-emerald-400" /> : <RefreshCw className="size-3 animate-spin text-brand" />}
                Render output · {j.status}
              </div>
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="h-2 rounded-full bg-zinc-900 overflow-hidden">
                  <div className="h-full bg-brand transition-all" style={{ width: `${j.progress}%` }} />
                </div>
                <div className="text-[10px] font-mono text-zinc-500">{j.progress}% · {j.status === "completed" ? "Ready" : "Compositing frames…"}</div>
                {j.preview_url && (
                  <>
                    <img src={j.preview_url} alt="Render preview" className="w-full rounded border border-border" />
                    <a href={j.preview_url} download={`render-${jobId}.svg`} className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline">
                      <Download className="size-3" /> Download preview
                    </a>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-100 text-xs">
            <strong className="font-bold">Heads up:</strong> v1 renders a still-frame preview from your template + row data. MP4 stitching activates when you connect a render worker.
          </div>
        </aside>
      </div>
    </div>
  );
}

function PreviewCanvas({ doc, sceneIndex, previewVars, dims }: {
  doc: EditorDocument; sceneIndex: number; previewVars: Record<string, string>; dims: { w: number; h: number };
}) {
  const scene = doc.scenes[sceneIndex];
  // fit into ~520px tall for 9:16
  const maxH = 560;
  const maxW = 720;
  const scale = Math.min(maxH / dims.h, maxW / dims.w);
  return (
    <div
      className="relative shadow-2xl shadow-black/60 rounded-md overflow-hidden"
      style={{ width: dims.w * scale, height: dims.h * scale, background: scene.background, outline: "1px solid #262626" }}
    >
      <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "top left", width: dims.w, height: dims.h }}>
        {scene.elements.map((el) => (
          <PreviewElement key={el.id} el={el} previewVars={previewVars} />
        ))}
      </div>
    </div>
  );
}

function PreviewElement({ el, previewVars }: { el: EditorElement; previewVars: Record<string, string> }) {
  const baseStyle: React.CSSProperties = {
    position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h,
    transform: `rotate(${el.rotation}deg)`, opacity: el.opacity,
  };
  if (el.type === "text") {
    const t = el as TextElement;
    return (
      <div style={{ ...baseStyle, display: "flex", alignItems: "center", justifyContent: t.align === "left" ? "flex-start" : t.align === "right" ? "flex-end" : "center", color: t.color, fontFamily: t.fontFamily, fontSize: t.fontSize, fontWeight: t.fontWeight, textAlign: t.align, background: t.background, padding: 8, lineHeight: 1.1 }}>
        {renderText(t.text, previewVars)}
      </div>
    );
  }
  if (el.type === "shape") {
    const s = el as ShapeElement;
    return <div style={{ ...baseStyle, background: s.fill, borderRadius: s.shape === "ellipse" ? "50%" : s.radius ?? 0 }} />;
  }
  if (el.type === "image") {
    const im = el as ImageElement;
    const src = im.src.startsWith("{{") ? "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080" : im.src;
    return <img style={{ ...baseStyle, objectFit: im.fit }} src={src} alt="" />;
  }
  const v = el as VideoElement;
  if (!v.src || v.src.startsWith("{{")) {
    return <div style={{ ...baseStyle, background: "#111", display: "grid", placeItems: "center", color: "#666" }}>Video</div>;
  }
  return <video style={{ ...baseStyle, objectFit: v.fit, background: "#000" }} src={v.src} muted={v.muted ?? true} loop={v.loop ?? true} autoPlay={v.autoplay ?? true} playsInline />;
}