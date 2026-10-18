/**
 * The raw market read for a person who has to decide (MKT): the tape, the book and the liquidity are what the machine looks at; what a person needs from them is four things, and
 * this file measures exactly those. (1) What it COSTS to move an amount through the book right now, on each side and for the round trip, for three amounts. (2) How thick the market
 * is, in one word. (3) Where the big queues of resting orders wait near the price. (4) Whether the cost the Inonu counted in its plan holds against the book.
 *
 * Measurements only: this file never says what to do. The numbers are from the book the page already holds (no call, no model), and a figure the known book cannot support is null,
 * never an extrapolation. The details (tape, book, liquidity) stay one click away for whoever wants them.
 */
import type { DeskBook, DeskBookLevel } from "./types";

/** The amounts every reading is made for, in dollars of the quote currency. */
export const REFERENCE_SIZES_USD: readonly number[] = [100, 1000, 10_000];
/** The amount whose round trip names the thickness of the market. */
const THICKNESS_SIZE_USD = 1000;
/** A round trip under this many basis points is a fluid market; over THIN_BPS, a thin one. */
const FLUID_BPS = 10;
const THIN_BPS = 30;
/** A book older than this is not read. */
const MAX_BOOK_AGE_MS = 15_000;
/** How near to the price a queue has to be to count, and how far above the typical level it has to stand. */
const WALL_WINDOW_BPS = 100;
const WALL_RATIO = 3;
const WALL_MIN_LEVELS = 3;

export interface BookCost {
  readonly sizeUsd: number;
  /** How much above the middle price the average price paid sits, in basis points, when taking the asks; null when the known book does not hold the amount. */
  readonly buyBps: number | null;
  /** How much below the middle the average price received sits, when hitting the bids. */
  readonly sellBps: number | null;
  readonly roundTripBps: number | null;
}

const NONE = (sizeUsd: number): BookCost => ({ sizeUsd, buyBps: null, sellBps: null, roundTripBps: null });

/** The average price of taking `sizeUsd` from one side of the book, or null when the known levels do not hold it. */
function average(levels: readonly DeskBookLevel[], sizeUsd: number, multiplier: number): number | null {
  let usd = 0;
  let quantity = 0;
  for (const level of levels) {
    if (!(level.px > 0) || !(level.sz > 0)) continue;
    const available = level.px * level.sz * multiplier;
    const take = Math.min(available, sizeUsd - usd);
    usd += take;
    quantity += take / (level.px * multiplier);
    if (usd >= sizeUsd - 1e-9) return usd / multiplier / quantity;
  }
  return null;
}

export function bookCost(book: DeskBook, sizeUsd: number, quoteMultiplier = 1): BookCost {
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) return NONE(sizeUsd);
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (bid === undefined || ask === undefined || !(ask.px > bid.px)) return NONE(sizeUsd);
  const mid = (bid.px + ask.px) / 2;
  const buyAvg = average(book.asks, sizeUsd, quoteMultiplier);
  const sellAvg = average(book.bids, sizeUsd, quoteMultiplier);
  const buyBps = buyAvg === null ? null : ((buyAvg - mid) / mid) * 1e4;
  const sellBps = sellAvg === null ? null : ((mid - sellAvg) / mid) * 1e4;
  return { sizeUsd, buyBps, sellBps, roundTripBps: buyBps === null || sellBps === null ? null : buyBps + sellBps };
}

/* ---------- the words ---------- */

const PCT = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GROUPED = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const PRICE = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });

/** A cost in basis points as a percentage; one that is real but under a hundredth of a percent is "menos de 0,01%", never "0,00%". */
export function bpsText(bps: number | null): string {
  if (bps === null || !Number.isFinite(bps)) return "-";
  if (bps !== 0 && Math.abs(bps) < 0.5) return "menos de 0,01%";
  return `${PCT.format(bps / 100)}%`;
}

/** What a cost in basis points is in dollars for an amount; under one cent it is said as such, never as zero. */
export function costUsdText(sizeUsd: number, bps: number | null): string {
  if (bps === null || !Number.isFinite(bps) || !Number.isFinite(sizeUsd)) return "-";
  const usd = (sizeUsd * bps) / 1e4;
  if (usd !== 0 && Math.abs(usd) < 0.005) return "menos de US$ 0,01";
  return `US$ ${PCT.format(usd)}`;
}

/** An amount of dollars as a short phrase: whole up to a thousand, then "mil", "milhao" and "milhoes". */
export function usdShort(usd: number): string {
  if (usd >= 1_000_000) {
    const m = usd / 1_000_000;
    return `US$ ${ONE_DECIMAL.format(m)} ${m >= 2 ? "milhoes" : "milhao"}`;
  }
  if (usd >= 100_000) return `US$ ${GROUPED.format(Math.round(usd / 1000))} mil`;
  return `US$ ${GROUPED.format(usd)}`;
}

/* ---------- the reading ---------- */

export type Thickness = "fluido" | "normal" | "raso";

export interface Wall {
  readonly side: "compradores" | "vendedores";
  readonly px: number;
  readonly valueUsd: number;
  readonly distanceBps: number;
  readonly text: string;
}

export interface PlanCost {
  readonly assumedBps: number;
  readonly measuredBps: number;
  readonly sizeUsd: number;
  readonly kind: "menor" | "parecido" | "maior";
  readonly text: string;
}

