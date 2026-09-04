import { useEffect, useRef, useState, useMemo } from "react";
import type React from "react";
import type { EditorDocument, EditorDocumentV2, EditorElement, EditorScene, EditorAudioClip, AudioClipRole, EditorCaptionClip, CaptionPresetId, EditorEffectClip, EffectKind, MediaFilterPreset, TextElement, ShapeElement, ImageElement, VideoElement, AnimationSpec, InAnim, OutAnim, LoopAnim, TextReveal, CameraMove, SceneTransition, EaseName, ElementKeyframe, KeyframeProperty, BrandKit, EditorReusableComponent, AutomationVariableDefinition, AutomationVariableType, VisibilityOperator, RetentionPresetId, SceneRole } from "@/lib/types";
import { Type, Image as ImageIcon, Square, Variable, Plus, Trash2, Copy, Lock, Unlock, ArrowUp, ArrowDown, ZoomIn, ZoomOut, Maximize, Film, Upload, Circle, RotateCw, Music, Mic2, Volume2, Captions, Sparkles, Scissors, Eye, EyeOff, Search } from "lucide-react";
import { CANVAS_DIMS, renderText, uid } from "@/lib/editor-defaults";
import { buildSceneSvgAtTime } from "@/lib/scene-svg";
import type { ElementFrame } from "@/lib/animate";
import { evaluateTimelineFrame, evaluateTimelineAudio, timelineDurationMs, type TimelineVideoState, type TimelineCaptionState } from "@/lib/timeline-engine";
import { sceneStartMs } from "@/lib/editor-document-v2";
import { CAPTION_PRESETS, captionPreset, retimeCaptionWords, wordsFromText } from "@/lib/captions";
import { cssTextShadows, gradientCss, layoutText } from "@/lib/text-design";
import { cssFilterForLook, resolveMediaLook } from "@/lib/effects";
import { MOTION_PRESETS, applyMotionPreset, defaultKeyframeValues, type MotionPresetId } from "@/lib/keyframes";
import { builtInBrandComponents, normalizeBrandKit } from "@/lib/brand-components";
import { automationDefinitions, materializeAutomationDocument } from "@/lib/automation-variables";
import { analyzeRetention, normalizeRetention } from "@/lib/retention";
import { selectionBounds } from "@/lib/editor-professional";

type Panel = "elements" | "text" | "shapes" | "captions" | "audio" | "effects" | "retention" | "brand" | "components" | "variables" | "layers";
type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const shortcutMod = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "Ctrl" : "⌘";

const FONT_FAMILIES = ["Plus Jakarta Sans", "Inter", "Georgia", "Times New Roman", "Courier New", "Impact", "Arial", "Helvetica"];
const SHADOW_PRESETS: Array<{ label: string; value: string | undefined }> = [
  { label: "None", value: undefined },
  { label: "Soft", value: "0 4px 18px rgba(0,0,0,0.45)" },
  { label: "Hard", value: "0 6px 0 rgba(0,0,0,0.85)" },
  { label: "Glow", value: "0 0 24px rgba(255,0,51,0.85)" },
];
const TEXT_PRESETS: Array<{ label: string; hint: string; preview: React.CSSProperties; patch: Partial<TextElement> }> = [
  { label: "BIG IMPACT TITLE", hint: "heavy, uppercase, hard shadow", preview: { fontSize: 20, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase" }, patch: { text: "{{headline}}", fontSize: 110, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, lineHeight: 1.05, shadow: "0 6px 0 rgba(0,0,0,0.85)", h: 320 } },
  { label: "Outlined headline", hint: "stroke outline for busy footage", preview: { fontSize: 20, fontWeight: 800, WebkitTextStroke: "1px #FF0033" }, patch: { text: "{{headline}}", fontSize: 96, fontWeight: 800, stroke: "#000000", strokeWidth: 10, h: 300 } },
  { label: "Quote — serif italic", hint: "motivation / quote slides", preview: { fontSize: 18, fontFamily: "Georgia", fontStyle: "italic" }, patch: { text: "“{{quote}}”", fontFamily: "Georgia", italic: true, fontSize: 76, fontWeight: 500, lineHeight: 1.3, h: 400 } },
  { label: "Subtitle caption", hint: "small supporting line", preview: { fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.8 }, patch: { text: "{{subheadline}}", fontSize: 44, fontWeight: 600, letterSpacing: 6, textTransform: "uppercase", opacity: 0.85, h: 120 } },
  { label: "Badge / label", hint: "pill background block", preview: { fontSize: 13, fontWeight: 800, background: "#FF0033", padding: "2px 8px", borderRadius: 999, display: "inline-block" }, patch: { text: "{{cta}}", fontSize: 48, fontWeight: 800, background: "#FF0033", backgroundRadius: 44, backgroundPaddingX: 28, backgroundPaddingY: 14, w: 620, h: 120 } },
  { label: "Viral Gradient", hint: "high-retention gradient headline", preview: { fontSize: 19, fontWeight: 900, backgroundImage: "linear-gradient(90deg,#FFD43B,#FF3D8D)", color: "transparent", backgroundClip: "text" }, patch: { text: "{{headline}}", fontSize: 108, minFontSize: 44, maxLines: 3, autoFit: true, fontWeight: 900, textTransform: "uppercase", textGradient: { from: "#FFD43B", to: "#FF3D8D", angle: 90 }, stroke: "#111111", strokeWidth: 5, glow: { color: "#FF3D8D", blur: 20, intensity: 2 }, h: 330 } },
  { label: "Gaming Neon", hint: "neon glow + dark glass card", preview: { fontSize: 17, fontWeight: 900, color: "#7CFF5B", textShadow: "0 0 10px #7CFF5B" }, patch: { text: "{{headline}}", fontSize: 92, minFontSize: 40, maxLines: 3, autoFit: true, fontWeight: 900, color: "#7CFF5B", stroke: "#071007", strokeWidth: 7, glow: { color: "#7CFF5B", blur: 24, intensity: 2 }, background: "#05090DDD", backgroundRadius: 30, backgroundPaddingX: 30, backgroundPaddingY: 22, backgroundBorderColor: "#7CFF5B", backgroundBorderWidth: 2, h: 320 } },
  { label: "Documentary Card", hint: "clean editorial title card", preview: { fontSize: 15, fontWeight: 700, background: "#F5F1E8", color: "#111", padding: "3px 6px" }, patch: { text: "{{headline}}", fontFamily: "Georgia", fontSize: 74, minFontSize: 34, maxLines: 4, autoFit: true, fontWeight: 700, color: "#171717", backgroundGradient: { from: "#FFF9EC", to: "#EDE2CE", angle: 135 }, backgroundRadius: 10, backgroundPaddingX: 34, backgroundPaddingY: 28, h: 360 } },
];

export function PreviewModal({ doc, vars, setVars, onClose }: { doc: EditorDocument; vars: Record<string, string>; setVars: (fn: (p: Record<string, string>) => Record<string, string>) => void; onClose: () => void }) {
  const materialized = useMemo(() => materializeAutomationDocument(doc, vars), [doc, vars]);
  const previewDoc = materialized.document;
  const totalMs = Math.max(1000, timelineDurationMs(previewDoc));
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
  const previewFrame = useMemo(() => evaluateTimelineFrame(previewDoc, tMs, {}), [previewDoc, tMs]);
  const svg = useMemo(() => buildSceneSvgAtTime({ doc: previewDoc, tMs, vars: {}, includeBackground: false }), [previewDoc, tMs]);
  const dataUrl = useMemo(() => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, [svg]);
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-6" onClick={onClose}>
      <div className="relative bg-panel border border-border rounded-2xl p-4 max-w-[90vw] max-h-[90vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Animated preview <span className="text-zinc-500 font-normal">· {doc.aspect} · {(totalMs/1000).toFixed(1)}s</span></div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-white/5">Close</button>
        </div>
        <div className={`${doc.aspect === "9:16" ? "aspect-[9/16] h-[70vh]" : doc.aspect === "16:9" ? "aspect-video w-[75vw] max-w-4xl" : "aspect-square h-[70vh]"} bg-black rounded-lg overflow-hidden relative`} style={{ background: previewFrame.scene?.background ?? "#000" }}>
          <div className="absolute inset-0" style={{ transformOrigin: "center center", transform: `translate(${previewFrame.camera.tx / CANVAS_DIMS[doc.aspect].w * 100}%, ${previewFrame.camera.ty / CANVAS_DIMS[doc.aspect].h * 100}%) scale(${previewFrame.camera.scale})` }}>
            {previewFrame.visibleElements.filter((item) => item.element.type === "video").map((item) => {
              const video = item.element as VideoElement;
              const dims = CANVAS_DIMS[doc.aspect];
              return (
                <div key={video.id} className="absolute overflow-hidden" style={{
                  left: `${(item.frame.x / dims.w) * 100}%`, top: `${(item.frame.y / dims.h) * 100}%`,
                  width: `${(video.w / dims.w) * 100}%`, height: `${(video.h / dims.h) * 100}%`,
                  opacity: item.frame.opacity, filter: item.frame.blurPx > 0.1 ? `blur(${item.frame.blurPx}px)` : undefined,
                  transform: `scale(${item.frame.scale}) rotate(${item.frame.rotation}deg)`, transformOrigin: "center center",
                }}>
                  <TimelineVideo element={video} state={item.video} localPlayheadMs={previewFrame.localMs} playing={playing} />
                  <MediaLookOverlay element={video} />
                </div>
              );
            })}
          </div>
          <img src={dataUrl} alt="preview" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
          <TimelineAudioPreview doc={previewDoc} tMs={tMs} playing={playing} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setPlaying((p) => !p); baseRef.current = tMs; startRef.current = performance.now(); }} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-brand text-white hover:bg-brand/90">
            {playing ? "Pause" : "Play"}
          </button>
          <input type="range" min={0} max={totalMs} step={10} value={tMs} onChange={(e) => { setPlaying(false); setTMs(Number(e.target.value)); baseRef.current = Number(e.target.value); }} className="flex-1" />
          <span className="font-mono text-[10px] text-zinc-500 w-16 text-right">{(tMs/1000).toFixed(2)}s</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {automationDefinitions(doc).slice(0, 8).map((def) => (
            <label key={def.id} className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-500 font-mono">{def.name}{def.required ? "*" : ""}</span>
              {def.type === "boolean" ? <select value={vars[def.name] ?? String(def.defaultValue ?? "false")} onChange={(e) => setVars((p) => ({ ...p, [def.name]: e.target.value }))} className="h-7 px-2 rounded-md bg-zinc-950 border border-border text-xs w-24"><option value="false">false</option><option value="true">true</option></select> : <input
                type={def.type === "color" ? "color" : def.type === "number" ? "number" : "text"}
                value={vars[def.name] ?? (def.defaultValue == null ? "" : typeof def.defaultValue === "string" ? def.defaultValue : JSON.stringify(def.defaultValue))}
                onChange={(e) => setVars((p) => ({ ...p, [def.name]: e.target.value }))}
                placeholder={def.type === "array" ? '[{"title":"Item 1"}]' : `sample ${def.name}`}
                className="h-7 px-2 rounded-md bg-zinc-950 border border-border text-xs w-36"
              />}
            </label>
          ))}
        </div>
        {materialized.errors.length > 0 ? <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[10px] text-red-300">{materialized.errors.map((err) => <div key={`${err.variable}-${err.message}`}>{err.variable}: {err.message}</div>)}</div> : null}
      </div>
    </div>
  );
}

