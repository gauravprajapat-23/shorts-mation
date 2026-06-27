import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  draft: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  completed: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  failed: "bg-brand/10 text-brand border-brand/20",
  pending: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  rendering: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  rendered: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  upload_pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  uploading: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  uploaded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  scheduled: "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? COLORS.draft;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-wider font-semibold", cls)}>
      <span className="size-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}