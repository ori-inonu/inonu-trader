/**
 * What the model answered, checked, and the orders the code works out from it (AUT-2, AUT-4). The model chooses a posture for the whole portfolio and ONE stance for each candidate, always among closed
 * ids the code offered; it never writes an amount. This module refuses anything outside what was offered, and then the code, not the model, sizes every order: sales by exact fraction of the balance,
 * purchases by the ceiling the sizing module computed, scaled to the cash that is really there. Pure: no clock, no network, no storage.
 */
import type { Saldo } from "../opportunity/ecosystem";
import { minBuyUsd } from "./candidates";
import { sellPlan } from "./exit";
import { parseMandate } from "./mandate";
import { AGENT_BUY_SIZES } from "./sizing-agent";
import { POSTURES, type Book, type Candidate, type Decision, type ExitStance, type PlannedOrder, type Posture } from "./types";

export const MAX_SELLS_PER_CYCLE = 4;
export const MAX_BUYS_PER_CYCLE = 2;

export type DecisionVerdict =
  | { readonly ok: true; readonly decision: Decision }
  | { readonly ok: false; readonly reason: "agente_forma" | "agente_mandato" | "agente_postura" | "agente_estados" | "agente_postura_invalida" | "agente_compra_e_venda" | "agente_perfil_invalido" };

const rec = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const tokenOf = (c: Candidate): string => {
  const token = c.kind === "buy" ? c.id.slice("buy:".length) : c.id.slice("hold:".length, c.id.lastIndexOf("@"));
  // an EVM address is the same token in any case; a Solana one is case-sensitive
  return token.startsWith("token:501:") ? token : token.toLowerCase();
};

export function validateDecision(raw: unknown, candidates: readonly Candidate[]): DecisionVerdict {
  const answer = rec(raw);
  const stances = rec(answer?.stances);
  if (answer === null || stances === null) return { ok: false, reason: "agente_forma" };
  if (typeof answer.posture !== "string" || !(POSTURES as readonly string[]).includes(answer.posture)) return { ok: false, reason: "agente_postura" };
  const posture = answer.posture as Posture;
  if (Object.keys(stances).length !== candidates.length || !candidates.every((c) => Object.hasOwn(stances, c.id))) return { ok: false, reason: "agente_estados" };
  const profilesRaw = answer.profiles === undefined ? {} : rec(answer.profiles);
  if (profilesRaw === null) return { ok: false, reason: "agente_forma" };
  // the mandate is optional in an answer (the one in force stays), but a mandate that is there must be made of the options offered
  const mandate = answer.mandate === undefined ? null : parseMandate(answer.mandate);
  if (answer.mandate !== undefined && mandate === null) return { ok: false, reason: "agente_mandato" };
  const profiles: Record<string, string> = {};
  const sold = new Set<string>();
  const bought = new Set<string>();
  const final: Record<string, string> = {};
  for (const c of candidates) {
    const stance = stances[c.id];
    if (typeof stance !== "string" || !c.stances.includes(stance)) return { ok: false, reason: "agente_postura_invalida" };
    final[c.id] = stance;
    if (c.kind === "buy" && stance !== "skip") {
      // every purchase that is not skipped goes with a profile of target and stop that the code offered for it (checked against the answer as it came)
      const profile = profilesRaw[c.id];
      if (typeof profile !== "string" || !c.profiles.includes(profile)) return { ok: false, reason: "agente_perfil_invalido" };
      // the posture the Jev declares is recorded and limits nothing: the stance of each candidate is the decision
      bought.add(tokenOf(c));
      profiles[c.id] = profile;
    }
    if (c.kind === "holding" && stance !== "hold") sold.add(tokenOf(c));
    // a holding the agent did not open may be given a plan: the model picks among the profiles the code offered. A profile that was not offered, or none, only means no plan (it never spoils the rest of the decision), and a holding that is being sold has nothing to protect.
    if (c.kind === "holding" && stance !== "exit_all" && c.profiles.length > 0) {
      const profile = profilesRaw[c.id];
      if (typeof profile === "string" && c.profiles.includes(profile)) profiles[c.id] = profile;
    }
  }
  for (const token of sold) if (bought.has(token)) return { ok: false, reason: "agente_compra_e_venda" };
  return { ok: true, decision: { posture, mandate, stances: Object.fromEntries(candidates.map((c) => [c.id, final[c.id] as string])), profiles } };
}

