/**
 * Reduces the flow engine's `Analysis` to the numbers the FeatureVector needs. Pure. The delta ratio is the same share the
 * Brief carries (bought minus sold over everything traded, three decimals), so a learner and the model see one definition.
 */
import type { Analysis } from "../analyst";
import type { FlowInput } from "./types";

const share = (c: number, v: number): number | null => {
  const volume = c + v;
  if (!(volume > 0)) return null;
  const s = (c - v) / volume;
  return Number.isFinite(s) ? Math.round(s * 1000) / 1000 + 0 : null;
};

/**
 * The flow of the snapshot taken at `nowMs`, or null when the window of the engine ends AFTER that instant: a flow that includes
 * trades from the future of the snapshot is not the flow at the snapshot, and its age must never be turned into zero.
 */
export function flowInputFromAnalysis(analysis: Analysis, nowMs: number): FlowInput | null {
  const warm = analysis.thresholds.ok;
  const last = analysis.fluxo.janela.ateMs;
  if (last !== null && last > nowMs) return null;
  const zones = (analysis.zones?.visible ?? []).map((z) => ({ lado: z.lado, baixo: z.baixo, alto: z.alto, nota: z.nota, estado: z.estado, families: z.fatores.length }));
  return {
    warm,
    deltaRatio: analysis.footprint.levels.length === 0 ? null : share(analysis.footprint.totals.c, analysis.footprint.totals.v),
    imb: analysis.fluxo.imb,
    seqCount: warm ? analysis.detail.sequences.length : null,
    prgCount: warm ? analysis.detail.progressions.length : null,
    exhCount: warm ? analysis.detail.exhaustions.length : null,
    absorption: analysis.fluxo.absorcao === null ? null : { side: analysis.fluxo.absorcao.lado, volumeRatio: analysis.fluxo.absorcao.razaoVolume },
    poc: analysis.fluxo.poc,
    val: analysis.fluxo.val,
    vah: analysis.fluxo.vah,
    zones,
    ageMs: last === null ? null : nowMs - last,
  };
}
