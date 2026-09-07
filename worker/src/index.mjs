import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,rm,writeFile,readFile,stat} from 'node:fs/promises';
import {hostname,tmpdir} from 'node:os';
import {join} from 'node:path';
import {verify} from './security.mjs';
import {buildFfmpegPlan,downloadMedia,flattenManifest,manifestDuration} from './render-v2.mjs';
import {ChromiumFrameRenderer} from './chromium-renderer.mjs';
import {prefetchRenderAssets,startAssetServer,rewriteManifestUrls} from './asset-cache.mjs';
import {buildFontCatalogCss,fontFilePath,FONT_CATALOG_VERSION} from './font-catalog.mjs';
import {PostgresRenderQueue} from './queue-store.mjs';
import {R2ObjectStore,r2ConfigFromEnv} from './r2-store.mjs';
import {DurableRenderArtifacts} from './durable-artifacts.mjs';

const PORT=Number(process.env.PORT||8080);
const SECRET=process.env.FFMPEG_WORKER_SECRET||'';
const MAX=Math.max(1,Number(process.env.MAX_CONCURRENCY||2));
const RETRIES=Math.max(0,Number(process.env.MAX_RETRIES||2));
const LEASE_SECONDS=Math.max(15,Number(process.env.RENDER_LEASE_SECONDS||45));
const HEARTBEAT_MS=Math.max(2000,Number(process.env.RENDER_HEARTBEAT_MS||10000));
const RECONCILE_MS=Math.max(5000,Number(process.env.RENDER_RECONCILE_MS||15000));
const CLAIM_MS=Math.max(100,Number(process.env.RENDER_CLAIM_MS||500));
const WORK_ROOT=process.env.RENDER_WORK_ROOT||join(tmpdir(),'shorts-mation-render');
const WORKER_ID=process.env.RENDER_WORKER_ID||`${hostname()}-${process.pid}`;
const VERSION='native-chromium-ffmpeg-v6';
const FRAME_SEGMENT_SIZE=Math.max(10,Number(process.env.RENDER_FRAME_SEGMENT_SIZE||50));
const OUTPUT_URL_TTL=Math.max(60,Number(process.env.RENDER_OUTPUT_URL_TTL_SECONDS||86400));
if(SECRET.length<24)throw new Error('FFMPEG_WORKER_SECRET must be at least 24 characters');
const DATABASE_URL=process.env.RENDER_DATABASE_URL||process.env.DATABASE_URL||'';
const ffmpegOk=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
const queue=new PostgresRenderQueue({connectionString:DATABASE_URL,leaseSeconds:LEASE_SECONDS,workerTimeoutSeconds:Number(process.env.RENDER_WORKER_TIMEOUT_SECONDS||90)});
const r2=new R2ObjectStore({...r2ConfigFromEnv(),multipartThreshold:Number(process.env.R2_MULTIPART_THRESHOLD_BYTES||64*1024*1024),partSize:Number(process.env.R2_MULTIPART_PART_BYTES||16*1024*1024)});
const artifacts=new DurableRenderArtifacts(r2,{frameSegmentSize:FRAME_SEGMENT_SIZE});
const runtimes=new Map();
let draining=false,server=null,claimTimer=null,heartbeatTimer=null,reconcileTimer=null;