export interface Plan {
  /** In the order they would be carried out: sales first. */
  readonly orders: readonly PlannedOrder[];
  /** Chosen and not turned into an order, with the reason, so nothing the model chose disappears without a trace. */
  readonly dropped: readonly { readonly candidateId: string; readonly reason: string }[];
}

export function planOrders(decision: Decision, candidates: readonly Candidate[], book: Book, saldo: Saldo | null, minBuy: (chainIndex: string) => number = minBuyUsd): Plan {
  const dropped: { candidateId: string; reason: string }[] = [];
  const positionOf = new Map(book.positions.map((p) => [`hold:${p.id}@${p.wallet}`, p]));

  const sells: PlannedOrder[] = [];
  for (const c of candidates) {
    const stance = decision.stances[c.id];
    if (c.kind !== "holding" || stance === undefined || stance === "hold") continue;
    const position = positionOf.get(c.id);
    const sale = position === undefined ? null : sellPlan(position, stance as Exclude<ExitStance, "hold">);
    if (position === undefined || sale === null) {
      dropped.push({ candidateId: c.id, reason: "sem_ordem" });
      continue;
    }
    sells.push({ candidateId: c.id, side: "sell", stance, chainIndex: c.chainIndex, symbol: c.symbol, address: c.address, usd: sale.usd, amountMinor: sale.amountMinor, wallet: position.wallet, profile: null, source: "modelo" });
  }
  sells.sort((a, b) => b.usd - a.usd);
  for (const extra of sells.splice(MAX_SELLS_PER_CYCLE)) dropped.push({ candidateId: extra.candidateId, reason: "limite_de_ordens" });

  const chosen = candidates.filter((c) => c.kind === "buy" && (AGENT_BUY_SIZES as readonly string[]).includes(decision.stances[c.id] ?? ""));
  const wanted = chosen.slice(0, MAX_BUYS_PER_CYCLE);
  for (const extra of chosen.slice(MAX_BUYS_PER_CYCLE)) dropped.push({ candidateId: extra.id, reason: "limite_de_ordens" });
  const buys: PlannedOrder[] = [];
  if (saldo === null) {
    for (const c of wanted) dropped.push({ candidateId: c.id, reason: "sem_saldo" });
  } else {
    // the size is the one the Jev chose, in dollars worked out when the sizes were offered: it is carried out EXACTLY or refused with a named reason, never made smaller or scaled in silence. Two purchases of the same
    // network that together pass its cash cannot both go: the one the Jev ranked first stands whole and the other is refused (`caixa_insuficiente`), and the next look offers it again with the cash that is then there.
    const cashLeft = new Map(saldo.chains.map((x) => [x.chainIndex, x.cashUsd]));
    for (const c of wanted) {
      const stance = decision.stances[c.id] as string;
      const usd = c.usdByStance[stance] ?? 0;
      const left = cashLeft.get(c.chainIndex) ?? 0;
      if (!(usd > 0)) dropped.push({ candidateId: c.id, reason: "sem_tamanho" });
      else if (usd > left + 1e-9) dropped.push({ candidateId: c.id, reason: "caixa_insuficiente" });
      else if (usd < minBuy(c.chainIndex)) dropped.push({ candidateId: c.id, reason: "abaixo_do_minimo_da_rede" });
      else {
        cashLeft.set(c.chainIndex, left - usd);
        buys.push({ candidateId: c.id, side: "buy", stance, chainIndex: c.chainIndex, symbol: c.symbol, address: c.address, usd, amountMinor: null, wallet: "agente", profile: decision.profiles[c.id] ?? null, source: "modelo" });
      }
    }
  }
  return { orders: [...sells, ...buys], dropped };
}
