import {createFileRoute,Link} from "@tanstack/react-router";
import {useMemo,useState} from "react";
import {useMutation,useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Activity,BarChart3,Clock3,Eye,ExternalLink,Heart,MessageCircle,RefreshCw,Search,Sparkles,Target,Timer,TrendingUp,Users,Youtube} from "lucide-react";
import {toast} from "sonner";
import {PageHeader} from "@/components/page-header";
import {getChannelAnalyticsDashboard} from "@/lib/analytics-intelligence.functions";
import {syncYouTubeAnalytics} from "@/lib/youtube-intelligence.functions";

export const Route=createFileRoute("/_app/analytics")({
  head:()=>({meta:[{title:"Channel Analytics — ShortsForge"}]}),
  component:AnalyticsPage,
});

type SortKey="views"|"likes"|"comments"|"engagement"|"retention"|"ctr"|"watchTime"|"uploadTime";
function pct(v:number|null|undefined,digits=1){return v==null?"—":`${(v*100).toFixed(digits)}%`;}
function num(v:number|null|undefined){return v==null?"—":Intl.NumberFormat("en",{notation:v>=1_000_000?"compact":"standard",maximumFractionDigits:1}).format(v);}
function duration(sec:number|null|undefined){if(sec==null)return"—";const m=Math.floor(sec/60),s=Math.round(sec%60);return m?`${m}m ${s}s`:`${s}s`;}