const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>1_000_000)throw new Error('body too large');}return s;}
function auth(req,raw){return verify(SECRET,String(req.headers['x-worker-timestamp']||''),raw,String(req.headers['x-worker-signature']||''));}
async function exists(path){try{const s=await stat(path);return s.isFile()&&s.size>0;}catch{return false;}}
async function fetchTo(url,path){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`asset fetch ${r.status}`);const max=Math.max(1024*1024,Number(process.env.MAX_ASSET_BYTES||512*1024*1024));const declared=Number(r.headers.get('content-length')||0);if(declared>max)throw new Error('asset exceeds worker limit');const reader=r.body?.getReader();if(!reader)throw new Error('asset has no body');const chunks=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>max){await reader.cancel();throw new Error('asset exceeds worker limit');}chunks.push(Buffer.from(value));}await writeFile(path,Buffer.concat(chunks,total));}
async function outputUrl(job){return job?.output_object_key?artifacts.outputUrl(job.id,{expiresSeconds:OUTPUT_URL_TTL}):null;}
async function sendCallback(job,status){
  const payload={id:job.id,status,progress:job.progress??0,error:job.error??null,url:status==='completed'?await outputUrl(job):null};
  let error=null;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(job.callback_url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`callback ${r.status}`);await queue.event(job.id,'callback_delivered',{status,attempt:attempt+1}).catch(()=>{});return;}catch(e){error=e instanceof Error?e.message:String(e);await new Promise(r=>setTimeout(r,250*(attempt+1)));}}
  await queue.event(job.id,'callback_failed',{status,error}).catch(()=>{});
}
async function persist(job,patch,notify=true){const updated=await queue.updateJob(job.id,WORKER_ID,patch);if(updated)Object.assign(job,updated);if(notify&&updated)await sendCallback(job,updated.status);return updated;}
async function checkpoint(job,stage,data={}){const next={...(job.checkpoint||{}),stage,...data,storageVersion:1,updatedAt:new Date().toISOString()};await artifacts.saveCheckpoint(job.id,next);job.checkpoint=next;await persist(job,{status:job.status||'rendering',progress:job.progress,checkpoint:next,storage:{backend:'r2',prefix:r2.prefix,frameSegmentSize:FRAME_SEGMENT_SIZE}},false);}

async function readOrFetchManifest(job,dir){
  const path=join(dir,'remote-manifest.json');
  if(await exists(path))return JSON.parse(await readFile(path,'utf8'));
  const durable=await artifacts.loadManifest(job.id);if(durable){await writeFile(path,JSON.stringify(durable));await checkpoint(job,'manifest_restored',{manifestDurable:true});return durable;}
  const mr=await fetch(job.manifest_url,{signal:AbortSignal.timeout(30000)});if(!mr.ok)throw new Error(`manifest ${mr.status}`);const m=await mr.json();await writeFile(path,JSON.stringify(m));await artifacts.saveManifest(job.id,m);await checkpoint(job,'manifest_cached',{manifestDurable:true});return m;
}

