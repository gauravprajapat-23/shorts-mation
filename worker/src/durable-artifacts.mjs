import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import { discoverRenderUrls } from './asset-cache.mjs';
import { spawn } from 'node:child_process';

const fileExists=async p=>{try{const s=await stat(p);return s.isFile()&&s.size>0;}catch{return false;}};
const hashFile=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const run=(cmd,args,opts={})=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{...opts,stdio:['ignore','ignore','pipe']});let err='';p.stderr?.on('data',d=>err=(err+String(d)).slice(-5000));p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(new Error(`${cmd} exited ${c}: ${err}`)));});
const typeFor=p=>({'.json':'application/json','.png':'image/png','.mp4':'video/mp4','.tar':'application/x-tar','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg'})[extname(p).toLowerCase()]||'application/octet-stream';

export class DurableRenderArtifacts {
  constructor(store,{frameSegmentSize=50}={}){this.store=store;this.frameSegmentSize=Math.max(10,Number(frameSegmentSize||50));}
  jobKey(jobId,name){return `jobs/${jobId}/${name}`;}
  manifestKey(jobId){return this.jobKey(jobId,'manifest.json');}
  checkpointKey(jobId){return this.jobKey(jobId,'checkpoint.json');}
  outputKey(jobId){return this.jobKey(jobId,'output/output.mp4');}
  frameKey(jobId,start,end){return this.jobKey(jobId,`frames/${String(start).padStart(6,'0')}-${String(end).padStart(6,'0')}.tar`);}
  assetKey(sha,file=''){const suffix=extname(file).toLowerCase().slice(0,10);return `assets/sha256/${sha.slice(0,2)}/${sha}${suffix}`;}
  assetIndexKey(jobId){return this.jobKey(jobId,'assets/index.json');}
  urlIndexKey(url){return `assets/url-index/${createHash('sha256').update(url).digest('hex')}.json`;}
  async saveManifest(jobId,manifest){await this.store.putJson(this.manifestKey(jobId),manifest);}
  async loadManifest(jobId){return this.store.getJson(this.manifestKey(jobId));}
  async saveCheckpoint(jobId,checkpoint){await this.store.putJson(this.checkpointKey(jobId),checkpoint);}
  async loadCheckpoint(jobId){return this.store.getJson(this.checkpointKey(jobId));}
  async syncAssetCache(jobId,dir,index){const durable=structuredClone(index);for(const row of durable.assets){const p=join(dir,row.file);row.sha256=row.sha256||await hashFile(p);row.objectKey=this.assetKey(row.sha256,row.file);if(!(await this.store.head(row.objectKey)))await this.store.putFile(row.objectKey,p,{contentType:typeFor(p)});await this.store.putJson(this.urlIndexKey(row.url),{version:1,url:row.url,sha256:row.sha256,objectKey:row.objectKey,fileExt:extname(row.file),updatedAt:new Date().toISOString()});}durable.durableAt=new Date().toISOString();await this.store.putJson(this.assetIndexKey(jobId),durable);return durable;}
  async restoreReusableAssets(manifest,dir){await mkdir(dir,{recursive:true});let restored=0;for(const url of discoverRenderUrls(manifest)){const idx=await this.store.getJson(this.urlIndexKey(url));if(!idx?.objectKey)continue;let suffix='';try{suffix=extname(new URL(url).pathname).slice(0,10);}catch{}const local=join(dir,`${createHash('sha256').update(url).digest('hex')}${suffix}`);if(!(await fileExists(local))&&await this.store.downloadFile(idx.objectKey,local))restored++;}return restored;}
  async restoreAssetCache(jobId,dir){const index=await this.store.getJson(this.assetIndexKey(jobId));if(!index?.assets?.length)return null;await mkdir(dir,{recursive:true});for(const row of index.assets){const p=join(dir,row.file);if(!(await fileExists(p)))await this.store.downloadFile(row.objectKey||this.assetKey(row.sha256,row.file),p);}await writeFile(join(dir,'asset-index.json'),JSON.stringify(index,null,2));return index;}
  async uploadFrameSegment(jobId,frameDir,start,end){if(end<start)return null;const names=[];for(let i=start;i<=end;i++)names.push(`${String(i).padStart(6,'0')}.png`);const tar=join(frameDir,`.segment-${String(start).padStart(6,'0')}-${String(end).padStart(6,'0')}.tar`);await run('tar',['-cf',tar,...names],{cwd:frameDir});const key=this.frameKey(jobId,start,end);await this.store.putFile(key,tar,{contentType:'application/x-tar'});return {start,end,key,bytes:(await stat(tar)).size};}
  async restoreFrameSegments(jobId,frameDir){await mkdir(frameDir,{recursive:true});const objects=(await this.store.list(this.jobKey(jobId,'frames/'))).filter(o=>o.key.endsWith('.tar')).sort((a,b)=>a.key.localeCompare(b.key));let restored=0,maxFrame=0;for(const o of objects){const name=basename(o.key),m=name.match(/^(\d+)-(\d+)\.tar$/);if(!m)continue;const start=Number(m[1]),end=Number(m[2]);const last=join(frameDir,`${String(end).padStart(6,'0')}.png`);if(!(await fileExists(last))){const tar=join(frameDir,`.restore-${name}`);await this.store.downloadFile(o.key,tar);await run('tar',['-xf',tar],{cwd:frameDir});restored++;}maxFrame=Math.max(maxFrame,end);}return {segments:objects.length,restored,maxFrame};}
  async uploadOutput(jobId,path){return this.store.putFile(this.outputKey(jobId),path,{contentType:'video/mp4'});}
  async outputUrl(jobId,{expiresSeconds=3600}={}){return this.store.presignGet(this.outputKey(jobId),{expiresSeconds});}
  async hydrateJob(jobId,{dir}){await mkdir(dir,{recursive:true});const checkpoint=await this.loadCheckpoint(jobId);const assetIndex=await this.restoreAssetCache(jobId,join(dir,'asset-cache'));const frames=await this.restoreFrameSegments(jobId,join(dir,'frames'));return {checkpoint,assetIndex,frames};}
}
