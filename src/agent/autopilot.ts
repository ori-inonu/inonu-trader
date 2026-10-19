/**
 * The autopilot of the settings (AUT-27): nothing the agent runs on is typed by a person. The caps, the risk taken, the reserve, the rhythm and the networks are worked out here from what is known (what the
 * wallet it manages is worth, what the owner's own policy in the OKX portal allows, whether the shadow has earned a bolder stance) and from the mandate the model chose. Every number stays under the app's hard
 * ceilings; each value comes with the reason it has, so the screen can say why. A configuration marked as manual (only through the API, never the screen) keeps its own values. Pure: no clock, no network.
 */
import { SIZING } from "../opportunity/sizing";
import type { AgentConfig } from "./config";
import { DEFAULT_CAPS, type AgentCaps, type PolicyMirror } from "./gate";
import type { Look, Mandate, Reserve, Risk } from "./mandate";

/** What one word of the mandate means in numbers. All CHOICES of this code, conservative and not calibrated. */
export const RISK_PCT: Readonly<Record<Risk, number>> = { cauteloso: 0.005, moderado: 0.01, agressivo: 0.02 };
export const RESERVE_SHARE: Readonly<Record<Reserve, number>> = { baixa: 0.1, media: 0.2, alta: 0.35 };
export const INTERVAL_MIN: Readonly<Record<Look, number>> = { rapido: 5, normal: 10, calmo: 20 };
const REFRESH_MIN: Readonly<Record<Look, number>> = { rapido: 30, normal: 60, calmo: 120 };

/**
 * The owner's own risk profile. On 2026-10-14 the owner said, in the chat, that the profile is NOT conservative: it is bold (arrojado), the work is financial leverage and growth of capital, and nothing should
 * hold the agent back from looking for profit at every moment (the model still only acts when it sees one). So the mandate in force is the aggressive one and the agent does not wait for the measurement to earn it.
 * What stays: the app's hard ceilings, the owner's policy in the OKX portal, the stop of every plan, the circuit breaker, a tenth of the portfolio as the most any one stop-sized purchase may take, and the
 * conviction the model must show for a purchase. "livre" is the older behaviour: the mandate the model chose, and the aggressive stance only once the Placar earned it.
 */
export type OwnerProfile = "arrojado" | "livre";

/**
 * What the owner authorized, in the chat, kept as facts the screen and the Jev can read. On 2026-10-14 the owner said that the system IS authorized to operate financial leverage (the screen had said "off, the owner's
 * decision": that was the agent's own wording, left off while the owner had not answered, and it was wrong). `granted` is the authorization; `instruments` are the leverage instruments the code can really operate today
 * and it is EMPTY: no borrow, margin or perpetual path is implemented yet (docs/sdd/agente-autonomo/ALAVANCAGEM-VIABILIDADE-20261014.md). An authorization without an instrument is what it says: nothing leverages yet.
 */
export interface OwnerAuthorizations {
  readonly leverage: { readonly granted: boolean; readonly since: string; readonly instruments: readonly string[] };
}
export const OWNER_AUTHORIZATIONS: OwnerAuthorizations = { leverage: { granted: true, since: "2026-10-14", instruments: [] } };
export const OWNER_PROFILE: OwnerProfile = "arrojado";
export const AGGRESSIVE_MANDATE: Mandate = { risk: "agressivo", reserve: "baixa", concentration: "grande", look: "rapido" };

/** While the market has something to offer (a purchase open, or a level of risk that would open one) the agent looks this often, in minutes, whatever its rhythm. */
export const HOT_INTERVAL_MIN = 2;

/** The interval between looks: the rhythm, or the hot interval when it is shorter and the market is hot. A rhythm that is not a number is left as it is. */
export const effectiveIntervalMin = (rhythmMin: number, hot: boolean, hotMin: number = HOT_INTERVAL_MIN): number => (hot && Number.isFinite(rhythmMin) ? Math.min(rhythmMin, hotMin) : rhythmMin);

/**
 * The fastest hot interval the owner's bold profile may keep, in minutes (the owner's request of 2026-10-15: decide faster, the clock of two minutes is too slow). It is a FLOOR, not a rhythm: the interval is
 * what the day's capacity of consultations can pay (`boldHotIntervalMin`), so a day with capacity left over looks faster and a day without it does not. The other profiles keep `HOT_INTERVAL_MIN`.
 */
export const BOLD_HOT_FLOOR_MIN = 1;

/**
 * The hot interval under the bold profile: what is left of the day's capacity of consultations spread evenly over what is left of the UTC day (the day of the budget), never under `BOLD_HOT_FLOOR_MIN`. With the whole
 * capacity of 720 and the whole day that is the two minutes of before; with capacity left over (an earlier part of the day looked less than it could) it is shorter, down to one minute. The capacity itself is NOT raised:
 * it stays sized for a look every `HOT_INTERVAL_MIN` minutes (`wire.ts`), so the cap is the limit and the budget's own pace of the day still guards it. With no capacity left the interval is unbounded: the rhythm
 * of the mandate rules and the budget refuses the look. Rounded to two places so the screen and the timers read the same number. Pure.
 */
export function boldHotIntervalMin(input: { readonly remainingConsults: number; readonly remainingMs: number }): number {
  if (!Number.isFinite(input.remainingConsults) || input.remainingConsults <= 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(input.remainingMs) || input.remainingMs <= 0) return BOLD_HOT_FLOOR_MIN;
  return Math.max(BOLD_HOT_FLOOR_MIN, Math.round((input.remainingMs / 60_000 / input.remainingConsults) * 100) / 100);
}

