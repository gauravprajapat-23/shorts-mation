import { createHmac, timingSafeEqual } from "node:crypto";

export type FfmpegWorkerConfig = { url: string; secret: string };
export type FfmpegWorkerStatus = { id: string; status: "queued"|"rendering"|"completed"|"failed"|"cancelled"; progress: number; outputUrl?: string|null; error?: string|null };

function normalizeUrl(raw:string){
  const url=new URL(raw);
  if(!["http:","https:"].includes(url.protocol)) throw new Error("FFmpeg worker URL must use HTTP or HTTPS");
  if(process.env.NODE_ENV==="production" && url.protocol!=="https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new Error("Production FFmpeg worker URL must use HTTPS");
  return url.toString().replace(/\/+$/,'');
}

export function workerRequestSignature(secret:string,timestamp:string,body:string){
  return createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex");
}

async function signedFetch(config:FfmpegWorkerConfig,path:string,init:RequestInit={}){
  const body=typeof init.body==="string"?init.body:"";
  const timestamp=String(Date.now());
  const headers=new Headers(init.headers);
  headers.set("x-worker-timestamp",timestamp);
  headers.set("x-worker-signature",workerRequestSignature(config.secret,timestamp,body));
  if(body) headers.set("content-type","application/json");
  return fetch(`${normalizeUrl(config.url)}${path}`,{...init,headers,signal:init.signal??AbortSignal.timeout(15_000)});
}

export async function verifyFfmpegWorker(config:FfmpegWorkerConfig){
  try{
    const res=await signedFetch(config,"/health");
    if(!res.ok) return {ok:false as const,error:`Worker health check returned ${res.status}`};
    const data=await res.json() as {ok?:boolean;ffmpeg?:boolean};
    return data.ok&&data.ffmpeg?{ok:true as const}:{ok:false as const,error:"Worker is reachable but FFmpeg is unavailable"};
  }catch(e){return {ok:false as const,error:e instanceof Error?e.message:"Could not reach FFmpeg worker"};}
}

export async function submitFfmpegWorkerJob(config:FfmpegWorkerConfig,input:{idempotencyKey:string;attemptId:string;manifestUrl:string;callbackUrl:string}){
  const body=JSON.stringify(input);
  const res=await signedFetch(config,"/jobs",{method:"POST",body});
  const text=await res.text();
  if(!res.ok) throw new Error(`FFmpeg worker submit ${res.status}: ${text.slice(0,500)}`);
  const data=JSON.parse(text) as {id?:string};
  if(!data.id) throw new Error("FFmpeg worker did not return a job id");
  return data.id;
}

export async function getFfmpegWorkerJob(config:FfmpegWorkerConfig,id:string):Promise<FfmpegWorkerStatus>{
  const res=await signedFetch(config,`/jobs/${encodeURIComponent(id)}`);
  const text=await res.text();
  if(!res.ok) throw new Error(`FFmpeg worker status ${res.status}: ${text.slice(0,500)}`);
  return JSON.parse(text) as FfmpegWorkerStatus;
}

export async function cancelFfmpegWorkerJob(config:FfmpegWorkerConfig,id:string){
  const res=await signedFetch(config,`/jobs/${encodeURIComponent(id)}`,{method:"DELETE"});
  if(!res.ok && res.status!==409) throw new Error(`FFmpeg worker cancel ${res.status}`);
  return res.ok;
}

export function safeTokenEqual(expected:string,actual:string){
  const a=Buffer.from(expected);const b=Buffer.from(actual);
  return a.length===b.length&&timingSafeEqual(a,b);
}
