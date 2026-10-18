/**
 * The gate of one cycle and the caps of the agent (AUT-4, AUT-13). The gate fails closed: every fact it needs is required, and unknown is a block, never a pass. The caps are small by default and under
 * hard ceilings no setting can pass; they are the app's own limit, and the owner's policy in the OKX portal is the independent backstop the money mode refuses to run without. Pure: the cycle reads
 * the facts and hands them in.
 */
import { SIZING } from "../opportunity/sizing";
import { SALDO_MAX_AGE_MS } from "../opportunity/ecosystem";
import type { LedgerHealth } from "./ledger";
import type { PlanHealth } from "./plans";
import type { Mode, PlannedOrder } from "./types";

/** The exchange refuses a signature when the clock is more than 30 s away; a margin is kept. */
export const MAX_CLOCK_SKEW_MS = 20_000;
export const MAX_BOOK_AGE_MS = SALDO_MAX_AGE_MS;

/** What the owner set in the OKX portal, as read from the signing tool (A1.3). Every field must be present for the money mode to run. */
export interface PolicyMirror {
  /** `singleTxLimit` when its flag is on, else null. */
  readonly perTxUsd: number | null;
  /** `dailyTradeTxLimit` when its flag is on, else null. */
  readonly dailyTradeUsd: number | null;
  /** `dailyTransferTxLimit` when its flag is on, else null. */
  readonly dailyTransferUsd: number | null;
  /** Money cannot leave the account freely: the transfer rule is on and within the loosest limit this app accepts. The agent never transfers, so this is the guard against a stolen session. */
  readonly transferGuarded: boolean;
}

export interface LimitedFacts {
  readonly policy: PolicyMirror | null;
  readonly sessionExpiresAtMs: number | null;
  readonly nowMs: number;
  /** How long a cycle may take at most; the session must outlive it. */
  readonly cycleBudgetMs: number;
  /** The address of the sub-wallet is the one expected; null when it could not be checked. */
  readonly addressMatches: boolean | null;
  /** The signing tool binary has the hash that was verified; null when it could not be checked. */
  readonly binaryOk: boolean | null;
  /** This machine's clock minus the exchange's, in ms, as measured (not corrected): the CLI signs with the real clock. Null when unknown. */
  readonly localSkewMs: number | null;
}

export interface GateInputs {
  readonly state: { readonly mode: Mode; readonly stopped: boolean };
  readonly stopFilePresent: boolean;
  /** Our clock minus the exchange's, in ms; null when unknown. */
  readonly clockSkewMs: number | null;
  /** Age of the wallet reading, in ms; null when unknown. */
  readonly bookAgeMs: number | null;
  readonly ledger: LedgerHealth;
  /** The plans of the positions (stop, target, time). Without them a position has no stop, so the money mode does not run. */
  readonly plans: PlanHealth;
  /** Required for the mode that moves money. */
  readonly limited: LimitedFacts | null;
  /** The owner's policy in the OKX portal is a condition of the money mode (the default: nothing but an explicit false relaxes it). Relaxed, the policy only narrows the caps and is never a condition. */
  readonly requireOwnerPolicy?: boolean;
}

export type GateReason =
  | "parado"
  | "desligado"
  | "arquivo_stop"
  | "ledger_corrompido"
  | "planos_ilegiveis"
  | "relogio"
  | "carteira_antiga"
  | "conta_ilegivel"
  | "politica_ausente"
  | "politica_frouxa"
  | "sessao_expirando"
  | "endereco_divergente"
  | "binario_divergente";

export type GateVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: GateReason };

/**
 * A ceiling in dollars, or `null`: NO ceiling. On 2026-10-14 the owner decided the agent has no daily limit of purchases or sales and no limit per purchase: the Jev manages the size and the risk (docs/sdd/agente-autonomo/
 * ADENDO-B-autonomia-economica.md). `null` is used, and not `Infinity`, so that "no ceiling" is explicit and survives JSON; a number is a ceiling somebody chose on purpose.
 */
export type Cap = number | null;

export interface AgentCaps {
  /** One purchase, in dollars. */
  readonly maxBuyUsd: Cap;
  readonly maxDailyBuyUsd: Cap;
  readonly maxDailySellUsd: Cap;
}

