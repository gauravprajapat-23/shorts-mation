import assert from 'node:assert/strict';
import { PostgresRenderQueue } from '../src/queue-store.mjs';
const connectionString=process.env.RENDER_TEST_DATABASE_URL||process.env.RENDER_DATABASE_URL;
if(!connectionString) throw new Error('RENDER_TEST_DATABASE_URL is required');
const suffix=Date.now().toString(36); const q=new PostgresRenderQueue({connectionString,leaseSeconds:30}); await q.connect();
const make=async(tenant,weight=1,max=1,priorityAt=null)=>q.createOrGetJob({idempotencyKey:`p10:${suffix}:${tenant}:${Math.random()}`,attemptId:`a-${suffix}`,manifestUrl:'https://example.invalid/manifest',callbackUrl:'https://example.invalid/callback',tenantId:`${suffix}-${tenant}`,tenantWeight:weight,tenantMaxConcurrent:max,priorityAt});
try{
  const a1=await make('a',1,1),a2=await make('a',1,1),b1=await make('b',2,1),b2=await make('b',2,1);
  const c1=await q.claim(`w1-${suffix}`); assert.equal(c1.tenant_id,`${suffix}-a`); await q.complete(c1.id,`w1-${suffix}`,{});
  const c2=await q.claim(`w2-${suffix}`); assert.equal(c2.tenant_id,`${suffix}-b`); await q.complete(c2.id,`w2-${suffix}`,{});
  const c3=await q.claim(`w3-${suffix}`); assert.equal(c3.tenant_id,`${suffix}-b`); await q.complete(c3.id,`w3-${suffix}`,{});
  const c4=await q.claim(`w4-${suffix}`); assert.equal(c4.tenant_id,`${suffix}-a`); await q.complete(c4.id,`w4-${suffix}`,{});
  const x1=await make('cap',1,1),x2=await make('cap',1,1),normal=await make('normal',1,1);
  const cap1=await q.claim(`cap1-${suffix}`); assert.equal(cap1.tenant_id,`${suffix}-cap`);
  const cap2=await q.claim(`cap2-${suffix}`); assert.notEqual(cap2.tenant_id,`${suffix}-cap`); await q.complete(cap2.id,`cap2-${suffix}`,{}); await q.complete(cap1.id,`cap1-${suffix}`,{});
  const ordinary=await make('ordinary',10,1,new Date(Date.now()+3600_000).toISOString());
  const urgent=await make('urgent',1,1,new Date().toISOString());
  const u=await q.claim(`urgent-${suffix}`); assert.equal(u.tenant_id,`${suffix}-urgent`); await q.complete(u.id,`urgent-${suffix}`,{});
  console.log('Phase 10 PostgreSQL fairness certification passed');
} finally {
  await q.q(`DELETE FROM render_queue_jobs WHERE tenant_id LIKE $1`,[`${suffix}-%`]).catch(()=>{});
  await q.q(`DELETE FROM render_tenant_fairness WHERE tenant_id LIKE $1`,[`${suffix}-%`]).catch(()=>{});
  await q.close();
}
