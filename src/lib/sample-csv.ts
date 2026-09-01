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
  word: ["_NT", "M_NGO", "T_GER", "H_USE", "_RANGE", "_XE", "H_N", "C_CK", "R_T", "C_T", "D_G", "K_TE"],
  missingLetter: ["A", "A", "I", "O", "O", "A", "E", "O", "A", "A", "O", "I"],
  optionA: ["A", "E", "U", "O", "E", "A", "E", "U", "I", "A", "E", "O"],
  optionB: ["O", "A", "I", "A", "O", "E", "I", "O", "A", "E", "O", "I"],
  optionC: ["E", "O", "E", "U", "A", "I", "A", "A", "O", "O", "I", "E"],
  objectImage: [
    "https://example.com/ant.png", "https://example.com/mango.png", "https://example.com/tiger.png", "https://example.com/house.png",
    "https://example.com/orange.png", "https://example.com/axe.png", "https://example.com/hen.png", "https://example.com/cock.png",
    "https://example.com/rat.png", "https://example.com/cat.png", "https://example.com/dog.png", "https://example.com/kite.png",
  ],
  clue: [
    "A tiny insect", "A sweet yellow fruit", "A big striped cat", "A place where people live",
    "A round citrus fruit", "A tool used for chopping", "A female chicken", "A male chicken",
    "A small rodent", "A popular pet that says meow", "A loyal pet that barks", "It flies in the wind",
  ],
  letter1: ["A", "C", "D", "R", "H", "A"],
  letter2: ["N", "A", "O", "A", "E", "X"],
  letter3: ["T", "T", "G", "T", "N", "E"],
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
  const isLetterMatch = /letter\s*match/i.test(templateName) && vars.includes("missingLetter") && vars.includes("objectImage");
  const isHalfLetterMatch = /half\s*letter\s*match/i.test(templateName) && vars.includes("letter1") && vars.includes("letter2") && vars.includes("letter3");
  const halfWords = ["ANT", "CAT", "DOG", "RAT", "HEN", "AXE"];
  const rowCount = isLetterMatch ? 12 : isHalfLetterMatch ? halfWords.length : 3;
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
    if (isHalfLetterMatch) {
      const word = halfWords[i % halfWords.length]!;
      row.word = word;
      row.letter1 = word[0] ?? "A";
      row.letter2 = word[1] ?? "N";
      row.letter3 = word[2] ?? "T";
      row.cta = "Did you match all 3?";
      row.title = `Half Letter Match: ${word}`;
      row.hashtags = "#shorts|#lettermatch|#kidslearning|#puzzle";
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
