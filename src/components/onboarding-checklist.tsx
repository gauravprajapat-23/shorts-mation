import { Link } from "@tanstack/react-router";
import { Check, Youtube, Wand2, FileUp, Eye, Play, ArrowRight } from "lucide-react";
import { type LucideIcon } from "lucide-react";

export type OnboardingStatus = {
  connectedYouTube: boolean;
  hasTemplate: boolean;
  hasUpload: boolean;
  previewed: boolean;
  started: boolean;
};

type Step = {
  id: keyof OnboardingStatus;
  title: string;
  description: string;
  icon: LucideIcon;
  to: string;
  cta: string;
};

const STEPS: Step[] = [
  { id: "connectedYouTube", title: "Connect YouTube", description: "Authorize the channel where your videos will be uploaded.", icon: Youtube, to: "/youtube-connect", cta: "Connect channel" },
  { id: "hasTemplate", title: "Pick or create a template", description: "Use a built-in template or design your own in the editor.", icon: Wand2, to: "/templates", cta: "Browse templates" },
  { id: "hasUpload", title: "Upload JSON or CSV", description: "Bulk upload your data — one row per video.", icon: FileUp, to: "/campaigns/new", cta: "Upload data" },
  { id: "previewed", title: "Preview your campaign", description: "Map fields, review per-row validation, then preview.", icon: Eye, to: "/campaigns", cta: "Open campaigns" },
  { id: "started", title: "Start automation", description: "Flip the switch and let the queue ship your videos on schedule.", icon: Play, to: "/campaigns", cta: "Start now" },
];

export function OnboardingChecklist({ status }: { status: OnboardingStatus }) {
  const completed = STEPS.filter((s) => status[s.id]).length;
  if (completed === STEPS.length) return null;
  const nextIdx = STEPS.findIndex((s) => !status[s.id]);
  const pct = Math.round((completed / STEPS.length) * 100);

  return (
    <section className="mb-8 rounded-2xl border border-border bg-panel overflow-hidden">
      <header className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold">Get started</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Finish setup to ship your first batch — {completed} of {STEPS.length} done.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-bold tabular-nums text-zinc-400">{pct}%</span>
        </div>
      </header>
      <ol className="divide-y divide-border">
        {STEPS.map((s, i) => {
          const done = status[s.id];
          const isNext = i === nextIdx;
          const Icon = s.icon;
          return (
            <li key={s.id} className={`flex items-center gap-4 px-5 py-4 ${isNext ? "bg-brand/[0.04]" : ""}`}>
              <div className={`size-8 rounded-full grid place-items-center shrink-0 border ${done ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" : isNext ? "bg-brand/15 border-brand/40 text-brand" : "bg-zinc-900 border-border text-zinc-500"}`}>
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tabular-nums text-zinc-500">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`text-sm font-semibold ${done ? "line-through text-zinc-500" : ""}`}>{s.title}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>
              </div>
              {!done && (
                <Link to={s.to} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold shrink-0 ${isNext ? "bg-brand text-white hover:bg-brand/90" : "border border-border text-zinc-300 hover:border-brand/50"}`}>
                  {s.cta} <ArrowRight className="size-3" />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}