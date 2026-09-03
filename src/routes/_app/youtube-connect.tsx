import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getYouTubeAuthUrl } from "@/lib/youtube-oauth.functions";
import { getYouTubePublishingData, saveYouTubeUploadDefaults, syncYouTubeAnalytics } from "@/lib/youtube-intelligence.functions";
import { PageHeader } from "@/components/page-header";
import { Youtube, ShieldCheck, AlertTriangle, Unlink, BarChart3, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/youtube-connect")({
  head: () => ({ meta: [{ title: "YouTube — ShortsForge" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    yt_connected: s.yt_connected ? String(s.yt_connected) : undefined,
    yt_error: s.yt_error ? String(s.yt_error) : undefined,
  }),
  component: YoutubeConnectPage,
});

function YoutubeConnectPage() {
  const qc = useQueryClient();
  const search = useSearch({ from: "/_app/youtube-connect" });
  const getAuthUrl = useServerFn(getYouTubeAuthUrl);
  const publishingFn=useServerFn(getYouTubePublishingData);
  const saveDefaultsFn=useServerFn(saveYouTubeUploadDefaults);
  const syncAnalyticsFn=useServerFn(syncYouTubeAnalytics);
  const [defaults,setDefaults]=useState<any>({privacy:"private",categoryId:"",playlistId:"",language:"en",madeForKids:false,titleTemplate:"{{title}}",descriptionTemplate:"{{description}}",hashtagMax:5,appendHashtags:true});
  const [timezone,setTimezone]=useState("UTC");

  useEffect(() => {
    if (search.yt_connected) {
      toast.success("YouTube channel connected");
      qc.invalidateQueries({ queryKey: ["yt"] });
    }
    if (search.yt_error) toast.error(`YouTube connect failed: ${search.yt_error}`);
  }, [search.yt_connected, search.yt_error, qc]);

  const connection = useQuery({
    queryKey: ["yt"],
    queryFn: async () => {
      const { data, error } = await supabase
          .from("youtube_connections")
          .select("id,channel_id,channel_name,channel_avatar,is_connected,token_expiry,created_at,updated_at")
          .eq("is_connected", true)
          .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const conn = connection.data;
  const intelligence=useQuery({queryKey:["youtube-publishing-data",conn?.id],enabled:!!conn,queryFn:()=>publishingFn({data:{connectionId:conn!.id,regionCode:"US"}})});
  useEffect(()=>{if(intelligence.data){setDefaults((d:any)=>({...d,...(intelligence.data.connection.defaults||{})}));setTimezone(intelligence.data.connection.audienceTimezone||"UTC");}},[intelligence.data]);
  const saveDefaults=useMutation({mutationFn:()=>saveDefaultsFn({data:{connectionId:conn!.id,audienceTimezone:timezone,defaults}}),onSuccess:()=>{toast.success("YouTube upload defaults saved");qc.invalidateQueries({queryKey:["youtube-publishing-data"]});},onError:(e:Error)=>toast.error(e.message)});
  const syncAnalytics=useMutation({mutationFn:()=>syncAnalyticsFn({data:{connectionId:conn!.id}}),onSuccess:(r)=>{toast.success(`Analytics synced · ${r.videos} videos`);qc.invalidateQueries({queryKey:["youtube-publishing-data"]});},onError:(e:Error)=>toast.error(e.message)});

  const connect = useMutation({
    mutationFn: async () => {
      const data = await getAuthUrl({ data: {} as never });
      if (data?.authUrl) window.location.href = data.authUrl;
    },
    onError: (e) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      if (!conn) return;
      const { error } = await supabase.from("youtube_connections").update({ is_connected: false }).eq("id", conn.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["yt"] }); toast.success("Disconnected"); },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <PageHeader title="YouTube channel" description="ShortsForge uses OAuth 2.0 to upload on your behalf. Tokens never leave the backend." />
      {connection.isError && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">YouTube connection state could not be loaded. <button onClick={() => connection.refetch()} className="underline">Retry</button></div>}
      <div className="bg-panel border border-border rounded-2xl p-4 sm:p-6">
        {conn ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {conn.channel_avatar ? <img src={conn.channel_avatar} className="size-14 rounded-full" alt="" /> : <div className="size-14 rounded-full bg-zinc-800 grid place-items-center"><Youtube className="size-5" /></div>}
            <div className="flex-1">
              <div className="font-display font-bold">{conn.channel_name}</div>
              <div className="text-xs text-zinc-500 font-mono">{conn.channel_id}</div>
              <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1"><ShieldCheck className="size-3" /> Tokens encrypted on backend</div>
            </div>
            <button onClick={() => disconnect.mutate()} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-brand/10 hover:text-brand"><Unlink className="size-3.5" /> Disconnect</button>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="size-14 rounded-2xl bg-brand/10 border border-brand/20 grid place-items-center mx-auto mb-4">
              <Youtube className="size-6 text-brand" />
            </div>
            <h2 className="font-display text-xl font-bold">No channel connected</h2>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-sm mx-auto">Click below to authorize ShortsForge to schedule and upload videos to your YouTube channel.</p>
            <button onClick={() => connect.mutate()} disabled={connect.isPending} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand text-white font-bold text-sm hover:bg-brand/90 disabled:opacity-50">
              <Youtube className="size-4" /> {connect.isPending ? "Connecting…" : "Connect YouTube"}
            </button>
          </div>
        )}
      </div>

      {conn&&<div className="mt-6 space-y-4">
        <section className="bg-panel border border-border rounded-2xl p-4 sm:p-6 space-y-4">
          <div><h2 className="font-display font-bold">Publishing intelligence & defaults</h2><p className="text-xs text-zinc-500 mt-1">Categories and playlists are loaded from the connected YouTube channel. These defaults are applied server-side at upload time.</p></div>
          {intelligence.isError?<div className="text-xs text-red-300">Could not load YouTube publishing data. <button onClick={()=>intelligence.refetch()} className="underline">Retry</button></div>:<>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-zinc-400">Category<select value={defaults.categoryId||""} onChange={e=>setDefaults((d:any)=>({...d,categoryId:e.target.value}))} className="mt-1 w-full rounded bg-zinc-950 border border-border p-2"><option value="">YouTube default</option>{(intelligence.data?.categories??[]).map((c:any)=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            <label className="text-xs text-zinc-400">Playlist<select value={defaults.playlistId||""} onChange={e=>setDefaults((d:any)=>({...d,playlistId:e.target.value}))} className="mt-1 w-full rounded bg-zinc-950 border border-border p-2"><option value="">No playlist</option>{(intelligence.data?.playlists??[]).map((pl:any)=><option key={pl.id} value={pl.id}>{pl.title} ({pl.itemCount})</option>)}</select></label>
            <label className="text-xs text-zinc-400">Language<input value={defaults.language||""} onChange={e=>setDefaults((d:any)=>({...d,language:e.target.value}))} placeholder="en" className="mt-1 w-full rounded bg-zinc-950 border border-border p-2"/></label>
            <label className="text-xs text-zinc-400">Audience timezone<input value={timezone} onChange={e=>setTimezone(e.target.value)} placeholder="America/New_York" className="mt-1 w-full rounded bg-zinc-950 border border-border p-2"/></label>
            <label className="text-xs text-zinc-400">Privacy<select value={defaults.privacy||"private"} onChange={e=>setDefaults((d:any)=>({...d,privacy:e.target.value}))} className="mt-1 w-full rounded bg-zinc-950 border border-border p-2"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
            <label className="text-xs flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={!!defaults.madeForKids} onChange={e=>setDefaults((d:any)=>({...d,madeForKids:e.target.checked}))}/> Made for kids</label>
          </div>
          <label className="block text-xs text-zinc-400">Title template<input value={defaults.titleTemplate||""} onChange={e=>setDefaults((d:any)=>({...d,titleTemplate:e.target.value}))} className="mt-1 w-full rounded bg-zinc-950 border border-border p-2 font-mono" placeholder="{{title}}"/></label>
          <label className="block text-xs text-zinc-400">Description template<textarea value={defaults.descriptionTemplate||""} onChange={e=>setDefaults((d:any)=>({...d,descriptionTemplate:e.target.value}))} className="mt-1 w-full min-h-20 rounded bg-zinc-950 border border-border p-2 font-mono" placeholder="{{description}}"/></label>
          <div className="flex flex-wrap gap-4 text-xs"><label>Max hashtags <input type="number" min={0} max={15} value={defaults.hashtagMax??5} onChange={e=>setDefaults((d:any)=>({...d,hashtagMax:Number(e.target.value)}))} className="w-16 bg-zinc-950 border border-border rounded px-2 py-1"/></label><label><input type="checkbox" checked={defaults.appendHashtags!==false} onChange={e=>setDefaults((d:any)=>({...d,appendHashtags:e.target.checked}))}/> Append hashtags to description</label></div>
          <button onClick={()=>saveDefaults.mutate()} disabled={saveDefaults.isPending} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-brand text-white text-sm font-bold"><Save className="size-4"/> Save upload defaults</button></>}
        </section>
        <section className="bg-panel border border-border rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-display font-bold">Channel analytics</h2><p className="text-xs text-zinc-500">Snapshots power post-publish tracking and scheduling recommendations.</p></div><button onClick={()=>syncAnalytics.mutate()} disabled={syncAnalytics.isPending} className="inline-flex items-center gap-2 border border-border rounded px-3 py-2 text-xs"><RefreshCw className="size-3.5"/> Sync</button></div>
          {intelligence.data?.channel&&<div className="grid grid-cols-3 gap-2 mt-4">{[["Subscribers",intelligence.data.channel.subscribers],["Views",intelligence.data.channel.views],["Videos",intelligence.data.channel.videos]].map(([k,v])=><div key={String(k)} className="rounded-lg border border-border p-3"><div className="text-lg font-bold">{Number(v).toLocaleString()}</div><div className="text-[10px] text-zinc-500">{k}</div></div>)}</div>}
          <div className="mt-3 text-xs text-zinc-400">Recommended UTC publish hours: {(intelligence.data?.recommendedUtcHours??[]).map((h:number)=>`${String(h).padStart(2,"0")}:00`).join(" · ")||"Sync analytics to build recommendations"}</div>
          <div className="mt-1 text-[10px] text-zinc-600">Audience timezone: {timezone}. Recommendations fall back to a balanced schedule until enough performance snapshots exist.</div>
        </section>
      </div>}

      <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex gap-3 text-amber-100 text-xs">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <div>
          YouTube API requires Google verification before uploads can go <strong className="font-bold">public</strong>. Until then,
          videos will be uploaded as <strong className="font-bold">private</strong>. ShortsForge respects YouTube quota limits and uses idempotency keys to prevent duplicates.
        </div>
      </div>
    </div>
  );
}