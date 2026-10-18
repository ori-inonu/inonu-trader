/**
 * The plan of every position the agent opens (AUT-4): a target, a stop, a trailing stop and a time limit, chosen when the position is opened and kept on disk. This is what keeps a loss from being carried
 * for days ("prejuizo amarrado") and what takes profit on the way up. The model only picks among the profiles the code offers, and only profiles whose target is plausible for the volatility of the token and
 * whose stop is not just noise are offered. Once a position has a plan, the exits that the plan demands (stop, trailing stop, expired time, the half taken at the target) are the CODE's: they are carried out
 * without asking the model, so they work with the budget spent or the model down. Every number here is a CHOICE of this code, conservative and not calibrated; the Placar measures them. Pure apart from the
 * injected store.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalCdf } from "../quant/normal";
import type { ExitStance } from "./types";

export interface ProfileSpec {
  readonly targetPct: number;
  readonly stopPct: number;
  /** After the target was reached: leave when the price falls this far from its peak. */
  readonly trailPct: number;
  readonly horizonH: number;
}

export const PROFILES = {
  alvo_2: { targetPct: 2, stopPct: 1.5, trailPct: 1, horizonH: 24 },
  alvo_5: { targetPct: 5, stopPct: 4, trailPct: 3, horizonH: 12 },
  alvo_10: { targetPct: 10, stopPct: 6, trailPct: 5, horizonH: 36 },
  alvo_20: { targetPct: 20, stopPct: 10, trailPct: 8, horizonH: 120 },
} as const satisfies Record<string, ProfileSpec>;
export type ProfileId = keyof typeof PROFILES;
export const PROFILE_IDS = Object.keys(PROFILES) as ProfileId[];

export const PROFILE_LABEL: Readonly<Record<ProfileId, string>> = {
  alvo_2: "alvo de 2 por cento, saida se cair 1,5, ate 24 horas",
  alvo_5: "alvo de 5 por cento, saida se cair 4, ate 12 horas",
  alvo_10: "alvo de 10 por cento, saida se cair 6, ate 36 horas",
  alvo_20: "alvo de 20 por cento, saida se cair 10, ate 5 dias",
};

/** A target is offered when it is touched at least this often over its horizon, and a stop when it is touched no more than this (otherwise it is noise). Driftless: it does not predict direction. */
export const OFFER = { minTargetTouch: 0.15, maxStopTouch: 0.75 } as const;

/**
 * The chance that a driftless price touches a level at some moment within `hours`, given the size of a normal hour's move (reflection principle on the log price). `distancePct` is how far the level is, in
 * percent of the current price. Null when the inputs cannot give a probability.
 */
export function touchProbability(distancePct: number, sigmaHourPct: number, hours: number, direction: "up" | "down"): number | null {
  if (![distancePct, sigmaHourPct, hours].every(Number.isFinite) || distancePct <= 0 || sigmaHourPct <= 0 || hours <= 0) return null;
  if (direction === "down" && distancePct >= 100) return null;
  const barrier = direction === "up" ? Math.log(1 + distancePct / 100) : -Math.log(1 - distancePct / 100);
  const z = barrier / ((sigmaHourPct / 100) * Math.sqrt(hours));
  return 2 * (1 - normalCdf(z));
}

/** The profiles a token with this hourly volatility can be given. A market too quiet for the target, or so wild that the stop is noise, gets none, and so cannot be bought with a plan. */
export function offeredProfiles(sigmaHourPct: number | null): ProfileId[] {
  if (sigmaHourPct === null || !Number.isFinite(sigmaHourPct) || sigmaHourPct <= 0) return [];
  return PROFILE_IDS.filter((id) => {
    const p = PROFILES[id];
    const up = touchProbability(p.targetPct, sigmaHourPct, p.horizonH, "up");
    const down = touchProbability(p.stopPct, sigmaHourPct, p.horizonH, "down");
    return up !== null && down !== null && up >= OFFER.minTargetTouch && down <= OFFER.maxStopTouch;
  });
}

/**
 * A market so wild that the stop of every profile is noise has no profile that fits by the rule above. It used to be closed for it; now every profile stays on offer and this widest one only names the case: the caller
 * marks the purchase `volatilidade_extrema` and the model weighs the noise with the rest (the stop of a profile sizes nothing any more). Null when the market is not wild: it has profiles of its own, or no target is
 * reachable, or nothing is known of it.
 */
export function wildProfile(sigmaHourPct: number | null): ProfileId | null {
  if (sigmaHourPct === null || !Number.isFinite(sigmaHourPct) || sigmaHourPct <= 0 || offeredProfiles(sigmaHourPct).length > 0) return null;
  const p = PROFILES.alvo_20;
  const up = touchProbability(p.targetPct, sigmaHourPct, p.horizonH, "up");
  const down = touchProbability(p.stopPct, sigmaHourPct, p.horizonH, "down");
  return up !== null && down !== null && up >= OFFER.minTargetTouch ? "alvo_20" : null;
}

