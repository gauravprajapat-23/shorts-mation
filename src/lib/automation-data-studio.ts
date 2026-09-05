import Papa from "papaparse";
import type { AutomationVariableDefinition, EditorDocument } from "@/lib/types";
import { migrateDocumentV1ToV2 } from "@/lib/editor-document-v2";
import { extractVariables } from "@/lib/editor-defaults";

export type StudioColumnKind =
  | "text" | "number" | "boolean" | "image" | "video" | "audio" | "media"
  | "schedule" | "privacy" | "tags";

export type StudioColumn = {
  id: string;
  key: string;
  label: string;
  kind: StudioColumnKind;
  required?: boolean;
  source: "system" | "template" | "imported";
  variable?: AutomationVariableDefinition;
};

export type StudioRow = {
  id: string;
  values: Record<string, string>;
};

export type StudioIssue = {
  rowId: string;
  rowIndex: number;
  columnKey: string;
  severity: "error" | "warning";
  message: string;
};

export type ImportMapping = Record<string, string>;

export const STUDIO_SYSTEM_COLUMNS: StudioColumn[] = [
  { id:"sys_video_file_name", key:"video_file_name", label:"Video file", kind:"text", required:true, source:"system" },
  { id:"sys_title", key:"title", label:"YouTube title", kind:"text", source:"system" },
  { id:"sys_description", key:"description", label:"Description", kind:"text", source:"system" },
  { id:"sys_hook", key:"hook", label:"Hook", kind:"text", source:"system" },
  { id:"sys_cta", key:"cta", label:"CTA", kind:"text", source:"system" },
  { id:"sys_captions", key:"captions", label:"Captions", kind:"text", source:"system" },
  { id:"sys_quiz_question", key:"quiz_question", label:"Quiz question", kind:"text", source:"system" },
  { id:"sys_quiz_answer", key:"quiz_answer", label:"Quiz answer", kind:"text", source:"system" },
  { id:"sys_scene_data", key:"scene_data", label:"Scene data", kind:"text", source:"system" },
  { id:"sys_tags", key:"tags", label:"Tags", kind:"tags", source:"system" },
  { id:"sys_hashtags", key:"hashtags", label:"Hashtags", kind:"tags", source:"system" },
  { id:"sys_privacy", key:"privacy", label:"Privacy", kind:"privacy", source:"system" },
  { id:"sys_schedule", key:"schedule_at", label:"Schedule", kind:"schedule", source:"system" },
  { id:"sys_playlist", key:"playlist", label:"Playlist", kind:"text", source:"system" },
  { id:"sys_category", key:"category", label:"Category", kind:"text", source:"system" },
  { id:"sys_language", key:"language", label:"Language", kind:"text", source:"system" },
  { id:"sys_made_for_kids", key:"made_for_kids", label:"Made for kids", kind:"boolean", source:"system" },
  { id:"sys_thumbnail", key:"youtube_thumbnail_asset_id", label:"YouTube thumbnail", kind:"image", source:"system" },
  { id:"sys_background", key:"background_file_name", label:"Background media", kind:"media", source:"system" },
  { id:"sys_audio", key:"audio_file_name", label:"Audio media", kind:"audio", source:"system" },
];

function cleanKey(value: string): string {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80);
}

const HEADER_ALIASES: Record<string,string> = {
  filename:"video_file_name", file:"video_file_name", video:"video_file_name",
  youtube_title:"title", youtubetitle:"title",
  youtube_description:"description", youtubedescription:"description",
  publish_at:"schedule_at", scheduled_at:"schedule_at", schedule:"schedule_at", datetime:"schedule_at",
  background:"background_file_name", background_media:"background_file_name",
  audio:"audio_file_name", music:"audio_file_name", sound:"audio_file_name",
  youtube_privacy:"privacy", playlist_id:"playlist", category_id:"category",
};

function normalizedHeader(value:string){
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g,"");
}

export type StudioAsset = {
  id:string;
  file_name:string;
  type:string;
  lifecycle_status?:string;
  storage_path?:string|null;
  mime_type?:string|null;
  size?:number|null;
};

function assetRef(asset:StudioAsset){ return `asset://${asset.id}`; }

function fileStem(name:string){
  return name.toLowerCase().replace(/\.[^.]+$/,"").replace(/[^a-z0-9]+/g," ").trim();
}

