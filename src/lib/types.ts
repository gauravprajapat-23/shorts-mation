import type { Database } from "@/integrations/supabase/types";

type T = Database["public"]["Tables"];
export type Template = T["templates"]["Row"];
export type Campaign = T["campaigns"]["Row"];
export type CampaignItem = T["campaign_items"]["Row"];
export type Asset = T["assets"]["Row"];
export type YoutubeConnection = T["youtube_connections"]["Row"];
export type AutomationLog = T["automation_logs"]["Row"];

export type AspectRatio = "9:16" | "16:9" | "1:1";

// ---- Animation model ---------------------------------------------------
export type EaseName = "linear" | "easeOut" | "easeInOut" | "spring";
export type InAnim =
  | "none" | "fade" | "slideUp" | "slideDown" | "slideLeft" | "slideRight"
  | "scale" | "pop" | "blur";
export type OutAnim = InAnim;
export type LoopAnim = "none" | "float" | "pulse" | "shake" | "kenburns";
export type TextReveal = "none" | "typewriter" | "wordByWord" | "charStagger";
export type CameraMove = "none" | "zoomIn" | "zoomOut" | "panLeft" | "panRight";
export type SceneTransition = "cut" | "fade" | "slideLeft" | "slideRight" | "wipe";

export type AnimationSpec = {
  in?:  { type: InAnim;  delayMs?: number; durationMs?: number; easing?: EaseName; amount?: number };
  out?: { type: OutAnim; startMs?: number; durationMs?: number; easing?: EaseName; amount?: number };
  loop?: { type: LoopAnim; amplitude?: number; speedMs?: number };
};

export type EditorElementBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  animations?: AnimationSpec;
  /** V2 clip timing relative to the parent scene. Omitted in V1 templates. */
  startMs?: number;
  durationMs?: number;
};

export type TextElement = EditorElementBase & {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  shadow?: string;
  /** V2.7 optional layered shadows; legacy `shadow` remains supported. */
  shadows?: Array<{ x: number; y: number; blur: number; color: string; opacity?: number }>;
  glow?: { color: string; blur: number; intensity?: number };
  stroke?: string;
  strokeWidth?: number;
  /** Solid legacy background. V2.7 can additionally use a gradient/background styling block. */
  background?: string;
  backgroundGradient?: { from: string; to: string; angle?: number };
  backgroundOpacity?: number;
  backgroundRadius?: number;
  backgroundPaddingX?: number;
  backgroundPaddingY?: number;
  backgroundBorderColor?: string;
  backgroundBorderWidth?: number;
  textGradient?: { from: string; to: string; angle?: number };
  /** Shrink text to fit the box. Enabled by default for migrated/legacy text. */
  autoFit?: boolean;
  minFontSize?: number;
  maxLines?: number;
  reveal?: TextReveal;
  italic?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  textTransform?: "none" | "uppercase" | "lowercase";
  vAlign?: "top" | "middle" | "bottom";
};

export type ShapeElement = EditorElementBase & {
  type: "shape";
  shape: "rect" | "ellipse" | "triangle" | "star" | "line";
  fill: string;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
  fillOpacity?: number;
};

export type ImageElement = EditorElementBase & {
  type: "image";
  src: string;
  fit: "cover" | "contain";
};

export type VideoElement = EditorElementBase & {
  type: "video";
  src: string;
  fit: "cover" | "contain";
  /** Source-media trim window. Values are in source-media milliseconds. */
  sourceStartMs?: number;
  sourceEndMs?: number;
  /** Cached source duration when the browser can read metadata. */
  mediaDurationMs?: number;
  playbackRate?: number;
  volume?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  muted?: boolean;
  loop?: boolean;
  autoplay?: boolean;
};

export type EditorElement = TextElement | ShapeElement | ImageElement | VideoElement;

export type EditorScene = {
  id: string;
  name: string;
  durationMs: number;
  background: string;
  elements: EditorElement[];
  cameraMove?: CameraMove;
  transitionIn?: SceneTransition;
};

export type EditorDocumentV1 = {
  version: 1;
  aspect: AspectRatio;
  scenes: EditorScene[];
  audio?: { src?: string; volume: number; fadeIn?: number; fadeOut?: number; mute?: boolean };
  variables: string[];
};

export type EditorTrackKind = "video" | "image" | "text" | "graphics" | "captions" | "audio" | "effects";

export type AudioClipRole = "music" | "voiceover" | "sfx" | "original";

export type EditorAudioClip = {
  id: string;
  name: string;
  src: string;
  role: AudioClipRole;
  /** Absolute project timeline position. */
  startMs: number;
  durationMs: number;
  /** Source trim window in source-media milliseconds. */
  sourceStartMs?: number;
  sourceEndMs?: number;
  mediaDurationMs?: number;
  playbackRate?: number;
  volume: number;
  muted?: boolean;
  solo?: boolean;
  loop?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  /** Normalized 0..1 waveform peaks, generated client-side when possible. */
  waveform?: number[];
  /** Music clips can opt out of automatic voiceover ducking. */
  ducking?: boolean;
};


export type CaptionAnimationStyle = "highlight" | "karaoke" | "pop" | "minimal";
export type CaptionPresetId = "bold-pop" | "karaoke" | "clean" | "gaming" | "podcast";

export type CaptionWord = {
  id: string;
  text: string;
  /** Relative to the caption clip start. */
  startMs: number;
  endMs: number;
};

export type CaptionStyle = {
  preset: CaptionPresetId;
  animation: CaptionAnimationStyle;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  activeColor: string;
  background: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  padding?: number;
  maxWordsPerLine?: number;
  uppercase?: boolean;
};

export type EditorCaptionClip = {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  x: number;
  y: number;
  w: number;
  h: number;
  words: CaptionWord[];
  style: CaptionStyle;
  locked?: boolean;
  hidden?: boolean;
};

export type AudioMixSettings = {
  duckingEnabled: boolean;
  duckLevel: number;
  attackMs: number;
  releaseMs: number;
};

export type EditorTimelineClip = {
  id: string;
  sceneId: string;
  elementId?: string;
  kind: EditorTrackKind;
  name: string;
  /** Absolute project timeline position. */
  startMs: number;
  durationMs: number;
};

export type EditorTrack = {
  id: string;
  kind: EditorTrackKind;
  name: string;
  locked?: boolean;
  muted?: boolean;
  clips: EditorTimelineClip[];
};

export type EditorDocumentV2 = {
  version: 2;
  aspect: AspectRatio;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  scenes: EditorScene[];
  tracks: EditorTrack[];
  audioClips: EditorAudioClip[];
  captionClips: EditorCaptionClip[];
  audioMix: AudioMixSettings;
  audio?: { src?: string; volume: number; fadeIn?: number; fadeOut?: number; mute?: boolean };
  variables: string[];
  brand?: Record<string, unknown>;
  export?: Record<string, unknown>;
};

/** Runtime readers accept both versions; the editor migrates to V2 on load. */
export type EditorDocument = EditorDocumentV1 | EditorDocumentV2;

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "failed"] as const;
export const ITEM_STATUSES = ["pending","rendering","rendered","upload_pending","uploading","uploaded","scheduled","failed"] as const;