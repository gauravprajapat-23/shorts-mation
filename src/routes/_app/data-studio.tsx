import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, CheckCircle2, ClipboardPaste, CopyPlus, Eye, FileJson, FileSpreadsheet,
  ListPlus, Plus, Save, Search, Sparkles, Trash2, Upload, WandSparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { TemplatePreview } from "@/lib/template-preview";
import type { EditorDocument } from "@/lib/types";
import {
  applyBulkPaste, applyImportedRows, autoMapHeaders, autofillColumn, blankTemplateCsv,
  buildAlphabetAssetMap, columnsForTemplate, createStudioRow, createTemplateSampleRows, fillTemplateDefaults,
  parseDelimitedTable, parseStudioJson, resolveImportedAssetValues, rowToCampaignItem,
  sampleTemplateCsv, studioRowsToCsv, studioRowsToJson, type ImportMapping, type StudioAsset,
  type StudioColumn, type StudioIssue, type StudioRow, validateStudioRows,
} from "@/lib/automation-data-studio";
import { materializeAutomationDocument } from "@/lib/automation-variables";
import { generateDataStudioCampaign } from "@/lib/data-studio.functions";
import { generateCampaignDataset, getAiSettings } from "@/lib/ai-content.functions";

export const Route = createFileRoute("/_app/data-studio")({
  head: () => ({ meta: [{ title: "Automation Data Studio — ShortsForge" }] }),
  component: AutomationDataStudioPage,
});

type TemplateRow = {
  id:string; name:string; type:string; aspect_ratio:string; template_json:unknown;
  required_variables?:string[]|null; validation_score?:number|null;
};
type AssetRow = StudioAsset;
type ImportState = { headers:string[]; sourceRows:Record<string,string>[]; mapping:ImportMapping } | null;