function findLetterAsset(letter:string, assets:StudioAsset[]){
  const target=letter.toLowerCase();
  const imageAssets=assets.filter((a)=>["image","logo"].includes(a.type));
  const scored=imageAssets.map((asset)=>{
    const stem=fileStem(asset.file_name);
    const tokens=stem.split(/\s+/).filter(Boolean);
    let score=0;
    if(stem===target) score=100;
    else if(tokens.length===1&&tokens[0]===target) score=95;
    else if(tokens.includes(target)) score=80;
    else if(stem.startsWith(`${target} `)||stem.endsWith(` ${target}`)) score=70;
    return {asset,score};
  }).filter((x)=>x.score>0).sort((a,b)=>b.score-a.score);
  return scored[0]?.asset ?? null;
}

export function buildAlphabetAssetMap(assets:StudioAsset[]):Record<string,string>{
  return Object.fromEntries("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter)=>{
    const asset=findLetterAsset(letter,assets);
    return [letter,asset?assetRef(asset):""];
  }));
}

function mediaAssetForColumn(column:StudioColumn,assets:StudioAsset[]):StudioAsset|null{
  const key=column.key.toLowerCase();
  const eligible=assets.filter((a)=>{
    if(column.kind==="audio") return a.type==="audio";
    if(column.kind==="video") return a.type==="video";
    if(column.kind==="image") return ["image","logo"].includes(a.type);
    if(column.kind==="media") return ["image","video","logo"].includes(a.type);
    return false;
  });
  const preferred=eligible.find((a)=>{
    const n=a.file_name.toLowerCase();
    if(key.includes("background")) return /background|bg|sky|grass/.test(n);
    if(key.includes("wrong")) return /wrong|incorrect|cross|error/.test(n);
    if(key.includes("correct")) return /correct|right|check|tick|success/.test(n);
    if(key.includes("ambulance")) return /ambulance|siren|move/.test(n);
    return false;
  });
  return preferred ?? eligible[0] ?? null;
}

export function templateSampleSeed(columns:StudioColumn[],templateName:string,index:number,assets:StudioAsset[]=[]):Record<string,unknown>{
  const flexibleWords=["APPLE","MANGO","LION","ZEBRA","COCK","HOUSE","TIGER","ORANGE","KITE","ANT"];
  const halfLetterWords=["ANT","CAT","DOG","RAT","HEN","AXE"];
  const hasThreeLetterSlots=columns.some((c)=>c.key==="letter1")&&columns.some((c)=>c.key==="letter2")&&columns.some((c)=>c.key==="letter3");
  const words=hasThreeLetterSlots?halfLetterWords:flexibleWords;
  const quizQuestions=["Which animal is known as the king of the jungle?","Which planet is called the Red Planet?","Which fruit is yellow and curved?"];
  const seed:Record<string,unknown>={
    video_file_name:`${templateName.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"video"}-${String(index+1).padStart(3,"0")}.mp4`,
    title:`${templateName} #${index+1}`,
    description:`${templateName} — episode ${index+1}`,
    tags:"shorts|automation",
    hashtags:"#shorts|#foryou",
    privacy:"private",
    language:"en",
    made_for_kids:"false",
    schedule_at:"",
  };
  const thumbnail=assets.find((a)=>["image","logo"].includes(a.type) && ["image/jpeg","image/png"].includes(a.mime_type??"") && Number(a.size??0)<=2*1024*1024);
  if(thumbnail) seed.youtube_thumbnail_asset_id=thumbnail.id;
  for(const col of columns){
    if(col.source!=="template")continue;
    const key=col.key;
    const lower=key.toLowerCase();
    if(col.variable?.defaultValue!=null){
      seed[key]=col.variable.defaultValue;
      continue;
    }
    if(lower==="word") seed[key]=words[index%words.length];
    else if(lower==="cta") seed[key]="Follow for the next challenge!";
    else if(lower==="question") seed[key]=quizQuestions[index%quizQuestions.length];
    else if(lower==="optiona") seed[key]="Lion";
    else if(lower==="optionb") seed[key]="Tiger";
    else if(lower==="optionc") seed[key]="Elephant";
    else if(lower==="optiond") seed[key]="Giraffe";
    else if(lower==="correct") seed[key]="A";
    else if(lower==="missingletter") seed[key]="A";
    else if(lower==="clue") seed[key]="Look carefully and choose the missing letter";
    else if(lower==="backgroundimage"||lower==="backgroundasset"){
      const a=mediaAssetForColumn(col,assets); seed[key]=a?assetRef(a):"";
    } else if(lower.includes("alphabetassets")){
      seed[key]=buildAlphabetAssetMap(assets);
    } else if(["image","video","audio","media"].includes(col.kind)){
      const a=mediaAssetForColumn(col,assets); seed[key]=a?assetRef(a):"";
    } else if(col.kind==="boolean") seed[key]="false";
    else if(col.kind==="number") seed[key]=String(index+1);
    else seed[key]=`Sample ${col.label||key} ${index+1}`;
  }
  // Special relationships used by starter matching templates.
  const word=String(seed.word??words[index%words.length]).toUpperCase();
  if(columns.some((c)=>c.key==="letter1")) seed.letter1=word[0]??"A";
  if(columns.some((c)=>c.key==="letter2")) seed.letter2=word[1]??"N";
  if(columns.some((c)=>c.key==="letter3")) seed.letter3=word[2]??"T";
  return seed;
}

