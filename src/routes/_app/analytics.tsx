import {createFileRoute,Link} from "@tanstack/react-router";
import {useState} from "react";
import {useQuery,useMutation} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {BarChart3,Clock3,Eye,Heart,MessageCircle,Sparkles,Trophy,RefreshCw,Copy,Target} from "lucide-react";
import {toast} from "sonner";
import {PageHeader} from "@/components/page-header";
import {getWinningTemplateAnalytics,saveWinningRecommendations} from "@/lib/analytics-intelligence.functions";
import {syncYouTubeAnalytics} from "@/lib/youtube-intelligence.functions";

export const Route=createFileRoute("/_app/analytics")({
 head:()=>({meta:[{title:"Analytics Intelligence — ShortsForge"}]}),
 component:AnalyticsPage,
});

function formatRate(v:number|null|undefined){return v==null?"—":`${(v*100).toFixed(1)}%`;}
function AnalyticsPage(){
 const [days,setDays]=useState(90);
 const getAnalytics=useServerFn(getWinningTemplateAnalytics);
 const saveRun=useServerFn(saveWinningRecommendations);
 const sync=useServerFn(syncYouTubeAnalytics);
 const analytics=useQuery({queryKey:["winning-analytics",days],queryFn:()=>getAnalytics({data:{days}})});
 const syncMutation=useMutation({mutationFn:()=>sync({data:{}}),onSuccess:()=>{toast.success("YouTube analytics refreshed");analytics.refetch();},onError:(e:Error)=>toast.error(e.message)});
 const saveMutation=useMutation({mutationFn:()=>saveRun({data:{days}}),onSuccess:()=>toast.success("Recommendation snapshot saved"),onError:(e:Error)=>toast.error(e.message)});
 const a=analytics.data?.analysis;
 const copyPrompt=async(rec:any)=>{
  const prompt=`Create the next winning Shorts variation. ${rec.action} Use this evidence: ${rec.reason}`;
  try{await navigator.clipboard.writeText(prompt);toast.success("Variation prompt copied");}catch{toast.error("Could not copy prompt");}
 };
 return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
  <PageHeader title="Winning-Template Intelligence" description="Connect post-publish YouTube performance back to templates, hooks, CTAs, topics, variants and upload timing."
   action={<div className="flex gap-2"><select value={days} onChange={e=>setDays(Number(e.target.value))} className="rounded border border-border bg-panel px-2 py-2 text-xs"><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option></select><button onClick={()=>syncMutation.mutate()} disabled={syncMutation.isPending} className="inline-flex items-center gap-2 px-3 py-2 rounded border border-border text-xs"><RefreshCw className="size-3.5"/> Sync YouTube</button></div>}/>

  {analytics.isLoading&&<div className="rounded-xl border border-border bg-panel p-10 text-center text-sm text-zinc-500">Analyzing published videos…</div>}
  {analytics.isError&&<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Analytics could not be loaded. <button onClick={()=>analytics.refetch()} className="underline">Retry</button></div>}
  {a&&<>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
    <Metric icon={Eye} label="Tracked views" value={a.totalViews.toLocaleString()} hint={`${a.sampleSize} latest video snapshots`}/>
    <Metric icon={Heart} label="Likes" value={a.totalLikes.toLocaleString()} hint={`${(a.averageEngagementRate*100).toFixed(2)}% weighted engagement proxy`}/>
    <Metric icon={MessageCircle} label="Comments" value={a.totalComments.toLocaleString()} hint="Comments receive extra recommendation weight"/>
    <Metric icon={BarChart3} label="Retention coverage" value={`${analytics.data!.observations.filter((r:any)=>r.retentionProxy!=null).length}/${a.sampleSize}`} hint="YouTube Analytics API where authorized"/>
   </div>

   <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
    <Winner icon={Trophy} title="Best-performing template" item={a.bestTemplate}/>
    <Winner icon={Clock3} title="Best upload time" item={a.bestUploadTime}/>
    <Winner icon={Target} title="Best first 3 seconds" item={a.bestHook} note="Hook performance proxy; direct 3-second retention appears only when the provider exposes it."/>
    <Winner icon={Sparkles} title="Best topic / word" item={a.bestTopic}/>
   </div>

   <section className="rounded-2xl border border-border bg-panel p-4 sm:p-6 mb-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display font-bold">What to produce next</h2><p className="text-xs text-zinc-500 mt-1">Recommendations are confidence-weighted so a single lucky upload does not automatically become the winner.</p></div><button onClick={()=>saveMutation.mutate()} className="px-3 py-2 rounded border border-border text-xs">Save recommendation snapshot</button></div>
    <div className="grid md:grid-cols-2 gap-3 mt-4">{a.recommendations.length?a.recommendations.map((rec:any,i:number)=><div key={`${rec.type}-${i}`} className="rounded-xl border border-border p-4">
      <div className="text-[10px] uppercase tracking-widest text-brand">{rec.type}</div><div className="font-semibold mt-1">{rec.title}</div><p className="text-xs text-zinc-400 mt-2">{rec.reason}</p><div className="mt-3 rounded-lg bg-black/20 p-3 text-xs text-zinc-300">{rec.action}</div>
      <div className="flex gap-2 mt-3"><button onClick={()=>copyPrompt(rec)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px]"><Copy className="size-3"/> Copy AI prompt</button><Link to="/data-studio" className="inline-flex items-center gap-1 px-2 py-1 rounded bg-brand/10 text-brand border border-brand/30 text-[10px]">Open Data Studio</Link></div>
    </div>):<div className="text-sm text-zinc-500">Publish and sync several videos before recommendations become meaningful.</div>}</div>
   </section>

   <section className="rounded-2xl border border-border bg-panel overflow-hidden">
    <div className="p-4 border-b border-border"><h2 className="font-display font-bold">Published-video attribution</h2><p className="text-xs text-zinc-500 mt-1">Latest observation per YouTube video. CTR and first-three-second metrics remain blank when YouTube does not expose them through the authorized API.</p></div>
    <div className="overflow-auto"><table className="w-full text-xs min-w-[1050px]"><thead className="text-zinc-500 bg-black/20"><tr>{["Video","Template","Campaign","Views","Engagement","Retention","CTR","Upload","Hook","CTA","Topic","Variant"].map(h=><th key={h} className="text-left px-3 py-2">{h}</th>)}</tr></thead>
    <tbody>{analytics.data!.observations.map((r:any)=><tr key={r.youtubeVideoId} className="border-t border-border/60"><td className="px-3 py-2 font-mono">{r.youtubeVideoId}</td><td className="px-3 py-2">{r.templateName||"—"}</td><td className="px-3 py-2">{r.campaignName||"—"}</td><td className="px-3 py-2">{r.views.toLocaleString()}</td><td className="px-3 py-2">{formatRate(r.views?(r.likes+r.comments*2)/r.views:0)}</td><td className="px-3 py-2">{formatRate(r.retentionProxy)}</td><td className="px-3 py-2">{formatRate(r.ctr)}</td><td className="px-3 py-2">{r.uploadTime?new Date(r.uploadTime).toLocaleString():"—"}</td><td className="px-3 py-2 max-w-44 truncate" title={r.hook||""}>{r.hook||"—"}</td><td className="px-3 py-2 max-w-36 truncate">{r.cta||"—"}</td><td className="px-3 py-2 max-w-36 truncate">{r.topic||"—"}</td><td className="px-3 py-2">{r.variant||"—"}</td></tr>)}</tbody></table></div>
   </section>
  </>}
 </div>;
}
function Metric({icon:Icon,label,value,hint}:{icon:any;label:string;value:string;hint:string}){return <div className="rounded-xl border border-border bg-panel p-4"><Icon className="size-4 text-brand"/><div className="text-xl font-bold mt-3">{value}</div><div className="text-xs font-semibold mt-1">{label}</div><div className="text-[10px] text-zinc-600 mt-1">{hint}</div></div>}
function Winner({icon:Icon,title,item,note}:{icon:any;title:string;item:any;note?:string}){return <div className="rounded-xl border border-border bg-panel p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500"><Icon className="size-3.5 text-brand"/>{title}</div><div className="font-bold mt-3 truncate" title={item?.label}>{item?.label||"Not enough data"}</div>{item&&<><div className="text-xs text-zinc-400 mt-1">Score {item.score.toFixed(1)} · {item.sampleSize} sample{item.sampleSize===1?"":"s"}</div><div className="text-[10px] text-zinc-600 mt-1">{item.totalViews.toLocaleString()} views · {(item.avgEngagementRate*100).toFixed(2)}% engagement</div></>}{note&&<p className="text-[9px] text-zinc-600 mt-2">{note}</p>}</div>}