async function render(job,runtime){
  const dir=join(WORK_ROOT,'jobs',job.id);runtime.dir=dir;await mkdir(dir,{recursive:true});let assetServer=null;
  try{
    job.status='rendering';job.progress=Math.max(1,Number(job.progress||0));await persist(job,{status:'rendering',progress:job.progress,error:null});
    const hydrated=await artifacts.hydrateJob(job.id,{dir});if(hydrated.checkpoint){job.checkpoint={...(job.checkpoint||{}),...hydrated.checkpoint};await queue.event(job.id,'r2_checkpoint_restored',{stage:hydrated.checkpoint.stage,frameSegments:hydrated.frames.segments,assetCount:hydrated.assetIndex?.assets?.length||0}).catch(()=>{});}
    const remoteManifest=await readOrFetchManifest(job,dir);job.progress=Math.max(job.progress,3);await persist(job,{status:'rendering',progress:job.progress});
    const assetDir=join(dir,'asset-cache');const globallyRestored=await artifacts.restoreReusableAssets(remoteManifest,assetDir);const prefetched=await prefetchRenderAssets(remoteManifest,{dir:assetDir,fetchTo,maxConcurrency:Number(process.env.ASSET_PREFETCH_CONCURRENCY||6),reuse:true});const durableAssetIndex=await artifacts.syncAssetCache(job.id,assetDir,prefetched.index);
    const fontCss=await buildFontCatalogCss();assetServer=await startAssetServer({assetMap:prefetched.map,fontCss,fontFilePath});const m=rewriteManifestUrls(remoteManifest,prefetched.map,assetServer);
    job.asset_cache={count:durableAssetIndex.assets.length,reused:prefetched.index.reused,globalRestored:globallyRestored,downloaded:prefetched.index.downloaded,fontCatalogVersion:FONT_CATALOG_VERSION,durable:true};await queue.updateJob(job.id,WORKER_ID,{assetCache:job.asset_cache});await checkpoint(job,'assets_ready',{assetsReady:true,assetCount:durableAssetIndex.assets.length});
    const w=Number(m.output?.size?.width||1080),h=Number(m.output?.size?.height||1920),fps=Number(m.output?.fps||25);const {html}=flattenManifest(m);const total=manifestDuration(m);const frameDir=join(dir,'frames');await mkdir(frameDir,{recursive:true});const totalFrames=Math.max(1,Math.ceil(total*fps));let durableFrameEnd=Math.min(totalFrames,hydrated.frames.maxFrame||0);
    const browser=new ChromiumFrameRenderer({width:w,height:h,assetTimeoutMs:Number(process.env.CHROMIUM_ASSET_TIMEOUT_MS||15000),fontStylesheetUrl:`${assetServer.base}/__fonts__/catalog.css`});await browser.start();
    try{for(let i=0;i<totalFrames;i++){
      if(runtime.cancelled)throw new Error('cancelled');const frameNo=i+1,t=i/fps;const activeHtml=html.filter(c=>t>=Number(c.start||0)&&t<Number(c.start||0)+Number(c.length||0)).sort((a,b)=>b.trackIndex-a.trackIndex||a.clipIndex-b.clipIndex);const frameBody=activeHtml.map(c=>c?.asset?.html||'').join('');const png=join(frameDir,`${String(frameNo).padStart(6,'0')}.png`);if(!(await exists(png)))await browser.renderFrame(frameBody,png);
      if(frameNo>durableFrameEnd&&(frameNo%FRAME_SEGMENT_SIZE===0)){const seg=await artifacts.uploadFrameSegment(job.id,frameDir,durableFrameEnd+1,frameNo);durableFrameEnd=frameNo;await checkpoint(job,'frames',{framesCompleted:frameNo,totalFrames,durableFrameEnd,frameSegment:seg});}
      else if(i%Math.max(1,Math.floor(totalFrames/20))===0){job.progress=Math.min(65,Math.round(i/totalFrames*65));await persist(job,{status:'rendering',progress:job.progress,checkpoint:{...(job.checkpoint||{}),stage:'frames',framesCompleted:frameNo,totalFrames,durableFrameEnd}},false);}
    }}finally{await browser.close();}
    if(durableFrameEnd<totalFrames){const seg=await artifacts.uploadFrameSegment(job.id,frameDir,durableFrameEnd+1,totalFrames);durableFrameEnd=totalFrames;await checkpoint(job,'frames_complete',{framesCompleted:totalFrames,totalFrames,durableFrameEnd,frameSegment:seg});}else await checkpoint(job,'frames_complete',{framesCompleted:totalFrames,totalFrames,durableFrameEnd});
    job.progress=70;await persist(job,{status:'rendering',progress:70});const inputMap=await downloadMedia({manifest:m,dir:join(dir,'media'),fetchTo});await checkpoint(job,'media_ready',{mediaReady:true});
    const out=join(dir,'out.mp4');job.status='encoding';job.progress=75;await persist(job,{status:'encoding',progress:75});const plan=buildFfmpegPlan(m,inputMap,{framePattern:join(frameDir,'%06d.png'),total,w,h,fps,out});runtime.process=spawn('ffmpeg',plan.args,{stdio:['ignore','ignore','pipe']});let stderr='';runtime.process.stderr?.on('data',d=>{stderr=(stderr+String(d)).slice(-12000)});await new Promise((resolve,reject)=>{runtime.process.on('exit',c=>c===0?resolve():reject(new Error(`ffmpeg exited ${c}: ${stderr.slice(-3000)}`)));runtime.process.on('error',reject);});runtime.process=null;await checkpoint(job,'encoded',{encoded:true});
    job.status='uploading';job.progress=95;await persist(job,{status:'uploading',progress:95});const upload=await artifacts.uploadOutput(job.id,out);const outputObjectKey=artifacts.outputKey(job.id);await checkpoint(job,'output_uploaded',{encoded:true,outputObjectKey,outputBytes:upload.bytes,multipart:Boolean(upload.multipart),multipartParts:upload.parts||1});
    const done=await queue.complete(job.id,WORKER_ID,{outputObjectKey,checkpoint:{...(job.checkpoint||{}),stage:'completed',encoded:true,outputObjectKey}});if(!done)throw new Error('lost job lease before completion');Object.assign(job,done);await sendCallback(job,'completed');
  }finally{if(assetServer)await assetServer.close().catch(()=>{});runtime.process=null;if(process.env.RENDER_KEEP_LOCAL_SCRATCH!=='1')await rm(dir,{recursive:true,force:true}).catch(()=>{});}
}

