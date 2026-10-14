/**
 * What the opportunity engine of the core says (`GET /inonu/opportunities`), read strictly, and the rows a person reads: for each liquid pair, three readings of its own daily history
 * (is it cheap against itself, does the fall seem to have stopped, is more money trading it than usual), each one a measurement written in words, with the geometry of its 30 day range
 * and the marks that give pause. Pure: no clock, no network, no storage.
 *
 * The page DESCRIBES. A reading "holds" when the measurement passes a limit the core fixed before it measured the limit on history; nothing here says buy, and the order of the list is how
 * far out of the ordinary each pair is for its own normal, not how much it is expected to return: the readings of the price history were measured on 13 months of 170 liquid pairs and none
 * beat the average firmly (MEASURED_LINE). What is worth doing is the Inonu's call, asked by the button that ranks the pairs the person ticks.
 */
import { fmtCompact, fmtNumber, fmtPctSigned, priceDecimalsForMagnitude, UNAVAILABLE } from "../desk/ui/format";
import { changeTone, type ChangeTone } from "../desk/ui/instrument-header";

export type ReadingId = "desconto" | "virada" | "participacao";

export const READING_ORDER: readonly ReadingId[] = ["desconto", "virada", "participacao"];

export const READING_LABEL: Readonly<Record<ReadingId, string>> = { desconto: "Desconto", virada: "Virada", participacao: "Participacao" };

/** What each reading asks, in one phrase, for the explanation line of the board. The numbers are the ones the core uses. */
export const READING_RULE: Readonly<Record<ReadingId, string>> = {
  desconto: "Desconto: na parte baixa da faixa de 30 dias e bem abaixo da maxima de 90 dias",
  virada: "Virada: sem minima nova nos ultimos 3 dias e acima da media de 5 dias",
  participacao: "Participacao: volume de 24 h acima da media dos 7 dias anteriores",
};

/** What the backtest of the core found, in the words the board shows (scripts/opportunity-backtest.ts, evidence RAS-7). Update it only with a new measurement. */
export const MEASURED_LINE =
  "Medido em 170 pares liquidos da OKX, de ago/2025 a out/2026, com os limites fixados antes: nenhuma leitura do historico de precos teve vantagem firme sobre a media dos pares em 7 dias, nem um modelo treinado so no passado (AUC 0,52, e 0,50 e uma moeda). O desconto ficou abaixo da media na confirmacao (menos 0,5%). A ordem mostra o que esta fora do normal, nao o que vai subir.";

export interface EngineRead {
  readonly price: number;
  readonly pos30: number;
  readonly drawdown90: number;
  readonly rsi14: number | null;
  readonly roomToHigh30: number;
  readonly gapToLow30: number;
  readonly roomRatio: number | null;
  readonly volRatio: number | null;
  readonly noNewLow: boolean;
  readonly aboveSma5: boolean;
  readonly atrPct: number | null;
  readonly meanVol30: number;
  readonly held: Readonly<Record<ReadingId, boolean>>;
  readonly count: number;
}

export interface EnginePair {
  readonly instId: string;
  readonly base: string;
  readonly price: number;
  readonly change24h: number | null;
  readonly volQuote24h: number;
  readonly spreadBps: number;
  /** How far out of the ordinary the pair is for its own normal, 0 to 2 (the order of the board). */
  readonly attention: number;
  /** The 24 hour move in units of the usual daily range, signed; null without a range. */
  readonly moveAtr: number | null;
  readonly read: EngineRead;
}

export interface EngineBoard {
  readonly asOfMs: number;
  readonly universe: { readonly listed: number; readonly liquid: number; readonly read: number; readonly failed: number };
  readonly pairs: readonly EnginePair[];
}

