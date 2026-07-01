import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CANVAS_DIMS, blankDocument, renderText, uid } from "@/lib/editor-defaults";
import type { EditorDocument, EditorElement, EditorScene, TextElement, ShapeElement, ImageElement, VideoElement } from "@/lib/types";
import { ArrowLeft, Type, Image as ImageIcon, Square, Layers, Variable, Save, Undo2, Redo2, Plus, Trash2, Eye, Copy, Lock, Unlock, ArrowUp, ArrowDown, ZoomIn, ZoomOut, Maximize, Film, Upload, Circle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/editor/$templateId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Editor — ShortsForge" }] }),
  component: EditorPage,
});

type Panel = "elements" | "text" | "shapes" | "variables" | "layers";

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
          <button className="px-3 py-1.5 rounded-md text-sm font-semibold border border-border hover:bg-white/5 inline-flex items-center gap-1.5"><Eye className="size-3.5" /> Preview</button>
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
            onAddVariable={(name) => addElement({
              id: uid("text"), type: "text", text: `{{${name}}}`, x: dims.w/2 - 200, y: dims.h/2 - 40, w: 400, h: 80,
              rotation: 0, opacity: 1, fontFamily: "Plus Jakarta Sans", fontSize: 64, fontWeight: 800, color: "#FFFFFF", align: "center",
            } as TextElement)}
            onAddShape={(shape) => addElement({
              id: uid("shape"), type: "shape", shape, x: dims.w/2 - 150, y: dims.h/2 - 150, w: 300, h: 300,
              rotation: 0, opacity: 1, fill: "#FF0033", radius: shape === "rect" ? 24 : 0,
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
        <div className="flex-1 grid place-items-center overflow-auto bg-[radial-gradient(circle_at_center,#1a1a1a,#0a0a0a)] p-8">
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
  const [guides, setGuides] = useState<{ v?: number; h?: number }>({});
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const startDrag = (e: React.PointerEvent, el: EditorElement) => {
    if (el.locked) { setSelectedId(el.id); return; }
    e.stopPropagation();
    setSelectedId(el.id);
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      let nx = start.ex + dx;
      let ny = start.ey + dy;
      const cx = nx + el.w / 2;
      const cy = ny + el.h / 2;
      const next: { v?: number; h?: number } = {};
      const snap = 8 / scale;
      if (Math.abs(cx - dims.w / 2) < snap) { nx = dims.w / 2 - el.w / 2; next.v = dims.w / 2; }
      if (Math.abs(cy - dims.h / 2) < snap) { ny = dims.h / 2 - el.h / 2; next.h = dims.h / 2; }
      setGuides(next);
      updateElement(el.id, (cur) => ({ ...cur, x: nx, y: ny }));
    };
    const up = () => {
      setGuides({});
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e: React.PointerEvent, el: EditorElement, corner: "nw" | "ne" | "sw" | "se") => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(el.id);
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y, ew: el.w, eh: el.h };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      let { ex, ey, ew, eh } = start;
      if (corner === "se") { ew = Math.max(20, start.ew + dx); eh = Math.max(20, start.eh + dy); }
      if (corner === "sw") { ex = start.ex + dx; ew = Math.max(20, start.ew - dx); eh = Math.max(20, start.eh + dy); }
      if (corner === "ne") { ey = start.ey + dy; ew = Math.max(20, start.ew + dx); eh = Math.max(20, start.eh - dy); }
      if (corner === "nw") { ex = start.ex + dx; ey = start.ey + dy; ew = Math.max(20, start.ew - dx); eh = Math.max(20, start.eh - dy); }
      updateElement(el.id, (cur) => ({ ...cur, x: ex, y: ey, w: ew, h: eh }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={wrapRef} className="w-full h-full relative grid place-items-center" onPointerDown={() => { setSelectedId(null); setEditingId(null); }}>
      <div
        className="relative shadow-2xl shadow-black/60 origin-center"
        style={{ width: dims.w, height: dims.h, transform: `scale(${scale})`, background: scene.background, outline: "1px solid #262626" }}
      >
        {scene.elements.map((el) => (
          <ElementView
            key={el.id} el={el} selected={el.id === selectedId}
            editing={editingId === el.id}
            onPointerDown={(e) => startDrag(e, el)}
            onDoubleClick={() => { if (el.type === "text" && !el.locked) setEditingId(el.id); }}
            onTextChange={(text) => updateElement(el.id, (cur) => cur.type === "text" ? { ...cur, text } : cur)}
            onEndEdit={() => setEditingId(null)}
            onResizeStart={(e, corner) => startResize(e, el, corner)}
            previewVars={previewVars}
          />
        ))}
        {guides.v != null && <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: guides.v, width: 1, background: "#FF0033" }} />}
        {guides.h != null && <div className="absolute left-0 right-0 pointer-events-none" style={{ top: guides.h, height: 1, background: "#FF0033" }} />}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-panel border border-border rounded-md px-1 py-1 text-xs">
        <button title="Zoom out" onClick={(e) => { e.stopPropagation(); setZoom(Math.max(0.1, (typeof scale === "number" ? scale : fitScale) - 0.1)); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomOut className="size-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="px-2 h-7 hover:bg-white/5 rounded font-mono tabular-nums text-zinc-400">{Math.round(scale * 100)}%</button>
        <button title="Zoom in" onClick={(e) => { e.stopPropagation(); setZoom(Math.min(2, (typeof scale === "number" ? scale : fitScale) + 0.1)); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomIn className="size-3.5" /></button>
        <button title="Fit" onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><Maximize className="size-3.5" /></button>
      </div>
    </div>
  );
}

function ElementView({ el, selected, editing, onPointerDown, onDoubleClick, onTextChange, onEndEdit, onResizeStart, previewVars }: {
  el: EditorElement; selected: boolean; editing: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onTextChange: (text: string) => void;
  onEndEdit: () => void;
  onResizeStart: (e: React.PointerEvent, corner: "nw" | "ne" | "sw" | "se") => void;
  previewVars: Record<string, string>;
}) {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    transform: `rotate(${el.rotation}deg)`, opacity: el.opacity,
    outline: selected ? "3px solid #FF0033" : "none",
    cursor: el.locked ? "not-allowed" : "move",
  };
  const handles = selected && !el.locked ? (
    <>
      {(["nw","ne","sw","se"] as const).map((c) => (
        <div
          key={c}
          onPointerDown={(e) => onResizeStart(e, c)}
          className="absolute bg-brand border-2 border-white rounded-sm"
          style={{
            width: 16, height: 16,
            left: c.includes("w") ? -8 : undefined, right: c.includes("e") ? -8 : undefined,
            top: c.includes("n") ? -8 : undefined, bottom: c.includes("s") ? -8 : undefined,
            cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
          }}
        />
      ))}
    </>
  ) : null;

  if (el.type === "text") {
    const sharedTextStyle: React.CSSProperties = {
      color: el.color, fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight,
      textAlign: el.align, background: el.background, padding: 8, lineHeight: 1.1,
      textShadow: el.shadow, WebkitTextStroke: el.stroke,
    };
    return (
      <div
        onPointerDown={editing ? (e) => e.stopPropagation() : onPointerDown}
        onDoubleClick={onDoubleClick}
        style={{ ...baseStyle, display: "flex", alignItems: "center", justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center" }}
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
    return (
      <div onPointerDown={onPointerDown} style={{ ...baseStyle, background: el.fill, borderRadius: el.shape === "ellipse" ? "50%" : el.radius ?? 0 }}>
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