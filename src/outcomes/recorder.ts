/**
 * The recorder (INT-0.8, REC-1, REC-3, REC-5): every five minutes it writes a snapshot of each followed instrument, and every
 * five minutes it labels the snapshots whose horizons are over. Both are free and local: public OKX reads, the flow engine the
 * app already runs, and the files of the outcome store. It never touches the model, never signs and never sends.
 *
 * Safe by construction: one pass at a time (a slow pass makes the next one skip), every failure is caught and counted by a
 * constant code, `enabled()` is read at the moment of each pass so `INONU_RECORDER=off` stops it without a restart, and the work
 * of one instrument never stops the others. Everything with a clock, a network or a disk is injected.
 */
import type { Analysis } from "../intel/analyst";
import { computeFeatures, closedBars } from "../intel/features/compute";
import { flowInputFromAnalysis } from "../intel/features/from-analysis";
import { INTERVALS, type Bar, type FlowInput, type Interval } from "../intel/features/types";
import { atr } from "../intel/ta/indicators";
import type { Regime } from "../intel/derivatives";
import { OkxPublicError } from "../inonu/okx-public";
import { labelSnapshot, windowOf } from "./labeler";
import type { OkxBars } from "./okx-bars";
import type { OutcomeStore } from "./store";
import { HORIZONS, type Label, type Snapshot, type ZoneRef } from "./types";

export const SNAPSHOT_EVERY_MS = 300_000;
/** A snapshot whose window still has a hole after this age is labeled incomplete for good. */
export const GIVE_UP_AGE_MS = 48 * 3_600_000;
const LABEL_LOOKBACK_MS = 3 * 86_400_000;
const MAX_LABELS_PER_PASS = 200;
const BARS_LIMIT = 300;
const HISTORY_PAGES = 3;
/** How long a read of each interval is reused inside the recorder, so the slow ones are not asked every pass. */
const REUSE_MS: Readonly<Record<Interval, number>> = { "5m": 60_000, "15m": 120_000, "1h": 300_000, "4h": 900_000 };

export interface FlowReading {
  readonly analysis: Analysis;
  readonly nowMs: number;
}

export interface RecorderDeps {
  readonly store: OutcomeStore;
  readonly bars: OkxBars;
  /** The engine's reading of an instrument (free); a failure is a skipped flow block, not a skipped snapshot. */
  readonly analysis: (instId: string, signal: AbortSignal) => Promise<FlowReading>;
  /** Funding and open interest of a perpetual; null for anything else. */
  readonly regime: (instId: string, signal: AbortSignal) => Promise<Regime | null>;
  /** The instruments the app follows now. */
  readonly instruments: () => readonly string[];
  readonly now: () => number;
  readonly newId: () => string;
  /** Round-trip fees and slippage in bps, from the lab cost table. */
  readonly feeAndSlippageRoundTripBps: { readonly spot: number; readonly perp: number };
  readonly enabled: () => boolean;
}

export interface RecorderStatus {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly lastPassMs: number | null;
  readonly lastLabelPassMs: number | null;
  readonly snapshotsWritten: number;
  readonly labelsWritten: number;
  /** Counts by constant code of what went wrong or was skipped since the app started. */
  readonly skipped: Readonly<Record<string, number>>;
}

export interface Recorder {
  /** Writes one snapshot; null when disabled or when the price could not be read. */
  snapshotNow(instId: string, origem: Snapshot["origem"], signal?: AbortSignal): Promise<Snapshot | null>;
  /** One snapshot pass over the followed instruments. */
  tick(): Promise<void>;
  /** One labeling pass. */
  label(): Promise<number>;
  status(): RecorderStatus;
}

const marketOf = (instId: string): "spot" | "perp" => (instId.endsWith("-SWAP") ? "perp" : "spot");
const codeOf = (error: unknown): string => (error instanceof OkxPublicError ? `okx_${error.code}` : "falha");

function zonesOf(analysis: Analysis | null, price: number): Snapshot["zones"] {
  if (analysis === null || analysis.zones === null) return { demanda: null, oferta: null, todas: [] };
  const live = analysis.zones.visible.filter((z) => z.estado === "ativa" || z.estado === "testada");
  const ref = (z: (typeof live)[number]): ZoneRef => ({ id: z.id, lado: z.lado, baixo: z.baixo, alto: z.alto, invalidacao: z.invalidacao, nota: Math.round(z.nota * 100) / 100 });
  const pick = (side: "demanda" | "oferta"): ZoneRef | null => {
    const list = live.filter((z) => z.lado === side);
    const gap = (z: (typeof list)[number]): number => (side === "demanda" ? Math.max(0, price - z.alto) : Math.max(0, z.baixo - price));
    const zone = list.sort((a, b) => gap(a) - gap(b) || b.nota - a.nota)[0];
    return zone === undefined ? null : ref(zone);
  };
  return { demanda: pick("demanda"), oferta: pick("oferta"), todas: live.map(ref) };
}

