import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EditorDocument } from "@/lib/types";

export const getAiSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {decryptToken}=await import("@/lib/token-crypto.server");
  const {data}=await (supabaseAdmin as any).from("ai_providers").select("provider,api_key_encrypted,model,verified_at,last_error").eq("user_id",context.userId).maybeSingle();
  const own=data?.api_key_encrypted?await decryptToken(data.api_key_encrypted):null;
  const envProvider=process.env.OPENAI_API_KEY?"openai":process.env.OPENROUTER_API_KEY?"openrouter":null;
  return {
    configured:Boolean(own||envProvider),source:own?"user":envProvider?"project":"none",
    provider:own?data.provider:envProvider,model:own?data.model:(envProvider==="openai"?process.env.OPENAI_MODEL||"gpt-5-mini":envProvider==="openrouter"?process.env.OPENROUTER_MODEL||"openai/gpt-4o-mini":null),
    verifiedAt:data?.verified_at??null,lastError:data?.last_error??null,
    keyHint:own?`${own.slice(0,4)}••••${own.slice(-4)}`:null,
  };
});

export const saveAiSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{provider:"openai"|"openrouter";apiKey:string;model:string})=>d)
.handler(async({data,context})=>{
  const apiKey=data.apiKey.trim(),model=data.model.trim();
  if(apiKey.length<12||apiKey.length>512||/\s/.test(apiKey))return {ok:false,error:"That does not look like a valid API key."};
  if(!model||model.length>160)return {ok:false,error:"Choose a valid model."};
  const {verifyAiKey,providerBase}=await import("@/lib/ai-content.server");
  const check=await verifyAiKey({provider:data.provider,apiKey,model});
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  if(!check.ok){
    await (supabaseAdmin as any).from("ai_providers").upsert({user_id:context.userId,provider:data.provider,model,base_url:providerBase(data.provider),last_error:check.error},{onConflict:"user_id"});
    return check;
  }
  const {encryptToken}=await import("@/lib/token-crypto.server");
  const {error}=await (supabaseAdmin as any).from("ai_providers").upsert({
    user_id:context.userId,provider:data.provider,model,base_url:providerBase(data.provider),
    api_key_encrypted:await encryptToken(apiKey),verified_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString(),
  },{onConflict:"user_id"});
  return error?{ok:false,error:error.message}:{ok:true};
});

export const clearAiSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any).from("ai_providers").delete().eq("user_id",context.userId);
  return {ok:true};
});

export const generateCampaignDataset=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{templateId:string;prompt:string;count:number;market?:string;audience?:string})=>d)
.handler(async({data,context})=>{
  const count=Math.floor(Number(data.count));
  if(!Number.isFinite(count)||count<1||count>100)throw new Error("Generate between 1 and 100 videos");
  const prompt=data.prompt.trim();
  if(prompt.length<8||prompt.length>4000)throw new Error("Describe the campaign in 8–4000 characters");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data:template,error}=await (supabaseAdmin as any).from("templates").select("id,name,template_json,user_id,is_default,visibility").eq("id",data.templateId).maybeSingle();
  if(error||!template)throw new Error("Template not found");
  if(!(template.is_default||template.visibility==="public"||template.user_id===context.userId))throw new Error("Template is not accessible");
  const {getAiCredentials,generateAiDataset}=await import("@/lib/ai-content.server");
  const creds=await getAiCredentials(context.userId);
  if(!creds)throw new Error("Configure OpenAI or OpenRouter in Settings first");
  const {data:run,error:runError}=await (supabaseAdmin as any).from("ai_generation_runs").insert({
    user_id:context.userId,template_id:template.id,provider:creds.provider,model:creds.model,prompt,requested_count:count,status:"running",
  }).select("id").single();
  if(runError)throw new Error(runError.message);
  try{
    const result=await generateAiDataset(creds,{prompt,count,market:data.market?.slice(0,120),audience:data.audience?.slice(0,240),templateName:template.name,doc:template.template_json as EditorDocument});
    await (supabaseAdmin as any).from("ai_generation_runs").update({status:"completed",generated_count:result.rows.length,usage_json:result.usage,completed_at:new Date().toISOString()}).eq("id",run.id);
    return {...result,runId:run.id,provider:creds.provider,model:creds.model};
  }catch(e){
    await (supabaseAdmin as any).from("ai_generation_runs").update({status:"failed",error_message:e instanceof Error?e.message:"Generation failed",completed_at:new Date().toISOString()}).eq("id",run.id);
    throw e;
  }
});
