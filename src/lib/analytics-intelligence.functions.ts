import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

const DAY=86_400_000;

type DashboardInput={
  days?:number;
  page?:number;
  pageSize?:number;
  search?:string;
  sort?:"views"|"likes"|"comments"|"engagement"|"retention"|"ctr"|"watchTime"|"uploadTime";
  direction?:"asc"|"desc";
  templateId?:string;
  campaignId?:string;
};

async function pagedQuery(queryFactory:(from:number,to:number)=>PromiseLike<{data:any[]|null;error:any}>,max=50_000){
  const rows:any[]=[];
  for(let from=0;from<max;from+=1000){
    const {data,error}=await queryFactory(from,from+999);
    if(error)throw new Error(error.message);
    rows.push(...(data??[]));
    if((data??[]).length<1000)break;
  }
  return rows;
}

function latestPerVideo(rows:any[]){
  const seen=new Set<string>();
  const out:any[]=[];
  for(const row of rows){
    const key=String(row.campaign_item_id??row.youtube_video_id??"");
    if(!key||seen.has(key))continue;
    seen.add(key);out.push(row);
  }
  return out;
}

function rate(n:number,d:number){return d>0?n/d:0;}
function avg(values:Array<number|null|undefined>){const v=values.filter((x):x is number=>x!=null&&Number.isFinite(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;}

function groupBreakdown(rows:any[],key:(r:any)=>string|null|undefined,label:(key:string,r:any)=>string=key=>key){
  const groups=new Map<string,any[]>();
  for(const row of rows){const k=key(row)?.trim();if(!k)continue;groups.set(k,[...(groups.get(k)??[]),row]);}
  return [...groups.entries()].map(([k,list])=>({
    key:k,label:label(k,list[0]),videos:list.length,
    views:list.reduce((s,r)=>s+r.views,0),
    likes:list.reduce((s,r)=>s+r.likes,0),
    comments:list.reduce((s,r)=>s+r.comments,0),
    engagementRate:avg(list.map(r=>r.engagementRate))??0,
    retention:avg(list.map(r=>r.retentionProxy)),
    ctr:avg(list.map(r=>r.ctr)),
    watchMinutes:list.reduce((s,r)=>s+(r.watchMinutes??0),0),
  })).sort((a,b)=>b.views-a.views);
}

function localHour(iso:string|null|undefined,timeZone:string){
  if(!iso)return null;
  const d=new Date(iso);if(!Number.isFinite(d.getTime()))return null;
  try{return Number(new Intl.DateTimeFormat("en-US",{timeZone,hour:"2-digit",hour12:false}).format(d).replace(/\D/g,""))%24;}
  catch{return d.getUTCHours();}
}

function buildInsights(rows:any[],overview:any){
  const insights:Array<{severity:"good"|"watch"|"action";title:string;detail:string;action:string}>=[];
  if(!rows.length)return [{severity:"watch" as const,title:"Not enough published data",detail:"Sync several published videos before optimization recommendations become reliable.",action:"Publish and sync at least 5–10 videos."}];
  if(overview.avgRetention!=null){
    if(overview.avgRetention<.45)insights.push({severity:"action",title:"Retention needs attention",detail:`Average view percentage is ${(overview.avgRetention*100).toFixed(1)}%.`,action:"Shorten intros, show the payoff in the first second, and move the first pattern interrupt earlier."});
    else if(overview.avgRetention>=.65)insights.push({severity:"good",title:"Retention is a strength",detail:`Average view percentage is ${(overview.avgRetention*100).toFixed(1)}%.`,action:"Keep the winning pacing and test new topics without changing the opening rhythm too much."});
  }
  if(overview.engagementRate<.02)insights.push({severity:"action",title:"Increase interaction",detail:`Weighted engagement is ${(overview.engagementRate*100).toFixed(2)}%.`,action:"Test a clearer comment question, stronger CTA, and fan/challenge framing near the ending."});
  if(overview.avgCtr!=null&&overview.avgCtr<.04)insights.push({severity:"action",title:"Packaging can improve",detail:`Average available CTR is ${(overview.avgCtr*100).toFixed(2)}%.`,action:"Test more readable thumbnails/titles and make the promise obvious without repeating the full video premise."});
  const highRetentionLowViews=rows.filter(r=>r.retentionProxy!=null&&r.retentionProxy>=.65&&r.views<overview.medianViews).sort((a,b)=>b.retentionProxy-a.retentionProxy)[0];
  if(highRetentionLowViews)insights.push({severity:"watch",title:"Good video, weak distribution",detail:`“${highRetentionLowViews.title}” retains well but has below-median views.`,action:"Reuse its content structure with a stronger title/topic/thumbnail and publish-time test."});
  const highViewsLowRetention=rows.filter(r=>r.views>=overview.medianViews&&r.retentionProxy!=null&&r.retentionProxy<.45).sort((a,b)=>b.views-a.views)[0];
  if(highViewsLowRetention)insights.push({severity:"watch",title:"Strong hook, weak hold",detail:`“${highViewsLowRetention.title}” earned views but lost viewers faster than the channel average.`,action:"Keep its hook/topic, but shorten setup and introduce the result/challenge sooner."});
  return insights.slice(0,6);
}

async function buildDashboard(userId:string,input:DashboardInput){
  const days=Math.max(7,Math.min(3650,Math.floor(input.days??90)));
  const since=new Date(Date.now()-days*DAY).toISOString();
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");

  const {data:connection}=await (supabaseAdmin as any).from("youtube_connections")
    .select("id,channel_name,channel_id,channel_avatar,audience_timezone,analytics_last_synced_at")
    .eq("user_id",userId).eq("is_connected",true).order("created_at",{ascending:false}).limit(1).maybeSingle();

  const perf=await pagedQuery((from,to)=>(supabaseAdmin as any).from("youtube_video_performance")
    .select("campaign_item_id,youtube_video_id,views,likes,comments,impressions,ctr,retention_proxy,first_3s_proxy,estimated_minutes_watched,average_view_duration_seconds,subscribers_gained,upload_time,template_id,campaign_id,hook,cta,topic,variant,captured_at,metadata_json")
    .eq("user_id",userId).gte("captured_at",since).order("captured_at",{ascending:false}).range(from,to));
  const latest=latestPerVideo(perf);

  const itemIds=[...new Set(latest.map(r=>r.campaign_item_id).filter(Boolean))];
  const items:any[]=[];
  for(let i=0;i<itemIds.length;i+=500){
    const {data,error}=await (supabaseAdmin as any).from("campaign_items")
      .select("id,video_file_name,seo_json,youtube_url,youtube_video_id,status,schedule_at,youtube_publish_at")
      .in("id",itemIds.slice(i,i+500));
    if(error)throw new Error(error.message);items.push(...(data??[]));
  }
  const itemMap=new Map(items.map(r=>[r.id,r]));

  const templateIds=[...new Set(latest.map(r=>r.template_id).filter(Boolean))];
  const campaignIds=[...new Set(latest.map(r=>r.campaign_id).filter(Boolean))];
  const [templates,campaigns,snapshotsResult]=await Promise.all([
    templateIds.length?(supabaseAdmin as any).from("templates").select("id,name").in("id",templateIds):Promise.resolve({data:[]}),
    campaignIds.length?(supabaseAdmin as any).from("campaigns").select("id,name").in("id",campaignIds):Promise.resolve({data:[]}),
    connection?.id?(supabaseAdmin as any).from("youtube_channel_snapshots").select("subscribers,views,videos,captured_at").eq("connection_id",connection.id).gte("captured_at",since).order("captured_at",{ascending:true}).limit(2000):Promise.resolve({data:[]}),
  ]);
  const templateMap=new Map((templates.data??[]).map((r:any)=>[r.id,r.name]));
  const campaignMap=new Map((campaigns.data??[]).map((r:any)=>[r.id,r.name]));

  const allVideos=latest.map(r=>{
    const item=itemMap.get(r.campaign_item_id);const seo=item?.seo_json??{};
    const views=Number(r.views??0),likes=Number(r.likes??0),comments=Number(r.comments??0);
    return {
      campaignItemId:String(r.campaign_item_id??r.youtube_video_id),youtubeVideoId:String(r.youtube_video_id),
      title:String(seo.title??item?.video_file_name??r.metadata_json?.video_title??r.topic??r.youtube_video_id),youtubeUrl:item?.youtube_url??`https://youtube.com/watch?v=${r.youtube_video_id}`,
      thumbnailUrl:r.metadata_json?.thumbnail_url??null,
      status:item?.status??null,templateId:r.template_id,templateName:templateMap.get(r.template_id)??null,
      campaignId:r.campaign_id,campaignName:campaignMap.get(r.campaign_id)??null,
      views,likes,comments,engagementRate:rate(likes+comments*2,views),
      impressions:r.impressions==null?null:Number(r.impressions),ctr:r.ctr==null?null:Number(r.ctr),
      retentionProxy:r.retention_proxy==null?null:Number(r.retention_proxy),first3sProxy:r.first_3s_proxy==null?null:Number(r.first_3s_proxy),
      watchMinutes:r.estimated_minutes_watched==null?null:Number(r.estimated_minutes_watched),
      avgViewDuration:r.average_view_duration_seconds==null?null:Number(r.average_view_duration_seconds),
      subscribersGained:r.subscribers_gained==null?null:Number(r.subscribers_gained),
      uploadTime:r.upload_time??item?.youtube_publish_at??item?.schedule_at??null,
      hook:r.hook??null,cta:r.cta??null,topic:r.topic??null,variant:r.variant??null,capturedAt:r.captured_at,
    };
  });

  const sortedViews=[...allVideos].map(v=>v.views).sort((a,b)=>a-b);
  const medianViews=sortedViews.length?sortedViews[Math.floor(sortedViews.length/2)]??0:0;
  const overview={
    trackedVideos:allVideos.length,totalViews:allVideos.reduce((s,r)=>s+r.views,0),totalLikes:allVideos.reduce((s,r)=>s+r.likes,0),
    totalComments:allVideos.reduce((s,r)=>s+r.comments,0),watchMinutes:allVideos.reduce((s,r)=>s+(r.watchMinutes??0),0),
    subscribersGained:allVideos.reduce((s,r)=>s+(r.subscribersGained??0),0),
    engagementRate:allVideos.length?allVideos.reduce((s,r)=>s+r.engagementRate,0)/allVideos.length:0,
    avgRetention:avg(allVideos.map(r=>r.retentionProxy)),avgCtr:avg(allVideos.map(r=>r.ctr)),avgViewDuration:avg(allVideos.map(r=>r.avgViewDuration)),
    retentionCoverage:allVideos.filter(r=>r.retentionProxy!=null).length,ctrCoverage:allVideos.filter(r=>r.ctr!=null).length,watchCoverage:allVideos.filter(r=>r.watchMinutes!=null).length,
    medianViews,
  };

  const timezone=connection?.audience_timezone||"UTC";
  const hourRows=allVideos.map(r=>({...r,uploadHour:localHour(r.uploadTime,timezone)}));
  const uploadHours=groupBreakdown(hourRows,r=>r.uploadHour==null?null:String(r.uploadHour),k=>`${String(Number(k)).padStart(2,"0")}:00`).sort((a,b)=>b.engagementRate-a.engagementRate||b.views-a.views);
  const templatesBreakdown=groupBreakdown(allVideos,r=>r.templateId,k=>templateMap.get(k)??k).slice(0,10);
  const campaignsBreakdown=groupBreakdown(allVideos,r=>r.campaignId,k=>campaignMap.get(k)??k).slice(0,10);
  const topicsBreakdown=groupBreakdown(allVideos,r=>r.topic).slice(0,12);

  const snapshots=(snapshotsResult.data??[]).map((s:any)=>({capturedAt:s.captured_at,subscribers:Number(s.subscribers??0),views:Number(s.views??0),videos:Number(s.videos??0)}));
  const firstSnap=snapshots[0]??null,lastSnap=snapshots[snapshots.length-1]??null;
  const channel={
    id:connection?.channel_id??null,name:connection?.channel_name??"YouTube channel",avatar:connection?.channel_avatar??null,timezone,lastSyncedAt:connection?.analytics_last_synced_at??null,
    subscribers:lastSnap?.subscribers??null,views:lastSnap?.views??null,videos:lastSnap?.videos??null,
    subscriberDelta:firstSnap&&lastSnap?lastSnap.subscribers-firstSnap.subscribers:null,
    viewDelta:firstSnap&&lastSnap?lastSnap.views-firstSnap.views:null,
    videoDelta:firstSnap&&lastSnap?lastSnap.videos-firstSnap.videos:null,
  };

  const insights=buildInsights(allVideos,{...overview,medianViews});

  let filtered=allVideos;
  const search=String(input.search??"").trim().toLowerCase();
  if(search)filtered=filtered.filter(r=>[r.title,r.topic,r.hook,r.cta,r.templateName,r.campaignName,r.youtubeVideoId].some(v=>String(v??"").toLowerCase().includes(search)));
  if(input.templateId)filtered=filtered.filter(r=>r.templateId===input.templateId);
  if(input.campaignId)filtered=filtered.filter(r=>r.campaignId===input.campaignId);

  const sort=input.sort??"views",direction=input.direction??"desc",factor=direction==="asc"?1:-1;
  const value=(r:any)=>sort==="engagement"?r.engagementRate:sort==="retention"?(r.retentionProxy??-1):sort==="ctr"?(r.ctr??-1):sort==="watchTime"?(r.watchMinutes??-1):sort==="uploadTime"?(r.uploadTime?new Date(r.uploadTime).getTime():0):Number(r[sort]??0);
  filtered=[...filtered].sort((a,b)=>(value(a)-value(b))*factor);
  const pageSize=Math.max(10,Math.min(100,Math.floor(input.pageSize??25))),totalVideos=filtered.length,totalPages=Math.max(1,Math.ceil(totalVideos/pageSize)),page=Math.max(1,Math.min(totalPages,Math.floor(input.page??1)));
  const videos=filtered.slice((page-1)*pageSize,page*pageSize);

  return {
    days,channel,overview,snapshots,insights,
    breakdowns:{templates:templatesBreakdown,campaigns:campaignsBreakdown,topics:topicsBreakdown,uploadHours:uploadHours.slice(0,12)},
    options:{templates:(templates.data??[]).map((r:any)=>({id:r.id,name:r.name})),campaigns:(campaigns.data??[]).map((r:any)=>({id:r.id,name:r.name}))},
    videos,pagination:{page,pageSize,totalVideos,totalPages},
  };
}

export const getChannelAnalyticsDashboard=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:DashboardInput)=>d).handler(async({data,context})=>buildDashboard(context.userId,data));

