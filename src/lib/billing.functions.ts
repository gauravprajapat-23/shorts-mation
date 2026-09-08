import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeCheckout, createStripePortal, type BillingPlanKey } from "@/lib/billing.server";

function origin(){const u=new URL(getRequest().url);return process.env.PUBLIC_APP_URL?.replace(/\/$/,"") || `${u.protocol}//${u.host}`;}
export const getBillingOverview=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:Record<string,never>)=>d).handler(async({context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as any).rpc("phase11_sync_entitlements",{p_user_id:context.userId});
  const [plans,sub,entitlement,policy,usage,invoices,customer,credit]=await Promise.all([
    (supabaseAdmin as any).from("billing_plans").select("*").eq("active",true).order("sort_order"),
    (supabaseAdmin as any).from("tenant_subscriptions").select("*").eq("user_id",context.userId).maybeSingle(),
    (supabaseAdmin as any).rpc("phase11_effective_plan",{p_user_id:context.userId}),
    (supabaseAdmin as any).rpc("phase10_policy",{p_user_id:context.userId}),
    (supabaseAdmin as any).from("capacity_usage_events").select("event_type,units,cost_usd,created_at").eq("user_id",context.userId).gte("created_at",new Date(new Date().setUTCDate(1)).toISOString()),
    (supabaseAdmin as any).from("billing_invoices").select("*").eq("user_id",context.userId).order("created_at",{ascending:false}).limit(12),
    (supabaseAdmin as any).from("billing_customers").select("provider_customer_id").eq("user_id",context.userId).maybeSingle(),
    (supabaseAdmin as any).rpc("phase11_credit_balance",{p_user_id:context.userId}),
  ]);
  const rows=usage.data??[]; const today=new Date();today.setUTCHours(0,0,0,0); const daily=rows.filter((r:any)=>new Date(r.created_at)>=today);
  const sum=(rs:any[],type:string,key:"units"|"cost_usd")=>rs.filter(r=>r.event_type===type).reduce((n,r)=>n+Number(r[key]||0),0);
  return {plans:plans.data??[],subscription:sub.data??null,entitlement:entitlement.data,policy:policy.data,customerId:customer.data?.provider_customer_id??null,creditBalanceCents:Number(credit.data??0),invoices:invoices.data??[],usage:{today:{renders:sum(daily,"render_submitted","units"),renderCostUsd:sum(daily,"render_submitted","cost_usd"),publishes:sum(daily,"publish_completed","units")},month:{renders:sum(rows,"render_submitted","units"),renderCostUsd:sum(rows,"render_submitted","cost_usd"),publishes:sum(rows,"publish_completed","units")}}};
});
export const startCheckout=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:{plan:BillingPlanKey;interval:"month"|"year"})=>d).handler(async({context,data})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server"); const {data:profile}=await (supabaseAdmin as any).from("profiles").select("email").eq("id",context.userId).maybeSingle(); const base=origin();
  return createStripeCheckout({userId:context.userId,email:profile?.email,plan:data.plan,interval:data.interval,successUrl:`${base}/billing?checkout=success`,cancelUrl:`${base}/billing?checkout=cancelled`});
});
export const openBillingPortal=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:Record<string,never>)=>d).handler(async({context})=>{
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server"); const {data}=await (supabaseAdmin as any).from("billing_customers").select("provider_customer_id").eq("user_id",context.userId).maybeSingle(); if(!data?.provider_customer_id)throw new Error("No billing customer exists yet"); return createStripePortal({customerId:data.provider_customer_id,returnUrl:`${origin()}/billing`});
});
export const setEntitlementOverride=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).validator((d:{userId:string;planKey?:BillingPlanKey|null;overrides?:Record<string,number>;reason:string;expiresAt?:string|null})=>d).handler(async({context,data})=>{
 const admins=String(process.env.OPS_USER_IDS??"").split(",").map(x=>x.trim()).filter(Boolean); if(!admins.includes(context.userId))throw new Error("Admin access required"); const {supabaseAdmin}=await import("@/integrations/supabase/client.server"); await (supabaseAdmin as any).from("entitlement_overrides").insert({user_id:data.userId,plan_key:data.planKey??null,overrides_json:data.overrides??{},reason:data.reason,expires_at:data.expiresAt??null,created_by:context.userId}); await (supabaseAdmin as any).rpc("phase11_sync_entitlements",{p_user_id:data.userId}); return {ok:true};
});
