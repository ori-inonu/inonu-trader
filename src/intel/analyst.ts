/**
 * The glue of the flow engine: from the trades of a window, the closed candles and the history of past footprints to the
 * measures and candidates that go into the Evidence Brief.
 *
 * Honest about what it has. Everything that needs an adaptive threshold (Imbalance, Sequencial, Progressao, Exaustao,
 * quantity alerts, original orders, absorption, CVD) is null with the reason `aquecimento` until `warmupCandles` closed
 * candles of history exist (FLX-12). The profile and the delta need no history and are always there. The zone families this
 * engine really has are E2 (footprint) and E3 (profile); E1 (structure) lives in the browser, E4 to E6 need data this
 * module is not given, and `familiasHabilitadas` says so, which keeps the score honest. Nothing here says what to do: a
 * zone describes demand or supply and the model chooses among candidate ids.
 *
 * Pure: no clock, no network, no disk. The time and the previous zones arrive as parameters.
 */
import { atrWilder } from "./atr";
import type { BriefCandidate } from "./brief";
import { zoneCandidates } from "./candidates";
import { addDec, decToString, mulDec, parseDec, type Dec } from "./decimal";
import { exhaustions, progressions, type Exhaustion, type Progression } from "./factors-trend";
import { originalOrders, quantityAlerts, volumeFactor, type QuantityAlert, type VolumeMark } from "./factors-volume";
import { imbalances, sequences, type Imbalance, type Run } from "./factors";
import { autoBinTicks, buildFootprint, type Footprint, type InstrumentMeta } from "./footprint";
import type { Trade } from "./ingest";
import { absorption, volumeProfile, type Absorption, type VolumeProfile } from "./profile";
import { adaptiveThresholds, percentile, type ThresholdCandle, type Thresholds } from "./thresholds";
import { updateZones, type Family, type Proposal, type Zone, type ZoneUpdate } from "./zones";

export interface AnalystCandle {
  readonly ts: number;
  /** Decimal text, as the exchange sent it. */
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
}

export interface AnalystParams {
  /** Imbalance ratio. Initial value of the spec. */
  readonly imbalanceX?: number;
  /** Sequencial: adjacent levels. */
  readonly sequenceN?: number;
  /** Progressao and Exaustao: levels. */
  readonly trendX?: number;
  /** Fator Volume: busiest levels to mark (0 to 3). */
  readonly volumeK?: number;
}

export interface AnalystInput {
  readonly meta: InstrumentMeta;
  /** The trades of the window, any order. */
  readonly trades: readonly Trade[];
  /** CLOSED candles of one interval (one minute), oldest first. */
  readonly candles: readonly AnalystCandle[];
  /** Level volumes of past closed candles, oldest first (the thresholds come from these). */
  readonly history: readonly ThresholdCandle[];
  readonly prevZones: readonly Zone[];
  /** Sizes of the latest single trades in units (the collector keeps 2000). Default: the sizes inside the window. */
  readonly tradeUnits?: readonly number[];
  /** Timestamp of the closed candle the previous zones were judged against; the same candle is not judged twice. */
  readonly prevBarTs?: number | null;
  readonly nowMs: number;
  /** Closed candles of history needed before the thresholds exist. Default 50. */
  readonly warmupCandles?: number;
  readonly params?: AnalystParams;
}

export interface Fluxo {
  readonly janela: { readonly negocios: number; readonly desdeMs: number | null; readonly ateMs: number | null; readonly rejeitados: number };
  readonly delta: number | null;
  readonly cvd: number | null;
  readonly desde: number | null;
  readonly imb: { readonly c: number; readonly v: number } | null;
  readonly seq: Run[] | null;
  readonly prg: Progression[] | null;
  readonly exh: Exhaustion[] | null;
  readonly absorcao: Absorption | null;
  readonly poc: number | null;
  readonly val: number | null;
  readonly vah: number | null;
  readonly alertasQuantidade: number | null;
  readonly ordensOriginais: number | null;
  readonly aprox: false;
}