export const getWinningTemplateAnalytics=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{days?:number})=>d).handler(async({data,context})=>{
  const dashboard=await buildDashboard(context.userId,{days:data.days,page:1,pageSize:100,sort:"views",direction:"desc"});
  const observations=dashboard.videos.map((r:any)=>({
    campaignItemId:r.campaignItemId,youtubeVideoId:r.youtubeVideoId,templateId:r.templateId,templateName:r.templateName,campaignId:r.campaignId,campaignName:r.campaignName,
    views:r.views,likes:r.likes,comments:r.comments,impressions:r.impressions,ctr:r.ctr,retentionProxy:r.retentionProxy,first3sProxy:r.first3sProxy,uploadTime:r.uploadTime,hook:r.hook,cta:r.cta,topic:r.topic,variant:r.variant,
  }));
  const {analyzeWinningContent}=await import("@/lib/analytics-intelligence");
  return {days:dashboard.days,analysis:analyzeWinningContent(observations),observations};
});

export const saveWinningRecommendations=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
.inputValidator((d:{days?:number})=>d).handler(async({data,context})=>{
  const dashboard=await buildDashboard(context.userId,{days:data.days,page:1,pageSize:100,sort:"views",direction:"desc"});
  const observations=dashboard.videos.map((r:any)=>({campaignItemId:r.campaignItemId,youtubeVideoId:r.youtubeVideoId,templateId:r.templateId,templateName:r.templateName,campaignId:r.campaignId,campaignName:r.campaignName,views:r.views,likes:r.likes,comments:r.comments,impressions:r.impressions,ctr:r.ctr,retentionProxy:r.retentionProxy,first3sProxy:r.first3sProxy,uploadTime:r.uploadTime,hook:r.hook,cta:r.cta,topic:r.topic,variant:r.variant}));
  const {analyzeWinningContent}=await import("@/lib/analytics-intelligence");
  const analysis=analyzeWinningContent(observations);
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const {data:run,error}=await (supabaseAdmin as any).from("analytics_recommendation_runs").insert({user_id:context.userId,sample_size:analysis.sampleSize,best_template_id:analysis.bestTemplate?.key??null,best_upload_hour:analysis.bestUploadTime?Number(analysis.bestUploadTime.key):null,best_hook:analysis.bestHook?.key??null,recommendations_json:analysis.recommendations,summary_json:analysis}).select("id").single();
  if(error)throw new Error(error.message);return {id:run.id,analysis};
});
