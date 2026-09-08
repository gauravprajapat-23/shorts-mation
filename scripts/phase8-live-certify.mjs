const app=(process.env.PHASE8_CERT_APP_URL||'').replace(/\/+$/,'');
const secret=process.env.CRON_SECRET||'';const supabase=(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/+$/,'');
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||'';const itemId=process.env.PHASE8_CERT_ITEM_ID||'';
for(const [k,v] of Object.entries({PHASE8_CERT_APP_URL:app,CRON_SECRET:secret,SUPABASE_URL:supabase,SUPABASE_SERVICE_ROLE_KEY:service,PHASE8_CERT_ITEM_ID:itemId}))if(!v)throw new Error(`${k} is required`);
const headers={apikey:service,Authorization:`Bearer ${service}`};
const deadline=Date.now()+Number(process.env.PHASE8_CERT_TIMEOUT_MS||30*60_000);let last=null;
while(Date.now()<deadline){
  const run=await fetch(`${app}/api/public/hooks/process-campaign-queue`,{method:'POST',headers:{Authorization:`Bearer ${secret}`}});if(!run.ok)throw new Error(`cron ${run.status}: ${(await run.text()).slice(0,500)}`);
  const res=await fetch(`${supabase}/rest/v1/campaign_items?id=eq.${encodeURIComponent(itemId)}&select=id,status,render_output_object_key,youtube_video_id,youtube_url,youtube_publish_at`,{headers});if(!res.ok)throw new Error(`Supabase ${res.status}`);
  last=(await res.json())[0];console.log(JSON.stringify(last));
  if(last?.render_output_object_key&&last?.youtube_video_id&&['uploaded','scheduled'].includes(last.status))break;
  await new Promise(r=>setTimeout(r,5000));
}
if(!last?.render_output_object_key||!last?.youtube_video_id)throw new Error('End-to-end certification timed out before R2 + YouTube completion');
if(process.env.PHASE8_CERT_EXPECT_PUBLIC==='1'){
  while(Date.now()<deadline){const r=await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(last.youtube_video_id)}&format=json`);if(r.ok){console.log(`Public YouTube certification passed: ${last.youtube_video_id}`);process.exit(0)}await new Promise(r=>setTimeout(r,10000));}
  throw new Error('Video never became publicly observable before certification timeout');
}
console.log(`Phase 8 live pipeline passed through YouTube upload/schedule: ${last.youtube_video_id}`);
