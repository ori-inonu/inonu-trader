/**
 * What the SISTEMA screen is told about the quota of the data provider: the projection of `decision-review/resource-capacity` computed by the core from the counters of the gateway, so the screen only draws and never
 * repeats the arithmetic. Local counters are what this machine sent (a cap that is the local configuration); the account's own reading does not exist yet, so it is reported as unreported, never as zero. No scenario of
 * collection is invented: the schedules are an empty list, and an empty list is not a demand of zero. The age of a reading is the screen's to advance from its original `observedAtMs`.
 */
import type { BudgetSnapshot } from "../onchain-read/budget";
import { projectResourceCapacity, type ResourceCapacity, type ResourceMeter, type ResourceTier } from "../decision-review/resource-capacity";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIERS: readonly ResourceTier[] = ["free", "basic", "premium"];

export function resourceView(input: { readonly budget: (() => BudgetSnapshot) | undefined; readonly now: () => number }): ResourceCapacity | null {
  if (typeof input.budget !== "function") return null;
  let snap: BudgetSnapshot;
  try {
    snap = input.budget();
  } catch {
    return null;
  }
  const asOfMs = input.now();
  if (snap === null || typeof snap !== "object" || typeof snap.month !== "string" || !MONTH.test(snap.month)) return null;
  const tiers: Partial<Record<ResourceTier, { used: number | null; monthlyCap: number | null }>> = {};
  for (const tier of TIERS) {
    const row = snap.tiers?.[tier];
    if (row === undefined || row === null) continue;
    tiers[tier] = { used: snap.restartedFromCorruptFile ? null : row.used, monthlyCap: row.cap };
  }
  const local: ResourceMeter = { month: snap.month, observedAtMs: asOfMs, integrity: snap.restartedFromCorruptFile ? "corrupt" : "valid", tiers };
  const projected = projectResourceCapacity({ asOfMs, local, account: null, schedules: [] });
  return projected.ok ? projected.value : null;
}