function AnalyticsPage(){
  const [days,setDays]=useState(90);
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(25);
  const [search,setSearch]=useState("");
  const [templateId,setTemplateId]=useState("");
  const [campaignId,setCampaignId]=useState("");
  const [sort,setSort]=useState<SortKey>("views");
  const [direction,setDirection]=useState<"asc"|"desc">("desc");
  const [selected,setSelected]=useState<any|null>(null);
  const load=useServerFn(getChannelAnalyticsDashboard);
  const sync=useServerFn(syncYouTubeAnalytics);
  const analytics=useQuery({
    queryKey:["channel-analytics",days,page,pageSize,search,templateId,campaignId,sort,direction],
    queryFn:()=>load({data:{days,page,pageSize,search,templateId:templateId||undefined,campaignId:campaignId||undefined,sort,direction}}),
    placeholderData:(previous)=>previous,
  });
  const syncMutation=useMutation({mutationFn:()=>sync({data:{}}),onSuccess:(r)=>{toast.success(`YouTube synced · ${r.videos} videos`);analytics.refetch();},onError:(e:Error)=>toast.error(e.message)});
  const d=analytics.data;
  const maxTrend=useMemo(()=>Math.max(1,...(d?.snapshots??[]).map((s:any)=>s.views)),[d?.snapshots]);

  const resetPage=()=>setPage(1);
  return <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5">
    <PageHeader title="YouTube Analytics & Video Intelligence" description="See the whole channel, inspect every tracked video, understand what is winning, and turn the data into the next content decisions."
      action={<div className="flex flex-wrap gap-2"><select value={days} onChange={e=>{setDays(Number(e.target.value));resetPage();}} className="field-sm"><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option><option value={365}>Last year</option><option value={1095}>Last 3 years</option></select><button onClick={()=>syncMutation.mutate()} disabled={syncMutation.isPending} className="btn-sm"><RefreshCw className={`size-3.5 ${syncMutation.isPending?"animate-spin":""}`}/> {syncMutation.isPending?"Syncing…":"Sync YouTube"}</button></div>}/>

    {analytics.isLoading&&!d&&<div className="panel p-12 text-center text-sm text-zinc-500">Loading complete channel analytics…</div>}
    {analytics.isError&&<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">Analytics could not be loaded. <button onClick={()=>analytics.refetch()} className="underline">Retry</button></div>}

    {d&&<>
      <section className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="size-11 rounded-full bg-black/30 overflow-hidden grid place-items-center">{d.channel.avatar?<img src={d.channel.avatar} alt="" className="size-full object-cover"/>:<Youtube className="size-5 text-brand"/>}</div>
          <div className="min-w-0"><div className="font-display font-bold truncate">{d.channel.name}</div><div className="text-xs text-zinc-500">Audience timezone: {d.channel.timezone} · Last synced {d.channel.lastSyncedAt?new Date(d.channel.lastSyncedAt).toLocaleString():"never"}</div></div>
          <div className="ml-auto flex flex-wrap gap-5 text-xs"><ChannelStat label="Subscribers" value={d.channel.subscribers} delta={d.channel.subscriberDelta}/><ChannelStat label="Channel views" value={d.channel.views} delta={d.channel.viewDelta}/><ChannelStat label="Published videos" value={d.channel.videos} delta={d.channel.videoDelta}/></div>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Metric icon={Eye} label="Tracked views" value={num(d.overview.totalViews)} hint={`${d.overview.trackedVideos} videos`}/>
        <Metric icon={Heart} label="Likes" value={num(d.overview.totalLikes)} hint="latest snapshots"/>
        <Metric icon={MessageCircle} label="Comments" value={num(d.overview.totalComments)} hint="latest snapshots"/>
        <Metric icon={Activity} label="Engagement" value={pct(d.overview.engagementRate,2)} hint="likes + weighted comments"/>
        <Metric icon={Target} label="Avg retention" value={pct(d.overview.avgRetention)} hint={`${d.overview.retentionCoverage}/${d.overview.trackedVideos} videos`}/>
        <Metric icon={Timer} label="Avg view duration" value={duration(d.overview.avgViewDuration)} hint={`${d.overview.watchCoverage} with deep analytics`}/>
        <Metric icon={Clock3} label="Watch time" value={d.overview.watchMinutes?`${num(d.overview.watchMinutes/60)}h`:"—"} hint="estimated minutes watched"/>
        <Metric icon={Users} label="Subscribers gained" value={num(d.overview.subscribersGained)} hint="tracked video attribution"/>
      </div>

      <div className="grid xl:grid-cols-[1.25fr_.75fr] gap-4">
        <section className="panel p-4 sm:p-5">
          <div className="flex items-center justify-between"><div><h2 className="section-title">Channel growth trend</h2><p className="section-sub">Stored channel snapshots from each YouTube sync.</p></div><TrendingUp className="size-4 text-brand"/></div>
          <div className="mt-5 h-36 flex items-end gap-1 border-b border-border/60 pb-1">{d.snapshots.length?d.snapshots.slice(-60).map((s:any,i:number)=><div key={`${s.capturedAt}-${i}`} className="flex-1 min-w-[3px] bg-brand/45 hover:bg-brand rounded-t" style={{height:`${Math.max(3,s.views/maxTrend*100)}%`}} title={`${new Date(s.capturedAt).toLocaleDateString()} · ${s.views.toLocaleString()} views · ${s.subscribers.toLocaleString()} subscribers`}/>):<div className="m-auto text-xs text-zinc-600">Sync YouTube on multiple days to build a trend.</div>}</div>
          <div className="flex justify-between mt-2 text-[10px] text-zinc-600"><span>{d.snapshots[0]?new Date(d.snapshots[0].capturedAt).toLocaleDateString():""}</span><span>{d.snapshots.at(-1)?new Date(d.snapshots.at(-1).capturedAt).toLocaleDateString():""}</span></div>
        </section>

        <section className="panel p-4 sm:p-5">
          <h2 className="section-title">Data coverage</h2><p className="section-sub">YouTube does not expose every metric for every channel/video. This shows what is actually available.</p>
          <div className="mt-4 space-y-3"><Coverage label="Retention / average viewed" value={d.overview.retentionCoverage} total={d.overview.trackedVideos}/><Coverage label="Watch time / duration" value={d.overview.watchCoverage} total={d.overview.trackedVideos}/><Coverage label="CTR / impressions" value={d.overview.ctrCoverage} total={d.overview.trackedVideos}/></div>
        </section>
      </div>

      <section className="panel p-4 sm:p-5">
        <div className="flex items-center gap-2"><Sparkles className="size-4 text-brand"/><div><h2 className="section-title">What to improve next</h2><p className="section-sub">Channel-level diagnostics plus concrete actions from the current video set.</p></div></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">{d.insights.map((x:any,i:number)=><div key={i} className={`rounded-xl border p-4 ${x.severity==="action"?"border-amber-500/30 bg-amber-500/5":x.severity==="good"?"border-emerald-500/30 bg-emerald-500/5":"border-border"}`}><div className="text-[10px] uppercase tracking-widest text-zinc-500">{x.severity}</div><div className="font-semibold mt-1">{x.title}</div><p className="text-xs text-zinc-400 mt-2">{x.detail}</p><div className="mt-3 text-xs text-zinc-200 bg-black/20 rounded-lg p-2.5">{x.action}</div></div>)}</div>
      </section>

      <div className="grid xl:grid-cols-2 gap-4">
        <Breakdown title="Templates" subtitle="Which video template earns the most views and engagement?" rows={d.breakdowns.templates}/>
        <Breakdown title="Topics / words" subtitle="Use this to choose the next content cluster." rows={d.breakdowns.topics}/>
        <Breakdown title="Campaigns" subtitle="Compare complete automation batches." rows={d.breakdowns.campaigns}/>
        <Breakdown title={`Upload hours · ${d.channel.timezone}`} subtitle="Compare audience-local posting slots." rows={d.breakdowns.uploadHours}/>
      </div>

      <section className="panel overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-title">All published videos</h2><p className="section-sub">Search, filter and sort every video currently captured by ShortsForge analytics.</p></div><div className="text-xs text-zinc-500">{d.pagination.totalVideos.toLocaleString()} matching videos</div></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2 mt-4">
            <label className="relative lg:col-span-2"><Search className="size-3.5 absolute left-2.5 top-2.5 text-zinc-600"/><input value={search} onChange={e=>{setSearch(e.target.value);resetPage();}} className="field-sm w-full pl-8" placeholder="Search title, topic, hook, campaign…"/></label>
            <select value={templateId} onChange={e=>{setTemplateId(e.target.value);resetPage();}} className="field-sm"><option value="">All templates</option>{d.options.templates.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select value={campaignId} onChange={e=>{setCampaignId(e.target.value);resetPage();}} className="field-sm"><option value="">All campaigns</option>{d.options.campaigns.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select value={sort} onChange={e=>{setSort(e.target.value as SortKey);resetPage();}} className="field-sm"><option value="views">Sort: views</option><option value="engagement">Engagement</option><option value="retention">Retention</option><option value="watchTime">Watch time</option><option value="ctr">CTR</option><option value="likes">Likes</option><option value="comments">Comments</option><option value="uploadTime">Upload time</option></select>
            <select value={direction} onChange={e=>{setDirection(e.target.value as any);resetPage();}} className="field-sm"><option value="desc">High → low</option><option value="asc">Low → high</option></select>
          </div>
        </div>
        <div className="overflow-auto"><table className="w-full min-w-[1380px] text-xs"><thead className="bg-black/20 text-zinc-500"><tr>{["Video","Views","Likes","Comments","Engagement","Retention","Avg view","Watch time","CTR","Uploaded","Template","Topic","Actions"].map(h=><th key={h} className="text-left px-3 py-2.5">{h}</th>)}</tr></thead><tbody>{d.videos.map((r:any)=><tr key={r.youtubeVideoId} className="border-t border-border/60 hover:bg-white/[.02]"><td className="px-3 py-3 max-w-96"><div className="flex items-center gap-2">{r.thumbnailUrl?<img src={r.thumbnailUrl} alt="" className="w-16 h-9 rounded object-cover shrink-0 border border-border"/>:<div className="w-16 h-9 rounded bg-black/25 shrink-0"/>}<div className="min-w-0"><div className="font-semibold truncate" title={r.title}>{r.title}</div><div className="text-[10px] text-zinc-600 mt-1">{r.youtubeVideoId} · {r.campaignName||"External / no campaign"}</div></div></div></td><td className="px-3 py-3 font-semibold">{r.views.toLocaleString()}</td><td className="px-3 py-3">{r.likes.toLocaleString()}</td><td className="px-3 py-3">{r.comments.toLocaleString()}</td><td className="px-3 py-3">{pct(r.engagementRate,2)}</td><td className="px-3 py-3">{pct(r.retentionProxy)}</td><td className="px-3 py-3">{duration(r.avgViewDuration)}</td><td className="px-3 py-3">{r.watchMinutes==null?"—":`${num(r.watchMinutes/60)}h`}</td><td className="px-3 py-3">{pct(r.ctr)}</td><td className="px-3 py-3">{r.uploadTime?new Date(r.uploadTime).toLocaleDateString():"—"}</td><td className="px-3 py-3 max-w-40 truncate">{r.templateName||"—"}</td><td className="px-3 py-3 max-w-40 truncate">{r.topic||"—"}</td><td className="px-3 py-3"><div className="flex gap-1"><button onClick={()=>setSelected(r)} className="mini-btn">Details</button><a href={r.youtubeUrl} target="_blank" rel="noreferrer" className="mini-btn"><ExternalLink className="size-3"/></a></div></td></tr>)}</tbody></table></div>
        {!d.videos.length&&<div className="p-10 text-center text-sm text-zinc-500">No videos match the current filters.</div>}
        <div className="p-3 border-t border-border flex flex-wrap items-center gap-2"><button disabled={d.pagination.page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} className="mini-btn disabled:opacity-30">Previous</button><span className="text-xs text-zinc-500">Page {d.pagination.page} of {d.pagination.totalPages}</span><button disabled={d.pagination.page>=d.pagination.totalPages} onClick={()=>setPage(p=>p+1)} className="mini-btn disabled:opacity-30">Next</button><select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}} className="ml-auto field-sm"><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option></select></div>
      </section>

      <div className="flex justify-end"><Link to="/data-studio" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-brand/30 bg-brand/10 text-brand text-xs font-bold"><Sparkles className="size-3.5"/> Build the next batch in Data Studio</Link></div>
    </>}

    {selected&&<VideoDetail video={selected} onClose={()=>setSelected(null)}/>}    
    <style>{`.panel{border:1px solid var(--border);background:var(--panel);border-radius:1rem}.section-title{font-family:var(--font-display);font-weight:700}.section-sub{font-size:.75rem;color:#71717a;margin-top:.2rem}.field-sm{height:36px;border:1px solid var(--border);background:var(--panel);border-radius:.45rem;padding:0 .65rem;font-size:.75rem}.btn-sm{height:36px;display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--border);border-radius:.45rem;padding:0 .75rem;font-size:.75rem;font-weight:600}.mini-btn{height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:.35rem;padding:0 .55rem;font-size:.65rem;color:#a1a1aa}.mini-btn:hover{color:white;background:rgba(255,255,255,.04)}`}</style>
  </div>;
}

function Metric({icon:Icon,label,value,hint}:{icon:any;label:string;value:string;hint:string}){return <div className="panel p-3.5"><Icon className="size-4 text-brand"/><div className="text-xl font-bold mt-2">{value}</div><div className="text-xs font-semibold mt-1">{label}</div><div className="text-[9px] text-zinc-600 mt-1">{hint}</div></div>}
function ChannelStat({label,value,delta}:{label:string;value:number|null;delta:number|null}){return <div><div className="font-bold">{value==null?"—":value.toLocaleString()}</div><div className="text-[10px] text-zinc-500">{label}{delta!=null&&delta!==0?<span className={delta>0?"text-emerald-400":"text-red-400"}> · {delta>0?"+":""}{delta.toLocaleString()}</span>:null}</div></div>}
function Coverage({label,value,total}:{label:string;value:number;total:number}){const p=total?value/total:0;return <div><div className="flex justify-between text-xs"><span>{label}</span><span className="text-zinc-500">{value}/{total}</span></div><div className="h-1.5 rounded-full bg-black/30 mt-1.5 overflow-hidden"><div className="h-full bg-brand rounded-full" style={{width:`${Math.max(0,Math.min(100,p*100))}%`}}/></div></div>}
function Breakdown({title,subtitle,rows}:{title:string;subtitle:string;rows:any[]}){const max=Math.max(1,...rows.map(r=>r.views));return <section className="panel p-4 sm:p-5"><h2 className="section-title">{title}</h2><p className="section-sub">{subtitle}</p><div className="space-y-3 mt-4">{rows.slice(0,8).map((r:any)=><div key={r.key}><div className="flex gap-3 items-center text-xs"><div className="w-32 sm:w-44 truncate font-medium" title={r.label}>{r.label}</div><div className="flex-1 h-2 rounded bg-black/30 overflow-hidden"><div className="h-full bg-brand/70 rounded" style={{width:`${Math.max(2,r.views/max*100)}%`}}/></div><div className="w-20 text-right text-zinc-400">{num(r.views)} views</div></div><div className="ml-32 sm:ml-44 pl-3 text-[9px] text-zinc-600">{r.videos} videos · {pct(r.engagementRate,2)} engagement · {pct(r.retention)} retention</div></div>)}{!rows.length&&<div className="text-xs text-zinc-600">Not enough attributed data yet.</div>}</div></section>}
function VideoDetail({video,onClose}:{video:any;onClose:()=>void}){return <div className="fixed inset-0 z-50 bg-black/70 flex justify-end" onClick={onClose}><aside className="w-full max-w-xl h-full overflow-y-auto bg-panel border-l border-border p-5" onClick={e=>e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div className="flex gap-3 min-w-0">{video.thumbnailUrl?<img src={video.thumbnailUrl} alt="" className="w-32 h-[72px] rounded-lg object-cover border border-border shrink-0"/>:null}<div className="min-w-0"><div className="text-[10px] uppercase tracking-widest text-brand">Video analytics</div><h2 className="text-lg font-bold mt-1 line-clamp-2">{video.title}</h2><div className="text-xs text-zinc-500 mt-1">{video.campaignName||"External / no campaign"} · {video.templateName||"No template"}</div></div></div><button onClick={onClose} className="mini-btn shrink-0">Close</button></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-5"><DetailMetric label="Views" value={num(video.views)}/><DetailMetric label="Engagement" value={pct(video.engagementRate,2)}/><DetailMetric label="Retention" value={pct(video.retentionProxy)}/><DetailMetric label="Avg view" value={duration(video.avgViewDuration)}/><DetailMetric label="Watch time" value={video.watchMinutes==null?"—":`${num(video.watchMinutes/60)}h`}/><DetailMetric label="CTR" value={pct(video.ctr)}/><DetailMetric label="Likes" value={num(video.likes)}/><DetailMetric label="Comments" value={num(video.comments)}/><DetailMetric label="Subscribers" value={num(video.subscribersGained)}/></div><div className="mt-5 space-y-3">{[["Hook",video.hook],["CTA",video.cta],["Topic / word",video.topic],["Variant",video.variant],["Uploaded",video.uploadTime?new Date(video.uploadTime).toLocaleString():null]].map(([k,v])=><div key={String(k)} className="rounded-lg border border-border p-3"><div className="text-[9px] uppercase tracking-widest text-zinc-600">{k}</div><div className="text-sm mt-1">{v||"—"}</div></div>)}</div><a href={video.youtubeUrl} target="_blank" rel="noreferrer" className="mt-5 w-full h-10 inline-flex items-center justify-center gap-2 rounded bg-brand text-white text-sm font-bold"><Youtube className="size-4"/> Open on YouTube</a></aside></div>}
function DetailMetric({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-border p-3"><div className="font-bold text-lg">{value}</div><div className="text-[10px] text-zinc-500">{label}</div></div>}
