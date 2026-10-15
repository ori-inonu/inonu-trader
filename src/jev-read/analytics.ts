/**
 * The optional analysis block: a pre-computed digest written by the Python collector (jev_analytics) into
 * data/jev-analytics/latest.json and read here as one more input for Jev. It is strictly allowlisted: closed
 * vocabularies, finite numbers inside documented bounds, unknown keys dropped and any decision-flavored key
 * anywhere in the pack refusing the whole file. A pack that is absent, malformed or older than two minutes is
 * simply not part of the state; Jev decides without it exactly as before.
 */

import { readFileSync, statSync } from "node:fs";
import { FUTURE_TOLERANCE_MS } from "./types";

/** The pack is the producer's local clock; past this age the digest is too old to describe the tape. */
export const ANALYTICS_MAX_AGE_MS = 120_000;
const MAX_AGE_SEC = 86_400;
const MAX_FILE_BYTES = 1_000_000;
const MAX_INSTRUMENTS = 32;
const INST_ID = /^[A-Z0-9]{1,12}-[A-Z0-9]{1,12}$/;

/** Decision-flavored names the pack must never carry, anywhere (spec P4). */
const FORBIDDEN_KEYS = new Set(["buy", "sell", "hold", "action", "signal", "signals", "recommend", "recommendation", "vote", "side"]);

export interface AnalysisLevel {
  readonly px: number;
  readonly kind: "support" | "resistance";
  readonly touches: number;
  readonly tf: "15m" | "1h";
}

export interface AnalysisSmcBreak {
  readonly kind: "BOS" | "CHoCH";
  readonly dir: "up" | "down";
  readonly ageBars: number;
}

export interface AnalysisSmcSweep {
  readonly kind: "highs" | "lows";
  readonly ageBars: number;
}

/** Smart money digest of the closed bars of one timeframe. Descriptive distances and counts, never an entry or an exit. */
export interface AnalysisSmc {
  readonly demandBlockBps: number | null;
  readonly supplyBlockBps: number | null;
  readonly gapsUp: number;
  readonly gapsDown: number;
  readonly gapNearestBps: number | null;
  readonly lastBreak: AnalysisSmcBreak | null;
  readonly rangePos: number | null;
  readonly rangeState: "inside" | "above" | "below" | null;
  readonly poolAboveBps: number | null;
  readonly poolBelowBps: number | null;
  readonly lastSweep: AnalysisSmcSweep | null;
}

export interface AnalysisTrend {
  readonly regime: "up" | "down" | "range";
  readonly adx15m: number;
  readonly efficiency15m: number;
  readonly emaStack15m: number;
  readonly emaStack1h: number;
  readonly emaStack4h: number;
  readonly extensionAtr15m: number;
}

export interface AnalysisMomentum {
  readonly rsi5m: number;
  readonly rsi15m: number;
  readonly rsi1h: number;
  readonly macdHistAtr15m: number;
}

export interface AnalysisVolatility {
  readonly atrBps15m: number;
  readonly atrBps1h: number;
  readonly volRank24h: number;
  readonly bbWidthRank15m: number;
  readonly bbPercentB15m: number;
  readonly expectedAbsMove5mBps: number;
}

export interface AnalysisStructure {
  readonly donchianPos1h: number;
  readonly supportBps: number | null;
  readonly supportTouches: number | null;
  readonly resistanceBps: number | null;
  readonly resistanceTouches: number | null;
  readonly renkoRun15m: number;
  readonly levels: readonly AnalysisLevel[];
  readonly smc15m?: AnalysisSmc;
  readonly smc1h?: AnalysisSmc;
}

export type OiPriceRegime = "long_buildup" | "short_buildup" | "short_covering" | "long_unwind" | "mixed";

export interface AnalysisDerivatives {
  readonly fundingZ: number | null;
  readonly fundingPctile: number | null;
  readonly oiChange1hPct: number | null;
  readonly oiPriceRegime: OiPriceRegime | null;
  readonly longShortRatio: number | null;
  readonly longShortZ: number | null;
  readonly takerBuyShare1h: number | null;
}