export function createTemplateSampleRows(columns:StudioColumn[],templateName:string,count=6,assets:StudioAsset[]=[]):StudioRow[]{
  return Array.from({length:Math.max(1,Math.min(100,count))},(_,i)=>createStudioRow(columns,i,templateSampleSeed(columns,templateName,i,assets)));
}

export function blankTemplateCsv(columns:StudioColumn[]):string{
  return Papa.unparse([Object.fromEntries(columns.map((c)=>[c.key,""]))],{columns:columns.map((c)=>c.key)});
}

export function sampleTemplateCsv(columns:StudioColumn[],templateName:string,count=6,assets:StudioAsset[]=[]):string{
  return studioRowsToCsv(createTemplateSampleRows(columns,templateName,count,assets),columns);
}

export function resolveImportedAssetValues(rows:Record<string,string>[],mapping:ImportMapping,columns:StudioColumn[],assets:StudioAsset[]):Record<string,string>[]{
  if(!assets.length)return rows;
  const byName=new Map(assets.map((a)=>[a.file_name.toLowerCase(),a]));
  const byId=new Map(assets.map((a)=>[a.id,a]));
  const targetByHeader=new Map(Object.entries(mapping));
  const columnByKey=new Map(columns.map((c)=>[c.key,c]));
  const resolveSingle=(raw:string,col:StudioColumn)=>{
    const value=raw.trim();
    if(!value||/^asset:\/\//i.test(value)||/^https?:\/\//i.test(value))return raw;
    const direct=byId.get(value)||byName.get(value.toLowerCase());
    if(direct&&["image","video","audio","media"].includes(col.kind))return assetRef(direct);
    return raw;
  };
  return rows.map((row)=>{
    const next={...row};
    for(const [header,target] of targetByHeader){
      if(!target)continue;
      const col=columnByKey.get(target);if(!col)continue;
      const raw=next[header]??"";
      if(target.toLowerCase().includes("alphabetassets")&&raw.trim()){
        try{
          const obj=JSON.parse(raw);
          if(obj&&typeof obj==="object"&&!Array.isArray(obj)){
            const mapped:Record<string,string>={};
            for(const [letter,v] of Object.entries(obj)){
              const s=String(v??"");
              const found=byId.get(s)||byName.get(s.toLowerCase());
              mapped[letter]=found?assetRef(found):s;
            }
            next[header]=JSON.stringify(mapped);
          }
        }catch{/* validation will surface malformed JSON as text */}
      }else{
        next[header]=resolveSingle(raw,col);
      }
    }
    return next;
  });
}

function kindForVariable(def?: AutomationVariableDefinition): StudioColumnKind {
  if (!def) return "text";
  if (def.type === "number") return "number";
  if (def.type === "boolean") return "boolean";
  if (def.type === "image") return "image";
  if (def.type === "video") return "video";
  if (def.type === "audio") return "audio";
  return "text";
}

export function columnsForTemplate(doc: EditorDocument): StudioColumn[] {
  const v2 = migrateDocumentV1ToV2(doc);
  const definitions = new Map((v2.automationVariables ?? []).map((v) => [v.name, v]));
  const templateColumns = extractVariables(v2).filter((key) => !STUDIO_SYSTEM_COLUMNS.some((c) => c.key === key)).map((key) => {
    const variable = definitions.get(key);
    return {
      id: `var_${key}`,
      key,
      label: variable?.label || key.replace(/_/g, " "),
      kind: kindForVariable(variable),
      required: Boolean(variable?.required),
      source: "template" as const,
      variable,
    };
  });
  return [...STUDIO_SYSTEM_COLUMNS, ...templateColumns];
}

export function createStudioRow(columns: StudioColumn[], index: number, seed?: Record<string, unknown>): StudioRow {
  const values: Record<string,string> = {};
  for (const col of columns) {
    const raw = seed?.[col.key];
    if (raw != null) values[col.key] = typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    else if (col.key === "video_file_name") values[col.key] = `video-${String(index + 1).padStart(3,"0")}.mp4`;
    else if (col.key === "privacy") values[col.key] = "private";
    else if (col.variable?.defaultValue != null) values[col.key] = typeof col.variable.defaultValue === "object" ? JSON.stringify(col.variable.defaultValue) : String(col.variable.defaultValue);
    else values[col.key] = "";
  }
  return { id: cryptoId(), values };
}

export function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateStudioRows(rows: StudioRow[], columns: StudioColumn[], mapping?: Record<string,string>): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const names = new Map<string,string>();
  const signatures = new Map<string,string>();
  rows.forEach((row, rowIndex) => {
    for (const col of columns) {
      const sourceKey = col.source === "template" ? (mapping?.[col.key] || col.key) : col.key;
      const raw = row.values[sourceKey] ?? "";
      const value = raw.trim();
      if (col.required && !value) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:"Required value is missing" });
      if (col.kind === "number" && value && !Number.isFinite(Number(value))) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:"Must be a number" });
      if (col.kind === "boolean" && value && !["true","false","1","0","yes","no"].includes(value.toLowerCase())) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:"Use true/false" });
      if (col.kind === "schedule" && value && !Number.isFinite(new Date(value).getTime())) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:"Invalid date/time" });
      if (col.kind === "privacy" && value && !["private","unlisted","public"].includes(value)) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:"Use private, unlisted, or public" });
      const def = col.variable;
      if (def && value) {
        const rule = def.validation;
        if (rule?.minLength != null && value.length < rule.minLength) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:`Minimum length ${rule.minLength}` });
        if (rule?.maxLength != null && value.length > rule.maxLength) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:`Maximum length ${rule.maxLength}` });
        if (rule?.pattern) {
          try { if (!new RegExp(rule.pattern).test(value)) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:"Does not match required format" }); } catch {}
        }
        if (def.type === "number") {
          const n=Number(value);
          if (rule?.min != null && n < rule.min) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:`Minimum ${rule.min}` });
          if (rule?.max != null && n > rule.max) issues.push({ rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:`Maximum ${rule.max}` });
        }
      }
      if (col.key.toLowerCase().includes("alphabetassets") && value) {
        try {
          const parsed=JSON.parse(value);
          if(!parsed || typeof parsed!=="object" || Array.isArray(parsed)) throw new Error();
          const word=(row.values[mapping?.word||"word"]??"").toUpperCase().replace(/[^A-Z]/g,"");
          const missing=[...new Set(word.split(""))].filter((letter)=>!String((parsed as Record<string,unknown>)[letter]??"").trim());
          if(missing.length) issues.push({rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:`Missing alphabet assets for: ${missing.join(", ")}`});
        } catch {
          issues.push({rowId:row.id,rowIndex,columnKey:col.key,severity:"error",message:"Alphabet asset map must be valid JSON"});
        }
      }
      if(col.source==="template" && ["image","video","audio"].includes(col.kind) && value && !/^asset:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
        issues.push({rowId:row.id,rowIndex,columnKey:col.key,severity:"warning",message:"Use an Assets picker value or a public URL"});
      }
    }

    const filename=(row.values.video_file_name ?? "").trim().toLowerCase();
    if (filename) {
      const existing=names.get(filename);
      if (existing) issues.push({ rowId:row.id,rowIndex,columnKey:"video_file_name",severity:"error",message:"Duplicate video file name" });
      else names.set(filename,row.id);
    }
    const templateCols=columns.filter((c)=>c.source==="template");
    const signature=templateCols.map((c)=>{
      const sourceKey=mapping?.[c.key]||c.key;
      return `${c.key}:${(row.values[sourceKey]??"").trim().toLowerCase()}`;
    }).join("|");
    if (signature && templateCols.some((c)=>hasValue(row.values[mapping?.[c.key]||c.key]))) {
      const existing=signatures.get(signature);
      if (existing) issues.push({ rowId:row.id,rowIndex,columnKey:"__row",severity:"warning",message:"Content duplicates another row" });
      else signatures.set(signature,row.id);
    }
    if (!(row.values.title ?? "").trim()) issues.push({ rowId:row.id,rowIndex,columnKey:"title",severity:"warning",message:"YouTube title is empty" });
  });
  return issues;
}