export function createRecorder(deps: RecorderDeps): Recorder {
  const skipped: Record<string, number> = {};
  const count = (code: string): void => {
    skipped[code] = (skipped[code] ?? 0) + 1;
  };
  let running = false;
  let lastPassMs: number | null = null;
  let lastLabelPassMs: number | null = null;
  let snapshotsWritten = 0;
  let labelsWritten = 0;
  const cache = new Map<string, { at: number; bars: Bar[] }>();

  async function barsOf(instId: string, interval: Interval, signal: AbortSignal): Promise<Bar[]> {
    const key = `${instId}|${interval}`;
    const hit = cache.get(key);
    if (hit !== undefined && deps.now() - hit.at < REUSE_MS[interval]) return hit.bars;
    const bars = await deps.bars.bars(instId, interval, BARS_LIMIT, signal);
    cache.set(key, { at: deps.now(), bars });
    return bars;
  }

  async function snapshotNow(instId: string, origem: Snapshot["origem"], outer?: AbortSignal): Promise<Snapshot | null> {
    if (!deps.enabled()) return null;
    const signal = outer ?? AbortSignal.timeout(30_000);
    let quote: Awaited<ReturnType<OkxBars["quote"]>>;
    try {
      quote = await deps.bars.quote(instId, signal);
    } catch (error) {
      count(`cotacao_${codeOf(error)}`);
      return null;
    }

    const bars: Partial<Record<Interval, Bar[]>> = {};
    for (const interval of INTERVALS) {
      try {
        bars[interval] = await barsOf(instId, interval, signal);
      } catch (error) {
        count(`velas_${interval}_${codeOf(error)}`);
      }
    }
    let btc15m: Bar[] | null = null;
    if (!/^BTC-/.test(instId)) {
      try {
        btc15m = await barsOf("BTC-USDT", "15m", signal);
      } catch (error) {
        count(`btc_${codeOf(error)}`);
      }
    }

    let regime: Regime | null = null;
    try {
      regime = await deps.regime(instId, signal);
    } catch {
      count("regime_falhou");
    }
    let reading: FlowReading | null = null;
    try {
      reading = await deps.analysis(instId, signal);
    } catch {
      count("fluxo_falhou");
    }

    // The instant of the snapshot is the END of the collection: every block above was captured at or before it. A block that says it
    // is from later than that (or a flow window that ends later) is not the state at the instant, so it is dropped with its reason,
    // and the zones that came with it go too. Nothing is ever written as "age zero".
    const asOfMs = deps.now();
    let flow: FlowInput | null = null;
    let flowReason: string | undefined;
    if (reading !== null) {
      flow = reading.nowMs > asOfMs ? null : flowInputFromAnalysis(reading.analysis, asOfMs);
      if (flow === null) {
        reading = null;
        flowReason = "fluxo_posterior_ao_instante";
        count("fluxo_do_futuro");
      }
    }

    const market = marketOf(instId);
    const features = computeFeatures({
      instId,
      asOfMs,
      price: quote.mid,
      bars,
      btc15m,
      spreadBps: quote.spreadBps,
      feeAndSlippageRoundTripBps: deps.feeAndSlippageRoundTripBps[market],
      regime: regime === null ? null : { funding: regime.funding, oiVar: regime.oiVar },
      flow,
      ...(flowReason === undefined ? {} : { flowReason }),
    });
    const closed15 = closedBars(bars["15m"], "15m", asOfMs);
    const atr15m = closed15.length >= 20 ? atr(closed15.map((b) => b.high), closed15.map((b) => b.low), closed15.map((b) => b.close), 14).at(-1) ?? null : null;
    const snapshot: Snapshot = {
      id: deps.newId(),
      asOfMs,
      instId,
      market,
      price: quote.mid,
      costRoundTripBps: Math.round((deps.feeAndSlippageRoundTripBps[market] + quote.spreadBps) * 100) / 100,
      atr15m: atr15m === null ? null : Math.round(atr15m * 1e8) / 1e8,
      zones: zonesOf(reading?.analysis ?? null, quote.mid),
      features,
      origem,
    };
    if (!deps.store.appendSnapshot(snapshot)) {
      count("gravacao_falhou");
      return snapshot;
    }
    snapshotsWritten += 1;
    return snapshot;
  }

  async function tick(): Promise<void> {
    if (running || !deps.enabled()) return;
    running = true;
    try {
      for (const instId of deps.instruments()) {
        try {
          await snapshotNow(instId, "relogio");
        } catch {
          count("snapshot_falhou");
        }
      }
      lastPassMs = deps.now();
    } finally {
      running = false;
    }
  }

  async function label(): Promise<number> {
    if (!deps.enabled()) return 0;
    const nowMs = deps.now();
    lastLabelPassMs = nowMs;
    const since = nowMs - LABEL_LOOKBACK_MS;
    const done = deps.store.doneKeys(since);
    const due: { snapshot: Snapshot; horizon: (typeof HORIZONS)[number] }[] = [];
    for (const snapshot of deps.store.snapshots(since)) {
      for (const horizon of HORIZONS) {
        if (nowMs >= windowOf(snapshot.asOfMs, horizon).end && !done.has(`${snapshot.id}|${horizon}`)) due.push({ snapshot, horizon });
      }
    }
    due.sort((a, b) => a.snapshot.asOfMs - b.snapshot.asOfMs);
    const work = due.slice(0, MAX_LABELS_PER_PASS);

    // the five minute bars of each instrument, read once: the recent ones, and older pages only when a window needs them
    const byInst = new Map<string, Bar[]>();
    const signal = AbortSignal.timeout(60_000);
    let written = 0;
    for (const { snapshot, horizon } of work) {
      let bars = byInst.get(snapshot.instId);
      if (bars === undefined) {
        try {
          bars = await deps.bars.bars(snapshot.instId, "5m", BARS_LIMIT, signal);
        } catch (error) {
          count(`rotulo_velas_${codeOf(error)}`);
          byInst.set(snapshot.instId, []);
          continue;
        }
        byInst.set(snapshot.instId, bars);
      }
      if (bars.length === 0) continue;
      const { start } = windowOf(snapshot.asOfMs, horizon);
      // older than the newest page: page backwards until the window's start is covered (or give up for now)
      let pages = 0;
      while (bars.length > 0 && bars[0]!.ts > start && pages < HISTORY_PAGES) {
        pages += 1;
        try {
          const older = await deps.bars.history(snapshot.instId, "5m", bars[0]!.ts, 100, signal);
          if (older.length === 0) break;
          bars = [...older, ...bars];
          byInst.set(snapshot.instId, bars);
        } catch (error) {
          count(`rotulo_historico_${codeOf(error)}`);
          break;
        }
      }
      const result: Label = labelSnapshot(snapshot, bars, horizon, nowMs);
      if (!result.completo && nowMs - snapshot.asOfMs < GIVE_UP_AGE_MS) continue; // a hole may still be filled: try again next pass
      if (deps.store.appendLabel(result)) {
        labelsWritten += 1;
        written += 1;
      } else count("gravacao_falhou");
    }
    return written;
  }

  return {
    snapshotNow,
    tick,
    label,
    status: () => ({ enabled: deps.enabled(), running, lastPassMs, lastLabelPassMs, snapshotsWritten, labelsWritten, skipped: { ...skipped } }),
  };
}

/** Milliseconds from `nowMs` to two seconds after the next five minute boundary, when the bar of the last five minutes is published. */
export function msToNextPass(nowMs: number): number {
  return SNAPSHOT_EVERY_MS - (nowMs % SNAPSHOT_EVERY_MS) + 2_000;
}

export interface Scheduler {
  after(ms: number, fn: () => void): () => void;
  every(ms: number, fn: () => void): () => void;
}

/** Starts the five minute clock: aligned to the boundary, then every five minutes: a snapshot pass and then a labeling pass. Returns the stopper. */
export function startRecorder(recorder: Recorder, schedule: Scheduler, now: () => number): () => void {
  const pass = (): void => {
    void recorder.tick().then(() => recorder.label()).catch(() => undefined);
  };
  let stopEvery: (() => void) | null = null;
  const stopAfter = schedule.after(msToNextPass(now()), () => {
    pass();
    stopEvery = schedule.every(SNAPSHOT_EVERY_MS, pass);
  });
  return () => {
    stopAfter();
    stopEvery?.();
  };
}