async function execute(job){const runtime={cancelled:false,process:null,dir:null,leaseTimer:null};runtimes.set(job.id,runtime);runtime.leaseTimer=setInterval(async()=>{try{const lease=await queue.renewLease(job.id,WORKER_ID);if(!lease||lease.cancel_requested){runtime.cancelled=true;runtime.process?.kill('SIGTERM');}}catch(e){console.error('lease heartbeat failed',job.id,e);}},Math.max(3000,Math.floor(LEASE_SECONDS*1000/3)));runtime.leaseTimer.unref();try{await render(job,runtime);}catch(e){const message=e instanceof Error?e.message:String(e);if(runtime.cancelled||message==='cancelled'){const cancelled=await queue.cancelActive(job.id,WORKER_ID,'cancelled');if(cancelled){Object.assign(job,cancelled);await sendCallback(job,'cancelled');}}else{const next=await queue.failOrRetry(job.id,WORKER_ID,{error:message,maxRetries:RETRIES});if(next){Object.assign(job,next);await sendCallback(job,next.status);}}}finally{clearInterval(runtime.leaseTimer);runtimes.delete(job.id);}}
async function claimWork(){if(draining||runtimes.size>=MAX)return;while(!draining&&runtimes.size<MAX){const job=await queue.claim(WORKER_ID);if(!job)break;execute(job).catch(e=>console.error('execute fatal',e));}}
async function reconcile(){try{const rows=await queue.reconcileStale();if(rows.length)console.warn(`reconciled ${rows.length} stale render lease(s)`);}catch(e){console.error('stale reconciliation failed',e);}}
async function fleet(){const f=await queue.fleetHealth();return {...f,workerId:WORKER_ID,draining,localActive:runtimes.size,maxConcurrency:MAX,ffmpeg:ffmpegOk,version:VERSION,storage:{backend:'r2',bucket:r2.bucket,prefix:r2.prefix,sharedFilesystemRequired:false}};}

