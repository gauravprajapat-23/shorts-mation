import { createFileRoute } from "@tanstack/react-router";
import { processDueCampaignItems } from "@/lib/youtube-upload.functions";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header && safeEqual(header, expected)) return true;
  // Also accept a raw header for schedulers that can't set Authorization.
  const alt = request.headers.get("x-cron-secret") ?? "";
  return Boolean(alt) && safeEqual(alt, secret);
}

export const Route = createFileRoute("/api/public/hooks/process-campaign-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await processDueCampaignItems();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST with 'Authorization: Bearer <CRON_SECRET>' to process due campaign items" }),
    },
  },
});
