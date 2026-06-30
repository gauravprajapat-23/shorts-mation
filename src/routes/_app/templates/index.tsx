import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Sparkles, Plus, Copy, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/templates/")({
  head: () => ({ meta: [{ title: "Templates — ShortsForge" }] }),
  component: TemplatesPage,
});

function TemplatesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const dupe = useMutation({
    mutationFn: async (t: NonNullable<typeof data>[number]) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("templates").insert({
        user_id: u.user.id,
        name: `${t.name} (copy)`,
        type: t.type,
        aspect_ratio: t.aspect_ratio,
        template_json: t.template_json,
        thumbnail_url: t.thumbnail_url,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Template duplicated"); },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const defaults = data?.filter((t) => t.is_default) ?? [];
  const mine = data?.filter((t) => !t.is_default) ?? [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Templates"
        description="Reusable designs with variable placeholders. Pick a default to start fast, or build your own."
        action={
          <Link to="/templates/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
            <Plus className="size-4" /> New template
          </Link>
        }
      />

      <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">Built-in templates</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        {defaults.map((t) => (
          <TemplateCard key={t.id} t={t} onDuplicate={() => dupe.mutate(t)} />
        ))}
      </div>

      <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-3">Your templates</h2>
      {mine.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No custom templates yet"
          description="Duplicate a default template or design one from scratch in the editor."
          action={
            <Link to="/templates/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
              <Plus className="size-4" /> Create template
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {mine.map((t) => (
            <TemplateCard key={t.id} t={t} onDuplicate={() => dupe.mutate(t)} onDelete={() => del.mutate(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ t, onDuplicate, onDelete }: { t: { id: string; name: string; aspect_ratio: string; type: string; is_default: boolean }; onDuplicate: () => void; onDelete?: () => void }) {
  const aspectClass = t.aspect_ratio === "9:16" ? "aspect-[9/16]" : t.aspect_ratio === "16:9" ? "aspect-video" : "aspect-square";
  return (
    <div className="group rounded-xl border border-border bg-panel overflow-hidden hover:border-brand/50 transition-colors">
      <Link to="/editor/$templateId" params={{ templateId: t.id }} className={`${aspectClass} bg-gradient-to-br from-zinc-900 to-black grid place-items-center relative block`}>
        <span className="font-display text-xs text-zinc-600">{t.aspect_ratio}</span>
        <div className="absolute inset-0 md:opacity-0 group-hover:opacity-100 bg-black/60 flex items-center justify-center gap-2 transition-opacity">
          <span className="px-3 py-1.5 rounded-md bg-brand text-white text-xs font-bold inline-flex items-center gap-1.5">
            <Pencil className="size-3" /> Edit
          </span>
        </div>
      </Link>
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{t.name}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-0.5">{t.type.replace(/_/g, " ")}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link to="/editor/$templateId" params={{ templateId: t.id }} className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white" title="Edit"><Pencil className="size-3.5" /></Link>
          <button onClick={onDuplicate} className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white" title="Duplicate"><Copy className="size-3.5" /></button>
          {onDelete && (
            <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-brand/20 text-zinc-400 hover:text-brand" title="Delete"><Trash2 className="size-3.5" /></button>
          )}
        </div>
      </div>
    </div>
  );
}