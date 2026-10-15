import { createBudget } from "../agent/budget";

export interface CadenceSimulation {
  readonly intervalMin: number;
  readonly dailyLimit: number;
  readonly scheduled: number;
  readonly consultations: number;
  readonly held: number;
  readonly estimatedModelUsd: number | null;
}

/** Simulates the REAL budget policy with an injected clock and an in-memory counter. No call, provider, wallet or financial config is touched. */
export function simulateDay(intervalMin: number, dailyLimit: number, cost?: { readonly inputTokens: number; readonly inputUsdPerMillion: number }): CadenceSimulation {
  if (!Number.isSafeInteger(intervalMin) || intervalMin < 1 || intervalMin > 60 || !Number.isSafeInteger(dailyLimit) || dailyLimit < 1) throw new Error("cadence_invalid");
  if (cost && (!Number.isSafeInteger(cost.inputTokens) || cost.inputTokens < 0 || !Number.isFinite(cost.inputUsdPerMillion) || cost.inputUsdPerMillion < 0)) throw new Error("cadence_cost_invalid");
  const dayStart = Date.UTC(2026, 9, 14);
  let time = dayStart;
  const budget = createBudget({ now: () => time, load: () => null, persist: () => {}, pace: true, limits: { maxConsultsPerDay: dailyLimit, maxTokensPerDay: null } });
  let scheduled = 0, held = 0;
  for (let offset = 0; offset < 86_400_000; offset += intervalMin * 60_000) {
    time = dayStart + offset; scheduled++;
    if (budget.check(cost?.inputTokens ?? 1).ok) budget.begin(cost?.inputTokens ?? 1); else held++;
  }
  const consultations = budget.status().consults;
  return { intervalMin, dailyLimit, scheduled, consultations, held,
    estimatedModelUsd: cost ? consultations * cost.inputTokens * cost.inputUsdPerMillion / 1_000_000 : null };
}

/** Maximum scheduled decision opportunities in 24h, before cycle runtime, provider failures or unchanged inputs reduce actual consultations. */
export const dailyOpportunities = (intervalMin: number): number => {
  if (!Number.isFinite(intervalMin) || intervalMin <= 0) throw new Error("cadence_invalid");
  return Math.ceil(1440 / intervalMin);
};
