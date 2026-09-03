import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

async function ownedConnection(userId:string,id?:string){
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 let q=(supabaseAdmin as any).from("youtube_connections").select("*").eq("user_id",userId).eq("is_connected",true);
 if(id)q=q.eq("id",id);else q=q.order("created_at",{ascending:false}).limit(1);
 const {data,error}=await q.maybeSingle();if(error||!data)throw new Error("No connected YouTube channel");
 return data;
}
async function token(conn:any){const mod=await import("@/lib/youtube-upload.functions");return mod.getFreshYouTubeAccessTokenForIntelligence(conn);}

export const getYouTubePublishingData=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{connectionId?:string;regionCode?:string})=>d).handler(async({data,context})=>{
 const conn=await ownedConnection(context.userId,data.connectionId);const access=await token(conn);
 const {listYouTubeCategories,listYouTubePlaylists,fetchChannelSnapshot,recommendedPublishHours}=await import("@/lib/youtube-intelligence.server");
 const [categories,playlists,channel]=await Promise.all([listYouTubeCategories(access,data.regionCode||"US"),listYouTubePlaylists(access),fetchChannelSnapshot(access)]);
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const perf=await (supabaseAdmin as any).from("youtube_video_performance").select("captured_at,views").eq("connection_id",conn.id).order("captured_at",{ascending:false}).limit(500);
 return {connection:{id:conn.id,channelName:conn.channel_name,audienceTimezone:conn.audience_timezone||"UTC",defaults:conn.upload_defaults_json||{}},categories,playlists,channel,recommendedUtcHours:recommendedPublishHours(perf.data??[])};
});

export const saveYouTubeUploadDefaults=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{connectionId:string;audienceTimezone:string;defaults:any})=>d).handler(async({data,context})=>{
 const conn=await ownedConnection(context.userId,data.connectionId);
 const defaults={privacy:["private","unlisted","public"].includes(data.defaults?.privacy)?data.defaults.privacy:"private",categoryId:String(data.defaults?.categoryId||""),playlistId:String(data.defaults?.playlistId||""),language:String(data.defaults?.language||"").slice(0,35),madeForKids:Boolean(data.defaults?.madeForKids),titleTemplate:String(data.defaults?.titleTemplate||"{{title}}").slice(0,500),descriptionTemplate:String(data.defaults?.descriptionTemplate||"{{description}}").slice(0,8000),hashtagMax:Math.max(0,Math.min(15,Number(data.defaults?.hashtagMax??5))),appendHashtags:data.defaults?.appendHashtags!==false};
 const tz=String(data.audienceTimezone||"UTC").slice(0,80);
 try{new Intl.DateTimeFormat("en",{timeZone:tz}).format();}catch{throw new Error("Invalid audience timezone");}
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const {error}=await (supabaseAdmin as any).from("youtube_connections").update({audience_timezone:tz,upload_defaults_json:defaults,updated_at:new Date().toISOString()}).eq("id",conn.id).eq("user_id",context.userId);
 if(error)throw new Error(error.message);return {ok:true,defaults};
});

