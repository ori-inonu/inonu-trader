/**
 * FeatureVector v1 (INT-0.4, REC-1, REC-4, REC-5): the numbers about one instrument at one moment that the recorder writes, the
 * labeler later joins to an outcome and the local learner trains on. Everything is a finite number or `null` with a reason; an
 * unknown is never a zero. Pure: no clock, no network, no disk; the moment arrives as `asOfMs`.
 *
 * No look-ahead: only bars that were CLOSED at `asOfMs` (confirmed and `ts + interval <= asOfMs`) can reach a value. A property
 * test adds future and unconfirmed bars and expects the same vector.
 */
export const FEATURE_VERSION = 1;

export const INTERVALS = ["5m", "15m", "1h", "4h"] as const;
export type Interval = (typeof INTERVALS)[number];
export const INTERVAL_MS: Readonly<Record<Interval, number>> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };

export interface Bar {
  /** Open time of the bar, in milliseconds. */
  readonly ts: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly confirmed: boolean;
}

/** What the flow engine measured, reduced to numbers. `warm` is false while the adaptive thresholds are still being learned. */
export interface FlowInput {
  readonly warm: boolean;
  /** Bought minus sold over everything traded in the window, from -1 to 1. */
  readonly deltaRatio: number | null;
  readonly imb: { readonly c: number; readonly v: number } | null;
  readonly seqCount: number | null;
  readonly prgCount: number | null;
  readonly exhCount: number | null;
  readonly absorption: { readonly side: "c" | "v"; readonly volumeRatio: number } | null;
  readonly poc: number | null;
  readonly val: number | null;
  readonly vah: number | null;
  /** The zones worth looking at (active or tested), any order. */
  readonly zones: readonly { readonly lado: "demanda" | "oferta" | "neutra"; readonly baixo: number; readonly alto: number; readonly nota: number; readonly estado: string; readonly families: number }[];
  /** Age of the last trade the engine used, in milliseconds. */
  readonly ageMs: number | null;
}

export interface FeatureInput {
  readonly instId: string;
  readonly asOfMs: number;
  /** The last price at `asOfMs`. */
  readonly price: number;
  readonly bars: Partial<Record<Interval, readonly Bar[]>>;
  /** 15 minute bars of BTC-USDT for the cross-asset block; null or absent for BTC itself or when not read. */
  readonly btc15m?: readonly Bar[] | null;
  readonly spreadBps: number | null;
  /** Round-trip taker fees and slippage in bps (from the lab cost table); the spread is added here. */
  readonly feeAndSlippageRoundTripBps: number;
  /** Funding in bps and the hour change of open interest (the `Regime` of the Brief); null for spot. */
  readonly regime?: { readonly funding: number | null; readonly oiVar: number | null } | null;
  readonly flow?: FlowInput | null;
}

export interface FeatureVector {
  readonly v: typeof FEATURE_VERSION;
  readonly instId: string;
  readonly asOfMs: number;
  /** Every name of FEATURE_NAMES, in that order. */
  readonly values: Readonly<Record<string, number | null>>;
  /** Why a value is null (constant codes). */
  readonly nulos: Readonly<Record<string, string>>;
  /** Milliseconds since the last closed bar of each interval, and of the flow. */
  readonly idades: Readonly<Record<string, number>>;
}

const SMC_FIELDS = ["demandBps", "supplyBps", "gapsUp", "gapsDown", "gapNearestBps", "rangePos", "breakDir", "breakChoch", "breakAge", "poolAboveBps", "poolBelowBps", "sweepKind", "sweepAge"] as const;
export const SMC_FIELD_NAMES = SMC_FIELDS;

/** The fixed, ordered list of the features. Adding or renaming one is a new version. */
export const FEATURE_NAMES: readonly string[] = [
  "trend.regime15m", "trend.adx15m", "trend.eff15m", "trend.ema15m", "trend.ema1h", "trend.ema4h", "trend.extAtr15m",
  "mom.rsi5m", "mom.rsi15m", "mom.rsi1h", "mom.macdAtr15m",
  "vol.atrBps15m", "vol.atrBps1h", "vol.rank24h", "vol.bbWidthRank15m", "vol.bbPctB15m",
  "str.donchianPos1h",
  ...SMC_FIELDS.map((f) => `smc15.${f}`),
  ...SMC_FIELDS.map((f) => `smc1h.${f}`),
  "drv.fundingBps", "drv.oiVar1hPct",
  "x.corrBtc48h", "x.betaBtc48h", "x.relStr24hBps",
  "cost.spreadBps", "cost.roundTripBps", "cost.moveToCost1h",
  "flow.warm", "flow.deltaRatio", "flow.imbC", "flow.imbV", "flow.seqN", "flow.prgN", "flow.exhN", "flow.absorbSide", "flow.absorbRatio", "flow.pocBps", "flow.valBps", "flow.vahBps",
  "zone.demandBps", "zone.demandNota", "zone.demandTested", "zone.demandFamilies",
  "zone.supplyBps", "zone.supplyNota", "zone.supplyTested", "zone.supplyFamilies", "zone.count",
];
