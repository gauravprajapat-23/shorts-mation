import { createFileRoute } from "@tanstack/react-router";
import { handleRenderCallback } from "@/lib/render-pipeline.server";

export const Route = createFileRoute("/api/public/hooks/render-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }
        const p = (body ?? {}) as { id?: string; status?: string; url?: string | null; error?: string | null; progress?: number };
        const url = new URL(request.url);
        const attemptId = url.searchParams.get("attempt");
        const token = url.searchParams.get("token") ?? request.headers.get("x-render-token");
        const result = await handleRenderCallback(p, { attemptId, token });
        return Response.json(result, { status: result.ok ? 200 : 401 });
      },
      GET: async () => Response.json({ ok: true, hint: "Native FFmpeg worker callback endpoint" }),
    },
  },
});