function makeServer(){return http.createServer(async(req,res)=>{try{const u=new URL(req.url||'/','http://worker');if(req.method==='GET'&&(u.pathname==='/health'||u.pathname==='/ready'||u.pathname==='/fleet')){const raw='';if(!auth(req,raw))return json(res,401,{ok:false});const f=await fleet();if(u.pathname==='/ready')return json(res,draining?503:200,{ok:!draining,workerId:WORKER_ID,storage:'r2'});if(u.pathname==='/fleet')return json(res,200,f);return json(res,200,{ok:!draining,ffmpeg:ffmpegOk,workerId:WORKER_ID,active:runtimes.size,maxConcurrency:MAX,draining,storage:f.storage,queue:f.queue,nodes:f.nodes});}
  if(req.method==='GET'&&u.pathname.startsWith('/outputs/')){const id=u.pathname.split('/').pop(),j=await queue.getJob(id);if(!j?.output_object_key||u.searchParams.get('token')!==j.output_token)return json(res,404,{error:'not found'});const url=await outputUrl(j);res.writeHead(302,{location:url,'cache-control':'no-store'});return res.end();}
  const raw=await body(req);if(!auth(req,raw))return json(res,401,{error:'invalid signature'});if(req.method==='POST'&&u.pathname==='/jobs'){if(draining)return json(res,503,{error:'draining'});const d=JSON.parse(raw);if(!d.idempotencyKey||!d.manifestUrl||!d.callbackUrl)return json(res,400,{error:'idempotencyKey, manifestUrl and callbackUrl are required'});const {job:j,created}=await queue.createOrGetJob(d);if(created)await sendCallback(j,'queued');return json(res,created?202:200,{id:j.id,status:j.status});}
  const m=u.pathname.match(/^\/jobs\/([^/]+)$/);if(m){const j=await queue.getJob(m[1]);if(!j)return json(res,404,{error:'not found'});if(req.method==='GET')return json(res,200,{id:j.id,status:j.status,progress:j.progress,error:j.error??null,workerId:j.worker_id,runAttempts:j.run_attempts,checkpoint:j.checkpoint,storage:j.storage,outputUrl:await outputUrl(j)});if(req.method==='DELETE'){const updated=await queue.requestCancel(j.id);const rt=runtimes.get(j.id);if(rt){rt.cancelled=true;rt.process?.kill('SIGTERM');}if(updated?.status==='cancelled')await sendCallback(updated,'cancelled');return json(res,200,{ok:true,status:updated?.status});}}return json(res,404,{error:'not found'});
}catch(e){console.error(e);json(res,500,{error:e instanceof Error?e.message:'worker error'});}});}

async function shutdown(signal){if(draining)return;draining=true;console.log(`${signal}: draining worker ${WORKER_ID}`);clearInterval(claimTimer);clearInterval(reconcileTimer);await queue.setWorkerDraining(WORKER_ID,true).catch(()=>{});const deadline=Date.now()+Math.max(5000,Number(process.env.RENDER_DRAIN_TIMEOUT_MS||30000));while(runtimes.size&&Date.now()<deadline)await new Promise(r=>setTimeout(r,250));if(runtimes.size){console.warn(`drain timeout with ${runtimes.size} active job(s); R2 checkpoints allow recovery on any worker`);for(const rt of runtimes.values())rt.process?.kill('SIGTERM');}clearInterval(heartbeatTimer);await new Promise(r=>server?.close(()=>r()));await queue.close().catch(()=>{});process.exit(runtimes.size?1:0);}
async function main(){r2.assertConfigured();await mkdir(join(WORK_ROOT,'jobs'),{recursive:true});await queue.connect();await queue.registerWorker({workerId:WORKER_ID,hostname:hostname(),maxConcurrency:MAX,version:VERSION,metadata:{scratchRoot:WORK_ROOT,fontCatalogVersion:FONT_CATALOG_VERSION,storage:'r2',r2Prefix:r2.prefix,sharedFilesystemRequired:false}});await reconcile();server=makeServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,resolve)});console.log(`R2-backed render worker ${WORKER_ID} listening on ${PORT}`);claimTimer=setInterval(()=>claimWork().catch(e=>console.error('claim failed',e)),CLAIM_MS);claimTimer.unref();heartbeatTimer=setInterval(()=>queue.heartbeatWorker(WORKER_ID,{activeJobs:runtimes.size,status:draining?'draining':'active'}).catch(e=>console.error('worker heartbeat failed',e)),HEARTBEAT_MS);heartbeatTimer.unref();reconcileTimer=setInterval(reconcile,RECONCILE_MS);reconcileTimer.unref();claimWork().catch(console.error);}
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>shutdown(sig).catch(e=>{console.error(e);process.exit(1)}));
main().catch(e=>{console.error('worker startup failed',e);process.exit(1)});