function AutomationDataStudioPage() {
  const navigate=useNavigate();
  const createCampaign=useServerFn(generateDataStudioCampaign);
  const generateAi=useServerFn(generateCampaignDataset);
  const fetchAiSettings=useServerFn(getAiSettings);
  const fileRef=useRef<HTMLInputElement>(null);
  const [templateId,setTemplateId]=useState("");
  const [rows,setRows]=useState<StudioRow[]>([]);
  const [extraColumns,setExtraColumns]=useState<StudioColumn[]>([]);
  const [mapping,setMapping]=useState<Record<string,string>>({});
  const [selected,setSelected]=useState<{row:number;col:number}>({row:0,col:0});
  const [selectedRows,setSelectedRows]=useState<Set<string>>(()=>new Set());
  const [bulkOpen,setBulkOpen]=useState(false);
  const [bulkText,setBulkText]=useState("");
  const [importState,setImportState]=useState<ImportState>(null);
  const [importMode,setImportMode]=useState<"replace"|"append">("replace");
  const [addUnmatchedColumns,setAddUnmatchedColumns]=useState(true);
  const [sampleRows,setSampleRows]=useState(6);
  const [previewRow,setPreviewRow]=useState<StudioRow|null>(null);
  const [name,setName]=useState("Automation Data Campaign");
  const [timezone,setTimezone]=useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [youtubeId,setYoutubeId]=useState<string|null>(null);
  const [studioId,setStudioId]=useState<string|null>(null);
  const [draftName,setDraftName]=useState("My content table");
  const [search,setSearch]=useState("");
  const [generating,setGenerating]=useState(false);
  const [aiOpen,setAiOpen]=useState(false);
  const [aiPrompt,setAiPrompt]=useState("Create 30 animal letter-match Shorts for US kids");
  const [aiCount,setAiCount]=useState(30);
  const [aiMarket,setAiMarket]=useState("United States");
  const [aiAudience,setAiAudience]=useState("Kids and parents; simple, upbeat, age-appropriate language");
  const [aiGenerating,setAiGenerating]=useState(false);

  const templates=useQuery({
    queryKey:["data-studio-templates"],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("templates")
        .select("id,name,type,aspect_ratio,template_json,required_variables,validation_score")
        .order("is_default",{ascending:false}).order("created_at",{ascending:false});
      if(error)throw error;
      return (data??[]) as TemplateRow[];
    },
  });
  const assets=useQuery({
    queryKey:["data-studio-assets"],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("assets")
        .select("id,file_name,type,lifecycle_status,storage_path,mime_type,size").eq("lifecycle_status","active").order("created_at",{ascending:false}).limit(1000);
      if(error)throw error;
      return (data??[]) as AssetRow[];
    },
  });
  const youtube=useQuery({
    queryKey:["data-studio-youtube"],
    queryFn:async()=>{
      const {data,error}=await supabase.from("youtube_connections").select("id,channel_name,is_connected").eq("is_connected",true);
      if(error)throw error; return data??[];
    },
  });
  const aiSettings=useQuery({queryKey:["ai-settings"],queryFn:()=>fetchAiSettings({data:{} as never})});
  const drafts=useQuery({
    queryKey:["data-studio-drafts"],
    queryFn:async()=>{
      const {data,error}=await (supabase as any).from("automation_data_studios")
        .select("id,name,template_id,youtube_connection_id,timezone,columns_json,rows_json,mapping_json,settings_json,updated_at,last_generated_campaign_id")
        .order("updated_at",{ascending:false}).limit(30);
      if(error)throw error; return data??[];
    },
  });

  const template=useMemo(()=>templates.data?.find((t)=>t.id===templateId)??null,[templates.data,templateId]);
  const baseColumns=useMemo(()=>template ? columnsForTemplate(template.template_json as EditorDocument) : [],[template]);
  const columns=useMemo(()=>[...baseColumns,...extraColumns],[baseColumns,extraColumns]);
  const templateColumns=useMemo(()=>columns.filter((c)=>c.source==="template"),[columns]);

  const effectiveMapping=useMemo(()=>{
    const out:Record<string,string>={};
    for(const col of templateColumns) out[col.key]=mapping[col.key]||col.key;
    return out;
  },[templateColumns,mapping]);

  const issues=useMemo(()=>{
    return validateStudioRows(rows,columns,effectiveMapping);
  },[rows,columns,templateColumns,effectiveMapping]);
  const issueMap=useMemo(()=>{
    const map=new Map<string,StudioIssue[]>();
    for(const issue of issues){
      const key=`${issue.rowId}:${issue.columnKey}`;
      map.set(key,[...(map.get(key)??[]),issue]);
      if(issue.columnKey==="__row") map.set(`${issue.rowId}:__row`,[...(map.get(`${issue.rowId}:__row`)??[]),issue]);
    }
    return map;
  },[issues]);
  const errorCount=issues.filter((i)=>i.severity==="error").length;
  const warningCount=issues.filter((i)=>i.severity==="warning").length;
  const validRows=rows.filter((row)=>!issues.some((i)=>i.rowId===row.id&&i.severity==="error"));
  const filteredRows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q)return rows;
    return rows.filter((r)=>Object.values(r.values).some((v)=>v.toLowerCase().includes(q)));
  },[rows,search]);
  const requiredColumns=useMemo(()=>columns.filter((c)=>c.required),[columns]);
  const mediaColumns=useMemo(()=>columns.filter((c)=>["image","video","audio","media"].includes(c.kind)),[columns]);
  const alphabetAssetsColumn=useMemo(()=>columns.find((c)=>c.key.toLowerCase().includes("alphabetassets"))??null,[columns]);
  const mappedImportCount=importState?Object.values(importState.mapping).filter(Boolean).length:0;

  function chooseTemplate(id:string){
    setTemplateId(id);
    const selectedTemplate=templates.data?.find((t)=>t.id===id);
    if(!selectedTemplate)return;
    const cols=columnsForTemplate(selectedTemplate.template_json as EditorDocument);
    setExtraColumns([]);
    setRows(createTemplateSampleRows(cols,selectedTemplate.name,6,assets.data??[]));
    setMapping(Object.fromEntries(cols.filter((c)=>c.source==="template").map((c)=>[c.key,c.key])));
    setSelected({row:0,col:0});
    setSelectedRows(new Set());
    setStudioId(null);
  }

  function updateCell(rowId:string,key:string,value:string){
    setRows((current)=>current.map((row)=>row.id===rowId?{...row,values:{...row.values,[key]:value}}:row));
  }
  function addRows(count=1){
    setRows((current)=>{
      const room=Math.max(0,100-current.length);
      const add=Math.min(room,count);
      return [...current,...Array.from({length:add},(_,i)=>createStudioRow(columns,current.length+i))];
    });
  }
  function deleteSelected(){
    if(!selectedRows.size)return;
    setRows((current)=>current.filter((r)=>!selectedRows.has(r.id)));
    setSelectedRows(new Set());
  }
  function addColumn(){
    const raw=prompt("Column name","custom_field");
    if(!raw)return;
    const key=raw.trim().replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_.-]/g,"").slice(0,80);
    if(!key || columns.some((c)=>c.key===key)){ toast.error("Use a unique column name"); return; }
    setExtraColumns((current)=>[...current,{id:`custom_${Date.now()}`,key,label:raw.trim(),kind:"text",source:"imported"}]);
    setRows((current)=>current.map((r)=>({...r,values:{...r.values,[key]:""}})));
  }

  function pasteBulk(){
    setRows((current)=>applyBulkPaste(current,columns,selected.row,selected.col,bulkText));
    setBulkText(""); setBulkOpen(false); toast.success("Pasted into table");
  }

  async function importFile(file:File){
    try{
      const text=await file.text();
      const parsed=file.name.toLowerCase().endsWith(".json")?parseStudioJson(text):parseDelimitedTable(text);
      if(!parsed.rows.length)throw new Error("The file has no data rows");
      const autoMapping=autoMapHeaders(parsed.headers,columns);
      const resolvedRows=resolveImportedAssetValues(parsed.rows,autoMapping,columns,assets.data??[]);
      setImportState({headers:parsed.headers,sourceRows:resolvedRows,mapping:autoMapping});
    }catch(e){toast.error(e instanceof Error?e.message:"Import failed");}
  }
  function applyImport(){
    if(!importState)return;
    const unmatched=addUnmatchedColumns ? importState.headers.filter((h)=>!importState.mapping[h]) : [];
    const existing=new Set(columns.map((c)=>c.key));
    const newCols:StudioColumn[]=unmatched.filter((h)=>!existing.has(h)).map((h)=>({id:`import_${h}_${Date.now()}`,key:h,label:h,kind:"text",source:"imported"}));
    const allColumns=[...columns,...newCols];
    const mapping2={...importState.mapping};
    for(const c of newCols) mapping2[c.key]=c.key;
    const start=importMode==="append"?rows.length:0;
    const imported=applyImportedRows(importState.sourceRows,mapping2,allColumns,start);
    setExtraColumns((current)=>[...current,...newCols]);
    setRows((current)=>(importMode==="append"?[...current,...imported]:imported).slice(0,100));
    setImportState(null);
    toast.success(`${imported.length} row${imported.length===1?"":"s"} imported`,{description:importMode==="append"?"Added to the current table":"Replaced the current table"});
  }

  function downloadFile(kind:"csv"|"json"){
    if(!rows.length)return;
    const text=kind==="csv"?studioRowsToCsv(rows,columns):studioRowsToJson(rows,columns);
    downloadText(`${draftName.toLowerCase().replace(/[^a-z0-9]+/g,"-")||"data-studio"}.${kind}`,text,kind==="csv"?"text/csv;charset=utf-8":"application/json;charset=utf-8");
  }

  function downloadText(filename:string,text:string,type:string){
    const blob=new Blob([text],{type});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
  }

  function downloadTemplateCsv(kind:"sample"|"blank"){
    if(!template)return;
    const slug=template.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"template";
    const csv=kind==="sample"
      ? sampleTemplateCsv(columns,template.name,sampleRows,assets.data??[])
      : blankTemplateCsv(columns);
    downloadText(`${slug}-${kind}.csv`,csv,"text/csv;charset=utf-8");
    toast.success(kind==="sample"?`Downloaded ${sampleRows}-row template sample CSV`:"Downloaded blank template CSV");
  }

  function resetToTemplateSamples(){
    if(!template)return;
    setRows(createTemplateSampleRows(columns,template.name,sampleRows,assets.data??[]));
    setSelectedRows(new Set());
    toast.success("Template sample data loaded");
  }

  function applyDefaults(){
    setRows((current)=>fillTemplateDefaults(current,columns));
    toast.success("Filled empty cells with template defaults");
  }

  function populateAlphabetAssets(){
    if(!alphabetAssetsColumn)return;
    const map=buildAlphabetAssetMap(assets.data??[]);
    const found=Object.values(map).filter(Boolean).length;
    const json=JSON.stringify(map);
    setRows((current)=>current.map((row)=>({...row,values:{...row.values,[alphabetAssetsColumn.key]:json}})));
    if(found===26) toast.success("A–Z alphabet map populated from Assets");
    else toast.warning(`Mapped ${found}/26 alphabet images`,{description:"Name alphabet files like A.png, B.png, letter-C.png, etc. Missing letters will stay blank and be shown as row errors."});
  }

  const saveDraft=useMutation({
    mutationFn:async()=>{
      if(!templateId)throw new Error("Choose a template first");
      const {data:userData}=await supabase.auth.getUser();
      if(!userData.user)throw new Error("Not signed in");
      const payload={
        user_id:userData.user.id,name:draftName.trim()||"Untitled data studio",template_id:templateId,
        youtube_connection_id:youtubeId,timezone,columns_json:extraColumns,rows_json:rows,mapping_json:effectiveMapping,
        settings_json:{campaign_name:name},
      };
      const result=studioId
        ? await (supabase as any).from("automation_data_studios").update(payload).eq("id",studioId).select("id").single()
        : await (supabase as any).from("automation_data_studios").insert(payload).select("id").single();
      if(result.error)throw result.error;
      return String(result.data.id);
    },
    onSuccess:(id)=>{setStudioId(id);drafts.refetch();toast.success("Data Studio draft saved");},
    onError:(e:Error)=>toast.error(e.message),
  });

  function loadDraft(d:any){
    const tpl=templates.data?.find((t)=>t.id===d.template_id);
    if(!tpl){toast.error("The draft template is no longer available");return;}
    setTemplateId(d.template_id);
    setExtraColumns(Array.isArray(d.columns_json)?d.columns_json:[]);
    setRows(Array.isArray(d.rows_json)?d.rows_json:[]);
    setMapping(d.mapping_json&&typeof d.mapping_json==="object"?d.mapping_json:{});
    setYoutubeId(d.youtube_connection_id??null); setTimezone(d.timezone||"UTC");
    setName(d.settings_json?.campaign_name||`${d.name} Campaign`); setDraftName(d.name); setStudioId(d.id);
    setSelectedRows(new Set()); toast.success(`Loaded “${d.name}”`);
  }

  async function generateWithAi(){
    if(!templateId){toast.error("Choose a template first");return;}
    setAiGenerating(true);
    try{
      const result=await generateAi({data:{templateId,prompt:aiPrompt,count:Math.max(1,Math.min(100,aiCount)),market:aiMarket,audience:aiAudience}});
      const generated=result.rows.map((source,index)=>createStudioRow(columns,index,source));
      setRows(generated);
      setName(result.campaignName||name);
      setSelectedRows(new Set());
      setAiOpen(false);
      toast.success(`${generated.length} AI-generated videos are ready to review`,{description:`${result.provider} · ${result.model}`});
    }catch(e){toast.error("AI generation failed",{description:e instanceof Error?e.message:String(e)});}
    finally{setAiGenerating(false);}
  }

  async function generateCampaign(){
    if(!templateId||!template)return;
    if(rows.length<1){toast.error("Add at least one row");return;}
    if(rows.length>100){toast.error("Data Studio can generate at most 100 videos per campaign");return;}
    if(errorCount){toast.error(`Fix ${errorCount} table error${errorCount===1?"":"s"} before generating`);return;}
    setGenerating(true);
    try{
      const items=rows.map((row)=>rowToCampaignItem(row,columns,effectiveMapping));
      const created=await createCampaign({data:{
        studioId,
        campaign:{
          name:name.trim()||"Automation Data Campaign",youtube_connection_id:youtubeId,template_id:templateId,timezone,
          settings_json:{
            source:"automation_data_studio",studio_id:studioId,field_mapping:effectiveMapping,
            generated_rows:rows.length,
          },
        },
        items,
      }});
      toast.success(`${created.count} video jobs created`);
      navigate({to:"/campaigns/$campaignId",params:{campaignId:created.campaignId}});
    }catch(e){toast.error("Campaign generation failed",{description:e instanceof Error?e.message:String(e)});}
    finally{setGenerating(false);}
  }

  if(templates.isLoading)return <div className="p-8 text-zinc-500">Loading Data Studio…</div>;

  return <div className="p-3 sm:p-5 lg:p-7 max-w-[1800px] mx-auto">
    <PageHeader title="Automation Data Studio" description="Spreadsheet-style campaign content editor with template-aware validation, media cells, bulk editing, previews, and direct campaign generation."
      action={<div className="flex flex-wrap gap-2">
        <button onClick={()=>saveDraft.mutate()} disabled={!templateId||saveDraft.isPending} className="btn"><Save className="size-4"/> Save draft</button>
        <button onClick={generateCampaign} disabled={!templateId||generating||!!errorCount||!rows.length} className="btn bg-brand text-white border-brand"><Sparkles className="size-4"/> {generating?"Generating…":`Generate ${rows.length||0} videos`}</button>
      </div>}/>

    <div className="grid xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
      <aside className="space-y-4">
        <section className="panel p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Template</div>
          <select value={templateId} onChange={(e)=>chooseTemplate(e.target.value)} className="field">
            <option value="">Choose template…</option>
            {(templates.data??[]).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {template&&<div className="mt-3 aspect-[9/16] max-h-64 rounded-lg overflow-hidden bg-black border border-border"><TemplatePreview doc={template.template_json as EditorDocument} aspect={template.aspect_ratio as any}/></div>}
          {template&&<div className="text-[11px] text-zinc-500 mt-2">Quality {template.validation_score??0}% · {template.required_variables?.length??0} required variables</div>}
        </section>

        {template&&<section className="panel p-4 space-y-3">
          <div className="flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Template CSV</div><span className="text-[10px] text-zinc-600">{columns.length} columns</span></div>
          <p className="text-[11px] text-zinc-500">CSV columns are generated from this template's actual automation variables, types, required fields, defaults, and media inputs.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={()=>downloadTemplateCsv("sample")} className="tool justify-center"><FileSpreadsheet className="size-3.5"/> Sample CSV</button>
            <button onClick={()=>downloadTemplateCsv("blank")} className="tool justify-center"><FileSpreadsheet className="size-3.5"/> Blank CSV</button>
          </div>
          <label className="label">Sample rows<input type="number" min={1} max={100} value={sampleRows} onChange={(e)=>setSampleRows(Math.max(1,Math.min(100,Number(e.target.value)||1)))} className="field"/></label>
          <button onClick={resetToTemplateSamples} className="tool w-full justify-center"><WandSparkles className="size-3.5"/> Load sample rows into table</button>          {alphabetAssetsColumn&&<button onClick={populateAlphabetAssets} className="tool w-full justify-center border-brand/30 text-brand"><Sparkles className="size-3.5"/> Auto-map A–Z from Assets</button>}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-[10px] text-zinc-500">{requiredColumns.length} required · {mediaColumns.length} media · {templateColumns.length} template variables</div>
            <div className="max-h-40 overflow-auto space-y-1">{templateColumns.map((c)=><div key={c.key} className="rounded border border-border/70 px-2 py-1.5 text-[10px]"><div className="flex gap-2 items-center"><span className="font-mono text-zinc-300 truncate">{c.key}</span><span className="ml-auto text-zinc-600">{c.kind}{c.required?" · required":""}</span></div>{c.variable?.description&&<div className="text-zinc-600 mt-1 line-clamp-2">{c.variable.description}</div>}</div>)}</div>
          </div>
        </section>}

        <section className="panel p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Campaign output</div>
          <label className="label">Campaign name<input value={name} onChange={(e)=>setName(e.target.value)} className="field"/></label>
          <label className="label">Timezone<input value={timezone} onChange={(e)=>setTimezone(e.target.value)} className="field"/></label>
          <label className="label">YouTube channel<select value={youtubeId??""} onChange={(e)=>setYoutubeId(e.target.value||null)} className="field"><option value="">None — connect later</option>{(youtube.data??[]).map((c)=><option key={c.id} value={c.id}>{c.channel_name}</option>)}</select></label>
        </section>

        <section className="panel p-4">
          <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold uppercase tracking-widest text-zinc-500">Saved tables</div><span className="text-[10px] text-zinc-600">{drafts.data?.length??0}</span></div>
          <input value={draftName} onChange={(e)=>setDraftName(e.target.value)} className="field mb-2" placeholder="Draft name"/>
          <div className="max-h-56 overflow-auto space-y-1">{(drafts.data??[]).map((d:any)=><button key={d.id} onClick={()=>loadDraft(d)} className={`w-full text-left rounded-md border px-2.5 py-2 ${studioId===d.id?"border-brand bg-brand/5":"border-border hover:bg-white/5"}`}><div className="text-xs font-semibold truncate">{d.name}</div><div className="text-[10px] text-zinc-500">{new Date(d.updated_at).toLocaleString()}</div></button>)}</div>
        </section>
      </aside>

      <main className="min-w-0 space-y-3">
        <section className="panel p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!templateId||rows.length>=100} onClick={()=>addRows(1)} className="tool"><Plus className="size-3.5"/> Row</button>
            <button disabled={!templateId||rows.length>=100} onClick={()=>addRows(10)} className="tool"><ListPlus className="size-3.5"/> +10 rows</button>
            <button disabled={!templateId||rows.length>=100} onClick={()=>addRows(100-rows.length)} className="tool"><Sparkles className="size-3.5"/> Fill to 100</button>            <button disabled={!templateId} onClick={()=>setAiOpen(true)} className="tool border-brand/40 bg-brand/10 text-brand"><Sparkles className="size-3.5"/> Generate with AI</button>
            <button disabled={!templateId} onClick={addColumn} className="tool"><CopyPlus className="size-3.5"/> Column</button>
            <button disabled={!selectedRows.size} onClick={deleteSelected} className="tool text-red-300"><Trash2 className="size-3.5"/> Delete selected</button>
            <div className="w-px h-7 bg-border mx-1"/>
            <button disabled={!templateId} onClick={()=>setBulkOpen(true)} className="tool"><ClipboardPaste className="size-3.5"/> Bulk paste</button>
            <button disabled={!templateId} onClick={()=>fileRef.current?.click()} className="tool"><Upload className="size-3.5"/> Import CSV/JSON</button>
            <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e)=>{const f=e.target.files?.[0];e.currentTarget.value="";if(f)void importFile(f);}}/>
            <button disabled={!rows.length} onClick={()=>downloadFile("csv")} className="tool"><FileSpreadsheet className="size-3.5"/> CSV</button>
            <button disabled={!rows.length} onClick={()=>downloadFile("json")} className="tool"><FileJson className="size-3.5"/> JSON</button>
            <div className="ml-auto relative min-w-48"><Search className="absolute size-3.5 left-2.5 top-2.5 text-zinc-500"/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search rows…" className="field pl-8"/></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
            <span className="text-zinc-400">{rows.length}/100 rows</span>
            <span className="text-emerald-400"><CheckCircle2 className="size-3 inline"/> {validRows.length} valid</span>
            <span className={errorCount?"text-red-400":"text-zinc-500"}>{errorCount} errors</span>
            <span className={warningCount?"text-amber-400":"text-zinc-500"}>{warningCount} warnings</span>
          </div>
        </section>

        {templateId&&<section className="panel p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Variable mapping</span>
            {templateColumns.map((col)=><label key={col.key} className="flex items-center gap-1 text-[11px]"><span className={col.required?"text-brand":"text-zinc-400"}>{col.key}{col.required?"*":""}</span><span className="text-zinc-600">←</span><select value={effectiveMapping[col.key]} onChange={(e)=>setMapping((m)=>({...m,[col.key]:e.target.value}))} className="h-7 rounded bg-canvas border border-border px-1.5">{columns.map((source)=><option key={source.key} value={source.key}>{source.key}</option>)}</select></label>)}
          </div>
        </section>}

        <section className="panel overflow-hidden">
          {!templateId?<div className="p-12 text-center"><WandSparkles className="size-8 mx-auto text-zinc-600 mb-3"/><div className="font-semibold">Choose a template to build your data table</div><p className="text-sm text-zinc-500 mt-1">Columns will be generated from the template automation schema.</p></div>:
          <div className="overflow-auto max-h-[68vh]">
            <table className="border-collapse text-xs min-w-max w-full">
              <thead className="sticky top-0 z-20 bg-zinc-950"><tr>
                <th className="sticky left-0 z-30 bg-zinc-950 border-b border-r border-border px-2 py-2 w-14">#</th>
                {columns.map((col,colIndex)=><th key={col.id} className="border-b border-r border-border px-2 py-2 text-left min-w-44">
                  <div className="flex items-center justify-between gap-2"><div><div className="font-bold">{col.label}{col.required&&<span className="text-brand">*</span>}</div><div className="text-[9px] text-zinc-600 font-normal">{col.key} · {col.kind}</div></div>
                  <button onClick={()=>setRows((r)=>autofillColumn(r,col.key))} className="p-1 text-zinc-500 hover:text-white" title="Auto-fill down"><WandSparkles className="size-3"/></button></div>
                </th>)}
                <th className="border-b border-border px-2 py-2 min-w-24">Preview</th>
              </tr></thead>
              <tbody>{filteredRows.map((row,displayIndex)=>{
                const rowIndex=rows.findIndex((r)=>r.id===row.id);
                const rowIssues=issues.filter((i)=>i.rowId===row.id);
                return <tr key={row.id} className={rowIssues.some((i)=>i.severity==="error")?"bg-red-500/[0.025]":""}>
                  <td className="sticky left-0 z-10 bg-panel border-r border-b border-border px-2 py-1.5">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={selectedRows.has(row.id)} onChange={(e)=>setSelectedRows((current)=>{const next=new Set(current);e.target.checked?next.add(row.id):next.delete(row.id);return next;})}/><span className="font-mono text-zinc-500">{rowIndex+1}</span></label>
                    {!!rowIssues.length&&<span title={rowIssues.map((i)=>`${i.columnKey}: ${i.message}`).join("\n")}><AlertTriangle className={`size-3 mt-1 ${rowIssues.some((i)=>i.severity==="error")?"text-red-400":"text-amber-400"}`}/></span>}
                  </td>
                  {columns.map((col,colIndex)=>{
                    const cellIssues=issueMap.get(`${row.id}:${col.key}`)??[];
                    return <td key={col.id} className={`border-r border-b border-border p-0 ${selected.row===rowIndex&&selected.col===colIndex?"ring-1 ring-inset ring-brand":""}`} onClick={()=>setSelected({row:rowIndex,col:colIndex})}>
                      <StudioCell column={col} value={row.values[col.key]??""} onChange={(v)=>updateCell(row.id,col.key,v)} assets={assets.data??[]} issues={cellIssues}/>
                    </td>;
                  })}
                  <td className="border-b border-border px-2"><button onClick={()=>setPreviewRow(row)} className="tool"><Eye className="size-3.5"/> Preview</button></td>
                </tr>;
              })}</tbody>
            </table>
            {!rows.length&&<div className="p-10 text-center text-zinc-500">No rows. Add rows or import a file.</div>}
          </div>}
        </section>
      </main>
    </div>

    {aiOpen&&<Modal title="AI Campaign Generator" onClose={()=>!aiGenerating&&setAiOpen(false)}>
      <div className="rounded-xl border border-brand/25 bg-brand/5 p-4"><div className="font-semibold text-sm">Describe the campaign you want</div><p className="text-xs text-zinc-400 mt-1">AI will generate template variables plus titles, descriptions, tags, hashtags, hooks, CTAs, quiz/word/caption/scene data where relevant. Nothing is rendered until you review the table and generate the campaign.</p></div>
      {!aiSettings.data?.configured&&<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">No AI provider is configured. Add an OpenAI or OpenRouter key in Settings first.</div>}
      {aiSettings.data?.configured&&<div className="text-xs text-zinc-500">Provider: <span className="text-zinc-300">{aiSettings.data.provider}</span> · Model: <span className="text-zinc-300">{aiSettings.data.model}</span></div>}
      <label className="label">Prompt<textarea value={aiPrompt} onChange={(e)=>setAiPrompt(e.target.value)} className="field min-h-28 mt-1 text-sm normal-case tracking-normal font-normal" placeholder="Create 30 animal letter-match Shorts for US kids"/></label>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="label">Videos<input type="number" min={1} max={100} value={aiCount} onChange={(e)=>setAiCount(Math.max(1,Math.min(100,Number(e.target.value)||1)))} className="field"/></label>
        <label className="label">Target market<input value={aiMarket} onChange={(e)=>setAiMarket(e.target.value)} className="field"/></label>
        <label className="label">Audience<input value={aiAudience} onChange={(e)=>setAiAudience(e.target.value)} className="field"/></label>
      </div>
      <div className="grid sm:grid-cols-3 gap-2 text-[11px] text-zinc-400"><div className="rounded-lg border border-border p-2">Titles + descriptions + tags</div><div className="rounded-lg border border-border p-2">Hooks + CTAs + captions</div><div className="rounded-lg border border-border p-2">Quiz + words + scene data</div></div>
      <button disabled={!aiSettings.data?.configured||aiGenerating||aiPrompt.trim().length<8} onClick={generateWithAi} className="btn bg-brand text-white border-brand w-full justify-center py-3">{aiGenerating?<><span className="animate-pulse">Generating {aiCount} rows…</span></>:<><Sparkles className="size-4"/> Generate ready-to-review dataset</>}</button>
    </Modal>}

    {bulkOpen&&<Modal title="Bulk paste from spreadsheet" onClose={()=>setBulkOpen(false)}>
      <p className="text-xs text-zinc-500">Paste tab-separated cells copied from Excel, Google Sheets, or another spreadsheet. Data starts at row {selected.row+1}, column {columns[selected.col]?.label??selected.col+1}.</p>
      <textarea autoFocus value={bulkText} onChange={(e)=>setBulkText(e.target.value)} className="field min-h-64 font-mono text-xs" placeholder={"Title 1\tDescription 1\nTitle 2\tDescription 2"}/>
      <button onClick={pasteBulk} disabled={!bulkText.trim()} className="btn bg-brand text-white border-brand w-full justify-center"><ClipboardPaste className="size-4"/> Paste into table</button>
    </Modal>}

    {importState&&<Modal title={`Map ${importState.sourceRows.length} imported rows`} onClose={()=>setImportState(null)}>
      <div className="rounded-lg border border-border bg-black/20 p-3 grid sm:grid-cols-3 gap-3 text-xs">
        <div><div className="text-zinc-500">Columns</div><div className="font-bold mt-1">{importState.headers.length}</div></div>
        <div><div className="text-zinc-500">Auto-mapped</div><div className="font-bold mt-1">{mappedImportCount}/{importState.headers.length}</div></div>
        <div><div className="text-zinc-500">Template required</div><div className="font-bold mt-1">{requiredColumns.length}</div></div>
      </div>
      <p className="text-xs text-zinc-500">Incoming headers are matched against template variable keys and labels. Asset file names/IDs are automatically converted to durable <code>asset://</code> references for media variables.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="label">Import mode<select value={importMode} onChange={(e)=>setImportMode(e.target.value as "replace"|"append")} className="field"><option value="replace">Replace current rows</option><option value="append">Append to current rows</option></select></label>
        <label className="label">Unmatched columns<select value={addUnmatchedColumns?"add":"ignore"} onChange={(e)=>setAddUnmatchedColumns(e.target.value==="add")} className="field"><option value="add">Add as custom columns</option><option value="ignore">Ignore unmatched columns</option></select></label>
      </div>
      <div className="space-y-2 max-h-96 overflow-auto">{importState.headers.map((header)=><div key={header} className="grid grid-cols-[1fr_24px_1fr] items-center gap-2"><div className="field truncate">{header}</div><span className="text-zinc-600">→</span><select value={importState.mapping[header]??""} onChange={(e)=>setImportState((state)=>state?{...state,mapping:{...state.mapping,[header]:e.target.value}}:state)} className="field"><option value="">Unmapped</option>{columns.map((c)=><option key={c.key} value={c.key}>{c.label} ({c.key}){c.required?" *":""}</option>)}</select></div>)}</div>
      <button onClick={applyImport} className="btn bg-brand text-white border-brand w-full justify-center">{importMode==="append"?"Append":"Import"} {importState.sourceRows.length} rows</button>
    </Modal>}

    {previewRow&&template&&<RowPreviewModal row={previewRow} template={template} templateColumns={templateColumns} mapping={effectiveMapping} rowNumber={rows.findIndex((r)=>r.id===previewRow.id)+1} onClose={()=>setPreviewRow(null)}/>}

    <style>{`
      .panel{border:1px solid var(--border);background:var(--panel);border-radius:.85rem}
      .field{width:100%;min-height:2.25rem;padding:.45rem .65rem;border-radius:.375rem;background:#09090b;border:1px solid var(--border);font-size:.75rem}
      .label{display:block;font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:#71717a;font-weight:700}.label .field{margin-top:.3rem;text-transform:none;letter-spacing:normal;color:white;font-weight:400}
      .btn,.tool{display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--border);border-radius:.375rem;padding:.48rem .7rem;font-size:.72rem;font-weight:650}
      .btn:disabled,.tool:disabled{opacity:.4}
    `}</style>
  </div>;
}

