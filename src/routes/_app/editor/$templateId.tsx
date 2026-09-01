import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CANVAS_DIMS, blankDocument, renderText, uid } from "@/lib/editor-defaults";
import type { EditorDocument, EditorDocumentV2, EditorElement, EditorScene, EditorTimelineClip, EditorAudioClip, AudioClipRole, EditorCaptionClip, CaptionPresetId, EditorEffectClip, EffectKind, MediaFilterPreset, TextElement, ShapeElement, ImageElement, VideoElement, AnimationSpec, InAnim, OutAnim, LoopAnim, TextReveal, CameraMove, SceneTransition, EaseName, ElementKeyframe, KeyframeProperty, BrandKit, EditorReusableComponent, AutomationVariableDefinition, AutomationVariableType, VisibilityOperator, RetentionPresetId, SceneRole } from "@/lib/types";
import { ArrowLeft, Type, Image as ImageIcon, Square, Layers, Variable, Save, Undo2, Redo2, Plus, Trash2, Eye, Copy, Lock, Unlock, ArrowUp, ArrowDown, ZoomIn, ZoomOut, Maximize, Film, Upload, Circle, RotateCw, Music, Mic2, Volume2, Captions, Sparkles } from "lucide-react";
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
import { cssFilterForLook, resolveMediaLook } from "@/lib/effects";
import { MOTION_PRESETS, applyMotionPreset, defaultKeyframeValues, type MotionPresetId } from "@/lib/keyframes";
import { builtInBrandComponents, componentFromElements, instantiateComponent, normalizeBrandKit, loadBrandLibrary, saveBrandLibrary, loadComponentLibrary, saveComponentLibrary } from "@/lib/brand-components";
import { automationDefinitions, materializeAutomationDocument } from "@/lib/automation-variables";
import { analyzeRetention, applyRetentionPreset, normalizeRetention } from "@/lib/retention";
import { parseEditorDocument } from "@/lib/editor-document-schema";

import { PreviewModal, Canvas, LeftPanel, RightPanel, TimelineAudioPreview, AudioProperties, CaptionProperties, EffectProperties } from "@/components/editor/EditorSurface";

export const Route = createFileRoute("/_app/editor/$templateId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Editor — ShortsForge" }] }),
  component: EditorPage,
});

