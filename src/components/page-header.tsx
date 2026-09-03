import { type ReactNode } from "react";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 sm:mb-8 gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight break-words">{title}</h1>
        {description && <p className="text-sm text-zinc-400 mt-1.5 max-w-xl">{description}</p>}
      </div>
      {action && <div className="w-full sm:w-auto sm:shrink-0 [&>*]:max-w-full">{action}</div>}
    </div>
  );
}