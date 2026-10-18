/**
 * The model of the opportunity radar of the Inonu tab: where to look first among the pairs of the exchange, ordered by something
 * that was MEASURED (24h volume, 24h change), never by a forecast. It is the candidate list that "Pedir ao Inonu" can rank: the code
 * says what moved and how much traded, the model alone says buy, hold or sell, and nothing here is a recommendation or a promise of
 * profit. Pure, so every lens and every edge is tested without a browser.
 *
 * Two rules keep the list honest. A pair needs real liquidity (a rise of 55% in a pair that traded forty thousand dollars is noise,
 * not an opportunity), and a pair between two stable coins is not offered at all. A value that is not known excludes the pair
 * from the lenses that need it; it is never filled in.
 */
import type { AssetCatalogRow } from "../useAssetCatalog";
import { fmtCompact, fmtNumber, fmtPctSigned, priceDecimalsForMagnitude, baseSymbol } from "./format";
import { changeTone, type ChangeTone } from "./instrument-header";

export type RadarLens = "volume" | "altas" | "quedas";

export interface RadarLensDef {
  readonly id: RadarLens;
  readonly label: string;
  /** What the lens measures, in one phrase. */
  readonly hint: string;
}

export const RADAR_LENSES: readonly RadarLensDef[] = [
  { id: "volume", label: "Mais negociados", hint: "Pares com maior volume em 24 h" },
  { id: "altas", label: "Maiores altas", hint: "Pares que mais subiram em 24 h" },
  { id: "quedas", label: "Maiores quedas", hint: "Pares que mais cairam em 24 h" },
];

/** The most cards at once; the documented budget of a tab of the dock is twelve (INF-1), and eight fit a wide desk in one strip. */
export const RADAR_ROWS_MAX = 8;

/** The 24h volume, in the quote currency, below which a pair is not offered: under it a large percentage says nothing. */
export const RADAR_MIN_QUOTE_VOLUME = 1_000_000;

/** Bases that are a dollar, or close to one: a pair of one against USDT is not an opportunity, only a price. */
export const STABLE_BASES: ReadonlySet<string> = new Set(["USDC", "DAI", "TUSD", "FDUSD", "USDE", "PYUSD", "USDG", "USDD", "BUSD", "USDP", "EURT", "EUR"]);

export interface RadarRow {
  /** Position in the lens, from 1. */
  readonly rank: number;
  readonly instId: string;
  readonly symbol: string;
  readonly price: string;
  readonly change: { readonly text: string; readonly tone: ChangeTone };
  /** 24h quote volume, compact ("530 mi"). */
  readonly volume: string;
  /** Volume against the largest on the list, 0 to 1, for the bar. */
  readonly volRatio: number;
}

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** A pair the radar may show: a known positive price, a known change, enough volume, and not a pair between stable coins. */
export function radarEligible(row: AssetCatalogRow): boolean {
  if (!finite(row.last) || !(row.last > 0)) return false;
  if (!finite(row.change24hPct)) return false;
  if (!finite(row.volQuote24h) || row.volQuote24h < RADAR_MIN_QUOTE_VOLUME) return false;
  return !STABLE_BASES.has(baseSymbol(row.instId));
}

function ordered(rows: readonly AssetCatalogRow[], lens: RadarLens): AssetCatalogRow[] {
  const byName = (a: AssetCatalogRow, b: AssetCatalogRow) => a.instId.localeCompare(b.instId);
  const eligible = rows.filter(radarEligible);
  switch (lens) {
    case "volume":
      return eligible.sort((a, b) => b.volQuote24h! - a.volQuote24h! || byName(a, b));
    case "altas":
      return eligible.filter((r) => r.change24hPct! > 0).sort((a, b) => b.change24hPct! - a.change24hPct! || byName(a, b));
    case "quedas":
      return eligible.filter((r) => r.change24hPct! < 0).sort((a, b) => a.change24hPct! - b.change24hPct! || byName(a, b));
  }
}

/** The cards of one lens, best first, at most `max`. Empty when nothing passes: the screen says so, it does not fill the strip. */
export function radarRows(rows: readonly AssetCatalogRow[], lens: RadarLens, max: number = RADAR_ROWS_MAX): RadarRow[] {
  const top = ordered(rows, lens).slice(0, Math.max(0, max));
  const largest = top.reduce((m, r) => Math.max(m, r.volQuote24h!), 0);
  return top.map((r, i) => ({
    rank: i + 1,
    instId: r.instId,
    symbol: baseSymbol(r.instId),
    price: fmtNumber(r.last, priceDecimalsForMagnitude(r.last)),
    change: { text: fmtPctSigned(r.change24hPct), tone: changeTone(r.change24hPct) },
    volume: fmtCompact(r.volQuote24h),
    volRatio: largest > 0 ? Math.min(1, r.volQuote24h! / largest) : 0,
  }));
}
