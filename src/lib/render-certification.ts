import { collectTimelineAudioSegments, collectTimelineVideoSegments, evaluateTimelineFrame, getTimelineSceneRanges, timelineDurationMs } from "@/lib/timeline-engine";
import type { EditorDocument } from "@/lib/types";

export type RenderGoldenManifest = {
  durationMs: number;
  scenes: Array<{ id: string; startMs: number; durationMs: number }>;
  frames: Array<{
    tMs: number;
    sceneId: string | null;
    visibleElementIds: string[];
    visibleCaptionIds: string[];
    visibleEffectIds: string[];
    camera: { scale: number; tx: number; ty: number };
  }>;
  videoSegments: Array<{ elementId: string; startMs: number; durationMs: number; sourceStartMs: number; sourceEndMs: number }>;
  audioSegments: Array<{ clipId: string; startMs: number; durationMs: number; sourceStartMs: number; sourceEndMs: number }>;
};

export function buildRenderGoldenManifest(doc: EditorDocument, sampleTimesMs?: number[]): RenderGoldenManifest {
  const durationMs = timelineDurationMs(doc);
  const ranges = getTimelineSceneRanges(doc);
  const samples = sampleTimesMs ?? ranges.flatMap((r) => [r.startMs, r.startMs + Math.min(500, r.durationMs / 2), Math.max(r.startMs, r.endMs - 1)]);
  return {
    durationMs,
    scenes: ranges.map((r) => ({ id: r.scene.id, startMs: r.startMs, durationMs: r.durationMs })),
    frames: samples.map((tMs) => {
      const frame = evaluateTimelineFrame(doc, tMs);
      return {
        tMs,
        sceneId: frame.scene?.id ?? null,
        visibleElementIds: frame.visibleElements.map((s) => s.element.id).sort(),
        visibleCaptionIds: frame.visibleCaptions.map((s) => s.clip.id).sort(),
        visibleEffectIds: frame.visibleEffects.map((s) => s.clip.id).sort(),
        camera: {
          scale: Number(frame.camera.scale.toFixed(6)),
          tx: Number(frame.camera.tx.toFixed(3)),
          ty: Number(frame.camera.ty.toFixed(3)),
        },
      };
    }),
    videoSegments: collectTimelineVideoSegments(doc).map((s) => ({
      elementId: s.element.id,
      startMs: Number(s.startMs.toFixed(3)),
      durationMs: Number(s.durationMs.toFixed(3)),
      sourceStartMs: Number(s.sourceStartMs.toFixed(3)),
      sourceEndMs: Number(s.sourceEndMs.toFixed(3)),
    })),
    audioSegments: collectTimelineAudioSegments(doc).map((s) => ({
      clipId: s.clip.id,
      startMs: Number(s.startMs.toFixed(3)),
      durationMs: Number(s.durationMs.toFixed(3)),
      sourceStartMs: Number(s.sourceStartMs.toFixed(3)),
      sourceEndMs: Number(s.sourceEndMs.toFixed(3)),
    })),
  };
}

export type BrowserRenderBudget = {
  durationMs: number;
  fps: number;
  frames: number;
  outputWidth: number;
  outputHeight: number;
  rawRgbaFrameBytes: number;
  estimatedOverlayBytes: number;
  safe: boolean;
  reasons: string[];
};

export function estimateBrowserRenderBudget(input: { doc: EditorDocument; fps: number; outputWidth: number; outputHeight: number; maxFrames?: number; maxPixels?: number }): BrowserRenderBudget {
  const durationMs = timelineDurationMs(input.doc);
  const fps = Math.max(1, input.fps);
  const frames = Math.ceil((durationMs / 1000) * fps);
  const rawRgbaFrameBytes = input.outputWidth * input.outputHeight * 4;
  const estimatedOverlayBytes = rawRgbaFrameBytes * Math.min(frames, 3); // working-set estimate, not encoded output size
  const maxFrames = input.maxFrames ?? 1800;
  const maxPixels = input.maxPixels ?? 1920 * 1080 * 2;
  const reasons: string[] = [];
  if (frames > maxFrames) reasons.push(`frame count ${frames} exceeds browser budget ${maxFrames}`);
  if (input.outputWidth * input.outputHeight > maxPixels) reasons.push(`output pixel count exceeds browser budget ${maxPixels}`);
  return { durationMs, fps, frames, outputWidth: input.outputWidth, outputHeight: input.outputHeight, rawRgbaFrameBytes, estimatedOverlayBytes, safe: reasons.length === 0, reasons };
}
