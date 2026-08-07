import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CANVAS_DIMS, blankDocument, renderText, uid } from "@/lib/editor-defaults";
import type { EditorDocument, EditorElement, EditorScene, TextElement, ShapeElement, ImageElement, VideoElement, AnimationSpec, InAnim, OutAnim, LoopAnim, TextReveal, CameraMove } from "@/lib/types";
import { ArrowLeft, Type, Image as ImageIcon, Square, Layers, Variable, Save, Undo2, Redo2, Plus, Trash2, Eye, Copy, Lock, Unlock, ArrowUp, ArrowDown, ZoomIn, ZoomOut, Maximize, Film, Upload, Circle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { buildSceneSvgAtTime } from "@/lib/scene-svg";
import { totalDocDurationMs } from "@/lib/animate";

export const Route = createFileRoute("/_app/editor/$templateId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Editor — ShortsForge" }] }),
  component: EditorPage,
});

type Panel = "elements" | "text" | "shapes" | "variables" | "layers";
type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const FONT_FAMILIES = ["Plus Jakarta Sans", "Inter", "Georgia", "Times New Roman", "Courier New", "Impact", "Arial", "Helvetica"];

async function uploadToAssets(file: File): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const ext = file.name.split(".").pop() || "bin";
  const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("assets").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage.from("assets").createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("Failed to sign URL");
  const kind: "image" | "video" | "audio" = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image";
  await supabase.from("assets").insert({ user_id: u.user.id, file_name: file.name, file_url: data.signedUrl, type: kind, storage_path: path, mime_type: file.type, size: file.size });
  return data.signedUrl;
}

