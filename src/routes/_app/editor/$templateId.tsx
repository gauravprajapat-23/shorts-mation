import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CANVAS_DIMS, blankDocument, renderText, uid } from "@/lib/editor-defaults";
import type { EditorDocument, EditorDocumentV2, EditorElement, EditorScene, EditorTimelineClip, EditorAudioClip, AudioClipRole, EditorCaptionClip, CaptionPresetId, TextElement, ShapeElement, ImageElement, VideoElement, AnimationSpec, InAnim, OutAnim, LoopAnim, TextReveal, CameraMove, SceneTransition } from "@/lib/types";
import { ArrowLeft, Type, Image as ImageIcon, Square, Layers, Variable, Save, Undo2, Redo2, Plus, Trash2, Eye, Copy, Lock, Unlock, ArrowUp, ArrowDown, ZoomIn, ZoomOut, Maximize, Film, Upload, Circle, RotateCw, Music, Mic2, Volume2, Captions } from "lucide-react";
import { toast } from "sonner";
import { buildSceneSvgAtTime } from "@/lib/scene-svg";
import type { ElementFrame } from "@/lib/animate";
import { evaluateTimelineFrame, evaluateTimelineAudio, timelineDurationMs, type TimelineVideoState, type TimelineCaptionState } from "@/lib/timeline-engine";
import { migrateDocumentV1ToV2, sceneIndexAtTime, sceneStartMs, syncV2Timeline } from "@/lib/editor-document-v2";
import { EditorTimeline } from "@/components/editor/timeline/EditorTimeline";
import { useEditorPlaybackStore } from "@/components/editor/engine/editor-store";
import { applyVideoTimelineEdit, splitVideoElement } from "@/components/editor/engine/video-editing";
import { applyAudioTimelineEdit, decodeWaveform, splitAudioClip } from "@/components/editor/engine/audio-editing";
import { CAPTION_PRESETS, applyCaptionTimelineEdit, captionPreset, createCaptionClip, retimeCaptionWords, wordsFromText } from "@/lib/captions";
import { cssTextShadows, gradientCss, layoutText } from "@/lib/text-design";

export const Route = createFileRoute("/_app/editor/$templateId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Editor — ShortsForge" }] }),
  component: EditorPage,
});

type Panel = "elements" | "text" | "shapes" | "captions" | "audio" | "variables" | "layers";
type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const FONT_FAMILIES = ["Plus Jakarta Sans", "Inter", "Georgia", "Times New Roman", "Courier New", "Impact", "Arial", "Helvetica"];

const SHADOW_PRESETS: Array<{ label: string; value: string | undefined }> = [
  { label: "None", value: undefined },
  { label: "Soft", value: "0 4px 18px rgba(0,0,0,0.45)" },
  { label: "Hard", value: "0 6px 0 rgba(0,0,0,0.85)" },
  { label: "Glow", value: "0 0 24px rgba(255,0,51,0.85)" },
];

