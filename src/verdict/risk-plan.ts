/**
 * The risk plan (INT-1.1, VER-4): entry band, where the idea ends, the target, the reward over the risk NET of costs, and the size
 * for the risk the person chose. Pure arithmetic over numbers that were measured; the model never touches it, and it is not a
 * forecast of any price.
 *
 * Definitions (documented so that an independent script can recompute every number):
 *   - entry band: the limits of the zone; without a zone, the price now with the invalidation one ATR away;
 *   - entry reference: the price now when it is inside the band, else the nearest edge of the band (the price at which the idea
 *     would start if the price comes to it); the distance from the price to it is reported;
 *   - invalidation: the zone's own invalidation level; without one, one ATR(15m) beyond the entry reference;
 *   - target: the nearest candidate beyond the entry whose distance is at least the risk; otherwise 1.5 times the risk;
 *   - riscoBps = |entry - invalidation| / entry, alvoBps = |target - entry| / entry, both in bps of the entry reference;
 *   - custoBps = the round trip cost of the snapshot (fees, slippage and the quoted spread);
 *   - ganhoRiscoLiquido = (alvoBps - custoBps) / (riscoBps + custoBps), null when alvoBps <= custoBps;
 *   - size: riscoUsd = capital x riskPct / 100; notional = riscoUsd / ((riscoBps + custoBps) / 10000), capped at the capital (no
 *     leverage); quantity = notional / entry reference.
 */
import type { RiskPlan, RiskProfile, TargetCandidate, TargetKind } from "./types";

export const DEFAULT_TARGET_MULTIPLE = 1.5;

export interface PlanInput {
  readonly side: "compra" | "venda";
  readonly price: number;
  readonly zone: { readonly baixo: number; readonly alto: number; readonly invalidacao: number | null } | null;
  /** One ATR of the 15 minute bars in price units; the fallback for the invalidation and the unit when there is no zone. */
  readonly atr15m: number | null;
  readonly costRoundTripBps: number | null;
  readonly targets: readonly TargetCandidate[];
  readonly profile: RiskProfile | null;
}

export type PlanResult = { readonly ok: true; readonly plan: RiskPlan } | { readonly ok: false; readonly reason: "sem_preco" | "sem_invalidacao" | "ja_invalidada" | "sem_custo" | "faixa_invalida" };

const bps = (distance: number, base: number): number => (Math.abs(distance) / base) * 10_000;
const round = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits + 0;

export function riskPlan(input: PlanInput): PlanResult {
  const { side, price } = input;
  if (!Number.isFinite(price) || !(price > 0)) return { ok: false, reason: "sem_preco" };
  if (input.costRoundTripBps === null || !Number.isFinite(input.costRoundTripBps) || input.costRoundTripBps < 0) return { ok: false, reason: "sem_custo" };
  const atr = input.atr15m !== null && Number.isFinite(input.atr15m) && input.atr15m > 0 ? input.atr15m : null;
  const long = side === "compra";

  const baixo = input.zone === null ? price : input.zone.baixo;
  const alto = input.zone === null ? price : input.zone.alto;
  if (!(baixo <= alto) || !(baixo > 0)) return { ok: false, reason: "faixa_invalida" };

  // entry reference: the price if it is inside the band, else the edge it would meet first
  const entry = price >= baixo && price <= alto ? price : price > alto ? alto : baixo;
  const distanciaAteEntradaBps = bps(price - entry, price);

  let invalidacao: number | null = input.zone?.invalidacao ?? null;
  if (invalidacao === null && atr !== null) invalidacao = long ? entry - atr : entry + atr;
  if (invalidacao === null) return { ok: false, reason: "sem_invalidacao" };
  // the invalidation must be on the losing side of the entry
  if (long ? invalidacao >= entry : invalidacao <= entry) return { ok: false, reason: "sem_invalidacao" };
  // the price is already past the level that ends the idea: there is no plan to give
  if (long ? price <= invalidacao : price >= invalidacao) return { ok: false, reason: "ja_invalidada" };

  const risk = Math.abs(entry - invalidacao);
  const beyond = input.targets
    .filter((t) => Number.isFinite(t.preco) && (long ? t.preco > entry : t.preco < entry) && Math.abs(t.preco - entry) >= risk)
    .sort((a, b) => Math.abs(a.preco - entry) - Math.abs(b.preco - entry) || (a.tipo < b.tipo ? -1 : 1));
  let alvo: number;
  let alvoTipo: TargetKind;
  if (beyond[0] !== undefined) {
    alvo = beyond[0].preco;
    alvoTipo = beyond[0].tipo;
  } else {
    alvo = long ? entry + DEFAULT_TARGET_MULTIPLE * risk : entry - DEFAULT_TARGET_MULTIPLE * risk;
    alvoTipo = "multiplo";
  }

  const riscoBps = bps(entry - invalidacao, entry);
  const alvoBps = bps(alvo - entry, entry);
  const custoBps = input.costRoundTripBps;
  const ganhoRiscoLiquido = alvoBps > custoBps ? round((alvoBps - custoBps) / (riscoBps + custoBps), 2) : null;

  let tamanho: RiskPlan["tamanho"] = null;
  const p = input.profile;
  if (p !== null && p.capitalUsd !== null && p.riskPct !== null && Number.isFinite(p.capitalUsd) && Number.isFinite(p.riskPct) && p.capitalUsd > 0 && p.riskPct > 0 && p.riskPct <= 100) {
    const riscoUsd = (p.capitalUsd * p.riskPct) / 100;
    const wanted = riscoUsd / ((riscoBps + custoBps) / 10_000);
    const limited = wanted > p.capitalUsd;
    const notional = limited ? p.capitalUsd : wanted;
    tamanho = { riscoUsd: round(riscoUsd, 2), notionalUsd: round(notional, 2), quantidadeBase: round(notional / entry, 8), limitadoPeloCapital: limited };
  }

  return {
    ok: true,
    plan: {
      lado: side,
      entradaBaixo: baixo,
      entradaAlto: alto,
      entradaReferencia: entry,
      distanciaAteEntradaBps: round(distanciaAteEntradaBps, 1),
      invalidacao,
      alvo,
      alvoTipo,
      riscoBps: round(riscoBps, 1),
      alvoBps: round(alvoBps, 1),
      custoBps: round(custoBps, 2),
      ganhoRiscoLiquido,
      tamanho,
    },
  };
}
