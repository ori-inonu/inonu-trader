/**
 * Features estruturadas para os modelos: do item de compra do brief e das saídas do Jev. Puro.
 *
 * Escolhas: retornos e volumes têm cauda pesada (tokens de meme), então passam por log1p com sinal; percentuais de 0 a
 * 100 ficam como estão (a padronização do modelo cuida da escala). Valor ausente fica null: o ajuste cria o
 * indicador de ausente. Nenhuma feature usa preço em dólar, endereço ou identificador.
 */

import { isRecord, num, type BriefItemRow, type ClosingRow, type ScoreRow } from "./dataset.ts";
import { signedLog1p } from "./logistic.ts";

export type FeatureGroup = "momento" | "fluxo" | "liquidez" | "risco" | "carteiras" | "contexto" | "jev";

export interface FeatureDef<R> {
  readonly name: string;
  readonly group: FeatureGroup;
  readonly get: (row: R) => number | null;
}

const slog = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : signedLog1p(n);
};
const plain = (v: unknown): number | null => num(v);
const log1p = (v: unknown): number | null => {
  const n = num(v);
  return n === null || n < 0 ? null : Math.log1p(n);
};
const nested = (row: BriefItemRow, parent: string, key: string): unknown => {
  const p = row.item[parent];
  return isRecord(p) ? p[key] : undefined;
};
const listLen = (v: unknown): number | null => (Array.isArray(v) ? v.length : null);

/** Features do item de compra do brief, sem as saídas do Jev. */
export const BRIEF_FEATURES: ReadonlyArray<FeatureDef<BriefItemRow>> = [
  { name: "mo_r5", group: "momento", get: (r) => slog(nested(r, "mo", "r5")) },
  { name: "mo_r15", group: "momento", get: (r) => slog(nested(r, "mo", "r15")) },
  { name: "mo_r1", group: "momento", get: (r) => slog(nested(r, "mo", "r1")) },
  { name: "mo_rg", group: "momento", get: (r) => log1p(nested(r, "mo", "rg")) },
  { name: "mo_vr", group: "momento", get: (r) => log1p(nested(r, "mo", "vr")) },
  { name: "tm_rsi", group: "momento", get: (r) => plain(nested(r, "tm", "rsi")) },
  { name: "tm_rp", group: "momento", get: (r) => plain(nested(r, "tm", "rp")) },
  { name: "tm_r4", group: "momento", get: (r) => slog(nested(r, "tm", "r4")) },
  { name: "tm_r24", group: "momento", get: (r) => slog(nested(r, "tm", "r24")) },
  { name: "tm_up", group: "momento", get: (r) => log1p(nested(r, "tm", "up")) },
  { name: "tm_dd", group: "momento", get: (r) => plain(nested(r, "tm", "dd")) },
  { name: "tm_sg", group: "momento", get: (r) => log1p(nested(r, "tm", "sg")) },
  { name: "c24", group: "momento", get: (r) => slog(r.item.c) },
  { name: "buy_share", group: "fluxo", get: (r) => plain(r.item.b) },
  { name: "net_inflow", group: "fluxo", get: (r) => slog(r.item.inf) },
  { name: "unique_traders", group: "fluxo", get: (r) => log1p(r.item.ut) },
  { name: "wallet_buys", group: "fluxo", get: (r) => log1p(r.item.wu) },
  { name: "vs_smart_entry", group: "fluxo", get: (r) => slog(r.item.sp) },
  { name: "liquidity", group: "liquidez", get: (r) => log1p(r.item.l) },
  { name: "volume24", group: "liquidez", get: (r) => log1p(r.item.v) },
  { name: "holders", group: "liquidez", get: (r) => log1p(r.item.h) },
  { name: "impact_max", group: "liquidez", get: (r) => log1p(r.item.i) },
  { name: "risk", group: "risco", get: (r) => plain(r.item.r) },
  { name: "top10", group: "risco", get: (r) => plain(r.item.t) },
  { name: "creator", group: "risco", get: (r) => plain(r.item.d) },
  { name: "bundlers", group: "risco", get: (r) => plain(r.item.u) },
  { name: "lp_burned", group: "risco", get: (r) => plain(r.item.lp) },
  { name: "care_codes", group: "risco", get: (r) => listLen(r.item.m) },
  { name: "families", group: "risco", get: (r) => listLen(r.item.f) },
  { name: "trail", group: "carteiras", get: (r) => plain(r.item.n) },
  { name: "wallets", group: "carteiras", get: (r) => log1p(r.item.w) },
  { name: "wallets_sold", group: "carteiras", get: (r) => plain(r.item.p) },
  { name: "btc_1h", group: "contexto", get: (r) => (r.context === null ? null : slog(r.context.btc_1h)) },
];

const FACET_NAMES = ["late_entry", "still_falling", "accumulating", "exit_easy", "distribution", "fading"] as const;

/** Saídas do Jev sobre o candidato: probabilidade de compra e as seis facetas. */
export const JEV_FEATURES: ReadonlyArray<FeatureDef<BriefItemRow>> = [
  { name: "jev_pbuy", group: "jev", get: (r) => r.pBuy },
  ...FACET_NAMES.map((f): FeatureDef<BriefItemRow> => ({ name: `jev_f_${f}`, group: "jev", get: (r) => (r.facets === null ? null : (r.facets[f] ?? null)) })),
];

export const featureNames = <R>(defs: ReadonlyArray<FeatureDef<R>>): string[] => defs.map((d) => d.name);
export const featureRow = <R>(defs: ReadonlyArray<FeatureDef<R>>, row: R): Array<number | null> => defs.map((d) => d.get(row));

const FAMILIES = ["carteiras", "fluxo", "liquidez", "distribuicao", "tracao", "seguranca", "retracao", "alta_com_folego"] as const;
const POSTURE: Readonly<Record<string, number>> = { defensiva: -1, neutra: 0, ofensiva: 1 };

/** Features do placar (janela longa): facetas, famílias de evidência e postura. Só o que o placar guarda. */
export const SCORE_FEATURES: ReadonlyArray<FeatureDef<ScoreRow>> = [
  ...FACET_NAMES.map((f): FeatureDef<ScoreRow> => ({ name: `jev_f_${f}`, group: "jev", get: (r) => (r.facets === null ? null : (r.facets[f] ?? null)) })),
  ...FAMILIES.map((f): FeatureDef<ScoreRow> => ({ name: `fam_${f}`, group: "jev", get: (r) => (r.families.includes(f) ? 1 : 0) })),
  { name: "n_families", group: "jev", get: (r) => r.families.length },
  { name: "posture", group: "jev", get: (r) => (r.posture === null ? null : (POSTURE[r.posture] ?? null)) },
  { name: "trigger_risk", group: "risco", get: (r) => (r.triggers.includes("sinal_de_risco") ? 1 : 0) },
];

/** Features do fechamento: a primeira resposta e o custo de entrada declarado. */
export const CLOSING_FEATURES: ReadonlyArray<FeatureDef<ClosingRow>> = [
  { name: "first_p", group: "jev", get: (r) => r.firstP },
  { name: "entry_cost", group: "liquidez", get: (r) => r.entryCostPct },
  { name: "impact", group: "liquidez", get: (r) => r.impactPct },
  ...FACET_NAMES.map((f): FeatureDef<ClosingRow> => ({ name: `jev_f_${f}`, group: "jev", get: (r) => (r.facets === null ? null : (r.facets[f] ?? null)) })),
];
