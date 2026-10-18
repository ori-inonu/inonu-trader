/** Offline 15m capture boundary. Positions are stated values, never wallet evidence. */
import { auditCandles, type CandleGrade } from "../quant/candles";
import { analyzePortfolio, concentration, type PortfolioAnalysis, type PositionInput } from "../quant/portfolio";
import { logReturnsOf } from "../quant/stats";
import type { Candle } from "../quant/types";

const CAPTURE_BAR_MS = 900_000;
export type CaptureExclusion = "missing_capture" | "unreadable_capture" | "invalid_capture" | "identity_mismatch" | "interval_mismatch" | "insufficient_candles";
export interface CaptureInput { readonly key: string; readonly value: unknown; readonly readError?: boolean }
export interface CaptureReceipt {
  readonly key: string;
  readonly status: "eligible" | "excluded";
  readonly reason: CaptureExclusion | null;
  readonly capturedAtMs: number | null;
  readonly usableBars: number;
  readonly grade: CandleGrade | null;
  /** Freshness at capture time; this does not establish freshness now. */
  readonly freshAtCapture: boolean | null;
}
export interface CapturedPortfolioReport {
  readonly analysis: PortfolioAnalysis;
  readonly captures: readonly CaptureReceipt[];
  readonly alignment: { readonly barMs: number; readonly commonBars: number; readonly startMs: number | null; readonly endMs: number | null };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function candle(value: unknown): value is Candle {
  return object(value) && typeof value.startMs === "number" && Number.isSafeInteger(value.startMs) && value.startMs >= 0
    && [value.open, value.high, value.low, value.close].every(v => typeof v === "number")
    && (value.volume === null || typeof value.volume === "number") && typeof value.confirmed === "boolean";
}

export function analyzeCapturedPortfolio(input: {
  readonly positions: readonly PositionInput[];
  readonly captures: readonly CaptureInput[];
  readonly horizonBars?: number;
}): CapturedPortfolioReport {
  const receipts: CaptureReceipt[] = [];
  const series = new Map<string, readonly Candle[]>();
  // The concentration contract handles duplicate, invalid, unknown and zero values.
  const valued = concentration(input.positions).weights.filter(p => p.weight > 0);
  for (const { key } of valued) {
    const captures = input.captures.filter(c => c.key === key);
    const entry = captures[0];
    let reason: CaptureExclusion | null = null;
    let capturedAtMs: number | null = null;
    let bars: readonly Candle[] = [];
    let grade: CandleGrade | null = null;
    let freshAtCapture: boolean | null = null;
    if (captures.length > 1) reason = "invalid_capture";
    else if (!entry) reason = "missing_capture";
    else if (entry.readError) reason = "unreadable_capture";
    else if (!object(entry.value)) reason = "invalid_capture";
    else {
      const capture = entry.value;
      if (!/^[A-Z0-9]{2,12}$/.test(key) || capture.instId !== `${key}-USDT-SWAP`) reason = "identity_mismatch";
      else if (capture.barMs !== CAPTURE_BAR_MS) reason = "interval_mismatch";
      else if (typeof capture.capturedAtMs !== "number" || !Number.isSafeInteger(capture.capturedAtMs) || capture.capturedAtMs < 0
        || !Array.isArray(capture.candles) || !capture.candles.every(candle)) reason = "invalid_capture";
      else {
        capturedAtMs = capture.capturedAtMs;
        const audit = auditCandles(capture.candles, CAPTURE_BAR_MS, capturedAtMs);
        bars = audit.usable; grade = audit.grade; freshAtCapture = audit.fresh;
        if (bars.length < 31) reason = "insufficient_candles";
      }
    }
    if (reason === null) series.set(key, bars);
    receipts.push({ key, status: reason === null ? "eligible" : "excluded", reason, capturedAtMs, usableBars: bars.length, grade, freshAtCapture });
  }
  let grid: number[] | undefined;
  for (const bars of series.values()) {
    const starts = new Set(bars.map(c => c.startMs));
    grid = grid === undefined ? [...starts] : grid.filter(t => starts.has(t));
  }
  const common = (grid ?? []).sort((a, b) => a - b);
  const returns = [...series].map(([key, bars]) => {
    const byStart = new Map(bars.map(c => [c.startMs, c.close]));
    return { key, returns: logReturnsOf(common.map(t => byStart.get(t)!)) };
  });
  const analysis = analyzePortfolio({ positions: input.positions, returns, barMs: CAPTURE_BAR_MS,
    ...(input.horizonBars === undefined ? {} : { horizonBars: input.horizonBars }) });
  return { analysis, captures: receipts, alignment: { barMs: CAPTURE_BAR_MS, commonBars: common.length, startMs: common[0] ?? null, endMs: common.at(-1) ?? null } };
}
