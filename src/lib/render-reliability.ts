export type RenderBudget = {
  monthlyBudgetUsd: number;
  maxCostPerRenderUsd: number;
  maxRenderSeconds: number;
  maxRetries: number;
  baseBackoffSeconds: number;
};

export const DEFAULT_RENDER_BUDGET: RenderBudget = {
  monthlyBudgetUsd: 25,
  maxCostPerRenderUsd: 1,
  maxRenderSeconds: 180,
  maxRetries: 3,
  baseBackoffSeconds: 60,
};

export function estimateRenderCostUsd(durationMs: number, ratePerMinuteUsd = Number(process.env.RENDER_COST_PER_MINUTE_USD ?? "0.08")): number {
  const minutes = Math.max(1 / 60, durationMs / 60_000);
  return Math.round(minutes * Math.max(0, ratePerMinuteUsd) * 1_000_000) / 1_000_000;
}

export function retryBackoffMs(retryNumber: number, baseSeconds: number): number {
  const exponent = Math.max(0, retryNumber - 1);
  return Math.min(24 * 60 * 60_000, Math.max(5, baseSeconds) * 1000 * 2 ** exponent);
}

export function shouldDeadLetter(retryCount: number, maxRetries: number): boolean {
  return retryCount >= Math.max(0, maxRetries);
}

export function renderTimeoutMs(maxRenderSeconds: number): number {
  return Math.max(5, maxRenderSeconds) * 1000;
}