/** The quota of a tier of the data provider as the gateway counts it: what was used today (UTC day), the monthly cap, and optionally the month's total used so far; null when the cap is not known. */
export interface QuotaTier {
  readonly today: number;
  readonly cap: number | null;
  readonly used?: number;
}

/**
 * Whether the quick rhythm can be paid for. The provider's free plan is a monthly quota, and the gateway refuses background calls once a day goes past one and a half times the monthly average (`budget.ts`): a market
 * looked at every two minutes uses that in half a day and leaves the agent blind until midnight. So the quick rhythm lasts while the use of the day stays under the fair burn of the day (the share of the day gone
 * plus a head start of fifteen percent, or thirty-five percent when unused quota from earlier days of the month covers the full 1.5x daily ceiling for every remaining day until the UTC month resets) of that allowance,
 * on the busiest tier; past it, the normal rhythm keeps the quota alive until the day ends. No cap known is no limit. CHOICES of this code, not calibrated.
 */
export function hotWithinQuota(tiers: { readonly basic: QuotaTier; readonly premium: QuotaTier }, nowMs: number): boolean {
  const d = new Date(nowMs);
  const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const remainingDays = Math.max(1, days - d.getUTCDate() + 1);
  const elapsed = (nowMs - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86_400_000;
  for (const t of [tiers.basic, tiers.premium]) {
    if (t.cap === null || !Number.isFinite(t.cap) || t.cap <= 0) continue;
    if (!Number.isFinite(t.today)) return false;
    if (t.used !== undefined && (!Number.isFinite(t.used) || t.used >= t.cap)) return false;
    const allowance = (1.5 * t.cap) / days;
    const usedBeforeToday = t.used !== undefined && t.used >= t.today ? t.used - t.today : null;
    const remainingPerDay = usedBeforeToday !== null ? Math.max(0, t.cap - usedBeforeToday) / remainingDays : null;
    const headStart = remainingPerDay !== null && remainingPerDay >= allowance ? 0.35 : 0.15;
    if (t.today >= allowance * Math.min(1, elapsed + headStart)) return false;
  }
  return true;
}

export interface AutopilotFacts {
  /** What the wallet the agent manages is worth, in dollars; null when unknown. */
  readonly capitalUsd: number | null;
  /** The owner's policy, when the signing tool reported one. */
  readonly policy: PolicyMirror | null;
  /** The shadow has measured an edge over keeping dollars: only then may the agent take the aggressive stance. */
  readonly evidenceOk: boolean;
}

/** Where a setting comes from. `sem_teto`: the owner decided on 2026-10-14 that the agent has no daily or per-purchase ceiling (docs/sdd/agente-autonomo/ADENDO-B-autonomia-economica.md). */
export type Source = "automatico" | "manual" | "politica_do_dono" | "limitado_pela_evidencia" | "capital_desconhecido" | "perfil_do_dono" | "sem_teto";

export interface EffectiveSettings {
  readonly caps: AgentCaps;
  readonly riskPct: number;
  readonly reserveShare: number;
  readonly intervalMin: number;
  readonly refreshMin: number;
  readonly chains: readonly string[];
  /** The mandate in force and the risk actually taken (the model may ask for more than the evidence allows). */
  readonly mandate: Mandate;
  readonly riskTaken: Risk;
  /** Why each value is what it is. */
  readonly source: Readonly<Record<"caps" | "riskPct" | "reserveShare" | "rhythm" | "chains", Source>>;
}

export function deriveSettings(config: AgentConfig, facts: AutopilotFacts, modelMandate: Mandate, profile: OwnerProfile = OWNER_PROFILE): EffectiveSettings {
  // the owner's bold profile is the mandate in force; otherwise it is the one the model chose, with the aggressive stance only once the measurement has earned it
  const mandate = profile === "arrojado" ? AGGRESSIVE_MANDATE : modelMandate;
  const riskTaken: Risk = profile === "arrojado" ? "agressivo" : mandate.risk === "agressivo" && !facts.evidenceOk ? "moderado" : mandate.risk;
  if (!config.auto) {
    return {
      caps: config.caps,
      riskPct: config.riskPct ?? SIZING.defaultRiskPct,
      reserveShare: SIZING.reserveShare,
      intervalMin: config.intervalMin,
      refreshMin: config.refreshMin,
      chains: config.chains,
      mandate,
      riskTaken,
      source: { caps: "manual", riskPct: "manual", reserveShare: "manual", rhythm: "manual", chains: "manual" },
    };
  }

  // no ceiling is worked out from the wallet: the owner decided that the size and the risk of an operation are the Jev's to manage. The owner's own limits in the OKX portal are not a cap of this app either: they are
  // a restriction of the provider that bounds the alternatives a purchase is offered with (candidates.ts) and that the wallet enforces whatever is planned.
  return {
    caps: DEFAULT_CAPS,
    riskPct: RISK_PCT[riskTaken],
    reserveShare: RESERVE_SHARE[mandate.reserve],
    intervalMin: INTERVAL_MIN[mandate.look],
    refreshMin: REFRESH_MIN[mandate.look],
    chains: config.chains,
    mandate,
    riskTaken,
    source: {
      caps: "sem_teto",
      riskPct: profile === "arrojado" ? "perfil_do_dono" : mandate.risk !== riskTaken ? "limitado_pela_evidencia" : "automatico",
      reserveShare: "automatico",
      rhythm: "automatico",
      chains: "automatico",
    },
  };
}
