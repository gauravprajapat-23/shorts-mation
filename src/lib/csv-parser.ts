import Papa from "papaparse";

export type ParsedCampaignVideo = {
  video_file_name: string;
  template_id?: string;
  content: Record<string, string>;
  seo: { title: string; description: string; tags: string[]; hashtags: string[] };
  audio: { type?: string; file_name?: string; volume?: number };
  youtube: { privacy: "private" | "unlisted" | "public"; schedule_at?: string; playlist?: string; category?: string };
  asset: { background_file_name?: string };
};

export type ParsedCampaign = {
  campaign_name: string;
  default_template?: string;
  timezone?: string;
  default_settings?: Record<string, unknown>;
  videos: ParsedCampaignVideo[];
};

export type ValidationIssue = { row: number; field: string; message: string; severity: "error" | "warning" };

const PRIVACY = new Set(["private", "unlisted", "public"]);

function toTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.split(/[|,]/).map((t) => t.trim()).filter(Boolean);
  return [];
}

export function parseFile(text: string, name: string): { campaign: ParsedCampaign; issues: ValidationIssue[] } {
  return name.toLowerCase().endsWith(".json") ? parseJson(text) : parseCsv(text);
}

function parseJson(text: string): { campaign: ParsedCampaign; issues: ValidationIssue[] } {
  const data = JSON.parse(text) as ParsedCampaign;
  return { campaign: data, issues: validate(data) };
}

function parseCsv(text: string): { campaign: ParsedCampaign; issues: ValidationIssue[] } {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const reserved = new Set([
    "video_file_name","template_id","title","description","tags","hashtags",
    "privacy","schedule_at","playlist","category","audio_file_name","background_file_name",
  ]);
  const videos: ParsedCampaignVideo[] = res.data.map((row) => ({
    video_file_name: row.video_file_name || "",
    template_id: row.template_id,
    content: Object.fromEntries(Object.entries(row).filter(([k]) => !reserved.has(k))),
    seo: {
      title: row.title || "",
      description: row.description || "",
      tags: toTags(row.tags),
      hashtags: toTags(row.hashtags),
    },
    audio: { type: row.audio_file_name ? "uploaded" : undefined, file_name: row.audio_file_name },
    youtube: {
      privacy: (PRIVACY.has(row.privacy) ? row.privacy : "private") as "private" | "unlisted" | "public",
      schedule_at: row.schedule_at,
      playlist: row.playlist,
      category: row.category,
    },
    asset: { background_file_name: row.background_file_name },
  }));
  const campaign: ParsedCampaign = { campaign_name: "Imported CSV Campaign", videos };
  return { campaign, issues: validate(campaign) };
}

export function validate(c: ParsedCampaign): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  c.videos.forEach((v, i) => {
    if (!v.video_file_name) issues.push({ row: i, field: "video_file_name", message: "required", severity: "error" });
    else if (seen.has(v.video_file_name)) issues.push({ row: i, field: "video_file_name", message: "duplicate", severity: "error" });
    else seen.add(v.video_file_name);
    if (!v.seo.title) issues.push({ row: i, field: "title", message: "missing", severity: "warning" });
    if (v.youtube.schedule_at && isNaN(Date.parse(v.youtube.schedule_at)))
      issues.push({ row: i, field: "schedule_at", message: "invalid date", severity: "error" });
    if (!PRIVACY.has(v.youtube.privacy))
      issues.push({ row: i, field: "privacy", message: "must be private/unlisted/public", severity: "error" });
  });
  return issues;
}

export const SAMPLE_JSON = JSON.stringify(
  {
    campaign_name: "Daily Motivation Shorts",
    default_template: "motivation_quote",
    timezone: "Asia/Kolkata",
    default_settings: { platform: "youtube", aspect_ratio: "9:16", privacy: "private", category: "Education" },
    videos: [
      {
        video_file_name: "stop_waiting_start_today.mp4",
        template_id: "motivation_quote",
        content: { headline: "Stop Waiting. Start Today.", subheadline: "Small discipline creates big results.", cta: "Build before 2027" },
        seo: { title: "Stop Waiting. Start Today | Shorts", description: "Start today with small discipline.", tags: ["motivation","shorts"], hashtags: ["#motivation","#shorts"] },
        audio: { type: "uploaded", file_name: "motivational_bg_1.mp3", volume: 0.7 },
        youtube: { privacy: "private", schedule_at: "2026-06-27T18:00:00+05:30", playlist: "Daily Motivation", category: "Education" },
      },
    ],
  },
  null,
  2,
);

export const SAMPLE_CSV = [
  "video_file_name,template_id,headline,subheadline,cta,title,description,tags,hashtags,privacy,schedule_at,playlist,category,audio_file_name,background_file_name",
  'stop_waiting.mp4,motivation_quote,"Stop Waiting. Start Today.","Small discipline creates big results.","Build before 2027","Stop Waiting | Shorts","Start today.","motivation|shorts","#motivation|#shorts",private,2026-06-27T18:00:00+05:30,"Daily Motivation",Education,bg1.mp3,bg1.jpg',
].join("\n");