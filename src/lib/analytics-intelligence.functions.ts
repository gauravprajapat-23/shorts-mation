import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

export const getWinningTemplateAnalytics=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{days?:number})=>d).handler(async({data,context})=>{
 const days=Math.max(7,Math.min(365,Math.floor(data.days??90)));
 const since=new Date(Date.now()-days*86_400_000).toISOString();
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const perf=await (supabaseAdmin as any).from("youtube_video_performance")
  .select("campaign_item_id,youtube_video_id,views,likes,comments,impressions,ctr,retention_proxy,first_3s_proxy,upload_time,template_id,campaign_id,hook,cta,topic,variant,captured_at")
  .eq("user_id",context.userId).gte("captured_at",since).order("captured_at",{ascending:false}).limit(5000);
 if(perf.error)throw new Error(perf.error.message);
 const latest:any[]=[];const seen=new Set<string>();
 for(const row of perf.data??[]){const key=row.campaign_item_id||row.youtube_video_id;if(seen.has(key))continue;seen.add(key);latest.push(row);}
 const templateIds=[...new Set(latest.map(r=>r.template_id).filter(Boolean))],campaignIds=[...new Set(latest.map(r=>r.campaign_id).filter(Boolean))];
 const [templates,campaigns]=await Promise.all([
  templateIds.length?(supabaseAdmin as any).from("templates").select("id,name").in("id",templateIds):Promise.resolve({data:[]}),
  campaignIds.length?(supabaseAdmin as any).from("campaigns").select("id,name").in("id",campaignIds):Promise.resolve({data:[]}),
 ]);
 const tm=new Map((templates.data??[]).map((r:any)=>[r.id,r.name])),cm=new Map((campaigns.data??[]).map((r:any)=>[r.id,r.name]));
 const observations=latest.map(r=>({
  campaignItemId:String(r.campaign_item_id??r.youtube_video_id),youtubeVideoId:String(r.youtube_video_id),
  templateId:r.template_id,templateName:tm.get(r.template_id)??null,campaignId:r.campaign_id,campaignName:cm.get(r.campaign_id)??null,
  views:Number(r.views??0),likes:Number(r.likes??0),comments:Number(r.comments??0),impressions:r.impressions==null?null:Number(r.impressions),
  ctr:r.ctr==null?null:Number(r.ctr),retentionProxy:r.retention_proxy==null?null:Number(r.retention_proxy),first3sProxy:r.first_3s_proxy==null?null:Number(r.first_3s_proxy),
  uploadTime:r.upload_time,hook:r.hook,cta:r.cta,topic:r.topic,variant:r.variant,
 }));
 const {analyzeWinningContent}=await import("@/lib/analytics-intelligence");
 const analysis=analyzeWinningContent(observations);
 return {days,analysis,observations:observations.sort((a,b)=>b.views-a.views).slice(0,100)};
});

export const saveWinningRecommendations=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{days?:number})=>d).handler(async({data,context})=>{
 const result=await getWinningTemplateAnalyticsInternal(context.userId,Math.max(7,Math.min(365,Math.floor(data.days??90))));
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const {analysis}=result;
 const {data:run,error}=await (supabaseAdmin as any).from("analytics_recommendation_runs").insert({
  user_id:context.userId,sample_size:analysis.sampleSize,best_template_id:analysis.bestTemplate?.key??null,
  best_upload_hour:analysis.bestUploadTime?Number(analysis.bestUploadTime.key):null,best_hook:analysis.bestHook?.key??null,
  recommendations_json:analysis.recommendations,summary_json:analysis,
 }).select("id").single();
 if(error)throw new Error(error.message);return {id:run.id,...result};
});

async function getWinningTemplateAnalyticsInternal(userId:string,days:number){
 const since=new Date(Date.now()-days*86_400_000).toISOString();
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const {data,error}=await (supabaseAdmin as any).from("youtube_video_performance").select("*").eq("user_id",userId).gte("captured_at",since).order("captured_at",{ascending:false}).limit(5000);
 if(error)throw new Error(error.message);
 const seen=new Set<string>(),latest:any[]=[];for(const r of data??[]){const k=r.campaign_item_id||r.youtube_video_id;if(seen.has(k))continue;seen.add(k);latest.push(r);}
 const templateIds=[...new Set(latest.map(r=>r.template_id).filter(Boolean))],campaignIds=[...new Set(latest.map(r=>r.campaign_id).filter(Boolean))];
 const [templates,campaigns]=await Promise.all([templateIds.length?(supabaseAdmin as any).from("templates").select("id,name").in("id",templateIds):Promise.resolve({data:[]}),campaignIds.length?(supabaseAdmin as any).from("campaigns").select("id,name").in("id",campaignIds):Promise.resolve({data:[]})]);
 const tm=new Map((templates.data??[]).map((r:any)=>[r.id,r.name])),cm=new Map((campaigns.data??[]).map((r:any)=>[r.id,r.name]));
 const observations=latest.map(r=>({campaignItemId:String(r.campaign_item_id??r.youtube_video_id),youtubeVideoId:String(r.youtube_video_id),templateId:r.template_id,templateName:tm.get(r.template_id)??null,campaignId:r.campaign_id,campaignName:cm.get(r.campaign_id)??null,views:Number(r.views??0),likes:Number(r.likes??0),comments:Number(r.comments??0),impressions:r.impressions==null?null:Number(r.impressions),ctr:r.ctr==null?null:Number(r.ctr),retentionProxy:r.retention_proxy==null?null:Number(r.retention_proxy),first3sProxy:r.first_3s_proxy==null?null:Number(r.first_3s_proxy),uploadTime:r.upload_time,hook:r.hook,cta:r.cta,topic:r.topic,variant:r.variant}));
 const {analyzeWinningContent}=await import("@/lib/analytics-intelligence");return {days,analysis:analyzeWinningContent(observations),observations};
}
