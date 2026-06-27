import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center bg-panel/30">
      <div className="size-12 rounded-xl bg-brand/10 border border-brand/20 grid place-items-center mx-auto mb-4">
        <Icon className="size-5 text-brand" />
      </div>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      <p className="text-sm text-zinc-400 mt-1.5 max-w-sm mx-auto">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}