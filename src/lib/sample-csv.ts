import type { EditorDocument } from "./types";
import { extractVariables } from "./editor-defaults";

const RESERVED = [
  "video_file_name",
  "title",
  "description",
  "tags",
  "hashtags",
  "privacy",
  "schedule_at",
  "background_file_name",
] as const;

// Example values keyed loosely by placeholder name — falls back to a generic label.
const EXAMPLES: Record<string, string[]> = {
  quote: ["The only way to do great work is to love what you do.", "Discipline is choosing what you want most over what you want now.", "Stay hungry. Stay foolish."],
  author: ["Steve Jobs", "Abraham Lincoln", "Naval Ravikant"],
  cta: ["Follow for daily motivation", "Save this reel", "Share with a friend"],
  tip_number: ["01", "02", "03"],
  tip_title: ["Wake up at 5am", "Batch your tasks", "Cold shower every morning"],
  tip_body: ["Start your day before the world does. The first two hours set the tone for everything else.", "Group similar work together to reduce context-switching cost.", "60 seconds of cold water resets dopamine and beats coffee."],
  hashtag: ["#productivity", "#morningroutine", "#focus"],
  fact: ["Octopuses have three hearts and blue blood.", "Honey never spoils — jars found in Egyptian tombs are still edible.", "A day on Venus is longer than its year."],
  source: ["National Geographic", "Smithsonian", "NASA"],
  headline: ["AI just changed the game — again", "Markets react to today's decision", "Breakthrough in fusion energy"],
  summary: ["Here's what happened and why it matters for you today.", "Analysts weigh in on the impact.", "The three-minute version."],
  category: ["TECH", "MARKETS", "SCIENCE"],
  product_name: ["Aurora Headphones", "Nova Backpack", "Orbit Watch"],
  tagline: ["Studio-grade sound, all day comfort.", "Built for the everyday commuter.", "Time, redesigned."],
  price: ["$149", "$79", "$299"],
  dish: ["Miso Ramen", "Overnight Oats", "One-Pan Salmon"],
  time: ["15 min", "5 min prep · 8 hr rest", "20 min"],
  ingredients: ["• 200g ramen noodles\n• 3 tbsp miso paste\n• 1L dashi\n• 1 soft-boiled egg", "• 1/2 cup oats\n• 1 cup milk\n• 1 tbsp chia seeds", "• 2 salmon fillets\n• 1 lemon\n• Olive oil"],
  step: ["Simmer dashi and whisk in miso.", "Combine in jar. Refrigerate overnight.", "Sear skin-side down 4 min."],
  story_title: ["The Night It Rained Twice", "How I Left Corporate", "The 3 AM Decision"],
  paragraph: ["It started as a normal Tuesday. Then the sky opened up.", "I remember the moment I knew — sitting in a beige meeting room.", "The office was empty. My screen glowed. Everything shifted."],
  chapter: ["1", "2", "3"],
  event: ["3", "2", "1"],
  date: ["Jul 4, 2026", "Jul 5, 2026", "Jul 6, 2026"],
  subtitle: ["Days until launch", "Almost there", "Tomorrow"],
  top_text: ["When Monday hits", "Trying to focus", "Me at 3 PM"],
  bottom_text: ["But coffee saves the day", "With 47 tabs open", "Wondering what year it is"],
  step_number: ["1", "2", "3"],
  step_title: ["Set up the workspace", "Install dependencies", "Run the app"],
  step_body: ["Create a new folder and open it in your editor of choice.", "Run npm install to pull all required packages.", "Start the dev server with npm run dev — you're live."],
  tool: ["VS Code", "Terminal", "Browser"],
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Generate a downloadable sample CSV whose columns match a template's
 * variables. Includes 3 example rows plus YouTube upload columns.
 */
export function generateSampleCsv(doc: EditorDocument, templateName: string): string {
  const vars = extractVariables(doc).filter((v) => v !== "background");
  const headers = [
    "video_file_name",
    ...vars,
    "title",
    "description",
    "tags",
    "hashtags",
    "privacy",
    "schedule_at",
    "background_file_name",
  ];
  const rows: string[][] = [];
  const rowCount = 3;
  for (let i = 0; i < rowCount; i++) {
    const slug = templateName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const row: Record<string, string> = {
      video_file_name: `${slug}-${i + 1}.mp4`,
      title: `${templateName} #${i + 1}`,
      description: `Auto-generated with ShortsForge · ${templateName}`,
      tags: "shorts|automation|shortsforge",
      hashtags: "#shorts|#viral",
      privacy: "private",
      schedule_at: "",
      background_file_name: `background-${i + 1}.mp4`,
    };
    for (const v of vars) {
      const examples = EXAMPLES[v] ?? EXAMPLES[v.toLowerCase()] ?? [`Sample ${v} ${i + 1}`];
      row[v] = examples[i % examples.length];
    }
    rows.push(headers.map((h) => row[h] ?? ""));
  }
  return [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const CSV_RESERVED_COLUMNS = RESERVED;