/** The loosest owner policy in the OKX portal the money mode accepts as an independent backstop: a condition of the money mode, not a cap of this app. */
export const HARD_CAPS = { policyPerTxUsd: 500, policyDailyUsd: 2000 } as const;
export const DEFAULT_CAPS: AgentCaps = { maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null };

/** Whether `next` lets the agent spend more than `current` does: no ceiling is the loosest, and a bigger number is looser than a smaller one. */
export const capRaised = (next: Cap, current: Cap): boolean => (next === null ? current !== null : current !== null && next > current);

export function validateCaps(caps: AgentCaps): void {
  const ok = (v: Cap) => v === null || (typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!ok(caps.maxBuyUsd) || !ok(caps.maxDailyBuyUsd) || !ok(caps.maxDailySellUsd)) throw new Error("a cap is null (no cap) or a positive number of dollars");
  if (caps.maxBuyUsd !== null && caps.maxDailyBuyUsd !== null && caps.maxBuyUsd > caps.maxDailyBuyUsd) throw new Error("a purchase cap above the daily purchase cap");
}

export function gate(input: GateInputs): GateVerdict {
  const { state } = input;
  if (state.stopped) return { ok: false, reason: "parado" };
  if (state.mode === "desligado") return { ok: false, reason: "desligado" };
  if (input.stopFilePresent) return { ok: false, reason: "arquivo_stop" };
  if (!input.ledger.ok) return { ok: false, reason: input.ledger.reason };
  if (input.clockSkewMs === null || !Number.isFinite(input.clockSkewMs) || Math.abs(input.clockSkewMs) > MAX_CLOCK_SKEW_MS) return { ok: false, reason: "relogio" };
  if (input.bookAgeMs === null || !Number.isFinite(input.bookAgeMs) || input.bookAgeMs < -5_000 || input.bookAgeMs > MAX_BOOK_AGE_MS) return { ok: false, reason: "carteira_antiga" };
  if (state.mode !== "limitado") return { ok: true };
  if (!input.plans.ok) return { ok: false, reason: input.plans.reason };

  const l = input.limited;
  if (l === null) return { ok: false, reason: "conta_ilegivel" };
  // the root cause first: a binary that does not verify says nothing true about the policy or the account it reports
  if (l.binaryOk !== true) return { ok: false, reason: "binario_divergente" };
  if (l.addressMatches !== true) return { ok: false, reason: "endereco_divergente" };
  if (l.localSkewMs === null || !Number.isFinite(l.localSkewMs) || Math.abs(l.localSkewMs) > MAX_CLOCK_SKEW_MS) return { ok: false, reason: "relogio" };
  // the owner's policy in the portal: a condition unless the host relaxed it (then it only narrows the caps, in autopilot.ts). The caps of the agent itself hold either way.
  if (input.requireOwnerPolicy !== false) {
    const p = l.policy;
    if (p === null || p.perTxUsd === null || p.dailyTradeUsd === null || p.dailyTransferUsd === null || !p.transferGuarded || ![p.perTxUsd, p.dailyTradeUsd, p.dailyTransferUsd].every(Number.isFinite)) return { ok: false, reason: "politica_ausente" };
    if (p.perTxUsd > HARD_CAPS.policyPerTxUsd || p.dailyTradeUsd > HARD_CAPS.policyDailyUsd) return { ok: false, reason: "politica_frouxa" };
  }
  if (l.sessionExpiresAtMs === null || !Number.isFinite(l.sessionExpiresAtMs) || !Number.isFinite(l.nowMs) || l.sessionExpiresAtMs - l.nowMs < l.cycleBudgetMs) return { ok: false, reason: "sessao_expirando" };
  return { ok: true };
}

export interface CapResult {
  readonly orders: readonly PlannedOrder[];
  readonly dropped: readonly { readonly candidateId: string; readonly reason: string }[];
}

/** What share of the owner's per-transaction limit a part of a sale may use: the price moves between the quote and the signature, and a part at exactly the limit could be refused by the account. */
const PART_SHARE = 0.95;

/**
 * A sale worth more than the owner's per-transaction limit (the account refuses it whole) is cut to a part that fits, pro rata from the balance in whole minor units. The rest stays in the wallet: the part is
 * in flight until its receipt (the token is held), and the next look cuts again from the balance it then reads, until what is left fits and goes whole. A sale of unknown worth, a purchase, the person's own wallet,
 * an order with no amount and a policy with no limit are left as they are. Pure.
 */