export interface AnalysisCrossAsset {
  readonly corrBtc48h: number;
  readonly betaBtc48h: number;
  readonly relStrengthVsBtc24hBps: number;
}

export interface AnalysisCost {
  readonly assumedRoundTripFeeBps: number;
  readonly spreadBps: number;
  readonly moveToCost: number;
}

/**
 * The validated analysis block attached to a TapeState. Sections are absent (the key does not exist) when the
 * pack could not compute them; an analysis with no surviving section is omitted entirely.
 */
export interface TapeAnalysis {
  readonly ageSec: number;
  readonly trend?: AnalysisTrend;
  readonly momentum?: AnalysisMomentum;
  readonly volatility?: AnalysisVolatility;
  readonly structure?: AnalysisStructure;
  readonly derivatives?: AnalysisDerivatives;
  readonly crossAsset?: AnalysisCrossAsset;
  readonly cost?: AnalysisCost;
}

/** The pack minus what the state never needs: envelope fields and per instrument diagnostics stay out. */
export interface AnalyticsPack {
  readonly generatedAtMs: number;
  readonly instruments: Readonly<Record<string, { readonly instId: string; readonly features: Record<string, unknown> | null }>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const inRange = (value: unknown, lo: number, hi: number, loExclusive = false): value is number =>
  finite(value) && (loExclusive ? value > lo : value >= lo) && value <= hi;
const finiteOrNull = (value: unknown): value is number | null => value === null || finite(value);
const intOrNull = (value: unknown, min: number): value is number | null | undefined =>
  value === null || value === undefined || (Number.isInteger(value) && (value as number) >= min);

/** True when a decision-flavored key sits anywhere in the value, at any depth. */
function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, item]) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(item));
}

function projectTrend(raw: unknown): AnalysisTrend | null {
  if (!isRecord(raw)) return null;
  const regime = raw.regime;
  if (regime !== "up" && regime !== "down" && regime !== "range") return null;
  if (!inRange(raw.adx15m, 0, 100) || !inRange(raw.efficiency15m, 0, 1) || !finite(raw.extensionAtr15m)) return null;
  for (const key of ["emaStack15m", "emaStack1h", "emaStack4h"] as const) {
    const value = raw[key];
    if (!Number.isInteger(value) || (value !== -1 && value !== 0 && value !== 1)) return null;
  }
  return {
    regime,
    adx15m: raw.adx15m,
    efficiency15m: raw.efficiency15m,
    emaStack15m: raw.emaStack15m as number,
    emaStack1h: raw.emaStack1h as number,
    emaStack4h: raw.emaStack4h as number,
    extensionAtr15m: raw.extensionAtr15m,
  };
}

function projectMomentum(raw: unknown): AnalysisMomentum | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.rsi5m, 0, 100) || !inRange(raw.rsi15m, 0, 100) || !inRange(raw.rsi1h, 0, 100)) return null;
  if (!finite(raw.macdHistAtr15m)) return null;
  return { rsi5m: raw.rsi5m, rsi15m: raw.rsi15m, rsi1h: raw.rsi1h, macdHistAtr15m: raw.macdHistAtr15m };
}

function projectVolatility(raw: unknown): AnalysisVolatility | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.atrBps15m, 0, Number.POSITIVE_INFINITY, true)) return null;
  if (!inRange(raw.atrBps1h, 0, Number.POSITIVE_INFINITY, true)) return null;
  if (!inRange(raw.volRank24h, 0, 1, true) || !inRange(raw.bbWidthRank15m, 0, 1, true)) return null;
  if (!finite(raw.bbPercentB15m) || !inRange(raw.expectedAbsMove5mBps, 0, Number.POSITIVE_INFINITY)) return null;
  return {
    atrBps15m: raw.atrBps15m,
    atrBps1h: raw.atrBps1h,
    volRank24h: raw.volRank24h,
    bbWidthRank15m: raw.bbWidthRank15m,
    bbPercentB15m: raw.bbPercentB15m,
    expectedAbsMove5mBps: raw.expectedAbsMove5mBps,
  };
}

