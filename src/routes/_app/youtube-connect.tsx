import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Youtube, ShieldCheck, AlertTriangle, Unlink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/youtube-connect")({
  head: () => ({ meta: [{ title: "YouTube — ShortsForge" }] }),
  component: YoutubeConnectPage,
});

function YoutubeConnectPage() {
  const qc = useQueryClient();
  const { data: conn } = useQuery({
    queryKey: ["yt"],
    queryFn: async () => (await supabase.from("youtube_connections").select("*").eq("is_connected", true).maybeSingle()).data,
  });

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("connect-youtube", { body: {} });
      if (error) throw error;
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
    <div className="p-8 max-w-3xl mx-auto">
      <PageHeader title="YouTube channel" description="ShortsForge uses OAuth 2.0 to upload on your behalf. Tokens never leave the backend." />
      <div className="bg-panel border border-border rounded-2xl p-6">
        {conn ? (
          <div className="flex items-center gap-4">
            {conn.channel_avatar ? <img src={conn.channel_avatar} className="size-14 rounded-full" alt="" /> : <div className="size-14 rounded-full bg-zinc-800 grid place-items-center"><Youtube className="size-5" /></div>}
            <div className="flex-1">
              <div className="font-display font-bold">{conn.channel_name}</div>
              <div className="text-xs text-zinc-500 font-mono">{conn.channel_id}</div>
              <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1"><ShieldCheck className="size-3" /> Tokens encrypted on backend</div>
            </div>
            <button onClick={() => disconnect.mutate()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border text-sm hover:bg-brand/10 hover:text-brand"><Unlink className="size-3.5" /> Disconnect</button>
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