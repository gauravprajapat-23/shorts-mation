import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const hash=(s:string)=>createHash("sha256").update(s).digest("hex");

export const getWorkspaceOverview=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:{organizationId?:string|null})=>d).handler(async({context,data})=>{
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 let orgId=data.organizationId;
 if(!orgId){const {data:id}=await (supabaseAdmin as any).rpc("phase12_default_org",{p_user:context.userId});orgId=id;}
 if(!orgId) throw new Error("No workspace available");
 const {data:member}=await (supabaseAdmin as any).from("organization_members").select("role,status").eq("organization_id",orgId).eq("user_id",context.userId).maybeSingle();
 if(!member||member.status!=="active")throw new Error("Workspace access denied");
 const [{data:org},{data:members},{data:invites},{data:channels},{data:audit}]=await Promise.all([
   (supabaseAdmin as any).from("organizations").select("id,name,slug,billing_owner_user_id,created_at").eq("id",orgId).single(),
   (supabaseAdmin as any).from("organization_members").select("user_id,role,status,joined_at").eq("organization_id",orgId).order("joined_at"),
   (supabaseAdmin as any).from("organization_invitations").select("id,email,role,expires_at,accepted_at,revoked_at,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(30),
   (supabaseAdmin as any).from("youtube_connections").select("id,channel_id,channel_title,is_connected,created_at").eq("organization_id",orgId).order("created_at"),
   (supabaseAdmin as any).from("organization_audit_log").select("id,actor_user_id,action,target_type,target_id,metadata_json,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(50),
 ]);
 const ids=(members??[]).map((m:any)=>m.user_id); const {data:profiles}=ids.length?await (supabaseAdmin as any).from("profiles").select("id,email,full_name").in("id",ids):{data:[]};
 const p=new Map((profiles??[]).map((x:any)=>[x.id,x]));
 return {organization:org,currentRole:member.role,members:(members??[]).map((m:any)=>({...m,profile:p.get(m.user_id)??null})),invitations:invites??[],channels:channels??[],audit:audit??[]};
});

export const createWorkspaceInvitation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:{organizationId:string;email:string;role:"admin"|"editor"|"analyst"})=>d).handler(async({data})=>{
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server"); const token=randomBytes(32).toString("base64url"); const expires=new Date(Date.now()+7*86400000).toISOString();
 const {data:id,error}=await (supabaseAdmin as any).rpc("phase12_create_invitation",{p_org:data.organizationId,p_email:data.email,p_role:data.role,p_token_hash:hash(token),p_expires_at:expires}); if(error)throw error;
 return {id,token,expiresAt:expires};
});
export const acceptWorkspaceInvitation=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:{token:string})=>d).handler(async({context,data})=>{
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server"); const {data:profile}=await (supabaseAdmin as any).from("profiles").select("email").eq("id",context.userId).maybeSingle(); if(!profile?.email)throw new Error("Account email unavailable");
 const {data:org,error}=await (supabaseAdmin as any).rpc("phase12_accept_invitation",{p_token_hash:hash(data.token),p_user_email:profile.email}); if(error)throw error; return {organizationId:org};
});
export const updateWorkspaceMemberRole=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:{organizationId:string;userId:string;role:"admin"|"editor"|"analyst"})=>d).handler(async({data})=>{const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const {error}=await (supabaseAdmin as any).rpc("phase12_set_member_role",{p_org:data.organizationId,p_user:data.userId,p_role:data.role});if(error)throw error;return {ok:true};});
export const removeWorkspaceMember=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:{organizationId:string;userId:string})=>d).handler(async({data})=>{const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const {error}=await (supabaseAdmin as any).rpc("phase12_remove_member",{p_org:data.organizationId,p_user:data.userId});if(error)throw error;return {ok:true};});