function projectLevel(raw: unknown): AnalysisLevel | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.px, 0, Number.POSITIVE_INFINITY, true)) return null;
  if (raw.kind !== "support" && raw.kind !== "resistance") return null;
  if (!Number.isInteger(raw.touches) || (raw.touches as number) < 1) return null;
  if (raw.tf !== "15m" && raw.tf !== "1h") return null;
  return { px: raw.px, kind: raw.kind, touches: raw.touches as number, tf: raw.tf };
}

const SMC_MAX_BPS = 1_000_000;
const SMC_MAX_AGE_BARS = 100_000;
const SMC_MAX_COUNT = 1_000;
const bpsOrNull = (value: unknown): value is number | null | undefined => value === null || value === undefined || inRange(value, 0, SMC_MAX_BPS);
const intBetween = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

function projectSmc(raw: unknown): AnalysisSmc | null {
  if (!isRecord(raw)) return null;
  if (!bpsOrNull(raw.demandBlockBps) || !bpsOrNull(raw.supplyBlockBps) || !bpsOrNull(raw.gapNearestBps)) return null;
  if (!bpsOrNull(raw.poolAboveBps) || !bpsOrNull(raw.poolBelowBps)) return null;
  if (!intBetween(raw.gapsUp, SMC_MAX_COUNT) || !intBetween(raw.gapsDown, SMC_MAX_COUNT)) return null;
  if (raw.rangePos !== null && raw.rangePos !== undefined && !inRange(raw.rangePos, 0, 1)) return null;
  const state = raw.rangeState;
  if (state !== null && state !== undefined && state !== "inside" && state !== "above" && state !== "below") return null;
  let lastBreak: AnalysisSmcBreak | null = null;
  if (raw.lastBreak !== null && raw.lastBreak !== undefined) {
    const b = raw.lastBreak;
    if (!isRecord(b) || (b.kind !== "BOS" && b.kind !== "CHoCH") || (b.dir !== "up" && b.dir !== "down") || !intBetween(b.ageBars, SMC_MAX_AGE_BARS)) return null;
    lastBreak = { kind: b.kind, dir: b.dir, ageBars: b.ageBars };
  }
  let lastSweep: AnalysisSmcSweep | null = null;
  if (raw.lastSweep !== null && raw.lastSweep !== undefined) {
    const s = raw.lastSweep;
    if (!isRecord(s) || (s.kind !== "highs" && s.kind !== "lows") || !intBetween(s.ageBars, SMC_MAX_AGE_BARS)) return null;
    lastSweep = { kind: s.kind, ageBars: s.ageBars };
  }
  return {
    demandBlockBps: raw.demandBlockBps ?? null,
    supplyBlockBps: raw.supplyBlockBps ?? null,
    gapsUp: raw.gapsUp,
    gapsDown: raw.gapsDown,
    gapNearestBps: raw.gapNearestBps ?? null,
    lastBreak,
    rangePos: raw.rangePos ?? null,
    rangeState: (state ?? null) as AnalysisSmc["rangeState"],
    poolAboveBps: raw.poolAboveBps ?? null,
    poolBelowBps: raw.poolBelowBps ?? null,
    lastSweep,
  };
}

