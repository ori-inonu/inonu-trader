/**
 * What each cell of the Rastreador says (RAS-3, DAT-2). A value the exchange gave is formatted as the desk formats it; one it did
 * not give is a dash with the reason on the title, never a made up number; a measurement that is being read says so, one that is
 * old is marked old, and one that is outside the calculation window says that instead of pretending to be live. The pressure
 * shows the measured value with its sign and a descriptive word, never an instruction (FLX-10). Plain ASCII.
 */
import { fmtCompact, fmtNumber, fmtPctSigned, priceDecimalsForMagnitude } from "../desk/ui/format";
import type { PressureRead } from "./flow";
import { pressureLabel, type RastreadorRow } from "./model";
import type { PerformanceRead } from "./performance";

export interface Cell {
  readonly text: string;
  readonly tone: "up" | "down" | "none";
  readonly title?: string;
  /** The measurement behind the cell is older than three minutes. */
  readonly stale?: boolean;
}

export type CellId = "rank" | "ativo" | "preco" | "var24h" | "vol" | "pressao" | "mercado" | "var1h" | "var4h" | "janela" | "negocios";
export type Cells = Readonly<Record<CellId, Cell>>;

export interface CellContext {
  /** The rows inside the calculation window: only they are measured. */
  readonly windowIds: ReadonlySet<string>;
  readonly pressure: ReadonlyMap<string, PressureRead | "lendo">;
  readonly performance: ReadonlyMap<string, PerformanceRead | "lendo">;
  readonly nowMs: number;
}

export const STALE_MS = 180_000;
/** Fewer trades than this in the last minute are said to be few. */
const FEW_TRADES = 5;

const NONE: Cell = { text: "-", tone: "none" };
const toneOf = (v: number): Cell["tone"] => (Math.abs(v) < 0.005 ? "none" : v > 0 ? "up" : "down");
/** The pressure is coloured by its band, so a balanced reading carries no colour. */
const pressureTone = (v: number): Cell["tone"] => (v >= 0.1 ? "up" : v <= -0.1 ? "down" : "none");

const PRESSURE_ERROR: Readonly<Record<string, string>> = {
  alvo_invalido: "Instrumento invalido",
  sem_conexao: "Sem conexao com a OKX",
  okx_recusou: "A OKX recusou a leitura",
  resposta_invalida: "A OKX respondeu algo inesperado",
};

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `ha ${s} s` : `ha ${Math.round(s / 60)} min`;
}

function signed(v: number): string {
  const rounded = Math.round(v * 100) / 100;
  return `${rounded >= 0 ? "+" : "-"}${Math.abs(rounded).toFixed(2).replace(".", ",")}`;
}

function pressureCell(row: RastreadorRow, ctx: CellContext): { cell: Cell; janela: Cell; negocios: Cell } {
  const missing = (title: string, text = "-"): { cell: Cell; janela: Cell; negocios: Cell } => ({ cell: { text, tone: "none", title }, janela: NONE, negocios: NONE });
  if (!ctx.windowIds.has(row.id)) return missing("Fora da janela de calculo");
  const read = ctx.pressure.get(row.id);
  if (read === undefined || read === "lendo") return missing("Lendo os negocios do ultimo minuto", "lendo");
  if (!read.ok) return missing(PRESSURE_ERROR[read.reason] ?? "A leitura falhou");
  if (read.pressure === null) return missing("Sem negocios no ultimo minuto");
  const p = read.pressure;
  const age = ctx.nowMs - read.atMs;
  const stale = age > STALE_MS;
  const word = p.negocios < FEW_TRADES ? "Poucos negocios" : pressureLabel(p.valor);
  const seconds = Math.round(p.janelaMs / 1000);
  const title = `${p.negocios} negocios em ${seconds} s, ${ago(age)}${stale ? ", dado velho" : ""}`;
  return {
    cell: { text: `${signed(p.valor)} ${word}`, tone: pressureTone(p.valor), title, stale },
    janela: { text: `${seconds} s`, tone: "none" },
    negocios: { text: String(p.negocios), tone: "none" },
  };
}

function performanceCells(row: RastreadorRow, ctx: CellContext): { var1h: Cell; var4h: Cell } {
  const both = (cell: Cell) => ({ var1h: cell, var4h: cell });
  if (!ctx.windowIds.has(row.id)) return both({ text: "-", tone: "none", title: "Fora da janela de calculo" });
  const read = ctx.performance.get(row.id);
  if (read === undefined || read === "lendo") return both({ text: "lendo", tone: "none", title: "Lendo as velas de 1 minuto" });
  if (!read.ok) return both({ text: "-", tone: "none", title: read.reason === "alvo_invalido" ? "Instrumento invalido" : "A OKX nao devolveu as velas" });
  const one = (v: number | null): Cell => (v === null ? { text: "-", tone: "none", title: "Velas insuficientes para esta janela" } : { text: fmtPctSigned(v), tone: toneOf(v), title: ago(ctx.nowMs - read.atMs) });
  return { var1h: one(read.var1h), var4h: one(read.var4h) };
}

export function cellsFor(row: RastreadorRow, ctx: CellContext): Cells {
  const pressure = pressureCell(row, ctx);
  const performance = performanceCells(row, ctx);
  return {
    rank: row.rank === null ? { text: "-", tone: "none", title: "Sem volume conhecido, sem posicao" } : { text: String(row.rank), tone: "none" },
    ativo: { text: row.base, tone: "none", title: row.id },
    preco: row.preco === null ? NONE : { text: fmtNumber(row.preco, priceDecimalsForMagnitude(row.preco)), tone: "none" },
    var24h: row.var24hPct === null ? { text: "-", tone: "none", title: "A OKX nao informou a abertura de 24 horas" } : { text: fmtPctSigned(row.var24hPct), tone: toneOf(row.var24hPct) },
    vol:
      row.volUsd24h === null
        ? { text: "-", tone: "none", title: row.mercado === "perp" ? "Sem o tamanho do contrato, o volume em USD nao e conhecido" : "A OKX nao informou o volume" }
        : { text: `${row.volAprox ? "~" : ""}${fmtCompact(row.volUsd24h)}`, tone: "none", ...(row.volAprox ? { title: "Aproximado: contratos vezes o tamanho do contrato vezes o ultimo preco" } : {}) },
    pressao: pressure.cell,
    mercado: { text: row.mercado === "spot" ? "Spot" : "Perpetuo", tone: "none" },
    var1h: performance.var1h,
    var4h: performance.var4h,
    janela: pressure.janela,
    negocios: pressure.negocios,
  };
}
