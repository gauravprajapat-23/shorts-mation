import { randomUUID } from 'node:crypto';

export const QUEUE_SCHEMA_VERSION = 1;
const ACTIVE = ['leased','rendering','encoding','uploading'];

export function computeRetryDelayMs(attempt,{baseMs=1000,maxMs=30000}={}){
  return Math.min(maxMs,baseMs*(2**Math.max(0,attempt-1)));
}

export function isLeaseExpired(job,now=Date.now()){
  if(!ACTIVE.includes(job?.status)) return false;
  const t=job?.lease_expires_at ? new Date(job.lease_expires_at).getTime() : 0;
  return t>0 && t<=now;
}

export class PostgresRenderQueue {
  constructor({connectionString,leaseSeconds=45,workerTimeoutSeconds=90}={}){
    if(!connectionString) throw new Error('RENDER_DATABASE_URL (or DATABASE_URL) is required for durable render queue');
    this.connectionString=connectionString;
    this.leaseSeconds=Math.max(15,Number(leaseSeconds)||45);
    this.workerTimeoutSeconds=Math.max(this.leaseSeconds*2,Number(workerTimeoutSeconds)||90);
    this.pool=null;
  }
  async connect(){
    if(this.pool) return this;
    const {Pool}=await import('pg');
    this.pool=new Pool({connectionString:this.connectionString,max:Math.max(2,Number(process.env.RENDER_DB_POOL_SIZE||10)),ssl:process.env.RENDER_DB_SSL==='require'?{rejectUnauthorized:false}:undefined});
    await this.ensureSchema(); return this;
  }
  async close(){await this.pool?.end();this.pool=null;}
  async q(text,params=[]){if(!this.pool)throw new Error('queue not connected');return this.pool.query(text,params);}
  async ensureSchema(){
    await this.q(`CREATE TABLE IF NOT EXISTS render_queue_meta (key text PRIMARY KEY,value text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS render_queue_jobs (
        id uuid PRIMARY KEY,idempotency_key text NOT NULL UNIQUE,attempt_id text,manifest_url text NOT NULL,callback_url text NOT NULL,
        status text NOT NULL DEFAULT 'queued',progress integer NOT NULL DEFAULT 0,error text,output_token text NOT NULL,output_path text,
        worker_id text,lease_expires_at timestamptz,available_at timestamptz NOT NULL DEFAULT now(),run_attempts integer NOT NULL DEFAULT 0,
        cancel_requested boolean NOT NULL DEFAULT false,checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,asset_cache jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS render_queue_jobs_claim_idx ON render_queue_jobs(status,available_at,created_at);
      CREATE INDEX IF NOT EXISTS render_queue_jobs_lease_idx ON render_queue_jobs(lease_expires_at) WHERE lease_expires_at IS NOT NULL;
      CREATE TABLE IF NOT EXISTS render_worker_nodes (
        worker_id text PRIMARY KEY,hostname text,status text NOT NULL,max_concurrency integer NOT NULL,active_jobs integer NOT NULL DEFAULT 0,
        version text NOT NULL,last_heartbeat timestamptz NOT NULL DEFAULT now(),started_at timestamptz NOT NULL DEFAULT now(),metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE TABLE IF NOT EXISTS render_job_events (
        id bigserial PRIMARY KEY,job_id uuid NOT NULL REFERENCES render_queue_jobs(id) ON DELETE CASCADE,event text NOT NULL,data jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS render_job_events_job_idx ON render_job_events(job_id,created_at DESC);`);
    await this.q(`INSERT INTO render_queue_meta(key,value) VALUES('schema_version',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[String(QUEUE_SCHEMA_VERSION)]);
  }
  async registerWorker({workerId,hostname,maxConcurrency,version,metadata={}}){
    await this.q(`INSERT INTO render_worker_nodes(worker_id,hostname,status,max_concurrency,active_jobs,version,metadata,last_heartbeat,started_at)
      VALUES($1,$2,'active',$3,0,$4,$5::jsonb,now(),now()) ON CONFLICT(worker_id) DO UPDATE SET hostname=EXCLUDED.hostname,status='active',max_concurrency=EXCLUDED.max_concurrency,version=EXCLUDED.version,metadata=EXCLUDED.metadata,last_heartbeat=now(),started_at=now()`,[workerId,hostname,maxConcurrency,version,JSON.stringify(metadata)]);
  }
  async heartbeatWorker(workerId,{activeJobs,status='active'}={}){
    await this.q(`UPDATE render_worker_nodes SET last_heartbeat=now(),active_jobs=COALESCE($2,active_jobs),status=$3 WHERE worker_id=$1`,[workerId,activeJobs??null,status]);
  }
  async setWorkerDraining(workerId,draining=true){await this.q(`UPDATE render_worker_nodes SET status=$2,last_heartbeat=now() WHERE worker_id=$1`,[workerId,draining?'draining':'active']);}
  async createOrGetJob(data){
    const id=randomUUID(),token=randomUUID();
    const inserted=await this.q(`INSERT INTO render_queue_jobs(id,idempotency_key,attempt_id,manifest_url,callback_url,output_token)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *`,[id,data.idempotencyKey,data.attemptId??null,data.manifestUrl,data.callbackUrl,token]);
    if(inserted.rows[0]) return {job:inserted.rows[0],created:true};
    const existing=await this.q(`SELECT * FROM render_queue_jobs WHERE idempotency_key=$1`,[data.idempotencyKey]);
    return {job:existing.rows[0],created:false};
  }
  async getJob(id){const r=await this.q(`SELECT * FROM render_queue_jobs WHERE id=$1`,[id]);return r.rows[0]||null;}
  async requestCancel(id){const r=await this.q(`UPDATE render_queue_jobs SET cancel_requested=true,updated_at=now(),status=CASE WHEN status IN ('queued','retry_wait') THEN 'cancelled' ELSE status END,completed_at=CASE WHEN status IN ('queued','retry_wait') THEN now() ELSE completed_at END WHERE id=$1 RETURNING *`,[id]);return r.rows[0]||null;}
  async claim(workerId){
    const c=await this.pool.connect();
    try{await c.query('BEGIN');const r=await c.query(`SELECT * FROM render_queue_jobs WHERE cancel_requested=false AND ((status IN ('queued','retry_wait') AND available_at<=now()) OR (status IN ('leased','rendering','encoding') AND lease_expires_at<now())) ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1`);if(!r.rows[0]){await c.query('COMMIT');return null;}const row=r.rows[0];const u=await c.query(`UPDATE render_queue_jobs SET status='leased',worker_id=$2,lease_expires_at=now()+($3||' seconds')::interval,run_attempts=run_attempts+1,error=NULL,updated_at=now() WHERE id=$1 RETURNING *`,[row.id,workerId,String(this.leaseSeconds)]);await c.query(`INSERT INTO render_job_events(job_id,event,data) VALUES($1,'claimed',$2::jsonb)`,[row.id,JSON.stringify({workerId,recovered:Boolean(row.lease_expires_at)})]);await c.query('COMMIT');return u.rows[0];}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }
  async renewLease(id,workerId){const r=await this.q(`UPDATE render_queue_jobs SET lease_expires_at=now()+($3||' seconds')::interval,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status IN ('leased','rendering','encoding') RETURNING cancel_requested,status`,[id,workerId,String(this.leaseSeconds)]);return r.rows[0]||null;}
  async updateJob(id,workerId,{status,progress,error,outputPath,checkpoint,assetCache}={}){
    const r=await this.q(`UPDATE render_queue_jobs SET status=COALESCE($3,status),progress=COALESCE($4,progress),error=$5,output_path=COALESCE($6,output_path),checkpoint=COALESCE($7::jsonb,checkpoint),asset_cache=COALESCE($8::jsonb,asset_cache),updated_at=now(),lease_expires_at=CASE WHEN COALESCE($3,status) IN ('leased','rendering','encoding') THEN now()+($9||' seconds')::interval ELSE NULL END WHERE id=$1 AND ($2::text IS NULL OR worker_id=$2) RETURNING *`,[id,workerId??null,status??null,progress??null,error??null,outputPath??null,checkpoint?JSON.stringify(checkpoint):null,assetCache?JSON.stringify(assetCache):null,String(this.leaseSeconds)]);return r.rows[0]||null;
  }
  async complete(id,workerId,{outputPath,checkpoint={}}){const r=await this.q(`UPDATE render_queue_jobs SET status='completed',progress=100,output_path=$3,checkpoint=$4::jsonb,completed_at=now(),updated_at=now(),lease_expires_at=NULL WHERE id=$1 AND worker_id=$2 RETURNING *`,[id,workerId,outputPath,JSON.stringify(checkpoint)]);return r.rows[0]||null;}
  async cancelActive(id,workerId,error='cancelled'){const r=await this.q(`UPDATE render_queue_jobs SET status='cancelled',error=$3,completed_at=now(),updated_at=now(),lease_expires_at=NULL WHERE id=$1 AND worker_id=$2 RETURNING *`,[id,workerId,error]);return r.rows[0]||null;}
  async failOrRetry(id,workerId,{error,maxRetries}){
    const j=await this.getJob(id);if(!j||j.worker_id!==workerId)return null;const retriesUsed=Math.max(0,Number(j.run_attempts)-1);if(retriesUsed<maxRetries){const delay=computeRetryDelayMs(retriesUsed+1);const r=await this.q(`UPDATE render_queue_jobs SET status='retry_wait',error=$3,worker_id=NULL,lease_expires_at=NULL,available_at=now()+($4||' milliseconds')::interval,updated_at=now() WHERE id=$1 AND worker_id=$2 RETURNING *`,[id,workerId,error,String(delay)]);await this.q(`INSERT INTO render_job_events(job_id,event,data) VALUES($1,'retry_scheduled',$2::jsonb)`,[id,JSON.stringify({delay,error})]);return r.rows[0]||null;}
    const r=await this.q(`UPDATE render_queue_jobs SET status='failed',error=$3,completed_at=now(),updated_at=now(),lease_expires_at=NULL WHERE id=$1 AND worker_id=$2 RETURNING *`,[id,workerId,error]);return r.rows[0]||null;
  }
  async reconcileStale(){
    const r=await this.q(`UPDATE render_queue_jobs SET status=CASE WHEN cancel_requested THEN 'cancelled' ELSE 'queued' END,worker_id=NULL,lease_expires_at=NULL,available_at=now(),error=CASE WHEN cancel_requested THEN 'cancelled' ELSE COALESCE(error,'recovered stale lease') END,completed_at=CASE WHEN cancel_requested THEN now() ELSE completed_at END,updated_at=now() WHERE status IN ('leased','rendering','encoding') AND lease_expires_at<now() RETURNING id,status`);
    return r.rows;
  }
  async fleetHealth(){
    const counts=await this.q(`SELECT status,count(*)::int AS count FROM render_queue_jobs GROUP BY status`);
    const nodes=await this.q(`SELECT worker_id,hostname,status,max_concurrency,active_jobs,version,last_heartbeat,started_at,(last_heartbeat > now()-($1||' seconds')::interval) AS online FROM render_worker_nodes ORDER BY worker_id`,[String(this.workerTimeoutSeconds)]);
    const c=Object.fromEntries(counts.rows.map(x=>[x.status,x.count]));return {queue:c,nodes:nodes.rows};
  }
  async event(jobId,event,data={}){await this.q(`INSERT INTO render_job_events(job_id,event,data) VALUES($1,$2,$3::jsonb)`,[jobId,event,JSON.stringify(data)]);}
}
