/**
 * Data sources of the Jev Decision Lab: point-in-time reads for decisions, future reads for the outcome engine only.
 * Specification: docs/JEV-LABORATORIO-DE-DECISAO.md sections 3.3 and 4.
 *
 * - `RecordStore` keeps capture records sorted by `t` and serves them through ONE implementation of `asOf`, so the
 *   replay and the synthetic source cannot differ in how they respect the cut-off.
 * - `asOf(t)` returns a view whose cut-off is a closed-over constant: nothing reachable from it is stamped after `t`.
 * - `future(t0, t1)` exists on the source and is called only by the outcome engine. Between `openDecision(t)` and
 *   `closeDecision()` it throws `LeakError`, and so does `asOf(t')` with `t' > t`: a trap for a policy that smuggled
 *   the source through a closure. It is a safety net against mistakes, not a sandbox against hostile code.
 * - `SyntheticSource` generates capture records from a seeded PRNG: a driftless geometric Brownian price whose candle
 *   highs and lows come from the exact Brownian bridge, AR(1) funding with an announcement and a settled value, a basis
 *   tied to funding, spreads and open interest, plus an optional planted edge. It proves arithmetic and the statistical
 *   machinery, never profit.
 *
 * No network, no clock, no system randomness, no file access.
 */

import {
  CAPTURE_LIMITS,
  CaptureFormatError,
  FUNDING_INTERVALS_MS,
  parseCaptureText,
  type CaptureKind,
  type CaptureRecord,
  type ParseCaptureOptions,
  type RecordOf,
} from "./capture-format.ts";
import { Rng } from "./rng.ts";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "./types.ts";

export class LeakError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeakError";
  }
}

export interface PointInTimeView {
  /** The cut-off. Nothing reachable from this view is stamped after it. */
  readonly asOfMs: number;
  /** Instruments with at least one record of the kind (any kind when omitted) stamped at or before the cut-off, sorted. */
  instruments(kind?: CaptureKind): string[];
  latest<K extends CaptureKind>(kind: K, inst: string): RecordOf<K> | null;
  /** Records with sinceMs <= t <= cut-off, oldest first. */
  history<K extends CaptureKind>(kind: K, inst: string, sinceMs?: number): readonly RecordOf<K>[];
  /** Per-epoch side channel of the synthetic source (planted signal). Empty for a replay and off the epoch grid. */
  readonly extras: Readonly<Record<string, number>>;
}

export interface FutureWindow {
  readonly fromMs: number;
  readonly toMs: number;
  /** The last instant the source has data for. A window that ends after it is incomplete. */
  readonly coversUntilMs: number;
  readonly records: readonly CaptureRecord[];
}

export interface DataSource {
  readonly id: string;
  readonly kind: "synthetic" | "replay";
  readonly coverage: { readonly firstMs: number; readonly lastMs: number };
  /** What was knowable at t. */
  asOf(t: number): PointInTimeView;
  /** Records with t0 < t <= t1. ONLY the outcome engine calls this. */
  future(t0: number, t1: number, kinds?: readonly CaptureKind[], insts?: readonly string[]): FutureWindow;
  openDecision(t: number): void;
  closeDecision(): void;
}

interface Stream {
  readonly kind: CaptureKind;
  readonly inst: string;
  readonly firstT: number;
  readonly records: readonly CaptureRecord[];
}