export function parseDelimitedTable(text: string): { headers:string[]; rows:Record<string,string>[] } {
  const normalized=text.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").trim();
  if (!normalized) return {headers:[],rows:[]};
  const parsed=Papa.parse<string[]>(normalized,{delimiter:"",skipEmptyLines:"greedy"});
  if(parsed.errors.some((e)=>e.type==="Delimiter")) throw new Error("Could not detect CSV delimiter");
  const matrix=(parsed.data ?? []).map((r)=>r.map((v)=>String(v??"")));
  if (!matrix.length) return {headers:[],rows:[]};
  const used=new Map<string,number>();
  const headers=matrix[0]!.map((v,i)=>{
    const base=cleanKey(v)||`column_${i+1}`;
    const count=(used.get(base)??0)+1;used.set(base,count);
    return count===1?base:`${base}_${count}`;
  });
  return {
    headers,
    rows:matrix.slice(1).map((cells)=>Object.fromEntries(headers.map((h,i)=>[h,cells[i]??""]))),
  };
}

export function parseStudioJson(text:string): { headers:string[]; rows:Record<string,string>[] } {
  const raw=JSON.parse(text) as unknown;
  const list=Array.isArray(raw) ? raw : (raw && typeof raw==="object" && Array.isArray((raw as any).rows) ? (raw as any).rows : []);
  if (!Array.isArray(list)) throw new Error("JSON must be an array of row objects or { rows: [...] }");
  const headers=[...new Set(list.flatMap((row:any)=>row&&typeof row==="object"?Object.keys(row):[]))];
  return {
    headers,
    rows:list.map((row:any)=>Object.fromEntries(headers.map((h)=>[h,row?.[h]==null?"":typeof row[h]==="object"?JSON.stringify(row[h]):String(row[h])]))),
  };
}

