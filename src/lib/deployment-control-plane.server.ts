export type FleetDecision = {
  queued: number;
  active: number;
  failed: number;
  oldestQueuedSeconds: number;
  activeNodes: number;
  activeCapacity: number;
  desiredReplicas: number;
  minReplicas: number;
  maxReplicas: number;
  admit: boolean;
  maxQueued: number;
};

export type ControlPlaneHealth = {
  generatedAt: string;
  render: FleetDecision;
  publisher: FleetDecision;
  scheduler: { recentRuns: Array<Record<string, unknown>> };
  certification: Record<string, unknown> | null;
};

export async function getControlPlaneHealth(): Promise<ControlPlaneHealth> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("phase9_control_plane_health", { p_stale_seconds: 60 });
  if (error) throw new Error(error.message || "Could not read deployment control plane");
  return data as ControlPlaneHealth;
}

export async function renderAdmissionDecision(): Promise<FleetDecision> {
  const base=(await getControlPlaneHealth()).render;
  try {
    const { getRenderWorkerConfig } = await import("@/lib/render-settings.server");
    const { getFfmpegWorkerFleet } = await import("@/lib/ffmpeg-worker.server");
    const config=await getRenderWorkerConfig("control-plane");
    if(!config) return base;
    const fleet=await getFfmpegWorkerFleet(config) as any;
    const q=fleet?.queue??{};
    const queued=Number(q.queued??0)+Number(q.retry_wait??0);
    const active=Number(q.leased??0)+Number(q.rendering??0)+Number(q.encoding??0)+Number(q.uploading??0);
    const nodes=Array.isArray(fleet?.nodes)?fleet.nodes:[];
    const activeNodes=nodes.filter((n:any)=>n.online&&n.status==="active").length;
    const activeCapacity=nodes.filter((n:any)=>n.online&&n.status==="active").reduce((sum:number,n:any)=>sum+Number(n.max_concurrency??0),0);
    return {...base,queued,active,activeNodes,activeCapacity,admit:queued<base.maxQueued};
  } catch { return base; }
}

export async function publisherAdmissionDecision(): Promise<FleetDecision> {
  return (await getControlPlaneHealth()).publisher;
}
