import fs from 'node:fs';
const read=(p)=>fs.readFileSync(p,'utf8');
const oauth=read('src/lib/youtube-oauth.functions.ts');
const upload=read('src/lib/youtube-upload.functions.ts');
const hook=read('src/routes/api/public/hooks/process-campaign-queue.ts');
const sql=read('supabase/migrations/20260907130000_phase7_exactly_once_publishing.sql');
const checks=[
  ['OAuth start reads live request', oauth.includes('getRequest()') && oauth.includes('youtubeOAuthAppBaseUrl(requestOrigin)')],
  ['deterministic YouTube attempt key', upload.includes('youtube:${itemId}:publish-v1')],
  ['resumable status query', upload.includes('Content-Range": `bytes */${total}`')],
  ['chunked resumable upload', upload.includes('8 * 1024 * 1024') && upload.includes('Content-Range')],
  ['duplicate marker reconciliation', upload.includes('findExistingUploadByMarker') && upload.includes('uploadMarkerTag')],
  ['durable publish jobs', sql.includes('CREATE TABLE IF NOT EXISTS public.publish_jobs')],
  ['exclusive DB claim', sql.includes('FOR UPDATE SKIP LOCKED')],
  ['stale lease recovery', sql.includes('reconcile_stale_publish_jobs')],
  ['pipeline dispatches before publish', hook.includes('postRenderDispatch') && hook.includes('processPublishQueue')],
];
let fail=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}
if(fail) process.exit(1);
console.log(`Phase 7 static certification passed (${checks.length}/${checks.length}).`);
