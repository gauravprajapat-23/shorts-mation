import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { blankDocument } from "@/lib/editor-defaults";
import { PageHeader } from "@/components/page-header";
import type { AspectRatio } from "@/lib/types";
import { toast } from "sonner";

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
  const [loading, setLoading] = useState(false);

  const create = async () => {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const doc = blankDocument(aspect);
      const { data, error } = await supabase
        .from("templates")
        .insert({ user_id: u.user.id, name, aspect_ratio: aspect, type, template_json: doc as never })
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
    <div className="p-8 max-w-2xl mx-auto">
      <PageHeader title="New template" description="Set the basics. You'll design everything else in the editor." />
      <div className="space-y-5 bg-panel border border-border rounded-2xl p-6">
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