export function Canvas({ doc, sceneIndex, previewVars, selectedId, selectedIds, onSelectElement, onClearSelection, updateElement, updateElements, zoom, setZoom, showSafeZones, showRulers, playheadMs, playing }: {
  doc: EditorDocumentV2; sceneIndex: number; previewVars: Record<string, string>;
  selectedId: string | null; selectedIds: string[];
  onSelectElement: (id: string, additive?: boolean) => void;
  onClearSelection: () => void;
  updateElement: (id: string, mut: (e: EditorElement) => EditorElement) => void;
  updateElements: (ids:string[],dx:number,dy:number)=>void;
  zoom: number | "fit"; setZoom: (z: number | "fit") => void;
  showSafeZones:boolean; showRulers:boolean;
  playheadMs: number;
  playing: boolean;
}) {
  const scene = doc.scenes[sceneIndex];
  const dims = CANVAS_DIMS[doc.aspect];

  // The full Preview has always materialized automation variables before it
  // evaluates a frame. The editor canvas must do exactly the same thing or
  // dynamic/repeated/conditional templates can appear completely empty until
  // the Preview modal is opened.
  const liveMaterialized = useMemo(() => materializeAutomationDocument(doc, previewVars), [doc, previewVars]);
  const liveDoc = liveMaterialized.document as EditorDocumentV2;
  const liveSceneIndex = useMemo(() => {
    if (!scene) return 0;
    const exact = liveDoc.scenes.findIndex((item) => item.id === scene.id);
    if (exact >= 0) return exact;
    // Repeated scenes are cloned from the source scene. Prefer the first clone
    // so selecting the source scene in the editor still has a real canvas.
    const repeated = liveDoc.scenes.findIndex((item) => item.id.startsWith(`${scene.id}__`) || item.id.startsWith(`${scene.id}-`));
    return repeated >= 0 ? repeated : Math.max(0, Math.min(liveDoc.scenes.length - 1, sceneIndex));
  }, [liveDoc, scene, sceneIndex]);
  const liveScene = liveDoc.scenes[liveSceneIndex] ?? scene;
  const sourceSceneStart = scene ? sceneStartMs(doc, sceneIndex) : 0;
  const sourceLocalMs = scene ? Math.max(0, playheadMs - sourceSceneStart) : 0;
  const liveSceneStart = liveDoc.scenes.length ? sceneStartMs(liveDoc, liveSceneIndex) : 0;
  const livePlayheadMs = liveScene
    ? liveSceneStart + Math.max(0, Math.min(Math.max(0, liveScene.durationMs - 1), sourceLocalMs))
    : Math.max(0, playheadMs);
  const timelineFrame = useMemo(() => evaluateTimelineFrame(liveDoc, livePlayheadMs, {}), [liveDoc, livePlayheadMs]);
  const localPlayheadMs = timelineFrame.localMs;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.3);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const calc = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const width = wrap.clientWidth;
        const height = wrap.clientHeight;
        if (width <= 1 || height <= 1) return;
        const pad = Math.min(32, Math.max(8, Math.min(width, height) * 0.04));
        const sx = Math.max(1, width - pad) / dims.w;
        const sy = Math.max(1, height - pad) / dims.h;
        const next = Math.max(0.05, Math.min(4, Math.min(sx, sy)));
        setFitScale(next);
      });
    };
    calc();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(calc) : null;
    observer?.observe(wrap);
    window.addEventListener("resize", calc);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", calc);
    };
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

  const zoomToSelection=()=>{
    const selected=(scene?.elements ?? []).filter(e=>selectedIds.includes(e.id));
    const b=selectionBounds(selected);
    const wrap=wrapRef.current;
    if(!b||!wrap)return;
    const pad=96;
    const next=Math.min(4,Math.max(.05,Math.min((wrap.clientWidth-pad)/Math.max(1,b.w),(wrap.clientHeight-pad)/Math.max(1,b.h))));
    setZoom(next);
    setOffset({x:wrap.clientWidth/2-(b.x+b.w/2)*next,y:wrap.clientHeight/2-(b.y+b.h/2)*next});
  };

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
    for (const o of scene?.elements ?? []) {
      if (o.id === excludeId) continue;
      vs.push(o.x, o.x + o.w / 2, o.x + o.w);
      hs.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    return { vs, hs };
  };

  const startDrag = (e: React.PointerEvent, el: EditorElement) => {
    if (el.locked) { onSelectElement(el.id, e.shiftKey || e.metaKey || e.ctrlKey); return; }
    e.stopPropagation();
    const additive=e.shiftKey || e.metaKey || e.ctrlKey;
    onSelectElement(el.id, additive);
    const movingIds = selectedIds.includes(el.id) && selectedIds.length > 1 ? selectedIds : (el.groupId ? (scene?.elements ?? []).filter(o=>o.groupId===el.groupId).map(o=>o.id) : [el.id]);
    const start = { x: e.clientX, y: e.clientY, ex: el.x, ey: el.y };
    const targets = snapTargets(el.id);
    let appliedDx=0, appliedDy=0;
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
      const moveDx=nx-start.ex, moveDy=ny-start.ey;
      updateElements(movingIds,moveDx-appliedDx,moveDy-appliedDy);
      appliedDx=moveDx; appliedDy=moveDy;
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
    onSelectElement(el.id);
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
    onSelectElement(el.id);
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
        onClearSelection();
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
          background: liveScene?.background ?? scene?.background ?? "#000000", outline: "1px solid #262626",
        }}
      >
        <div className="absolute inset-0" style={{
          transformOrigin: "center center",
          transform: `translate(${timelineFrame.camera.tx + timelineFrame.transition.tx}px, ${timelineFrame.camera.ty + timelineFrame.transition.ty}px) scale(${timelineFrame.camera.scale * timelineFrame.transition.scale})`,
          opacity: timelineFrame.transition.opacity, filter: timelineFrame.transition.blur > 0.1 ? `blur(${timelineFrame.transition.blur}px)` : undefined,
        }}>
          {timelineFrame.visibleElements.map((elementState) => {
            const el = elementState.element;
            return (
            <ElementView
              key={el.id} el={el} frame={elementState.frame} videoState={elementState.video} selected={selectedIds.includes(el.id)} primarySelected={el.id===selectedId}
              editing={editingId === el.id}
              onPointerDown={(e) => startDrag(e, el)}
              onDoubleClick={() => { if (el.type === "text" && !el.locked) setEditingId(el.id); }}
              onTextChange={(text) => updateElement(el.id, (cur) => cur.type === "text" ? { ...cur, text } : cur)}
              onEndEdit={() => setEditingId(null)}
              onResizeStart={(e, handle) => startResize(e, el, handle)}
              onRotateStart={(e) => startRotate(e, el)}
              previewVars={previewVars}
              localPlayheadMs={localPlayheadMs}
              playing={playing}
            />
            );
          })}
          {guides.v.map((x, i) => (
            <div key={`v-${i}-${x}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: x, width: 1, background: "#FF0033" }} />
          ))}
          {guides.h.map((y, i) => (
            <div key={`h-${i}-${y}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: y, height: 1, background: "#FF0033" }} />
          ))}
        </div>
        {showSafeZones && <>
          <div className="absolute pointer-events-none border border-dashed border-amber-300/60" style={{left:dims.w*.05,top:dims.h*.05,width:dims.w*.9,height:dims.h*.9}}/>
          <div className="absolute pointer-events-none border border-dashed border-sky-300/50" style={{left:dims.w*.1,top:dims.h*.1,width:dims.w*.8,height:dims.h*.8}}/>
          {doc.aspect==="9:16"&&<div className="absolute pointer-events-none border-t border-dashed border-fuchsia-300/50" style={{left:0,right:0,top:dims.h*.82}}/>}
        </>}
        {showRulers && <>
          <div className="absolute pointer-events-none left-0 right-0 top-0 h-5 bg-black/45 border-b border-white/10">
            {Array.from({length:11},(_,i)=><span key={i} className="absolute top-0 h-2 border-l border-white/30 text-[8px] text-white/50 pl-1" style={{left:`${i*10}%`}}>{Math.round(dims.w*i/10)}</span>)}
          </div>
          <div className="absolute pointer-events-none left-0 top-0 bottom-0 w-5 bg-black/45 border-r border-white/10">
            {Array.from({length:11},(_,i)=><span key={i} className="absolute left-0 w-2 border-t border-white/30 text-[8px] text-white/50" style={{top:`${i*10}%`}}>{Math.round(dims.h*i/10)}</span>)}
          </div>
        </>}
        {/* Captions are project/screen-space overlays. Keep them outside the
            scene camera transform to match SVG, FFmpeg and full Preview. */}
        {timelineFrame.visibleCaptions.map((captionState) => (
          <CaptionOverlay key={captionState.clip.id} state={captionState} />
        ))}
        {timelineFrame.visibleEffects.map((fx) => <EffectOverlay key={fx.id} fx={fx} />)}
        {timelineFrame.transition.flash > 0.001 && <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: timelineFrame.transition.flash }} />}
        {timelineFrame.transition.glitch > 0.001 && <div className="absolute inset-0 pointer-events-none mix-blend-screen" style={{ opacity: timelineFrame.transition.glitch * 0.35, background: "repeating-linear-gradient(0deg,rgba(255,0,80,.35) 0 3px,rgba(0,220,255,.25) 3px 6px,transparent 6px 10px)" }} />}
        {timelineFrame.transitionOverlayOpacity > 0.001 && (
          <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: timelineFrame.transitionOverlayOpacity }} />
        )}
      </div>

      {liveMaterialized.errors.length > 0 && (
        <div className="absolute top-3 left-3 right-3 z-20 rounded-md border border-amber-500/30 bg-black/75 px-3 py-2 text-[10px] text-amber-200 pointer-events-none">
          Live canvas is using template defaults · {liveMaterialized.errors.slice(0, 2).map((error) => `${error.variable}: ${error.message}`).join(" · ")}
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-panel border border-border rounded-md px-1 py-1 text-xs">
        <button title="Zoom out" onClick={(e) => { e.stopPropagation(); zoomBy(1 / 1.2); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomOut className="size-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="px-2 h-7 hover:bg-white/5 rounded font-mono tabular-nums text-zinc-400">{Math.round(scale * 100)}%</button>
        <button title="Zoom in" onClick={(e) => { e.stopPropagation(); zoomBy(1.2); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomIn className="size-3.5" /></button>
        <button title="Zoom to selection" disabled={!selectedIds.length} onClick={(e)=>{e.stopPropagation();zoomToSelection();}} className="px-2 h-7 hover:bg-white/5 rounded disabled:opacity-30">Sel</button>
        <button title="Fit to screen" onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><Maximize className="size-3.5" /></button>
      </div>
      <div className="absolute bottom-3 left-3 text-[10px] text-zinc-500 pointer-events-none">
        Ctrl/⌘ + scroll to zoom · scroll or Alt-drag to pan
      </div>
    </div>
  );
}

function ElementView({ el, frame, videoState, selected, primarySelected, editing, onPointerDown, onDoubleClick, onTextChange, onEndEdit, onResizeStart, onRotateStart, previewVars, localPlayheadMs, playing }: {
  el: EditorElement; frame: ElementFrame; videoState?: TimelineVideoState; selected: boolean; primarySelected:boolean; editing: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onTextChange: (text: string) => void;
  onEndEdit: () => void;
  onResizeStart: (e: React.PointerEvent, handle: ResizeHandle) => void;
  onRotateStart: (e: React.PointerEvent) => void;
  previewVars: Record<string, string>;
  localPlayheadMs: number;
  playing: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: frame.x, top: frame.y, width: el.w, height: el.h,
    transform: `scale(${frame.scale}) rotate(${frame.rotation}deg)`, transformOrigin: "center center",
    opacity: frame.opacity, filter: frame.blurPx > 0.1 ? `blur(${frame.blurPx}px)` : undefined,
    outline: selected ? "3px solid #FF0033" : "none",
    cursor: el.locked ? "not-allowed" : "move",
  };
  const cornerCursor = (h: ResizeHandle) =>
    h === "nw" || h === "se" ? "nwse-resize" :
    h === "ne" || h === "sw" ? "nesw-resize" :
    h === "n" || h === "s" ? "ns-resize" : "ew-resize";
  const handles = primarySelected && !el.locked ? (
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
    const vJustify = el.vAlign === "top" ? "flex-start" : el.vAlign === "bottom" ? "flex-end" : "center";
    const renderedText = (() => {
      const rendered = renderText(el.text, previewVars);
      if (frame.visibleChars !== undefined) return rendered.slice(0, frame.visibleChars);
      if (frame.visibleWords !== undefined) return rendered.split(/\s+/).slice(0, frame.visibleWords).join(" ");
      return rendered;
    })();
    const textLayout = layoutText(el, renderedText || " ");
    const sharedTextStyle: React.CSSProperties = {
      color: el.textGradient ? "transparent" : el.color,
      backgroundImage: el.textGradient ? gradientCss(el.textGradient) : undefined,
      backgroundClip: el.textGradient ? "text" : undefined, WebkitBackgroundClip: el.textGradient ? "text" : undefined,
      fontFamily: el.fontFamily, fontSize: textLayout.fontSize, fontWeight: el.fontWeight,
      textAlign: el.align,
      lineHeight: el.lineHeight ?? 1.15,
      letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
      fontStyle: el.italic ? "italic" : undefined,
      textTransform: el.textTransform === "none" ? undefined : el.textTransform,
      textShadow: cssTextShadows(el),
      WebkitTextStroke: el.stroke ? `${el.strokeWidth ?? 6}px ${el.stroke}` : undefined,
      paintOrder: "stroke fill",
      width: "100%", overflow: "hidden", whiteSpace: "pre-wrap",
    };
    const clip = el.clipInsetPct;
    const clipPath = clip ? `inset(${clip.top ?? 0}% ${clip.right ?? 0}% ${clip.bottom ?? 0}% ${clip.left ?? 0}%)` : undefined;
    const textBoxStyle: React.CSSProperties = {
      width: "100%", height: "100%", boxSizing: "border-box", position: "relative",
      padding: `${el.backgroundPaddingY ?? 8}px ${el.backgroundPaddingX ?? 8}px`,
      display: "flex", alignItems: vJustify, overflow: "hidden",
      borderRadius: el.backgroundRadius ?? (el.background || el.backgroundGradient ? 12 : 0),
      clipPath,
    };
    const textBgStyle: React.CSSProperties = {
      position: "absolute", inset: 0, pointerEvents: "none",
      background: el.backgroundGradient ? gradientCss(el.backgroundGradient) : el.background,
      opacity: el.backgroundOpacity ?? 1,
      borderRadius: el.backgroundRadius ?? (el.background || el.backgroundGradient ? 12 : 0),
      border: (el.backgroundBorderWidth ?? 0) > 0 ? `${el.backgroundBorderWidth}px solid ${el.backgroundBorderColor ?? "#FFFFFF"}` : undefined,
      boxSizing: "border-box",
    };
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
            style={{ ...sharedTextStyle, color: el.color, backgroundImage: undefined, WebkitTextStroke: undefined, width: "100%", height: "100%", background: "transparent", border: "1px dashed #FF0033", outline: "none", resize: "none" }}
          />
        ) : (
          <div style={textBoxStyle}><div style={textBgStyle} /><div style={{ ...sharedTextStyle, position: "relative" }}>{textLayout.lines.join("\n")}</div></div>
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
          opacity: frame.opacity * (el.fillOpacity ?? 1),
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
        <img draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit, pointerEvents: "none", filter: cssFilterForLook(resolveMediaLook(el.filterPreset, el.colorAdjustments)), transform: `translate(${frame.cropX}%, ${frame.cropY}%) scale(${frame.cropScale})`, transformOrigin: "center center" }} src={el.src.startsWith("{{") ? "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080" : el.src} alt="" />
        <MediaLookOverlay element={el} />
        {handles}
      </div>
    );
  }
  // video
  return (
    <div onPointerDown={onPointerDown} style={baseStyle}>
      {el.src && !el.src.startsWith("{{") ? (
        <TimelineVideo element={el} state={videoState} frame={frame} localPlayheadMs={localPlayheadMs} playing={playing} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "#111", color: "#666", fontSize: 14 }}>Video · {el.src || "no source"}</div>
      )}
      <MediaLookOverlay element={el} />
      {handles}
    </div>
  );
}

function MediaLookOverlay({ element }: { element: ImageElement | VideoElement }) {
  const look = resolveMediaLook(element.filterPreset, element.colorAdjustments);
  return <>
    {look.vignette > .01 ? <div className="absolute inset-0 pointer-events-none" style={{ background:"radial-gradient(circle at center,transparent 48%,rgba(0,0,0,.95) 100%)", opacity:look.vignette }} /> : null}
    {look.grain > .01 ? <div className="absolute inset-0 pointer-events-none mix-blend-overlay" style={{ opacity:look.grain*.45, backgroundImage:"url(data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E)" }} /> : null}
  </>;
}

