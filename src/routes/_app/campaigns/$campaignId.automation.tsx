import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Film, UploadCloud, CalendarClock, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { getAutomationStatus, type AutomationItem } from "@/lib/automation.functions";

export const Route = createFileRoute("/_app/campaigns/$campaignId/automation")({
  head: () => ({
    meta: [
      { title: "Automation status — ShortsMation" },
      { name: "description", content: "Backend render, upload and YouTube scheduling progress for every video in this campaign." },
      { property: "og:title", content: "Automation status — ShortsMation" },
      { property: "og:description", content: "Track server-side rendering and scheduled YouTube publishing for each video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationView,
});

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

function stage(item: AutomationItem): { label: string; tone: string } {
  if (item.status === "failed") return { label: "Failed", tone: "text-red-400 border-red-500/40 bg-red-500/10" };
  if (item.status === "uploaded") return { label: "Published", tone: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" };
  if (item.status === "scheduled") return { label: "Scheduled on YouTube", tone: "text-sky-400 border-sky-500/40 bg-sky-500/10" };
  if (item.status === "uploading") return { label: "Uploading", tone: "text-amber-400 border-amber-500/40 bg-amber-500/10" };
  if (item.rendered_video_url) return { label: "Rendered, waiting to upload", tone: "text-indigo-300 border-indigo-500/40 bg-indigo-500/10" };
  if (item.render_job_ref || item.status === "rendering") return { label: "Rendering on server", tone: "text-brand border-brand/40 bg-brand/10" };
  return { label: "Waiting for render window", tone: "text-zinc-400 border-border bg-white/5" };
}

function AutomationView() {
  const { campaignId } = Route.useParams();
  const fetchStatus = useServerFn(getAutomationStatus);
  const q = useQuery({
    queryKey: ["automation-status", campaignId],
    queryFn: () => fetchStatus({ data: { campaignId } }),
    refetchInterval: 15_000,
  });
  const d = q.data;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link to="/campaigns/$campaignId" params={{ campaignId }} className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white mb-4">
        <ArrowLeft className="size-3.5" /> Back to campaign
      </Link>
      <PageHeader
        title="Automation status"
        description={
          d
            ? `Runs on the backend — renders start ${d.renderLeadMinutes} min before publish, uploads ${d.uploadLeadMinutes} min before, and YouTube flips the video public at the scheduled time. Safe to close this tab.`
            : "Loading backend automation state…"
        }
      />

      {d && !d.serverRenderConfigured && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Server rendering is not configured yet — add the render provider API key in settings and the queue will start encoding on its own.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total" value={d?.counts.total ?? 0} icon={Film} accent />
        <StatCard label="Waiting" value={d?.counts.waiting ?? 0} icon={Clock} />
        <StatCard label="Rendering" value={d?.counts.rendering ?? 0} icon={Film} />
        <StatCard label="Rendered" value={d?.counts.rendered ?? 0} icon={UploadCloud} />
        <StatCard label="Scheduled" value={d?.counts.scheduled ?? 0} icon={CalendarClock} />
        <StatCard label="Published" value={d?.counts.published ?? 0} icon={CheckCircle2} />
      </div>

      <div className="rounded-2xl border border-border bg-panel overflow-hidden mb-8">
        <header className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold">Per-video progress</h2>
          <span className="text-xs text-zinc-500">Auto-refreshes every 15s</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Video</th>
                <th className="text-left px-4 py-3 font-semibold">Stage</th>
                <th className="text-left px-4 py-3 font-semibold">Render starts</th>
                <th className="text-left px-4 py-3 font-semibold">Upload starts</th>
                <th className="text-left px-4 py-3 font-semibold">Goes public</th>
                <th className="text-left px-4 py-3 font-semibold">Link</th>
              </tr>
            </thead>
            <tbody>
              {(d?.items ?? []).map((item) => {
                const s = stage(item);
                return (
                  <tr key={item.id} className="border-t border-border/70 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-200">{item.title || item.video_file_name || item.id.slice(0, 8)}</div>
                      {item.error_message && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-400">
                          <AlertTriangle className="size-3 mt-0.5 shrink-0" /> {item.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{fmt(item.render_due_at)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{fmt(item.upload_due_at)}</td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{fmt(item.youtube_publish_at ?? item.schedule_at)}</td>
                    <td className="px-4 py-3 text-xs">
                      {item.youtube_url ? (
                        <a href={item.youtube_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">Open</a>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {d && d.items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-500">No videos in this campaign yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-panel overflow-hidden">
        <header className="px-5 py-4 border-b border-border"><h2 className="font-display font-bold">Backend activity log</h2></header>
        <ul className="divide-y divide-border/70">
          {(d?.logs ?? []).map((l) => (
            <li key={l.id} className="px-5 py-3 text-sm flex items-start gap-3">
              <span className={`mt-1 size-2 rounded-full shrink-0 ${l.level === "error" ? "bg-red-500" : l.level === "warn" ? "bg-amber-400" : "bg-emerald-500"}`} />
              <div>
                <div className="text-zinc-300">{l.message}</div>
                <div className="text-[11px] text-zinc-500">{new Date(l.created_at).toLocaleString()}</div>
              </div>
            </li>
          ))}
          {d && d.logs.length === 0 && <li className="px-5 py-8 text-center text-zinc-500 text-sm">No backend activity yet.</li>}
        </ul>
      </div>
    </div>
  );
}