export function splitToPolicy(orders: readonly PlannedOrder[], perTxUsd: number | null): readonly PlannedOrder[] {
  if (perTxUsd === null || !Number.isFinite(perTxUsd) || perTxUsd <= 0) return orders;
  const partUsd = Math.floor(perTxUsd * PART_SHARE);
  if (partUsd < 1) return orders;
  return orders.map((o) => {
    if (o.side !== "sell" || o.wallet !== "agente" || o.amountMinor === null || !/^[1-9]\d*$/.test(o.amountMinor) || !Number.isFinite(o.usd) || o.usd <= partUsd) return o;
    const amount = (BigInt(o.amountMinor) * BigInt(partUsd * 100)) / BigInt(Math.round(o.usd * 100));
    return amount <= 0n || amount >= BigInt(o.amountMinor) ? o : { ...o, usd: partUsd, amountMinor: amount.toString() };
  });
}

/**
 * Cuts the plan to the ceilings somebody WROTE; with none (the default) it only refuses what is not an order. A purchase above a per-order or a daily ceiling is cut to what is left, to the fraction, with no minimum
 * order and no rounding to the dollar; a sale is never cut by the per-order ceiling, because leaving a position is how risk is reduced, but a daily sale ceiling holds. What the agent already sent today counts. An order
 * of the principal wallet is not the agent's spending: it is prepared for the person and passes through. Pure.
 */
export function applyCaps(orders: readonly PlannedOrder[], caps: AgentCaps, spentToday: { readonly buy: number; readonly sell: number }): CapResult {
  let buy = spentToday.buy;
  let sell = spentToday.sell;
  const kept: PlannedOrder[] = [];
  const dropped: { candidateId: string; reason: string }[] = [];
  // a ceiling that is not null and not a number stops what it would have governed: it must not slide through every comparison
  const broken = (cap: Cap): boolean => cap !== null && !Number.isFinite(cap);
  for (const o of orders) {
    if (o.wallet === "principal") {
      kept.push(o);
      continue;
    }
    // a number that is not a number must not slide through and poison the day's sums
    // (the exit a plan demands may be worth zero or unknown dollars: it is risk control worked out from the balance, so zero is allowed there and nothing else is)
    if (!Number.isFinite(o.usd) || o.usd < 0 || (o.usd === 0 && o.source !== "protecao")) {
      dropped.push({ candidateId: o.candidateId, reason: "valor_invalido" });
      continue;
    }
    if (o.side === "buy") {
      const governed = caps.maxBuyUsd !== null || caps.maxDailyBuyUsd !== null;
      if (broken(caps.maxBuyUsd) || broken(caps.maxDailyBuyUsd) || (caps.maxDailyBuyUsd !== null && !Number.isFinite(buy))) {
        dropped.push({ candidateId: o.candidateId, reason: "gasto_desconhecido" });
        continue;
      }
      const left = caps.maxDailyBuyUsd === null ? Number.POSITIVE_INFINITY : caps.maxDailyBuyUsd - buy;
      const usd = Math.min(o.usd, caps.maxBuyUsd ?? Number.POSITIVE_INFINITY, left);
      if (usd <= 0) {
        dropped.push({ candidateId: o.candidateId, reason: "teto_diario" });
        continue;
      }
      if (Number.isFinite(buy)) buy += usd;
      kept.push(governed && usd < o.usd ? { ...o, usd } : o);
    } else if (o.source === "protecao") {
      // the plan of a position leaves when it must: a daily ceiling would trap the person in a loss (the owner's policy in the portal is the backstop)
      sell += o.usd;
      kept.push(o);
    } else {
      if (broken(caps.maxDailySellUsd) || (caps.maxDailySellUsd !== null && !Number.isFinite(sell))) {
        dropped.push({ candidateId: o.candidateId, reason: "gasto_desconhecido" });
        continue;
      }
      if (caps.maxDailySellUsd !== null && sell + o.usd > caps.maxDailySellUsd) {
        dropped.push({ candidateId: o.candidateId, reason: "teto_diario" });
        continue;
      }
      if (Number.isFinite(sell)) sell += o.usd;
      kept.push(o);
    }
  }
  return { orders: kept, dropped };
}
