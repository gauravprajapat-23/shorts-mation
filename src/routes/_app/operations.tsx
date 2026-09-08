import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { getOperationsDashboard } from "@/lib/operations.functions";
import { Activity, Server, UploadCloud, CalendarClock, ShieldCheck, Gauge, DatabaseZap } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_app/operations")({
  head: () => ({ meta: [{ title: "Operations — ShortsForge" }] }),
  component: OperationsPage,
});

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-border bg-black/20 p-3"><div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>;
}

function FleetCard({ title, icon, fleet }: { title: string; icon: ReactNode; fleet: any }) {
  const saturated = !fleet?.admit;
  return <section className="rounded-2xl border border-border bg-panel p-5 space-y-4">
    <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-display font-bold">{icon}{title}</div><span className={`text-xs rounded-full px-2 py-1 border ${saturated ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"}`}>{saturated ? "Admission paused" : "Accepting work"}</span></div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Metric label="Queued" value={fleet?.queued ?? 0}/><Metric label="Active" value={fleet?.active ?? 0}/><Metric label="Oldest wait" value={`${fleet?.oldestQueuedSeconds ?? 0}s`}/><Metric label="Failures" value={fleet?.failed ?? 0}/>
      <Metric label="Nodes" value={fleet?.activeNodes ?? 0}/><Metric label="Capacity" value={fleet?.activeCapacity ?? 0}/><Metric label="Desired replicas" value={fleet?.desiredReplicas ?? 0}/><Metric label="Max replicas" value={fleet?.maxReplicas ?? 0}/>
    </div>
  </section>;
}

function OperationsPage() {
  const fetchOps = useServerFn(getOperationsDashboard);
  const query = useQuery({ queryKey: ["operations-control-plane"], queryFn: () => fetchOps({ data: {} }), refetchInterval: 10_000 });
  if (query.isLoading) return <div className="p-8 text-sm text-zinc-400">Loading deployment control plane…</div>;
  if (query.error) return <div className="p-8 max-w-3xl mx-auto"><PageHeader title="Operations" description="Renderer, publisher, scheduler and production certification."/><div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{query.error instanceof Error ? query.error.message : "Could not load operations"}</div></div>;
  const c = query.data!.control as any;
  const cert = c.certification as any;
  const governance = (query.data as any)?.governance ?? {};
  const billing = (query.data as any)?.billing ?? {};
  const today = governance.today ?? {}; const month = governance.month ?? {}; const r2 = governance.r2 ?? {};
  const topTenants = (governance.topTenants ?? []) as any[];
  const runs = (c.scheduler?.recentRuns ?? []) as any[];
  return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
    <PageHeader title="Production Operations" description="Queue admission, autoscaling targets, fleet health, scheduler leadership and release certification." />
    <FleetCard title="Render fleet" icon={<Server className="size-4"/>} fleet={c.render}/>
    <FleetCard title="Publisher fleet" icon={<UploadCloud className="size-4"/>} fleet={c.publisher}/>
    <section className="rounded-2xl border border-border bg-panel p-5 space-y-4">
      <div className="flex items-center gap-2 font-display font-bold"><Gauge className="size-4"/>Multi-tenant governance & cost</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Metric label="Managed tenants" value={governance.tenants ?? 0}/><Metric label="Throttled publish" value={governance.throttledPublishJobs ?? 0}/>
        <Metric label="Renders today" value={today.renderCompleted ?? 0}/><Metric label="Render cost today" value={`$${Number(today.renderCostUsd ?? 0).toFixed(2)}`}/>
        <Metric label="YouTube units reserved" value={today.youtubeQuotaReserved ?? 0}/><Metric label="R2 cleanup pending" value={r2.cleanupPending ?? 0}/>
      </div>
      {topTenants.length ? <div className="rounded-xl border border-border overflow-hidden"><div className="px-3 py-2 text-xs font-semibold text-zinc-400 flex items-center gap-2"><DatabaseZap className="size-3.5"/>Highest monthly consumers</div><div className="divide-y divide-border">{topTenants.map((t:any)=><div key={t.user_id} className="px-3 py-2 grid grid-cols-4 gap-2 text-xs"><span className="truncate">{String(t.user_id).slice(0,8)}…</span><span>{t.plan_key}</span><span>R {t.renders ?? 0} · P {t.publishes ?? 0}</span><span className="text-right">${Number(t.cost_usd ?? 0).toFixed(2)}</span></div>)}</div></div> : null}
    </section>
    <section className="rounded-2xl border border-border bg-panel p-5 space-y-4"><div className="font-display font-bold">Billing & entitlements</div><div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3"><Metric label="Active subs" value={billing.active ?? 0}/><Metric label="Past due" value={billing.pastDue ?? 0}/><Metric label="Grace" value={billing.grace ?? 0}/><Metric label="MRR" value={`$${(Number(billing.mrrCents ?? 0)/100).toFixed(2)}`}/><Metric label="Pending overage" value={`$${(Number(billing.pendingOverageCents ?? 0)/100).toFixed(2)}`}/><Metric label="Webhook failures" value={billing.failedWebhooks ?? 0}/></div></section>
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="rounded-2xl border border-border bg-panel p-5"><div className="flex items-center gap-2 font-display font-bold mb-4"><CalendarClock className="size-4"/>Scheduler leadership</div><div className="space-y-2 text-xs">{runs.length ? runs.map((r:any)=><div key={r.id} className="rounded-lg border border-border p-3 flex justify-between gap-3"><span className="truncate">{r.worker_id}</span><span className="text-zinc-400">R {r.render_candidates ?? 0} · P {r.publish_candidates ?? 0}</span></div>) : <div className="text-zinc-500">No scheduler runs recorded.</div>}</div></section>
      <section className="rounded-2xl border border-border bg-panel p-5"><div className="flex items-center gap-2 font-display font-bold mb-4"><ShieldCheck className="size-4"/>Production certification</div>{cert ? <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm">Release {String(cert.release_sha ?? "").slice(0,12)}</span><span className={`text-xs font-semibold ${cert.status === "passed" ? "text-emerald-400" : cert.status === "failed" ? "text-red-400" : "text-amber-400"}`}>{cert.status}</span></div><div className="grid grid-cols-2 gap-2 text-xs"><Metric label="CSV → render" value={cert.csv_to_render ? "PASS" : "—"}/><Metric label="R2 output" value={cert.r2_output_ready ? "PASS" : "—"}/><Metric label="YouTube upload" value={cert.youtube_upload_complete ? "PASS" : "—"}/><Metric label="Public verified" value={cert.youtube_public_verified ? "PASS" : "—"}/><Metric label="Crash matrix" value={cert.crash_matrix_passed ? "PASS" : "—"}/></div></div> : <div className="text-sm text-zinc-500">No staging certification has been recorded yet.</div>}</section>
    </div>
    <div className="text-xs text-zinc-500 flex items-center gap-2"><Activity className="size-3.5"/>Refreshes every 10 seconds. Autoscaling values are recommendations consumed by deployment infrastructure; admission decisions are enforced by the application.</div>
  </div>;
}
