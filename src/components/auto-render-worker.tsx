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
    let timer = 0;

    // Drain the queue as fast as the machine allows: as long as a pass produced
    // a video there is probably more work, so retry almost immediately. Once the
    // queue is empty we fall back to a slow poll. Every row is rendered and
    // stored ahead of its publish time, so the backend can upload on schedule
    // even after this tab is closed.
    const tick = async () => {
      if (stopped) return;
      let delay = 30_000;
      if (!busy.current && document.visibilityState === "visible") {
        busy.current = true;
        try {
          const res = await runAutoRenderPass(1, (p) => {
            setActive(true);
            setPct(p);
          });
          if (!res.skipped && res.rendered > 0) {
            window.dispatchEvent(new CustomEvent("auto-render:done"));
            delay = 1_000;
          }
        } catch {
          /* transient — retried on the next tick */
        } finally {
          busy.current = false;
          setActive(false);
          setPct(0);
        }
      } else {
        delay = 5_000;
      }
      if (!stopped) timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 4000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
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