function EditorPage() {
  const { templateId } = useParams({ from: "/_app/editor/$templateId" });
  const qc = useQueryClient();

  const { data: template } = useQuery({
    queryKey: ["template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("*").eq("id", templateId).single();
      if (error) throw error;
      return data;
    },
  });

  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [history, setHistory] = useState<EditorDocument[]>([]);
  const [future, setFuture] = useState<EditorDocument[]>([]);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("elements");
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!template) return;
    const initial = (template.template_json as unknown as EditorDocument) ?? blankDocument(template.aspect_ratio as never);
    setDoc(initial);
  }, [template]);

  const scene = doc?.scenes[sceneIndex];
  const selected = useMemo(() => scene?.elements.find((e) => e.id === selectedId) ?? null, [scene, selectedId]);

  const commit = (next: EditorDocument) => {
    if (!doc) return;
    setHistory((h) => [...h.slice(-49), doc]);
    setFuture([]);
    setDoc(next);
  };
  const undo = () => {
    if (!doc || history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    setDoc(prev);
  };
  const redo = () => {
    if (!doc || future.length === 0) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, doc]);
    setDoc(next);
  };

  const updateScene = (mut: (s: EditorScene) => EditorScene) => {
    if (!doc) return;
    const scenes = doc.scenes.map((s, i) => (i === sceneIndex ? mut(s) : s));
    commit({ ...doc, scenes });
  };
  const updateElement = (id: string, mut: (e: EditorElement) => EditorElement) => {
    updateScene((s) => ({ ...s, elements: s.elements.map((e) => (e.id === id ? mut(e) : e)) }));
  };
  const addElement = (e: EditorElement) => {
    updateScene((s) => ({ ...s, elements: [...s.elements, e] }));
    setSelectedId(e.id);
  };
  const deleteElement = (id: string) => {
    updateScene((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateElement = (id: string) => {
    if (!doc) return;
    const s = doc.scenes[sceneIndex];
    const el = s.elements.find((e) => e.id === id);
    if (!el) return;
    const copy = { ...el, id: uid(el.type), x: el.x + 24, y: el.y + 24 } as EditorElement;
    updateScene((sc) => ({ ...sc, elements: [...sc.elements, copy] }));
    setSelectedId(copy.id);
  };
  const reorderElement = (id: string, dir: -1 | 1) => {
    updateScene((s) => {
      const idx = s.elements.findIndex((e) => e.id === id);
      if (idx < 0) return s;
      const next = [...s.elements];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return s;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...s, elements: next };
    });
  };
  const toggleLock = (id: string) => {
    updateElement(id, (e) => ({ ...e, locked: !e.locked }));
  };
  const addScene = () => {
    if (!doc) return;
    commit({ ...doc, scenes: [...doc.scenes, { id: uid("scene"), name: `Scene ${doc.scenes.length + 1}`, durationMs: 5000, background: "#0A0A0A", elements: [] }] });
    setSceneIndex(doc.scenes.length);
  };
  const duplicateScene = () => {
    if (!doc) return;
    const src = doc.scenes[sceneIndex];
    const copy: EditorScene = {
      ...src,
      id: uid("scene"),
      name: `${src.name} copy`,
      elements: src.elements.map((e) => ({ ...e, id: uid(e.type) })),
    };
    const scenes = [...doc.scenes.slice(0, sceneIndex + 1), copy, ...doc.scenes.slice(sceneIndex + 1)];
    commit({ ...doc, scenes });
    setSceneIndex(sceneIndex + 1);
  };
  const deleteScene = () => {
    if (!doc || doc.scenes.length <= 1) { toast.error("A template needs at least one scene"); return; }
    const scenes = doc.scenes.filter((_, i) => i !== sceneIndex);
    commit({ ...doc, scenes });
    setSceneIndex(Math.max(0, sceneIndex - 1));
    setSelectedId(null);
  };
  const moveScene = (dir: -1 | 1) => {
    if (!doc) return;
    const to = sceneIndex + dir;
    if (to < 0 || to >= doc.scenes.length) return;
    const scenes = [...doc.scenes];
    [scenes[sceneIndex], scenes[to]] = [scenes[to], scenes[sceneIndex]];
    commit({ ...doc, scenes });
    setSceneIndex(to);
  };

  /** Align / stretch the selection against the artboard. */
  const alignSelected = (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "fill" | "fitWidth") => {
    if (!doc || !selectedId) return;
    const d = CANVAS_DIMS[doc.aspect];
    updateElement(selectedId, (el) => {
      switch (mode) {
        case "left": return { ...el, x: 0 };
        case "hcenter": return { ...el, x: (d.w - el.w) / 2 };
        case "right": return { ...el, x: d.w - el.w };
        case "top": return { ...el, y: 0 };
        case "vcenter": return { ...el, y: (d.h - el.h) / 2 };
        case "bottom": return { ...el, y: d.h - el.h };
        case "fitWidth": return { ...el, x: 80, w: d.w - 160 };
        case "fill": return { ...el, x: 0, y: 0, w: d.w, h: d.h };
      }
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!doc || !template) return;
      const { error } = await supabase.from("templates").update({ template_json: doc as never }).eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template saved"); qc.invalidateQueries({ queryKey: ["template", templateId] }); },
    onError: (e) => toast.error(e.message),
  });

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save.mutate(); return; }
      if (mod && e.key.toLowerCase() === "d" && selectedId) { e.preventDefault(); duplicateElement(selectedId); return; }
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteElement(selectedId); return; }
      const step = e.shiftKey ? 20 : 2;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
        e.preventDefault();
        updateElement(selectedId, (el) => ({
          ...el,
          x: el.x + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0),
          y: el.y + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0),
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, selectedId, history, future, sceneIndex]);

  if (!doc || !scene) return <div className="p-10 text-zinc-400">Loading editor…</div>;
  const dims = CANVAS_DIMS[doc.aspect];

  return (
    <div className="h-screen w-full flex flex-col bg-canvas text-foreground">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-border bg-panel flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link to="/templates" className="size-8 grid place-items-center rounded-md hover:bg-white/5"><ArrowLeft className="size-4" /></Link>
          <input
            value={template?.name ?? ""}
            onChange={(e) => {
              if (!template) return;
              supabase.from("templates").update({ name: e.target.value }).eq("id", template.id);
            }}
            className="bg-transparent text-sm font-semibold focus:outline-none focus:bg-white/5 px-2 py-1 rounded"
          />
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">{doc.aspect}</span>
        </div>
        <div className="flex items-center gap-2">
          <button title="Undo (⌘Z)" onClick={undo} disabled={history.length === 0} className="size-8 grid place-items-center rounded-md hover:bg-white/5 disabled:opacity-30"><Undo2 className="size-4" /></button>
          <button title="Redo (⌘⇧Z)" onClick={redo} disabled={future.length === 0} className="size-8 grid place-items-center rounded-md hover:bg-white/5 disabled:opacity-30"><Redo2 className="size-4" /></button>
          <div className="w-px h-6 bg-border mx-1" />
          <button onClick={() => setPreviewOpen(true)} className="px-3 py-1.5 rounded-md text-sm font-semibold border border-border hover:bg-white/5 inline-flex items-center gap-1.5"><Eye className="size-3.5" /> Preview</button>
          <button title="Save (⌘S)" onClick={() => save.mutate()} disabled={save.isPending} className="px-3 py-1.5 rounded-md bg-brand text-white text-sm font-bold hover:bg-brand/90 inline-flex items-center gap-1.5">
            <Save className="size-3.5" /> {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left rail */}
        <nav className="w-14 shrink-0 border-r border-border bg-panel flex flex-col items-center py-3 gap-1">
          {[
            { id: "elements" as Panel, icon: Plus, label: "Elements" },
            { id: "text" as Panel, icon: Type, label: "Text" },
            { id: "shapes" as Panel, icon: Square, label: "Shapes" },
            { id: "variables" as Panel, icon: Variable, label: "Variables" },
            { id: "layers" as Panel, icon: Layers, label: "Layers" },
          ].map((p) => (
            <button key={p.id} title={p.label} onClick={() => setPanel(p.id)} className={`size-10 rounded-md grid place-items-center text-zinc-400 hover:text-white hover:bg-white/5 ${panel===p.id?"bg-white/5 text-brand":""}`}>
              <p.icon className="size-4" />
            </button>
          ))}
        </nav>

        {/* Left panel */}
        <aside className="w-64 shrink-0 border-r border-border bg-panel overflow-y-auto">
          <LeftPanel
            panel={panel}
            doc={doc}
            onAddText={() =>
              addElement({
                id: uid("text"), type: "text", text: "New text", x: dims.w/2 - 200, y: dims.h/2 - 40, w: 400, h: 80,
                rotation: 0, opacity: 1, fontFamily: "Plus Jakarta Sans", fontSize: 64, fontWeight: 800, color: "#FFFFFF", align: "center",
              } as TextElement)
            }
            onAddTextPreset={(patch) =>
              addElement({
                id: uid("text"), type: "text", text: "New text", x: 80, y: dims.h/2 - 120, w: dims.w - 160, h: 240,
                rotation: 0, opacity: 1, fontFamily: "Plus Jakarta Sans", fontSize: 64, fontWeight: 800, color: "#FFFFFF", align: "center",
                ...patch,
              } as TextElement)
            }
            onAddVariable={(name) => addElement({
              id: uid("text"), type: "text", text: `{{${name}}}`, x: dims.w/2 - 200, y: dims.h/2 - 40, w: 400, h: 80,
              rotation: 0, opacity: 1, fontFamily: "Plus Jakarta Sans", fontSize: 64, fontWeight: 800, color: "#FFFFFF", align: "center",
            } as TextElement)}
            onAddShape={(shape) => addElement({
              id: uid("shape"), type: "shape", shape, x: dims.w/2 - 150, y: dims.h/2 - 150, w: 300, h: 300,
              rotation: 0, opacity: 1, fill: "#FF0033", radius: shape === "rect" ? 24 : 0,
              ...(shape === "line" ? { w: 600, h: 40, strokeWidth: 8 } : {}),
            } as ShapeElement)}
            onAddImagePlaceholder={() => addElement({
              id: uid("img"), type: "image", src: "{{background}}", x: 0, y: 0, w: dims.w, h: dims.h,
              rotation: 0, opacity: 1, fit: "cover",
            } as ImageElement)}
            onAddImageFromUrl={(url) => addElement({
              id: uid("img"), type: "image", src: url, x: dims.w/2 - 300, y: dims.h/2 - 300, w: 600, h: 600,
              rotation: 0, opacity: 1, fit: "cover",
            } as ImageElement)}
            onAddVideoFromUrl={(url) => addElement({
              id: uid("vid"), type: "video", src: url, x: 0, y: 0, w: dims.w, h: dims.h,
              rotation: 0, opacity: 1, fit: "cover", muted: true, loop: true, autoplay: true,
            } as VideoElement)}
            onUploadFile={async (file) => {
              try {
                const url = await uploadToAssets(file);
                const isVideo = file.type.startsWith("video");
                if (isVideo) {
                  addElement({ id: uid("vid"), type: "video", src: url, x: 0, y: 0, w: dims.w, h: dims.h, rotation: 0, opacity: 1, fit: "cover", muted: true, loop: true, autoplay: true } as VideoElement);
                } else {
                  addElement({ id: uid("img"), type: "image", src: url, x: dims.w/2 - 300, y: dims.h/2 - 300, w: 600, h: 600, rotation: 0, opacity: 1, fit: "cover" } as ImageElement);
                }
                toast.success("Uploaded");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Upload failed");
              }
            }}
            scene={scene}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            deleteElement={deleteElement}
          />
        </aside>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden bg-[radial-gradient(circle_at_center,#1a1a1a,#0a0a0a)]">
          <Canvas
            doc={doc} sceneIndex={sceneIndex} previewVars={previewVars}
            selectedId={selectedId} setSelectedId={setSelectedId}
            updateElement={updateElement} zoom={zoom} setZoom={setZoom}
          />
        </div>

        {/* Right panel */}
        <aside className="w-72 shrink-0 border-l border-border bg-panel overflow-y-auto">
          <RightPanel
            selected={selected}
            update={(p) => selected && updateElement(selected.id, (e) => ({ ...e, ...p } as EditorElement))}
            scene={scene} updateScene={updateScene}
            onAlign={alignSelected}
            sceneIndex={sceneIndex}
            sceneCount={doc.scenes.length}
            onDuplicateScene={duplicateScene}
            onDeleteScene={deleteScene}
            onMoveScene={moveScene}
            onDuplicate={() => selected && duplicateElement(selected.id)}
            onDelete={() => selected && deleteElement(selected.id)}
            onLayerUp={() => selected && reorderElement(selected.id, 1)}
            onLayerDown={() => selected && reorderElement(selected.id, -1)}
            onToggleLock={() => selected && toggleLock(selected.id)}
          />
        </aside>
      </div>

      {/* Bottom timeline */}
      <footer className="h-24 shrink-0 border-t border-border bg-panel px-4 py-3 flex items-center gap-3 overflow-x-auto">
        {doc.scenes.map((s, i) => (
          <button key={s.id} onClick={() => setSceneIndex(i)} className={`shrink-0 w-[72px] h-16 rounded-md border-2 ${i===sceneIndex?"border-brand":"border-border"} bg-zinc-950 grid place-items-center text-[10px] text-zinc-500 hover:border-brand/60`}>
            <div className="font-bold text-white">{i+1}</div>
            <div>{(s.durationMs/1000).toFixed(1)}s</div>
          </button>
        ))}
        <button onClick={addScene} className="shrink-0 w-[72px] h-16 rounded-md border-2 border-dashed border-border hover:border-brand/60 grid place-items-center text-zinc-500"><Plus className="size-4" /></button>
      </footer>

      {previewOpen && (
        <PreviewModal doc={doc} vars={previewVars} setVars={setPreviewVars} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

function PreviewModal({ doc, vars, setVars, onClose }: { doc: EditorDocument; vars: Record<string, string>; setVars: (fn: (p: Record<string, string>) => Record<string, string>) => void; onClose: () => void }) {
  const totalMs = Math.max(1000, totalDocDurationMs(doc.scenes));
  const [tMs, setTMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const startRef = useRef<number>(performance.now());
  const baseRef = useRef<number>(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current + baseRef.current;
      const looped = elapsed % totalMs;
      setTMs(looped);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalMs]);
  const svg = useMemo(() => buildSceneSvgAtTime({ doc, tMs, vars, includeBackground: true }), [doc, tMs, vars]);
  const dataUrl = useMemo(() => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, [svg]);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-6" onClick={onClose}>
      <div className="relative bg-panel border border-border rounded-2xl p-4 max-w-[90vw] max-h-[90vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Animated preview <span className="text-zinc-500 font-normal">· {doc.aspect} · {(totalMs/1000).toFixed(1)}s</span></div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-white/5">Close</button>
        </div>
        <div className={`${doc.aspect === "9:16" ? "aspect-[9/16] h-[70vh]" : doc.aspect === "16:9" ? "aspect-video w-[75vw] max-w-4xl" : "aspect-square h-[70vh]"} bg-black rounded-lg overflow-hidden grid place-items-center`}>
          <img src={dataUrl} alt="preview" className="w-full h-full object-contain" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setPlaying((p) => !p); baseRef.current = tMs; startRef.current = performance.now(); }} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-brand text-white hover:bg-brand/90">
            {playing ? "Pause" : "Play"}
          </button>
          <input type="range" min={0} max={totalMs} step={10} value={tMs} onChange={(e) => { setPlaying(false); setTMs(Number(e.target.value)); baseRef.current = Number(e.target.value); }} className="flex-1" />
          <span className="font-mono text-[10px] text-zinc-500 w-16 text-right">{(tMs/1000).toFixed(2)}s</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.variables.slice(0, 8).map((v) => (
            <label key={v} className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-500 font-mono">{v}</span>
              <input
                value={vars[v] ?? ""}
                onChange={(e) => setVars((p) => ({ ...p, [v]: e.target.value }))}
                placeholder={`sample ${v}`}
                className="h-7 px-2 rounded-md bg-zinc-950 border border-border text-xs w-32"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Canvas({ doc, sceneIndex, previewVars, selectedId, setSelectedId, updateElement, zoom, setZoom }: {
  doc: EditorDocument; sceneIndex: number; previewVars: Record<string, string>;
  selectedId: string | null; setSelectedId: (id: string | null) => void;
  updateElement: (id: string, mut: (e: EditorElement) => EditorElement) => void;
  zoom: number | "fit"; setZoom: (z: number | "fit") => void;
}) {
  const scene = doc.scenes[sceneIndex];
  const dims = CANVAS_DIMS[doc.aspect];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.3);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const calc = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const pad = 32;
      const sx = (wrap.clientWidth - pad) / dims.w;
      const sy = (wrap.clientHeight - pad) / dims.h;
      setFitScale(Math.min(sx, sy));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [dims.w, dims.h]);

  const scale = zoom === "fit" ? fitScale : zoom;

  // Re-center whenever we return to "fit" (or the canvas size changes) so the
  // artboard never drifts out of view.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || zoom !== "fit") return;
    setOffset({
      x: (wrap.clientWidth - dims.w * fitScale) / 2,
      y: (wrap.clientHeight - dims.h * fitScale) / 2,
    });
  }, [zoom, fitScale, dims.w, dims.h]);

  // Wheel handling must be a native non-passive listener — React's onWheel is
  // passive, so preventDefault() is ignored there and the whole page zooms
  // instead of the artboard.
  const stateRef = useRef({ scale, offset, dims });
  stateRef.current = { scale, offset, dims };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { scale: cur, offset: off } = stateRef.current;
      const rect = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const dx = e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      if (e.ctrlKey || e.metaKey) {
        const next = Math.min(4, Math.max(0.05, cur * Math.exp(-dy * 0.0015)));
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const k = next / cur;
        setOffset({ x: px - (px - off.x) * k, y: py - (py - off.y) * k });
        setZoom(next);
      } else {
        setOffset({ x: off.x - dx, y: off.y - dy });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomBy = (factor: number) => {
    const wrap = wrapRef.current;
    const cur = scale;
    const next = Math.min(4, Math.max(0.05, cur * factor));
    if (wrap) {
      const px = wrap.clientWidth / 2;
      const py = wrap.clientHeight / 2;
      const k = next / cur;
      setOffset({ x: px - (px - offset.x) * k, y: py - (py - offset.y) * k });
    }
    setZoom(next);
  };

  // Middle-button (or space-less trackpad) panning of the artboard.
  const startPan = (e: React.PointerEvent) => {
    const start = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setPanning(true);
    const move = (ev: PointerEvent) => setOffset({ x: start.ox + (ev.clientX - start.x), y: start.oy + (ev.clientY - start.y) });
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Collect snap targets from every other element + canvas edges/center.
  const snapTargets = (excludeId: string) => {
    const vs = [0, dims.w / 2, dims.w];
    const hs = [0, dims.h / 2, dims.h];
    for (const o of scene.elements) {
      if (o.id === excludeId) continue;
      vs.push(o.x, o.x + o.w / 2, o.x + o.w);
      hs.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    return { vs, hs };
  };

  const startDrag = (e: React.PointerEvent, el: EditorElement) => {
    if (el.locked) { setSelectedId(el.id); return; }
    e.stopPropagation();
    setSelectedId(el.id);
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y };
    const targets = snapTargets(el.id);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      let nx = start.ex + dx;
      let ny = start.ey + dy;
      const snap = 6 / scale;
      const vLines: number[] = [];
      const hLines: number[] = [];
      const candX = [nx, nx + el.w / 2, nx + el.w];
      const candY = [ny, ny + el.h / 2, ny + el.h];
      // Snap X
      let bestDx = snap, bestX: number | null = null;
      let matchedV: number | null = null;
      for (let i = 0; i < candX.length; i++) {
        for (const t of targets.vs) {
          const d = Math.abs(candX[i] - t);
          if (d < bestDx) { bestDx = d; bestX = t - (i === 0 ? 0 : i === 1 ? el.w / 2 : el.w); matchedV = t; }
        }
      }
      if (bestX != null) { nx = bestX; if (matchedV != null) vLines.push(matchedV); }
      // Snap Y
      let bestDy = snap, bestY: number | null = null;
      let matchedH: number | null = null;
      for (let i = 0; i < candY.length; i++) {
        for (const t of targets.hs) {
          const d = Math.abs(candY[i] - t);
          if (d < bestDy) { bestDy = d; bestY = t - (i === 0 ? 0 : i === 1 ? el.h / 2 : el.h); matchedH = t; }
        }
      }
      if (bestY != null) { ny = bestY; if (matchedH != null) hLines.push(matchedH); }
      setGuides({ v: vLines, h: hLines });
      updateElement(el.id, (cur) => ({ ...cur, x: nx, y: ny }));
    };
    const up = () => {
      setGuides({ v: [], h: [] });
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e: React.PointerEvent, el: EditorElement, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(el.id);
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y, ew: el.w, eh: el.h };
    const aspect = el.w / Math.max(1, el.h);
    const isCorner = handle.length === 2;
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - start.x) / scale;
      let dy = (ev.clientY - start.y) / scale;
      // Lock aspect ratio when Shift is held on a corner handle.
      if (isCorner && ev.shiftKey) {
        const signX = handle.includes("e") ? 1 : -1;
        const signY = handle.includes("s") ? 1 : -1;
        const projected = (signX * dx + (signY * dy) * aspect) / 2;
        dx = signX * projected;
        dy = signY * (projected / aspect);
      }
      let { ex, ey, ew, eh } = start;
      if (handle.includes("e")) ew = Math.max(20, start.ew + dx);
      if (handle.includes("s")) eh = Math.max(20, start.eh + dy);
      if (handle.includes("w")) { const nw = Math.max(20, start.ew - dx); ex = start.ex + (start.ew - nw); ew = nw; }
      if (handle.includes("n")) { const nh = Math.max(20, start.eh - dy); ey = start.ey + (start.eh - nh); eh = nh; }
      updateElement(el.id, (cur) => ({ ...cur, x: ex, y: ey, w: ew, h: eh }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRotate = (e: React.PointerEvent, el: EditorElement) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(el.id);
    const rect = wrapRef.current?.getBoundingClientRect();
    const canvas = (e.currentTarget as HTMLElement).closest("[data-canvas-root]") as HTMLElement | null;
    const cRect = canvas?.getBoundingClientRect() ?? rect!;
    // element center in screen coords
    const cx = cRect.left + (el.x + el.w / 2) * scale;
    const cy = cRect.top + (el.y + el.h / 2) * scale;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    const startRot = el.rotation;
    const move = (ev: PointerEvent) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI);
      let r = startRot + (a - startAngle);
      if (ev.shiftKey) r = Math.round(r / 15) * 15;
      // normalize
      while (r > 180) r -= 360;
      while (r < -180) r += 360;
      updateElement(el.id, (cur) => ({ ...cur, rotation: r }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={wrapRef}
      className="w-full h-full relative overflow-hidden touch-none"
      style={{ cursor: panning ? "grabbing" : undefined }}
      onPointerDown={(e) => {
        if (e.button === 1 || e.altKey) { e.preventDefault(); startPan(e); return; }
        setSelectedId(null);
        setEditingId(null);
      }}
    >
      <div
        data-canvas-root
        className="absolute shadow-2xl shadow-black/60"
        style={{
          width: dims.w, height: dims.h, left: 0, top: 0,
          transformOrigin: "0 0",
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          background: scene.background, outline: "1px solid #262626",
        }}
      >
        {scene.elements.map((el) => (
          <ElementView
            key={el.id} el={el} selected={el.id === selectedId}
            editing={editingId === el.id}
            onPointerDown={(e) => startDrag(e, el)}
            onDoubleClick={() => { if (el.type === "text" && !el.locked) setEditingId(el.id); }}
            onTextChange={(text) => updateElement(el.id, (cur) => cur.type === "text" ? { ...cur, text } : cur)}
            onEndEdit={() => setEditingId(null)}
            onResizeStart={(e, handle) => startResize(e, el, handle)}
            onRotateStart={(e) => startRotate(e, el)}
            previewVars={previewVars}
          />
        ))}
        {guides.v.map((x, i) => (
          <div key={`v-${i}-${x}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: x, width: 1, background: "#FF0033" }} />
        ))}
        {guides.h.map((y, i) => (
          <div key={`h-${i}-${y}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: y, height: 1, background: "#FF0033" }} />
        ))}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-panel border border-border rounded-md px-1 py-1 text-xs">
        <button title="Zoom out" onClick={(e) => { e.stopPropagation(); zoomBy(1 / 1.2); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomOut className="size-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="px-2 h-7 hover:bg-white/5 rounded font-mono tabular-nums text-zinc-400">{Math.round(scale * 100)}%</button>
        <button title="Zoom in" onClick={(e) => { e.stopPropagation(); zoomBy(1.2); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomIn className="size-3.5" /></button>
        <button title="Fit to screen" onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><Maximize className="size-3.5" /></button>
      </div>
      <div className="absolute bottom-3 left-3 text-[10px] text-zinc-500 pointer-events-none">
        ⌘/Ctrl + scroll to zoom · scroll or Alt-drag to pan
      </div>
    </div>
  );
}

function ElementView({ el, selected, editing, onPointerDown, onDoubleClick, onTextChange, onEndEdit, onResizeStart, onRotateStart, previewVars }: {
  el: EditorElement; selected: boolean; editing: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onTextChange: (text: string) => void;
  onEndEdit: () => void;
  onResizeStart: (e: React.PointerEvent, handle: ResizeHandle) => void;
  onRotateStart: (e: React.PointerEvent) => void;
  previewVars: Record<string, string>;
}) {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    transform: `rotate(${el.rotation}deg)`, opacity: el.opacity,
    outline: selected ? "3px solid #FF0033" : "none",
    cursor: el.locked ? "not-allowed" : "move",
  };
  const cornerCursor = (h: ResizeHandle) =>
    h === "nw" || h === "se" ? "nwse-resize" :
    h === "ne" || h === "sw" ? "nesw-resize" :
    h === "n" || h === "s" ? "ns-resize" : "ew-resize";
  const handles = selected && !el.locked ? (
    <>
      {/* Corners */}
      {(["nw","ne","sw","se"] as const).map((c) => (
        <div
          key={c}
          onPointerDown={(e) => onResizeStart(e, c)}
          className="absolute bg-white border-2 border-brand rounded-full shadow"
          style={{
            width: 14, height: 14,
            left: c.includes("w") ? -7 : undefined, right: c.includes("e") ? -7 : undefined,
            top: c.includes("n") ? -7 : undefined, bottom: c.includes("s") ? -7 : undefined,
            cursor: cornerCursor(c),
          }}
        />
      ))}
      {/* Edge midpoints */}
      {(["n","s"] as const).map((c) => (
        <div
          key={c}
          onPointerDown={(e) => onResizeStart(e, c)}
          className="absolute bg-white border-2 border-brand rounded-sm shadow"
          style={{
            width: 22, height: 8, left: "50%", marginLeft: -11,
            top: c === "n" ? -4 : undefined, bottom: c === "s" ? -4 : undefined,
            cursor: cornerCursor(c),
          }}
        />
      ))}
      {(["e","w"] as const).map((c) => (
        <div
          key={c}
          onPointerDown={(e) => onResizeStart(e, c)}
          className="absolute bg-white border-2 border-brand rounded-sm shadow"
          style={{
            width: 8, height: 22, top: "50%", marginTop: -11,
            left: c === "w" ? -4 : undefined, right: c === "e" ? -4 : undefined,
            cursor: cornerCursor(c),
          }}
        />
      ))}
      {/* Rotation handle */}
      <div
        onPointerDown={onRotateStart}
        title="Drag to rotate (hold Shift to snap 15°)"
        className="absolute grid place-items-center bg-white border-2 border-brand rounded-full shadow text-brand"
        style={{ width: 24, height: 24, left: "50%", marginLeft: -12, top: -40, cursor: "grab" }}
      >
        <RotateCw className="size-3" />
      </div>
      <div className="absolute pointer-events-none bg-brand" style={{ width: 1, left: "50%", marginLeft: -0.5, top: -28, height: 20 }} />
    </>
  ) : null;

  if (el.type === "text") {
    const sharedTextStyle: React.CSSProperties = {
      color: el.color, fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight,
      textAlign: el.align, background: el.background, padding: 8,
      lineHeight: el.lineHeight ?? 1.15,
      letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
      fontStyle: el.italic ? "italic" : undefined,
      textTransform: el.textTransform === "none" ? undefined : el.textTransform,
      textShadow: el.shadow,
      WebkitTextStroke: el.stroke ? `${el.strokeWidth ?? 6}px ${el.stroke}` : undefined,
      width: "100%",
      overflow: "hidden",
    };
    const vJustify = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
    return (
      <div
        onPointerDown={editing ? (e) => e.stopPropagation() : onPointerDown}
        onDoubleClick={onDoubleClick}
        style={{ ...baseStyle, display: "flex", alignItems: vJustify, justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center", overflow: "hidden" }}
      >
        {editing ? (
          <textarea
            autoFocus
            value={el.text}
            onChange={(e) => onTextChange(e.target.value)}
            onBlur={onEndEdit}
            onKeyDown={(e) => { if (e.key === "Escape") onEndEdit(); }}
            style={{ ...sharedTextStyle, width: "100%", height: "100%", background: "transparent", border: "1px dashed #FF0033", outline: "none", resize: "none" }}
          />
        ) : (
          <div style={sharedTextStyle}>{renderText(el.text, previewVars)}</div>
        )}
        {handles}
      </div>
    );
  }
  if (el.type === "shape") {
    const clip =
      el.shape === "triangle" ? "polygon(50% 0%, 100% 100%, 0% 100%)" :
      el.shape === "star" ? "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" :
      undefined;
    if (el.shape === "line") {
      return (
        <div onPointerDown={onPointerDown} style={{ ...baseStyle, display: "grid", alignItems: "center" }}>
          <div style={{ width: "100%", height: el.strokeWidth ?? 6, background: el.fill, opacity: el.fillOpacity ?? 1 }} />
          {handles}
        </div>
      );
    }
    return (
      <div
        onPointerDown={onPointerDown}
        style={{
          ...baseStyle,
          background: el.fill,
          opacity: (el.opacity ?? 1) * (el.fillOpacity ?? 1),
          borderRadius: el.shape === "ellipse" ? "50%" : el.radius ?? 0,
          clipPath: clip,
          border: el.stroke && !clip ? `${el.strokeWidth ?? 4}px solid ${el.stroke}` : undefined,
        }}
      >
        {handles}
      </div>
    );
  }
  if (el.type === "image") {
    return (
      <div onPointerDown={onPointerDown} style={baseStyle}>
        <img draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit, pointerEvents: "none" }} src={el.src.startsWith("{{") ? "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080" : el.src} alt="" />
        {handles}
      </div>
    );
  }
  // video
  return (
    <div onPointerDown={onPointerDown} style={baseStyle}>
      {el.src && !el.src.startsWith("{{") ? (
        <video draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit, pointerEvents: "none", background: "#000" }} src={el.src} muted={el.muted ?? true} loop={el.loop ?? true} autoPlay={el.autoplay ?? true} playsInline />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "#111", color: "#666", fontSize: 14 }}>Video · {el.src || "no source"}</div>
      )}
      {handles}
    </div>
  );
}

function LeftPanel({ panel, doc, onAddText, onAddShape, onAddImagePlaceholder, onAddImageFromUrl, onAddVideoFromUrl, onUploadFile, onAddVariable, scene, selectedId, setSelectedId, deleteElement }: {
  panel: Panel; doc: EditorDocument;
  onAddText: () => void;
  onAddShape: (s: "rect" | "ellipse") => void;
  onAddImagePlaceholder: () => void;
  onAddImageFromUrl: (url: string) => void;
  onAddVideoFromUrl: (url: string) => void;
  onUploadFile: (file: File) => void;
  onAddVariable: (name: string) => void;
  scene: EditorScene; selectedId: string | null; setSelectedId: (id: string) => void; deleteElement: (id: string) => void;
}) {
  if (panel === "layers") {
    return (
      <div className="p-3">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">Layers</div>
        {scene.elements.length === 0 && <div className="text-xs text-zinc-500">No layers yet.</div>}
        <ul className="space-y-1">
          {[...scene.elements].reverse().map((el) => (
            <li key={el.id} className={`flex items-center justify-between p-2 rounded-md text-sm ${selectedId===el.id?"bg-brand/10 text-brand":"hover:bg-white/5"}`}>
              <button onClick={() => setSelectedId(el.id)} className="flex items-center gap-2 flex-1 text-left truncate">
                {el.type === "text" ? <Type className="size-3.5" /> : el.type === "shape" ? <Square className="size-3.5" /> : el.type === "video" ? <Film className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                <span className="truncate">{el.type === "text" ? el.text : el.type}</span>
              </button>
              <button onClick={() => deleteElement(el.id)} className="p-1 text-zinc-500 hover:text-brand"><Trash2 className="size-3" /></button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (panel === "variables") {
    const vars = Array.from(new Set([...doc.variables, "headline","subheadline","quote","author","question","option_a","option_b","answer","title","cta","date","day_count"]));
    return (
      <div className="p-3">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">Variables</div>
        <p className="text-xs text-zinc-500 mb-3">Click to drop a bound text element. It will fill from CSV/JSON.</p>
        <div className="grid grid-cols-2 gap-2">
          {vars.map((v) => (
            <button key={v} onClick={() => onAddVariable(v)} className="px-2 py-2 rounded-md border border-border text-left text-xs font-mono hover:border-brand/50 hover:bg-white/5">
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (panel === "text") {
    return (
      <div className="p-3 space-y-2">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Text</div>
        <button onClick={onAddText} className="w-full p-3 rounded-lg bg-white/5 border border-border hover:border-brand/50 text-left">
          <div className="font-display text-2xl font-extrabold">Heading</div>
          <div className="text-[10px] text-zinc-500 mt-1">Click to add</div>
        </button>
      </div>
    );
  }
  if (panel === "shapes") {
    return (
      <div className="p-3 space-y-2">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Shapes</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onAddShape("rect")} className="aspect-square rounded-lg bg-white/5 border border-border hover:border-brand/50 grid place-items-center"><div className="size-12 bg-brand rounded-md" /></button>
          <button onClick={() => onAddShape("ellipse")} className="aspect-square rounded-lg bg-white/5 border border-border hover:border-brand/50 grid place-items-center"><div className="size-12 bg-brand rounded-full" /></button>
        </div>
      </div>
    );
  }
  // elements
  return (
    <div className="p-3 space-y-2">
      <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Quick add</div>
      <button onClick={onAddText} className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50"><Type className="size-4 text-brand" /><span className="text-sm font-semibold">Text</span></button>
      <button onClick={() => onAddShape("rect")} className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50"><Square className="size-4 text-brand" /><span className="text-sm font-semibold">Rectangle</span></button>
      <button onClick={() => onAddShape("ellipse")} className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50"><Circle className="size-4 text-brand" /><span className="text-sm font-semibold">Ellipse</span></button>
      <button onClick={onAddImagePlaceholder} className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50"><ImageIcon className="size-4 text-brand" /><span className="text-sm font-semibold">Background image (variable)</span></button>
      <div className="pt-2 border-t border-border" />
      <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-1">Media</div>
      <label className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed border-border hover:border-brand/50 cursor-pointer">
        <Upload className="size-4 text-brand" />
        <span className="text-sm font-semibold">Upload image / video</span>
        <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile(f); e.currentTarget.value = ""; }} />
      </label>
      <button
        onClick={() => { const u = prompt("Image URL"); if (u) onAddImageFromUrl(u); }}
        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50"
      ><ImageIcon className="size-4 text-brand" /><span className="text-sm font-semibold">Image from URL</span></button>
      <button
        onClick={() => { const u = prompt("Video URL (mp4/webm)"); if (u) onAddVideoFromUrl(u); }}
        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50"
      ><Film className="size-4 text-brand" /><span className="text-sm font-semibold">Video from URL</span></button>
      <button
        onClick={() => onAddVideoFromUrl("{{background}}")}
        className="w-full flex items-center gap-3 p-3 rounded-lg border border-brand/40 bg-brand/5 hover:bg-brand/10"
      ><Film className="size-4 text-brand" /><span className="text-sm font-semibold">Background video (variable)</span></button>
    </div>
  );
}

function RightPanel({ selected, update, scene, updateScene, onDuplicate, onDelete, onLayerUp, onLayerDown, onToggleLock }: {
  selected: EditorElement | null;
  update: (patch: Partial<EditorElement>) => void;
  scene: EditorScene;
  updateScene: (mut: (s: EditorScene) => EditorScene) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayerUp: () => void;
  onLayerDown: () => void;
  onToggleLock: () => void;
}) {
  if (!selected) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Scene</div>
        <Row label="Background">
          <input type="color" value={scene.background} onChange={(e) => updateScene((s) => ({ ...s, background: e.target.value }))} className="w-full h-8 rounded-md bg-transparent border border-border" />
        </Row>
        <Row label="Duration (ms)">
          <input type="number" value={scene.durationMs} onChange={(e) => updateScene((s) => ({ ...s, durationMs: Number(e.target.value) }))} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" />
        </Row>
        <p className="text-xs text-zinc-500">Select an element to edit its properties.</p>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">{selected.type}</div>
        <div className="flex items-center gap-1">
          <button title="Bring forward" onClick={onLayerUp} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400"><ArrowUp className="size-3.5" /></button>
          <button title="Send backward" onClick={onLayerDown} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400"><ArrowDown className="size-3.5" /></button>
          <button title="Duplicate (⌘D)" onClick={onDuplicate} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400"><Copy className="size-3.5" /></button>
          <button title={selected.locked ? "Unlock" : "Lock"} onClick={onToggleLock} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400">{selected.locked ? <Lock className="size-3.5 text-brand" /> : <Unlock className="size-3.5" />}</button>
          <button title="Delete (⌫)" onClick={onDelete} className="size-7 grid place-items-center rounded-md hover:bg-brand/10 text-brand"><Trash2 className="size-3.5" /></button>
        </div>
      </div>
      {selected.type === "text" && (
        <>
          <Row label="Content">
            <textarea value={(selected as TextElement).text} onChange={(e) => update({ text: e.target.value } as Partial<TextElement>)} rows={3} className="w-full px-2 py-1.5 rounded-md bg-zinc-950 border border-border text-sm font-mono" />
          </Row>
          <Row label="Font">
            <select value={(selected as TextElement).fontFamily} onChange={(e) => update({ fontFamily: e.target.value } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm">
              {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Size"><input type="number" value={(selected as TextElement).fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
            <Row label="Weight"><input type="number" step={100} min={100} max={900} value={(selected as TextElement).fontWeight} onChange={(e) => update({ fontWeight: Number(e.target.value) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
          <Row label="Color"><input type="color" value={(selected as TextElement).color} onChange={(e) => update({ color: e.target.value } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" /></Row>
          <Row label="Background"><input type="text" placeholder="transparent or #000" value={(selected as TextElement).background ?? ""} onChange={(e) => update({ background: e.target.value || undefined } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm font-mono" /></Row>
          <Row label="Align">
            <div className="grid grid-cols-3 gap-1">
              {(["left","center","right"] as const).map((a) => (
                <button key={a} onClick={() => update({ align: a } as Partial<TextElement>)} className={`h-8 rounded-md text-xs border ${(selected as TextElement).align===a?"border-brand text-brand":"border-border text-zinc-400"}`}>{a}</button>
              ))}
            </div>
          </Row>
        </>
      )}
      {selected.type === "shape" && (
        <>
          <Row label="Fill"><input type="color" value={(selected as ShapeElement).fill} onChange={(e) => update({ fill: e.target.value } as Partial<ShapeElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" /></Row>
          {(selected as ShapeElement).shape === "rect" && (
            <Row label="Radius"><input type="number" value={(selected as ShapeElement).radius ?? 0} onChange={(e) => update({ radius: Number(e.target.value) } as Partial<ShapeElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          )}
        </>
      )}
      {selected.type === "image" && (
        <>
          <Row label="Source / variable"><input value={(selected as ImageElement).src} onChange={(e) => update({ src: e.target.value } as Partial<ImageElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm font-mono" /></Row>
          <Row label="Fit">
            <div className="grid grid-cols-2 gap-1">
              {(["cover","contain"] as const).map((f) => (
                <button key={f} onClick={() => update({ fit: f } as Partial<ImageElement>)} className={`h-8 rounded-md text-xs border ${(selected as ImageElement).fit===f?"border-brand text-brand":"border-border text-zinc-400"}`}>{f}</button>
              ))}
            </div>
          </Row>
        </>
      )}
      {selected.type === "video" && (
        <>
          <Row label="Source / variable"><input value={(selected as VideoElement).src} onChange={(e) => update({ src: e.target.value } as Partial<VideoElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm font-mono" /></Row>
          <Row label="Fit">
            <div className="grid grid-cols-2 gap-1">
              {(["cover","contain"] as const).map((f) => (
                <button key={f} onClick={() => update({ fit: f } as Partial<VideoElement>)} className={`h-8 rounded-md text-xs border ${(selected as VideoElement).fit===f?"border-brand text-brand":"border-border text-zinc-400"}`}>{f}</button>
              ))}
            </div>
          </Row>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={(selected as VideoElement).muted ?? true} onChange={(e) => update({ muted: e.target.checked } as Partial<VideoElement>)} /> Muted</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={(selected as VideoElement).loop ?? true} onChange={(e) => update({ loop: e.target.checked } as Partial<VideoElement>)} /> Loop</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={(selected as VideoElement).autoplay ?? true} onChange={(e) => update({ autoplay: e.target.checked } as Partial<VideoElement>)} /> Auto</label>
          </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Row label="X"><input type="number" value={Math.round(selected.x)} onChange={(e) => update({ x: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
        <Row label="Y"><input type="number" value={Math.round(selected.y)} onChange={(e) => update({ y: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
        <Row label="W"><input type="number" value={Math.round(selected.w)} onChange={(e) => update({ w: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
        <Row label="H"><input type="number" value={Math.round(selected.h)} onChange={(e) => update({ h: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
      </div>
      <Row label="Rotation"><input type="range" min={-180} max={180} value={selected.rotation} onChange={(e) => update({ rotation: Number(e.target.value) })} className="w-full" /></Row>
      <Row label="Opacity"><input type="range" min={0} max={1} step={0.05} value={selected.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} className="w-full" /></Row>
      <AnimatePanel selected={selected} update={update} scene={scene} updateScene={updateScene} />
    </div>
  );
}

const IN_OPTIONS: InAnim[] = ["none","fade","slideUp","slideDown","slideLeft","slideRight","scale","pop","blur"];
const OUT_OPTIONS: OutAnim[] = ["none","fade","slideUp","slideDown","slideLeft","slideRight","scale","pop","blur"];
const LOOP_OPTIONS: LoopAnim[] = ["none","float","pulse","shake","kenburns"];
const REVEAL_OPTIONS: TextReveal[] = ["none","typewriter","wordByWord","charStagger"];
const CAMERA_OPTIONS: CameraMove[] = ["none","zoomIn","zoomOut","panLeft","panRight"];

function AnimatePanel({ selected, update, scene, updateScene }: {
  selected: EditorElement;
  update: (patch: Partial<EditorElement>) => void;
  scene: EditorScene;
  updateScene: (mut: (s: EditorScene) => EditorScene) => void;
}) {
  const anim: AnimationSpec = selected.animations ?? {};
  const setAnim = (patch: Partial<AnimationSpec>) => update({ animations: { ...anim, ...patch } } as Partial<EditorElement>);
  return (
    <div className="pt-3 mt-2 border-t border-border space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
        <span className="inline-block size-1.5 rounded-full bg-brand" /> Animation
      </div>
      <Row label="Entrance">
        <select
          value={anim.in?.type ?? "none"}
          onChange={(e) => setAnim({ in: { ...(anim.in ?? {}), type: e.target.value as InAnim, durationMs: anim.in?.durationMs ?? 500 } })}
          className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
        >
          {IN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Row>
      {anim.in && anim.in.type !== "none" && (
        <div className="grid grid-cols-2 gap-2">
          <Row label="Delay (ms)">
            <input type="number" value={anim.in.delayMs ?? 0} onChange={(e) => setAnim({ in: { ...anim.in!, delayMs: Number(e.target.value) } })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" />
          </Row>
          <Row label="Duration (ms)">
            <input type="number" value={anim.in.durationMs ?? 500} onChange={(e) => setAnim({ in: { ...anim.in!, durationMs: Number(e.target.value) } })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" />
          </Row>
        </div>
      )}
      <Row label="Exit">
        <select
          value={anim.out?.type ?? "none"}
          onChange={(e) => setAnim({ out: { ...(anim.out ?? {}), type: e.target.value as OutAnim, durationMs: anim.out?.durationMs ?? 400 } })}
          className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
        >
          {OUT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Row>
      <Row label="Loop effect">
        <select
          value={anim.loop?.type ?? "none"}
          onChange={(e) => setAnim({ loop: { ...(anim.loop ?? {}), type: e.target.value as LoopAnim, speedMs: anim.loop?.speedMs ?? 2000, amplitude: 1 } })}
          className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
        >
          {LOOP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Row>
      {selected.type === "text" && (
        <Row label="Text reveal">
          <select
            value={(selected as TextElement).reveal ?? "none"}
            onChange={(e) => update({ reveal: e.target.value as TextReveal } as Partial<TextElement>)}
            className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
          >
            {REVEAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Row>
      )}
      <div className="pt-3 mt-1 border-t border-border">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Scene camera</div>
        <Row label="Camera move">
          <select
            value={scene.cameraMove ?? "none"}
            onChange={(e) => updateScene((s) => ({ ...s, cameraMove: e.target.value as CameraMove }))}
            className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
          >
            {CAMERA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5">{label}</div>
      {children}
    </label>
  );
}