/** Everything the chart layer draws, with the full lists (the Brief only carries the nearest few). */
export interface AnalysisDetail {
  /** Price width of one level. */
  readonly step: number;
  readonly lowOf: (level: number) => number;
  readonly highOf: (level: number) => number;
  readonly imbalances: Imbalance[];
  readonly sequences: Run[];
  readonly progressions: Progression[];
  readonly exhaustions: Exhaustion[];
  readonly volumeMarks: VolumeMark[];
  readonly quantityAlerts: QuantityAlert[];
  readonly profile: VolumeProfile;
}

export interface Analysis {
  readonly detail: AnalysisDetail;
  readonly atr14: number | null;
  readonly price: number | null;
  readonly binTicks: number;
  readonly footprint: Footprint;
  readonly thresholds: Thresholds;
  readonly fluxo: Fluxo;
  readonly proposals: Proposal[];
  /** Null when there is no ATR, no price or no closed candle: the reason is in `nulos.zonas`. */
  readonly zones: ZoneUpdate | null;
  /** The closed candle the zones were judged against, to hand back as `prevBarTs` next time. */
  readonly barTs: number | null;
  /** The zones worth showing the model (active or tested). The instrument and the option to keep are added by the caller. */
  readonly candidates: BriefCandidate[];
  /** Why each missing field is missing. */
  readonly nulos: Record<string, string>;
}

/** The zone families this engine really has: footprint and profile. E1 lives in the browser; E4 to E6 need data it is not given. */
export const ENGINE_FAMILIES: readonly Family[] = ["E2", "E3"];
const INTERVAL_MS = 60_000;
const MAX_RUNS = 3;
const SEQUENCE_STRENGTH_LEVELS = 2; // a run of twice N levels is full strength
const P90 = 90;

const toNumber = (dec: Dec): number => Number(decToString(dec));

function windowOf(trades: readonly Trade[], rejected: number): Fluxo["janela"] {
  if (trades.length === 0) return { negocios: 0, desdeMs: null, ateMs: null, rejeitados: rejected };
  let from = Infinity;
  let to = -Infinity;
  for (const t of trades) {
    from = Math.min(from, t.ts);
    to = Math.max(to, t.ts);
  }
  return { negocios: trades.length, desdeMs: from, ateMs: to, rejeitados: rejected };
}

