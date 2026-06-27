import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, trend, accent }: { label: string; value: string | number; icon: LucideIcon; trend?: string; accent?: boolean }) {
  return (
    <div className={cn("p-5 rounded-xl border border-border bg-panel relative overflow-hidden", accent && "border-brand/30 bg-gradient-to-br from-brand/10 to-transparent")}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">{label}</span>
        <Icon className={cn("size-4", accent ? "text-brand" : "text-zinc-500")} />
      </div>
      <div className="font-display text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      {trend && <div className="text-xs text-zinc-500 mt-1">{trend}</div>}
    </div>
  );
}