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
export type EaseName = "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring" | "bounce";
export type InAnim =
  | "none" | "fade" | "slideUp" | "slideDown" | "slideLeft" | "slideRight"
  | "scale" | "pop" | "blur";
export type OutAnim = InAnim;
export type LoopAnim = "none" | "float" | "pulse" | "shake" | "kenburns";
export type TextReveal = "none" | "typewriter" | "wordByWord" | "charStagger";
export type CameraMove = "none" | "zoomIn" | "zoomOut" | "panLeft" | "panRight";
export type SceneTransition = "cut" | "fade" | "slideLeft" | "slideRight" | "wipe" | "zoom" | "whip" | "blur" | "flash" | "glitch";

export type SceneRole = "hook" | "context" | "value" | "pattern-interrupt" | "payoff" | "cta";
export type RetentionPresetId = "balanced" | "fast-viral" | "story" | "educational" | "minimal";
export type VisualRhythmSettings = {
  preset: RetentionPresetId;
  enabled: boolean;
  microZoomEveryMs: number;
  patternInterruptEveryMs: number;
  captionEmphasis: "low" | "medium" | "high";
  transitionIntensity: "subtle" | "medium" | "high";
  ctaLeadMs: number;
};

export type AnimationSpec = {
  in?:  { type: InAnim;  delayMs?: number; durationMs?: number; easing?: EaseName; amount?: number };
  out?: { type: OutAnim; startMs?: number; durationMs?: number; easing?: EaseName; amount?: number };
  loop?: { type: LoopAnim; amplitude?: number; speedMs?: number };
};

export type KeyframeProperty = "x" | "y" | "scale" | "rotation" | "opacity" | "blur" | "cropX" | "cropY" | "cropScale";
export type ElementKeyframe = {
  id: string;
  /** Clip-local timestamp in milliseconds. */
  timeMs: number;
  easing?: EaseName;
  values: Partial<Record<KeyframeProperty, number>>;
};

export type BrandBindableProperty = "color" | "background" | "fontFamily" | "fill" | "stroke" | "src";

export type AutomationVariableType = "text" | "image" | "video" | "audio" | "color" | "number" | "boolean" | "array";
export type AutomationVariableDefinition = {
  id: string;
  name: string;
  label?: string;
  type: AutomationVariableType;
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
  validation?: { minLength?: number; maxLength?: number; pattern?: string; min?: number; max?: number };
  /** Used when type=array. Object items can be addressed as {{item.field}} in repeated scenes. */
  itemType?: Exclude<AutomationVariableType, "array"> | "object";
};
export type VisibilityOperator = "exists" | "notEmpty" | "equals" | "notEquals" | "contains" | "truthy" | "falsy";
export type VisibilityCondition = { variable: string; operator: VisibilityOperator; value?: string };
export type DynamicSceneRepeat = { variable: string; itemAlias?: string; indexAlias?: string; maxItems?: number };


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
  /** V2.8 clip-local property keyframes. */
  keyframes?: ElementKeyframe[];
  /** Optional property → brand variable binding, e.g. { color: "brand.primaryColor" }. */
  brandBindings?: Partial<Record<BrandBindableProperty, string>>;
  /** Optional automation condition controlling whether this layer is emitted. */
  visibleWhen?: VisibilityCondition;
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
  /** Optional non-destructive crop of the text layer in percentages.
   * Useful for split/half-letter effects while keeping both halves perfectly aligned. */
  clipInsetPct?: { top?: number; right?: number; bottom?: number; left?: number };
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

export type MediaColorAdjustments = {
  brightness?: number; // 0..2, default 1
  contrast?: number;   // 0..2, default 1
  saturation?: number; // 0..2, default 1
  exposure?: number;   // -1..1
  temperature?: number;// -1..1
  tint?: number;       // -1..1
  blur?: number;       // px
  vignette?: number;   // 0..1
  grain?: number;      // 0..1
};

export type MediaFilterPreset = "none" | "cinematic" | "warm" | "cold" | "high-contrast" | "vintage" | "mono" | "gaming" | "podcast" | "documentary";

export type ImageElement = EditorElementBase & {
  type: "image";
  src: string;
  fit: "cover" | "contain";
  filterPreset?: MediaFilterPreset;
  colorAdjustments?: MediaColorAdjustments;
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
  filterPreset?: MediaFilterPreset;
  colorAdjustments?: MediaColorAdjustments;
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
  /** V2.12 semantic role used by retention/rhythm presets. */
  role?: SceneRole;
  /** Optional per-scene retention override. */
  retention?: { microZoom?: boolean; captionEmphasis?: boolean; patternInterrupt?: boolean; };
  /** Optional condition controlling whether this scene exists in the generated document. */
  visibleWhen?: VisibilityCondition;
  /** Repeat this scene for each item of an array automation variable. */
  repeat?: DynamicSceneRepeat;
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

export type EffectKind = "vignette" | "grain" | "light-leak" | "flash" | "glitch";
export type EditorEffectClip = {
  id: string;
  name: string;
  kind: EffectKind;
  startMs: number;
  durationMs: number;
  intensity: number;
  opacity?: number;
  color?: string;
  seed?: number;
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


export type BrandKit = {
  id: string;
  name: string;
  colors: { primary: string; secondary: string; accent: string; background: string; text: string };
  typography: { headingFont: string; bodyFont: string };
  logoSrc?: string;
  watermarkSrc?: string;
  socialHandle?: string;
  ctaText?: string;
  variables?: Record<string, string>;
};

export type EditorReusableComponent = {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  builtIn?: boolean;
  elements: EditorElement[];
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
  effectClips: EditorEffectClip[];
  audioMix: AudioMixSettings;
  audio?: { src?: string; volume: number; fadeIn?: number; fadeOut?: number; mute?: boolean };
  variables: string[];
  /** Typed V2.11 automation schema. Legacy `variables` remains for compatibility. */
  automationVariables?: AutomationVariableDefinition[];
  brand?: BrandKit;
  components?: EditorReusableComponent[];
  /** V2.12 automation-safe visual rhythm configuration. */
  retention?: VisualRhythmSettings;
  export?: Record<string, unknown>;
};

/** Runtime readers accept both versions; the editor migrates to V2 on load. */
export type EditorDocument = EditorDocumentV1 | EditorDocumentV2;

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "failed"] as const;
export const ITEM_STATUSES = ["pending","rendering","rendered","upload_pending","uploading","uploaded","scheduled","failed"] as const;