export function analyze(input: AnalystInput): Analysis {
  const { meta } = input;
  const params = input.params ?? {};
  const x = params.imbalanceX ?? 3;
  const sequenceN = params.sequenceN ?? 3;
  const trendX = params.trendX ?? 3;
  const volumeK = params.volumeK ?? 1;
  const nulos: Record<string, string> = {};

  const tick = parseDec(meta.tickSz);
  if (tick === null) throw new RangeError("tickSz must be a decimal");
  const atr14 = atrWilder(input.candles.slice(-30).map((c) => ({ open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close) })), 14);
  const binTicks = autoBinTicks(input.candles.slice(-20), meta.tickSz);
  const step = mulDec(tick, { int: BigInt(binTicks), scale: 0 });
  const footprint = buildFootprint(meta, binTicks, input.trades);
  const kept = input.trades.length - footprint.rejected;
  const thresholds = adaptiveThresholds({
    candles: input.history,
    currentBinTicks: binTicks,
    tradeUnits: input.tradeUnits ?? (footprint.levels.length === 0 ? [] : unitsOf(input.trades, meta, binTicks)),
    ...(input.warmupCandles === undefined ? {} : { warmupCandles: input.warmupCandles }),
  });

  const lowOf = (level: number): number => toNumber(mulDec({ int: BigInt(level), scale: 0 }, step));
  const highOf = (level: number): number => toNumber(addDec(mulDec({ int: BigInt(level), scale: 0 }, step), step));

  // the last price by event time (a later arrival wins a tie)
  let lastTrade: Trade | null = null;
  for (const t of input.trades) if (lastTrade === null || t.ts >= lastTrade.ts) lastTrade = t;
  const price = lastTrade === null ? null : Number(lastTrade.px);

  // plain measures, always available
  const profile = volumeProfile(footprint.levels, price === null ? {} : { closeLevel: Math.floor(price / toNumber(step)) });
  const delta = footprint.levels.length === 0 ? null : footprint.totals.delta;

  // everything below needs a threshold that must have been learned from history
  let imb: Fluxo["imb"] = null;
  let seq: Fluxo["seq"] = null;
  let prg: Fluxo["prg"] = null;
  let exh: Fluxo["exh"] = null;
  let absorcao: Absorption | null = null;
  let alertasQuantidade: number | null = null;
  let ordensOriginais: number | null = null;
  let imbalanceList: Imbalance[] = [];
  let sequenceRuns: Run[] = [];
  let progressionRuns: Progression[] = [];
  let exhaustionRuns: Exhaustion[] = [];
  let volumeMarks: VolumeMark[] = [];
  let alertList: QuantityAlert[] = [];
  const proposals: Proposal[] = [];
  const stamp = input.candles.length > 0 ? input.candles[input.candles.length - 1]!.ts : input.nowMs;

  if (thresholds.ok) {
    imbalanceList = imbalances(footprint.levels, { x, minVol: thresholds.minVol, mode: "diagonal" });
    imb = { c: imbalanceList.filter((i) => i.imb !== "v").length, v: imbalanceList.filter((i) => i.imb !== "c").length };
    sequenceRuns = sequences(imbalanceList, sequenceN);
    progressionRuns = progressions(footprint.levels, { x: trendX, minVol: thresholds.minVol });
    exhaustionRuns = exhaustions(footprint.levels, { x: trendX, minVol: thresholds.minVol });
    seq = nearest(sequenceRuns, price, (r) => (lowOf(r.nivelInicial) + highOf(r.nivelFinal)) / 2);
    prg = nearest(progressionRuns, price, (p) => (lowOf(p.niveis[0]!) + highOf(p.niveis[p.niveis.length - 1]!)) / 2);
    exh = nearest(exhaustionRuns, price, (e) => (lowOf(e.niveis[0]!) + highOf(e.niveis[e.niveis.length - 1]!)) / 2);
    alertList = quantityAlerts(footprint.levels, thresholds.q);
    alertasQuantidade = alertList.length;
    ordensOriginais = thresholds.t === null ? null : originalOrders(meta, binTicks, input.trades, thresholds.t).length;
    volumeMarks = volumeFactor(footprint.levels, volumeK); // drawn by the chart layer; the Brief carries only counts

    for (const run of sequences(imbalanceList, sequenceN)) {
      proposals.push({ family: "E2", baixo: lowOf(run.nivelInicial), alto: highOf(run.nivelFinal), lado: run.lado === "c" ? "demanda" : "oferta", forca: Math.min(1, run.comprimento / (SEQUENCE_STRENGTH_LEVELS * sequenceN)), ts: stamp });
    }
    for (const e of exhaustions(footprint.levels, { x: trendX, minVol: thresholds.minVol })) {
      const innermost = Math.min(e.niveis[0]!, e.niveis[e.niveis.length - 1]!);
      const outermost = Math.max(e.niveis[0]!, e.niveis[e.niveis.length - 1]!);
      proposals.push({ family: "E2", baixo: lowOf(innermost), alto: highOf(outermost), lado: e.extremo === "baixo" ? "demanda" : "oferta", forca: Math.min(1, e.niveis.length / (SEQUENCE_STRENGTH_LEVELS * trendX)), ts: stamp });
    }

    // absorption of the whole window against the volume of the past candles on the same side
    const first = firstTrade(input.trades);
    if (first !== null && lastTrade !== null) {
      for (const side of ["c", "v"] as const) {
        const past = input.history.map((candle) => candle.levels.reduce((sum, level) => sum + level[side], 0));
        const result = absorption({ side, volume: footprint.totals[side], p90Prior: percentile(past, P90), open: first.px, close: lastTrade.px, atr14 });
        if (result?.absorcao) {
          absorcao = result;
          const level = side === "v" ? footprint.levels[0]! : footprint.levels[footprint.levels.length - 1]!;
          proposals.push({ family: "E2", baixo: lowOf(level.level), alto: highOf(level.level), lado: side === "v" ? "demanda" : "oferta", forca: Math.min(1, result.razaoVolume / 2), ts: stamp });
        }
      }
    }
  } else {
    for (const field of ["imb", "seq", "prg", "exh", "absorcao", "alertasQuantidade", "ordensOriginais"]) nulos[`fluxo.${field}`] = "aquecimento";
  }
  nulos["fluxo.cvd"] = "aquecimento"; // the session CVD needs the session's candles, which this window does not hold
  if (thresholds.ok && thresholds.t === null) nulos["fluxo.ordensOriginais"] = "sem_negocios";

  // E3: the profile. A level above the price is described as supply, at or below it as demand.
  if (profile.poc !== null && price !== null) {
    const volumeAt = (level: number) => footprint.levels.find((l) => l.level === level);
    const pocRow = volumeAt(profile.poc)!;
    const pocVolume = pocRow.c + pocRow.v;
    const side = (level: number): "demanda" | "oferta" => ((lowOf(level) + highOf(level)) / 2 <= price ? "demanda" : "oferta");
    proposals.push({ family: "E3", baixo: lowOf(profile.poc), alto: highOf(profile.poc), lado: side(profile.poc), forca: 1, ts: stamp });
    for (const level of profile.hvn) {
      if (level === profile.poc) continue;
      const row = volumeAt(level)!;
      proposals.push({ family: "E3", baixo: lowOf(level), alto: highOf(level), lado: side(level), forca: (row.c + row.v) / pocVolume, ts: stamp });
    }
    for (const level of profile.lvn) {
      const row = volumeAt(level);
      const volume = row === undefined ? 0 : row.c + row.v;
      proposals.push({ family: "E3", baixo: lowOf(level), alto: highOf(level), lado: side(level), forca: 1 - volume / pocVolume, ts: stamp });
    }
  }

  // zones
  let zones: ZoneUpdate | null = null;
  let candidates: BriefCandidate[] = [];
  const bar = input.candles.length > 0 ? input.candles[input.candles.length - 1]! : null;
  if (price === null) nulos.zonas = "sem_negocios";
  else if (atr14 === null) nulos.zonas = "atr_indisponivel";
  else if (bar === null) nulos.zonas = "sem_velas";
  else {
    zones = updateZones({ prev: input.prevZones, proposals, bar: { ts: bar.ts, open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close) }, params: { enabled: ENGINE_FAMILIES, atr14, intervalMs: INTERVAL_MS, judgePrice: input.prevBarTs !== bar.ts } });
    candidates = zoneCandidates(zones.visible, price);
  }

  const fluxo: Fluxo = {
    janela: windowOf(input.trades, input.trades.length - kept),
    delta,
    cvd: null,
    desde: null,
    imb,
    seq,
    prg,
    exh,
    absorcao,
    poc: profile.poc === null ? null : lowOf(profile.poc),
    val: profile.val === null ? null : lowOf(profile.val),
    vah: profile.vah === null ? null : highOf(profile.vah),
    alertasQuantidade,
    ordensOriginais,
    aprox: false,
  };
  const detail: AnalysisDetail = { step: toNumber(step), lowOf, highOf, imbalances: imbalanceList, sequences: sequenceRuns, progressions: progressionRuns, exhaustions: exhaustionRuns, volumeMarks, quantityAlerts: alertList, profile };
  return { detail, atr14, price, binTicks, footprint, thresholds, fluxo, proposals, zones, barTs: bar === null ? null : bar.ts, candidates, nulos };
}

function firstTrade(trades: readonly Trade[]): Trade | null {
  let first: Trade | null = null;
  for (const t of trades) if (first === null || t.ts < first.ts) first = t;
  return first;
}

/** Sizes of the single trades in units, for the threshold T. */
function unitsOf(trades: readonly Trade[], meta: InstrumentMeta, binTicks: number): number[] {
  const out: number[] = [];
  for (const t of trades) {
    const one = buildFootprint(meta, binTicks, [t]);
    if (one.trades === 1) out.push(one.totals.c + one.totals.v);
  }
  return out;
}

/** The runs nearest to the price first, at most MAX_RUNS of them, so the Brief stays small. */
function nearest<T>(list: readonly T[], price: number | null, mid: (item: T) => number): T[] {
  const reference = price ?? 0;
  return [...list].sort((a, b) => Math.abs(mid(a) - reference) - Math.abs(mid(b) - reference)).slice(0, MAX_RUNS);
}
