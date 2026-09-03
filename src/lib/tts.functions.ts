import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTtsSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {decryptToken}=await import("@/lib/token-crypto.server");
  const {data}=await (supabaseAdmin as any).from("tts_providers").select("provider,api_key_encrypted,model,default_voice,verified_at,last_error").eq("user_id",context.userId);
  const rows=[] as any[];
  for(const row of data??[]){
    const key=row.api_key_encrypted?await decryptToken(row.api_key_encrypted):null;
    rows.push({provider:row.provider,configured:Boolean(key),model:row.model,defaultVoice:row.default_voice,keyHint:key?`${key.slice(0,4)}••••${key.slice(-4)}`:null,verifiedAt:row.verified_at,lastError:row.last_error});
  }
  if(!rows.some(r=>r.provider==="openai")&&process.env.OPENAI_API_KEY)rows.push({provider:"openai",configured:true,model:process.env.OPENAI_TTS_MODEL||"gpt-4o-mini-tts",defaultVoice:process.env.OPENAI_TTS_VOICE||"alloy",source:"project"});
  if(!rows.some(r=>r.provider==="elevenlabs")&&process.env.ELEVENLABS_API_KEY)rows.push({provider:"elevenlabs",configured:true,model:process.env.ELEVENLABS_MODEL||"eleven_multilingual_v2",defaultVoice:process.env.ELEVENLABS_VOICE_ID||"",source:"project"});
  return rows;
});

export const saveTtsSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{provider:"openai"|"elevenlabs";apiKey:string;model:string;defaultVoice?:string})=>d)
.handler(async({data,context})=>{
  const key=data.apiKey.trim(),model=data.model.trim(),voice=data.defaultVoice?.trim()||null;
  if(key.length<12||key.length>512||/\s/.test(key))return {ok:false,error:"That does not look like a valid API key."};
  if(!model||model.length>160)return {ok:false,error:"Choose a valid model."};
  const {verifyTtsKey}=await import("@/lib/tts.server");
  const check=await verifyTtsKey(data.provider,key);
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  if(!check.ok){
    await (supabaseAdmin as any).from("tts_providers").upsert({user_id:context.userId,provider:data.provider,model,default_voice:voice,last_error:check.error},{onConflict:"user_id,provider"});
    return check;
  }
  const {encryptToken}=await import("@/lib/token-crypto.server");
  const {error}=await (supabaseAdmin as any).from("tts_providers").upsert({
    user_id:context.userId,provider:data.provider,model,default_voice:voice,
    api_key_encrypted:await encryptToken(key),verified_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString(),
  },{onConflict:"user_id,provider"});
  return error?{ok:false,error:error.message}:{ok:true};
});

export const clearTtsSettings=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{provider:"openai"|"elevenlabs"})=>d)
.handler(async({data,context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any).from("tts_providers").delete().eq("user_id",context.userId).eq("provider",data.provider);
  return {ok:true};
});

export const generateSceneNarration=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{templateId:string;sceneId:string;text:string;provider:"openai"|"elevenlabs";voice:string;model?:string;speed?:number;instructions?:string;pronunciation?:Array<{find:string;sayAs:string}>;presetId?:string|null})=>d)
.handler(async({data,context})=>{
  const text=data.text.trim();
  if(text.length<1||text.length>5000)throw new Error("Narration must contain 1–5000 characters");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const tpl=await (supabaseAdmin as any).from("templates").select("id,user_id,is_default,visibility,template_json").eq("id",data.templateId).maybeSingle();
  if(tpl.error||!tpl.data)throw new Error("Template not found");
  if(!(tpl.data.user_id===context.userId||tpl.data.is_default||tpl.data.visibility==="public"))throw new Error("Template is not accessible");
  const scenes=Array.isArray(tpl.data.template_json?.scenes)?tpl.data.template_json.scenes:[];
  if(!scenes.some((s:any)=>s?.id===data.sceneId))throw new Error("Scene not found");

  const {getTtsCredentials,applyPronunciation,synthesizeSpeech,storeGeneratedSpeech}=await import("@/lib/tts.server");
  const base=await getTtsCredentials(context.userId,data.provider);
  if(!base)throw new Error(`Configure ${data.provider} TTS in Settings first`);
  const creds={...base,model:data.model?.trim()||base.model};
  const voice=data.voice.trim()||base.defaultVoice||"";
  const spoken=applyPronunciation(text,data.pronunciation??[]);
  const run=await (supabaseAdmin as any).from("tts_generation_runs").insert({
    user_id:context.userId,template_id:data.templateId,scene_id:data.sceneId,provider:data.provider,model:creds.model,voice_id:voice,characters:text.length,status:"running",
  }).select("id").single();
  if(run.error)throw new Error(run.error.message);
  try{
    const audio=await synthesizeSpeech(creds,{text:spoken,voice,speed:Math.max(.5,Math.min(2,data.speed??1)),instructions:data.instructions});
    const stored=await storeGeneratedSpeech(context.userId,{...audio,name:`narration-${data.sceneId}-${Date.now()}.mp3`});
    await (supabaseAdmin as any).from("tts_generation_runs").update({status:"completed",asset_id:stored.assetId,completed_at:new Date().toISOString()}).eq("id",run.data.id);
    return {...stored,provider:data.provider,model:creds.model,voice,presetId:data.presetId??null};
  }catch(e){
    await (supabaseAdmin as any).from("tts_generation_runs").update({status:"failed",error_message:e instanceof Error?e.message:"TTS failed",completed_at:new Date().toISOString()}).eq("id",run.data.id);
    throw e;
  }
});
