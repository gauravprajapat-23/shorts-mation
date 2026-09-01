import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Sparkles, Plus, Copy, Trash2, Pencil, FileSpreadsheet, Zap } from "lucide-react";
import { toast } from "sonner";
import { generateSampleCsv, downloadCsv } from "@/lib/sample-csv";
import type { EditorDocument } from "@/lib/types";
import { TemplatePreview } from "@/lib/template-preview";
import { STARTER_TEMPLATES } from "@/lib/starter-templates";

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

  const loadStarters = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const rows = STARTER_TEMPLATES.map((s) => ({
        user_id: u.user!.id,
        name: s.name,
        type: s.type,
        aspect_ratio: s.doc.aspect,
        template_json: s.doc as never,
      }));
      const { error } = await supabase.from("templates").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); toast.success(`${STARTER_TEMPLATES.length} animated starter templates added`); },
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadStarters.mutate()}
              disabled={loadStarters.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-brand/40 bg-brand/10 text-brand font-semibold text-sm hover:bg-brand/20 disabled:opacity-50"
              title="Insert animated starter templates including Letter Match, Quiz, Motivation, Fact, and Top 5 into your library"
            >
              <Zap className="size-4" /> {loadStarters.isPending ? "Adding…" : "Load animated starters"}
            </button>
            <Link to="/templates/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
              <Plus className="size-4" /> New template
            </Link>
          </div>
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

function TemplateCard({ t, onDuplicate, onDelete }: { t: { id: string; name: string; aspect_ratio: string; type: string; is_default: boolean; template_json?: unknown }; onDuplicate: () => void; onDelete?: () => void }) {
  const aspectClass = t.aspect_ratio === "9:16" ? "aspect-[9/16]" : t.aspect_ratio === "16:9" ? "aspect-video" : "aspect-square";
  const doc = (t.template_json ?? null) as EditorDocument | null;
  const downloadSample = () => {
    try {
      const doc = t.template_json as EditorDocument | undefined;
      if (!doc) { toast.error("Template has no scenes"); return; }
      const csv = generateSampleCsv(doc, t.name);
      downloadCsv(`${t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-sample.csv`, csv);
      toast.success("Sample CSV downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate sample");
    }
  };
  return (
    <div className="group rounded-xl border border-border bg-panel overflow-hidden hover:border-brand/50 transition-colors">
      <Link to="/editor/$templateId" params={{ templateId: t.id }} className={`${aspectClass} bg-gradient-to-br from-zinc-900 to-black relative block overflow-hidden`}>
        <div className="absolute inset-0 transition-transform duration-300 group-hover:scale-105">
          <TemplatePreview doc={doc} aspect={t.aspect_ratio as "9:16" | "16:9" | "1:1"} />
        </div>
        <span className="absolute top-1.5 left-1.5 font-mono text-[9px] px-1.5 py-0.5 rounded bg-black/70 text-zinc-400">{t.aspect_ratio}</span>
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
          <button onClick={downloadSample} className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white" title="Download sample CSV"><FileSpreadsheet className="size-3.5" /></button>
          <button onClick={onDuplicate} className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white" title="Duplicate"><Copy className="size-3.5" /></button>
          {onDelete && (
            <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-brand/20 text-zinc-400 hover:text-brand" title="Delete"><Trash2 className="size-3.5" /></button>
          )}
        </div>
      </div>
    </div>
  );
}