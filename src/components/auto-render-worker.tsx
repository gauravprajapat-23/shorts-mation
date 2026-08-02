import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { runAutoRenderPass } from "@/lib/auto-render";

/** Invisible background worker: while the app is open it keeps rendering and
 *  uploading videos for active campaigns so the user never has to click
 *  "Render MP4" for each row. */
export function AutoRenderWorker() {
  const busy = useRef(false);
  const [active, setActive] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      if (stopped || busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const res = await runAutoRenderPass(1, (p) => {
          setActive(true);
          setPct(p);
        });
        if (!res.skipped && res.rendered > 0) {
          window.dispatchEvent(new CustomEvent("auto-render:done"));
        }
      } catch {
        /* transient — retried on the next tick */
      } finally {
        busy.current = false;
        setActive(false);
        setPct(0);
      }
    };

    const id = window.setInterval(tick, 30_000);
    const first = window.setTimeout(tick, 4000);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.clearTimeout(first);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2 text-xs text-zinc-300 shadow-lg">
      <Loader2 className="size-3.5 animate-spin text-brand" />
      Auto-rendering next video… {pct}%
    </div>
  );
}