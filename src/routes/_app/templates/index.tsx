import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  BadgeCheck, BookOpen, Copy, Download, Eye, FileJson, FileSpreadsheet, Heart,
  History, Pencil, Plus, Search, Settings2, Sparkles, Star, Tags, Trash2, Upload, Video, X,
} from "lucide-react";
import { toast } from "sonner";
import { generateSampleCsv, downloadCsv } from "@/lib/sample-csv";
import type { EditorDocument } from "@/lib/types";
import { TemplatePreview } from "@/lib/template-preview";
import { downloadPortableTemplate, readTemplateFile } from "@/lib/template-io";
import {
  generateTemplateDocumentation, normalizeTemplateTags, TEMPLATE_CATEGORIES, validateTemplateProduct,
} from "@/lib/template-marketplace";

export const Route = createFileRoute("/_app/templates/")({
  head: () => ({ meta: [{ title: "Template Marketplace — ShortsForge" }] }),
  component: TemplatesPage,
});

type TemplateRow = {
  id: string; user_id: string | null; name: string; type: string; aspect_ratio: string;
  template_json: unknown; thumbnail_url: string | null; is_default: boolean;
  category?: string | null; tags?: string[] | null; visibility?: "private"|"public";
  preview_video_url?: string | null; description?: string | null; documentation?: string | null;
  validation_score?: number; required_variables?: string[] | null; remix_of?: string | null;
  published_at?: string | null; version_number?: number; created_at?: string; updated_at?: string;
};

type Tab = "library" | "marketplace" | "favorites";