export type EngineState =
  | { readonly state: "idle" }
  | { readonly state: "lendo"; readonly done: number; readonly of: number; readonly board: EngineBoard | null }
  | { readonly state: "pronto"; readonly board: EngineBoard }
  | { readonly state: "erro"; readonly code: string; readonly board: EngineBoard | null };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): boolean => v === null || isNum(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

function parseRead(raw: unknown): EngineRead | null {
  if (!isRec(raw) || !isRec(raw.held)) return null;
  const nums = ["price", "pos30", "drawdown90", "roomToHigh30", "gapToLow30", "meanVol30", "count"] as const;
  for (const k of nums) if (!isNum(raw[k])) return null;
  for (const k of ["rsi14", "roomRatio", "volRatio", "atrPct"] as const) if (!numOrNull(raw[k])) return null;
  if (!isBool(raw.noNewLow) || !isBool(raw.aboveSma5)) return null;
  for (const id of READING_ORDER) if (!isBool(raw.held[id])) return null;
  if ((raw.price as number) <= 0 || (raw.count as number) < 0 || (raw.count as number) > 3) return null;
  return raw as unknown as EngineRead;
}

function parsePair(raw: unknown): EnginePair | null {
  if (!isRec(raw)) return null;
  if (typeof raw.instId !== "string" || !/^[A-Z0-9]{1,20}-USDT$/.test(raw.instId) || typeof raw.base !== "string") return null;
  if (!isNum(raw.price) || raw.price <= 0 || !numOrNull(raw.change24h) || !isNum(raw.volQuote24h) || !isNum(raw.spreadBps)) return null;
  if (!isNum(raw.attention) || raw.attention < 0 || raw.attention > 2 || !numOrNull(raw.moveAtr)) return null;
  const read = parseRead(raw.read);
  return read === null ? null : ({ ...raw, read } as unknown as EnginePair);
}

function parseBoard(raw: unknown): EngineBoard | null {
  if (!isRec(raw) || !isNum(raw.asOfMs) || !isRec(raw.universe) || !Array.isArray(raw.pairs)) return null;
  const u = raw.universe;
  if (!isNum(u.listed) || !isNum(u.liquid) || !isNum(u.read) || !isNum(u.failed)) return null;
  // a pair that is not exactly the shape is left out, never repaired: the rest of the board is still true
  const pairs = raw.pairs.map(parsePair).filter((p): p is EnginePair => p !== null);
  return { asOfMs: raw.asOfMs, universe: { listed: u.listed, liquid: u.liquid, read: u.read, failed: u.failed }, pairs };
}

/** The answer of the core as the page keeps it, or null when it is not the contract (the page then says the engine did not answer). */
export function parseEngineState(body: unknown): EngineState | null {
  if (!isRec(body) || body.ok !== true || body.execution !== "never") return null;
  const board = body.board === null || body.board === undefined ? null : parseBoard(body.board);
  if (body.board !== null && body.board !== undefined && board === null) return null;
  switch (body.state) {
    case "idle":
      return { state: "idle" };
    case "lendo":
      return isNum(body.done) && isNum(body.of) ? { state: "lendo", done: body.done, of: body.of, board } : null;
    case "pronto":
      return board === null ? null : { state: "pronto", board };
    case "erro":
      return typeof body.code === "string" && /^[a-z_]{1,24}$/.test(body.code) ? { state: "erro", code: body.code, board } : null;
    default:
      return null;
  }
}

export interface EngineReading {
  readonly id: ReadingId;
  readonly label: string;
  readonly on: boolean;
  /** The measurement in a sentence: written for both the reading that holds and the one that does not, so a pill that is off says why. */
  readonly text: string;
}

export interface EngineRow {
  readonly instId: string;
  readonly symbol: string;
  readonly price: string;
  readonly change: { readonly text: string; readonly tone: ChangeTone };
  readonly volume: string;
  readonly spread: string;
  /** What is out of the ordinary: the move of 24 hours in units of the pair's own daily range, and the volume against its 7 day mean. */
  readonly unusual: { readonly move: string; readonly volume: string; readonly level: number };
  readonly readings: readonly EngineReading[];
  readonly count: number;
  readonly marks: readonly string[];
}

const pct = (fraction: number, digits = 0): string => `${fmtNumber(fraction * 100, digits)}%`;

/** The limits of the marks of care (also the page's own choice, written here). */
export const ENGINE_CARE = { atrPct: 0.08, spreadBps: 8, fall24h: -0.1 } as const;

export function readingsOf(r: EngineRead): EngineReading[] {
  const rsi = r.rsi14 === null ? "" : `, RSI ${fmtNumber(r.rsi14, 0)}`;
  return [
    {
      id: "desconto",
      label: READING_LABEL.desconto,
      on: r.held.desconto,
      text: `no ${pct(r.pos30)} da faixa de 30 dias (0% e a minima) e ${pct(r.drawdown90)} abaixo da maxima de 90 dias${rsi}`,
    },
    {
      id: "virada",
      label: READING_LABEL.virada,
      on: r.held.virada,
      text: `${r.noNewLow ? "sem minima nova nos ultimos 3 dias" : "fez minima nova nos ultimos 3 dias"} e ${r.aboveSma5 ? "acima" : "abaixo"} da media de 5 dias`,
    },
    {
      id: "participacao",
      label: READING_LABEL.participacao,
      on: r.held.participacao,
      text: r.volRatio === null ? "sem media de volume para comparar" : `volume de 24 h em ${fmtNumber(r.volRatio, 1)}x a media dos 7 dias anteriores`,
    },
  ];
}

function marksOf(pair: EnginePair): string[] {
  const marks: string[] = [];
  const C = ENGINE_CARE;
  if (pair.read.atrPct !== null && pair.read.atrPct >= C.atrPct) marks.push(`oscila ${pct(pair.read.atrPct)} por dia em media`);
  if (pair.change24h !== null && pair.change24h <= C.fall24h) marks.push(`caiu ${pct(-pair.change24h)} em 24 h`);
  if (pair.spreadBps >= C.spreadBps) marks.push(`spread de ${fmtNumber(pair.spreadBps, 1)} bps`);
  return marks;
}

const signedRatio = (v: number | null): string => (v === null ? "-" : `${v > 0 ? "+" : v < 0 ? "-" : ""}${fmtNumber(Math.abs(v), 1)}x`);

/**
 * The rows of the board: the pairs in the order the core gave (most out of the ordinary first), at most `max` (a tab of the dock holds twelve, INF-1), and how many pairs were read.
 * The core already put them in order; this only reads, so the order on the screen is the one that was measured.
 */
export function engineRows(board: EngineBoard | null, max = 12): { readonly rows: readonly EngineRow[]; readonly total: number } {
  if (board === null) return { rows: [], total: 0 };
  const rows = board.pairs.slice(0, Math.max(0, max)).map((p): EngineRow => {
    const decimals = priceDecimalsForMagnitude(p.price);
    return {
      instId: p.instId,
      symbol: p.base,
      price: fmtNumber(p.price, decimals),
      change: { text: p.change24h === null ? UNAVAILABLE : fmtPctSigned(p.change24h * 100), tone: changeTone(p.change24h === null ? null : p.change24h * 100) },
      volume: fmtCompact(p.volQuote24h),
      spread: `${fmtNumber(p.spreadBps, 1)} bps`,
      unusual: { move: signedRatio(p.moveAtr), volume: p.read.volRatio === null ? "-" : `${fmtNumber(p.read.volRatio, 1)}x`, level: Math.min(1, p.attention / 2) },
      readings: readingsOf(p.read),
      count: p.read.count,
      marks: marksOf(p),
    };
  });
  return { rows, total: board.pairs.length };
}
