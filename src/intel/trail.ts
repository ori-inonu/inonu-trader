/**
 * The on-chain smart money trail of a token (T6.3, SMT-4). Our own operational definition, see flow-engine.md 4.
 *
 * A score from 0 to 100 over components already normalised to 0..1. A component that is absent (the data was not
 * fetched, or the provider does not have it) is left out of both sides of the ratio and listed in
 * `componentesAusentes`: a missing number is never a zero. A honeypot zeroes the whole score. The weights are priors,
 * configurable and recorded in the result; they do not claim any performance (validation is T6.6).
 *
 * Only the components with a formula in the spec have a helper here. How `risco` and `sentimento` are normalised from
 * the provider's fields is the caller's decision, and is not measured yet.
 */
import { percentile } from "./thresholds";

export const COMPONENTS = ["compra", "carteiras", "naoVendida", "qualidade", "concentracao", "risco", "liquidez", "fluxo", "sentimento"] as const;
export type Component = (typeof COMPONENTS)[number];

export const DEFAULT_TRAIL_WEIGHTS: Readonly<Record<Component, number>> = {
  compra: 1.5,
  carteiras: 1.0,
  naoVendida: 1.0,
  qualidade: 1.0,
  concentracao: 1.0,
  risco: 1.5,
  liquidez: 0.8,
  fluxo: 0.8,
  sentimento: 0.4,
};

export interface TrailResult {
  /** 0 to 100, or null when no component is present. */
  readonly nota: number | null;
  readonly componentes: Readonly<Record<Component, number | null>>;
  readonly componentesAusentes: Component[];
  /** The weights used, so the journal records them. */
  readonly pesos: Readonly<Record<Component, number>>;
}

export function trailScore(components: Readonly<Record<Component, number | null>>, options: { readonly honeypot: boolean; readonly weights?: Partial<Record<Component, number>> }): TrailResult {
  const pesos = { ...DEFAULT_TRAIL_WEIGHTS, ...options.weights } as Record<Component, number>;
  for (const name of COMPONENTS) {
    if (!(pesos[name] > 0) || !Number.isFinite(pesos[name])) throw new RangeError(`the weight of ${name} must be a positive number`);
    const value = components[name];
    if (value !== null && !(value >= 0 && value <= 1)) throw new RangeError(`${name} must be null or from 0 to 1`);
  }
  let weighted = 0;
  let total = 0;
  const componentesAusentes: Component[] = [];
  for (const name of COMPONENTS) {
    const value = components[name];
    if (value === null) {
      componentesAusentes.push(name);
      continue;
    }
    weighted += pesos[name] * value;
    total += pesos[name];
  }
  const nota = options.honeypot ? 0 : total === 0 ? null : (100 * weighted) / total;
  return { nota, componentes: components, componentesAusentes, pesos };
}

const BOUGHT_PERCENTILE = 95;
const WALLETS_FOR_FULL_SCORE = 10;

/** Net purchase that has not been sold, against the best of the set: log1p(value) / log1p(P95 of the set), at most 1. */
export function boughtComponent(netUnsoldUsd: number, set: readonly number[]): number | null {
  const reference = percentile(set, BOUGHT_PERCENTILE);
  if (reference === null || !(reference > 0) || !(netUnsoldUsd >= 0)) return null;
  return Math.min(1, Math.log1p(netUnsoldUsd) / Math.log1p(reference));
}

export function walletsComponent(count: number): number {
  return Math.min(1, Math.max(0, count) / WALLETS_FOR_FULL_SCORE);
}

/** One minus the mean share already sold, from the sold percentage of each signal. */
export function unsoldComponent(soldPercents: readonly number[]): number | null {
  if (soldPercents.length === 0) return null;
  const mean = soldPercents.reduce((sum, p) => sum + p, 0) / soldPercents.length;
  return Math.min(1, Math.max(0, 1 - mean / 100));
}

const CLUSTER_SCORE: Readonly<Record<string, number>> = { baixa: 1, media: 0.5, alta: 0 };

/** The provider's cluster concentration label (Baixa, Media, Alta), else the share held by the top 10 holders. */
export function concentrationComponent(input: { readonly cluster?: string; readonly top10HolderPercent?: number }): number | null {
  if (input.cluster !== undefined) {
    const key = input.cluster.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const score = CLUSTER_SCORE[key];
    if (score !== undefined) return score;
  }
  if (input.top10HolderPercent !== undefined && Number.isFinite(input.top10HolderPercent)) return Math.min(1, Math.max(0, 1 - input.top10HolderPercent / 100));
  return null;
}