export const planKey = (chainIndex: string, address: string): string => `${chainIndex}:${chainIndex === "501" ? address : address.toLowerCase()}`;

export interface PositionPlan {
  readonly key: string;
  readonly chainIndex: string;
  readonly address: string;
  readonly symbol: string;
  readonly profile: ProfileId;
  readonly entryPriceUsd: number;
  readonly entryAtMs: number;
  /** The highest price seen since the entry. */
  readonly peakPriceUsd: number;
  readonly targetHit: boolean;
  /** Half was already taken at the target. */
  readonly trimmed: boolean;
  readonly cycleId: string;
  /** Since when the wallet has shown this position as gone, without a reading that had it in between; absent or null while it is there. A plan is closed only after this lasts. */
  readonly goneSinceMs?: number | null;
}

export type PlanTrigger = "alvo_atingido" | "stop_atingido" | "trailing_atingido" | "tempo_esgotado";

const HOUR_MS = 3_600_000;

/** What the plan says about the price now. `alvo_atingido` stays true while the price is at or above the target and the half has not been taken yet (so a trim that was not carried out is not forgotten); an unknown price raises nothing. */
export function planTriggers(plan: PositionPlan, priceUsd: number | null, nowMs: number): PlanTrigger[] {
  const spec = PROFILES[plan.profile];
  const held = nowMs - plan.entryAtMs;
  const expired = (!plan.targetHit && held >= spec.horizonH * HOUR_MS) || held >= 2 * spec.horizonH * HOUR_MS;
  // time does not need a price: a position that has been held too long leaves even when nothing can be seen of its price
  if (priceUsd === null || !Number.isFinite(priceUsd) || priceUsd < 0) return expired ? ["tempo_esgotado"] : [];
  const out: PlanTrigger[] = [];
  if (priceUsd <= (plan.entryPriceUsd * (100 - spec.stopPct)) / 100) out.push("stop_atingido");
  if (!plan.trimmed && priceUsd >= (plan.entryPriceUsd * (100 + spec.targetPct)) / 100) out.push("alvo_atingido");
  if (plan.targetHit && priceUsd <= (plan.peakPriceUsd * (100 - spec.trailPct)) / 100) out.push("trailing_atingido");
  if (expired) out.push("tempo_esgotado");
  return out;
}

/** The exit the plan demands on its own: losses and expired time leave entirely; the target takes half, once. */
export function protectiveStance(triggers: readonly PlanTrigger[], trimmed: boolean): Extract<ExitStance, "trim_half" | "exit_all"> | null {
  if (triggers.some((t) => t === "stop_atingido" || t === "trailing_atingido" || t === "tempo_esgotado")) return "exit_all";
  if (triggers.includes("alvo_atingido") && !trimmed) return "trim_half";
  return null;
}

/** The plan as the model reads it: percentages and hours only. */
export interface PlanView {
  readonly profile: ProfileId;
  readonly sinceEntryPct: number | null;
  readonly toTargetPct: number | null;
  readonly toStopPct: number | null;
  readonly hoursHeld: number;
  readonly hoursLeft: number;
  readonly targetHit: boolean;
  readonly trimmed: boolean;
}

export function planView(plan: PositionPlan, priceUsd: number | null, nowMs: number): PlanView {
  const spec = PROFILES[plan.profile];
  const p = priceUsd !== null && Number.isFinite(priceUsd) && priceUsd > 0 ? priceUsd : null;
  const held = Math.max(0, nowMs - plan.entryAtMs) / HOUR_MS;
  return {
    profile: plan.profile,
    sinceEntryPct: p === null ? null : (p / plan.entryPriceUsd - 1) * 100,
    toTargetPct: p === null ? null : ((plan.entryPriceUsd * (1 + spec.targetPct / 100)) / p - 1) * 100,
    toStopPct: p === null ? null : (1 - (plan.entryPriceUsd * (1 - spec.stopPct / 100)) / p) * 100,
    hoursHeld: held,
    hoursLeft: Math.max(0, spec.horizonH - held),
    targetHit: plan.targetHit,
    trimmed: plan.trimmed,
  };
}

/* ---------------------------------------------------------------- the store */

export type PlanHealth = { readonly ok: true } | { readonly ok: false; readonly reason: "planos_ilegiveis" };

