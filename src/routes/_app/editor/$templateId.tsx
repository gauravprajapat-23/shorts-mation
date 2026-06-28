import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CANVAS_DIMS, blankDocument, renderText, uid } from "@/lib/editor-defaults";
import type { EditorDocument, EditorElement, EditorScene, TextElement, ShapeElement, ImageElement } from "@/lib/types";
import { ArrowLeft, Type, Image as ImageIcon, Square, Layers, Variable, Save, Undo2, Redo2, Plus, Trash2, Eye, Copy, Lock, Unlock, ArrowUp, ArrowDown, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/editor/$templateId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Editor — ShortsForge" }] }),
  component: EditorPage,
});

type Panel = "elements" | "text" | "shapes" | "variables" | "layers";

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

function Canvas({ doc, sceneIndex, previewVars, selectedId, setSelectedId, updateElement }: {
  doc: EditorDocument; sceneIndex: number; previewVars: Record<string, string>;
  selectedId: string | null; setSelectedId: (id: string | null) => void;
  updateElement: (id: string, mut: (e: EditorElement) => EditorElement) => void;
}) {
  const scene = doc.scenes[sceneIndex];
  const dims = CANVAS_DIMS[doc.aspect];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const calc = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const pad = 32;
      const sx = (wrap.clientWidth - pad) / dims.w;
      const sy = (wrap.clientHeight - pad) / dims.h;
      setScale(Math.min(sx, sy));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [dims.w, dims.h]);

  const startDrag = (e: React.PointerEvent, el: EditorElement) => {
    e.stopPropagation();
    setSelectedId(el.id);
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      updateElement(el.id, (cur) => ({ ...cur, x: start.ex + dx, y: start.ey + dy }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={wrapRef} className="w-full h-full grid place-items-center" onPointerDown={() => setSelectedId(null)}>
      <div
        className="relative shadow-2xl shadow-black/60 origin-center"
        style={{ width: dims.w, height: dims.h, transform: `scale(${scale})`, background: scene.background, outline: "1px solid #262626" }}
      >
        {scene.elements.map((el) => (
          <ElementView key={el.id} el={el} selected={el.id === selectedId} onPointerDown={(e) => startDrag(e, el)} previewVars={previewVars} />
        ))}
      </div>
    </div>
  );
}

function ElementView({ el, selected, onPointerDown, previewVars }: { el: EditorElement; selected: boolean; onPointerDown: (e: React.PointerEvent) => void; previewVars: Record<string, string> }) {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: el.x, top: el.y, width: el.w, height: el.h,
    transform: `rotate(${el.rotation}deg)`, opacity: el.opacity,
    outline: selected ? "3px solid #FF0033" : "none",
    cursor: "move",
  };
  if (el.type === "text") {
    return (
      <div onPointerDown={onPointerDown} style={{ ...baseStyle, display: "flex", alignItems: "center", justifyContent: el.align === "left" ? "flex-start" : el.align === "right" ? "flex-end" : "center", color: el.color, fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight, textAlign: el.align, background: el.background, padding: 8, lineHeight: 1.1, textShadow: el.shadow, WebkitTextStroke: el.stroke }}>
        {renderText(el.text, previewVars)}
      </div>
    );
  }
  if (el.type === "shape") {
    return <div onPointerDown={onPointerDown} style={{ ...baseStyle, background: el.fill, borderRadius: el.shape === "ellipse" ? "50%" : el.radius ?? 0 }} />;
  }
  return <img onPointerDown={onPointerDown} draggable={false} style={{ ...baseStyle, objectFit: el.fit }} src={el.src.startsWith("{{") ? "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080" : el.src} alt="" />;
}

function LeftPanel({ panel, doc, onAddText, onAddShape, onAddImagePlaceholder, onAddVariable, scene, selectedId, setSelectedId, deleteElement }: {
  panel: Panel; doc: EditorDocument;
  onAddText: () => void; onAddShape: (s: "rect" | "ellipse") => void; onAddImagePlaceholder: () => void; onAddVariable: (name: string) => void;
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
                {el.type === "text" ? <Type className="size-3.5" /> : el.type === "shape" ? <Square className="size-3.5" /> : <ImageIcon className="size-3.5" />}
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
      <button onClick={onAddImagePlaceholder} className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-brand/50"><ImageIcon className="size-4 text-brand" /><span className="text-sm font-semibold">Background image</span></button>
    </div>
  );
}

function RightPanel({ selected, update, scene, updateScene }: {
  selected: EditorElement | null;
  update: (patch: Partial<EditorElement>) => void;
  scene: EditorScene;
  updateScene: (mut: (s: EditorScene) => EditorScene) => void;
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
      <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">{selected.type} properties</div>
      {selected.type === "text" && (
        <>
          <Row label="Content">
            <textarea value={(selected as TextElement).text} onChange={(e) => update({ text: e.target.value } as Partial<TextElement>)} rows={3} className="w-full px-2 py-1.5 rounded-md bg-zinc-950 border border-border text-sm font-mono" />
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Size"><input type="number" value={(selected as TextElement).fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
            <Row label="Weight"><input type="number" step={100} min={100} max={900} value={(selected as TextElement).fontWeight} onChange={(e) => update({ fontWeight: Number(e.target.value) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
          <Row label="Color"><input type="color" value={(selected as TextElement).color} onChange={(e) => update({ color: e.target.value } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" /></Row>
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
        <Row label="Source / variable"><input value={(selected as ImageElement).src} onChange={(e) => update({ src: e.target.value } as Partial<ImageElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm font-mono" /></Row>
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