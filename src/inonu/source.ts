/**
 * The data source of "Pedir ao Inonu" for one OKX instrument (mode `ativo`). It runs only when a person clicks: three free
 * public reads (instrument, one minute candles, latest trades), the flow engine, and the Evidence Brief. Nothing here spends
 * OnchainOS quota, so `onchainosCalls` is zero. Other modes (token, discovery, filter, ranking) are not available yet and
 * say so with a constant code before anything is read.
 *
 * The same analysis feeds the chart layer: `overlay()` draws what the engine measured, in price, and costs nothing (it never
 * touches the model). The desk polls it, so the candles and, without the live feed, the trades are reused for a few seconds.
 *
 * The zones of each instrument are carried from request to request in memory, so a zone keeps its id while it lives, and a
 * closed candle is judged against them once. The history that the adaptive thresholds learn from comes from the collector;
 * without it the Brief says `aquecimento` for every factor that needs a threshold.
 */
import { ENGINE_FAMILIES, analyze, type Analysis } from "../intel/analyst";
import type { AnalystCandle } from "../intel/analyst";
import { BriefTooLarge, buildBrief } from "../intel/brief";
import { HOLD_CANDIDATE, perpCandidate, spotCandidate } from "../intel/candidates";
import type { InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";
import type { ThresholdCandle } from "../intel/thresholds";
import type { Zone } from "../intel/zones";
import { SourceError, type AskRequest, type BriefSource, type BuiltBrief } from "./ask";
import type { Collector } from "./collector";
import type { Derivatives } from "./derivatives";
import { OkxPublicError, instTypeOf, type OkxPublic } from "./okx-public";
import { buildOverlay, type ChartOverlay } from "./overlay";

const CANDLES = 120;
const TRADES = 500;
const ORIGIN = "okx_public_v5";
/** How long the exchange reads are reused: the desk polls the overlay every few seconds. */
const REUSE_MS = 20_000;
const REUSE_TRADES_MS = 8_000;
/**
 * The footprint covers the last minute, because the thresholds (minVol, the quantity threshold, the absorption reference) are learned from
 * the footprints of closed ONE MINUTE candles (FLX-1, "por vela"). The latest 500 trades are about a minute for a busy pair but hours for a
 * thin one, and read against a per-minute threshold they would inflate every imbalance and alert.
 */
const FLOW_WINDOW_MS = 60_000;

export interface OkxSourceDeps {
  readonly rest: OkxPublic;
  readonly now: () => number;
  /** Level volumes of past closed candles of the instrument, oldest first. */
  readonly history?: (instId: string) => readonly ThresholdCandle[];
  /** Candles of history needed before the thresholds exist. Default 50. */
  readonly warmupCandles?: number;
  /** The live memory of the flow engine. Without it, or before it has seen enough trades, the REST window is used. */
  readonly collector?: Collector;
  /** The funding rate and the open interest of a perpetual (T5.10). Without it the regime stays "nao coletado". */
  readonly derivatives?: Derivatives;
  /** Called on every request with the instrument, so the live feed can start following it. */
  readonly onWatch?: (instId: string) => void;
}

export interface OkxSource extends BriefSource {
  /** What the chart layer draws for an instrument. Free: it never touches the model. */
  overlay(instId: string, signal: AbortSignal): Promise<ChartOverlay>;
  /** The engine's own reading, for the recorder (INT-0.8). Free: it never touches the model. */
  analysis(instId: string, signal: AbortSignal): Promise<{ readonly analysis: Analysis; readonly meta: InstrumentMeta; readonly nowMs: number; readonly useLive: boolean }>;
}

/** Live trades needed in the collector's window before it replaces the REST one. */
const MIN_LIVE_TRADES = 20;
const DEFAULT_WARMUP = 50;

interface Prepared {
  readonly meta: InstrumentMeta;
  readonly trades: readonly Trade[];
  readonly rejected: number;
  readonly candles: AnalystCandle[];
  readonly useLive: boolean;
  readonly closedCandles: number;
  readonly restoredCandles: number;
  readonly analysis: Analysis;
  readonly nowMs: number;
}

/** Bought minus sold over everything traded in the window, three decimals, between -1 and 1; null when nothing traded. */
function deltaShare(totals: { readonly c: number; readonly v: number }): number | null {
  const volume = totals.c + totals.v;
  const share = volume > 0 ? (totals.c - totals.v) / volume : null;
  // a share that is not a finite number is no share: it must not reach a Brief, which refuses a non finite number
  return share !== null && Number.isFinite(share) ? Math.round(share * 1000) / 1000 + 0 : null;
}

function checkTarget(instId: string): void {
  const type = instTypeOf(instId);
  if (type === null) throw new SourceError("alvo_invalido");
  if (type === "FUTURES") throw new SourceError("instrumento_nao_suportado");
}

export function createOkxSource(deps: OkxSourceDeps): OkxSource {
  const zones = new Map<string, { readonly list: readonly Zone[]; readonly barTs: number | null }>();
  const candleCache = new Map<string, { at: number; value: AnalystCandle[] }>();
  const restCache = new Map<string, { at: number; meta: InstrumentMeta; trades: Trade[]; rejected: number }>();

  async function candlesOf(instId: string, signal: AbortSignal): Promise<AnalystCandle[]> {
    const hit = candleCache.get(instId);
    if (hit !== undefined && deps.now() - hit.at < REUSE_MS) return hit.value;
    const value = await deps.rest.candles(instId, CANDLES, signal);
    candleCache.set(instId, { at: deps.now(), value });
    return value;
  }

  async function prepare(instId: string, signal: AbortSignal): Promise<Prepared> {
    checkTarget(instId);
    deps.onWatch?.(instId);
    if (deps.collector !== undefined) await deps.collector.watch(instId, signal);
    const live = deps.collector?.snapshot(instId) ?? null;
    const useLive = live !== null && live.window.length >= MIN_LIVE_TRADES;

    let meta: InstrumentMeta;
    let trades: readonly Trade[];
    let rejected: number;
    let candles: AnalystCandle[];
    try {
      if (useLive) {
        meta = live.meta;
        trades = live.window;
        rejected = live.rejected;
        candles = await candlesOf(instId, signal);
      } else {
        const cached = restCache.get(instId);
        if (cached !== undefined && deps.now() - cached.at < REUSE_TRADES_MS) {
          ({ meta, trades, rejected } = cached);
          candles = await candlesOf(instId, signal);
        } else {
          const [m, c, w] = await Promise.all([deps.rest.instrument(instId, signal), candlesOf(instId, signal), deps.rest.trades(instId, TRADES, signal)]);
          meta = m;
          candles = c;
          trades = w.trades;
          rejected = w.rejected;
          restCache.set(instId, { at: deps.now(), meta: m, trades: w.trades, rejected: w.rejected });
        }
      }
    } catch (error) {
      if (error instanceof OkxPublicError) throw new SourceError(error.code === "instrument_unsupported" ? "instrumento_nao_suportado" : `okx_${error.code}`);
      throw error;
    }

    const nowMs = deps.now();
    trades = trades.filter((t) => t.ts >= nowMs - FLOW_WINDOW_MS);
    const analysis = analyze({
      meta,
      trades,
      candles,
      // what the collector learned (live, or remembered from the previous run) feeds the thresholds even before its trade window
      // is big enough to replace the REST one
      history: live !== null ? live.history : deps.history?.(instId) ?? [],
      ...(live !== null && live.tradeUnits.length >= MIN_LIVE_TRADES ? { tradeUnits: live.tradeUnits } : {}),
      prevZones: zones.get(instId)?.list ?? [],
      prevBarTs: zones.get(instId)?.barTs ?? null,
      nowMs,
      ...(deps.warmupCandles === undefined ? {} : { warmupCandles: deps.warmupCandles }),
    });
    if (analysis.zones) zones.set(instId, { list: analysis.zones.next, barTs: analysis.barTs });
    return { meta, trades, rejected, candles, useLive, closedCandles: live?.closedCandles ?? 0, restoredCandles: live?.restored ?? 0, analysis, nowMs };
  }

  return {
    async build(request: AskRequest, context): Promise<BuiltBrief> {
      if (request.modo !== "ativo") throw new SourceError("modo_nao_disponivel");
      const alvo = request.alvo;
      if (alvo === undefined || !("instId" in alvo)) throw new SourceError("alvo_invalido");
      const { instId } = alvo;
      const { meta, trades, candles, useLive, analysis, nowMs } = await prepare(instId, context.signal);

      const candidates = [...analysis.candidates, meta.instType === "SPOT" ? spotCandidate(instId) : perpCandidate(instId), HOLD_CANDIDATE];
      const idades: Record<string, number> = {};
      const lastTrade = trades.length === 0 ? null : trades[trades.length - 1]!.ts;
      if (lastTrade !== null) idades.fluxo = Math.max(0, nowMs - lastTrade);
      const lastCandle = candles.length === 0 ? null : candles[candles.length - 1]!.ts;
      if (lastCandle !== null) idades.velas = Math.max(0, nowMs - lastCandle);

      // the regime of a perpetual: data for the model, never a modifier of the zones (that mapping is not measured, T6.6)
      let regime: Parameters<typeof buildBrief>[0]["regime"] = null;
      const regimeNulos: Record<string, string> = {};
      if (meta.instType !== "SWAP") regimeNulos.regime = "so existe para perpetuos";
      else if (deps.derivatives === undefined) regimeNulos.regime = "nao coletado nesta versao";
      else {
        try {
          const reading = await deps.derivatives.read(instId, context.signal);
          if (reading === null) regimeNulos.regime = "nao coletado nesta versao";
          else {
            regime = reading.regime;
            Object.assign(regimeNulos, reading.nulos);
          }
        } catch (error) {
          if (error instanceof OkxPublicError && error.code === "aborted") throw new SourceError("okx_aborted");
          regimeNulos.regime = "indisponivel"; // nothing of the failure travels
        }
      }

      try {
        const { brief } = buildBrief({
          alvo: { instId },
          asOfMs: nowMs,
          familiasHabilitadas: [...(analysis.zones?.familiasHabilitadas ?? ENGINE_FAMILIES)],
          // the delta is in lots of this instrument, so it cannot be compared with another instrument; its share of the volume can (RAS-6)
          fluxo: { ...analysis.fluxo, deltaRazao: deltaShare(analysis.footprint.totals) } as never,
          candidatos: candidates,
          trilha: null,
          risco: null,
          regime,
          idades,
          origens: { fluxo: useLive ? "okx_ws_trades" : ORIGIN, velas: ORIGIN, zonas: ORIGIN },
          nulos: { ...analysis.nulos, trilha: "ativo da OKX: sem carteiras rastreadas", risco: "nao coletado nesta versao", ...regimeNulos, ...(lastTrade === null ? { fluxo: "sem_negocios" } : {}) },
        });
        return { brief, candidates, onchainosCalls: 0 };
      } catch (error) {
        if (error instanceof BriefTooLarge) throw new SourceError("brief_grande_demais");
        throw error;
      }
    },

    async analysis(instId, signal) {
      const { meta, analysis, nowMs, useLive } = await prepare(instId, signal);
      return { analysis, meta, nowMs, useLive };
    },

    async overlay(instId, signal): Promise<ChartOverlay> {
      const { meta, useLive, closedCandles, restoredCandles, analysis, nowMs } = await prepare(instId, signal);
      return buildOverlay({ analysis, meta, source: useLive ? "okx_ws_trades" : ORIGIN, asOfMs: nowMs, closedCandles, neededCandles: deps.warmupCandles ?? DEFAULT_WARMUP, restoredCandles });
    },
  };
}
