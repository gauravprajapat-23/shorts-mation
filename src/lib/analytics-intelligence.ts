export type PerformanceObservation = {
  campaignItemId:string;
  youtubeVideoId:string;
  templateId?:string|null;
  templateName?:string|null;
  campaignId?:string|null;
  campaignName?:string|null;
  views:number;
  likes:number;
  comments:number;
  impressions?:number|null;
  ctr?:number|null;
  retentionProxy?:number|null;
  first3sProxy?:number|null;
  uploadTime?:string|null;
  hook?:string|null;
  cta?:string|null;
  topic?:string|null;
  variant?:string|null;
};

export type RankedDimension = {
  key:string;
  label:string;
  sampleSize:number;
  totalViews:number;
  avgEngagementRate:number;
  avgRetentionProxy:number|null;
  score:number;
};

export type WinningAnalytics = {
  sampleSize:number;
  totalViews:number;
  totalLikes:number;
  totalComments:number;
  averageEngagementRate:number;
  bestTemplate:RankedDimension|null;
  bestUploadTime:RankedDimension|null;
  bestHook:RankedDimension|null;
  bestCta:RankedDimension|null;
  bestTopic:RankedDimension|null;
  bestVariant:RankedDimension|null;
  recommendations:Array<{type:string;title:string;reason:string;action:string}>;
};

export function engagementRate(p:PerformanceObservation){
  return p.views>0?(p.likes+p.comments*2)/p.views:0;
}
function scoreRow(p:PerformanceObservation){
  const viewScore=Math.log10(Math.max(1,p.views)+1)*18;
  const engagement=Math.min(.25,engagementRate(p))*180;
  const retention=p.retentionProxy==null?0:Math.max(0,Math.min(1,p.retentionProxy))*24;
  const first3=p.first3sProxy==null?0:Math.max(0,Math.min(1,p.first3sProxy))*18;
  const ctr=p.ctr==null?0:Math.max(0,Math.min(.3,p.ctr))*70;
  return viewScore+engagement+retention+first3+ctr;
}
function rankBy(rows:PerformanceObservation[],getKey:(row:PerformanceObservation)=>string|null|undefined,getLabel?:(key:string)=>string):RankedDimension[]{
  const groups=new Map<string,PerformanceObservation[]>();
  for(const row of rows){
    const key=getKey(row)?.trim();
    if(!key)continue;
    groups.set(key,[...(groups.get(key)??[]),row]);
  }
  return [...groups].map(([key,list])=>{
    const views=list.reduce((s,r)=>s+r.views,0);
    const avgEngagement=list.reduce((s,r)=>s+engagementRate(r),0)/list.length;
    const retentionRows=list.filter(r=>r.retentionProxy!=null);
    const retention=retentionRows.length?retentionRows.reduce((s,r)=>s+Number(r.retentionProxy),0)/retentionRows.length:null;
    const raw=list.reduce((s,r)=>s+scoreRow(r),0)/list.length;
    const confidence=Math.min(1,Math.sqrt(list.length/4));
    return {key,label:getLabel?getLabel(key):key,sampleSize:list.length,totalViews:views,avgEngagementRate:avgEngagement,avgRetentionProxy:retention,score:Number((raw*confidence).toFixed(2))};
  }).sort((a,b)=>b.score-a.score);
}
function uploadHour(row:PerformanceObservation){
  if(!row.uploadTime)return null;
  const d=new Date(row.uploadTime);return Number.isFinite(d.getTime())?String(d.getUTCHours()):null;
}

export function analyzeWinningContent(rows:PerformanceObservation[]):WinningAnalytics{
  const totalViews=rows.reduce((s,r)=>s+r.views,0);
  const totalLikes=rows.reduce((s,r)=>s+r.likes,0);
  const totalComments=rows.reduce((s,r)=>s+r.comments,0);
  const bestTemplate=rankBy(rows,r=>r.templateId,r=>rows.find(x=>x.templateId===r)?.templateName||r)[0]??null;
  const bestUploadTime=rankBy(rows,uploadHour,h=>`${String(Number(h)).padStart(2,"0")}:00 UTC`)[0]??null;
  const bestHook=rankBy(rows,r=>r.hook)[0]??null;
  const bestCta=rankBy(rows,r=>r.cta)[0]??null;
  const bestTopic=rankBy(rows,r=>r.topic)[0]??null;
  const bestVariant=rankBy(rows,r=>r.variant)[0]??null;
  const recommendations:Array<{type:string;title:string;reason:string;action:string}>=[];
  if(bestTemplate)recommendations.push({type:"template",title:`Produce more with ${bestTemplate.label}`,reason:`Highest confidence-weighted score across ${bestTemplate.sampleSize} published video${bestTemplate.sampleSize===1?"":"s"}.`,action:"Create 5–10 new rows using the same template while changing topic/word and hook."});
  if(bestHook)recommendations.push({type:"hook",title:"Reuse the winning opening pattern",reason:`“${bestHook.label}” is the strongest observed hook proxy.`,action:"Create 3 hook variants that keep the same promise and shorten the first line."});
  if(bestTopic)recommendations.push({type:"topic",title:`Expand ${bestTopic.label}`,reason:`This topic/word cluster currently outperforms the other tracked subjects.`,action:"Generate adjacent words/questions in the same semantic cluster."});
  if(bestUploadTime)recommendations.push({type:"schedule",title:`Test around ${bestUploadTime.label}`,reason:`This upload-hour bucket has the strongest observed performance score.`,action:"Schedule the next batch around this hour, then compare against a nearby control slot."});
  if(bestVariant)recommendations.push({type:"variant",title:`Promote variant ${bestVariant.label}`,reason:`This variant leads the current experiment set.`,action:"Use it as the control and generate two challenger variants."});
  return {
    sampleSize:rows.length,totalViews,totalLikes,totalComments,
    averageEngagementRate:rows.length?rows.reduce((s,r)=>s+engagementRate(r),0)/rows.length:0,
    bestTemplate,bestUploadTime,bestHook,bestCta,bestTopic,bestVariant,recommendations,
  };
}

export function inferAttribution(content:any,seo:any){
  const ai=content?._ai??{};
  const topicCandidates=[content?.topic,content?.word,content?.animal,content?.subject,content?.quiz_answer,seo?.title];
  return {
    hook:String(content?.hook??ai.hook??"").trim()||null,
    cta:String(content?.cta??ai.cta??"").trim()||null,
    topic:String(topicCandidates.find(Boolean)??"").trim().slice(0,240)||null,
    variant:String(content?.variant??content?.variation??content?.version??"").trim().slice(0,120)||null,
  };
}
