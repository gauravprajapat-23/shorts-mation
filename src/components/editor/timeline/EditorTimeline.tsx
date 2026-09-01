import { useMemo, useRef } from "react";
import { Minus, Pause, Play, Plus, Scissors, SkipBack, SkipForward } from "lucide-react";
import type { EditorDocumentV2, EditorTimelineClip } from "@/lib/types";
import { getTimelineSceneRanges } from "@/lib/timeline-engine";

const LABEL_W = 92;
const BASE_PX_PER_SEC = 76;
const MIN_CLIP_MS = 100;

function formatTime(ms: number) {
  const total = Math.max(0, ms) / 1000;
  const min = Math.floor(total / 60);
  const sec = total - min * 60;
  return `${String(min).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function EditorTimeline({
  doc,
  sceneIndex,
  selectedId,
  selectedAudioId,
  selectedCaptionId,
  selectedEffectId,
  playheadMs,
  playing,
  zoom,
  onTogglePlaying,
  onSeek,
  onSelectScene,
  onAddScene,
  onSelectElement,
  onSelectAudio,
  onSelectCaption,
  onSelectEffect,
  onZoomChange,
  onClipTimingChange,
  onSplitSelected,
  canSplitSelected,
  onKeyframeTimingChange,
}: {
  doc: EditorDocumentV2;
  sceneIndex: number;
  selectedId: string | null;
  selectedAudioId: string | null;
  selectedCaptionId: string | null;
  selectedEffectId: string | null;
  playheadMs: number;
  playing: boolean;
  zoom: number;
  onTogglePlaying: () => void;
  onSeek: (ms: number) => void;
  onSelectScene: (index: number) => void;
  onAddScene: () => void;
  onSelectElement: (elementId: string, sceneId: string) => void;
  onSelectAudio: (audioId: string) => void;
  onSelectCaption: (captionId: string) => void;
  onSelectEffect: (effectId: string) => void;
  onZoomChange: (zoom: number) => void;
  onClipTimingChange: (clip: EditorTimelineClip, nextStartMs: number, nextDurationMs: number, mode: "move" | "trim-left" | "trim-right") => void;
  onSplitSelected: () => void;
  canSplitSelected: boolean;
  onKeyframeTimingChange: (elementId: string, sceneId: string, keyframeId: string, timeMs: number) => void;
}) {
  const pxPerMs = (BASE_PX_PER_SEC * zoom) / 1000;
  const contentWidth = Math.max(720, doc.durationMs * pxPerMs + 120);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sceneBoundaries = useMemo(() => getTimelineSceneRanges(doc).map((range) => ({
    scene: range.scene, index: range.index, start: range.startMs, end: range.endMs,
  })), [doc]);

  const seekFromPointer = (clientX: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - LABEL_W;
    onSeek(Math.max(0, Math.min(doc.durationMs, x / pxPerMs)));
  };

  const beginClipDrag = (e: React.PointerEvent, clip: EditorTimelineClip, mode: "move" | "trim-left" | "trim-right") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const originalStart = clip.startMs;
    const originalDuration = clip.durationMs;
    const onMove = (ev: PointerEvent) => {
      const deltaMs = (ev.clientX - startX) / pxPerMs;
      if (mode === "move") {
        onClipTimingChange(clip, Math.max(0, originalStart + deltaMs), originalDuration, mode);
      } else if (mode === "trim-left") {
        const maxShift = originalDuration - MIN_CLIP_MS;
        const shift = Math.max(-originalStart, Math.min(maxShift, deltaMs));
        onClipTimingChange(clip, originalStart + shift, originalDuration - shift, mode);
      } else {
        onClipTimingChange(clip, originalStart, Math.max(MIN_CLIP_MS, originalDuration + deltaMs), mode);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginKeyframeDrag = (e: React.PointerEvent, clip: EditorTimelineClip, keyframeId: string, initialMs: number) => {
    e.stopPropagation();
    const startX = e.clientX;
    const onMove = (ev: PointerEvent) => {
      if (!clip.elementId) return;
      const next = Math.max(0, Math.min(clip.durationMs, initialMs + (ev.clientX - startX) / pxPerMs));
      onKeyframeTimingChange(clip.elementId, clip.sceneId, keyframeId, next);
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="h-[260px] shrink-0 border-t border-border bg-panel flex flex-col select-none">
      <div className="h-11 shrink-0 flex items-center gap-2 border-b border-border px-3">
        <button onClick={() => onSeek(0)} className="size-7 grid place-items-center rounded hover:bg-white/5" title="Start"><SkipBack className="size-3.5" /></button>
        <button onClick={onTogglePlaying} className="size-8 grid place-items-center rounded-md bg-brand text-white" title={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}</button>
        <button onClick={() => onSeek(Math.min(doc.durationMs, playheadMs + 1000 / doc.fps))} className="size-7 grid place-items-center rounded hover:bg-white/5" title="Next frame"><SkipForward className="size-3.5" /></button>
        <span className="font-mono text-xs text-zinc-300 w-[118px]">{formatTime(playheadMs)} <span className="text-zinc-600">/ {formatTime(doc.durationMs)}</span></span>
        <div className="h-5 w-px bg-border mx-1" />
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">Timeline</span>
        <button onClick={onAddScene} className="h-7 px-2 rounded border border-border hover:border-brand/60 text-[10px] text-zinc-300 inline-flex items-center gap-1"><Plus className="size-3" /> Scene</button>
        <button disabled={!canSplitSelected} onClick={onSplitSelected} className="h-7 px-2 rounded border border-border disabled:opacity-30 disabled:cursor-not-allowed hover:border-brand/60 text-[10px] text-zinc-300 inline-flex items-center gap-1" title="Split selected video at playhead"><Scissors className="size-3" /> Split</button>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => onZoomChange(zoom - 0.25)} className="size-7 grid place-items-center rounded hover:bg-white/5"><Minus className="size-3.5" /></button>
          <input aria-label="Timeline zoom" type="range" min={0.5} max={4} step={0.25} value={zoom} onChange={(e) => onZoomChange(Number(e.target.value))} className="w-24" />
          <button onClick={() => onZoomChange(zoom + 0.25)} className="size-7 grid place-items-center rounded hover:bg-white/5"><Plus className="size-3.5" /></button>
          <span className="w-9 text-right text-[10px] text-zinc-500">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-auto relative" onPointerDown={(e) => seekFromPointer(e.clientX)}>
        <div className="relative" style={{ width: LABEL_W + contentWidth, minHeight: 210 }}>
          <div className="sticky left-0 z-30 h-7 border-r border-b border-border bg-panel" style={{ width: LABEL_W }} />
          <div className="absolute top-0 h-7 border-b border-border" style={{ left: LABEL_W, width: contentWidth }}>
            {Array.from({ length: Math.ceil(doc.durationMs / 1000) + 1 }, (_, sec) => (
              <div key={sec} className="absolute top-0 h-full border-l border-white/10 text-[9px] text-zinc-600 pl-1 pt-1" style={{ left: sec * 1000 * pxPerMs }}>{sec}s</div>
            ))}
          </div>

          <div className="sticky left-0 z-30 flex items-center h-7 px-2 border-r border-b border-border bg-panel text-[10px] font-bold text-zinc-500 uppercase" style={{ width: LABEL_W }}>Scenes</div>
          <div className="absolute h-7 border-b border-border bg-black/10" style={{ top: 27, left: LABEL_W, width: contentWidth }}>
            {sceneBoundaries.map(({ scene, index, start, end }) => (
              <button key={scene.id} onPointerDown={(e) => e.stopPropagation()} onClick={() => onSelectScene(index)} className={`absolute top-1 h-5 rounded px-2 text-[9px] text-left truncate border ${sceneIndex === index ? "border-brand bg-brand/20 text-white" : "border-border bg-white/5 text-zinc-500"}`} style={{ left: start * pxPerMs + 2, width: Math.max(22, (end - start) * pxPerMs - 4) }}>{index + 1}. {scene.name}</button>
            ))}
          </div>

          {doc.tracks.map((track, row) => {
            const top = 54 + row * 34;
            return (
              <div key={track.id}>
                <div className="sticky left-0 z-30 absolute flex items-center h-[34px] px-2 border-r border-b border-border bg-panel text-[10px] text-zinc-400" style={{ top, width: LABEL_W }}>{track.name}</div>
                <div className="absolute h-[34px] border-b border-border/70 bg-black/5" style={{ top, left: LABEL_W, width: contentWidth }}>
                  {track.clips.map((clip) => {
                    const isAudio = track.kind === "audio" && clip.sceneId === "__project_audio__";
                    const isCaption = track.kind === "captions" && clip.sceneId === "__project_captions__";
                    const isEffect = track.kind === "effects" && clip.sceneId === "__project_effects__";
                    const selected = isAudio ? clip.elementId === selectedAudioId : isCaption ? clip.elementId === selectedCaptionId : isEffect ? clip.elementId === selectedEffectId : clip.elementId === selectedId;
                    const audio = isAudio ? doc.audioClips.find((item) => item.id === clip.elementId) : undefined;
                    const caption = isCaption ? doc.captionClips.find((item) => item.id === clip.elementId) : undefined;
                    const effect = isEffect ? doc.effectClips.find((item) => item.id === clip.elementId) : undefined;
                    return (
                      <div key={clip.id} onPointerDown={(e) => { beginClipDrag(e, clip, "move"); if (isAudio && clip.elementId) onSelectAudio(clip.elementId); if (isCaption && clip.elementId) onSelectCaption(clip.elementId); if (isEffect && clip.elementId) onSelectEffect(clip.elementId); }} onDoubleClick={(e) => { e.stopPropagation(); if (!clip.elementId) return; isAudio ? onSelectAudio(clip.elementId) : isCaption ? onSelectCaption(clip.elementId) : isEffect ? onSelectEffect(clip.elementId) : onSelectElement(clip.elementId, clip.sceneId); }} className={`absolute top-1 h-7 rounded border text-[9px] overflow-hidden cursor-grab active:cursor-grabbing ${selected ? "border-brand bg-brand/25 text-white" : "border-white/15 bg-white/10 text-zinc-300"}`} style={{ left: clip.startMs * pxPerMs, width: Math.max(18, clip.durationMs * pxPerMs) }} title={`${clip.name} · ${(clip.durationMs/1000).toFixed(2)}s`}>
                        <div onPointerDown={(e) => beginClipDrag(e, clip, "trim-left")} className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/10 hover:bg-brand/60" />
                        {audio?.waveform?.length ? <div className="absolute inset-x-2 top-1 bottom-1 flex items-center gap-px opacity-50 pointer-events-none">{audio.waveform.slice(0, 80).map((peak, i) => <span key={i} className="flex-1 bg-current rounded-full" style={{ height: `${Math.max(8, peak * 100)}%` }} />)}</div> : null}
                        {!isAudio && !isCaption && clip.elementId ? (doc.scenes.find((s)=>s.id===clip.sceneId)?.elements.find((el)=>el.id===clip.elementId)?.keyframes ?? []).map((kf) => <button key={kf.id} title={`Keyframe ${Math.round(kf.timeMs)}ms · drag to retime`} onPointerDown={(e)=>beginKeyframeDrag(e,clip,kf.id,kf.timeMs)} onClick={(e)=>{e.stopPropagation();onSeek(clip.startMs+kf.timeMs);}} className="absolute z-20 top-1/2 size-2.5 -translate-y-1/2 rotate-45 bg-amber-300 border border-black/60 hover:scale-125" style={{ left: Math.max(7, Math.min(clip.durationMs*pxPerMs-7,kf.timeMs*pxPerMs)) }} />) : null}
                        <div className="relative z-10 px-2.5 leading-7 truncate">{audio ? `${audio.role.toUpperCase()} · ${clip.name}` : caption ? `CC · ${caption.words.map((word) => word.text).join(" ").slice(0, 36)}` : effect ? `FX · ${effect.kind}` : clip.name}</div>
                        <div onPointerDown={(e) => beginClipDrag(e, clip, "trim-right")} className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/10 hover:bg-brand/60" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {sceneBoundaries.map(({ start }, i) => <div key={`guide-${i}`} className="absolute top-7 bottom-0 border-l border-dashed border-white/10 pointer-events-none" style={{ left: LABEL_W + start * pxPerMs }} />)}
          <div className="absolute top-0 bottom-0 w-px bg-brand z-40 pointer-events-none" style={{ left: LABEL_W + playheadMs * pxPerMs }}>
            <div className="absolute -left-[5px] top-0 size-[11px] rotate-45 bg-brand rounded-[2px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
