const app=(process.env.PHASE9_CERT_APP_URL||'').replace(/\/+$/,'');
const secret=process.env.CRON_SECRET||'';
const supabase=(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/+$/,'');
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const itemId=process.env.PHASE9_CERT_ITEM_ID||'';
const release=process.env.PHASE9_RELEASE_SHA||process.env.GITHUB_SHA||'manual';
for(const [k,v] of Object.entries({PHASE9_CERT_APP_URL:app,CRON_SECRET:secret,SUPABASE_URL:supabase,SUPABASE_SERVICE_ROLE_KEY:service,PHASE9_CERT_ITEM_ID:itemId}))if(!v)throw new Error(`${k} is required`);
const dbHeaders={apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
const auth={Authorization:`Bearer ${secret}`};
const deadline=Date.now()+Number(process.env.PHASE9_CERT_TIMEOUT_MS||45*60_000);
async function rest(path){const r=await fetch(`${supabase}/rest/v1/${path}`,{headers:dbHeaders});if(!r.ok)throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0,400)}`);return r.json();}
async function scheduler(){const r=await fetch(`${app}/api/public/hooks/process-scheduler`,{method:'POST',headers:auth});if(!r.ok)throw new Error(`scheduler ${r.status}: ${(await r.text()).slice(0,500)}`);return r.json();}
async function publisher(extra={}){const r=await fetch(`${app}/api/public/hooks/process-publisher`,{method:'POST',headers:{...auth,...extra}});if(!r.ok)throw new Error(`publisher ${r.status}: ${(await r.text()).slice(0,500)}`);return r.json();}
async function item(id){return (await rest(`campaign_items?id=eq.${encodeURIComponent(id)}&select=id,status,render_output_object_key,youtube_video_id,youtube_url,youtube_publish_at,content_json`))[0];}
async function waitRendered(id){while(Date.now()<deadline){await scheduler();const row=await item(id);if(row?.render_output_object_key)return row;await new Promise(r=>setTimeout(r,5000));}throw new Error(`R2 render timed out for ${id}`);}
async function waitUploaded(id){while(Date.now()<deadline){await publisher();const row=await item(id);if(row?.youtube_video_id&&['uploaded','scheduled'].includes(row.status))return row;await new Promise(r=>setTimeout(r,5000));}throw new Error(`YouTube upload timed out for ${id}`);}
async function waitPublic(videoId){while(Date.now()<deadline){const r=await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`);if(r.ok)return true;await scheduler().catch(()=>{});await publisher().catch(()=>{});await new Promise(r=>setTimeout(r,10000));}throw new Error(`YouTube video ${videoId} did not become public`);}

// Optional real crash matrix. Supply JSON such as
// {"youtube_session_created":"uuid1","upload_progress":"uuid2","youtube_committed":"uuid3","campaign_committed":"uuid4"}
const crashMap=process.env.PHASE9_CRASH_ITEM_MAP?JSON.parse(process.env.PHASE9_CRASH_ITEM_MAP):{};
const crashResults={};
for(const [checkpoint,id] of Object.entries(crashMap)){
  await waitRendered(id);
  const injected=await publisher({'x-phase9-fault-checkpoint':checkpoint,'x-phase9-fault-item':id});
  crashResults[checkpoint]={injected:true,retried:Number(injected?.publishing?.retried||0)};
  const recovered=await waitUploaded(id);
  const attempts=await rest(`upload_attempts?campaign_item_id=eq.${encodeURIComponent(id)}&select=id,idempotency_key,youtube_video_id`);
  if(attempts.length!==1)throw new Error(`Exactly-once failure for ${checkpoint}: ${attempts.length} upload attempts`);
  crashResults[checkpoint].youtubeVideoId=recovered.youtube_video_id;
}

const rendered=await waitRendered(itemId);
if(!rendered?.content_json||Object.keys(rendered.content_json).length===0)throw new Error('Certification item has no materialized CSV/content data');
const uploaded=await waitUploaded(itemId);
await waitPublic(uploaded.youtube_video_id);
const requiredCheckpoints=['source_verified','youtube_session_created','upload_progress','youtube_committed','campaign_committed'];
const crashMatrixPassed=requiredCheckpoints.every(k=>crashResults[k]?.youtubeVideoId);
const rpc=await fetch(`${supabase}/rest/v1/rpc/phase9_record_certification`,{method:'POST',headers:dbHeaders,body:JSON.stringify({p_release_sha:release,p_status:'passed',p_campaign_item_id:itemId,p_youtube_video_id:uploaded.youtube_video_id,p_metadata:{crashResults},p_csv:true,p_r2:true,p_upload:true,p_public:true,p_crash:crashMatrixPassed})});
if(!rpc.ok)throw new Error(`Could not record certification: ${rpc.status} ${(await rpc.text()).slice(0,400)}`);
if(process.env.PHASE9_REQUIRE_CRASH_MATRIX==='1'&&!crashMatrixPassed)throw new Error(`Crash matrix requires dedicated items for every checkpoint: ${requiredCheckpoints.join(', ')}`);
console.log(JSON.stringify({ok:true,release,itemId,youtubeVideoId:uploaded.youtube_video_id,crashMatrixPassed,crashResults},null,2));
