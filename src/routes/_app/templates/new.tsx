import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { blankDocument } from "@/lib/editor-defaults";
import { PageHeader } from "@/components/page-header";
import type { AspectRatio } from "@/lib/types";
import { toast } from "sonner";
import { TEMPLATE_CATEGORIES, normalizeTemplateTags, validateTemplateProduct, generateTemplateDocumentation } from "@/lib/template-marketplace";

export const Route = createFileRoute("/_app/templates/new")({
  head: () => ({ meta: [{ title: "New template — ShortsForge" }] }),
  component: NewTemplatePage,
});

const TYPES = [
  "motivational_quote","quiz","did_you_know","countdown","before_after",
  "product_promo","spiritual_thought","educational_tip","news_facts","daily_thought","custom",
] as const;

function NewTemplatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("My Template");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [type, setType] = useState<typeof TYPES[number]>("custom");
  const [category, setCategory] = useState("Other");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private"|"public">("private");
  const [loading, setLoading] = useState(false);

  const create = async () => {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const doc = blankDocument(aspect);
      const tagList = normalizeTemplateTags(tags);
      const documentation = generateTemplateDocumentation(doc, name);
      const validation = validateTemplateProduct(doc, { name, description, documentation, tags: tagList });
      if (visibility === "public" && validation.score < 60) throw new Error("Add more template details before publishing. Public templates require a quality score of at least 60%.");
      const { data, error } = await (supabase as any)
        .from("templates")
        .insert({
          user_id: u.user.id, name, aspect_ratio: aspect, type, template_json: doc,
          category, tags: tagList, description: description.trim() || null, documentation,
          visibility, validation_score: validation.score, required_variables: validation.requiredVariables,
        })
        .select("id")
        .single();
      if (error) throw error;
      navigate({ to: "/editor/$templateId", params: { templateId: data.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
      <PageHeader title="New template" description="Set the basics. You'll design everything else in the editor." />
      <div className="space-y-5 bg-panel border border-border rounded-2xl p-4 sm:p-6">
        <Field label="Template name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
        </Field>
        <Field label="Aspect ratio">
          <div className="grid grid-cols-3 gap-2">
            {(["9:16","1:1","16:9"] as const).map((a) => (
              <button key={a} onClick={() => setAspect(a)} className={`h-10 rounded-md border text-sm font-semibold ${aspect===a?"border-brand text-brand bg-brand/10":"border-border text-zinc-400 hover:text-white"}`}>{a}</button>
            ))}
          </div>
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as typeof TYPES[number])} className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm">
            {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm">
              {TEMPLATE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as "private"|"public")} className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm">
              <option value="private">Private library</option>
              <option value="public">Public marketplace</option>
            </select>
          </Field>
        </div>
        <Field label="Search tags">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="quiz, kids, football, trivia" className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm" />
        </Field>
        <Field label="Marketplace description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Explain what this template creates and who it is for." className="w-full min-h-24 p-3 rounded-md bg-zinc-950 border border-border text-sm" />
        </Field>
        <button onClick={create} disabled={loading} className="w-full h-11 rounded-md bg-brand text-white font-bold text-sm hover:bg-brand/90 disabled:opacity-50">
          {loading ? "Creating…" : "Create & open editor"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      {children}
    </label>
  );
}