function EffectOverlay({ fx }: { fx: import("@/lib/effects").EffectState }) {
  const opacity = Math.max(0, Math.min(1, (fx.opacity ?? 1) * fx.intensity));
  if (fx.kind === "vignette") return <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at center, transparent 42%, rgba(0,0,0,.92) 100%)", opacity }} />;
  if (fx.kind === "grain") return <div className="absolute inset-0 pointer-events-none mix-blend-overlay" style={{ opacity: opacity * .55, backgroundImage: "url(data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E)" }} />;
  if (fx.kind === "light-leak") return <div className="absolute inset-0 pointer-events-none mix-blend-screen" style={{ opacity, background: `radial-gradient(circle at ${20+60*fx.progress}% 15%, ${fx.color ?? "#FF7A18"}, transparent 38%)` }} />;
  if (fx.kind === "flash") { const pulse = Math.sin(Math.min(1, fx.progress) * Math.PI); return <div className="absolute inset-0 pointer-events-none bg-white" style={{ opacity: opacity * pulse }} />; }
  return <div className="absolute inset-0 pointer-events-none mix-blend-screen" style={{ opacity: opacity*.5, background: "repeating-linear-gradient(0deg,rgba(255,0,90,.45) 0 2px,rgba(0,230,255,.32) 2px 4px,transparent 4px 8px)", transform: `translateX(${Math.sin(fx.localMs/35)*12*fx.intensity}px)` }} />;
}

export function EffectProperties({ clip, doc, update, onDelete }: { clip: EditorEffectClip; doc: EditorDocumentV2; update: (patch: Partial<EditorEffectClip>) => void; onDelete: () => void }) {
  return <div className="p-4 space-y-4">
    <div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Effect clip</div><div className="text-[10px] text-brand uppercase mt-1">{clip.kind}</div></div><button onClick={onDelete} className="size-7 grid place-items-center rounded hover:bg-brand/10 text-brand"><Trash2 className="size-3.5"/></button></div>
    <Row label="Effect"><select value={clip.kind} onChange={(e)=>update({kind:e.target.value as EffectKind,name:e.target.value.replace(/-/g," ")})} className="w-full h-8 px-2 rounded bg-zinc-950 border border-border text-sm">{["vignette","grain","light-leak","flash","glitch"].map(k=><option key={k} value={k}>{k}</option>)}</select></Row>
    <div className="grid grid-cols-2 gap-2"><Row label="Start (ms)"><input type="number" min={0} max={doc.durationMs-100} step={50} value={clip.startMs} onChange={(e)=>update({startMs:Math.max(0,Number(e.target.value))})} className="w-full h-8 px-2 rounded bg-zinc-950 border border-border text-xs"/></Row><Row label="Duration (ms)"><input type="number" min={100} step={50} value={clip.durationMs} onChange={(e)=>update({durationMs:Math.max(100,Number(e.target.value))})} className="w-full h-8 px-2 rounded bg-zinc-950 border border-border text-xs"/></Row></div>
    <Row label={`Intensity ${Math.round(clip.intensity*100)}%`}><input type="range" min={0} max={1} step={.01} value={clip.intensity} onChange={(e)=>update({intensity:Number(e.target.value)})} className="w-full"/></Row>
    <Row label={`Opacity ${Math.round((clip.opacity??1)*100)}%`}><input type="range" min={0} max={1} step={.01} value={clip.opacity??1} onChange={(e)=>update({opacity:Number(e.target.value)})} className="w-full"/></Row>
    {clip.kind === "light-leak" ? <Row label="Color"><input type="color" value={clip.color??"#FF7A18"} onChange={(e)=>update({color:e.target.value})} className="w-full h-8 rounded bg-transparent"/></Row> : null}
  </div>;
}

function CaptionOverlay({ state }: { state: TimelineCaptionState }) {
  const clip = state.clip;
  const style = clip.style;
  return (
    <div className="absolute pointer-events-none flex items-center justify-center" style={{ left: clip.x, top: clip.y, width: clip.w, height: clip.h, padding: style.padding ?? 14, borderRadius: style.radius ?? 12, background: style.background, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, textAlign: "center", lineHeight: 1.08, flexWrap: "wrap", alignContent: "center", gap: "0 0.28em", WebkitTextStroke: style.stroke ? `${style.strokeWidth ?? 5}px ${style.stroke}` : undefined }}>
      {state.words.map((word) => {
        const active = word.active;
        const pop = style.animation === "pop" && active ? 1 + 0.16 * Math.sin(Math.min(1, word.progress) * Math.PI) : 1;
        const opacity = style.animation === "karaoke" && !word.spoken && !active ? 0.58 : 1;
        return <span key={word.id} style={{ color: active ? style.activeColor : style.color, opacity, transform: `scale(${pop})`, transition: "color 70ms linear", display: "inline-block" }}>{style.uppercase ? word.text.toUpperCase() : word.text}</span>;
      })}
    </div>
  );
}

