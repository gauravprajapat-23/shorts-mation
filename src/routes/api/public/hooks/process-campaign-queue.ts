import { createFileRoute } from "@tanstack/react-router";
import { dispatchUpcomingCampaignItems } from "@/lib/campaign-scheduler.server";
import { processPublishQueue } from "@/lib/youtube-publisher-v2.server";
import { submitDueRenders, collectFinishedRenders } from "@/lib/render-pipeline.server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request): boolean {
  // V2.13: cron execution is server-only. Supabase publishable/anon keys are
  // intentionally public browser credentials and MUST NEVER authorize workers.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization") ?? "";
  const raw = request.headers.get("x-cron-secret") ?? "";
  return (bearer.length > 7 && safeEqual(bearer, `Bearer ${secret}`)) ||
    (raw.length > 0 && safeEqual(raw, secret));
}


export const Route = createFileRoute("/api/public/hooks/process-campaign-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          // 0) durably materialize the next scheduling horizon and create one
          // publish job per rendered campaign item. Safe to run repeatedly.
          const dispatch = await dispatchUpcomingCampaignItems();
          // 1) submit render jobs idempotently when their lead time arrives.
          const renders = await submitDueRenders();
          // 2) reconcile R2-backed worker completion into campaign readiness.
          const collected = await collectFinishedRenders();
          // A render may have become R2-ready during this tick, so dispatch once
          // more to create its unique publish job without waiting for next cron.
          const postRenderDispatch = await dispatchUpcomingCampaignItems();
          // 3) run the separately leased, crash-resumable YouTube publisher.
          const publishing = await processPublishQueue();
          return Response.json({ ok: true, dispatch, renders, collected, postRenderDispatch, publishing });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST with 'Authorization: Bearer <CRON_SECRET>' to process due campaign items" }),
    },
  },
});