function StudioCell({column,value,onChange,assets,issues}:{column:StudioColumn;value:string;onChange:(value:string)=>void;assets:AssetRow[];issues:StudioIssue[]}) {
  const bad=issues.some((i)=>i.severity==="error");
  const cls=`w-full min-w-44 h-9 bg-transparent px-2 outline-none ${bad?"text-red-200 bg-red-500/5":""}`;
  if(column.kind==="privacy") return <select value={value||"private"} onChange={(e)=>onChange(e.target.value)} className={cls}><option value="private">private</option><option value="unlisted">unlisted</option><option value="public">public</option></select>;
  if(column.kind==="boolean") return <select value={value} onChange={(e)=>onChange(e.target.value)} className={cls}><option value="">—</option><option value="true">true</option><option value="false">false</option></select>;
  if(column.kind==="schedule") return <input type="datetime-local" value={toLocalInput(value)} onChange={(e)=>onChange(e.target.value?new Date(e.target.value).toISOString():"")} className={cls}/>;
  if(["image","video","audio","media"].includes(column.kind)){
    const matching=assets.filter((a)=>{
      if(column.key==="youtube_thumbnail_asset_id") return ["image","logo"].includes(a.type) && ["image/jpeg","image/png"].includes(a.mime_type??"") && Number(a.size??0)>0 && Number(a.size??0)<=2*1024*1024;
      return column.kind==="media"?["image","video","logo"].includes(a.type):column.kind==="image"?["image","logo"].includes(a.type):a.type===column.kind;
    });
    const systemMedia=column.key==="background_file_name"||column.key==="audio_file_name";
    const optionValue=(a:AssetRow)=>column.key==="youtube_thumbnail_asset_id"?a.id:(systemMedia?a.file_name:`asset://${a.id}`);
    return <div className="flex min-w-56"><input value={value} onChange={(e)=>onChange(e.target.value)} className={`${cls} min-w-0 flex-1`} placeholder={column.key==="youtube_thumbnail_asset_id"?"Asset ID":column.kind==="image"?"asset://… or URL":"Choose media…"}/><select aria-label={`Pick ${column.kind}`} value="" onChange={(e)=>{if(e.target.value)onChange(e.target.value)}} className="w-10 bg-canvas border-l border-border text-transparent" title="Pick from asset library"><option value="">◫</option>{matching.map((a)=><option key={a.id} value={optionValue(a)}>{a.file_name}</option>)}</select></div>;
  }
  return <input type={column.kind==="number"?"number":"text"} value={value} onChange={(e)=>onChange(e.target.value)} className={cls} title={issues.map((i)=>i.message).join("; ")}/>;
}

