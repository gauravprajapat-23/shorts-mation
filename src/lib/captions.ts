import type { CaptionPresetId, CaptionStyle, CaptionWord, EditorCaptionClip } from "@/lib/types";

export const CAPTION_PRESETS: Array<{ id: CaptionPresetId; label: string; hint: string; style: CaptionStyle }> = [
  { id: "bold-pop", label: "Bold Pop", hint: "Large active-word punch", style: { preset: "bold-pop", animation: "pop", fontFamily: "Plus Jakarta Sans", fontSize: 72, fontWeight: 900, color: "#FFFFFF", activeColor: "#FFE600", background: "rgba(0,0,0,0.35)", stroke: "#000000", strokeWidth: 8, radius: 18, padding: 18, maxWordsPerLine: 5, uppercase: true } },
  { id: "karaoke", label: "Karaoke", hint: "Word-by-word color sweep", style: { preset: "karaoke", animation: "karaoke", fontFamily: "Plus Jakarta Sans", fontSize: 62, fontWeight: 800, color: "#FFFFFF", activeColor: "#FF0033", background: "rgba(0,0,0,0.5)", stroke: "#000000", strokeWidth: 5, radius: 16, padding: 16, maxWordsPerLine: 6 } },
  { id: "clean", label: "Clean", hint: "Minimal readable subtitles", style: { preset: "clean", animation: "minimal", fontFamily: "Inter", fontSize: 54, fontWeight: 700, color: "#FFFFFF", activeColor: "#FFFFFF", background: "rgba(0,0,0,0.72)", radius: 12, padding: 14, maxWordsPerLine: 8 } },
  { id: "gaming", label: "Gaming", hint: "High-energy neon highlight", style: { preset: "gaming", animation: "highlight", fontFamily: "Impact", fontSize: 70, fontWeight: 900, color: "#FFFFFF", activeColor: "#00F5FF", background: "rgba(20,0,40,0.58)", stroke: "#000000", strokeWidth: 7, radius: 20, padding: 18, maxWordsPerLine: 5, uppercase: true } },
  { id: "podcast", label: "Podcast", hint: "Compact conversational captions", style: { preset: "podcast", animation: "highlight", fontFamily: "Plus Jakarta Sans", fontSize: 58, fontWeight: 800, color: "#E5E7EB", activeColor: "#FFFFFF", background: "rgba(0,0,0,0.48)", radius: 14, padding: 16, maxWordsPerLine: 7 } },
];

export function captionPreset(id: CaptionPresetId): CaptionStyle {
  return { ...(CAPTION_PRESETS.find((item) => item.id === id)?.style ?? CAPTION_PRESETS[0]!.style) };
}

export function wordsFromText(text: string, durationMs: number): CaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  // Give punctuation-ending words slightly more breathing room.
  const weights = tokens.map((token) => Math.max(0.7, Math.min(2.2, token.length / 5 + (/[.!?]$/.test(token) ? 0.55 : /[,;:]$/.test(token) ? 0.25 : 0))));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return tokens.map((text, i) => {
    const span = i === tokens.length - 1 ? durationMs - cursor : Math.round(durationMs * weights[i]! / total);
    const startMs = cursor;
    const endMs = Math.max(startMs + 40, Math.min(durationMs, startMs + span));
    cursor = endMs;
    return { id: `cw_${Date.now().toString(36)}_${i}_${Math.random().toString(36).slice(2,6)}`, text, startMs, endMs };
  });
}

export function retimeCaptionWords(words: CaptionWord[], durationMs: number): CaptionWord[] {
  if (!words.length) return words;
  const oldEnd = Math.max(1, words[words.length - 1]?.endMs ?? durationMs);
  const scale = durationMs / oldEnd;
  return words.map((word, i) => ({
    ...word,
    startMs: Math.max(0, Math.round(word.startMs * scale)),
    endMs: i === words.length - 1 ? durationMs : Math.max(40, Math.round(word.endMs * scale)),
  }));
}

export function applyCaptionTimelineEdit(clip: EditorCaptionClip, startMs: number, durationMs: number, mode: "move" | "trim-left" | "trim-right"): EditorCaptionClip {
  const nextDuration = Math.max(100, Math.round(durationMs));
  if (mode === "move") return { ...clip, startMs: Math.max(0, Math.round(startMs)) };
  if (mode === "trim-left") {
    const shift = Math.max(-clip.startMs, Math.round(startMs) - clip.startMs);
    const retained = clip.words
      .filter((word) => word.endMs > shift)
      .map((word) => ({ ...word, startMs: Math.max(0, word.startMs - shift), endMs: Math.max(40, word.endMs - shift) }));
    return { ...clip, startMs: Math.max(0, Math.round(startMs)), durationMs: nextDuration, words: retained };
  }
  return { ...clip, durationMs: nextDuration, words: clip.words.filter((word) => word.startMs < nextDuration).map((word) => ({ ...word, endMs: Math.min(nextDuration, word.endMs) })) };
}

export function createCaptionClip(text: string, startMs: number, durationMs: number, preset: CaptionPresetId = "bold-pop", canvasWidth = 1080, canvasHeight = 1920): EditorCaptionClip {
  const safeDuration = Math.max(500, durationMs);
  return {
    id: `caption_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,
    name: text.trim().slice(0, 36) || "Caption",
    startMs: Math.max(0, startMs), durationMs: safeDuration,
    x: Math.round(canvasWidth * 0.08), y: Math.round(canvasHeight * 0.68), w: Math.round(canvasWidth * 0.84), h: Math.round(canvasHeight * 0.18),
    words: wordsFromText(text || "Your caption here", safeDuration),
    style: captionPreset(preset),
  };
}