export const syncYouTubeAnalytics=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{connectionId?:string})=>d).handler(async({data,context})=>{
 const conn=await ownedConnection(context.userId,data.connectionId),access=await token(conn);
 const {fetchChannelSnapshot,fetchVideoStats}=await import("@/lib/youtube-intelligence.server");
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const channel=await fetchChannelSnapshot(access);
 await (supabaseAdmin as any).from("youtube_channel_snapshots").insert({user_id:context.userId,connection_id:conn.id,subscribers:channel.subscribers,views:channel.views,videos:channel.videos});
 const items=await (supabaseAdmin as any).from("campaign_items").select("id,youtube_video_id,campaign_id,content_json,seo_json,youtube_publish_at,schedule_at").eq("user_id",context.userId).not("youtube_video_id","is",null).limit(500);
 const map=new Map((items.data??[]).map((r:any)=>[r.youtube_video_id,r]));
 const stats=await fetchVideoStats(access,[...map.keys()]);
 const campaignIds=[...new Set((items.data??[]).map((r:any)=>r.campaign_id).filter(Boolean))];
 const campaigns=campaignIds.length?await (supabaseAdmin as any).from("campaigns").select("id,name,template_id").in("id",campaignIds):{data:[]};
 const campaignMap=new Map((campaigns.data??[]).map((r:any)=>[r.id,r]));
 const {inferAttribution}=await import("@/lib/analytics-intelligence");
 const startDate=new Date(Date.now()-90*86_400_000).toISOString().slice(0,10),endDate=new Date().toISOString().slice(0,10);
 const {fetchYouTubeAnalyticsReport}=await import("@/lib/youtube-intelligence.server");
 let report:any[]=[];try{report=await fetchYouTubeAnalyticsReport(access,startDate,endDate);}catch{/* Data API snapshots still work without Analytics API access */}
 const reportMap=new Map(report.map((r:any)=>[String(r.video),r]));
 if(stats.length)await (supabaseAdmin as any).from("youtube_video_performance").insert(stats.map((v:any)=>{
   const item=map.get(v.id),campaign=item?campaignMap.get(item.campaign_id):null,attr=inferAttribution(item?.content_json,item?.seo_json),deep=reportMap.get(v.id);
   const avgPct=deep?.averageViewPercentage==null?null:Number(deep.averageViewPercentage)/100;
   return {user_id:context.userId,connection_id:conn.id,campaign_item_id:item?.id??null,youtube_video_id:v.id,
     views:Number(deep?.views??v.statistics?.viewCount??0),likes:Number(deep?.likes??v.statistics?.likeCount??0),comments:Number(deep?.comments??v.statistics?.commentCount??0),
     estimated_minutes_watched:deep?.estimatedMinutesWatched==null?null:Number(deep.estimatedMinutesWatched),
     average_view_duration_seconds:deep?.averageViewDuration==null?null:Number(deep.averageViewDuration),
     subscribers_gained:deep?.subscribersGained==null?null:Number(deep.subscribersGained),
     retention_proxy:avgPct,first_3s_proxy:null,ctr:null,impressions:null,
     upload_time:item?.youtube_publish_at??item?.schedule_at??null,template_id:campaign?.template_id??null,campaign_id:item?.campaign_id??null,
     hook:attr.hook,cta:attr.cta,topic:attr.topic,variant:attr.variant,
     metadata_json:{source:deep?"youtube-analytics+data":"youtube-data",average_view_percentage:deep?.averageViewPercentage??null},
   };
 }));
 await (supabaseAdmin as any).from("youtube_connections").update({analytics_last_synced_at:new Date().toISOString()}).eq("id",conn.id);
 return {ok:true,channel,videos:stats.length};
});

export const repairFailedYouTubeUpload=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{itemId:string})=>d).handler(async({data,context})=>{
 const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
 const {data:item}=await (supabaseAdmin as any).from("campaign_items").select("id,user_id,status,youtube_video_id,active_upload_attempt_id").eq("id",data.itemId).eq("user_id",context.userId).maybeSingle();
 if(!item)throw new Error("Campaign item not found");
 if(item.youtube_video_id)throw new Error("This item already has a YouTube video ID; reconcile it instead of re-uploading.");
 if(item.active_upload_attempt_id)throw new Error("An upload attempt is still active");
 if(item.status!=="failed")throw new Error("Only failed uploads can be repaired");
 const attempt=await (supabaseAdmin as any).from("upload_attempts").select("id,youtube_video_id").eq("campaign_item_id",item.id).not("youtube_video_id","is",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(attempt.data?.youtube_video_id)throw new Error(`YouTube side effect exists (${attempt.data.youtube_video_id}); run reconciliation to avoid a duplicate.`);
 const {error}=await (supabaseAdmin as any).from("campaign_items").update({status:"upload_pending",error_message:null}).eq("id",item.id).eq("user_id",context.userId);
 if(error)throw new Error(error.message);return {ok:true};
});