/** First index whose record has t >= value. */
function lowerBound(records: readonly CaptureRecord[], value: number): number {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((records[mid] as CaptureRecord).t < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** First index whose record has t > value. */
function upperBound(records: readonly CaptureRecord[], value: number): number {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((records[mid] as CaptureRecord).t <= value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function requireFiniteTime(value: number, name: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${name} must be a finite number`);
}

export interface StoreOptions {
  id: string;
  kind: "synthetic" | "replay";
  extras?: ReadonlyMap<number, Readonly<Record<string, number>>>;
}

const NO_EXTRAS: Readonly<Record<string, number>> = Object.freeze({});

export class RecordStore implements DataSource {
  readonly id: string;
  readonly kind: "synthetic" | "replay";
  readonly coverage: { readonly firstMs: number; readonly lastMs: number };
  /** Every record, sorted by t (stable for equal t). */
  readonly records: readonly CaptureRecord[];
  private readonly streams = new Map<string, Stream>();
  private readonly extrasByTime: ReadonlyMap<number, Readonly<Record<string, number>>>;
  private decisionCap: number | null = null;

  constructor(records: readonly CaptureRecord[], options: StoreOptions) {
    if (records.length === 0) throw new RangeError("a capture needs at least one record");
    this.id = options.id;
    this.kind = options.kind;
    this.records = [...records].sort((a, b) => a.t - b.t);
    this.extrasByTime = options.extras ?? new Map();
    const grouped = new Map<string, CaptureRecord[]>();
    for (const record of this.records) {
      const key = `${record.kind}|${record.inst}`;
      const list = grouped.get(key);
      if (list === undefined) grouped.set(key, [record]);
      else list.push(record);
    }
    for (const [key, list] of grouped) {
      const first = list[0] as CaptureRecord;
      this.streams.set(key, { kind: first.kind, inst: first.inst, firstT: first.t, records: list });
    }
    this.coverage = Object.freeze({ firstMs: (this.records[0] as CaptureRecord).t, lastMs: (this.records[this.records.length - 1] as CaptureRecord).t });
  }

  openDecision(t: number): void {
    requireFiniteTime(t, "t");
    if (this.decisionCap !== null) throw new Error("janela de decisão já está aberta");
    this.decisionCap = t;
  }

  closeDecision(): void {
    if (this.decisionCap === null) throw new Error("nenhuma janela de decisão aberta");
    this.decisionCap = null;
  }

  asOf(t: number): PointInTimeView {
    requireFiniteTime(t, "t");
    if (this.decisionCap !== null && t > this.decisionCap) throw new LeakError("asOf() de um instante posterior ao da decisão durante a janela de decisão");
    const cap = t;
    const streams = this.streams;
    const extras = this.extrasByTime.get(cap) ?? NO_EXTRAS;
    return {
      asOfMs: cap,
      extras,
      instruments(kind?: CaptureKind): string[] {
        const found = new Set<string>();
        for (const stream of streams.values()) {
          if (stream.firstT <= cap && (kind === undefined || stream.kind === kind)) found.add(stream.inst);
        }
        return [...found].sort();
      },
      latest<K extends CaptureKind>(kind: K, inst: string): RecordOf<K> | null {
        const stream = streams.get(`${kind}|${inst}`);
        if (stream === undefined) return null;
        const index = upperBound(stream.records, cap) - 1;
        return index < 0 ? null : (stream.records[index] as RecordOf<K>);
      },
      history<K extends CaptureKind>(kind: K, inst: string, sinceMs?: number): readonly RecordOf<K>[] {
        const stream = streams.get(`${kind}|${inst}`);
        if (stream === undefined) return [];
        const from = sinceMs === undefined ? 0 : lowerBound(stream.records, sinceMs);
        const to = upperBound(stream.records, cap);
        return (from >= to ? [] : stream.records.slice(from, to)) as readonly RecordOf<K>[];
      },
    };
  }

  future(t0: number, t1: number, kinds?: readonly CaptureKind[], insts?: readonly string[]): FutureWindow {
    requireFiniteTime(t0, "t0");
    requireFiniteTime(t1, "t1");
    if (t1 < t0) throw new RangeError("t1 must not be before t0");
    if (this.decisionCap !== null) throw new LeakError("future() chamado durante a janela de decisão");
    const wantedKinds = kinds === undefined ? null : new Set<CaptureKind>(kinds);
    const wantedInsts = insts === undefined ? null : new Set<string>(insts);
    const chunks: CaptureRecord[][] = [];
    for (const stream of this.streams.values()) {
      if (wantedKinds !== null && !wantedKinds.has(stream.kind)) continue;
      if (wantedInsts !== null && !wantedInsts.has(stream.inst)) continue;
      const from = upperBound(stream.records, t0);
      const to = upperBound(stream.records, t1);
      if (from < to) chunks.push(stream.records.slice(from, to));
    }
    const merged = chunks.length === 1 ? (chunks[0] as CaptureRecord[]) : chunks.flat().sort((a, b) => a.t - b.t);
    return { fromMs: t0, toMs: t1, coversUntilMs: this.coverage.lastMs, records: merged };
  }
}

export class ReplaySource extends RecordStore {
  constructor(records: readonly CaptureRecord[], id: string) {
    super(records, { id, kind: "replay" });
  }

  static fromText(text: string, id: string, options?: ParseCaptureOptions): ReplaySource {
    return new ReplaySource(parseCaptureText(text, options), id);
  }

  /** Decodes strict UTF-8 (invalid bytes are an error, never replaced) and parses the capture format. */
  static fromBytes(bytes: Uint8Array, id: string, options?: ParseCaptureOptions): ReplaySource {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new CaptureFormatError(1, "", "o arquivo não é UTF-8 válido");
    }
    return ReplaySource.fromText(text, id, options);
  }
}

// ---------------------------------------------------------------------------
// Exact Brownian bridge extremes
// ---------------------------------------------------------------------------

/**
 * Maximum and minimum of a Brownian bridge from log price `a` to log price `b` with total variance `variance`,
 * from two uniforms in (0, 1). P(max >= m) = exp(-2 (m - a)(m - b) / variance) for m above both endpoints, so a
 * barrier test over bars reproduces CONTINUOUS monitoring with no discretization bias. The drift of the underlying
 * motion does not matter: given the endpoints, a bridge is the same with or without drift.
 */
export function sampleBarExtremes(a: number, b: number, variance: number, u1: number, u2: number): { max: number; min: number } {
  const spread = (b - a) * (b - a);
  const max = (a + b + Math.sqrt(spread - 2 * variance * Math.log(u1))) / 2;
  const min = (a + b - Math.sqrt(spread - 2 * variance * Math.log(u2))) / 2;
  return { max, min };
}

// ---------------------------------------------------------------------------
// Synthetic source
// ---------------------------------------------------------------------------

export interface SyntheticAsset {
  base: string;
  /** Daily volatility of the log price, as a fraction. */
  dailyVol: number;
  startPrice: number;
}

export interface SyntheticConfig {
  seed: number;
  startMs: number;
  barMs: number;
  stepMs: number;
  horizonMs: number;
  executionDelayMs: number;
  epochs: number;
  warmupMs: number;
  quote: string;
  assets: readonly SyntheticAsset[];
  /** Arithmetic drift per day of the spot price. Zero keeps the price a martingale. */
  dailyDrift: number;
  funding: { intervalMs: number; meanPerInterval: number; ar: number; innovationSd: number; predictionNoiseSd: number };
  basis: { perFunding: number; noiseSd: number; noiseAr: number };
  spreadBps: { spot: number; perp: number };
  /** Expected gross return, in bps of notional per decision, of the oracle rule "long if signalZ > 0, else short". */
  plantedEdgeBps: number;
}

export const SYNTHETIC_DEFAULTS: Readonly<SyntheticConfig> = Object.freeze({
  seed: 1,
  startMs: 1_800_000_000_000,
  barMs: 15 * MINUTE_MS,
  stepMs: 6 * HOUR_MS,
  horizonMs: 24 * HOUR_MS,
  executionDelayMs: 15 * MINUTE_MS,
  epochs: 400,
  warmupMs: 3 * DAY_MS,
  quote: "USDT",
  assets: Object.freeze([
    Object.freeze({ base: "SYNA", dailyVol: 0.025, startPrice: 100 }),
    Object.freeze({ base: "SYNB", dailyVol: 0.04, startPrice: 20 }),
  ]),
  dailyDrift: 0,
  funding: Object.freeze({ intervalMs: 8 * HOUR_MS, meanPerInterval: 0.00005, ar: 0.9, innovationSd: 0.00003, predictionNoiseSd: 0.00001 }),
  basis: Object.freeze({ perFunding: 1, noiseSd: 0.0002, noiseAr: 0.9 }),
  spreadBps: Object.freeze({ spot: 2, perp: 1 }),
  plantedEdgeBps: 0,
});

export const MAX_PLANTED_RHO = 0.95;
const MAX_SYNTHETIC_EPOCHS = 50_000;
const BASE_PATTERN = /^[A-Z0-9]{1,12}$/;

type SyntheticOverrides = Partial<Omit<SyntheticConfig, "funding" | "basis" | "spreadBps">> & {
  funding?: Partial<SyntheticConfig["funding"]>;
  basis?: Partial<SyntheticConfig["basis"]>;
  spreadBps?: Partial<SyntheticConfig["spreadBps"]>;
};

function ceilTo(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

/** The correlation that makes the oracle rule earn `plantedEdgeBps` for an asset with the given daily volatility. */
export function plantedRho(plantedEdgeBps: number, dailyVol: number, horizonMs: number): number {
  const sigmaHorizon = dailyVol * Math.sqrt(horizonMs / DAY_MS);
  return plantedEdgeBps / 1e4 / (sigmaHorizon * Math.sqrt(2 / Math.PI));
}

/** Merges overrides into the defaults and validates the result. Invalid input is a RangeError, never a silent default. */
export function syntheticConfig(overrides: SyntheticOverrides = {}): SyntheticConfig {
  const config: SyntheticConfig = {
    ...SYNTHETIC_DEFAULTS,
    ...overrides,
    funding: { ...SYNTHETIC_DEFAULTS.funding, ...overrides.funding },
    basis: { ...SYNTHETIC_DEFAULTS.basis, ...overrides.basis },
    spreadBps: { ...SYNTHETIC_DEFAULTS.spreadBps, ...overrides.spreadBps },
    assets: overrides.assets ?? SYNTHETIC_DEFAULTS.assets,
    // The default execution delay is one bar, whatever the bar length is.
    executionDelayMs: overrides.executionDelayMs ?? overrides.barMs ?? SYNTHETIC_DEFAULTS.executionDelayMs,
  };
  const refuse = (what: string): never => {
    throw new RangeError(what);
  };
  const integer = (value: number, name: string, minimum: number, maximum: number): void => {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) refuse(`${name} must be an integer from ${minimum} to ${maximum}`);
  };
  integer(config.seed, "seed", 0, 4_294_967_295);
  integer(config.barMs, "barMs", 1_000, 86_400_000);
  if (config.barMs % 1_000 !== 0) refuse("barMs must be a multiple of 1000");
  for (const [name, value, minimum] of [
    ["startMs", config.startMs, 0],
    ["stepMs", config.stepMs, config.barMs],
    ["horizonMs", config.horizonMs, config.barMs],
    ["executionDelayMs", config.executionDelayMs, 0],
    ["warmupMs", config.warmupMs, 0],
  ] as const) {
    integer(value, name, minimum, CAPTURE_LIMITS.maxT);
    if (value % config.barMs !== 0) refuse(`${name} must be a multiple of barMs`);
  }
  integer(config.epochs, "epochs", 1, MAX_SYNTHETIC_EPOCHS);
  if (!BASE_PATTERN.test(config.quote)) refuse("quote must be 1 to 12 characters of A-Z and 0-9");
  if (config.assets.length < 1 || config.assets.length > 8) refuse("assets must have 1 to 8 entries");
  const bases = new Set<string>();
  for (const asset of config.assets) {
    if (!BASE_PATTERN.test(asset.base) || bases.has(asset.base)) refuse("asset base must be unique, 1 to 12 characters of A-Z and 0-9");
    bases.add(asset.base);
    if (!Number.isFinite(asset.dailyVol) || asset.dailyVol <= 0 || asset.dailyVol >= 0.5) refuse("dailyVol must be a fraction in (0, 0.5)");
    if (!Number.isFinite(asset.startPrice) || asset.startPrice <= 0) refuse("startPrice must be greater than zero");
  }
  if (!Number.isFinite(config.dailyDrift) || Math.abs(config.dailyDrift) >= 1) refuse("dailyDrift must be a fraction below 1 in absolute value");
  if (!FUNDING_INTERVALS_MS.includes(config.funding.intervalMs)) refuse("funding.intervalMs must be 1, 2, 4 or 8 hours");
  if (!Number.isFinite(config.funding.ar) || config.funding.ar < 0 || config.funding.ar >= 1) refuse("funding.ar must be in [0, 1)");
  for (const [name, value] of [
    ["funding.innovationSd", config.funding.innovationSd],
    ["funding.predictionNoiseSd", config.funding.predictionNoiseSd],
    ["basis.noiseSd", config.basis.noiseSd],
    ["spreadBps.spot", config.spreadBps.spot],
    ["spreadBps.perp", config.spreadBps.perp],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) refuse(`${name} must be a finite number at or above zero`);
  }
  if (!Number.isFinite(config.funding.meanPerInterval) || Math.abs(config.funding.meanPerInterval) > 0.01) refuse("funding.meanPerInterval must be within 1% per settlement");
  if (!Number.isFinite(config.basis.perFunding)) refuse("basis.perFunding must be finite");
  if (!Number.isFinite(config.basis.noiseAr) || config.basis.noiseAr < 0 || config.basis.noiseAr >= 1) refuse("basis.noiseAr must be in [0, 1)");
  if (!Number.isFinite(config.plantedEdgeBps) || config.plantedEdgeBps < 0) refuse("plantedEdgeBps must be a finite number at or above zero");
  if (config.plantedEdgeBps > 0) {
    for (const asset of config.assets) {
      if (plantedRho(config.plantedEdgeBps, asset.dailyVol, config.horizonMs) >= MAX_PLANTED_RHO) refuse("vantagem plantada grande demais para a volatilidade e o horizonte");
    }
  }
  const lastEpoch = config.startMs + config.warmupMs + (config.epochs - 1) * config.stepMs;
  const dataEnd = ceilTo(lastEpoch + config.executionDelayMs, config.barMs) + config.horizonMs + config.barMs;
  if (dataEnd > CAPTURE_LIMITS.maxT) refuse("the synthetic window ends after the year 2100");
  return config;
}

interface Generated {
  records: CaptureRecord[];
  extras: Map<number, Record<string, number>>;
}

function make<K extends CaptureKind>(kind: K, t: number, inst: string, data: RecordOf<K>["data"]): CaptureRecord {
  return Object.freeze({ t, kind, inst, data: Object.freeze(data) }) as unknown as CaptureRecord;
}

function generateSynthetic(config: SyntheticConfig): Generated {
  const { seed, startMs, barMs, stepMs, horizonMs, executionDelayMs, epochs, warmupMs } = config;
  const firstEpoch = startMs + warmupMs;
  const lastEpoch = firstEpoch + (epochs - 1) * stepMs;
  const lastExit = ceilTo(lastEpoch + executionDelayMs, barMs) + horizonMs;
  const dataEnd = lastExit + barMs;
  const bars = (dataEnd - startMs) / barMs;
  const dtDays = barMs / DAY_MS;
  const horizonDays = horizonMs / DAY_MS;
  const intervalMs = config.funding.intervalMs;
  const records: CaptureRecord[] = [];
  const extras = new Map<number, Record<string, number>>();

  for (const asset of config.assets) {
    const spot = `${asset.base}-${config.quote}`;
    const perp = `${spot}-SWAP`;
    const sigma = asset.dailyVol;
    const logDrift = config.dailyDrift - (sigma * sigma) / 2;
    const variance = sigma * sigma * dtDays;
    const zRng = new Rng(seed, `asset:${asset.base}:z`);
    const spotExtremes = new Rng(seed, `asset:${asset.base}:spot-extremes`);
    const perpExtremes = new Rng(seed, `asset:${asset.base}:perp-extremes`);
    const basisRng = new Rng(seed, `asset:${asset.base}:basis`);
    const fundingRng = new Rng(seed, `asset:${asset.base}:funding`);
    const spreadRng = new Rng(seed, `asset:${asset.base}:spread`);
    const oiRng = new Rng(seed, `asset:${asset.base}:oi`);

    // Spot log price at every bar boundary.
    const spotLog = new Array<number>(bars + 1);
    spotLog[0] = Math.log(asset.startPrice);
    for (let j = 0; j < bars; j += 1) {
      spotLog[j + 1] = (spotLog[j] as number) + logDrift * dtDays + sigma * Math.sqrt(dtDays) * zRng.normal();
    }

    // Funding: AR(1) rate per settlement, settlements on the multiples of the interval.
    const firstSettlementIndex = Math.floor(startMs / intervalMs);
    const lastSettlementIndex = Math.ceil(dataEnd / intervalMs) + 1;
    const rates = new Map<number, number>();
    const stationarySd = config.funding.innovationSd / Math.sqrt(1 - config.funding.ar * config.funding.ar);
    let previousRate = config.funding.meanPerInterval + stationarySd * fundingRng.normal();
    for (let k = firstSettlementIndex; k <= lastSettlementIndex; k += 1) {
      const rate = config.funding.meanPerInterval + config.funding.ar * (previousRate - config.funding.meanPerInterval) + config.funding.innovationSd * fundingRng.normal();
      const clamped = Math.max(-0.01, Math.min(0.01, rate));
      rates.set(k, clamped);
      previousRate = clamped;
    }
    for (let k = firstSettlementIndex; k <= lastSettlementIndex; k += 1) {
      const settleMs = k * intervalMs;
      const rate = rates.get(k) as number;
      const announcedAt = settleMs - intervalMs;
      const noise = config.funding.predictionNoiseSd * fundingRng.normal();
      if (announcedAt >= startMs && announcedAt <= dataEnd) {
        records.push(make("funding", announcedAt, perp, { rate: Math.max(-0.05, Math.min(0.05, rate + noise)), settleMs, intervalMs }));
      }
      if (settleMs >= startMs && settleMs <= dataEnd) records.push(make("funding", settleMs, perp, { rate, settleMs, intervalMs }));
    }

    // Perp log price: the spot plus a basis tied to the pending funding rate plus AR(1) noise.
    const perpLog = new Array<number>(bars + 1);
    let basisNoise = 0;
    const noiseScale = config.basis.noiseSd * Math.sqrt(1 - config.basis.noiseAr * config.basis.noiseAr);
    for (let j = 0; j <= bars; j += 1) {
      const instant = startMs + j * barMs;
      const pending = Math.floor(instant / intervalMs) + 1;
      basisNoise = j === 0 ? config.basis.noiseSd * basisRng.normal() : config.basis.noiseAr * basisNoise + noiseScale * basisRng.normal();
      const basis = Math.max(-0.2, Math.min(0.2, config.basis.perFunding * ((rates.get(pending) as number | undefined) ?? config.funding.meanPerInterval) + basisNoise));
      perpLog[j] = (spotLog[j] as number) + Math.log(1 + basis);
    }

    let openInterest = 1_000_000 * (0.5 + oiRng.next());
    for (let j = 0; j < bars; j += 1) {
      const start = startMs + j * barMs;
      const end = start + barMs;
      for (const [inst, path, extremes] of [
        [spot, spotLog, spotExtremes],
        [perp, perpLog, perpExtremes],
      ] as const) {
        const a = path[j] as number;
        const b = path[j + 1] as number;
        const open = Math.exp(a);
        const close = Math.exp(b);
        const { max, min } = sampleBarExtremes(a, b, variance, extremes.nextOpen(), extremes.nextOpen());
        const high = Math.max(Math.exp(max), open, close);
        const low = Math.min(Math.exp(min), open, close);
        records.push(make("candle", end, inst, { startMs: start, barMs, open, high, low, close }));
      }
      for (const [inst, path, base] of [
        [spot, spotLog, config.spreadBps.spot],
        [perp, perpLog, config.spreadBps.perp],
      ] as const) {
        const mid = Math.exp(path[j + 1] as number);
        const spreadBps = base * Math.exp(0.3 * spreadRng.normal() - 0.045);
        records.push(make("ticker", end, inst, { bid: mid * (1 - spreadBps / 2e4), ask: mid * (1 + spreadBps / 2e4), last: mid }));
      }
      if (end % HOUR_MS === 0) {
        openInterest *= Math.exp(0.01 * oiRng.normal());
        records.push(make("oi", end, perp, { oi: openInterest }));
      }
    }

    // Planted edge: a score correlated by rho with the standardized realized log return of the holding window.
    if (config.plantedEdgeBps > 0) {
      const rho = plantedRho(config.plantedEdgeBps, sigma, horizonMs);
      const signalRng = new Rng(seed, `asset:${asset.base}:signal`);
      const meanX = logDrift * horizonDays;
      const sdX = sigma * Math.sqrt(horizonDays);
      for (let i = 0; i < epochs; i += 1) {
        const t = firstEpoch + i * stepMs;
        const entryStart = ceilTo(t + executionDelayMs, barMs);
        const entryIndex = (entryStart - startMs) / barMs;
        const exitIndex = (entryStart + horizonMs - startMs) / barMs;
        const x = (spotLog[exitIndex] as number) - (spotLog[entryIndex] as number);
        const signal = rho * ((x - meanX) / sdX) + Math.sqrt(1 - rho * rho) * signalRng.normal();
        const bucket = extras.get(t) ?? {};
        bucket[`signalZ:${spot}`] = signal;
        bucket[`signalZ:${perp}`] = signal;
        extras.set(t, bucket);
      }
    }
  }
  return { records, extras };
}

export class SyntheticSource extends RecordStore {
  readonly config: SyntheticConfig;

  constructor(config: SyntheticConfig) {
    const checked = syntheticConfig(config);
    const generated = generateSynthetic(checked);
    super(generated.records, { id: `synthetic:seed=${checked.seed}`, kind: "synthetic", extras: generated.extras });
    this.config = checked;
  }

  /** The decision grid: firstEpoch + i * step. */
  epochTimes(): number[] {
    const first = this.config.startMs + this.config.warmupMs;
    return Array.from({ length: this.config.epochs }, (_, i) => first + i * this.config.stepMs);
  }
}