export function autoMapHeaders(headers:string[], columns:StudioColumn[]): ImportMapping {
  const out:ImportMapping={};
  for (const header of headers) {
    const h=normalizedHeader(header);
    const aliasKey=HEADER_ALIASES[header.trim().toLowerCase()] || HEADER_ALIASES[h];
    const exact=columns.find((c)=>c.key.toLowerCase()===header.toLowerCase());
    const alias=aliasKey?columns.find((c)=>c.key===aliasKey):undefined;
    const fuzzy=columns.find((c)=>normalizedHeader(c.key)===h || normalizedHeader(c.label)===h);
    out[header]=(exact??alias??fuzzy)?.key ?? "";
  }
  return out;
}

export function applyImportedRows(inputRows:Record<string,string>[], mapping:ImportMapping, columns:StudioColumn[], startIndex=0):StudioRow[] {
  return inputRows.map((source,i)=>{
    const seed:Record<string,string>={};
    for (const [header,target] of Object.entries(mapping)) if(target) seed[target]=source[header]??"";
    return createStudioRow(columns,startIndex+i,seed);
  });
}

export function applyBulkPaste(rows:StudioRow[], columns:StudioColumn[], startRow:number, startColumn:number, text:string):StudioRow[] {
  const matrix=text.replace(/\r\n/g,"\n").split("\n").filter((line)=>line.length>0).map((line)=>line.split("\t"));
  const next=rows.map((r)=>({ ...r, values:{...r.values} }));
  for (let r=0;r<matrix.length;r++) {
    const target=startRow+r;
    if (target>=next.length) next.push(createStudioRow(columns,next.length));
    for (let c=0;c<matrix[r]!.length;c++) {
      const col=columns[startColumn+c];
      if (!col) break;
      next[target]!.values[col.key]=matrix[r]![c] ?? "";
    }
  }
  return next.slice(0,100);
}

