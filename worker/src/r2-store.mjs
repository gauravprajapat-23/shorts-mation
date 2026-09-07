import { createHash, createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256=v=>createHash('sha256').update(v).digest('hex');
const hmac=(key,value,encoding)=>createHmac('sha256',key).update(value).digest(encoding);
const amzDate=(d=new Date())=>d.toISOString().replace(/[:-]|\.\d{3}/g,'');
const dateStamp=s=>s.slice(0,8);
const xmlValue=(xml,tag)=>{const m=xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));return m?.[1]??null;};
const decodeXml=s=>String(s).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");

export function r2ConfigFromEnv(env=process.env){
  const accountId=env.R2_ACCOUNT_ID||'';
  const endpoint=(env.R2_ENDPOINT||(accountId?`https://${accountId}.r2.cloudflarestorage.com`:'' )).replace(/\/+$/,'');
  return {
    endpoint,
    bucket:env.R2_BUCKET||env.R2_BUCKET_NAME||'',
    accessKeyId:env.R2_ACCESS_KEY_ID||'',
    secretAccessKey:env.R2_SECRET_ACCESS_KEY||'',
    region:env.R2_REGION||'auto',
    prefix:(env.R2_RENDER_PREFIX||'shorts-mation/render-v1').replace(/^\/+|\/+$/g,''),
  };
}