function RowPreviewModal({row,template,templateColumns,mapping,rowNumber,onClose}:{row:StudioRow;template:TemplateRow;templateColumns:StudioColumn[];mapping:Record<string,string>;rowNumber:number;onClose:()=>void}) {
  const values=Object.fromEntries(templateColumns.map((c)=>[c.key,row.values[mapping[c.key]||c.key]??""]));
  const materialized=useMemo(()=>{
    try{return materializeAutomationDocument(template.template_json as EditorDocument,values);}
    catch(e){return {document:template.template_json as EditorDocument,values,errors:[{variable:"preview",message:e instanceof Error?e.message:"Preview failed"}]};}
  },[template,row.id,JSON.stringify(values)]);
  return <Modal title={`Preview row ${rowNumber}`} onClose={onClose}>
    {!!materialized.errors.length&&<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{materialized.errors.map((e:any)=>`${e.variable}: ${e.message}`).join(" · ")}</div>}
    <div className="mx-auto w-full max-w-xs aspect-[9/16] rounded-xl overflow-hidden bg-black border border-border"><TemplatePreview doc={materialized.document} aspect={template.aspect_ratio as any} vars={materialized.values}/></div>
    <div className="grid sm:grid-cols-2 gap-2 text-xs">{templateColumns.map((c)=><div key={c.key} className="rounded-lg border border-border p-2"><div className="text-zinc-500">{c.key}</div><div className="truncate mt-1">{row.values[mapping[c.key]||c.key]||"—"}</div></div>)}</div>
  </Modal>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  return <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6 flex items-center justify-center" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="w-full max-w-3xl max-h-[92vh] overflow-auto rounded-2xl border border-border bg-panel p-4 sm:p-6 space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold">{title}</h2><button onClick={onClose}><X className="size-5"/></button></div>{children}</div>
  </div>;
}
function toLocalInput(value:string){if(!value)return"";const d=new Date(value);if(!Number.isFinite(d.getTime()))return"";const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