type Panel = "elements" | "text" | "shapes" | "captions" | "audio" | "effects" | "retention" | "brand" | "components" | "variables" | "layers";

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
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("elements");
  const [brandLibrary, setBrandLibraryState] = useState<BrandKit[]>(() => loadBrandLibrary());
  const [componentLibrary, setComponentLibraryState] = useState<EditorReusableComponent[]>(() => loadComponentLibrary());
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
    const stored = template.template_json ? parseEditorDocument(template.template_json) : blankDocument(template.aspect_ratio as never);
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
    if (clip.kind === "effects" && clip.sceneId === "__project_effects__") {
      const effectClips = doc.effectClips.map((item) => item.id === clip.elementId ? { ...item, startMs: Math.max(0, Math.round(nextStartMs)), durationMs: Math.max(100, Math.round(nextDurationMs)) } : item);
      commit({ ...doc, effectClips });
      setSelectedEffectId(clip.elementId); setSelectedCaptionId(null); setSelectedAudioId(null); setSelectedId(null);
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

  const addEffectClip = (kind: EffectKind) => {
    if (!doc) return;
    const remaining = Math.max(300, doc.durationMs - playheadMs);
    const clip: EditorEffectClip = { id: uid("fx"), name: kind.replace(/-/g, " "), kind, startMs: Math.round(playheadMs), durationMs: Math.min(2500, remaining), intensity: kind === "grain" ? 0.28 : 0.55, opacity: 1, color: kind === "light-leak" ? "#FF7A18" : "#FFFFFF", seed: Math.floor(Math.random()*9999) };
    commit({ ...doc, effectClips: [...doc.effectClips, clip] });
    setSelectedEffectId(clip.id); setSelectedCaptionId(null); setSelectedAudioId(null); setSelectedId(null); setPanel("effects");
  };
  const updateEffectClip = (id: string, patch: Partial<EditorEffectClip>) => doc && commit({ ...doc, effectClips: doc.effectClips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) });
  const deleteEffectClip = (id: string) => { if (!doc) return; commit({ ...doc, effectClips: doc.effectClips.filter((clip) => clip.id !== id) }); if (selectedEffectId === id) setSelectedEffectId(null); };

  const scene = doc?.scenes[sceneIndex];
  const selected = useMemo(() => scene?.elements.find((e) => e.id === selectedId) ?? null, [scene, selectedId]);
  const selectedAudio = useMemo(() => doc?.audioClips.find((clip) => clip.id === selectedAudioId) ?? null, [doc, selectedAudioId]);
  const selectedCaption = useMemo(() => doc?.captionClips.find((clip) => clip.id === selectedCaptionId) ?? null, [doc, selectedCaptionId]);
  const selectedEffect = useMemo(() => doc?.effectClips.find((clip) => clip.id === selectedEffectId) ?? null, [doc, selectedEffectId]);
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

  const updateBrand = (patch: Partial<BrandKit>) => {
    if (!doc) return;
    const current = normalizeBrandKit(doc.brand);
    commit({ ...doc, brand: normalizeBrandKit({ ...current, ...patch, colors: { ...current.colors, ...(patch.colors ?? {}) }, typography: { ...current.typography, ...(patch.typography ?? {}) }, variables: { ...current.variables, ...(patch.variables ?? {}) } }) });
  };

  const updateAutomationVariable = (id: string, patch: Partial<AutomationVariableDefinition>) => {
    if (!doc) return;
    const defs = automationDefinitions(doc).map((def) => def.id === id ? { ...def, ...patch } : def);
    const variables = Array.from(new Set(defs.map((def) => def.name.trim()).filter(Boolean)));
    commit({ ...doc, automationVariables: defs, variables });
  };

  const addAutomationVariable = () => {
    if (!doc) return;
    const existing = new Set(automationDefinitions(doc).map((def) => def.name));
    let n = 1, name = "variable";
    while (existing.has(name)) name = `variable_${++n}`;
    const def: AutomationVariableDefinition = { id: uid("var"), name, label: "New variable", type: "text" };
    commit({ ...doc, automationVariables: [...automationDefinitions(doc), def], variables: [...doc.variables.filter((v) => v !== name), name] });
  };

  const deleteAutomationVariable = (id: string) => {
    if (!doc) return;
    const defs = automationDefinitions(doc).filter((def) => def.id !== id);
    commit({ ...doc, automationVariables: defs, variables: defs.map((def) => def.name) });
  };

  const saveReusableComponent = (mode: "selected" | "scene") => {
    if (!doc) return;
    const source = mode === "selected" ? scene.elements.filter((el) => el.id === selectedId) : scene.elements;
    if (!source.length) { toast.error(mode === "selected" ? "Select an element first" : "This scene has no elements"); return; }
    const name = prompt("Component name", mode === "selected" ? "Reusable element" : `${scene.name} group`);
    if (!name) return;
    const component = componentFromElements(name, source, uid);
    commit({ ...doc, components: [...(doc.components ?? []), component] });
    const nextLibrary = [...componentLibrary.filter((item) => item.id !== component.id), component];
    setComponentLibraryState(nextLibrary); saveComponentLibrary(nextLibrary);
    toast.success(`Saved ${component.name} to component library`);
  };

  const insertReusableComponent = (component: EditorReusableComponent) => {
    if (!doc) return;
    const originX = Math.max(0, Math.round((dims.w - component.width) / 2));
    const originY = Math.max(0, Math.round((dims.h - component.height) / 2));
    const elements = instantiateComponent(component, originX, originY, uid).map((el) => ({
      ...el,
      startMs: Math.max(0, Math.min(el.startMs ?? 0, scene.durationMs - 100)),
      durationMs: Math.max(100, Math.min(el.durationMs ?? scene.durationMs, scene.durationMs - Math.max(0, el.startMs ?? 0))),
    } as EditorElement));
    commit({ ...doc, scenes: doc.scenes.map((s, i) => i === sceneIndex ? { ...s, elements: [...s.elements, ...elements] } : s) });
    setSelectedId(elements[elements.length - 1]?.id ?? null);
    setSelectedAudioId(null); setSelectedCaptionId(null); setSelectedEffectId(null);
  };

  const deleteReusableComponent = (id: string) => {
    if (!doc) return;
    commit({ ...doc, components: (doc.components ?? []).filter((component) => component.id !== id) });
    const nextLibrary = componentLibrary.filter((component) => component.id !== id);
    setComponentLibraryState(nextLibrary); saveComponentLibrary(nextLibrary);
  };
  const saveCurrentBrandKit = () => {
    if (!doc) return;
    const brand = normalizeBrandKit(doc.brand);
    const next = [...brandLibrary.filter((item) => item.id !== brand.id), brand];
    setBrandLibraryState(next); saveBrandLibrary(next); toast.success(`Saved ${brand.name} brand kit`);
  };
  const applySavedBrandKit = (brand: BrandKit) => { if (doc) commit({ ...doc, brand: normalizeBrandKit(brand) }); };
  const deleteSavedBrandKit = (id: string) => { const next=brandLibrary.filter((item)=>item.id!==id); setBrandLibraryState(next); saveBrandLibrary(next); };
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
      parseEditorDocument(doc);
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
            { id: "effects" as Panel, icon: Sparkles, label: "Effects" },
            { id: "retention" as Panel, icon: Eye, label: "Retention" },
            { id: "brand" as Panel, icon: Sparkles, label: "Brand kit" },
            { id: "components" as Panel, icon: Copy, label: "Components" },
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
            onUpdateBrand={updateBrand}
            brandLibrary={brandLibrary}
            componentLibrary={componentLibrary}
            onSaveBrandKit={saveCurrentBrandKit}
            onApplyBrandKit={applySavedBrandKit}
            onDeleteBrandKit={deleteSavedBrandKit}
            onUploadBrandAsset={async (kind, file) => { const url = await uploadToAssets(file); updateBrand(kind === "logo" ? { logoSrc: url } : { watermarkSrc: url }); }}
            onInsertComponent={insertReusableComponent}
            onSaveSelectedComponent={() => saveReusableComponent("selected")}
            onSaveSceneComponent={() => saveReusableComponent("scene")}
            onDeleteComponent={deleteReusableComponent}
            selectedAudioId={selectedAudioId}
            selectedCaptionId={selectedCaptionId}
            selectedEffectId={selectedEffectId}
            onSelectAudio={(id) => { setSelectedAudioId(id); setSelectedCaptionId(null); setSelectedId(null); }}
            onSelectCaption={(id) => { setSelectedCaptionId(id); setSelectedEffectId(null); setSelectedAudioId(null); setSelectedId(null); }}
            onSelectEffect={(id) => { setSelectedEffectId(id); setSelectedCaptionId(null); setSelectedAudioId(null); setSelectedId(null); }}
            onAddEffect={addEffectClip}
            onDeleteEffect={deleteEffectClip}
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
            onUpdateAutomationVariable={updateAutomationVariable}
            onAddAutomationVariable={addAutomationVariable}
            onDeleteAutomationVariable={deleteAutomationVariable}
            onUpdateSceneAutomation={(patch) => updateScene((s) => ({ ...s, ...patch }))}
            onApplyRetentionPreset={(preset) => commit(syncV2Timeline(applyRetentionPreset(doc, preset, uid)))}
            onUpdateRetention={(patch) => commit(syncV2Timeline({ ...doc, retention: { ...normalizeRetention(doc.retention), ...patch } }))}
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
          {selectedEffect ? <EffectProperties clip={selectedEffect} doc={doc} update={(patch) => updateEffectClip(selectedEffect.id, patch)} onDelete={() => deleteEffectClip(selectedEffect.id)} /> : selectedCaption ? <CaptionProperties clip={selectedCaption} doc={doc} update={(patch) => updateCaptionClip(selectedCaption.id, patch)} onDelete={() => deleteCaptionClip(selectedCaption.id)} /> : selectedAudio ? <AudioProperties clip={selectedAudio} doc={doc} update={(patch) => updateAudioClip(selectedAudio.id, patch)} updateMix={(patch) => commit({ ...doc, audioMix: { ...doc.audioMix, ...patch } })} onDelete={() => deleteAudioClip(selectedAudio.id)} onSplit={splitSelectedAudioAtPlayhead} /> : <RightPanel
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
            elementTimeMs={selected ? Math.max(0, evaluateTimelineFrame(doc, playheadMs).localMs - (selected.startMs ?? 0)) : 0}
          />}
        </aside>
      </div>

      <EditorTimeline
        doc={doc}
        sceneIndex={sceneIndex}
        selectedId={selectedId}
        selectedAudioId={selectedAudioId}
        selectedCaptionId={selectedCaptionId}
            selectedEffectId={selectedEffectId}
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
        onSelectCaption={(captionId) => { setSelectedCaptionId(captionId); setSelectedEffectId(null); setSelectedAudioId(null); setSelectedId(null); }}
        onSelectEffect={(effectId) => { setSelectedEffectId(effectId); setSelectedCaptionId(null); setSelectedAudioId(null); setSelectedId(null); }}
        onZoomChange={setTimelineZoom}
        onClipTimingChange={updateClipTiming}
        onSplitSelected={splitSelectedVideoAtPlayhead}
        canSplitSelected={canSplitSelected}
        onKeyframeTimingChange={(elementId, sceneId, keyframeId, timeMs) => {
          const sIndex = doc.scenes.findIndex((s) => s.id === sceneId);
          if (sIndex < 0) return;
          setSceneIndex(sIndex);
          updateElement(elementId, (el) => ({ ...el, keyframes: (el.keyframes ?? []).map((kf) => kf.id === keyframeId ? { ...kf, timeMs: Math.max(0, Math.min(timeMs, el.durationMs ?? doc.scenes[sIndex]!.durationMs)) } : kf) }));
        }}
      />

      <TimelineAudioPreview doc={doc} tMs={playheadMs} playing={playing} />

      {previewOpen && (
        <PreviewModal doc={doc} vars={previewVars} setVars={setPreviewVars} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