export class R2ObjectStore {
  constructor(config={}){Object.assign(this,config);this.multipartThreshold=Math.max(5*1024*1024,Number(config.multipartThreshold||64*1024*1024));this.partSize=Math.max(5*1024*1024,Number(config.partSize||16*1024*1024));}
  assertConfigured(){for(const [k,v] of Object.entries({endpoint:this.endpoint,bucket:this.bucket,accessKeyId:this.accessKeyId,secretAccessKey:this.secretAccessKey}))if(!v)throw new Error(`R2 configuration missing ${k}`);}
  key(key){return [this.prefix,String(key).replace(/^\/+/, '')].filter(Boolean).join('/');}
  objectUrl(key,{applyPrefix=true}={}){const raw=applyPrefix?this.key(key):String(key||'').replace(/^\/+/, '');const full=raw?raw.split('/').map(enc).join('/'):'';return `${this.endpoint}/${enc(this.bucket)}/${full}`;}
  async signedRequest(method,key,{query={},headers={},body=null,payloadHash=null,timeoutMs=120000,applyPrefix=true}={}){
    this.assertConfigured();
    const now=amzDate(),stamp=dateStamp(now);const url=new URL(this.objectUrl(key,{applyPrefix}));
    const queryEntries=Object.entries(query).flatMap(([k,v])=>Array.isArray(v)?v.map(x=>[k,x]):[[k,v]]).filter(([,v])=>v!==undefined&&v!==null).sort(([a,av],[b,bv])=>a.localeCompare(b)||String(av).localeCompare(String(bv)));
    const hash=payloadHash??sha256(body??'');
    const host=url.host;const signedHeaders={host,'x-amz-content-sha256':hash,'x-amz-date':now,...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).trim()]))};
    const signedNames=Object.keys(signedHeaders).sort();const canonicalHeaders=signedNames.map(k=>`${k}:${signedHeaders[k]}\n`).join('');
    const canonicalQuery=queryEntries.map(([k,v])=>`${enc(k)}=${enc(String(v))}`).join('&');url.search=canonicalQuery?`?${canonicalQuery}`:'';
    const canonicalRequest=[method,url.pathname,canonicalQuery,canonicalHeaders,signedNames.join(';'),hash].join('\n');
    const scope=`${stamp}/${this.region}/s3/aws4_request`;const stringToSign=['AWS4-HMAC-SHA256',now,scope,sha256(canonicalRequest)].join('\n');
    const kDate=hmac(`AWS4${this.secretAccessKey}`,stamp),kRegion=hmac(kDate,this.region),kService=hmac(kRegion,'s3'),kSigning=hmac(kService,'aws4_request');const signature=hmac(kSigning,stringToSign,'hex');
    const authorization=`AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedNames.join(';')}, Signature=${signature}`;
    const fetchHeaders={...headers,'x-amz-content-sha256':hash,'x-amz-date':now,authorization};
    const opts={method,headers:fetchHeaders,body,signal:AbortSignal.timeout(timeoutMs)};if(body&&typeof body.pipe==='function')opts.duplex='half';
    return fetch(url,opts);
  }
  async head(key){const r=await this.signedRequest('HEAD',key);if(r.status===404)return null;if(!r.ok)throw new Error(`R2 HEAD ${r.status} ${key}`);return {bytes:Number(r.headers.get('content-length')||0),etag:r.headers.get('etag')?.replaceAll('"','')||null,contentType:r.headers.get('content-type')||null};}
  async putBuffer(key,buffer,{contentType='application/octet-stream',metadata={}}={}){const b=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);const headers={'content-type':contentType,...Object.fromEntries(Object.entries(metadata).map(([k,v])=>[`x-amz-meta-${k}`,String(v)]))};const r=await this.signedRequest('PUT',key,{headers,body:b});if(!r.ok)throw new Error(`R2 PUT ${r.status} ${key}: ${(await r.text()).slice(0,500)}`);return {key,bytes:b.length,etag:r.headers.get('etag')?.replaceAll('"','')||null};}
  async putJson(key,value){return this.putBuffer(key,Buffer.from(JSON.stringify(value,null,2)),{contentType:'application/json'});}
  async getBuffer(key){const r=await this.signedRequest('GET',key);if(r.status===404)return null;if(!r.ok)throw new Error(`R2 GET ${r.status} ${key}`);return Buffer.from(await r.arrayBuffer());}
  async getJson(key){const b=await this.getBuffer(key);return b?JSON.parse(b.toString('utf8')):null;}
  async downloadFile(key,path){const r=await this.signedRequest('GET',key,{timeoutMs:300000});if(r.status===404)return false;if(!r.ok)throw new Error(`R2 GET ${r.status} ${key}`);await mkdir(dirname(path),{recursive:true});if(!r.body)throw new Error(`R2 GET ${key} had no body`);await pipeline(Readable.fromWeb(r.body),createWriteStream(path));return true;}
  async putFile(key,path,{contentType='application/octet-stream',multipartThreshold=this.multipartThreshold,partSize=this.partSize}={}){const s=await stat(path);if(s.size>=multipartThreshold)return this.multipartUploadFile(key,path,{contentType,partSize});const b=await readFile(path);return this.putBuffer(key,b,{contentType});}
  async createMultipart(key,{contentType='application/octet-stream'}={}){const r=await this.signedRequest('POST',key,{query:{uploads:''},headers:{'content-type':contentType}});const text=await r.text();if(!r.ok)throw new Error(`R2 multipart create ${r.status}: ${text.slice(0,500)}`);const uploadId=xmlValue(text,'UploadId');if(!uploadId)throw new Error('R2 multipart response missing UploadId');return uploadId;}
  async uploadPart(key,uploadId,partNumber,buffer){const b=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);const r=await this.signedRequest('PUT',key,{query:{partNumber,uploadId},body:b,timeoutMs:300000});if(!r.ok)throw new Error(`R2 multipart part ${partNumber} ${r.status}: ${(await r.text()).slice(0,500)}`);const etag=r.headers.get('etag');if(!etag)throw new Error(`R2 multipart part ${partNumber} missing ETag`);return etag;}
  async completeMultipart(key,uploadId,parts){const xml=`<CompleteMultipartUpload>${parts.map(p=>`<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;const r=await this.signedRequest('POST',key,{query:{uploadId},headers:{'content-type':'application/xml'},body:Buffer.from(xml),timeoutMs:300000});const text=await r.text();if(!r.ok)throw new Error(`R2 multipart complete ${r.status}: ${text.slice(0,500)}`);return {key,etag:xmlValue(text,'ETag')?.replaceAll('"','')||null};}
  async abortMultipart(key,uploadId){const r=await this.signedRequest('DELETE',key,{query:{uploadId}});if(!r.ok&&r.status!==404)throw new Error(`R2 multipart abort ${r.status}`);}
  async multipartUploadFile(key,path,{contentType='application/octet-stream',partSize=this.partSize}={}){const uploadId=await this.createMultipart(key,{contentType});const parts=[];const f=await open(path,'r');try{const s=await f.stat();let offset=0,partNumber=1;while(offset<s.size){const len=Math.min(partSize,s.size-offset),b=Buffer.allocUnsafe(len);const {bytesRead}=await f.read(b,0,len,offset);const etag=await this.uploadPart(key,uploadId,partNumber,b.subarray(0,bytesRead));parts.push({partNumber,etag});offset+=bytesRead;partNumber++;}const done=await this.completeMultipart(key,uploadId,parts);return {...done,bytes:s.size,parts:parts.length,multipart:true};}catch(e){await this.abortMultipart(key,uploadId).catch(()=>{});throw e;}finally{await f.close();}}
  async list(prefix=''){const fullPrefix=this.key(prefix);const objects=[];let token=null;do{const query={'list-type':'2',prefix:fullPrefix,'max-keys':'1000'};if(token)query['continuation-token']=token;const r=await this.signedRequest('GET','',{query,applyPrefix:false});const text=await r.text();if(!r.ok)throw new Error(`R2 LIST ${r.status}: ${text.slice(0,500)}`);for(const m of text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){const key=xmlValue(m[1],'Key'),size=Number(xmlValue(m[1],'Size')||0),etag=xmlValue(m[1],'ETag')?.replaceAll('\"','')||null;if(key)objects.push({key:decodeXml(key).replace(new RegExp(`^${this.prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\/?`),''),size,etag});}token=xmlValue(text,'NextContinuationToken');}while(token);return objects;}
  async delete(key){const r=await this.signedRequest('DELETE',key);if(!r.ok&&r.status!==404)throw new Error(`R2 DELETE ${r.status} ${key}`);}
  async presignGet(key,{expiresSeconds=3600}={}){
    this.assertConfigured();const now=amzDate(),stamp=dateStamp(now),scope=`${stamp}/${this.region}/s3/aws4_request`;const url=new URL(this.objectUrl(key));const params={
      'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':`${this.accessKeyId}/${scope}`,'X-Amz-Date':now,'X-Amz-Expires':String(Math.min(604800,Math.max(1,expiresSeconds))),'X-Amz-SignedHeaders':'host'
    };const entries=Object.entries(params).sort(([a],[b])=>a.localeCompare(b));const cq=entries.map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');const canonical=['GET',url.pathname,cq,`host:${url.host}\n`,'host','UNSIGNED-PAYLOAD'].join('\n');const sts=['AWS4-HMAC-SHA256',now,scope,sha256(canonical)].join('\n');const kDate=hmac(`AWS4${this.secretAccessKey}`,stamp),kRegion=hmac(kDate,this.region),kService=hmac(kRegion,'s3'),kSigning=hmac(kService,'aws4_request');const sig=hmac(kSigning,sts,'hex');for(const [k,v] of entries)url.searchParams.set(k,v);url.searchParams.set('X-Amz-Signature',sig);return url.toString();
  }
}