export type MarketRead =
  | { readonly state: "sem_leitura"; readonly reason: string }
  | {
      readonly state: "ok";
      readonly rows: readonly BookCost[];
      readonly thickness: Thickness;
      readonly thicknessText: string;
      readonly walls: readonly Wall[];
      readonly vsPlan: PlanCost | null;
      readonly note: string;
    };

export interface MarketReadInput {
  readonly book: DeskBook | null;
  /** What one unit of book size is worth in the quote currency: 1 for spot, null when unknown (a swap, whose size is in contracts). */
  readonly quoteMultiplier: number | null;
  /** The clock the book's timestamp is counted against (the exchange's). */
  readonly nowMs: number;
  /** The connection to the exchange is behind. */
  readonly stale: boolean;
  /** What the last answer of the Inonu counted for this instrument, when it left a plan. */
  readonly plan: { readonly custoBps: number; readonly notionalUsd: number | null } | null;
}

function wallOf(side: "compradores" | "vendedores", levels: readonly DeskBookLevel[], mid: number, multiplier: number): Wall | null {
  const near = levels.filter((l) => l.px > 0 && l.sz > 0 && (Math.abs(l.px - mid) / mid) * 1e4 <= WALL_WINDOW_BPS);
  if (near.length < WALL_MIN_LEVELS) return null;
  const values = near.map((l) => l.px * l.sz * multiplier);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  const biggest = near[best]!;
  if (!(median > 0) || values[best]! < WALL_RATIO * median) return null;
  const distanceBps = (Math.abs(biggest.px - mid) / mid) * 1e4;
  const where = side === "compradores" ? "abaixo" : "acima";
  return {
    side,
    px: biggest.px,
    valueUsd: values[best]!,
    distanceBps,
    text: `Maior fila de ${side}: ${usdShort(values[best]!)} a ${PCT.format(distanceBps / 100)}% ${where} do preco (${PRICE.format(biggest.px)}).`,
  };
}

const NOTE = "Custo medido no livro de ofertas agora, sem taxas: o que uma ordem a mercado desse tamanho paga a mais, ou recebe a menos, que o preco do meio.";

export function marketRead(input: MarketReadInput): MarketRead {
  const { book, quoteMultiplier, nowMs } = input;
  if (book === null) return { state: "sem_leitura", reason: "O livro ainda nao chegou." };
  if (quoteMultiplier === null) return { state: "sem_leitura", reason: "Neste contrato o tamanho vem em contratos: o custo em dolares ainda nao e lido aqui." };
  if (input.stale) return { state: "sem_leitura", reason: "A conexao com a exchange esta atrasada: sem leitura atual." };
  const age = nowMs - book.tsMs;
  if (Number.isFinite(age) && age > MAX_BOOK_AGE_MS) return { state: "sem_leitura", reason: `O livro e antigo (ha ${Math.round(age / 1000)} s): sem leitura atual.` };
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (bid === undefined || ask === undefined || !(ask.px > bid.px)) return { state: "sem_leitura", reason: "O livro nao tem os dois lados: sem leitura." };
  const mid = (bid.px + ask.px) / 2;

  const rows = REFERENCE_SIZES_USD.map((size) => bookCost(book, size, quoteMultiplier));
  const reference = bookCost(book, THICKNESS_SIZE_USD, quoteMultiplier).roundTripBps;
  const thickness: Thickness = reference === null || reference >= THIN_BPS ? "raso" : reference < FLUID_BPS ? "fluido" : "normal";
  const thicknessText =
    reference === null
      ? `Mercado raso: o livro conhecido nao cobre ${usdShort(THICKNESS_SIZE_USD)}.`
      : `Mercado ${thickness}: ir e voltar com ${usdShort(THICKNESS_SIZE_USD)} custa ${costUsdText(THICKNESS_SIZE_USD, reference)} (${bpsText(reference)}).`;

  const walls = [wallOf("compradores", book.bids, mid, quoteMultiplier), wallOf("vendedores", book.asks, mid, quoteMultiplier)].filter((w): w is Wall => w !== null);

  let vsPlan: PlanCost | null = null;
  if (input.plan !== null && input.plan.notionalUsd !== null && input.plan.notionalUsd > 0) {
    const measured = bookCost(book, input.plan.notionalUsd, quoteMultiplier).roundTripBps;
    if (measured !== null) {
      const assumed = input.plan.custoBps;
      const band = Math.max(1, assumed * 0.1);
      const kind: PlanCost["kind"] = measured > assumed + band ? "maior" : measured < assumed - band ? "menor" : "parecido";
      const size = usdShort(input.plan.notionalUsd);
      const text =
        kind === "menor"
          ? `O plano do Inonu conta ${bpsText(assumed)} de custo no total (taxas, folga e spread). So o livro, agora, custa ${bpsText(measured)} para ${size}: o resto sao taxas e folga.`
          : kind === "maior"
            ? `O livro, agora, custa ${bpsText(measured)} para ${size}, mais que os ${bpsText(assumed)} que o plano conta no total: o ganho liquido do plano seria menor.`
            : `O livro, agora, custa ${bpsText(measured)} para ${size}, quase todo o custo de ${bpsText(assumed)} que o plano conta.`;
      vsPlan = { assumedBps: assumed, measuredBps: measured, sizeUsd: input.plan.notionalUsd, kind, text };
    }
  }

  return { state: "ok", rows, thickness, thicknessText, walls, vsPlan, note: NOTE };
}
