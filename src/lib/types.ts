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
  stroke?: string;
  background?: string;
  reveal?: TextReveal;
};

export type ShapeElement = EditorElementBase & {
  type: "shape";
  shape: "rect" | "ellipse";
  fill: string;
  radius?: number;
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

export type EditorDocument = {
  version: 1;
  aspect: AspectRatio;
  scenes: EditorScene[];
  audio?: { src?: string; volume: number; fadeIn?: number; fadeOut?: number; mute?: boolean };
  variables: string[];
};

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "failed"] as const;
export const ITEM_STATUSES = ["pending","rendering","rendered","upload_pending","uploading","uploaded","scheduled","failed"] as const;