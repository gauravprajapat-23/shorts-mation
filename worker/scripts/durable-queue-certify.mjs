import assert from 'node:assert/strict';
import {PostgresRenderQueue} from '../src/queue-store.mjs';
const url=process.env.RENDER_TEST_DATABASE_URL||process.env.RENDER_DATABASE_URL;
if(!url){console.error('Set RENDER_TEST_DATABASE_URL to run durable queue integration certification.');process.exit(2);}
const suffix=Date.now().toString(36);const a=new PostgresRenderQueue({connectionString:url,leaseSeconds:15}),b=new PostgresRenderQueue({connectionString:url,leaseSeconds:15});
try{
 await a.connect();await b.connect();await a.registerWorker({workerId:`cert-a-${suffix}`,hostname:'cert',maxConcurrency:1,version:'cert'});await b.registerWorker({workerId:`cert-b-${suffix}`,hostname:'cert',maxConcurrency:1,version:'cert'});
 const {job,created}=await a.createOrGetJob({idempotencyKey:`cert-${suffix}`,attemptId:'cert',manifestUrl:'https://example.invalid/manifest',callbackUrl:'https://example.invalid/callback'});assert.equal(created,true);
 const duplicate=await b.createOrGetJob({idempotencyKey:`cert-${suffix}`,attemptId:'cert-2',manifestUrl:'x',callbackUrl:'y'});assert.equal(duplicate.created,false);assert.equal(duplicate.job.id,job.id);
 const claimed=await a.claim(`cert-a-${suffix}`);assert.equal(claimed.id,job.id);assert.equal(claimed.worker_id,`cert-a-${suffix}`);
 const second=await b.claim(`cert-b-${suffix}`);assert.equal(second,null,'SKIP LOCKED/lease must prevent second ownership');
 await a.q(`UPDATE render_queue_jobs SET lease_expires_at=now()-interval '1 second' WHERE id=$1`,[job.id]);const recovered=await b.claim(`cert-b-${suffix}`);assert.equal(recovered.id,job.id);assert.equal(recovered.worker_id,`cert-b-${suffix}`);
 await b.complete(job.id,`cert-b-${suffix}`,{outputPath:'/tmp/cert.mp4',checkpoint:{stage:'completed'}});const done=await a.getJob(job.id);assert.equal(done.status,'completed');assert.equal(done.run_attempts,2);
 console.log('Durable queue certification PASS: idempotency, exclusive claim, stale-lease recovery, completion.');
 await a.q(`DELETE FROM render_queue_jobs WHERE id=$1`,[job.id]);await a.q(`DELETE FROM render_worker_nodes WHERE worker_id IN ($1,$2)`,[`cert-a-${suffix}`,`cert-b-${suffix}`]);
} finally {await a.close().catch(()=>{});await b.close().catch(()=>{});}