export interface PlanStore {
  health(): PlanHealth;
  get(key: string): PositionPlan | undefined;
  all(): readonly PositionPlan[];
  /** Opens a plan; false when one already exists or it could not be saved (no position may exist without its stop). */
  open(plan: PositionPlan): boolean;
  /** Raises the peak and notes the target; `highUsd` is the highest price since the last look, when the candles give it. */
  observe(key: string, priceUsd: number, nowMs: number, highUsd?: number): void;
  markTrimmed(key: string): void;
  /** The price a purchase was really filled at replaces the entry that was estimated before it (only meaningful right after the plan was opened). */
  reprice(key: string, priceUsd: number): void;
  /** The wallet showed the position: it is not gone. */
  seen(key: string): void;
  /** The wallet did not show the position; returns since when it has been absent (now, the first time). */
  absent(key: string, nowMs: number): number | null;
  close(key: string): void;
}

export interface PlanIo {
  readonly read: () => unknown;
  readonly write: (state: { readonly version: 1; readonly plans: Record<string, PositionPlan> }) => void;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parsePlan(raw: unknown): PositionPlan | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.key !== "string" || typeof o.chainIndex !== "string" || typeof o.address !== "string" || typeof o.symbol !== "string" || typeof o.cycleId !== "string") return null;
  if (typeof o.profile !== "string" || !Object.hasOwn(PROFILES, o.profile)) return null;
  if (!isNum(o.entryPriceUsd) || o.entryPriceUsd <= 0 || !isNum(o.entryAtMs) || !isNum(o.peakPriceUsd) || o.peakPriceUsd <= 0) return null;
  if (typeof o.targetHit !== "boolean" || typeof o.trimmed !== "boolean") return null;
  if (o.goneSinceMs !== undefined && o.goneSinceMs !== null && !isNum(o.goneSinceMs)) return null;
  return o as unknown as PositionPlan;
}

export function createPlanStore(io: PlanIo): PlanStore {
  const plans = new Map<string, PositionPlan>();
  let healthy = true;
  try {
    const raw = io.read();
    if (raw !== null) {
      const o = raw as { version?: unknown; plans?: unknown };
      if (o === null || typeof o !== "object" || o.version !== 1 || o.plans === null || typeof o.plans !== "object" || Array.isArray(o.plans)) throw new Error("shape");
      for (const [key, value] of Object.entries(o.plans)) {
        const plan = parsePlan(value);
        if (plan === null || plan.key !== key) throw new Error("shape");
        plans.set(key, plan);
      }
    }
  } catch {
    healthy = false;
    plans.clear();
  }

  const persist = (): boolean => {
    try {
      io.write({ version: 1, plans: Object.fromEntries(plans) });
      return true;
    } catch {
      return false;
    }
  };
  const update = (key: string, change: (p: PositionPlan) => PositionPlan): void => {
    const current = plans.get(key);
    if (current === undefined) return;
    const next = change(current);
    if (next === current) return;
    plans.set(key, next);
    persist();
  };

  return {
    health: () => (healthy ? { ok: true } : { ok: false, reason: "planos_ilegiveis" }),
    get: (key) => plans.get(key),
    all: () => [...plans.values()],
    open(plan) {
      if (!healthy || plans.has(plan.key) || parsePlan(plan) === null) return false;
      plans.set(plan.key, plan);
      if (!persist()) {
        plans.delete(plan.key);
        return false;
      }
      return true;
    },
    observe(key, priceUsd, _nowMs, highUsd) {
      update(key, (p) => {
        const high = Math.max(priceUsd, highUsd ?? priceUsd);
        const peak = Math.max(p.peakPriceUsd, high);
        const hit = p.targetHit || peak >= (p.entryPriceUsd * (100 + PROFILES[p.profile].targetPct)) / 100;
        return peak === p.peakPriceUsd && hit === p.targetHit ? p : { ...p, peakPriceUsd: peak, targetHit: hit };
      });
    },
    markTrimmed: (key) => update(key, (p) => (p.trimmed ? p : { ...p, trimmed: true })),
    reprice: (key, priceUsd) => {
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) return;
      update(key, (p) => (p.targetHit ? p : { ...p, entryPriceUsd: priceUsd, peakPriceUsd: priceUsd }));
    },
    seen: (key) => update(key, (p) => (p.goneSinceMs === undefined || p.goneSinceMs === null ? p : { ...p, goneSinceMs: null })),
    absent(key, nowMs) {
      const current = plans.get(key);
      if (current === undefined) return null;
      if (current.goneSinceMs !== undefined && current.goneSinceMs !== null) return current.goneSinceMs;
      update(key, (p) => ({ ...p, goneSinceMs: nowMs }));
      return nowMs;
    },
    close(key) {
      if (plans.delete(key)) persist();
    },
  };
}

/** Atomic file persistence: a half-written file is never read back. A missing file is an empty store; an unreadable one makes it unhealthy. */
export function planFileStore(path: string): PlanIo {
  return {
    read: () => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as unknown) : null),
    write: (state) => {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(state)}\n`);
      renameSync(tmp, path);
    },
  };
}
