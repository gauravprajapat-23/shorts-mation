import { createHash } from "node:crypto";
import { assetUri } from "@/lib/asset-refs";

export type TtsProviderName="openai"|"elevenlabs";
export type TtsCredentials={provider:TtsProviderName;key:string;model:string;defaultVoice?:string|null};

export function ttsProviderDefaults(provider:TtsProviderName){
  return provider==="openai"
    ? {model:"gpt-4o-mini-tts",voice:"alloy"}
    : {model:"eleven_multilingual_v2",voice:""};
}

export async function getTtsCredentials(userId:string,provider:TtsProviderName):Promise<TtsCredentials|null>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {decryptToken}=await import("@/lib/token-crypto.server");
  const {data}=await (supabaseAdmin as any).from("tts_providers").select("provider,api_key_encrypted,model,default_voice").eq("user_id",userId).eq("provider",provider).maybeSingle();
  if(data?.api_key_encrypted){
    const key=await decryptToken(data.api_key_encrypted);
    if(key)return {provider,key,model:data.model,defaultVoice:data.default_voice};
  }
  if(provider==="openai"&&process.env.OPENAI_API_KEY)return {provider,key:process.env.OPENAI_API_KEY,model:process.env.OPENAI_TTS_MODEL||"gpt-4o-mini-tts",defaultVoice:process.env.OPENAI_TTS_VOICE||"alloy"};
  if(provider==="elevenlabs"&&process.env.ELEVENLABS_API_KEY)return {provider,key:process.env.ELEVENLABS_API_KEY,model:process.env.ELEVENLABS_MODEL||"eleven_multilingual_v2",defaultVoice:process.env.ELEVENLABS_VOICE_ID||""};
  return null;
}

export function applyPronunciation(text:string,rules:Array<{find:string;sayAs:string}>):string{
  let out=text;
  for(const rule of rules){
    const find=rule.find.trim(),sayAs=rule.sayAs.trim();
    if(!find||!sayAs)continue;
    out=out.split(find).join(sayAs);
  }
  return out;
}

export async function verifyTtsKey(provider:TtsProviderName,key:string):Promise<{ok:boolean;error?:string}>{
  try{
    const url=provider==="openai"?"https://api.openai.com/v1/models":"https://api.elevenlabs.io/v1/user";
    const headers=provider==="openai"?{Authorization:`Bearer ${key}`}:{ "xi-api-key":key };
    const res=await fetch(url,{headers,signal:AbortSignal.timeout(15_000)});
    if(!res.ok)return {ok:false,error:`Provider rejected the key (${res.status})`};
    return {ok:true};
  }catch(e){return {ok:false,error:e instanceof Error?e.message:"Could not contact TTS provider"};}
}

export async function synthesizeSpeech(creds:TtsCredentials,input:{
  text:string;voice:string;speed:number;instructions?:string;
}):Promise<{bytes:Uint8Array;mimeType:string;extension:string}>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90_000);
  try{
    if(creds.provider==="openai"){
      const res=await fetch("https://api.openai.com/v1/audio/speech",{
        method:"POST",signal:controller.signal,
        headers:{Authorization:`Bearer ${creds.key}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          model:creds.model,input:input.text,voice:input.voice||creds.defaultVoice||"alloy",
          response_format:"mp3",speed:Math.max(.5,Math.min(2,input.speed)),
          ...(input.instructions?.trim()?{instructions:input.instructions.trim().slice(0,1000)}:{}),
        }),
      });
      if(!res.ok)throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0,400)}`);
      return {bytes:new Uint8Array(await res.arrayBuffer()),mimeType:"audio/mpeg",extension:"mp3"};
    }
    if(!input.voice)throw new Error("ElevenLabs requires a voice ID");
    const res=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voice)}`,{
      method:"POST",signal:controller.signal,
      headers:{"xi-api-key":creds.key,"Content-Type":"application/json","Accept":"audio/mpeg"},
      body:JSON.stringify({
        text:input.text,model_id:creds.model,
        voice_settings:{stability:.55,similarity_boost:.75,style:0,use_speaker_boost:true},
      }),
    });
    if(!res.ok)throw new Error(`ElevenLabs TTS ${res.status}: ${(await res.text()).slice(0,400)}`);
    return {bytes:new Uint8Array(await res.arrayBuffer()),mimeType:"audio/mpeg",extension:"mp3"};
  }finally{clearTimeout(timer);}
}

export async function storeGeneratedSpeech(userId:string,input:{
  bytes:Uint8Array;mimeType:string;extension:string;name:string;
}):Promise<{assetId:string;storagePath:string;signedUrl:string;size:number}>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  if(!input.bytes.byteLength)throw new Error("TTS provider returned empty audio");
  if(input.bytes.byteLength>25*1024*1024)throw new Error("Generated narration exceeded the 25 MB safety limit");
  const {data:usage,error:usageError}=await (supabaseAdmin as any).rpc("asset_storage_usage",{p_user_id:userId});
  if(usageError)throw new Error(usageError.message);
  const row=Array.isArray(usage)?usage[0]:usage;
  const used=Number(row?.used_bytes??0),quota=Number(row?.quota_bytes??5*1024**3);
  if(used+input.bytes.byteLength>quota)throw new Error("Storage quota would be exceeded by this narration");

  const hash=createHash("sha256").update(input.bytes).digest("hex");
  const existing=await (supabaseAdmin as any).from("assets").select("id,storage_path,size").eq("user_id",userId).eq("content_hash",hash).eq("lifecycle_status","active").maybeSingle();
  if(existing.data?.id&&existing.data.storage_path){
    const signed=await supabaseAdmin.storage.from("assets").createSignedUrl(existing.data.storage_path,6*60*60);
    if(signed.error||!signed.data?.signedUrl)throw signed.error??new Error("Could not sign generated audio");
    return {assetId:existing.data.id,storagePath:existing.data.storage_path,signedUrl:signed.data.signedUrl,size:Number(existing.data.size??input.bytes.byteLength)};
  }

  const id=crypto.randomUUID();
  const path=`${userId}/${hash}.${input.extension}`;
  const upload=await supabaseAdmin.storage.from("assets").upload(path,input.bytes,{contentType:input.mimeType,upsert:false});
  if(upload.error)throw new Error(upload.error.message);
  const insert=await (supabaseAdmin as any).from("assets").insert({
    id,user_id:userId,type:"audio",file_name:input.name,file_url:assetUri(id),storage_path:path,
    size:input.bytes.byteLength,mime_type:input.mimeType,content_hash:hash,lifecycle_status:"active",
  });
  if(insert.error){
    await supabaseAdmin.storage.from("assets").remove([path]);
    throw new Error(insert.error.message);
  }
  const signed=await supabaseAdmin.storage.from("assets").createSignedUrl(path,6*60*60);
  if(signed.error||!signed.data?.signedUrl)throw signed.error??new Error("Could not sign generated audio");
  return {assetId:id,storagePath:path,signedUrl:signed.data.signedUrl,size:input.bytes.byteLength};
}
