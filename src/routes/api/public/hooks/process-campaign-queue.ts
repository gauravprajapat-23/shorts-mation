import { createFileRoute } from "@tanstack/react-router";
import { processDueCampaignItems } from "@/lib/youtube-upload.functions";

export const Route = createFileRoute("/api/public/hooks/process-campaign-queue")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await processDueCampaignItems();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "unknown";
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST this endpoint (pg_cron) to process due campaign items" }),
    },
  },
});
