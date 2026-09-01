import { createFileRoute } from "@tanstack/react-router";
import { processDueCampaignItems } from "@/lib/youtube-upload.functions";
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
          // 1) start renders whose lead time arrived (staggered, few per tick)
          const renders = await submitDueRenders();
          // 2) pull finished MP4s into storage
          const collected = await collectFinishedRenders();
          // 3) upload/schedule anything whose upload lead time arrived
          const uploads = await processDueCampaignItems();
          return Response.json({ ok: true, renders, collected, uploads });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST with 'Authorization: Bearer <CRON_SECRET>' to process due campaign items" }),
    },
  },
});