export function autofillColumn(rows:StudioRow[], key:string):StudioRow[] {
  if (!rows.length) return rows;
  const nonEmpty=rows.findIndex((r)=>(r.values[key]??"").trim());
  if (nonEmpty<0) return rows;
  const seed=rows[nonEmpty]!.values[key] ?? "";
  const numeric=Number(seed);
  const isNumeric=seed.trim()!==""&&Number.isFinite(numeric);
  const suffix=/^(.*?)(\d+)$/.exec(seed.trim());
  const seedDate=key==="schedule_at" ? new Date(seed) : null;
  const isDate=!!seedDate && Number.isFinite(seedDate.getTime());
  return rows.map((row,index)=>{
    if ((row.values[key]??"").trim()) return row;
    let value=seed;
    const delta=index-nonEmpty;
    if (isDate) value=new Date(seedDate!.getTime()+delta*24*60*60_000).toISOString();
    else if (isNumeric) value=String(numeric + delta);
    else if (suffix) value=`${suffix[1]}${Number(suffix[2]) + delta}`;
    return {...row,values:{...row.values,[key]:value}};
  });
}

export function fillTemplateDefaults(rows:StudioRow[],columns:StudioColumn[]):StudioRow[]{
  return rows.map((row)=>({
    ...row,
    values:Object.fromEntries(columns.map((col)=>{
      const current=row.values[col.key]??"";
      if(current.trim())return [col.key,current];
      if(col.key==="privacy")return [col.key,"private"];
      if(col.variable?.defaultValue!=null)return [col.key,typeof col.variable.defaultValue==="object"?JSON.stringify(col.variable.defaultValue):String(col.variable.defaultValue)];
      return [col.key,current];
    })),
  }));
}

export function studioRowsToCsv(rows:StudioRow[], columns:StudioColumn[]):string {
  const data=rows.map((row)=>Object.fromEntries(columns.map((c)=>[c.key,row.values[c.key]??""])));
  return Papa.unparse(data,{columns:columns.map((c)=>c.key)});
}

export function studioRowsToJson(rows:StudioRow[], columns:StudioColumn[]):string {
  return `${JSON.stringify({format:"shortsforge-data-studio",formatVersion:1,rows:rows.map((r)=>Object.fromEntries(columns.map((c)=>[c.key,r.values[c.key]??""])))},null,2)}\n`;
}

export function variableValuesForPreview(row:StudioRow, columns:StudioColumn[]):Record<string,string> {
  return Object.fromEntries(columns.filter((c)=>c.source==="template").map((c)=>[c.key,row.values[c.key]??""]));
}

export function rowToCampaignItem(row:StudioRow, columns:StudioColumn[], mapping?:Record<string,string>) {
  const templateColumns=columns.filter((c)=>c.source==="template");
  const content={
    ...Object.fromEntries(templateColumns.map((c)=>{
      const sourceKey=mapping?.[c.key] || c.key;
      return [c.key,row.values[sourceKey]??""];
    })),
    _ai:{
      hook:row.values.hook??"",cta:row.values.cta??"",captions:row.values.captions??"",
      quiz_question:row.values.quiz_question??"",quiz_answer:row.values.quiz_answer??"",
      scene_data:row.values.scene_data??"{}",
    },
  };
  const splitTags=(value:string)=>value.split(/[|,]/).map((v)=>v.trim()).filter(Boolean);
  const privacy=(row.values.privacy || "private") as "private"|"unlisted"|"public";
  return {
    video_file_name: row.values.video_file_name || `video-${row.id.slice(0,8)}.mp4`,
    content_json: content,
    seo_json: {
      title:row.values.title??"",description:row.values.description??"",
      tags:splitTags(row.values.tags??""),hashtags:splitTags(row.values.hashtags??""),
    },
    youtube_settings_json: {
      privacy,
      playlist:row.values.playlist||undefined,
      category:row.values.category||undefined,
      language:row.values.language||undefined,
      madeForKids:["true","1","yes"].includes((row.values.made_for_kids||"").toLowerCase()),
      thumbnailAssetId:row.values.youtube_thumbnail_asset_id||undefined,
    },
    audio_json: row.values.audio_file_name ? {type:"uploaded",file_name:row.values.audio_file_name} : {},
    asset_json: row.values.background_file_name ? {background_file_name:row.values.background_file_name} : {},
    schedule_at: row.values.schedule_at && Number.isFinite(new Date(row.values.schedule_at).getTime()) ? new Date(row.values.schedule_at).toISOString() : null,
  };
}
