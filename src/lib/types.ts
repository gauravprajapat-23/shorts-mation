import type { Tables } from "@/integrations/supabase/types";

export type Template = Tables<"templates">;
export type Campaign = Tables<"campaigns">;
export type CampaignItem = Tables<"campaign_items">;
export type Asset = Tables<"assets">;
export type YoutubeConnection = Tables<"youtube_connections">;
export type AutomationLog = Tables<"automation_logs">;

export type AspectRatio = "9:16" | "16:9" | "1:1";

export type EditorElementBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
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

export type EditorElement = TextElement | ShapeElement | ImageElement;

export type EditorScene = {
  id: string;
  name: string;
  durationMs: number;
  background: string;
  elements: EditorElement[];
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