/**
 * What the chart layer draws (T5.7, T6.4), as plain numbers in PRICE space: the browser needs to know nothing about ticks, bin
 * widths or contracts. Everything is DESCRIPTIVE (demand and supply, measured imbalances, runs, levels, a point of control);
 * the words of an order never appear (FLX-10). A mark that needs an adaptive threshold is absent during the warm-up and the
 * overlay says how far the warm-up is. Bounded: at most MAX_OVERLAY_LEVELS levels, the ones nearest to the price.
 *
 * Pure: built from an Analysis, no clock, no network.
 */
import type { Analysis } from "../intel/analyst";
import type { InstrumentMeta } from "../intel/footprint";

export const MAX_OVERLAY_LEVELS = 120;

export interface OverlayLevel {
  readonly baixo: number;
  readonly alto: number;
  /** Units aggressed on the buying side, and on the selling side. */
  readonly c: number;
  readonly v: number;
  /** Measured imbalance at this level. */
  readonly imb: "c" | "v" | "cv" | null;
  /** The level carries the Fator Volume; the value says which aggressor dominated it. */
  readonly volume: "c" | "v" | "n" | null;
  /** One side reached the quantity threshold. */
  readonly alerta: { readonly c: boolean; readonly v: boolean } | null;
}

export interface OverlayRun {
  readonly lado: "c" | "v";
  readonly baixo: number;
  readonly alto: number;
  readonly n: number;
}

export interface OverlayExhaustion {
  readonly extremo: "baixo" | "alto";
  readonly baixo: number;
  readonly alto: number;
  readonly n: number;
}

export interface OverlayZone {
  readonly id: string;
  readonly lado: "demanda" | "oferta" | "neutra";
  readonly baixo: number;
  readonly alto: number;
  readonly nota: number;
  readonly estado: "ativa" | "testada";
  readonly fatores: string[];
  readonly idadeBarras: number;
  readonly invalidacao: number | null;
  readonly primeiroTs: number;
}

export interface ChartOverlay {
  readonly ok: true;
  readonly instId: string;
  readonly asOfMs: number;
  readonly fonte: "okx_ws_trades" | "okx_public_v5";
  readonly price: number | null;
  readonly atr14: number | null;
  readonly tickSz: string;
  readonly step: number;
  readonly binTicks: number;
  /** `restaurado`: how many of the closed minutes come from the memory of the previous run, not from this one. */
  readonly aquecimento: { readonly fechadas: number; readonly necessarias: number; readonly pronto: boolean; readonly restaurado: number };
  /** One unit of `niveis` (and of `totais`) in base currency, as a decimal text: a quantity is units times this. */
  readonly unidade: string;
  /** The aggressed units of the WHOLE window, on each side, however many levels `niveis` keeps. */
  readonly totais: { readonly c: number; readonly v: number };
  readonly niveis: OverlayLevel[];
  readonly corridas: { readonly sequencial: OverlayRun[]; readonly progressao: OverlayRun[]; readonly exaustao: OverlayExhaustion[] };
  readonly perfil: {
    readonly poc: { readonly baixo: number; readonly alto: number } | null;
    readonly val: number | null;
    readonly vah: number | null;
    readonly hvn: { readonly baixo: number; readonly alto: number }[];
    readonly lvn: { readonly baixo: number; readonly alto: number }[];
  };
  readonly absorcao: { readonly lado: "c" | "v"; readonly razaoVolume: number } | null;
  readonly zonas: OverlayZone[];
  readonly nulos: Record<string, string>;
}

/**
 * Twelve significant digits, not eight decimals: a price of 0.0000123 with a tick of 0.000000001 needs nine decimals, and rounding to eight
 * collapsed every level into a box of zero width and the step into 0. This only removes float noise (0.1 + 0.2), at any magnitude.
 */
const round = (n: number): number => (Number.isFinite(n) && n !== 0 ? Number(n.toPrecision(12)) : n);

