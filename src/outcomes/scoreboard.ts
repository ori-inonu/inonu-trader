/**
 * The Placar (INT-0.10, REC-6): the honest scoreboard of the answers of "Pedir ao Inonu", measured by what the market did next,
 * after costs. Pure: decisions, snapshots and labels in, a plain object out.
 *
 *  - A reused answer (the same Brief, no new call) is not a new answer and is left out entirely.
 *  - Only a buy or a sell is measured (a hold is counted, never scored); a buy is measured by the net long return of the snapshot
 *    that was taken when the click happened, a sell by the net short return, at the primary horizon (one hour).
 *  - Below `MIN_MEASURED` measured answers there is NO number: the state is `nao_medido` and the text says how many are missing.
 *  - The hit rate carries a Wilson interval; the mean carries a Newey-West interval (the horizons overlap), from the lab.
 *  - Next to it, the same measure for "any moment" (every clock snapshot, bought or sold blindly) so the person can see whether
 *    the answers did better than doing nothing clever.
 *
 * No claim of profit is made anywhere: the text only says what was measured.
 */
import { meanTest, wilsonInterval } from "../lab/stats";
import type { DecisionRecord, Horizon, Label, Snapshot } from "./types";

export const MIN_MEASURED = 30;
const PRIMARY_HORIZON: Horizon = "1h";
/** Five minute steps in the primary horizon: the overlap that the Newey-West lag must cover. */
const OVERLAP_STEPS = 12;

export interface Placar {
  readonly estado: "nao_medido" | "medido";
  readonly minimo: number;
  readonly horizonte: Horizon;
  readonly decisoes: { readonly total: number; readonly comprar: number; readonly vender: number; readonly manter: number; readonly medidas: number; readonly pendentes: number; readonly semInstantaneo: number };
  /** Share of measured answers that ended on the right side after costs, with its 95% Wilson interval; null before the minimum. */
  readonly acerto: { readonly taxa: number; readonly ic95: readonly [number, number] } | null;
  /** Mean net return of the measured answers, in bps, with a 95% Newey-West interval (null when the sample is too small to infer). */
  readonly liquidoMedioBps: number | null;
  readonly liquidoIc95Bps: readonly [number, number] | null;
  /** What buying, or selling, at any moment would have returned over the same horizon, net of costs, from the clock snapshots. */
  readonly qualquerMomento: { readonly n: number; readonly comprarBps: number; readonly venderBps: number } | null;
  readonly texto: string;
}

const round = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits + 0;
const pct = (v: number): string => `${Math.round(v * 100)}`;
const signed = (v: number): string => `${v > 0 ? "+" : ""}${round(v, 1)}`.replace(".", ",");

export function buildPlacar(input: { readonly decisions: readonly DecisionRecord[]; readonly snapshots: readonly Snapshot[]; readonly labels: readonly Label[] }): Placar {
  const labelOf = new Map<string, Label>();
  for (const l of input.labels) if (l.horizonte === PRIMARY_HORIZON) labelOf.set(l.snapshotId, l);
  const snapshotIds = new Set(input.snapshots.map((s) => s.id));

  let comprar = 0;
  let vender = 0;
  let manter = 0;
  let pendentes = 0;
  let semInstantaneo = 0;
  const returns: { atMs: number; bps: number }[] = [];
  const fresh = input.decisions.filter((d) => !d.reutilizado);
  for (const d of fresh) {
    if (d.action === "hold") {
      manter += 1;
      continue;
    }
    if (d.action === "buy") comprar += 1;
    else vender += 1;
    if (d.snapshotId === null || !snapshotIds.has(d.snapshotId)) {
      semInstantaneo += 1;
      continue;
    }
    const label = labelOf.get(d.snapshotId);
    const bps = label === undefined || !label.completo ? null : d.action === "buy" ? label.liquidoLongBps : label.liquidoShortBps;
    if (bps === null || bps === undefined) pendentes += 1;
    else returns.push({ atMs: d.atMs, bps });
  }
  returns.sort((a, b) => a.atMs - b.atMs);

  // a blind baseline from the clock snapshots only (a click is chosen by a person, the clock is not)
  const blind = input.snapshots.filter((s) => s.origem === "relogio").flatMap((s) => {
    const l = labelOf.get(s.id);
    return l !== undefined && l.completo && l.liquidoLongBps !== null && l.liquidoShortBps !== null ? [{ long: l.liquidoLongBps, short: l.liquidoShortBps }] : [];
  });
  const qualquerMomento = blind.length === 0 ? null : { n: blind.length, comprarBps: round(blind.reduce((s, b) => s + b.long, 0) / blind.length, 1), venderBps: round(blind.reduce((s, b) => s + b.short, 0) / blind.length, 1) };

  const medidas = returns.length;
  const decisoes = { total: fresh.length, comprar, vender, manter, medidas, pendentes, semInstantaneo };
  if (medidas < MIN_MEASURED) {
    return {
      estado: "nao_medido",
      minimo: MIN_MEASURED,
      horizonte: PRIMARY_HORIZON,
      decisoes,
      acerto: null,
      liquidoMedioBps: null,
      liquidoIc95Bps: null,
      qualquerMomento,
      texto: `Placar: ${medidas} de ${MIN_MEASURED} respostas medidas. Sem numero ate la.`,
    };
  }

  const hits = returns.filter((r) => r.bps > 0).length;
  const [lo, hi] = wilsonInterval(hits, medidas);
  const test = meanTest(returns.map((r) => r.bps / 10_000), OVERLAP_STEPS);
  const liquidoMedioBps = round(test.mean * 10_000, 1);
  const ic = test.ci95 === null ? null : ([round(test.ci95[0] * 10_000, 1), round(test.ci95[1] * 10_000, 1)] as const);
  const parts = [`Placar: ${hits} de ${medidas} respostas no sentido certo depois de custos em 1 h (${pct(hits / medidas)}%, intervalo de 95% de ${pct(lo)} a ${pct(hi)}%).`, `Media ${signed(liquidoMedioBps)} bps liquidos${ic === null ? ", amostra curta para intervalo" : ` (intervalo de ${signed(ic[0])} a ${signed(ic[1])})`}.`];
  if (qualquerMomento !== null) parts.push(`Sem filtro, comprar em qualquer momento deu ${signed(qualquerMomento.comprarBps)} bps e vender ${signed(qualquerMomento.venderBps)} bps.`);
  return {
    estado: "medido",
    minimo: MIN_MEASURED,
    horizonte: PRIMARY_HORIZON,
    decisoes,
    acerto: { taxa: round(hits / medidas, 4), ic95: [round(lo, 4), round(hi, 4)] },
    liquidoMedioBps,
    liquidoIc95Bps: ic,
    qualquerMomento,
    texto: parts.join(" "),
  };
}
