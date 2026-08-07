import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gauge, Loader2, RotateCcw, Save } from "lucide-react";
import {
  clearAutomationUserLimit,
  getAutomationLimitControls,
  saveAutomationGlobalLimits,
  saveAutomationUserLimit,
  type AccountLimitRow,
} from "@/lib/automation-limits.functions";

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function AccountRow({
  row,
  canBoost,
  globalRenders,
  globalUploads,
  onSaved,
}: {
  row: AccountLimitRow;
  canBoost: boolean;
  globalRenders: number;
  globalUploads: number;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveAutomationUserLimit);
  const clearFn = useServerFn(clearAutomationUserLimit);
  const [renders, setRenders] = useState(row.maxConcurrentRenders?.toString() ?? "");
  const [uploads, setUploads] = useState(row.maxConcurrentUploads?.toString() ?? "");
  const [note, setNote] = useState(row.note ?? "");

  useEffect(() => {
    setRenders(row.maxConcurrentRenders?.toString() ?? "");
    setUploads(row.maxConcurrentUploads?.toString() ?? "");
    setNote(row.note ?? "");
  }, [row.maxConcurrentRenders, row.maxConcurrentUploads, row.note]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          userId: row.userId,
          maxConcurrentRenders: numOrNull(renders),
          maxConcurrentUploads: numOrNull(uploads),
          note,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) { toast.success("Limits updated — the next automation tick uses them"); onSaved(); }
      else toast.error(res.error ?? "Could not save limits");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: () => clearFn({ data: { userId: row.userId } }),
    onSuccess: () => { toast.success("Back to the global defaults"); onSaved(); },
  });

  return (
    <tr className="border-t border-border/70 align-top">
      <td className="px-3 py-3">
        <div className="text-sm text-zinc-200 truncate max-w-[190px]">{row.fullName || row.email || row.userId.slice(0, 8)}</div>
        <div className="text-[11px] text-zinc-500 truncate max-w-[190px]">{row.email ?? row.userId}</div>
        <div className="text-[11px] text-zinc-500 mt-1">in flight: {row.inFlightRenders} renders · {row.inFlightUploads} uploads</div>
      </td>
      <td className="px-3 py-3">
        <input
          type="number" min={0} max={canBoost ? 50 : globalRenders}
          value={renders} onChange={(e) => setRenders(e.target.value)}
          placeholder={`${globalRenders} (default)`}
          className="w-28 h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          type="number" min={0} max={canBoost ? 50 : globalUploads}
          value={uploads} onChange={(e) => setUploads(e.target.value)}
          placeholder={`${globalUploads} (default)`}
          className="w-28 h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <input
          value={note} onChange={(e) => setNote(e.target.value)} maxLength={240}
          placeholder="why (optional)"
          className="w-full min-w-[140px] h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => save.mutate()} disabled={save.isPending}
            title="Save"
            className="size-8 grid place-items-center rounded-md bg-brand text-white disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          </button>
          <button
            onClick={() => reset.mutate()} disabled={reset.isPending}
            title="Use global defaults"
            className="size-8 grid place-items-center rounded-md border border-border hover:bg-white/5 text-zinc-400"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Per-account concurrency overrides — boost or throttle individual accounts
 *  live, without a redeploy. Admins manage every account; everyone else can
 *  only tighten their own. */
export function AutomationLimitsPanel() {
  const qc = useQueryClient();
  const fetchControls = useServerFn(getAutomationLimitControls);
  const saveGlobals = useServerFn(saveAutomationGlobalLimits);
  const q = useQuery({ queryKey: ["automation-limit-controls"], queryFn: () => fetchControls({ data: {} as never }) });
  const d = q.data;
  const [g, setG] = useState<Record<string, number> | null>(null);

  useEffect(() => { if (d) setG({ ...d.globals }); }, [d]);

  const persistGlobals = useMutation({
    mutationFn: () => saveGlobals({ data: (g ?? {}) as never }),
    onSuccess: (res) => {
      if (res.ok) { toast.success("Global limits updated"); qc.invalidateQueries({ queryKey: ["automation-limit-controls"] }); qc.invalidateQueries({ queryKey: ["render-settings"] }); }
      else toast.error(res.error ?? "Could not save");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["automation-limit-controls"] });

  const GLOBAL_FIELDS: Array<[string, string]> = [
    ["maxGlobalConcurrentRenders", "Renders in flight (all accounts)"],
    ["maxUserConcurrentRenders", "Renders per account"],
    ["maxRendersPerTick", "Renders started per minute"],
    ["maxGlobalConcurrentUploads", "Uploads in flight (all accounts)"],
    ["maxUserConcurrentUploads", "Uploads per account"],
    ["maxUploadsPerTick", "Uploads started per minute"],
  ];

  return (
    <section className="rounded-2xl border border-border bg-panel p-6">
      <div className="flex items-center gap-2 mb-1">
        <Gauge className="size-4 text-brand" />
        <h2 className="font-display font-bold">Automation concurrency</h2>
      </div>
      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
        Override how many renders and uploads an account may run at once. Changes take effect on the next automation
        tick — no redeploy. Leave a field empty to follow the global default.
      </p>

      {q.isLoading && <div className="text-xs text-zinc-500">Loading limits…</div>}

      {d?.isAdmin && g && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Global ceilings</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {GLOBAL_FIELDS.map(([key, label]) => (
              <label key={key} className="text-xs text-zinc-400">
                <span className="block mb-1">{label}</span>
                <input
                  type="number" min={1} max={50} value={g[key] ?? 0}
                  onChange={(e) => setG((p) => ({ ...(p ?? {}), [key]: Number(e.target.value) }))}
                  className="w-full h-8 px-2 rounded-md bg-zinc-950 border border-border text-sm"
                />
              </label>
            ))}
          </div>
          <button
            onClick={() => persistGlobals.mutate()} disabled={persistGlobals.isPending}
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand text-white text-sm font-semibold disabled:opacity-50"
          >
            {persistGlobals.isPending && <Loader2 className="size-3.5 animate-spin" />} Save global limits
          </button>
        </div>
      )}

      {d && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-zinc-500 bg-zinc-950/50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Account</th>
                  <th className="text-left px-3 py-2 font-semibold">Max renders</th>
                  <th className="text-left px-3 py-2 font-semibold">Max uploads</th>
                  <th className="text-left px-3 py-2 font-semibold">Note</th>
                  <th className="text-left px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {d.accounts.map((row) => (
                  <AccountRow
                    key={row.userId}
                    row={row}
                    canBoost={d.isAdmin}
                    globalRenders={d.globals.maxUserConcurrentRenders}
                    globalUploads={d.globals.maxUserConcurrentUploads}
                    onSaved={invalidate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {d && !d.isAdmin && (
        <p className="mt-3 text-[11px] text-zinc-500">
          You can throttle your own account down to reduce load. Boosting above the global per-account cap
          ({d.globals.maxUserConcurrentRenders} renders / {d.globals.maxUserConcurrentUploads} uploads) requires an admin.
        </p>
      )}
    </section>
  );
}