export function CaptionProperties({ clip, doc, update, onDelete }: { clip: EditorCaptionClip; doc: EditorDocumentV2; update: (patch: Partial<EditorCaptionClip>) => void; onDelete: () => void }) {
  const text = clip.words.map((word) => word.text).join(" ");
  const updateText = (value: string) => update({ name: value.slice(0, 36) || "Caption", words: wordsFromText(value, clip.durationMs) });
  const updateDuration = (durationMs: number) => {
    const safe = Math.max(300, Math.min(durationMs, doc.durationMs - clip.startMs));
    update({ durationMs: safe, words: retimeCaptionWords(clip.words, safe) });
  };
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between"><div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Caption clip</div><div className="text-[10px] text-brand uppercase mt-1">word-level timing</div></div><button onClick={onDelete} className="size-7 grid place-items-center rounded-md hover:bg-brand/10 text-brand"><Trash2 className="size-3.5" /></button></div>
      <Row label="Caption text"><textarea value={text} onChange={(e) => updateText(e.target.value)} rows={4} className="w-full px-2 py-2 rounded-md bg-zinc-950 border border-border text-sm resize-y" /></Row>
      <Row label="Preset"><select value={clip.style.preset} onChange={(e) => update({ style: captionPreset(e.target.value as CaptionPresetId) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm">{CAPTION_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></Row>
      <Row label="Animation"><select value={clip.style.animation} onChange={(e) => update({ style: { ...clip.style, animation: e.target.value as EditorCaptionClip["style"]["animation"] } })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"><option value="highlight">Highlight</option><option value="karaoke">Karaoke</option><option value="pop">Pop</option><option value="minimal">Minimal</option></select></Row>
      <div className="grid grid-cols-2 gap-2"><Row label="Start (ms)"><input type="number" min={0} max={doc.durationMs - 100} step={50} value={Math.round(clip.startMs)} onChange={(e) => update({ startMs: Math.max(0, Math.min(doc.durationMs - 100, Number(e.target.value))) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row><Row label="Duration (ms)"><input type="number" min={300} max={Math.max(300, doc.durationMs - clip.startMs)} step={50} value={Math.round(clip.durationMs)} onChange={(e) => updateDuration(Number(e.target.value))} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row></div>
      <div className="grid grid-cols-2 gap-2"><Row label="Font size"><input type="number" min={20} max={160} value={clip.style.fontSize} onChange={(e) => update({ style: { ...clip.style, fontSize: Math.max(20, Number(e.target.value)) } })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row><Row label="Weight"><input type="number" min={300} max={900} step={100} value={clip.style.fontWeight} onChange={(e) => update({ style: { ...clip.style, fontWeight: Number(e.target.value) } })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row></div>
      <div className="grid grid-cols-2 gap-2"><Row label="Text"><input type="color" value={clip.style.color} onChange={(e) => update({ style: { ...clip.style, color: e.target.value } })} className="w-full h-8 rounded bg-transparent" /></Row><Row label="Active word"><input type="color" value={clip.style.activeColor} onChange={(e) => update({ style: { ...clip.style, activeColor: e.target.value } })} className="w-full h-8 rounded bg-transparent" /></Row></div>
      <div className="grid grid-cols-2 gap-2"><Row label="X"><input type="number" value={clip.x} onChange={(e) => update({ x: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row><Row label="Y"><input type="number" value={clip.y} onChange={(e) => update({ y: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row><Row label="Width"><input type="number" value={clip.w} onChange={(e) => update({ w: Math.max(100, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row><Row label="Height"><input type="number" value={clip.h} onChange={(e) => update({ h: Math.max(80, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row></div>
      <div className="pt-3 border-t border-border"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Word timing</div><div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">{clip.words.map((word, index) => <div key={word.id} className="grid grid-cols-[1fr_62px_62px] gap-1 items-center"><input value={word.text} onChange={(e) => update({ words: clip.words.map((item, i) => i === index ? { ...item, text: e.target.value } : item) })} className="h-7 px-1.5 rounded bg-zinc-950 border border-border text-[10px]" /><input title="Word start ms" type="number" min={0} max={clip.durationMs} step={20} value={word.startMs} onChange={(e) => update({ words: clip.words.map((item, i) => i === index ? { ...item, startMs: Math.max(0, Number(e.target.value)) } : item) })} className="h-7 px-1 rounded bg-zinc-950 border border-border text-[9px]" /><input title="Word end ms" type="number" min={0} max={clip.durationMs} step={20} value={word.endMs} onChange={(e) => update({ words: clip.words.map((item, i) => i === index ? { ...item, endMs: Math.min(clip.durationMs, Math.max(item.startMs + 20, Number(e.target.value))) } : item) })} className="h-7 px-1 rounded bg-zinc-950 border border-border text-[9px]" /></div>)}</div><button onClick={() => update({ words: wordsFromText(text, clip.durationMs) })} className="w-full h-7 mt-2 rounded border border-border hover:border-brand/50 text-[10px]">Auto-retime words</button></div>
    </div>
  );
}

export function TimelineAudioPreview({ doc, tMs, playing }: { doc: EditorDocument; tMs: number; playing: boolean }) {
  const states = useMemo(() => evaluateTimelineAudio(doc, tMs), [doc, tMs]);
  return <>{states.map((state) => <TimelineAudioClipPlayer key={state.clip.id} state={state} playing={playing} />)}</>;
}

function TimelineAudioClipPlayer({ state, playing }: { state: ReturnType<typeof evaluateTimelineAudio>[number]; playing: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    const target = Math.max(0, state.sourceTimeMs / 1000);
    if (Math.abs(audio.currentTime - target) > (playing ? 0.22 : 0.035)) {
      try { audio.currentTime = target; } catch { /* metadata may not be loaded yet */ }
    }
    audio.playbackRate = Math.max(0.1, state.clip.playbackRate ?? 1);
    audio.volume = Math.max(0, Math.min(1, state.gain));
    audio.muted = state.muted || !state.visible;
    audio.loop = Boolean(state.clip.loop);
    if (playing && state.visible && !audio.muted) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [state.sourceTimeMs, state.gain, state.muted, state.visible, state.clip.playbackRate, state.clip.loop, playing]);
  return <audio ref={ref} src={state.clip.src} preload="auto" className="hidden" />;
}

export function AudioProperties({ clip, doc, update, updateMix, onDelete, onSplit }: {
  clip: EditorAudioClip; doc: EditorDocumentV2; update: (patch: Partial<EditorAudioClip>) => void; updateMix: (patch: Partial<EditorDocumentV2["audioMix"]>) => void; onDelete: () => void; onSplit: () => void;
}) {
  const mix = doc.audioMix;
  const canDuck = clip.role === "music";
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Audio clip</div><div className="text-[10px] text-brand uppercase mt-1">{clip.role}</div></div>
        <button onClick={onDelete} className="size-7 grid place-items-center rounded-md hover:bg-brand/10 text-brand"><Trash2 className="size-3.5" /></button>
      </div>
      <Row label="Name"><input value={clip.name} onChange={(e) => update({ name: e.target.value })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
      <Row label="Role"><select value={clip.role} onChange={(e) => update({ role: e.target.value as AudioClipRole })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"><option value="music">Music</option><option value="voiceover">Voiceover</option><option value="sfx">SFX</option><option value="original">Original</option></select></Row>
      {clip.waveform?.length ? <div className="space-y-2">
        <div className="relative h-16 rounded-md border border-border bg-black/20 px-1 flex items-center gap-px overflow-hidden">
          {clip.waveform.map((peak, i) => <span key={i} className="flex-1 bg-zinc-400 rounded-full" style={{ height: `${Math.max(6, peak * 100)}%` }} />)}
          {clip.mediaDurationMs&&<><div className="absolute top-0 bottom-0 bg-black/55 pointer-events-none" style={{left:0,width:`${Math.max(0,Math.min(100,(clip.sourceStartMs??0)/clip.mediaDurationMs*100))}%`}}/><div className="absolute top-0 bottom-0 bg-black/55 pointer-events-none" style={{right:0,width:`${Math.max(0,100-Math.min(100,(clip.sourceEndMs??clip.mediaDurationMs)/clip.mediaDurationMs*100))}%`}}/></>}
        </div>
        {clip.mediaDurationMs&&<div className="space-y-1"><div className="text-[9px] text-zinc-500">Waveform trim</div><input type="range" min={0} max={Math.max(1,clip.mediaDurationMs-100)} step={10} value={clip.sourceStartMs??0} onChange={(e)=>{const start=Number(e.target.value);const end=Math.max(start+100,clip.sourceEndMs??clip.mediaDurationMs!);update({sourceStartMs:start,sourceEndMs:end,durationMs:Math.max(100,(end-start)/(clip.playbackRate??1))});}} className="w-full"/><input type="range" min={100} max={clip.mediaDurationMs} step={10} value={clip.sourceEndMs??clip.mediaDurationMs} onChange={(e)=>{const end=Number(e.target.value);const start=Math.min(end-100,clip.sourceStartMs??0);update({sourceStartMs:start,sourceEndMs:end,durationMs:Math.max(100,(end-start)/(clip.playbackRate??1))});}} className="w-full"/></div>}
      </div> : <div className="h-10 grid place-items-center rounded-md border border-dashed border-border text-[10px] text-zinc-600">Waveform unavailable for this URL/source</div>}
      <div className="grid grid-cols-2 gap-2"><Row label="Start (ms)"><input type="number" min={0} step={50} value={Math.round(clip.startMs)} onChange={(e) => update({ startMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row><Row label="Duration (ms)"><input type="number" min={100} step={50} value={Math.round(clip.durationMs)} onChange={(e) => update({ durationMs: Math.max(100, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row></div>
      <div className="grid grid-cols-2 gap-2"><Row label="Source in (ms)"><input type="number" min={0} step={50} value={Math.round(clip.sourceStartMs ?? 0)} onChange={(e) => update({ sourceStartMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row><Row label="Source out (ms)"><input type="number" min={0} step={50} value={Math.round(clip.sourceEndMs ?? ((clip.sourceStartMs ?? 0) + clip.durationMs))} onChange={(e) => update({ sourceEndMs: Math.max((clip.sourceStartMs ?? 0) + 1, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row></div>
      <Row label="Playback speed"><select value={clip.playbackRate ?? 1} onChange={(e) => { const rate = Number(e.target.value); const span = (clip.sourceEndMs ?? ((clip.sourceStartMs ?? 0) + clip.durationMs * (clip.playbackRate ?? 1))) - (clip.sourceStartMs ?? 0); update({ playbackRate: rate, durationMs: Math.max(100, span / rate) }); }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm">{[0.5,0.75,1,1.25,1.5,2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></Row>
      <Row label={`Volume ${Math.round(clip.volume * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={clip.volume} disabled={clip.muted} onChange={(e) => update({ volume: Number(e.target.value) })} className="w-full" /></Row>
      <div className="grid grid-cols-2 gap-2"><Row label="Fade in (ms)"><input type="number" min={0} step={50} value={clip.fadeInMs ?? 0} onChange={(e) => update({ fadeInMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row><Row label="Fade out (ms)"><input type="number" min={0} step={50} value={clip.fadeOutMs ?? 0} onChange={(e) => update({ fadeOutMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row></div>
      <div className="grid grid-cols-3 gap-2 text-xs"><label className="flex items-center gap-1.5"><input type="checkbox" checked={clip.muted ?? false} onChange={(e) => update({ muted: e.target.checked })} /> Mute</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={clip.solo ?? false} onChange={(e) => update({ solo: e.target.checked })} /> Solo</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={clip.loop ?? false} onChange={(e) => update({ loop: e.target.checked })} /> Loop</label></div>
      {(clip.role==="music"||clip.role==="sfx")&&<div className="grid grid-cols-2 gap-2"><Row label="BPM"><input type="number" min={1} max={400} value={clip.bpm??""} onChange={(e)=>update({bpm:e.target.value?Math.max(1,Number(e.target.value)):undefined})} placeholder="120" className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"/></Row><Row label="Beat offset (ms)"><input type="number" step={10} value={clip.beatOffsetMs??0} onChange={(e)=>update({beatOffsetMs:Number(e.target.value)||0})} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"/></Row></div>}
      {canDuck ? <div className="space-y-2 rounded-md border border-border p-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clip.ducking !== false} onChange={(e) => update({ ducking: e.target.checked })} /><span>Duck under voiceover</span></label><label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={mix?.duckingEnabled ?? true} onChange={(e) => updateMix({ duckingEnabled: e.target.checked })} /> Auto ducking enabled</label><Row label={`Duck level ${Math.round((mix?.duckLevel ?? 0.22) * 100)}%`}><input type="range" min={0.05} max={0.8} step={0.01} value={mix?.duckLevel ?? 0.22} onChange={(e) => updateMix({ duckLevel: Number(e.target.value) })} className="w-full" /></Row><div className="grid grid-cols-2 gap-2"><Row label="Attack (ms)"><input type="number" min={0} step={20} value={mix?.attackMs ?? 180} onChange={(e) => updateMix({ attackMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row><Row label="Release (ms)"><input type="number" min={0} step={20} value={mix?.releaseMs ?? 320} onChange={(e) => updateMix({ releaseMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row></div></div> : null}
      <button onClick={onSplit} className="w-full h-8 rounded-md border border-border hover:border-brand/50 text-xs inline-flex items-center justify-center gap-2"><Scissors className="size-3.5" /> Split at playhead</button>
      <p className="text-[10px] text-zinc-600">Music ducking is calculated from voiceover clip ranges using the project attack/release settings.</p>
    </div>
  );
}

function TimelineVideo({ element, state, frame, localPlayheadMs, playing }: { element: VideoElement; state?: TimelineVideoState; frame: ElementFrame; localPlayheadMs: number; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const clipStart = element.startMs ?? 0;
  const rate = state?.playbackRate ?? Math.max(0.1, element.playbackRate ?? 1);
  const desiredMs = state?.sourceTimeMs ?? Math.max(0, element.sourceStartMs ?? 0) + Math.max(0, localPlayheadMs - clipStart) * rate;
  const effectiveVolume = state?.volume ?? Math.max(0, Math.min(1, element.volume ?? 1));

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.playbackRate = rate;
    video.muted = element.muted ?? true;
    video.volume = effectiveVolume;
    const desired = desiredMs / 1000;
    if (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime - desired) > (playing ? 0.12 : 0.02)) {
      try { video.currentTime = desired; } catch { /* metadata may not be ready yet */ }
    }
    if (playing) {
      const promise = video.play();
      if (promise) promise.catch(() => undefined);
    } else {
      video.pause();
    }
  }, [desiredMs, playing, rate, element.muted, effectiveVolume]);

  return <video ref={ref} draggable={false} style={{ width: "100%", height: "100%", objectFit: element.fit, pointerEvents: "none", background: "#000", filter: cssFilterForLook(resolveMediaLook(element.filterPreset, element.colorAdjustments)), transform: `translate(${frame.cropX}%, ${frame.cropY}%) scale(${frame.cropScale})`, transformOrigin: "center center" }} src={element.src} muted={element.muted ?? true} playsInline preload="auto" />;
}

export function LeftPanel({ panel, doc, brandLibrary, componentLibrary, audioAutomationSlot, onSaveBrandKit, onApplyBrandKit, onDeleteBrandKit, onUpdateBrand, onUploadBrandAsset, onInsertComponent, onSaveSelectedComponent, onSaveSceneComponent, onDeleteComponent, selectedAudioId, selectedCaptionId, selectedEffectId, onSelectAudio, onSelectCaption, onSelectEffect, onAddEffect, onDeleteEffect, onAddCaption, onDeleteCaption, onDeleteAudio, onAddAudioFromUrl, onUploadAudio, onAddText, onAddTextPreset, onAddShape, onAddImagePlaceholder, onAddImageFromUrl, onAddVideoFromUrl, onUploadFile, onAddVariable, onUpdateAutomationVariable, onAddAutomationVariable, onDeleteAutomationVariable, onUpdateSceneAutomation, onApplyRetentionPreset, onUpdateRetention, scene, selectedId, selectedIds, onSelectLayer, onToggleLayerLock, onToggleLayerHidden, deleteElement }: {
  panel: Panel; doc: EditorDocumentV2; brandLibrary: BrandKit[]; componentLibrary: EditorReusableComponent[]; audioAutomationSlot?: React.ReactNode; onSaveBrandKit: () => void; onApplyBrandKit: (brand: BrandKit) => void; onDeleteBrandKit: (id: string) => void;
  onUpdateBrand: (patch: Partial<BrandKit>) => void; onUploadBrandAsset: (kind: "logo" | "watermark", file: File) => void;
  onInsertComponent: (component: EditorReusableComponent) => void; onSaveSelectedComponent: () => void; onSaveSceneComponent: () => void; onDeleteComponent: (id: string) => void;
  selectedAudioId: string | null; selectedCaptionId: string | null; selectedEffectId: string | null; onSelectAudio: (id: string) => void;
  onSelectCaption: (id: string) => void; onSelectEffect: (id: string) => void; onAddEffect: (kind: EffectKind) => void; onDeleteEffect: (id: string) => void; onAddCaption: (text: string, preset: CaptionPresetId) => void; onDeleteCaption: (id: string) => void; onDeleteAudio: (id: string) => void;
  onAddAudioFromUrl: (url: string, role: AudioClipRole) => void; onUploadAudio: (file: File, role: AudioClipRole) => void;
  onAddText: () => void;
  onAddTextPreset: (patch: Partial<TextElement>) => void;
  onAddShape: (s: ShapeElement["shape"]) => void;
  onAddImagePlaceholder: () => void;
  onAddImageFromUrl: (url: string) => void;
  onAddVideoFromUrl: (url: string) => void;
  onUploadFile: (file: File) => void;
  onAddVariable: (name: string) => void;
  onUpdateAutomationVariable: (id: string, patch: Partial<AutomationVariableDefinition>) => void;
  onAddAutomationVariable: () => void;
  onDeleteAutomationVariable: (id: string) => void;
  onUpdateSceneAutomation: (patch: Partial<EditorScene>) => void;
  onApplyRetentionPreset: (preset: RetentionPresetId) => void;
  onUpdateRetention: (patch: Partial<ReturnType<typeof normalizeRetention>>) => void;
  scene: EditorScene; selectedId: string | null; selectedIds:string[];
  onSelectLayer:(id:string,additive?:boolean)=>void; onToggleLayerLock:(id:string)=>void; onToggleLayerHidden:(id:string)=>void;
  deleteElement: (id: string) => void;
}) {
  const [layerSearch,setLayerSearch]=useState("");
  if (panel === "brand") {
    const brand = normalizeBrandKit(doc.brand);
    const updateColor = (key: keyof BrandKit["colors"], value: string) => onUpdateBrand({ colors: { ...brand.colors, [key]: value } });
    return <div className="p-3 space-y-4">
      <div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Brand kit</div><p className="text-[10px] text-zinc-500 mt-1">One source for colors, fonts, logos, CTA and automation variables.</p></div>
      <label className="block text-[10px] text-zinc-500">Brand name<input value={brand.name} onChange={(e) => onUpdateBrand({ name: e.target.value })} className="mt-1 w-full bg-black/30 border border-border rounded px-2 py-1.5 text-xs" /></label>
      <div className="grid grid-cols-2 gap-2">{(["primary","secondary","accent","background","text"] as const).map((key) => <label key={key} className="text-[9px] capitalize text-zinc-500">{key}<div className="flex mt-1"><input type="color" value={brand.colors[key]} onChange={(e) => updateColor(key, e.target.value)} className="w-9 h-8 bg-transparent"/><input value={brand.colors[key]} onChange={(e) => updateColor(key, e.target.value)} className="min-w-0 flex-1 bg-black/30 border border-border rounded-r px-1 text-[9px]"/></div></label>)}</div>
      <div className="grid grid-cols-1 gap-2"><label className="text-[10px] text-zinc-500">Heading font<input value={brand.typography.headingFont} onChange={(e) => onUpdateBrand({ typography: { ...brand.typography, headingFont: e.target.value } })} className="mt-1 w-full bg-black/30 border border-border rounded px-2 py-1.5 text-xs"/></label><label className="text-[10px] text-zinc-500">Body font<input value={brand.typography.bodyFont} onChange={(e) => onUpdateBrand({ typography: { ...brand.typography, bodyFont: e.target.value } })} className="mt-1 w-full bg-black/30 border border-border rounded px-2 py-1.5 text-xs"/></label></div>
      <label className="block text-[10px] text-zinc-500">Social handle<input value={brand.socialHandle ?? ""} onChange={(e) => onUpdateBrand({ socialHandle: e.target.value })} className="mt-1 w-full bg-black/30 border border-border rounded px-2 py-1.5 text-xs" /></label>
      <label className="block text-[10px] text-zinc-500">Default CTA<input value={brand.ctaText ?? ""} onChange={(e) => onUpdateBrand({ ctaText: e.target.value })} className="mt-1 w-full bg-black/30 border border-border rounded px-2 py-1.5 text-xs" /></label>
      <div className="space-y-2"><label className="block text-[10px] text-zinc-500">Logo URL<input value={brand.logoSrc ?? ""} onChange={(e) => onUpdateBrand({ logoSrc: e.target.value })} placeholder="https://..." className="mt-1 w-full bg-black/30 border border-border rounded px-2 py-1.5 text-xs"/></label><label className="block w-full text-center text-[10px] border border-dashed border-border rounded p-2 cursor-pointer hover:border-brand/50">Upload logo<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f=e.target.files?.[0]; if(f) onUploadBrandAsset("logo", f); e.currentTarget.value=""; }}/></label></div>
      <div className="space-y-2"><label className="block text-[10px] text-zinc-500">Watermark URL<input value={brand.watermarkSrc ?? ""} onChange={(e) => onUpdateBrand({ watermarkSrc: e.target.value })} placeholder="https://..." className="mt-1 w-full bg-black/30 border border-border rounded px-2 py-1.5 text-xs"/></label><label className="block w-full text-center text-[10px] border border-dashed border-border rounded p-2 cursor-pointer hover:border-brand/50">Upload watermark<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f=e.target.files?.[0]; if(f) onUploadBrandAsset("watermark", f); e.currentTarget.value=""; }}/></label></div>
      <button onClick={onSaveBrandKit} className="w-full h-8 rounded-md bg-brand text-white text-xs font-bold">Save brand kit</button>{brandLibrary.length ? <div className="space-y-1"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Saved kits</div>{brandLibrary.map((kit) => <div key={kit.id} className="flex items-center gap-2 border border-border rounded p-2"><button onClick={() => onApplyBrandKit(kit)} className="flex-1 text-left text-[10px] truncate">{kit.name}</button><button onClick={() => onDeleteBrandKit(kit.id)} className="text-zinc-600 hover:text-brand"><Trash2 className="size-3"/></button></div>)}</div> : null}<div className="rounded-lg border border-border p-2 text-[9px] text-zinc-500"><div className="font-semibold text-zinc-300 mb-1">Automation bindings</div><code>{"{{brand.logo}}"}</code> · <code>{"{{brand.primaryColor}}"}</code> · <code>{"{{brand.headingFont}}"}</code> · <code>{"{{brand.handle}}"}</code> · <code>{"{{brand.cta}}"}</code></div>
    </div>;
  }
  if (panel === "components") {
    const builtIns = builtInBrandComponents(uid);
    const userComponents = Array.from(new Map([...(doc.components ?? []), ...componentLibrary].map((item) => [item.id, item])).values());
    return <div className="p-3 space-y-3">
      <div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Reusable components</div><p className="text-[10px] text-zinc-500 mt-1">Insert animated brand groups or save your own scene/element groups.</p></div>
      <div className="grid grid-cols-2 gap-2"><button onClick={onSaveSelectedComponent} className="rounded-lg border border-border p-2 text-[10px] hover:border-brand/50">Save selected</button><button onClick={onSaveSceneComponent} className="rounded-lg border border-border p-2 text-[10px] hover:border-brand/50">Save scene group</button></div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Brand blocks</div>
      <div className="space-y-2">{builtIns.map((component) => <button key={component.id} onClick={() => onInsertComponent(component)} className="w-full rounded-lg border border-border p-2.5 text-left hover:border-brand/50"><div className="text-xs font-semibold">{component.name}</div><div className="text-[9px] text-zinc-600">{component.elements.length} layers · brand-bound</div></button>)}</div>
      <div className="pt-2 border-t border-border"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Saved components</div>{userComponents.length === 0 ? <p className="text-[10px] text-zinc-600">No saved components yet.</p> : <div className="space-y-2">{userComponents.map((component) => <div key={component.id} className="flex items-center gap-2 rounded-lg border border-border p-2"><button onClick={() => onInsertComponent(component)} className="min-w-0 flex-1 text-left"><div className="text-xs truncate">{component.name}</div><div className="text-[9px] text-zinc-600">{component.elements.length} layers</div></button><button onClick={() => onDeleteComponent(component.id)} className="text-zinc-600 hover:text-brand"><Trash2 className="size-3"/></button></div>)}</div>}</div>
    </div>;
  }
  if (panel === "effects") {
    const presets: Array<{ kind: EffectKind; label: string; hint: string }> = [
      { kind: "vignette", label: "Vignette", hint: "Focus attention toward the center" },
      { kind: "grain", label: "Film grain", hint: "Texture for cinematic/doc looks" },
      { kind: "light-leak", label: "Light leak", hint: "Warm moving light overlay" },
      { kind: "flash", label: "Flash", hint: "Fast impact/pattern interrupt" },
      { kind: "glitch", label: "Glitch", hint: "RGB scanline distortion overlay" },
    ];
    return <div className="p-3 space-y-3">
      <div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Effects</div><p className="text-[10px] text-zinc-500 mt-1">Project-level effect clips render on the same timeline as video, captions and audio.</p></div>
      <div className="space-y-2">{presets.map((p) => <button key={p.kind} onClick={() => onAddEffect(p.kind)} className="w-full rounded-lg border border-border p-2.5 text-left hover:border-brand/50"><div className="text-xs font-semibold flex items-center gap-2"><Sparkles className="size-3.5 text-brand" />{p.label}</div><div className="text-[9px] text-zinc-600 mt-1">{p.hint}</div></button>)}</div>
      <div className="pt-2 border-t border-border"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Timeline effects</div><div className="space-y-1.5">{doc.effectClips.length === 0 ? <p className="text-xs text-zinc-600">No effect clips yet.</p> : doc.effectClips.map((clip) => <div key={clip.id} className={`flex items-center gap-2 rounded-md border p-2 ${selectedEffectId===clip.id?"border-brand bg-brand/10":"border-border"}`}><Sparkles className="size-3.5 text-brand"/><button onClick={() => onSelectEffect(clip.id)} className="min-w-0 flex-1 text-left"><div className="text-[11px] capitalize truncate">{clip.name}</div><div className="text-[9px] text-zinc-600">{(clip.durationMs/1000).toFixed(1)}s · {Math.round(clip.intensity*100)}%</div></button><button onClick={() => onDeleteEffect(clip.id)} className="text-zinc-600 hover:text-brand"><Trash2 className="size-3"/></button></div>)}</div></div>
    </div>;
  }
  if (panel === "captions") {
    return (
      <div className="p-3 space-y-3">
        <div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Professional captions</div><p className="text-[10px] text-zinc-500 mt-1">Word-level timing stays synchronized to the project playhead and render engine.</p></div>
        <button onClick={() => onAddCaption("Professional captions make Shorts easier to follow", "bold-pop")} className="w-full h-9 rounded-md bg-brand text-white text-xs font-bold inline-flex items-center justify-center gap-2"><Captions className="size-3.5" /> Add caption clip</button>
        <div className="grid grid-cols-1 gap-2">
          {CAPTION_PRESETS.map((preset) => <button key={preset.id} onClick={() => onAddCaption(preset.label + " caption style", preset.id)} className="rounded-lg border border-border p-2.5 text-left hover:border-brand/50"><div className="text-xs font-bold" style={{ color: preset.style.activeColor }}>{preset.label}</div><div className="text-[9px] text-zinc-600 mt-1">{preset.hint}</div></button>)}
        </div>
        <div className="pt-2 border-t border-border"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Caption clips</div><div className="space-y-1.5">
          {doc.captionClips.length === 0 ? <p className="text-xs text-zinc-600">No caption clips yet.</p> : doc.captionClips.map((clip) => <div key={clip.id} className={`flex items-center gap-2 rounded-md border p-2 ${selectedCaptionId === clip.id ? "border-brand bg-brand/10" : "border-border"}`}><Captions className="size-3.5 text-brand" /><button onClick={() => onSelectCaption(clip.id)} className="min-w-0 flex-1 text-left"><div className="text-[11px] truncate">{clip.words.map((word) => word.text).join(" ")}</div><div className="text-[9px] uppercase text-zinc-600">{clip.style.preset} · {(clip.durationMs / 1000).toFixed(1)}s</div></button><button onClick={() => onDeleteCaption(clip.id)} className="text-zinc-600 hover:text-brand"><Trash2 className="size-3" /></button></div>)}
        </div></div>
      </div>
    );
  }
  if (panel === "audio") {
    const roles: Array<{ role: AudioClipRole; label: string; hint: string }> = [
      { role: "music", label: "Music", hint: "Background bed; supports auto ducking" },
      { role: "voiceover", label: "Voiceover", hint: "Speech that ducks music automatically" },
      { role: "sfx", label: "Sound effect", hint: "Whoosh, pop, impact, click, etc." },
      { role: "original", label: "Original audio", hint: "Imported source/original sound" },
    ];
    return (
      <div className="p-3 space-y-3">
        {audioAutomationSlot}
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Audio</div>
          <p className="text-[10px] text-zinc-500 mt-1">Add music, voiceover, SFX or original audio to the project timeline.</p>
        </div>
        {roles.map(({ role, label, hint }) => (
          <div key={role} className="rounded-lg border border-border p-2.5 space-y-2">
            <div className="flex items-center gap-2"><Volume2 className="size-3.5 text-brand" /><div><div className="text-xs font-semibold">{label}</div><div className="text-[9px] text-zinc-600">{hint}</div></div></div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="h-7 rounded border border-border hover:border-brand/50 text-[10px] grid place-items-center cursor-pointer">Upload<input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void onUploadAudio(file, role); e.currentTarget.value = ""; }} /></label>
              <button onClick={() => { const url = prompt(`${label} URL`); if (url) onAddAudioFromUrl(url, role); }} className="h-7 rounded border border-border hover:border-brand/50 text-[10px]">From URL</button>
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-border">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Project clips</div>
          <div className="space-y-1.5">
            {doc.audioClips.length === 0 ? <p className="text-xs text-zinc-600">No audio clips yet.</p> : doc.audioClips.map((clip) => (
              <div key={clip.id} className={`flex items-center gap-2 rounded-md border p-2 ${selectedAudioId === clip.id ? "border-brand bg-brand/10" : "border-border"}`}>
                {clip.role === "voiceover" ? <Mic2 className="size-3.5 text-brand" /> : <Music className="size-3.5 text-brand" />}
                <button onClick={() => onSelectAudio(clip.id)} className="min-w-0 flex-1 text-left"><div className="text-[11px] truncate">{clip.name}</div><div className="text-[9px] uppercase text-zinc-600">{clip.role} · {(clip.durationMs / 1000).toFixed(1)}s</div></button>
                <button onClick={() => onDeleteAudio(clip.id)} className="text-zinc-600 hover:text-brand"><Trash2 className="size-3" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (panel === "retention") {
    const settings = normalizeRetention(doc.retention);
    const suggestions = analyzeRetention(doc);
    const presets: Array<{ id: RetentionPresetId; label: string; hint: string }> = [
      { id: "balanced", label: "Balanced", hint: "Natural rhythm for most Shorts" },
      { id: "fast-viral", label: "Fast Viral", hint: "Frequent motion and pattern interrupts" },
      { id: "educational", label: "Educational", hint: "Caption emphasis + clear visual beats" },
      { id: "story", label: "Story", hint: "Softer transitions and longer beats" },
      { id: "minimal", label: "Minimal", hint: "Low-motion polished pacing" },
    ];
    const roles: SceneRole[] = ["hook","context","value","pattern-interrupt","payoff","cta"];
    return (
      <div className="p-3 space-y-3">
        <div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Retention intelligence</div><p className="text-[10px] text-zinc-500 mt-1">Deterministic visual rhythm presets that stay editable and automation-safe.</p></div>
        <div className="space-y-1">{presets.map((preset)=><button key={preset.id} onClick={()=>onApplyRetentionPreset(preset.id)} className={`w-full rounded-lg border p-2 text-left ${settings.preset===preset.id?"border-brand bg-brand/10":"border-border hover:border-brand/40"}`}><div className="text-xs font-semibold">{preset.label}</div><div className="text-[9px] text-zinc-500">{preset.hint}</div></button>)}</div>
        <label className="flex items-center justify-between text-[10px]">Enable rhythm intelligence<input type="checkbox" checked={settings.enabled} onChange={(e)=>onUpdateRetention({enabled:e.target.checked})}/></label>
        <div className="grid grid-cols-2 gap-1">
          <label className="text-[9px] text-zinc-500">Micro zoom every (ms)<input type="number" step={250} value={settings.microZoomEveryMs} onChange={(e)=>onUpdateRetention({microZoomEveryMs:Math.max(1000,Number(e.target.value))})} className="mt-1 w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"/></label>
          <label className="text-[9px] text-zinc-500">Interrupt every (ms)<input type="number" step={500} value={settings.patternInterruptEveryMs} onChange={(e)=>onUpdateRetention({patternInterruptEveryMs:Math.max(2000,Number(e.target.value))})} className="mt-1 w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"/></label>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <label className="text-[9px] text-zinc-500">Caption emphasis<select value={settings.captionEmphasis} onChange={(e)=>onUpdateRetention({captionEmphasis:e.target.value as any})} className="mt-1 w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <label className="text-[9px] text-zinc-500">Transition energy<select value={settings.transitionIntensity} onChange={(e)=>onUpdateRetention({transitionIntensity:e.target.value as any})} className="mt-1 w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"><option value="subtle">Subtle</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </div>
        <label className="block text-[9px] text-zinc-500">Minimum CTA screen time (ms)<input type="number" step={250} min={1000} max={8000} value={settings.ctaLeadMs} onChange={(e)=>onUpdateRetention({ctaLeadMs:Math.max(1000,Number(e.target.value))})} className="mt-1 w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"/></label>
        <label className="block text-[9px] text-zinc-500">Current scene role<select value={scene.role ?? ""} onChange={(e)=>onUpdateSceneAutomation({role:(e.target.value || undefined) as SceneRole | undefined})} className="mt-1 w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"><option value="">Auto infer</option>{roles.map((role)=><option key={role} value={role}>{role}</option>)}</select></label>
        <div className="pt-2 border-t border-border"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Suggestions</div><div className="space-y-1">{suggestions.length===0?<div className="text-[10px] text-zinc-600">No retention gaps detected for the current rhythm settings.</div>:suggestions.slice(0,12).map((item)=><div key={item.id} className="rounded border border-border p-2"><div className="text-[9px] uppercase text-brand">{item.kind} · {(item.atMs/1000).toFixed(1)}s</div><div className="text-[10px] text-zinc-400 mt-0.5">{item.message}</div></div>)}</div></div>
      </div>
    );
  }
  if (panel === "layers") {
    const q=layerSearch.trim().toLowerCase();
    const layers=[...scene.elements].reverse().filter((el)=>{
      const name=el.type==="text"?el.text:el.type;
      return !q||name.toLowerCase().includes(q)||el.id.toLowerCase().includes(q)||(el.groupId??"").toLowerCase().includes(q);
    });
    return (
      <div className="p-3">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">Layers</div>
        <label className="relative block mb-3"><Search className="absolute left-2 top-2 size-3.5 text-zinc-600"/><input value={layerSearch} onChange={(e)=>setLayerSearch(e.target.value)} placeholder="Search layers…" className="w-full h-8 pl-7 pr-2 bg-zinc-950 border border-border rounded text-xs"/></label>
        {scene.elements.length === 0 && <div className="text-xs text-zinc-500">No layers yet.</div>}
        <ul className="space-y-1">
          {layers.map((el) => (
            <li key={el.id} className={`flex items-center gap-1 p-1.5 rounded-md text-sm ${selectedIds.includes(el.id)?"bg-brand/10 text-brand":"hover:bg-white/5"} ${el.hidden?"opacity-50":""}`}>
              <button onClick={(e) => onSelectLayer(el.id,e.shiftKey||e.metaKey||e.ctrlKey)} className="flex items-center gap-2 flex-1 min-w-0 text-left truncate">
                {el.type === "text" ? <Type className="size-3.5" /> : el.type === "shape" ? <Square className="size-3.5" /> : el.type === "video" ? <Film className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                <span className="truncate">{el.type === "text" ? el.text : el.type}</span>
                {el.groupId&&<span className="ml-auto text-[8px] text-zinc-600">group</span>}
              </button>
              <button onClick={()=>onToggleLayerHidden(el.id)} className="p-1 text-zinc-500 hover:text-white" title={el.hidden?"Show layer":"Hide layer"}>{el.hidden?<EyeOff className="size-3"/>:<Eye className="size-3"/>}</button>
              <button onClick={()=>onToggleLayerLock(el.id)} className="p-1 text-zinc-500 hover:text-white" title={el.locked?"Unlock":"Lock"}>{el.locked?<Lock className="size-3"/>:<Unlock className="size-3"/>}</button>
              <button onClick={() => deleteElement(el.id)} className="p-1 text-zinc-500 hover:text-brand"><Trash2 className="size-3" /></button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (panel === "variables") {
    const defs = automationDefinitions(doc);
    const allNames = Array.from(new Set([...defs.map((d) => d.name), ...doc.variables, "brand.name", "brand.logo", "brand.watermark", "brand.primaryColor", "brand.secondaryColor", "brand.accentColor", "brand.headingFont", "brand.bodyFont", "brand.handle", "brand.cta"]));
    const types: AutomationVariableType[] = ["text","image","video","audio","color","number","boolean","array"];
    return (
      <div className="p-3 space-y-3">
        <div><div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Automation variables</div><p className="text-[10px] text-zinc-500 mt-1">Typed inputs validate campaigns and can drive conditional or repeating scenes.</p></div>
        <button onClick={onAddAutomationVariable} className="w-full h-8 rounded-md bg-brand text-white text-xs font-bold">+ Add typed variable</button>
        <div className="space-y-2">
          {defs.map((def) => <div key={def.id} className="rounded-lg border border-border p-2 space-y-2">
            <div className="flex gap-1"><input value={def.name} onChange={(e) => onUpdateAutomationVariable(def.id,{name:e.target.value.replace(/[^\w.-]/g,"")})} className="min-w-0 flex-1 bg-black/30 border border-border rounded px-2 py-1 text-[10px] font-mono"/><button onClick={() => onDeleteAutomationVariable(def.id)} className="text-zinc-600 hover:text-brand"><Trash2 className="size-3"/></button></div>
            <div className="grid grid-cols-2 gap-1"><select value={def.type} onChange={(e) => onUpdateAutomationVariable(def.id,{type:e.target.value as AutomationVariableType})} className="bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]">{types.map((type)=><option key={type} value={type}>{type}</option>)}</select><label className="text-[10px] flex items-center gap-1"><input type="checkbox" checked={!!def.required} onChange={(e)=>onUpdateAutomationVariable(def.id,{required:e.target.checked})}/> Required</label></div>
            {def.type === "array" ? <select value={def.itemType ?? "text"} onChange={(e)=>onUpdateAutomationVariable(def.id,{itemType:e.target.value as any})} className="w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"><option value="text">text items</option><option value="image">image items</option><option value="video">video items</option><option value="audio">audio items</option><option value="color">color items</option><option value="number">number items</option><option value="object">object items</option></select> : null}
            <input value={def.defaultValue == null ? "" : typeof def.defaultValue === "string" ? def.defaultValue : JSON.stringify(def.defaultValue)} onChange={(e)=>onUpdateAutomationVariable(def.id,{defaultValue:e.target.value})} placeholder="Default value" className="w-full bg-black/30 border border-border rounded px-2 py-1 text-[10px]"/>
            <div className="grid grid-cols-2 gap-1"><input type="number" placeholder="Min length/value" value={def.type==="number" ? def.validation?.min ?? "" : def.validation?.minLength ?? ""} onChange={(e)=>onUpdateAutomationVariable(def.id,{validation:{...(def.validation??{}), ...(def.type==="number" ? {min:e.target.value===""?undefined:Number(e.target.value)} : {minLength:e.target.value===""?undefined:Number(e.target.value)})}})} className="bg-black/30 border border-border rounded px-1 py-1 text-[9px]"/><input type="number" placeholder="Max length/value" value={def.type==="number" ? def.validation?.max ?? "" : def.validation?.maxLength ?? ""} onChange={(e)=>onUpdateAutomationVariable(def.id,{validation:{...(def.validation??{}), ...(def.type==="number" ? {max:e.target.value===""?undefined:Number(e.target.value)} : {maxLength:e.target.value===""?undefined:Number(e.target.value)})}})} className="bg-black/30 border border-border rounded px-1 py-1 text-[9px]"/></div>
            <button onClick={() => onAddVariable(def.name)} className="w-full rounded border border-border py-1 text-[9px] hover:border-brand/50">Insert {`{{${def.name}}}`} text</button>
          </div>)}
        </div>
        <div className="pt-2 border-t border-border space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Current scene automation</div>
          <label className="block text-[9px] text-zinc-500">Repeat for array variable<select value={scene.repeat?.variable ?? ""} onChange={(e)=>onUpdateSceneAutomation({repeat:e.target.value ? {variable:e.target.value,itemAlias:scene.repeat?.itemAlias||"item",indexAlias:scene.repeat?.indexAlias||"index",maxItems:scene.repeat?.maxItems??100}:undefined})} className="mt-1 w-full bg-zinc-950 border border-border rounded px-1 py-1 text-[10px]"><option value="">No repeat</option>{defs.filter((d)=>d.type==="array").map((d)=><option key={d.id} value={d.name}>{d.name}</option>)}</select></label>
          {scene.repeat ? <div className="grid grid-cols-2 gap-1"><input value={scene.repeat.itemAlias??"item"} onChange={(e)=>onUpdateSceneAutomation({repeat:{...scene.repeat!,itemAlias:e.target.value}})} placeholder="item alias" className="bg-black/30 border border-border rounded px-1 py-1 text-[9px]"/><input type="number" value={scene.repeat.maxItems??100} onChange={(e)=>onUpdateSceneAutomation({repeat:{...scene.repeat!,maxItems:Number(e.target.value)}})} className="bg-black/30 border border-border rounded px-1 py-1 text-[9px]"/></div>:null}
          <div className="text-[9px] text-zinc-600">Object arrays can use <code>{`{{item.title}}`}</code>; <code>{`{{index}}`}</code> starts at 1.</div>
        </div>
        <div className="pt-2 border-t border-border"><div className="text-[10px] text-zinc-500 mb-1">Available bindings</div><div className="flex flex-wrap gap-1">{allNames.slice(0,24).map((v)=><button key={v} onClick={()=>onAddVariable(v)} className="px-1.5 py-1 rounded border border-border text-[9px] font-mono">{`{{${v}}}`}</button>)}</div></div>
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
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold pt-2">Pro presets</div>
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onAddTextPreset(p.patch)}
            className="w-full p-3 rounded-lg bg-white/5 border border-border hover:border-brand/50 text-left"
          >
            <div className="truncate" style={p.preview}>{p.label}</div>
            <div className="text-[10px] text-zinc-500 mt-1">{p.hint}</div>
          </button>
        ))}
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
          <button onClick={() => onAddShape("triangle")} className="aspect-square rounded-lg bg-white/5 border border-border hover:border-brand/50 grid place-items-center"><div className="size-12 bg-brand" style={{ clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }} /></button>
          <button onClick={() => onAddShape("star")} className="aspect-square rounded-lg bg-white/5 border border-border hover:border-brand/50 grid place-items-center"><div className="size-12 bg-brand" style={{ clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" }} /></button>
          <button onClick={() => onAddShape("line")} className="aspect-square rounded-lg bg-white/5 border border-border hover:border-brand/50 grid place-items-center"><div className="w-12 h-1.5 bg-brand rounded-full" /></button>
        </div>
        <p className="text-[10px] text-zinc-500 pt-1">Shapes support fill opacity and an outline in the properties panel — great for badges, bars and highlight blocks.</p>
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
        <span className="text-sm font-semibold">Upload image / video / audio</span>
        <input type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile(f); e.currentTarget.value = ""; }} />
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

type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "fill" | "fitWidth";

export function RightPanel({ selected, update, scene, updateScene, onAlign, sceneIndex, sceneCount, onDuplicateScene, onDeleteScene, onMoveScene, onDuplicate, onDelete, onLayerUp, onLayerDown, onToggleLock, elementTimeMs }: {
  selected: EditorElement | null;
  update: (patch: Partial<EditorElement>) => void;
  scene: EditorScene;
  updateScene: (mut: (s: EditorScene) => EditorScene) => void;
  onAlign: (mode: AlignMode) => void;
  sceneIndex: number;
  sceneCount: number;
  onDuplicateScene: () => void;
  onDeleteScene: () => void;
  onMoveScene: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayerUp: () => void;
  onLayerDown: () => void;
  onToggleLock: () => void;
  elementTimeMs: number;
}) {
  const setBrandBinding = (property: import("@/lib/types").BrandBindableProperty, variable?: string) => {
    if (!selected) return;
    const next = { ...(selected.brandBindings ?? {}) };
    if (variable) next[property] = variable; else delete next[property];
    update({ brandBindings: Object.keys(next).length ? next : undefined } as Partial<EditorElement>);
  };
  if (!selected) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">Scene {sceneIndex + 1}/{sceneCount}</div>
          <div className="flex items-center gap-1">
            <button title="Move scene earlier" onClick={() => onMoveScene(-1)} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400"><ArrowUp className="size-3.5" /></button>
            <button title="Move scene later" onClick={() => onMoveScene(1)} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400"><ArrowDown className="size-3.5" /></button>
            <button title="Duplicate scene" onClick={onDuplicateScene} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400"><Copy className="size-3.5" /></button>
            <button title="Delete scene" onClick={onDeleteScene} className="size-7 grid place-items-center rounded-md hover:bg-brand/10 text-brand"><Trash2 className="size-3.5" /></button>
          </div>
        </div>
        <Row label="Name">
          <input value={scene.name} onChange={(e) => updateScene((s) => ({ ...s, name: e.target.value }))} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" />
        </Row>
        <Row label="Background">
          <input type="color" value={scene.background} onChange={(e) => updateScene((s) => ({ ...s, background: e.target.value }))} className="w-full h-8 rounded-md bg-transparent border border-border" />
        </Row>
        <Row label="Duration (ms)">
          <input type="number" step={250} value={scene.durationMs} onChange={(e) => updateScene((s) => ({ ...s, durationMs: Number(e.target.value) }))} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" />
        </Row>
        <div className="grid grid-cols-4 gap-1">
          {[2000, 3000, 5000, 8000].map((ms) => (
            <button key={ms} onClick={() => updateScene((s) => ({ ...s, durationMs: ms }))} className={`h-7 rounded-md text-[11px] border ${scene.durationMs===ms?"border-brand text-brand":"border-border text-zinc-400"}`}>{ms/1000}s</button>
          ))}
        </div>
        <Row label="Transition in">
          <select
            value={scene.transitionIn ?? "cut"}
            onChange={(e) => updateScene((s) => ({ ...s, transitionIn: e.target.value as SceneTransition }))}
            className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
          >
            {(["cut","fade","slideLeft","slideRight","wipe","zoom","whip","blur","flash","glitch"] as SceneTransition[]).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Row>
        <Row label="Camera move">
          <select
            value={scene.cameraMove ?? "none"}
            onChange={(e) => updateScene((s) => ({ ...s, cameraMove: e.target.value as CameraMove }))}
            className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
          >
            {CAMERA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Row>
        <Row label="Retention role">
          <select value={scene.role ?? ""} onChange={(e)=>updateScene((s)=>({...s,role:(e.target.value || undefined) as SceneRole | undefined}))} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm">
            <option value="">Auto infer</option>{(["hook","context","value","pattern-interrupt","payoff","cta"] as SceneRole[]).map((role)=><option key={role} value={role}>{role}</option>)}
          </select>
        </Row>
        <div className="grid grid-cols-3 gap-1">
          <button onClick={()=>updateScene((s)=>({...s,retention:{...s.retention,microZoom:!s.retention?.microZoom}}))} className={`h-8 rounded border text-[9px] ${scene.retention?.microZoom?"border-brand text-brand":"border-border text-zinc-500"}`}>Micro zoom</button>
          <button onClick={()=>updateScene((s)=>({...s,retention:{...s.retention,captionEmphasis:!s.retention?.captionEmphasis}}))} className={`h-8 rounded border text-[9px] ${scene.retention?.captionEmphasis?"border-brand text-brand":"border-border text-zinc-500"}`}>Caption hit</button>
          <button onClick={()=>updateScene((s)=>({...s,retention:{...s.retention,patternInterrupt:!s.retention?.patternInterrupt}}))} className={`h-8 rounded border text-[9px] ${scene.retention?.patternInterrupt?"border-brand text-brand":"border-border text-zinc-500"}`}>Interrupt</button>
        </div>
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
          <button title={`Duplicate (${shortcutMod}+D)`} onClick={onDuplicate} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400"><Copy className="size-3.5" /></button>
          <button title={selected.locked ? "Unlock" : "Lock"} onClick={onToggleLock} className="size-7 grid place-items-center rounded-md hover:bg-white/5 text-zinc-400">{selected.locked ? <Lock className="size-3.5 text-brand" /> : <Unlock className="size-3.5" />}</button>
          <button title="Delete (⌫)" onClick={onDelete} className="size-7 grid place-items-center rounded-md hover:bg-brand/10 text-brand"><Trash2 className="size-3.5" /></button>
        </div>
      </div>
      <div className="rounded-lg border border-border p-2 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Brand bindings</div>
        {selected.type === "text" ? <>
          <Row label="Text color"><select value={selected.brandBindings?.color ?? ""} onChange={(e) => setBrandBinding("color", e.target.value || undefined)} className="w-full h-7 bg-zinc-950 border border-border rounded text-[10px] px-1"><option value="">Manual</option><option value="brand.textColor">Brand text</option><option value="brand.primaryColor">Primary</option><option value="brand.accentColor">Accent</option></select></Row>
          <Row label="Font"><select value={selected.brandBindings?.fontFamily ?? ""} onChange={(e) => setBrandBinding("fontFamily", e.target.value || undefined)} className="w-full h-7 bg-zinc-950 border border-border rounded text-[10px] px-1"><option value="">Manual</option><option value="brand.headingFont">Heading font</option><option value="brand.bodyFont">Body font</option></select></Row>
          <Row label="Background"><select value={selected.brandBindings?.background ?? ""} onChange={(e) => setBrandBinding("background", e.target.value || undefined)} className="w-full h-7 bg-zinc-950 border border-border rounded text-[10px] px-1"><option value="">Manual</option><option value="brand.primaryColor">Primary</option><option value="brand.backgroundColor">Brand background</option></select></Row>
        </> : selected.type === "shape" ? <Row label="Fill"><select value={selected.brandBindings?.fill ?? ""} onChange={(e) => setBrandBinding("fill", e.target.value || undefined)} className="w-full h-7 bg-zinc-950 border border-border rounded text-[10px] px-1"><option value="">Manual</option><option value="brand.primaryColor">Primary</option><option value="brand.secondaryColor">Secondary</option><option value="brand.accentColor">Accent</option><option value="brand.backgroundColor">Background</option></select></Row> : <Row label="Media source"><select value={selected.brandBindings?.src ?? ""} onChange={(e) => setBrandBinding("src", e.target.value || undefined)} className="w-full h-7 bg-zinc-950 border border-border rounded text-[10px] px-1"><option value="">Manual</option><option value="brand.logo">Brand logo</option><option value="brand.watermark">Watermark</option></select></Row>}
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
          <div className="grid grid-cols-3 gap-2">
            <Row label="Auto fit"><button onClick={() => update({ autoFit: (selected as TextElement).autoFit === false ? true : false } as Partial<TextElement>)} className={`w-full h-8 rounded-md text-xs border ${((selected as TextElement).autoFit ?? true)?"border-brand text-brand":"border-border text-zinc-400"}`}>{((selected as TextElement).autoFit ?? true) ? "On" : "Off"}</button></Row>
            <Row label="Min size"><input type="number" min={10} max={160} value={(selected as TextElement).minFontSize ?? 24} onChange={(e) => update({ minFontSize: Math.max(10, Number(e.target.value)) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
            <Row label="Max lines"><input type="number" min={1} max={20} value={(selected as TextElement).maxLines ?? 20} onChange={(e) => update({ maxLines: Math.max(1, Math.min(20, Number(e.target.value))) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
          <Row label="Text gradient">
            <div className="grid grid-cols-[auto_1fr_1fr_72px] gap-1 items-center">
              <input type="checkbox" checked={!!(selected as TextElement).textGradient} onChange={(e) => update({ textGradient: e.target.checked ? ((selected as TextElement).textGradient ?? { from: (selected as TextElement).color, to: "#FF3D8D", angle: 90 }) : undefined } as Partial<TextElement>)} />
              <input type="color" value={(selected as TextElement).textGradient?.from ?? (selected as TextElement).color} onChange={(e) => update({ textGradient: { from: e.target.value, to: (selected as TextElement).textGradient?.to ?? "#FF3D8D", angle: (selected as TextElement).textGradient?.angle ?? 90 } } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" />
              <input type="color" value={(selected as TextElement).textGradient?.to ?? "#FF3D8D"} onChange={(e) => update({ textGradient: { from: (selected as TextElement).textGradient?.from ?? (selected as TextElement).color, to: e.target.value, angle: (selected as TextElement).textGradient?.angle ?? 90 } } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" />
              <input type="number" min={0} max={360} value={(selected as TextElement).textGradient?.angle ?? 90} onChange={(e) => update({ textGradient: { from: (selected as TextElement).textGradient?.from ?? (selected as TextElement).color, to: (selected as TextElement).textGradient?.to ?? "#FF3D8D", angle: Number(e.target.value) } } as Partial<TextElement>)} className="w-full h-8 px-1 rounded-md bg-zinc-950 border border-border text-xs" />
            </div>
          </Row>
          <Row label="Background design">
            <div className="grid grid-cols-4 gap-1">
              <input title="Radius" type="number" min={0} max={200} value={(selected as TextElement).backgroundRadius ?? 12} onChange={(e) => update({ backgroundRadius: Number(e.target.value) } as Partial<TextElement>)} className="h-8 px-1 rounded-md bg-zinc-950 border border-border text-xs" />
              <input title="Padding X" type="number" min={0} max={200} value={(selected as TextElement).backgroundPaddingX ?? 8} onChange={(e) => update({ backgroundPaddingX: Number(e.target.value) } as Partial<TextElement>)} className="h-8 px-1 rounded-md bg-zinc-950 border border-border text-xs" />
              <input title="Padding Y" type="number" min={0} max={200} value={(selected as TextElement).backgroundPaddingY ?? 8} onChange={(e) => update({ backgroundPaddingY: Number(e.target.value) } as Partial<TextElement>)} className="h-8 px-1 rounded-md bg-zinc-950 border border-border text-xs" />
              <input title="Opacity" type="number" min={0} max={1} step={0.05} value={(selected as TextElement).backgroundOpacity ?? 1} onChange={(e) => update({ backgroundOpacity: Number(e.target.value) } as Partial<TextElement>)} className="h-8 px-1 rounded-md bg-zinc-950 border border-border text-xs" />
            </div>
          </Row>
          <Row label="Background gradient">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-1 items-center">
              <input type="checkbox" checked={!!(selected as TextElement).backgroundGradient} onChange={(e) => update({ backgroundGradient: e.target.checked ? ((selected as TextElement).backgroundGradient ?? { from: (selected as TextElement).background ?? "#111111", to: "#2D2D38", angle: 135 }) : undefined } as Partial<TextElement>)} />
              <input type="color" value={(selected as TextElement).backgroundGradient?.from ?? "#111111"} onChange={(e) => update({ backgroundGradient: { from: e.target.value, to: (selected as TextElement).backgroundGradient?.to ?? "#2D2D38", angle: (selected as TextElement).backgroundGradient?.angle ?? 135 } } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" />
              <input type="color" value={(selected as TextElement).backgroundGradient?.to ?? "#2D2D38"} onChange={(e) => update({ backgroundGradient: { from: (selected as TextElement).backgroundGradient?.from ?? "#111111", to: e.target.value, angle: (selected as TextElement).backgroundGradient?.angle ?? 135 } } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" />
            </div>
          </Row>
          <Row label="Align">
            <div className="grid grid-cols-3 gap-1">
              {(["left","center","right"] as const).map((a) => (
                <button key={a} onClick={() => update({ align: a } as Partial<TextElement>)} className={`h-8 rounded-md text-xs border ${(selected as TextElement).align===a?"border-brand text-brand":"border-border text-zinc-400"}`}>{a}</button>
              ))}
            </div>
          </Row>
          <Row label="Vertical align">
            <div className="grid grid-cols-3 gap-1">
              {(["top","middle","bottom"] as const).map((a) => (
                <button key={a} onClick={() => update({ vAlign: a } as Partial<TextElement>)} className={`h-8 rounded-md text-xs border ${((selected as TextElement).vAlign ?? "middle")===a?"border-brand text-brand":"border-border text-zinc-400"}`}>{a}</button>
              ))}
            </div>
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Letter spacing"><input type="number" step={1} value={(selected as TextElement).letterSpacing ?? 0} onChange={(e) => update({ letterSpacing: Number(e.target.value) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
            <Row label="Line height"><input type="number" step={0.05} min={0.8} max={2.4} value={(selected as TextElement).lineHeight ?? 1.15} onChange={(e) => update({ lineHeight: Number(e.target.value) } as Partial<TextElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
          <Row label="Case">
            <div className="grid grid-cols-4 gap-1">
              {(["none","uppercase","lowercase"] as const).map((c) => (
                <button key={c} onClick={() => update({ textTransform: c } as Partial<TextElement>)} className={`h-8 rounded-md text-[11px] border ${((selected as TextElement).textTransform ?? "none")===c?"border-brand text-brand":"border-border text-zinc-400"}`}>{c === "none" ? "Aa" : c === "uppercase" ? "AA" : "aa"}</button>
              ))}
              <button onClick={() => update({ italic: !(selected as TextElement).italic } as Partial<TextElement>)} className={`h-8 rounded-md text-[11px] italic border ${(selected as TextElement).italic?"border-brand text-brand":"border-border text-zinc-400"}`}>I</button>
            </div>
          </Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Outline color"><input type="color" value={(selected as TextElement).stroke ?? "#000000"} onChange={(e) => update({ stroke: e.target.value } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" /></Row>
            <Row label="Outline width"><input type="number" min={0} max={40} value={(selected as TextElement).strokeWidth ?? 0} onChange={(e) => { const n = Number(e.target.value); update({ strokeWidth: n, stroke: n > 0 ? ((selected as TextElement).stroke ?? "#000000") : undefined } as Partial<TextElement>); }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
          <Row label="Shadow">
            <div className="grid grid-cols-4 gap-1">
              {SHADOW_PRESETS.map((p) => (
                <button key={p.label} onClick={() => update({ shadow: p.value } as Partial<TextElement>)} className={`h-8 rounded-md text-[11px] border ${((selected as TextElement).shadow ?? undefined)===p.value?"border-brand text-brand":"border-border text-zinc-400"}`}>{p.label}</button>
              ))}
            </div>
          </Row>
          <Row label="Glow">
            <div className="grid grid-cols-[auto_1fr_80px_70px] gap-1 items-center">
              <input type="checkbox" checked={!!(selected as TextElement).glow} onChange={(e) => update({ glow: e.target.checked ? ((selected as TextElement).glow ?? { color: "#FF0033", blur: 24, intensity: 2 }) : undefined } as Partial<TextElement>)} />
              <input type="color" value={(selected as TextElement).glow?.color ?? "#FF0033"} onChange={(e) => update({ glow: { color: e.target.value, blur: (selected as TextElement).glow?.blur ?? 24, intensity: (selected as TextElement).glow?.intensity ?? 2 } } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" />
              <input title="Blur" type="number" min={0} max={80} value={(selected as TextElement).glow?.blur ?? 24} onChange={(e) => update({ glow: { color: (selected as TextElement).glow?.color ?? "#FF0033", blur: Number(e.target.value), intensity: (selected as TextElement).glow?.intensity ?? 2 } } as Partial<TextElement>)} className="h-8 px-1 rounded-md bg-zinc-950 border border-border text-xs" />
              <input title="Intensity" type="number" min={1} max={3} value={(selected as TextElement).glow?.intensity ?? 2} onChange={(e) => update({ glow: { color: (selected as TextElement).glow?.color ?? "#FF0033", blur: (selected as TextElement).glow?.blur ?? 24, intensity: Number(e.target.value) } } as Partial<TextElement>)} className="h-8 px-1 rounded-md bg-zinc-950 border border-border text-xs" />
            </div>
          </Row>
          <Row label="Background border">
            <div className="grid grid-cols-2 gap-1">
              <input type="color" value={(selected as TextElement).backgroundBorderColor ?? "#FFFFFF"} onChange={(e) => update({ backgroundBorderColor: e.target.value } as Partial<TextElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" />
              <input type="number" min={0} max={20} value={(selected as TextElement).backgroundBorderWidth ?? 0} onChange={(e) => update({ backgroundBorderWidth: Number(e.target.value) } as Partial<TextElement>)} className="h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" />
            </div>
          </Row>
        </>
      )}
      {selected.type === "shape" && (
        <>
          <Row label="Fill"><input type="color" value={(selected as ShapeElement).fill} onChange={(e) => update({ fill: e.target.value } as Partial<ShapeElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" /></Row>
          <Row label="Fill opacity"><input type="range" min={0} max={1} step={0.05} value={(selected as ShapeElement).fillOpacity ?? 1} onChange={(e) => update({ fillOpacity: Number(e.target.value) } as Partial<ShapeElement>)} className="w-full" /></Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Outline"><input type="color" value={(selected as ShapeElement).stroke ?? "#FFFFFF"} onChange={(e) => update({ stroke: e.target.value } as Partial<ShapeElement>)} className="w-full h-8 rounded-md bg-transparent border border-border" /></Row>
            <Row label="Outline width"><input type="number" min={0} max={40} value={(selected as ShapeElement).strokeWidth ?? 0} onChange={(e) => { const n = Number(e.target.value); update({ strokeWidth: n, stroke: n > 0 ? ((selected as ShapeElement).stroke ?? "#FFFFFF") : undefined } as Partial<ShapeElement>); }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
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
          <MediaLookControls element={selected as ImageElement} update={(patch) => update(patch as Partial<ImageElement>)} />
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
          <div className="grid grid-cols-2 gap-2">
            <Row label="Source in (ms)"><input type="number" min={0} step={50} value={Math.round((selected as VideoElement).sourceStartMs ?? 0)} onChange={(e) => {
              const video = selected as VideoElement;
              const nextIn = Math.max(0, Number(e.target.value));
              const rate = Math.max(0.1, video.playbackRate ?? 1);
              const out = Math.max(nextIn + 1, video.sourceEndMs ?? (nextIn + (video.durationMs ?? scene.durationMs) * rate));
              update({ sourceStartMs: nextIn, durationMs: Math.max(100, Math.min(scene.durationMs - (video.startMs ?? 0), (out - nextIn) / rate)) } as Partial<VideoElement>);
            }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
            <Row label="Source out (ms)"><input type="number" min={1} step={50} value={Math.round((selected as VideoElement).sourceEndMs ?? (((selected as VideoElement).sourceStartMs ?? 0) + ((selected.durationMs ?? scene.durationMs) * ((selected as VideoElement).playbackRate ?? 1))))} onChange={(e) => {
              const video = selected as VideoElement;
              const start = Math.max(0, video.sourceStartMs ?? 0);
              const maxOut = video.mediaDurationMs ?? Number.MAX_SAFE_INTEGER;
              const out = Math.max(start + 1, Math.min(maxOut, Number(e.target.value)));
              const rate = Math.max(0.1, video.playbackRate ?? 1);
              update({ sourceEndMs: out, durationMs: Math.max(100, Math.min(scene.durationMs - (video.startMs ?? 0), (out - start) / rate)) } as Partial<VideoElement>);
            }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
          {(selected as VideoElement).mediaDurationMs ? <p className="text-[10px] text-zinc-600 -mt-2">Source duration: {((selected as VideoElement).mediaDurationMs! / 1000).toFixed(2)}s</p> : null}
          <Row label="Playback speed">
            <select value={(selected as VideoElement).playbackRate ?? 1} onChange={(e) => {
              const video = selected as VideoElement;
              const nextRate = Number(e.target.value);
              const sourceStart = video.sourceStartMs ?? 0;
              const sourceEnd = video.sourceEndMs ?? (sourceStart + (video.durationMs ?? scene.durationMs) * (video.playbackRate ?? 1));
              update({ playbackRate: nextRate, durationMs: Math.max(100, Math.min(scene.durationMs - (video.startMs ?? 0), (sourceEnd - sourceStart) / nextRate)) } as Partial<VideoElement>);
            }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm">
              {[0.25,0.5,0.75,1,1.25,1.5,2,3,4].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </Row>
          <Row label={`Volume ${Math.round(((selected as VideoElement).volume ?? 1) * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={(selected as VideoElement).volume ?? 1} disabled={(selected as VideoElement).muted ?? true} onChange={(e) => update({ volume: Number(e.target.value) } as Partial<VideoElement>)} className="w-full" /></Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Fade in (ms)"><input type="number" min={0} step={50} value={(selected as VideoElement).fadeInMs ?? 0} onChange={(e) => update({ fadeInMs: Math.max(0, Number(e.target.value)) } as Partial<VideoElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
            <Row label="Fade out (ms)"><input type="number" min={0} step={50} value={(selected as VideoElement).fadeOutMs ?? 0} onChange={(e) => update({ fadeOutMs: Math.max(0, Number(e.target.value)) } as Partial<VideoElement>)} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={(selected as VideoElement).muted ?? true} onChange={(e) => update({ muted: e.target.checked } as Partial<VideoElement>)} /> Muted</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={(selected as VideoElement).loop ?? false} onChange={(e) => update({ loop: e.target.checked } as Partial<VideoElement>)} /> Loop</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={(selected as VideoElement).autoplay ?? true} onChange={(e) => update({ autoplay: e.target.checked } as Partial<VideoElement>)} /> Auto</label>
          </div>
          <MediaLookControls element={selected as VideoElement} update={(patch) => update(patch as Partial<VideoElement>)} />
        </>
      )}
      <div className="pt-3 border-t border-border">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Clip timing</div>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Start (ms)"><input type="number" min={0} max={Math.max(0, scene.durationMs - 100)} step={50} value={Math.round(selected.startMs ?? 0)} onChange={(e) => { const startMs = Math.max(0, Math.min(scene.durationMs - 100, Number(e.target.value))); update({ startMs, durationMs: Math.min(selected.durationMs ?? scene.durationMs, scene.durationMs - startMs) }); }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
          <Row label="Duration (ms)"><input type="number" min={100} max={Math.max(100, scene.durationMs - (selected.startMs ?? 0))} step={50} value={Math.round(selected.durationMs ?? scene.durationMs)} onChange={(e) => update({ durationMs: Math.max(100, Math.min(Number(e.target.value), scene.durationMs - (selected.startMs ?? 0))) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5">Drag or trim this clip in the timeline for the same controls visually.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Row label="X"><input type="number" value={Math.round(selected.x)} onChange={(e) => update({ x: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
        <Row label="Y"><input type="number" value={Math.round(selected.y)} onChange={(e) => update({ y: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
        <Row label="W"><input type="number" value={Math.round(selected.w)} onChange={(e) => update({ w: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
        <Row label="H"><input type="number" value={Math.round(selected.h)} onChange={(e) => update({ h: Number(e.target.value) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row>
      </div>
      <Row label="Rotation"><input type="range" min={-180} max={180} value={selected.rotation} onChange={(e) => update({ rotation: Number(e.target.value) })} className="w-full" /></Row>
      <Row label="Opacity"><input type="range" min={0} max={1} step={0.05} value={selected.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} className="w-full" /></Row>
      <Row label="Position on canvas">
        <div className="grid grid-cols-3 gap-1">
          {([["left","⇤"],["hcenter","↔"],["right","⇥"],["top","⇡"],["vcenter","↕"],["bottom","⇣"]] as Array<[AlignMode, string]>).map(([mode, glyph]) => (
            <button key={mode} title={mode} onClick={() => onAlign(mode)} className="h-8 rounded-md text-xs border border-border text-zinc-400 hover:border-brand/50 hover:text-brand">{glyph}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 mt-1">
          <button onClick={() => onAlign("fitWidth")} className="h-8 rounded-md text-[11px] border border-border text-zinc-400 hover:border-brand/50 hover:text-brand">Fit width</button>
          <button onClick={() => onAlign("fill")} className="h-8 rounded-md text-[11px] border border-border text-zinc-400 hover:border-brand/50 hover:text-brand">Fill canvas</button>
        </div>
      </Row>
      <div className="pt-3 border-t border-border space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Conditional visibility</div>
        <input value={selected.visibleWhen?.variable ?? ""} onChange={(e)=>update({visibleWhen:e.target.value ? {variable:e.target.value,operator:selected.visibleWhen?.operator ?? "notEmpty",value:selected.visibleWhen?.value}:undefined})} placeholder="variable name (e.g. source)" className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-[10px] font-mono"/>
        {selected.visibleWhen ? <div className="grid grid-cols-2 gap-2"><select value={selected.visibleWhen.operator} onChange={(e)=>update({visibleWhen:{...selected.visibleWhen!,operator:e.target.value as VisibilityOperator}})} className="h-8 bg-zinc-950 border border-border rounded px-1 text-[10px]"><option value="notEmpty">not empty</option><option value="exists">exists</option><option value="equals">equals</option><option value="notEquals">not equals</option><option value="contains">contains</option><option value="truthy">truthy</option><option value="falsy">falsy</option></select>{["equals","notEquals","contains"].includes(selected.visibleWhen.operator) ? <input value={selected.visibleWhen.value ?? ""} onChange={(e)=>update({visibleWhen:{...selected.visibleWhen!,value:e.target.value}})} placeholder="compare value" className="h-8 px-2 bg-zinc-950 border border-border rounded text-[10px]"/> : <div/>}</div>:null}
      </div>
      <AnimatePanel selected={selected} update={update} scene={scene} updateScene={updateScene} elementTimeMs={elementTimeMs} />
    </div>
  );
}

function MediaLookControls({ element, update }: { element: ImageElement | VideoElement; update: (patch: Partial<ImageElement | VideoElement>) => void }) {
  const look = element.colorAdjustments ?? {};
  const setLook = (patch: Partial<NonNullable<(ImageElement|VideoElement)["colorAdjustments"]>>) => update({ colorAdjustments: { ...look, ...patch } } as Partial<ImageElement|VideoElement>);
  const presets: MediaFilterPreset[] = ["none","cinematic","warm","cold","high-contrast","vintage","mono","gaming","podcast","documentary"];
  return <div className="pt-3 border-t border-border space-y-3">
    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Color & filters</div>
    <Row label="Preset"><select value={element.filterPreset ?? "none"} onChange={(e)=>update({ filterPreset:e.target.value as MediaFilterPreset } as Partial<ImageElement|VideoElement>)} className="w-full h-8 px-2 rounded bg-zinc-950 border border-border text-xs">{presets.map(p=><option key={p} value={p}>{p}</option>)}</select></Row>
    {[
      ["Brightness","brightness",0,2,.01,1],["Contrast","contrast",0,2,.01,1],["Saturation","saturation",0,2,.01,1],
      ["Exposure","exposure",-1,1,.01,0],["Temperature","temperature",-1,1,.01,0],["Tint","tint",-1,1,.01,0],
      ["Blur","blur",0,30,.1,0],["Vignette","vignette",0,1,.01,0],["Grain","grain",0,1,.01,0],
    ].map(([label,key,min,max,step,def]) => <Row key={String(key)} label={`${label} ${Number((look as any)[key] ?? def).toFixed(2)}`}><input type="range" min={Number(min)} max={Number(max)} step={Number(step)} value={(look as any)[key] ?? def} onChange={(e)=>setLook({ [key]:Number(e.target.value) } as any)} className="w-full"/></Row>)}
    <button onClick={()=>update({filterPreset:"none",colorAdjustments:{}} as Partial<ImageElement|VideoElement>)} className="w-full h-7 rounded border border-border text-[10px] text-zinc-400 hover:border-brand/50">Reset look</button>
  </div>;
}

const IN_OPTIONS: InAnim[] = ["none","fade","slideUp","slideDown","slideLeft","slideRight","scale","pop","blur"];
const OUT_OPTIONS: OutAnim[] = ["none","fade","slideUp","slideDown","slideLeft","slideRight","scale","pop","blur"];
const LOOP_OPTIONS: LoopAnim[] = ["none","float","pulse","shake","kenburns"];
const REVEAL_OPTIONS: TextReveal[] = ["none","typewriter","wordByWord","charStagger"];
const CAMERA_OPTIONS: CameraMove[] = ["none","zoomIn","zoomOut","panLeft","panRight"];

function AnimatePanel({ selected, update, scene, updateScene, elementTimeMs }: {
  selected: EditorElement;
  update: (patch: Partial<EditorElement>) => void;
  scene: EditorScene;
  updateScene: (mut: (s: EditorScene) => EditorScene) => void;
  elementTimeMs: number;
}) {
  const anim: AnimationSpec = selected.animations ?? {};
  const setAnim = (patch: Partial<AnimationSpec>) => update({ animations: { ...anim, ...patch } } as Partial<EditorElement>);
  const keyframes = [...(selected.keyframes ?? [])].sort((a,b) => a.timeMs - b.timeMs);
  const addKeyframe = (prop: KeyframeProperty) => {
    const base = defaultKeyframeValues(selected);
    const existing = keyframes.find((kf) => Math.abs(kf.timeMs - elementTimeMs) < 10);
    if (existing) {
      update({ keyframes: keyframes.map((kf) => kf.id === existing.id ? { ...kf, values: { ...kf.values, [prop]: base[prop] } } : kf) });
      return;
    }
    const next: ElementKeyframe = { id: uid("kf"), timeMs: Math.max(0, Math.min(elementTimeMs, selected.durationMs ?? scene.durationMs)), easing: "easeInOut", values: { [prop]: base[prop] } };
    update({ keyframes: [...keyframes, next].sort((a,b)=>a.timeMs-b.timeMs) });
  };
  const updateKeyframe = (id: string, patch: Partial<ElementKeyframe>) => update({ keyframes: keyframes.map((kf) => kf.id === id ? { ...kf, ...patch } : kf) });
  const removeKeyframe = (id: string) => update({ keyframes: keyframes.filter((kf) => kf.id !== id) });
  const applyPreset = (id: MotionPresetId) => update({ keyframes: applyMotionPreset(selected, id, selected.durationMs ?? scene.durationMs) });
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
      <div className="pt-3 mt-1 border-t border-border space-y-2">
        <div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">V2.8 Keyframes</div><span className="text-[10px] font-mono text-zinc-600">{Math.round(elementTimeMs)}ms</span></div>
        <Row label="Motion preset"><select defaultValue="" onChange={(e) => { if (e.target.value) applyPreset(e.target.value as MotionPresetId); e.currentTarget.value = ""; }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"><option value="">Apply preset…</option>{MOTION_PRESETS.map((p)=><option key={p.id} value={p.id}>{p.label}</option>)}</select></Row>
        <div className="grid grid-cols-3 gap-1">{(["x","y","scale","rotation","opacity","blur","cropX","cropY","cropScale"] as KeyframeProperty[]).map((prop)=><button key={prop} onClick={() => addKeyframe(prop)} className="h-7 rounded border border-border hover:border-brand/60 text-[10px] text-zinc-400">+ {prop}</button>)}</div>
        {keyframes.length ? <div className="space-y-2 max-h-52 overflow-auto">{keyframes.map((kf)=><div key={kf.id} className="rounded-md border border-border p-2 space-y-2"><div className="flex gap-1"><input type="number" min={0} max={selected.durationMs ?? scene.durationMs} step={10} value={Math.round(kf.timeMs)} onChange={(e)=>updateKeyframe(kf.id,{timeMs:Math.max(0,Number(e.target.value))})} className="w-20 h-7 px-1 bg-zinc-950 border border-border rounded text-xs"/><select value={kf.easing ?? "easeInOut"} onChange={(e)=>updateKeyframe(kf.id,{easing:e.target.value as EaseName})} className="flex-1 h-7 px-1 bg-zinc-950 border border-border rounded text-xs">{(["linear","easeIn","easeOut","easeInOut","spring","bounce"] as EaseName[]).map((v)=><option key={v}>{v}</option>)}</select><button onClick={()=>removeKeyframe(kf.id)} className="size-7 rounded border border-border text-brand">×</button></div><div className="grid grid-cols-2 gap-1">{Object.entries(kf.values).map(([prop,val])=><label key={prop} className="text-[9px] text-zinc-500">{prop}<input type="number" step={prop==="opacity"?0.05:prop.toLowerCase().includes("scale")?0.01:1} value={Number(val)} onChange={(e)=>updateKeyframe(kf.id,{values:{...kf.values,[prop]:Number(e.target.value)}})} className="mt-0.5 w-full h-6 px-1 bg-zinc-950 border border-border rounded text-[10px] text-zinc-300"/></label>)}</div></div>)}</div> : <p className="text-[10px] text-zinc-600">Add a property keyframe at the current playhead, or apply a Shorts motion preset.</p>}
      </div>
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
        <Row label="Retention role">
          <select value={scene.role ?? ""} onChange={(e)=>updateScene((s)=>({...s,role:(e.target.value || undefined) as SceneRole | undefined}))} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm">
            <option value="">Auto infer</option>{(["hook","context","value","pattern-interrupt","payoff","cta"] as SceneRole[]).map((role)=><option key={role} value={role}>{role}</option>)}
          </select>
        </Row>
        <div className="grid grid-cols-3 gap-1">
          <button onClick={()=>updateScene((s)=>({...s,retention:{...s.retention,microZoom:!s.retention?.microZoom}}))} className={`h-8 rounded border text-[9px] ${scene.retention?.microZoom?"border-brand text-brand":"border-border text-zinc-500"}`}>Micro zoom</button>
          <button onClick={()=>updateScene((s)=>({...s,retention:{...s.retention,captionEmphasis:!s.retention?.captionEmphasis}}))} className={`h-8 rounded border text-[9px] ${scene.retention?.captionEmphasis?"border-brand text-brand":"border-border text-zinc-500"}`}>Caption hit</button>
          <button onClick={()=>updateScene((s)=>({...s,retention:{...s.retention,patternInterrupt:!s.retention?.patternInterrupt}}))} className={`h-8 rounded border text-[9px] ${scene.retention?.patternInterrupt?"border-brand text-brand":"border-border text-zinc-500"}`}>Interrupt</button>
        </div>
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