function TemplatesPage() {
  const qc = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("marketplace");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [productTemplate, setProductTemplate] = useState<TemplateRow | null>(null);
  const [detailTemplate, setDetailTemplate] = useState<TemplateRow | null>(null);

  const session = useQuery({
    queryKey: ["template-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["templates-marketplace"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("templates").select("*")
        .order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as TemplateRow[];
      // Legacy "Starters" copied built-ins into each user's library. Collapse
      // those historical copies in the UI while the cleanup migration removes
      // them from the database.
      const seen = new Set<string>();
      return rows.filter((row) => {
        const key = `${row.type.trim().toLowerCase()}:${row.name.trim().toLowerCase().replace(/\s+[—-]\s+(remix|copy)$/i, "")}`;
        if (seen.has(key) && (row.is_default || row.user_id === null || row.visibility === "public")) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
  });

  const favoritesQuery = useQuery({
    queryKey: ["template-favorites"],
    enabled: !!session.data,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("template_favorites").select("template_id");
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: any) => r.template_id));
    },
  });

  const userId = session.data?.id ?? null;
  const favorites = favoritesQuery.data ?? new Set<string>();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (templatesQuery.data ?? []).filter((t) => {
      const own = !!userId && t.user_id === userId;
      const marketplace = t.is_default || (t.visibility === "public" && !own);
      if (tab === "library" && !own && !t.is_default) return false;
      if (tab === "marketplace" && !marketplace) return false;
      if (tab === "favorites" && !favorites.has(t.id)) return false;
      if (category !== "All" && (t.category ?? "Other") !== category) return false;
      if (!q) return true;
      const haystack = [t.name,t.type,t.category,t.description,...(t.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [templatesQuery.data, userId, favorites, tab, category, search]);

  const remix = useMutation({
    mutationFn: async (t: TemplateRow) => {
      const { data, error } = await (supabase as any).rpc("remix_template", { p_template_id: t.id, p_name: `${t.name} — Remix` });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey:["templates-marketplace"] }); setTab("library"); toast.success("Private remix created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const favorite = useMutation({
    mutationFn: async ({ id, active }: { id:string; active:boolean }) => {
      if (!userId) throw new Error("Not signed in");
      const result = active
        ? await (supabase as any).from("template_favorites").delete().eq("user_id",userId).eq("template_id",id)
        : await (supabase as any).from("template_favorites").insert({ user_id:userId, template_id:id });
      if (result.error) throw result.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey:["template-favorites"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey:["templates-marketplace"] }); toast.success("Template deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });


  const importTemplate = useMutation({
    mutationFn: async (file: File) => {
      const imported = await readTemplateFile(file);
      if (!userId) throw new Error("Not signed in");
      const market = imported.marketplace;
      const validation = validateTemplateProduct(imported.document,{
        name:imported.name,description:market?.description,documentation:market?.documentation,
        thumbnailUrl:market?.thumbnailUrl,previewVideoUrl:market?.previewVideoUrl,tags:market?.tags ?? [],
      });
      const { error } = await (supabase as any).from("templates").insert({
        user_id:userId,name:imported.name,type:imported.type,aspect_ratio:imported.document.aspect,
        template_json:imported.document,is_default:false,visibility:"private",category:market?.category ?? guessCategory(imported.type),
        tags:market?.tags ?? [],description:market?.description ?? null,documentation:market?.documentation ?? null,
        thumbnail_url:market?.thumbnailUrl ?? null,preview_video_url:market?.previewVideoUrl ?? null,
        validation_score:validation.score,required_variables:validation.requiredVariables,
      });
      if (error) throw error;
      return imported;
    },
    onSuccess: (item) => { qc.invalidateQueries({ queryKey:["templates-marketplace"] }); toast.success(`Imported “${item.name}”`); },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportTemplate(t: TemplateRow) {
    try {
      downloadPortableTemplate({
        name:t.name,type:t.type,document:t.template_json as EditorDocument,
        marketplace:{
          category:t.category ?? undefined,tags:t.tags ?? undefined,description:t.description ?? undefined,
          documentation:t.documentation ?? undefined,thumbnailUrl:t.thumbnail_url ?? undefined,
          previewVideoUrl:t.preview_video_url ?? undefined,
        },
      });
      toast.success("Template exported");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Template export failed"); }
  }

  return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
    <PageHeader title="Template Marketplace" description="Browse all pre-added website templates, preview them, remix into your library, or import and build your own."
      action={<div className="flex flex-wrap gap-2">
        <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e)=>{ const f=e.target.files?.[0]; e.currentTarget.value=""; if(f) importTemplate.mutate(f); }} />
        <button onClick={()=>importInputRef.current?.click()} className="action"><Upload className="size-4"/> Import</button>
        <a href="/templates/half-cut-word-match-pro.shorts-template.json" download className="action"><FileJson className="size-4"/> Pro sample</a>
        <Link to="/templates/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-semibold"><Plus className="size-4"/> New template</Link>
      </div>} />

    <div className="rounded-2xl border border-border bg-panel p-3 sm:p-4 mb-5">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {(["library","marketplace","favorites"] as Tab[]).map((value)=><button key={value} onClick={()=>setTab(value)} className={`px-3 py-2 rounded-md text-xs font-bold capitalize ${tab===value?"bg-brand text-white":"text-zinc-400 hover:bg-white/5"}`}>{value}</button>)}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative min-w-0 sm:w-72"><Search className="size-4 absolute left-3 top-2.5 text-zinc-500"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search name, tag, category…" className="h-9 w-full pl-9 pr-3 rounded-md bg-canvas border border-border text-sm"/></label>
          <select value={category} onChange={(e)=>setCategory(e.target.value)} className="h-9 px-3 rounded-md bg-canvas border border-border text-xs">
            <option>All</option>{TEMPLATE_CATEGORIES.map((c)=><option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
    </div>

    {templatesQuery.isLoading && <div className="p-10 text-center text-zinc-500">Loading templates…</div>}
    {templatesQuery.isError && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-300">Templates could not be loaded. <button className="underline" onClick={()=>templatesQuery.refetch()}>Retry</button></div>}
    {!templatesQuery.isLoading && !visible.length && <EmptyState icon={Sparkles} title="No templates match" description="Change the search/filter or create a new reusable template."/>}

    <div className="grid grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {visible.map((t)=><TemplateCard key={t.id} t={t} own={!!userId && t.user_id===userId} favorite={favorites.has(t.id)}
        onFavorite={()=>favorite.mutate({id:t.id,active:favorites.has(t.id)})} onRemix={()=>remix.mutate(t)}
        onExport={()=>exportTemplate(t)} onProduct={()=>setProductTemplate(t)} onDetails={()=>setDetailTemplate(t)}
        onDelete={t.user_id===userId ? ()=>del.mutate(t.id) : undefined}/>)}
    </div>

    {productTemplate && <ProductSetup template={productTemplate} onClose={()=>setProductTemplate(null)} onSaved={()=>{ setProductTemplate(null); qc.invalidateQueries({queryKey:["templates-marketplace"]}); }}/>}
    {detailTemplate && <TemplateDetails template={detailTemplate} own={!!userId && detailTemplate.user_id===userId} onClose={()=>setDetailTemplate(null)} onRestored={()=>{ setDetailTemplate(null); qc.invalidateQueries({queryKey:["templates-marketplace"]}); }} />}
    <style>{`.action{display:inline-flex;align-items:center;gap:.5rem;padding:.5rem .75rem;border-radius:.375rem;border:1px solid var(--border);font-size:.75rem;font-weight:600}`}</style>
  </div>;
}

function TemplateCard({t,own,favorite,onFavorite,onRemix,onExport,onProduct,onDetails,onDelete}:{
  t:TemplateRow;own:boolean;favorite:boolean;onFavorite:()=>void;onRemix:()=>void;onExport:()=>void;onProduct:()=>void;onDetails:()=>void;onDelete?:()=>void;
}) {
  const aspectClass=t.aspect_ratio==="9:16"?"aspect-[9/16]":t.aspect_ratio==="16:9"?"aspect-video":"aspect-square";
  const score=validateTemplateProduct(t.template_json as EditorDocument,{
    name:t.name,description:t.description,documentation:t.documentation,thumbnailUrl:t.thumbnail_url,
    previewVideoUrl:t.preview_video_url,tags:t.tags ?? [],
  }).score;
  const sample=()=>{ try { downloadCsv(`${slug(t.name)}-sample.csv`,generateSampleCsv(t.template_json as EditorDocument,t.name)); toast.success("Sample campaign CSV generated"); } catch(e){ toast.error(e instanceof Error?e.message:"Sample generation failed"); } };
  return <article className="group rounded-xl border border-border bg-panel overflow-hidden hover:border-brand/50 transition-colors">
    <div className={`${aspectClass} bg-black relative overflow-hidden`}>
      {t.preview_video_url ? <video src={t.preview_video_url} muted loop playsInline onMouseEnter={(e)=>void e.currentTarget.play()} onMouseLeave={(e)=>{e.currentTarget.pause();e.currentTarget.currentTime=0;}} className="absolute inset-0 w-full h-full object-cover"/> :
        t.thumbnail_url ? <img src={t.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover"/> :
        <TemplatePreview doc={t.template_json as EditorDocument} aspect={t.aspect_ratio as any}/>}
      <div className="absolute top-2 left-2 flex gap-1"><span className="badge">{t.category ?? "Other"}</span><span className="badge">{t.aspect_ratio}</span></div>
      <button onClick={onFavorite} className="absolute top-2 right-2 p-2 rounded-full bg-black/70" title={favorite?"Remove favorite":"Favorite"}><Heart className={`size-4 ${favorite?"fill-current text-pink-400":"text-white"}`}/></button>
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent flex justify-between items-end">
        <span className={`text-xs font-bold ${score>=80?"text-emerald-300":score>=60?"text-amber-300":"text-red-300"}`}><BadgeCheck className="size-3 inline mr-1"/>Quality {score}%</span>
        <span className="text-[10px] text-zinc-300">{t.visibility==="public"||t.is_default?"Public":"Private"} · v{t.version_number ?? 1}</span>
      </div>
    </div>
    <div className="p-3">
      <div className="font-semibold truncate">{t.name}</div>
      <p className="text-xs text-zinc-500 mt-1 line-clamp-2 min-h-8">{t.description || "No marketplace description yet."}</p>
      <div className="flex flex-wrap gap-1 mt-2">{(t.tags ?? []).slice(0,4).map(tag=><span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">#{tag}</span>)}</div>
      <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-2">
        {own && <Link to="/editor/$templateId" params={{templateId:t.id}} className="iconbtn" title="Edit"><Pencil className="size-3.5"/></Link>}
        <button onClick={onRemix} className="iconbtn" title={own?"Duplicate as private remix":"Remix to my library"}><Copy className="size-3.5"/></button>
        <button onClick={sample} className="iconbtn" title="Generate sample data"><FileSpreadsheet className="size-3.5"/></button>
        <button onClick={onExport} className="iconbtn" title="Export"><Download className="size-3.5"/></button>
        <button onClick={onDetails} className="iconbtn" title="Documentation & versions"><BookOpen className="size-3.5"/></button>
        {own && <button onClick={onProduct} className="iconbtn" title="Product setup"><Settings2 className="size-3.5"/></button>}
        {onDelete && <button onClick={onDelete} className="iconbtn hover:text-red-300" title="Delete"><Trash2 className="size-3.5"/></button>}
      </div>
    </div>
    <style>{`.badge{font-size:9px;padding:.2rem .4rem;border-radius:.25rem;background:rgba(0,0,0,.72);color:#d4d4d8}.iconbtn{padding:.4rem;border-radius:.375rem;color:#a1a1aa}.iconbtn:hover{background:rgba(255,255,255,.08);color:white}`}</style>
  </article>;
}

function ProductSetup({template,onClose,onSaved}:{template:TemplateRow;onClose:()=>void;onSaved:()=>void}) {
  const [category,setCategory]=useState(template.category ?? "Other");
  const [tags,setTags]=useState((template.tags ?? []).join(", "));
  const [description,setDescription]=useState(template.description ?? "");
  const [documentation,setDocumentation]=useState(template.documentation ?? "");
  const [thumbnail,setThumbnail]=useState(template.thumbnail_url ?? "");
  const [preview,setPreview]=useState(template.preview_video_url ?? "");
  const [visibility,setVisibility]=useState<"private"|"public">(template.visibility ?? "private");
  const [saving,setSaving]=useState(false);
  const doc=template.template_json as EditorDocument;
  const tagList=normalizeTemplateTags(tags);
  const validation=validateTemplateProduct(doc,{name:template.name,description,documentation,thumbnailUrl:thumbnail,previewVideoUrl:preview,tags:tagList});

  const save=async()=>{
    if (visibility==="public" && validation.score<60) { toast.error("Reach at least 60% template quality before publishing"); return; }
    setSaving(true);
    try {
      const {error}=await (supabase as any).from("templates").update({
        category,tags:tagList,description:description.trim()||null,documentation:documentation.trim()||null,
        thumbnail_url:thumbnail.trim()||null,preview_video_url:preview.trim()||null,visibility,
        validation_score:validation.score,required_variables:validation.requiredVariables,
      }).eq("id",template.id);
      if(error) throw error;
      toast.success(visibility==="public"?"Template published":"Template product settings saved"); onSaved();
    } catch(e){ toast.error(e instanceof Error?e.message:"Could not save template"); } finally { setSaving(false); }
  };

  return <Modal title="Template product setup" onClose={onClose}>
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Category"><select value={category} onChange={e=>setCategory(e.target.value)} className="field">{TEMPLATE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field>
      <Field label="Visibility"><select value={visibility} onChange={e=>setVisibility(e.target.value as any)} className="field"><option value="private">Private library</option><option value="public">Public marketplace</option></select></Field>
    </div>
    <Field label="Search tags"><input value={tags} onChange={e=>setTags(e.target.value)} className="field" placeholder="quiz, kids, football, trivia"/></Field>
    <Field label="Marketplace description"><textarea value={description} onChange={e=>setDescription(e.target.value)} className="field min-h-20" placeholder="What does this template create?"/></Field>
    <div className="grid sm:grid-cols-2 gap-4"><Field label="Thumbnail URL"><input value={thumbnail} onChange={e=>setThumbnail(e.target.value)} className="field" placeholder="https://…"/></Field><Field label="Preview video URL"><input value={preview} onChange={e=>setPreview(e.target.value)} className="field" placeholder="https://…mp4"/></Field></div>
    <Field label="Documentation"><div className="flex justify-end mb-1"><button onClick={()=>setDocumentation(generateTemplateDocumentation(doc,template.name))} className="text-xs text-brand hover:underline">Generate documentation</button></div><textarea value={documentation} onChange={e=>setDocumentation(e.target.value)} className="field min-h-40 font-mono text-xs"/></Field>
    <div className="rounded-xl border border-border p-4 bg-canvas"><div className="flex items-center justify-between"><div className="font-semibold">Validation score</div><div className={`text-xl font-black ${validation.score>=80?"text-emerald-400":validation.score>=60?"text-amber-400":"text-red-400"}`}>{validation.score}%</div></div>
      <div className="text-xs text-zinc-500 mt-1">Required variables: {validation.requiredVariables.join(", ") || "none"}</div>
      {!!validation.issues.length && <ul className="mt-3 text-xs text-zinc-400 space-y-1">{validation.issues.map(i=><li key={i}>• {i}</li>)}</ul>}
    </div>
    <button disabled={saving} onClick={save} className="w-full h-11 rounded-md bg-brand text-white font-bold disabled:opacity-50">{saving?"Saving…":visibility==="public"?"Save & publish":"Save product settings"}</button>
  </Modal>;
}

function TemplateDetails({template,own,onClose,onRestored}:{template:TemplateRow;own:boolean;onClose:()=>void;onRestored:()=>void}) {
  const restore=useMutation({
    mutationFn:async(version:number)=>{ const {data,error}=await (supabase as any).rpc("restore_template_version",{p_template_id:template.id,p_version_number:version}); if(error)throw error; return data; },
    onSuccess:()=>{ toast.success("Template version restored"); onRestored(); },
    onError:(e:Error)=>toast.error(e.message),
  });
  const versions=useQuery({
    queryKey:["template-versions",template.id],
    queryFn:async()=>{ const {data,error}=await (supabase as any).from("template_versions").select("id,version_number,created_at,name").eq("template_id",template.id).order("version_number",{ascending:false}).limit(30); if(error)throw error; return data??[]; },
  });
  const validation=validateTemplateProduct(template.template_json as EditorDocument,{name:template.name,description:template.description,documentation:template.documentation,thumbnailUrl:template.thumbnail_url,previewVideoUrl:template.preview_video_url,tags:template.tags??[]});
  return <Modal title={template.name} onClose={onClose}>
    {template.preview_video_url && <video src={template.preview_video_url} controls className="w-full max-h-72 rounded-xl bg-black"/>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[
      ["Quality",`${validation.score}%`],["Version",`v${template.version_number??1}`],["Variables",String(validation.allVariables.length)],["Required",String(validation.requiredVariables.length)]
    ].map(([l,v])=><div key={l} className="rounded-lg border border-border p-3"><div className="text-[10px] uppercase text-zinc-500">{l}</div><div className="font-bold mt-1">{v}</div></div>)}</div>
    <section><h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Documentation</h3><pre className="whitespace-pre-wrap text-xs text-zinc-300 bg-canvas border border-border rounded-xl p-4 max-h-72 overflow-auto">{template.documentation || generateTemplateDocumentation(template.template_json as EditorDocument,template.name)}</pre></section>
    <section><h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-2"><History className="size-3.5"/> Version history</h3>
      <div className="space-y-2 max-h-48 overflow-auto">{versions.isLoading?<div className="text-xs text-zinc-500">Loading versions…</div>:(versions.data??[]).length?(versions.data??[]).map((v:any)=><div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"><div><div>v{v.version_number} · {v.name}</div><div className="text-zinc-500 mt-0.5">{new Date(v.created_at).toLocaleString()}</div></div>{own&&<button disabled={restore.isPending} onClick={()=>restore.mutate(Number(v.version_number))} className="px-2 py-1 rounded border border-border hover:border-brand/50">Restore</button>}</div>):<div className="text-xs text-zinc-500">No previous snapshots yet. A version is created automatically when template content changes.</div>}</div>
    </section>
  </Modal>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  return <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6 flex items-center justify-center" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="w-full max-w-3xl max-h-[92vh] overflow-auto rounded-2xl border border-border bg-panel p-4 sm:p-6 space-y-4">
      <div className="flex justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose}><X className="size-5"/></button></div>{children}
      <style>{`.field{width:100%;min-height:2.5rem;padding:.55rem .7rem;border-radius:.375rem;background:#09090b;border:1px solid var(--border);font-size:.875rem}`}</style>
    </div>
  </div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){ return <label className="block"><div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1.5">{label}</div>{children}</label>; }
function guessCategory(type:string){ const s=type.toLowerCase(); if(s.includes("quiz")||s.includes("match"))return "Quiz & Trivia"; if(s.includes("educat"))return "Education"; if(s.includes("motiv"))return "Motivation"; if(s.includes("news"))return "News"; if(s.includes("product"))return "Product"; if(s.includes("spiritual"))return "Spiritual"; return "Other"; }
function slug(value:string){ return value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
