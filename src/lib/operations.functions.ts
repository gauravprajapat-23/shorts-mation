import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getControlPlaneHealth, renderAdmissionDecision } from "@/lib/deployment-control-plane.server";
import { getPublisherFleetHealth } from "@/lib/youtube-publisher-v2.server";
import { getGovernanceHealth } from "@/lib/tenant-governance.server";

function assertOpsAccess(userId: string) {
  const configured = String(process.env.OPS_USER_IDS ?? "").split(",").map(v => v.trim()).filter(Boolean);
  if (!configured.length || !configured.includes(userId)) throw new Error("Operations dashboard access is not configured for this account");
}

export const getOperationsDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: Record<string, never>) => d)
  .handler(async ({ context }) => {
    assertOpsAccess(context.userId);
    const control = await getControlPlaneHealth();
    control.render = await renderAdmissionDecision();
    let publisherFleet: unknown = null;
    try { publisherFleet = await getPublisherFleetHealth(); } catch { /* combined RPC remains authoritative */ }
    let governance: Record<string,unknown> = {};
    try { governance = await getGovernanceHealth(); } catch { /* Phase 9 dashboard remains usable during rollout */ }
    let billing: Record<string,unknown> = {};
    try { const { getBillingOperationsHealth } = await import("@/lib/billing-operations.server"); billing = await getBillingOperationsHealth(); } catch {}
    return { control, publisherFleet, governance, billing };
  });
