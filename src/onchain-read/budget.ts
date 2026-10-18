/**
 * Monthly per-tier call budget (ONC-4), persisted in <dir>/onchain/usage-YYYY-MM.json (UTC month, per-day
 * counters). Only calls actually sent to the provider are recorded; cache hits are free. Writes are atomic
 * (temp + rename) and debounced to at most one per second, with an explicit flush(). A corrupt file restarts
 * the month from zero and is reported in the snapshot instead of throwing.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OnchainTier } from "./catalog";

export type BudgetIntent = "user" | "background";
export type ReserveResult = { readonly ok: true } | { readonly ok: false; readonly reason: "budget_exhausted" | "pace_limited" };

export interface BudgetTierSnapshot {
 readonly used: number;
 readonly cap: number | null;
 readonly today: number;
 readonly projection: number;
}

export interface BudgetSnapshot {
 readonly month: string;
 readonly restartedFromCorruptFile: boolean;
 readonly tiers: Record<OnchainTier, BudgetTierSnapshot>;
}

export interface OnchainBudget {
 reserve(tier: OnchainTier, intent: BudgetIntent): ReserveResult;
 /** Count one call that was actually sent to the provider. */
 record(tier: OnchainTier): void;
 snapshot(): BudgetSnapshot;
 /** Force the pending write to disk (also called implicitly when the month rolls over). */
 flush(): void;
}

interface DayUse { free: number; basic: number; premium: number }
interface UsageFile { version: 1; month: string; days: Record<string, Partial<DayUse>> }

const TIERS: readonly OnchainTier[] = ["free", "basic", "premium"];

export function createBudget(deps: { dir: string; now: () => number; caps: () => { basic: number; premium: number } }): OnchainBudget {
 const usageDir = join(deps.dir, "onchain");
 let month = "";
 let days = new Map<string, DayUse>();
 let corrupt = false;
 let dirty = false;
 let lastWriteMs = -Infinity;
 let timer: ReturnType<typeof setTimeout> | null = null;

 const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);
 const dayOf = (ms: number) => new Date(ms).toISOString().slice(8, 10);
 const fileFor = (m: string) => join(usageDir, `usage-${m}.json`);

 function daysInMonth(m: string): number {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y!, mm!, 0)).getUTCDate();
 }

 function blank(): DayUse {
  return { free: 0, basic: 0, premium: 0 };
 }

 function load(m: string): void {
  month = m;
  days = new Map();
  corrupt = false;
  if (!existsSync(fileFor(m))) return;
  try {
   const raw = JSON.parse(readFileSync(fileFor(m), "utf8")) as UsageFile;
   if (raw?.version !== 1 || raw.month !== m || typeof raw.days !== "object" || raw.days === null) throw new Error("shape");
   for (const [day, use] of Object.entries(raw.days)) {
    if (!/^\d{2}$/.test(day) || typeof use !== "object" || use === null) throw new Error("shape");
    const d = blank();
    for (const tier of TIERS) {
     const n = use[tier];
     if (n !== undefined && (!Number.isInteger(n) || n < 0)) throw new Error("shape");
     d[tier] = n ?? 0;
    }
    days.set(day, d);
   }
  } catch {
   // A corrupt file means the counter restarts from zero; the flag surfaces in the snapshot.
   days = new Map();
   corrupt = true;
  }
 }

 function ensureMonth(): void {
  const m = monthOf(deps.now());
  if (m === month) return;
  if (timer !== null) {
   clearTimeout(timer);
   timer = null;
  }
  if (month !== "" && dirty) writeNow();
  load(m);
  dirty = false;
 }

 function writeNow(): void {
  const obj: UsageFile = { version: 1, month, days: Object.fromEntries(days) };
  const target = fileFor(month);
  const tmp = join(usageDir, `.tmp-${month}-${process.pid}-${Math.random().toString(36).slice(2)}`);
  try {
   mkdirSync(usageDir, { recursive: true });
   writeFileSync(tmp, JSON.stringify(obj));
   for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
     renameSync(tmp, target);
     try {
      const { chmodSync } = require("node:fs") as typeof import("node:fs");
      chmodSync(target, 0o600);
     } catch { /* best effort */ }
     lastWriteMs = deps.now();
     dirty = false;
     return;
    } catch (error) {
     const code = (error as NodeJS.ErrnoException).code;
     if ((code === "EPERM" || code === "EBUSY") && attempt < 2) {
      const until = Date.now() + 60;
      while (Date.now() < until) { /* short spin for the Windows rename race */ }
      continue;
     }
     try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
     return; // persistence failure must never break a read path
    }
   }
  } catch {
   try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
   return; // persistence failure must never break a read path
  }
 }

 function scheduleWrite(): void {
  dirty = true;
  const wait = Math.max(0, lastWriteMs + 1000 - deps.now());
  if (wait === 0 && timer === null) {
   writeNow();
   return;
  }
  if (timer !== null) return;
  timer = setTimeout(() => {
   timer = null;
   if (dirty) writeNow();
  }, wait);
  timer.unref?.();
 }

 function used(tier: OnchainTier): number {
  let total = 0;
  for (const d of days.values()) total += d[tier];
  return total;
 }

 function today(tier: OnchainTier): number {
  return days.get(dayOf(deps.now()))?.[tier] ?? 0;
 }

 return {
  reserve(tier, intent) {
   if (tier === "free") return { ok: true };
   ensureMonth();
   const cap = tier === "basic" ? deps.caps().basic : deps.caps().premium;
   if (used(tier) >= cap) return { ok: false, reason: "budget_exhausted" };
   const paceLimit = 1.5 * (cap / daysInMonth(month));
   if (today(tier) >= paceLimit && intent !== "user") return { ok: false, reason: "pace_limited" };
   return { ok: true };
  },
  record(tier) {
   ensureMonth();
   const day = dayOf(deps.now());
   const use = days.get(day) ?? blank();
   use[tier] += 1;
   days.set(day, use);
   scheduleWrite();
  },
  snapshot() {
   ensureMonth();
   const caps = deps.caps();
   const capByTier: Record<OnchainTier, number | null> = { free: null, basic: caps.basic, premium: caps.premium };
   const day = Number(dayOf(deps.now()));
   const span = daysInMonth(month);
   const tiers = {} as Record<OnchainTier, BudgetTierSnapshot>;
   for (const tier of TIERS) {
    const u = used(tier);
    tiers[tier] = {
     used: u,
     cap: capByTier[tier],
     today: today(tier),
     projection: Math.round((u / day) * span),
    };
   }
   return { month, restartedFromCorruptFile: corrupt, tiers };
  },
  flush() {
   ensureMonth();
   if (timer !== null) {
    clearTimeout(timer);
    timer = null;
   }
   if (dirty) writeNow();
  },
 };
}
