import type { AutomationVariableDefinition, EditorDocument } from "@/lib/types";
import { migrateDocumentV1ToV2 } from "@/lib/editor-document-v2";
import { extractVariables } from "@/lib/editor-defaults";

export type AiProviderName="openai"|"openrouter";
export type AiCredentials={provider:AiProviderName;key:string;model:string;baseUrl:string};

export async function getAiCredentials(userId:string):Promise<AiCredentials|null>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {decryptToken}=await import("@/lib/token-crypto.server");
  const {data}=await (supabaseAdmin as any).from("ai_providers").select("provider,api_key_encrypted,model,base_url").eq("user_id",userId).maybeSingle();
  if(data?.api_key_encrypted){
    const key=await decryptToken(data.api_key_encrypted);
    if(key)return {provider:data.provider,key,model:data.model,baseUrl:data.base_url||providerBase(data.provider)};
  }
  if(process.env.OPENAI_API_KEY)return {provider:"openai",key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||"gpt-5-mini",baseUrl:"https://api.openai.com/v1"};
  if(process.env.OPENROUTER_API_KEY)return {provider:"openrouter",key:process.env.OPENROUTER_API_KEY,model:process.env.OPENROUTER_MODEL||"openai/gpt-4o-mini",baseUrl:"https://openrouter.ai/api/v1"};
  return null;
}
export function providerBase(provider:AiProviderName){return provider==="openrouter"?"https://openrouter.ai/api/v1":"https://api.openai.com/v1";}

function variableSchema(v:AutomationVariableDefinition|undefined){
  if(!v)return {type:"string"};
  if(v.type==="number")return {type:"number"};
  if(v.type==="boolean")return {type:"boolean"};
  if(v.type==="array")return {type:"array",items:{type:"string"}};
  if(v.type==="object")return {type:"object",additionalProperties:true};
  return {type:"string"};
}

export function buildCampaignDatasetSchema(doc:EditorDocument,count:number){
  const v2=migrateDocumentV1ToV2(doc);
  const defs=new Map((v2.automationVariables??[]).map((v)=>[v.name,v]));
  const vars=extractVariables(v2);
  const rowProperties:Record<string,unknown>={
    video_file_name:{type:"string"},
    title:{type:"string"},
    description:{type:"string"},
    tags:{type:"string"},
    hashtags:{type:"string"},
    privacy:{type:"string",enum:["private","unlisted","public"]},
    hook:{type:"string"},
    cta:{type:"string"},
    captions:{type:"string"},
    quiz_question:{type:"string"},
    quiz_answer:{type:"string"},
    scene_data:{type:"string"},
  };
  for(const key of vars)rowProperties[key]=variableSchema(defs.get(key));
  return {
    name:"shortsforge_campaign_dataset",
    strict:false,
    schema:{
      type:"object",
      properties:{
        campaign_name:{type:"string"},
        rows:{type:"array",minItems:count,maxItems:count,items:{type:"object",properties:rowProperties}},
      },
      required:["campaign_name","rows"],
    },
  };
}
export function buildGenerationPrompt(input:{prompt:string;count:number;market?:string;audience?:string;templateName:string;doc:EditorDocument}){
  const v2=migrateDocumentV1ToV2(input.doc);
  const variables=(v2.automationVariables??[]).map((v)=>`${v.name} (${v.type}${v.required?", required":""})${v.description?`: ${v.description}`:""}`).join("\n");
  return `You create production-ready datasets for automated short-form videos.
Create exactly ${input.count} unique rows for template "${input.templateName}".
User request: ${input.prompt}
Target market: ${input.market||"not specified"}
Audience: ${input.audience||"not specified"}

Template variables:
${variables||extractVariables(v2).join(", ")||"No custom variables"}

Rules:
- Make every row materially different; avoid duplicate concepts and duplicate titles.
- Keep titles concise and compelling without deceptive claims.
- Descriptions, tags, hashtags, hooks, CTAs and captions must match each row.
- For quiz content, provide one unambiguous question and answer when relevant.
- For letter/word-match templates, generate age-appropriate words matching the user's audience and fill template variables consistently.
- scene_data must be valid compact JSON encoded as a string when scene ideas are useful, otherwise use "{}".
- tags and hashtags are comma-separated strings.
- privacy defaults to "private".
- video_file_name must be unique, lowercase, URL/file-safe and end in .mp4.
- Do not include copyrighted lyrics or long copyrighted passages.
Return only data matching the supplied JSON schema.`;
}

function extractJson(text:string):unknown{
  const clean=text.trim().replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
  return JSON.parse(clean);
}

export async function generateAiDataset(creds:AiCredentials,input:{prompt:string;count:number;market?:string;audience?:string;templateName:string;doc:EditorDocument}){
  const schema=buildCampaignDatasetSchema(input.doc,input.count);
  const prompt=buildGenerationPrompt(input);
  const headers:Record<string,string>={
    Authorization:`Bearer ${creds.key}`,"Content-Type":"application/json",
  };
  if(creds.provider==="openrouter"){
    headers["HTTP-Referer"]=process.env.PUBLIC_APP_URL||"https://shortsforge.app";
    headers["X-Title"]="ShortsForge";
  }
  const body={
    model:creds.model,
    messages:[
      {role:"system",content:"You are ShortsForge's structured campaign dataset generator. Follow the JSON schema exactly."},
      {role:"user",content:prompt},
    ],
    temperature:0.8,
    response_format:{type:"json_schema",json_schema:schema},
  };
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90_000);
  let response:Response;
  try{
    response=await fetch(`${creds.baseUrl.replace(/\/+$/,"")}/chat/completions`,{method:"POST",headers,body:JSON.stringify(body),signal:controller.signal});
  }finally{clearTimeout(timer);}
  const raw=await response.text();
  if(!response.ok)throw new Error(`AI provider ${response.status}: ${raw.slice(0,400)}`);
  const parsed=JSON.parse(raw) as any;
  const content=parsed?.choices?.[0]?.message?.content;
  if(typeof content!=="string")throw new Error("AI provider returned no structured content");
  const data=extractJson(content) as any;
  if(!data||!Array.isArray(data.rows))throw new Error("AI response did not contain rows");
  if(data.rows.length!==input.count)throw new Error(`AI returned ${data.rows.length} rows; expected ${input.count}`);
  return {campaignName:String(data.campaign_name||"AI Campaign"),rows:data.rows as Record<string,unknown>[],usage:parsed.usage??{}};
}

export async function verifyAiKey(input:{provider:AiProviderName;apiKey:string;model:string}):Promise<{ok:boolean;error?:string}>{
  const base=providerBase(input.provider);
  try{
    const res=await fetch(`${base}/models`,{headers:{Authorization:`Bearer ${input.apiKey}`},signal:AbortSignal.timeout(15_000)});
    if(!res.ok)return {ok:false,error:`Provider rejected the key (${res.status})`};
    return {ok:true};
  }catch(e){return {ok:false,error:e instanceof Error?e.message:"Could not contact provider"};}
}
