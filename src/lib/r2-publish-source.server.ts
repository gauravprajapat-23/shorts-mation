import { createHash, createHmac } from "node:crypto";

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const hmac = (key: string | Buffer, value: string, encoding?: "hex") => createHmac("sha256", key).update(value).digest(encoding as any);
const amzDate = (d = new Date()) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");

export type R2PublishConfig = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; region: string; prefix: string };
export function r2PublishConfig(env = process.env): R2PublishConfig {
  const accountId = env.R2_ACCOUNT_ID ?? "";
  return {
    endpoint: (env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).replace(/\/+$/, ""),
    bucket: env.R2_BUCKET || env.R2_BUCKET_NAME || "",
    accessKeyId: env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: env.R2_SECRET_ACCESS_KEY || "",
    region: env.R2_REGION || "auto",
    prefix: (env.R2_RENDER_PREFIX || "shorts-mation/render-v1").replace(/^\/+|\/+$/g, ""),
  };
}

function assertConfig(c: R2PublishConfig) { for (const [k,v] of Object.entries(c)) if (k !== "prefix" && !v) throw new Error(`R2 publishing configuration missing ${k}`); }
function objectUrl(c: R2PublishConfig, key: string) {
  const raw = [c.prefix, key.replace(/^\/+/, "")].filter(Boolean).join("/");
  return `${c.endpoint}/${enc(c.bucket)}/${raw.split("/").map(enc).join("/")}`;
}

export async function presignR2Get(key: string, expiresSeconds = 900, env = process.env, downloadFilename?: string): Promise<string> {
  const c = r2PublishConfig(env); assertConfig(c);
  const now = amzDate(), stamp = now.slice(0,8), scope = `${stamp}/${c.region}/s3/aws4_request`;
  const url = new URL(objectUrl(c,key));
  const params: Record<string,string> = {
    "X-Amz-Algorithm":"AWS4-HMAC-SHA256", "X-Amz-Credential":`${c.accessKeyId}/${scope}`,
    "X-Amz-Date":now, "X-Amz-Expires":String(Math.min(604800,Math.max(1,expiresSeconds))), "X-Amz-SignedHeaders":"host",
  };
  if (downloadFilename) params["response-content-disposition"] = `attachment; filename="${downloadFilename.replace(/[\"\r\n]/g, "_")}"`;
  if (downloadFilename) params["response-content-type"] = "video/mp4";
  const entries = Object.entries(params).sort(([a],[b])=>a.localeCompare(b));
  const cq = entries.map(([k,v])=>`${enc(k)}=${enc(v)}`).join("&");
  const canonical = ["GET",url.pathname,cq,`host:${url.host}\n`,"host","UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256",now,scope,sha256(canonical)].join("\n");
  const kDate=hmac(`AWS4${c.secretAccessKey}`,stamp), kRegion=hmac(kDate,c.region), kService=hmac(kRegion,"s3"), kSigning=hmac(kService,"aws4_request");
  const sig=hmac(kSigning,sts,"hex") as string;
  for (const [k,v] of entries) url.searchParams.set(k,v); url.searchParams.set("X-Amz-Signature",sig); return url.toString();
}

export async function headR2Object(key: string): Promise<{ bytes:number; contentType:string }> {
  // Use a one-byte ranged GET so the presigned canonical method remains GET.
  const url=await presignR2Get(key,300); const res=await fetch(url,{headers:{Range:"bytes=0-0"},signal:AbortSignal.timeout(15_000)});
  if(!(res.status===206||res.status===200)) throw new Error(`R2 output probe failed: ${res.status}`);
  const range=res.headers.get("content-range");
  const total=range?.match(/\/(\d+)$/)?.[1];
  const bytes=total?Number(total):Number(res.headers.get("content-length")||0); if(!bytes) throw new Error("R2 output is empty");
  await res.body?.cancel().catch(()=>undefined);
  return {bytes,contentType:res.headers.get("content-type")||"video/mp4"};
}

export async function readR2Range(key:string,start:number,endInclusive:number):Promise<Uint8Array>{
  const url=await presignR2Get(key,900); const res=await fetch(url,{headers:{Range:`bytes=${start}-${endInclusive}`},signal:AbortSignal.timeout(120_000)});
  if(!(res.status===206||res.status===200)) throw new Error(`R2 range read failed: ${res.status}`);
  const bytes=new Uint8Array(await res.arrayBuffer()); const expected=endInclusive-start+1;
  if(res.status===206 && bytes.byteLength!==expected) throw new Error(`R2 range length mismatch: expected ${expected}, got ${bytes.byteLength}`);
  if(res.status===200 && start!==0) throw new Error("R2 ignored a non-zero Range request");
  return bytes.byteLength>expected?bytes.slice(0,expected):bytes;
}

async function signedR2ControlRequest(method:string,key:string,query:Record<string,string>={}) {
  const c=r2PublishConfig(); assertConfig(c); const now=amzDate(),stamp=now.slice(0,8),scope=`${stamp}/${c.region}/s3/aws4_request`;
  const rawKey=key ? [c.prefix,key.replace(/^\/+/,"")].filter(Boolean).join("/") : "";
  const path=`/${enc(c.bucket)}${rawKey?`/${rawKey.split("/").map(enc).join("/")}`:""}`;
  const url=new URL(`${c.endpoint}${path}`); const entries=Object.entries(query).sort(([a,av],[b,bv])=>a.localeCompare(b)||av.localeCompare(bv));
  const cq=entries.map(([k,v])=>`${enc(k)}=${enc(v)}`).join("&"); const payloadHash=sha256("");
  const canonical=[method,url.pathname,cq,`host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${now}\n`,`host;x-amz-content-sha256;x-amz-date`,payloadHash].join("\n");
  const sts=["AWS4-HMAC-SHA256",now,scope,sha256(canonical)].join("\n");
  const kDate=hmac(`AWS4${c.secretAccessKey}`,stamp),kRegion=hmac(kDate,c.region),kService=hmac(kRegion,"s3"),kSigning=hmac(kService,"aws4_request");
  const sig=hmac(kSigning,sts,"hex") as string; for(const [k,v] of entries)url.searchParams.set(k,v);
  return fetch(url,{method,headers:{"x-amz-content-sha256":payloadHash,"x-amz-date":now,"authorization":`AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`},signal:AbortSignal.timeout(60_000)});
}

export async function listR2Prefix(prefix:string):Promise<Array<{key:string;size:number}>> {
  const c=r2PublishConfig(); const full=[c.prefix,prefix.replace(/^\/+/,"")].filter(Boolean).join("/"); const out:Array<{key:string;size:number}>=[]; let token="";
  do { const q:Record<string,string>={"list-type":"2",prefix:full,"max-keys":"1000"}; if(token)q["continuation-token"]=token; const res=await signedR2ControlRequest("GET","",q); const text=await res.text(); if(!res.ok)throw new Error(`R2 list failed: ${res.status}`);
    for(const m of text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){const k=m[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1];const z=m[1].match(/<Size>(\d+)<\/Size>/)?.[1];if(k)out.push({key:k.replace(`${c.prefix}/`,""),size:Number(z||0)});} token=text.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]||"";
  } while(token); return out;
}

export async function deleteR2Object(key:string):Promise<void> { const res=await signedR2ControlRequest("DELETE",key); if(!res.ok&&res.status!==404)throw new Error(`R2 delete failed: ${res.status}`); }
