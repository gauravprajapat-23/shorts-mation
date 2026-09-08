import { createHmac, timingSafeEqual } from "node:crypto";

export type BillingPlanKey = "free" | "starter" | "pro" | "business";
const stripeBase = "https://api.stripe.com/v1";
function stripeSecret() { const v=process.env.STRIPE_SECRET_KEY; if(!v) throw new Error("STRIPE_SECRET_KEY is not configured"); return v; }
function priceFor(plan:BillingPlanKey, interval:"month"|"year") {
  if(plan==="free") return null;
  const key=`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
  const value=process.env[key]; if(!value) throw new Error(`${key} is not configured`); return value;
}
function planFromPrice(priceId?:string|null):BillingPlanKey {
  if(!priceId) return "free";
  for(const plan of ["starter","pro","business"] as const) for(const interval of ["month","year"] as const) if(process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`]===priceId) return plan;
  return "free";
}
function intervalFromPrice(priceId?:string|null):"month"|"year" { return priceId && ["starter","pro","business"].some(p=>process.env[`STRIPE_PRICE_${p.toUpperCase()}_YEAR`]===priceId) ? "year":"month"; }
async function stripe(path:string, body:URLSearchParams) {
  const r=await fetch(`${stripeBase}${path}`,{method:"POST",headers:{Authorization:`Bearer ${stripeSecret()}`,"Content-Type":"application/x-www-form-urlencoded"},body});
  const json=await r.json() as any; if(!r.ok) throw new Error(json?.error?.message ?? `Stripe request failed (${r.status})`); return json;
}
export async function createStripeCheckout(input:{userId:string;email?:string|null;plan:BillingPlanKey;interval:"month"|"year";successUrl:string;cancelUrl:string}) {
  const price=priceFor(input.plan,input.interval); if(!price) throw new Error("Free plan does not require checkout");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data:customer}=await (supabaseAdmin as any).from("billing_customers").select("provider_customer_id").eq("user_id",input.userId).maybeSingle();
  const b=new URLSearchParams({mode:"subscription",success_url:input.successUrl,cancel_url:input.cancelUrl,"line_items[0][price]":price,"line_items[0][quantity]":"1",client_reference_id:input.userId,"metadata[user_id]":input.userId,"metadata[plan_key]":input.plan,"subscription_data[metadata][user_id]":input.userId,"subscription_data[metadata][plan_key]":input.plan});
  if(customer?.provider_customer_id)b.set("customer",customer.provider_customer_id); else if(input.email)b.set("customer_email",input.email);
  const session=await stripe("/checkout/sessions",b); return {url:String(session.url),id:String(session.id)};
}
export async function createStripePortal(input:{customerId:string;returnUrl:string}) { const r=await stripe("/billing_portal/sessions",new URLSearchParams({customer:input.customerId,return_url:input.returnUrl})); return {url:String(r.url)}; }
export async function changeStripeSubscription(input:{subscriptionId:string;subscriptionItemId:string;plan:BillingPlanKey;interval:"month"|"year"}) {
  const price=priceFor(input.plan,input.interval); if(!price) throw new Error("Use cancellation to return to Free");
  return stripe(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`,new URLSearchParams({[`items[0][id]`]:input.subscriptionItemId,[`items[0][price]`]:price,proration_behavior:"create_prorations",payment_behavior:"pending_if_incomplete"}));
}
export function verifyStripeWebhook(raw:string, signature:string, secret=process.env.STRIPE_WEBHOOK_SECRET ?? "") {
  if(!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  const parts=Object.fromEntries(signature.split(",").map(x=>x.split("=",2) as [string,string])); const ts=parts.t; const v1=parts.v1; if(!ts||!v1) return false;
  if(Math.abs(Date.now()/1000-Number(ts))>300) return false;
  const expected=createHmac("sha256",secret).update(`${ts}.${raw}`).digest("hex");
  const a=Buffer.from(expected),b=Buffer.from(v1); return a.length===b.length && timingSafeEqual(a,b);
}
function isoFromUnix(v:any){return v?new Date(Number(v)*1000).toISOString():null;}
export async function processStripeWebhook(event:any) {
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const inserted=await (supabaseAdmin as any).from("billing_webhook_events").insert({provider_event_id:event.id,event_type:event.type,payload_json:event,status:"received"});
  if(inserted.error?.code==="23505") return {duplicate:true}; if(inserted.error) throw inserted.error;
  try {
    const obj=event.data?.object ?? {}; let userId:string|undefined=obj.metadata?.user_id || obj.client_reference_id;
    if(!userId && obj.customer){const q=await (supabaseAdmin as any).from("billing_customers").select("user_id").eq("provider_customer_id",String(obj.customer)).maybeSingle(); userId=q.data?.user_id;}
    if(event.type==="checkout.session.completed" && userId){ await (supabaseAdmin as any).from("billing_customers").upsert({user_id:userId,provider_customer_id:String(obj.customer),email:obj.customer_details?.email ?? null,updated_at:new Date().toISOString()},{onConflict:"user_id"}); }
    if(event.type.startsWith("customer.subscription.") && userId){
      const priceId=obj.items?.data?.[0]?.price?.id ?? null; const status=String(obj.status ?? (event.type.endsWith("deleted")?"canceled":"active")); const graceHours=Math.max(0,Number(process.env.BILLING_GRACE_HOURS ?? 72));
      const graceUntil=status==="past_due"?new Date(Date.now()+graceHours*3600000).toISOString():null;
      await (supabaseAdmin as any).from("tenant_subscriptions").upsert({user_id:userId,provider_subscription_id:String(obj.id),provider_customer_id:String(obj.customer ?? ""),provider_price_id:priceId,plan_key:planFromPrice(priceId),billing_interval:intervalFromPrice(priceId),status:event.type.endsWith("deleted")?"canceled":status,cancel_at_period_end:Boolean(obj.cancel_at_period_end),current_period_start:isoFromUnix(obj.current_period_start),current_period_end:isoFromUnix(obj.current_period_end),trial_end:isoFromUnix(obj.trial_end),grace_until:graceUntil,ended_at:isoFromUnix(obj.ended_at),metadata_json:obj.metadata ?? {},updated_at:new Date().toISOString()},{onConflict:"user_id"});
      await (supabaseAdmin as any).rpc("phase11_sync_entitlements",{p_user_id:userId});
    }
    if(event.type.startsWith("invoice.") && userId){
      await (supabaseAdmin as any).from("billing_invoices").upsert({provider_invoice_id:String(obj.id),user_id:userId,provider_customer_id:String(obj.customer ?? ""),provider_subscription_id:obj.subscription?String(obj.subscription):null,status:String(obj.status ?? event.type.replace("invoice.","")),currency:String(obj.currency ?? "usd"),amount_due_cents:Number(obj.amount_due ?? 0),amount_paid_cents:Number(obj.amount_paid ?? 0),amount_remaining_cents:Number(obj.amount_remaining ?? 0),invoice_url:obj.hosted_invoice_url ?? null,invoice_pdf_url:obj.invoice_pdf ?? null,period_start:isoFromUnix(obj.period_start),period_end:isoFromUnix(obj.period_end),due_at:isoFromUnix(obj.due_date),paid_at:isoFromUnix(obj.status_transitions?.paid_at),updated_at:new Date().toISOString()},{onConflict:"provider_invoice_id"});
      if(event.type==="invoice.payment_failed"){await (supabaseAdmin as any).from("tenant_subscriptions").update({status:"past_due",grace_until:new Date(Date.now()+Math.max(0,Number(process.env.BILLING_GRACE_HOURS ?? 72))*3600000).toISOString(),updated_at:new Date().toISOString()}).eq("user_id",userId); await (supabaseAdmin as any).rpc("phase11_sync_entitlements",{p_user_id:userId});}
    }
    await (supabaseAdmin as any).from("billing_webhook_events").update({status:"processed",processed_at:new Date().toISOString()}).eq("provider_event_id",event.id); return {processed:true};
  } catch(error){await (supabaseAdmin as any).from("billing_webhook_events").update({status:"failed",error_text:error instanceof Error?error.message:String(error),processed_at:new Date().toISOString()}).eq("provider_event_id",event.id); throw error;}
}