export function buildOverlay(input: {
  readonly analysis: Analysis;
  readonly meta: InstrumentMeta;
  readonly source: ChartOverlay["fonte"];
  readonly asOfMs: number;
  readonly closedCandles: number;
  readonly neededCandles: number;
  readonly restoredCandles?: number;
}): ChartOverlay {
  const { analysis: a, meta } = input;
  const { detail } = a;
  const imbOf = new Map(detail.imbalances.map((i) => [i.level, i.imb]));
  const volumeOf = new Map(detail.volumeMarks.map((m) => [m.level, m.dominante]));
  const alertOf = new Map(detail.quantityAlerts.map((q) => [q.level, q]));

  let levels = a.footprint.levels.map((row) => {
    const alert = alertOf.get(row.level);
    return {
      level: row.level,
      mark: {
        baixo: round(detail.lowOf(row.level)),
        alto: round(detail.highOf(row.level)),
        c: row.c,
        v: row.v,
        imb: imbOf.get(row.level) ?? null,
        volume: volumeOf.get(row.level) ?? null,
        alerta: alert === undefined ? null : { c: alert.c, v: alert.v },
      } satisfies OverlayLevel,
    };
  });
  if (levels.length > MAX_OVERLAY_LEVELS) {
    const reference = a.price ?? 0;
    levels = [...levels].sort((x, y) => Math.abs((x.mark.baixo + x.mark.alto) / 2 - reference) - Math.abs((y.mark.baixo + y.mark.alto) / 2 - reference)).slice(0, MAX_OVERLAY_LEVELS).sort((x, y) => x.level - y.level);
  }

  const range = (from: number, to: number) => ({ baixo: round(detail.lowOf(Math.min(from, to))), alto: round(detail.highOf(Math.max(from, to))) });
  const profile = detail.profile;
  const absorption = a.fluxo.absorcao;

  return {
    ok: true,
    instId: meta.instId,
    asOfMs: input.asOfMs,
    fonte: input.source,
    price: a.price,
    atr14: a.atr14 === null ? null : round(a.atr14),
    tickSz: meta.tickSz,
    step: round(detail.step),
    binTicks: a.binTicks,
    aquecimento: { fechadas: input.closedCandles, necessarias: input.neededCandles, pronto: a.thresholds.ok, restaurado: input.restoredCandles ?? 0 },
    unidade: a.footprint.unit,
    totais: { c: a.footprint.totals.c, v: a.footprint.totals.v },
    niveis: levels.map((l) => l.mark),
    corridas: {
      sequencial: detail.sequences.map((r) => ({ lado: r.lado, ...range(r.nivelInicial, r.nivelFinal), n: r.comprimento })),
      progressao: detail.progressions.map((p) => ({ lado: p.lado, ...range(p.niveis[0]!, p.niveis[p.niveis.length - 1]!), n: p.comprimento })),
      exaustao: detail.exhaustions.map((e) => ({ extremo: e.extremo, ...range(e.niveis[0]!, e.niveis[e.niveis.length - 1]!), n: e.niveis.length })),
    },
    perfil: {
      poc: profile.poc === null ? null : range(profile.poc, profile.poc),
      val: profile.val === null ? null : round(detail.lowOf(profile.val)),
      vah: profile.vah === null ? null : round(detail.highOf(profile.vah)),
      hvn: profile.hvn.map((level) => range(level, level)),
      lvn: profile.lvn.map((level) => range(level, level)),
    },
    absorcao: absorption === null ? null : { lado: absorption.lado, razaoVolume: round(absorption.razaoVolume) },
    zonas: (a.zones?.visible ?? []).map((z) => ({
      id: z.id,
      lado: z.lado,
      baixo: round(z.baixo),
      alto: round(z.alto),
      nota: Math.round(z.nota * 100) / 100,
      estado: z.estado === "testada" ? "testada" : "ativa",
      fatores: [...z.fatores],
      idadeBarras: z.idadeBarras,
      invalidacao: z.invalidacao === null ? null : round(z.invalidacao),
      primeiroTs: z.primeiroTs,
    })),
    nulos: a.nulos,
  };
}
