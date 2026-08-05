import { createFileRoute } from "@tanstack/react-router";
import { handleRenderCallback } from "@/lib/render-pipeline.server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request): boolean {
  const secret = process.env["RENDER_WEBHOOK_SECRET"];
  if (!secret) return false;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-render-token") ?? "";
  return Boolean(token) && safeEqual(token, secret);
}

export const Route = createFileRoute("/api/public/hooks/render-callback")({
  server: {
    handlers: {
      // Render-farm completion/failure events. Advances the item immediately so
      // automation never waits for the next polling tick.
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
        }
        const p = (body ?? {}) as {
          id?: string;
          status?: string;
          url?: string | null;
          error?: string | null;
          response?: { id?: string; status?: string; url?: string | null; error?: string | null };
        };
        const event = p.response ?? p;
        const res = await handleRenderCallback({
          id: event.id,
          status: event.status,
          url: event.url ?? null,
          error: event.error ?? null,
        });
        return Response.json(res, { status: res.ok ? 200 : 202 });
      },
      GET: async () => Response.json({ ok: true, hint: "render provider webhook endpoint (POST with ?token=...)" }),
    },
  },
});
