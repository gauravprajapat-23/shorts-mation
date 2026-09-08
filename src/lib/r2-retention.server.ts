import { deleteR2Object, listR2Prefix } from "@/lib/r2-publish-source.server";
import { getTenantCapacityPolicy, recordCapacityUsage } from "@/lib/tenant-governance.server";

export async function enqueueRenderR2Cleanup(userId:string, objectKey:string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const policy=await getTenantCapacityPolicy(userId); const marker="/output/"; const idx=objectKey.indexOf(marker); const prefix=idx>=0?objectKey.slice(0,idx):objectKey.replace(/\/[^/]+$/,'');
  const jobEligible=new Date(Date.now()+policy.r2JobRetentionDays*86400_000).toISOString();
  const outputEligible=new Date(Date.now()+policy.r2OutputRetentionDays*86400_000).toISOString();
  await (supabaseAdmin as any).from("r2_cleanup_queue").upsert({user_id:userId,object_prefix:prefix,kind:"job",eligible_at:jobEligible,status:"pending"},{onConflict:"object_prefix"});
  await (supabaseAdmin as any).from("r2_cleanup_queue").upsert({user_id:userId,object_prefix:`${prefix}/output`,kind:"output",eligible_at:outputEligible,status:"pending"},{onConflict:"object_prefix"});
}

export async function processR2Cleanup(limit=20):Promise<{claimed:number;completed:number;failed:number;bytesDeleted:number}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); const owner=`cleanup:${process.pid}:${Date.now()}`;
  const { data:rows,error }=await (supabaseAdmin as any).from("r2_cleanup_queue").select("*").in("status",["pending","failed"]).lte("eligible_at",new Date().toISOString()).order("eligible_at").limit(Math.max(1,Math.min(100,limit)));
  if(error)throw error; let completed=0,failed=0,bytesDeleted=0;
  for(const row of (rows??[]) as any[]){const lock=await (supabaseAdmin as any).from("r2_cleanup_queue").update({status:"leased",lease_owner:owner,lease_expires_at:new Date(Date.now()+300000).toISOString(),attempts:Number(row.attempts||0)+1}).eq("id",row.id).in("status",["pending","failed"]).select("id");if(!lock.data?.length)continue;
    try{const objects=await listR2Prefix(row.object_prefix);let bytes=0;for(const o of objects){if(row.kind==="job" && o.key.startsWith(`${row.object_prefix}/output/`))continue;await deleteR2Object(o.key);bytes+=o.size;}bytesDeleted+=bytes;completed++;await (supabaseAdmin as any).from("r2_cleanup_queue").update({status:"completed",bytes_deleted:bytes,completed_at:new Date().toISOString(),lease_owner:null,lease_expires_at:null,last_error:null}).eq("id",row.id).eq("lease_owner",owner);if(row.user_id)await recordCapacityUsage({userId:row.user_id,eventType:"r2_bytes_deleted",units:bytes,referenceType:"r2_cleanup",referenceId:String(row.id)});
    }catch(e){failed++;await (supabaseAdmin as any).from("r2_cleanup_queue").update({status:"failed",lease_owner:null,lease_expires_at:null,last_error:e instanceof Error?e.message:String(e)}).eq("id",row.id).eq("lease_owner",owner);}}
  return {claimed:(rows??[]).length,completed,failed,bytesDeleted};
}