function projectStructure(raw: unknown): AnalysisStructure | null {
  if (!isRecord(raw) || !finite(raw.donchianPos1h) || !Number.isInteger(raw.renkoRun15m)) return null;
  if (!Array.isArray(raw.levels) || raw.levels.length > 6) return null;
  const levels: AnalysisLevel[] = [];
  for (const item of raw.levels) {
    const level = projectLevel(item);
    if (level === null) return null;
    levels.push(level);
  }
  if (raw.supportBps !== null && raw.supportBps !== undefined && !inRange(raw.supportBps, 0, Number.POSITIVE_INFINITY)) return null;
  if (raw.resistanceBps !== null && raw.resistanceBps !== undefined && !inRange(raw.resistanceBps, 0, Number.POSITIVE_INFINITY)) return null;
  if (!intOrNull(raw.supportTouches, 1) || !intOrNull(raw.resistanceTouches, 1)) return null;
  const smc15m = projectSmc(raw.smc15m);
  const smc1h = projectSmc(raw.smc1h);
  return {
    donchianPos1h: raw.donchianPos1h,
    supportBps: raw.supportBps ?? null,
    supportTouches: raw.supportTouches ?? null,
    resistanceBps: raw.resistanceBps ?? null,
    resistanceTouches: raw.resistanceTouches ?? null,
    renkoRun15m: raw.renkoRun15m as number,
    levels,
    ...(smc15m === null ? {} : { smc15m }),
    ...(smc1h === null ? {} : { smc1h }),
  };
}

const OI_REGIMES = new Set<OiPriceRegime>(["long_buildup", "short_buildup", "short_covering", "long_unwind", "mixed"]);

function projectDerivatives(raw: unknown): AnalysisDerivatives | null {
  if (!isRecord(raw)) return null;
  if (!finiteOrNull(raw.fundingZ) || !finiteOrNull(raw.oiChange1hPct) || !finiteOrNull(raw.longShortZ)) return null;
  if (raw.fundingPctile !== null && raw.fundingPctile !== undefined && !inRange(raw.fundingPctile, 0, 1)) return null;
  if (raw.takerBuyShare1h !== null && raw.takerBuyShare1h !== undefined && !inRange(raw.takerBuyShare1h, 0, 1)) return null;
  if (raw.longShortRatio !== null && raw.longShortRatio !== undefined && !inRange(raw.longShortRatio, 0, Number.POSITIVE_INFINITY, true)) return null;
  const regime = raw.oiPriceRegime;
  if (regime !== null && regime !== undefined && !OI_REGIMES.has(regime as OiPriceRegime)) return null;
  const out: AnalysisDerivatives = {
    fundingZ: raw.fundingZ ?? null,
    fundingPctile: raw.fundingPctile ?? null,
    oiChange1hPct: raw.oiChange1hPct ?? null,
    oiPriceRegime: (regime ?? null) as OiPriceRegime | null,
    longShortRatio: raw.longShortRatio ?? null,
    longShortZ: raw.longShortZ ?? null,
    takerBuyShare1h: raw.takerBuyShare1h ?? null,
  };
  return Object.values(out).some((v) => v !== null) ? out : null;
}

function projectCrossAsset(raw: unknown): AnalysisCrossAsset | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.corrBtc48h, -1, 1) || !finite(raw.betaBtc48h) || !finite(raw.relStrengthVsBtc24hBps)) return null;
  return { corrBtc48h: raw.corrBtc48h, betaBtc48h: raw.betaBtc48h, relStrengthVsBtc24hBps: raw.relStrengthVsBtc24hBps };
}

function projectCost(raw: unknown): AnalysisCost | null {
  if (!isRecord(raw)) return null;
  if (!inRange(raw.assumedRoundTripFeeBps, 0, Number.POSITIVE_INFINITY, true)) return null;
  if (!inRange(raw.spreadBps, 0, Number.POSITIVE_INFINITY) || !inRange(raw.moveToCost, 0, Number.POSITIVE_INFINITY)) return null;
  return { assumedRoundTripFeeBps: raw.assumedRoundTripFeeBps, spreadBps: raw.spreadBps, moveToCost: raw.moveToCost };
}

const SECTIONS = {
  trend: projectTrend,
  momentum: projectMomentum,
  volatility: projectVolatility,
  structure: projectStructure,
  derivatives: projectDerivatives,
  crossAsset: projectCrossAsset,
  cost: projectCost,
} as const;

/**
 * The single allowlist validator for the analysis block, used by the pack reader, the public projection and
 * the contract tests. The input is `{ageSec, ...sections}`; each section is copied only when it satisfies its
 * documented constraints, otherwise it is dropped. Nothing is repaired and no section is ever invented.
 */