const TEXT_PRESETS: Array<{ label: string; hint: string; preview: React.CSSProperties; patch: Partial<TextElement> }> = [
  {
    label: "BIG IMPACT TITLE", hint: "heavy, uppercase, hard shadow",
    preview: { fontSize: 20, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase" },
    patch: { text: "{{headline}}", fontSize: 110, fontWeight: 900, textTransform: "uppercase", letterSpacing: 2, lineHeight: 1.05, shadow: "0 6px 0 rgba(0,0,0,0.85)", h: 320 },
  },
  {
    label: "Outlined headline", hint: "stroke outline for busy footage",
    preview: { fontSize: 20, fontWeight: 800, WebkitTextStroke: "1px #FF0033" },
    patch: { text: "{{headline}}", fontSize: 96, fontWeight: 800, stroke: "#000000", strokeWidth: 10, h: 300 },
  },
  {
    label: "Quote — serif italic", hint: "motivation / quote slides",
    preview: { fontSize: 18, fontFamily: "Georgia", fontStyle: "italic" },
    patch: { text: "“{{quote}}”", fontFamily: "Georgia", italic: true, fontSize: 76, fontWeight: 500, lineHeight: 1.3, h: 400 },
  },
  {
    label: "Subtitle caption", hint: "small supporting line",
    preview: { fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.8 },
    patch: { text: "{{subheadline}}", fontSize: 44, fontWeight: 600, letterSpacing: 6, textTransform: "uppercase", opacity: 0.85, h: 120 },
  },
  {
    label: "Badge / label", hint: "pill background block",
    preview: { fontSize: 13, fontWeight: 800, background: "#FF0033", padding: "2px 8px", borderRadius: 999, display: "inline-block" },
    patch: { text: "{{cta}}", fontSize: 48, fontWeight: 800, background: "#FF0033", backgroundRadius: 44, backgroundPaddingX: 28, backgroundPaddingY: 14, w: 620, h: 120 },
  },
  {
    label: "Viral Gradient", hint: "high-retention gradient headline",
    preview: { fontSize: 19, fontWeight: 900, backgroundImage: "linear-gradient(90deg,#FFD43B,#FF3D8D)", color: "transparent", backgroundClip: "text" },
    patch: { text: "{{headline}}", fontSize: 108, minFontSize: 44, maxLines: 3, autoFit: true, fontWeight: 900, textTransform: "uppercase", textGradient: { from: "#FFD43B", to: "#FF3D8D", angle: 90 }, stroke: "#111111", strokeWidth: 5, glow: { color: "#FF3D8D", blur: 20, intensity: 2 }, h: 330 },
  },
  {
    label: "Gaming Neon", hint: "neon glow + dark glass card",
    preview: { fontSize: 17, fontWeight: 900, color: "#7CFF5B", textShadow: "0 0 10px #7CFF5B" },
    patch: { text: "{{headline}}", fontSize: 92, minFontSize: 40, maxLines: 3, autoFit: true, fontWeight: 900, color: "#7CFF5B", stroke: "#071007", strokeWidth: 7, glow: { color: "#7CFF5B", blur: 24, intensity: 2 }, background: "#05090DDD", backgroundRadius: 30, backgroundPaddingX: 30, backgroundPaddingY: 22, backgroundBorderColor: "#7CFF5B", backgroundBorderWidth: 2, h: 320 },
  },
  {
    label: "Documentary Card", hint: "clean editorial title card",
    preview: { fontSize: 15, fontWeight: 700, background: "#F5F1E8", color: "#111", padding: "3px 6px" },
    patch: { text: "{{headline}}", fontFamily: "Georgia", fontSize: 74, minFontSize: 34, maxLines: 4, autoFit: true, fontWeight: 700, color: "#171717", backgroundGradient: { from: "#FFF9EC", to: "#EDE2CE", angle: 135 }, backgroundRadius: 10, backgroundPaddingX: 34, backgroundPaddingY: 28, h: 360 },
  },
];

async function probeVideoDurationMs(src: string): Promise<number | undefined> {
  if (!src || src.startsWith("{{") || typeof document === "undefined") return undefined;
  return await new Promise((resolve) => {
    const video = document.createElement("video");
    const done = (value?: number) => {
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => done(undefined), 6000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const ms = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined;
      done(ms && ms > 0 ? ms : undefined);
    };
    video.onerror = () => { window.clearTimeout(timer); done(undefined); };
    video.src = src;
  });
}

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
  const isWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
  const shortcutMod = isWindows ? "Ctrl" : "⌘";

  const { data: template } = useQuery({
    queryKey: ["template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("templates").select("*").eq("id", templateId).single();
      if (error) throw error;
      return data;
    },
  });

  const [doc, setDoc] = useState<EditorDocumentV2 | null>(null);
  const [history, setHistory] = useState<EditorDocumentV2[]>([]);
  const [future, setFuture] = useState<EditorDocumentV2[]>([]);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("elements");
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [previewOpen, setPreviewOpen] = useState(false);
  const playheadMs = useEditorPlaybackStore((s) => s.playheadMs);
  const playing = useEditorPlaybackStore((s) => s.playing);
  const timelineZoom = useEditorPlaybackStore((s) => s.timelineZoom);
  const setPlayheadMs = useEditorPlaybackStore((s) => s.setPlayheadMs);
  const setPlaying = useEditorPlaybackStore((s) => s.setPlaying);
  const togglePlaying = useEditorPlaybackStore((s) => s.togglePlaying);
  const setTimelineZoom = useEditorPlaybackStore((s) => s.setTimelineZoom);
  const resetPlayback = useEditorPlaybackStore((s) => s.resetPlayback);

  useEffect(() => {
    if (!template) return;
    const stored = (template.template_json as unknown as EditorDocument) ?? blankDocument(template.aspect_ratio as never);
    const initial = migrateDocumentV1ToV2(stored);
    setDoc(initial);
    resetPlayback();
  }, [template, resetPlayback]);


  useEffect(() => {
    if (!doc || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      const state = useEditorPlaybackStore.getState();
      const next = state.playheadMs + delta;
      if (next >= doc.durationMs) {
        state.setPlayheadMs(0);
        state.setPlaying(false);
        setSceneIndex(0);
        return;
      }
      state.setPlayheadMs(next);
      setSceneIndex(sceneIndexAtTime(doc, next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [doc, playing]);

  const seekTimeline = (ms: number) => {
    if (!doc) return;
    const next = Math.max(0, Math.min(doc.durationMs, ms));
    setPlayheadMs(next);
    setSceneIndex(sceneIndexAtTime(doc, next));
  };

  const selectTimelineScene = (index: number) => {
    if (!doc) return;
    setSceneIndex(index);
    setPlayheadMs(sceneStartMs(doc, index));
  };

  const updateClipTiming = (clip: EditorTimelineClip, nextStartMs: number, nextDurationMs: number, mode: "move" | "trim-left" | "trim-right") => {
    if (!doc || !clip.elementId) return;
    if (clip.kind === "audio" && clip.sceneId === "__project_audio__") {
      const audioClips = doc.audioClips.map((item) => item.id === clip.elementId ? applyAudioTimelineEdit(item, nextStartMs, nextDurationMs, mode) : item);
      commit({ ...doc, audioClips });
      setSelectedAudioId(clip.elementId);
      setSelectedId(null);
      return;
    }
    if (clip.kind === "captions" && clip.sceneId === "__project_captions__") {
      const captionClips = doc.captionClips.map((item) => item.id === clip.elementId ? applyCaptionTimelineEdit(item, nextStartMs, nextDurationMs, mode) : item);
      commit({ ...doc, captionClips });
      setSelectedCaptionId(clip.elementId);
      setSelectedAudioId(null);
      setSelectedId(null);
      return;
    }
    const targetSceneIndex = doc.scenes.findIndex((s) => s.id === clip.sceneId);
    if (targetSceneIndex < 0) return;
    const targetScene = doc.scenes[targetSceneIndex];
    const startOfScene = sceneStartMs(doc, targetSceneIndex);
    const localStart = Math.max(0, Math.min(targetScene.durationMs - 100, nextStartMs - startOfScene));
    const localDuration = Math.max(100, Math.min(nextDurationMs, targetScene.durationMs - localStart));
    const scenes = doc.scenes.map((s, i) => i !== targetSceneIndex ? s : ({
      ...s,
      elements: s.elements.map((el) => {
        if (el.id !== clip.elementId) return el;
        if (el.type !== "video") return { ...el, startMs: Math.round(localStart), durationMs: Math.round(localDuration) };
        return applyVideoTimelineEdit(el, targetScene.durationMs, localStart, localDuration, mode);
      }),
    }));
    commit({ ...doc, scenes });
  };

  const splitSelectedVideoAtPlayhead = () => {
    if (!doc || !selectedId) return;
    const targetSceneIndex = doc.scenes.findIndex((s) => s.elements.some((el) => el.id === selectedId));
    if (targetSceneIndex < 0) return;
    const targetScene = doc.scenes[targetSceneIndex];
    const element = targetScene.elements.find((el) => el.id === selectedId);
    if (!element || element.type !== "video") return;
    const localTime = playheadMs - sceneStartMs(doc, targetSceneIndex);
    const rightId = uid("vid");
    const split = splitVideoElement(element, localTime, rightId, targetScene.durationMs);
    if (!split) return;
    const [left, right] = split;
    const scenes = doc.scenes.map((s, i) => i !== targetSceneIndex ? s : ({
      ...s,
      elements: s.elements.flatMap((el) => el.id === selectedId ? [left, right] : [el]),
    }));
    commit({ ...doc, scenes });
    setSceneIndex(targetSceneIndex);
    setSelectedId(rightId);
    toast.success("Video split at playhead");
  };

  const scene = doc?.scenes[sceneIndex];
  const selected = useMemo(() => scene?.elements.find((e) => e.id === selectedId) ?? null, [scene, selectedId]);
  const selectedAudio = useMemo(() => doc?.audioClips.find((clip) => clip.id === selectedAudioId) ?? null, [doc, selectedAudioId]);
  const selectedCaption = useMemo(() => doc?.captionClips.find((clip) => clip.id === selectedCaptionId) ?? null, [doc, selectedCaptionId]);
  const canSplitSelected = !!doc && !!scene && !!selected && selected.type === "video" && (() => {
    const local = playheadMs - sceneStartMs(doc, sceneIndex);
    const start = selected.startMs ?? 0;
    const duration = selected.durationMs ?? scene.durationMs;
    return local >= start + 100 && local <= start + duration - 100;
  })();

  const commit = (next: EditorDocumentV2) => {
    if (!doc) return;
    setHistory((h) => [...h.slice(-49), doc]);
    setFuture([]);
    setDoc(syncV2Timeline(next));
  };
  const addAudioClip = async (src: string, name: string, role: AudioClipRole, sourceBlob?: Blob) => {
    if (!doc) return;
    const decoded = await decodeWaveform(sourceBlob ?? src);
    const mediaDurationMs = decoded?.durationMs;
    const durationMs = Math.max(500, Math.min(mediaDurationMs ?? doc.durationMs, doc.durationMs));
    const clip: EditorAudioClip = {
      id: uid("aud"), name, src, role, startMs: Math.round(playheadMs), durationMs, sourceStartMs: 0,
      sourceEndMs: mediaDurationMs ? Math.min(mediaDurationMs, durationMs) : durationMs, mediaDurationMs,
      playbackRate: 1, volume: role === "music" ? 0.65 : 1, muted: false, solo: false, loop: role === "music",
      fadeInMs: role === "music" ? 250 : 0, fadeOutMs: role === "music" ? 400 : 0, waveform: decoded?.waveform, ducking: role === "music",
    };
    commit({ ...doc, audioClips: [...doc.audioClips, clip] });
    setSelectedAudioId(clip.id);
    setSelectedCaptionId(null);
    setSelectedId(null);
    setPanel("audio");
  };
  const updateAudioClip = (id: string, patch: Partial<EditorAudioClip>) => {
    if (!doc) return;
    commit({ ...doc, audioClips: doc.audioClips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) });
  };
  const deleteAudioClip = (id: string) => {
    if (!doc) return;
    commit({ ...doc, audioClips: doc.audioClips.filter((clip) => clip.id !== id) });
    if (selectedAudioId === id) setSelectedAudioId(null);
  };
  const splitSelectedAudioAtPlayhead = () => {
    if (!doc || !selectedAudio) return;
    const pair = splitAudioClip(selectedAudio, playheadMs);
    if (!pair) return;
    const [left, right] = pair;
    commit({ ...doc, audioClips: doc.audioClips.flatMap((clip) => clip.id === selectedAudio.id ? [left, right] : [clip]) });
    setSelectedAudioId(right.id);
    toast.success("Audio split at playhead");
  };

  const addCaptionClip = (text = "Professional captions make Shorts easier to follow", preset: CaptionPresetId = "bold-pop") => {
    if (!doc) return;
    const durationMs = Math.min(4200, Math.max(1400, text.trim().split(/\s+/).length * 360));
    const startMs = Math.min(Math.max(0, playheadMs), Math.max(0, doc.durationMs - 500));
    const clip = createCaptionClip(text, startMs, Math.min(durationMs, doc.durationMs - startMs), preset, doc.width, doc.height);
    commit({ ...doc, captionClips: [...doc.captionClips, clip] });
    setSelectedCaptionId(clip.id); setSelectedAudioId(null); setSelectedId(null); setPanel("captions");
  };
  const updateCaptionClip = (id: string, patch: Partial<EditorCaptionClip>) => {
    if (!doc) return;
    commit({ ...doc, captionClips: doc.captionClips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) });
  };
  const deleteCaptionClip = (id: string) => {
    if (!doc) return;
    commit({ ...doc, captionClips: doc.captionClips.filter((clip) => clip.id !== id) });
    if (selectedCaptionId === id) setSelectedCaptionId(null);
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
    setSelectedId(e.id); setSelectedAudioId(null); setSelectedCaptionId(null);
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
          <button title={`Undo (${shortcutMod}+Z)`} onClick={undo} disabled={history.length === 0} className="size-8 grid place-items-center rounded-md hover:bg-white/5 disabled:opacity-30"><Undo2 className="size-4" /></button>
          <button title={`Redo (${isWindows ? "Ctrl+Y" : "⌘⇧Z"})`} onClick={redo} disabled={future.length === 0} className="size-8 grid place-items-center rounded-md hover:bg-white/5 disabled:opacity-30"><Redo2 className="size-4" /></button>
          <div className="w-px h-6 bg-border mx-1" />
          <button onClick={() => setPreviewOpen(true)} className="px-3 py-1.5 rounded-md text-sm font-semibold border border-border hover:bg-white/5 inline-flex items-center gap-1.5"><Eye className="size-3.5" /> Preview</button>
          <button title={`Save (${shortcutMod}+S)`} onClick={() => save.mutate()} disabled={save.isPending} className="px-3 py-1.5 rounded-md bg-brand text-white text-sm font-bold hover:bg-brand/90 inline-flex items-center gap-1.5">
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
            { id: "captions" as Panel, icon: Captions, label: "Captions" },
            { id: "audio" as Panel, icon: Music, label: "Audio" },
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
            selectedAudioId={selectedAudioId}
            selectedCaptionId={selectedCaptionId}
            onSelectAudio={(id) => { setSelectedAudioId(id); setSelectedCaptionId(null); setSelectedId(null); }}
            onSelectCaption={(id) => { setSelectedCaptionId(id); setSelectedAudioId(null); setSelectedId(null); }}
            onAddCaption={(text, preset) => addCaptionClip(text, preset)}
            onDeleteCaption={deleteCaptionClip}
            onDeleteAudio={deleteAudioClip}
            onAddAudioFromUrl={(url, role) => addAudioClip(url, url.split("/").pop() || role, role)}
            onUploadAudio={async (file, role) => { const url = await uploadToAssets(file); await addAudioClip(url, file.name, role, file); }}
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
            onAddVideoFromUrl={async (url) => {
              const mediaDurationMs = await probeVideoDurationMs(url);
              const durationMs = Math.min(scene.durationMs, mediaDurationMs ?? scene.durationMs);
              addElement({
                id: uid("vid"), type: "video", src: url, x: 0, y: 0, w: dims.w, h: dims.h,
                rotation: 0, opacity: 1, fit: "cover", muted: true, loop: false, autoplay: true,
                sourceStartMs: 0, sourceEndMs: mediaDurationMs ? Math.min(mediaDurationMs, durationMs) : durationMs,
                mediaDurationMs, playbackRate: 1, volume: 1, durationMs,
              } as VideoElement);
            }}
            onUploadFile={async (file) => {
              try {
                const url = await uploadToAssets(file);
                const isVideo = file.type.startsWith("video");
                if (file.type.startsWith("audio")) { await addAudioClip(url, file.name, "music", file); } else if (isVideo) {
                  const mediaDurationMs = await probeVideoDurationMs(url);
                  const durationMs = Math.min(scene.durationMs, mediaDurationMs ?? scene.durationMs);
                  addElement({ id: uid("vid"), type: "video", src: url, x: 0, y: 0, w: dims.w, h: dims.h, rotation: 0, opacity: 1, fit: "cover", muted: true, loop: false, autoplay: true, sourceStartMs: 0, sourceEndMs: mediaDurationMs ? Math.min(mediaDurationMs, durationMs) : durationMs, mediaDurationMs, playbackRate: 1, volume: 1, durationMs } as VideoElement);
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
            playheadMs={playheadMs}
            playing={playing}
          />
        </div>

        {/* Right panel */}
        <aside className="w-72 shrink-0 border-l border-border bg-panel overflow-y-auto">
          {selectedCaption ? <CaptionProperties clip={selectedCaption} doc={doc} update={(patch) => updateCaptionClip(selectedCaption.id, patch)} onDelete={() => deleteCaptionClip(selectedCaption.id)} /> : selectedAudio ? <AudioProperties clip={selectedAudio} doc={doc} update={(patch) => updateAudioClip(selectedAudio.id, patch)} updateMix={(patch) => commit({ ...doc, audioMix: { ...doc.audioMix, ...patch } })} onDelete={() => deleteAudioClip(selectedAudio.id)} onSplit={splitSelectedAudioAtPlayhead} /> : <RightPanel
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
          />}
        </aside>
      </div>

      <EditorTimeline
        doc={doc}
        sceneIndex={sceneIndex}
        selectedId={selectedId}
        selectedAudioId={selectedAudioId}
        selectedCaptionId={selectedCaptionId}
        playheadMs={playheadMs}
        playing={playing}
        zoom={timelineZoom}
        onTogglePlaying={togglePlaying}
        onSeek={seekTimeline}
        onSelectScene={selectTimelineScene}
        onAddScene={addScene}
        onSelectElement={(elementId, sceneId) => {
          const index = doc.scenes.findIndex((s) => s.id === sceneId);
          if (index >= 0) setSceneIndex(index);
          setSelectedId(elementId); setSelectedAudioId(null); setSelectedCaptionId(null);
        }}
        onSelectAudio={(audioId) => { setSelectedAudioId(audioId); setSelectedCaptionId(null); setSelectedId(null); }}
        onSelectCaption={(captionId) => { setSelectedCaptionId(captionId); setSelectedAudioId(null); setSelectedId(null); }}
        onZoomChange={setTimelineZoom}
        onClipTimingChange={updateClipTiming}
        onSplitSelected={splitSelectedVideoAtPlayhead}
        canSplitSelected={canSplitSelected}
      />

      <TimelineAudioPreview doc={doc} tMs={playheadMs} playing={playing} />

      {previewOpen && (
        <PreviewModal doc={doc} vars={previewVars} setVars={setPreviewVars} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

function PreviewModal({ doc, vars, setVars, onClose }: { doc: EditorDocument; vars: Record<string, string>; setVars: (fn: (p: Record<string, string>) => Record<string, string>) => void; onClose: () => void }) {
  const totalMs = Math.max(1000, timelineDurationMs(doc));
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
  const previewFrame = useMemo(() => evaluateTimelineFrame(doc, tMs, vars), [doc, tMs, vars]);
  const svg = useMemo(() => buildSceneSvgAtTime({ doc, tMs, vars, includeBackground: false }), [doc, tMs, vars]);
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
                </div>
              );
            })}
          </div>
          <img src={dataUrl} alt="preview" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
          <TimelineAudioPreview doc={doc} tMs={tMs} playing={playing} />
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

function Canvas({ doc, sceneIndex, previewVars, selectedId, setSelectedId, updateElement, zoom, setZoom, playheadMs, playing }: {
  doc: EditorDocumentV2; sceneIndex: number; previewVars: Record<string, string>;
  selectedId: string | null; setSelectedId: (id: string | null) => void;
  updateElement: (id: string, mut: (e: EditorElement) => EditorElement) => void;
  zoom: number | "fit"; setZoom: (z: number | "fit") => void;
  playheadMs: number;
  playing: boolean;
}) {
  const scene = doc.scenes[sceneIndex];
  const dims = CANVAS_DIMS[doc.aspect];
  const timelineFrame = useMemo(() => evaluateTimelineFrame(doc, playheadMs, previewVars), [doc, playheadMs, previewVars]);
  const localPlayheadMs = timelineFrame.sceneIndex === sceneIndex ? timelineFrame.localMs : Math.max(0, playheadMs - sceneStartMs(doc, sceneIndex));
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
        <div className="absolute inset-0" style={{
          transformOrigin: "center center",
          transform: `translate(${timelineFrame.camera.tx}px, ${timelineFrame.camera.ty}px) scale(${timelineFrame.camera.scale})`,
        }}>
          {(timelineFrame.sceneIndex === sceneIndex ? timelineFrame.visibleElements : []).map((elementState) => {
            const el = elementState.element;
            return (
            <ElementView
              key={el.id} el={el} frame={elementState.frame} videoState={elementState.video} selected={el.id === selectedId}
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
          {timelineFrame.visibleCaptions.map((captionState) => (
            <CaptionOverlay key={captionState.clip.id} state={captionState} />
          ))}
          {guides.v.map((x, i) => (
            <div key={`v-${i}-${x}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: x, width: 1, background: "#FF0033" }} />
          ))}
          {guides.h.map((y, i) => (
            <div key={`h-${i}-${y}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: y, height: 1, background: "#FF0033" }} />
          ))}
        </div>
        {timelineFrame.transitionOverlayOpacity > 0.001 && (
          <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: timelineFrame.transitionOverlayOpacity }} />
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-panel border border-border rounded-md px-1 py-1 text-xs">
        <button title="Zoom out" onClick={(e) => { e.stopPropagation(); zoomBy(1 / 1.2); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomOut className="size-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="px-2 h-7 hover:bg-white/5 rounded font-mono tabular-nums text-zinc-400">{Math.round(scale * 100)}%</button>
        <button title="Zoom in" onClick={(e) => { e.stopPropagation(); zoomBy(1.2); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><ZoomIn className="size-3.5" /></button>
        <button title="Fit to screen" onClick={(e) => { e.stopPropagation(); setZoom("fit"); }} className="size-7 grid place-items-center hover:bg-white/5 rounded"><Maximize className="size-3.5" /></button>
      </div>
      <div className="absolute bottom-3 left-3 text-[10px] text-zinc-500 pointer-events-none">
        Ctrl/⌘ + scroll to zoom · scroll or Alt-drag to pan
      </div>
    </div>
  );
}

function ElementView({ el, frame, videoState, selected, editing, onPointerDown, onDoubleClick, onTextChange, onEndEdit, onResizeStart, onRotateStart, previewVars, localPlayheadMs, playing }: {
  el: EditorElement; frame: ElementFrame; videoState?: TimelineVideoState; selected: boolean; editing: boolean;
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
    const textBoxStyle: React.CSSProperties = {
      width: "100%", height: "100%", boxSizing: "border-box", position: "relative",
      padding: `${el.backgroundPaddingY ?? 8}px ${el.backgroundPaddingX ?? 8}px`,
      display: "flex", alignItems: vJustify, overflow: "hidden",
      borderRadius: el.backgroundRadius ?? (el.background || el.backgroundGradient ? 12 : 0),
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
        <img draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit, pointerEvents: "none" }} src={el.src.startsWith("{{") ? "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080" : el.src} alt="" />
        {handles}
      </div>
    );
  }
  // video
  return (
    <div onPointerDown={onPointerDown} style={baseStyle}>
      {el.src && !el.src.startsWith("{{") ? (
        <TimelineVideo element={el} state={videoState} localPlayheadMs={localPlayheadMs} playing={playing} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: "#111", color: "#666", fontSize: 14 }}>Video · {el.src || "no source"}</div>
      )}
      {handles}
    </div>
  );
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

function CaptionProperties({ clip, doc, update, onDelete }: { clip: EditorCaptionClip; doc: EditorDocumentV2; update: (patch: Partial<EditorCaptionClip>) => void; onDelete: () => void }) {
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

function TimelineAudioPreview({ doc, tMs, playing }: { doc: EditorDocument; tMs: number; playing: boolean }) {
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

function AudioProperties({ clip, doc, update, updateMix, onDelete, onSplit }: {
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
      {clip.waveform?.length ? <div className="h-14 rounded-md border border-border bg-black/20 px-1 flex items-center gap-px">{clip.waveform.map((peak, i) => <span key={i} className="flex-1 bg-zinc-400 rounded-full" style={{ height: `${Math.max(6, peak * 100)}%` }} />)}</div> : <div className="h-10 grid place-items-center rounded-md border border-dashed border-border text-[10px] text-zinc-600">Waveform unavailable for this URL/source</div>}
      <div className="grid grid-cols-2 gap-2"><Row label="Start (ms)"><input type="number" min={0} step={50} value={Math.round(clip.startMs)} onChange={(e) => update({ startMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row><Row label="Duration (ms)"><input type="number" min={100} step={50} value={Math.round(clip.durationMs)} onChange={(e) => update({ durationMs: Math.max(100, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row></div>
      <div className="grid grid-cols-2 gap-2"><Row label="Source in (ms)"><input type="number" min={0} step={50} value={Math.round(clip.sourceStartMs ?? 0)} onChange={(e) => update({ sourceStartMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row><Row label="Source out (ms)"><input type="number" min={0} step={50} value={Math.round(clip.sourceEndMs ?? ((clip.sourceStartMs ?? 0) + clip.durationMs))} onChange={(e) => update({ sourceEndMs: Math.max((clip.sourceStartMs ?? 0) + 1, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row></div>
      <Row label="Playback speed"><select value={clip.playbackRate ?? 1} onChange={(e) => { const rate = Number(e.target.value); const span = (clip.sourceEndMs ?? ((clip.sourceStartMs ?? 0) + clip.durationMs * (clip.playbackRate ?? 1))) - (clip.sourceStartMs ?? 0); update({ playbackRate: rate, durationMs: Math.max(100, span / rate) }); }} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm">{[0.5,0.75,1,1.25,1.5,2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></Row>
      <Row label={`Volume ${Math.round(clip.volume * 100)}%`}><input type="range" min={0} max={1} step={0.01} value={clip.volume} disabled={clip.muted} onChange={(e) => update({ volume: Number(e.target.value) })} className="w-full" /></Row>
      <div className="grid grid-cols-2 gap-2"><Row label="Fade in (ms)"><input type="number" min={0} step={50} value={clip.fadeInMs ?? 0} onChange={(e) => update({ fadeInMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row><Row label="Fade out (ms)"><input type="number" min={0} step={50} value={clip.fadeOutMs ?? 0} onChange={(e) => update({ fadeOutMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm" /></Row></div>
      <div className="grid grid-cols-3 gap-2 text-xs"><label className="flex items-center gap-1.5"><input type="checkbox" checked={clip.muted ?? false} onChange={(e) => update({ muted: e.target.checked })} /> Mute</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={clip.solo ?? false} onChange={(e) => update({ solo: e.target.checked })} /> Solo</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={clip.loop ?? false} onChange={(e) => update({ loop: e.target.checked })} /> Loop</label></div>
      {canDuck ? <div className="space-y-2 rounded-md border border-border p-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={clip.ducking !== false} onChange={(e) => update({ ducking: e.target.checked })} /><span>Duck under voiceover</span></label><label className="flex items-center gap-2 text-[10px]"><input type="checkbox" checked={mix?.duckingEnabled ?? true} onChange={(e) => updateMix({ duckingEnabled: e.target.checked })} /> Auto ducking enabled</label><Row label={`Duck level ${Math.round((mix?.duckLevel ?? 0.22) * 100)}%`}><input type="range" min={0.05} max={0.8} step={0.01} value={mix?.duckLevel ?? 0.22} onChange={(e) => updateMix({ duckLevel: Number(e.target.value) })} className="w-full" /></Row><div className="grid grid-cols-2 gap-2"><Row label="Attack (ms)"><input type="number" min={0} step={20} value={mix?.attackMs ?? 180} onChange={(e) => updateMix({ attackMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row><Row label="Release (ms)"><input type="number" min={0} step={20} value={mix?.releaseMs ?? 320} onChange={(e) => updateMix({ releaseMs: Math.max(0, Number(e.target.value)) })} className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-xs" /></Row></div></div> : null}
      <button onClick={onSplit} className="w-full h-8 rounded-md border border-border hover:border-brand/50 text-xs inline-flex items-center justify-center gap-2"><Scissors className="size-3.5" /> Split at playhead</button>
      <p className="text-[10px] text-zinc-600">Music ducking is calculated from voiceover clip ranges using the project attack/release settings.</p>
    </div>
  );
}

function TimelineVideo({ element, state, localPlayheadMs, playing }: { element: VideoElement; state?: TimelineVideoState; localPlayheadMs: number; playing: boolean }) {
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

  return <video ref={ref} draggable={false} style={{ width: "100%", height: "100%", objectFit: element.fit, pointerEvents: "none", background: "#000" }} src={element.src} muted={element.muted ?? true} playsInline preload="auto" />;
}

function LeftPanel({ panel, doc, selectedAudioId, selectedCaptionId, onSelectAudio, onSelectCaption, onAddCaption, onDeleteCaption, onDeleteAudio, onAddAudioFromUrl, onUploadAudio, onAddText, onAddTextPreset, onAddShape, onAddImagePlaceholder, onAddImageFromUrl, onAddVideoFromUrl, onUploadFile, onAddVariable, scene, selectedId, setSelectedId, deleteElement }: {
  panel: Panel; doc: EditorDocumentV2;
  selectedAudioId: string | null; selectedCaptionId: string | null; onSelectAudio: (id: string) => void;
  onSelectCaption: (id: string) => void; onAddCaption: (text: string, preset: CaptionPresetId) => void; onDeleteCaption: (id: string) => void; onDeleteAudio: (id: string) => void;
  onAddAudioFromUrl: (url: string, role: AudioClipRole) => void; onUploadAudio: (file: File, role: AudioClipRole) => void;
  onAddText: () => void;
  onAddTextPreset: (patch: Partial<TextElement>) => void;
  onAddShape: (s: ShapeElement["shape"]) => void;
  onAddImagePlaceholder: () => void;
  onAddImageFromUrl: (url: string) => void;
  onAddVideoFromUrl: (url: string) => void;
  onUploadFile: (file: File) => void;
  onAddVariable: (name: string) => void;
  scene: EditorScene; selectedId: string | null; setSelectedId: (id: string) => void; deleteElement: (id: string) => void;
}) {
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

function RightPanel({ selected, update, scene, updateScene, onAlign, sceneIndex, sceneCount, onDuplicateScene, onDeleteScene, onMoveScene, onDuplicate, onDelete, onLayerUp, onLayerDown, onToggleLock }: {
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
}) {
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
            {(["cut","fade","slideLeft","slideRight","wipe"] as SceneTransition[]).map((t) => <option key={t} value={t}>{t}</option>)}
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