export function projectAnalysis(raw: unknown): TapeAnalysis | null {
  if (!isRecord(raw)) return null;
  if (!Number.isInteger(raw.ageSec) || (raw.ageSec as number) < 0 || (raw.ageSec as number) > MAX_AGE_SEC) return null;
  if (hasForbiddenKey(raw)) return null;
  const out: Record<string, unknown> = { ageSec: raw.ageSec };
  let sections = 0;
  for (const [key, project] of Object.entries(SECTIONS)) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const projected = project(value);
    if (projected !== null) {
      out[key] = projected;
      sections += 1;
    }
  }
  return sections === 0 ? null : (out as unknown as TapeAnalysis);
}

/** Strict envelope validation of a schema 1 pack. Anything outside the contract makes the whole file unusable. */
export function parseAnalyticsPack(raw: unknown): AnalyticsPack | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || raw.kind !== "jev-analytics") return null;
  if (!Number.isSafeInteger(raw.generatedAtMs) || (raw.generatedAtMs as number) <= 0) return null;
  if (hasForbiddenKey(raw)) return null;
  if (!isRecord(raw.instruments)) return null;
  const entries = Object.entries(raw.instruments);
  if (entries.length > MAX_INSTRUMENTS) return null;
  const instruments: Record<string, { instId: string; features: Record<string, unknown> | null }> = {};
  for (const [key, value] of entries) {
    if (!INST_ID.test(key) || !isRecord(value) || value.instId !== key) return null;
    instruments[key] = { instId: key, features: isRecord(value.features) ? value.features : null };
  }
  return { generatedAtMs: raw.generatedAtMs as number, instruments };
}

/**
 * The analysis for one instrument at one instant, or null when the instrument is missing, the pack is older
 * than maxAgeMs, or its stamp is implausibly in the future. No section survives means no analysis at all.
 */
export function analysisFor(pack: AnalyticsPack, instId: string, nowMs: number, maxAgeMs = ANALYTICS_MAX_AGE_MS): TapeAnalysis | null {
  const instrument = pack.instruments[instId];
  if (instrument === undefined) return null;
  const age = nowMs - pack.generatedAtMs;
  if (age < -FUTURE_TOLERANCE_MS || age > maxAgeMs) return null;
  const ageSec = Math.max(0, Math.round(age / 1000));
  return projectAnalysis({ ...(instrument.features ?? {}), ageSec });
}

/**
 * Synchronous pack reader with a stat-keyed cache: the file is re-parsed only when its size or mtime changes.
 * Nothing it does can throw into the read loop: a missing, unreadable, malformed or oversized file is null.
 */
export class FileAnalyticsSource {
  private cached: { readonly mtimeMs: number; readonly size: number; readonly pack: AnalyticsPack | null } | null = null;

  constructor(private readonly path: string) {}

  private load(): AnalyticsPack | null {
    try {
      const stat = statSync(this.path);
      if (this.cached !== null && this.cached.mtimeMs === stat.mtimeMs && this.cached.size === stat.size) return this.cached.pack;
      let pack: AnalyticsPack | null = null;
      if (stat.size <= MAX_FILE_BYTES) {
        const raw: unknown = JSON.parse(readFileSync(this.path, "utf8"));
        pack = parseAnalyticsPack(raw);
      }
      this.cached = { mtimeMs: stat.mtimeMs, size: stat.size, pack };
      return pack;
    } catch {
      this.cached = null;
      return null;
    }
  }

  read(instId: string, nowMs: number): TapeAnalysis | null {
    const pack = this.load();
    return pack === null ? null : analysisFor(pack, instId, nowMs);
  }

  status(nowMs: number): { present: boolean; ageSec: number | null } {
    const pack = this.load();
    if (pack === null) return { present: false, ageSec: null };
    return { present: true, ageSec: Math.max(0, Math.round((nowMs - pack.generatedAtMs) / 1000)) };
  }
}
