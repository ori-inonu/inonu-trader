/**
 * The ladder of quotes of the order ticket (T9.5, WAL-5). A person gives ONE size in the coin they pay with; the ladder asks the gateway what a swap of
 * a few sizes around it would give: at most five, one after the other and never faster than the Trade API allows (one request per second on the trial).
 * Sizes are exact integers in the smallest unit of the coin, built with integers and never with a float. What a quote does not say is a dash with the
 * reason, a flag it left out is "not informed" and never "safe", and the numbers are what the provider says a swap WOULD do: nothing here signs, sends or
 * prepares anything to be signed.
 *
 * Pure but for the reader it is given: no clock of its own, no storage, no wallet.
 */
import { onchainErrorText } from "../mesa/onchain-rows";
import type { OnchainMeta } from "../onchain/client";
import type { Quote, QuoteError, QuoteParams, QuoteResult } from "./quote";

export type { Quote } from "./quote";

export const LADDER_MAX = 5;
/** The Trade API trial allows one request per second: a little more than that between two rungs. */
export const LADDER_GAP_MS = 1100;
/** A quote older than this is old (wallet.md asks for a quote of less than 30 s before anything is done with it). */
export const QUOTE_FRESH_MS = 30_000;

export interface LadderReader {
  read(params: QuoteParams, signal?: AbortSignal): Promise<QuoteResult>;
}

// ------------------------------------------------------------------------------------------------------------------ the size

const DECIMAL = /^\d+(?:[.,]\d+)?$/;

/**
 * "100,5" of a coin with 6 decimals is "100500000": exact, with the comma or the point, and refused (never rounded) when it has more digits than the coin,
 * is zero, signed, in exponent form or not a plain decimal.
 */
export function toMinorUnits(text: string, decimals: number): string | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const clean = text.trim();
  if (clean.length === 0 || clean.length > 40 || !DECIMAL.test(clean)) return null;
  const [whole, fraction = ""] = clean.replace(",", ".").split(".");
  if (fraction.length > decimals) return null;
  const minor = BigInt(`${whole}${fraction.padEnd(decimals, "0")}`);
  return minor > BigInt(0) ? minor.toString() : null;
}

interface Step {
  readonly label: string;
  readonly num: bigint;
  readonly den: bigint;
}

const STEP_SETS: Readonly<Record<1 | 3 | 5, readonly Step[]>> = {
  1: [{ label: "1x", num: BigInt(1), den: BigInt(1) }],
  3: [{ label: "0,5x", num: BigInt(1), den: BigInt(2) }, { label: "1x", num: BigInt(1), den: BigInt(1) }, { label: "2x", num: BigInt(2), den: BigInt(1) }],
  5: [{ label: "0,25x", num: BigInt(1), den: BigInt(4) }, { label: "0,5x", num: BigInt(1), den: BigInt(2) }, { label: "1x", num: BigInt(1), den: BigInt(1) }, { label: "2x", num: BigInt(2), den: BigInt(1) }, { label: "4x", num: BigInt(4), den: BigInt(1) }],
};

/** The sizes of the default ladder: half, the size and double. */
export const LADDER_STEPS: readonly { readonly label: string }[] = STEP_SETS[3];

export interface LadderAmount {
  readonly label: string;
  readonly amountMinor: string;
}

/** One, three or five rungs around the size, middle one exact; a rung that would be less than one unit is left out, never rounded to zero. */
export function ladderAmounts(sizeText: string, decimals: number, count = 3): LadderAmount[] {
  const base = toMinorUnits(sizeText, decimals);
  if (base === null) return [];
  const set = STEP_SETS[count <= 1 ? 1 : count <= 3 ? 3 : 5];
  const out: LadderAmount[] = [];
  for (const step of set) {
    const amount = (BigInt(base) * step.num) / step.den;
    if (amount > BigInt(0)) out.push({ label: step.label, amountMinor: amount.toString() });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------ reading

export type Rung =
  | { readonly label: string; readonly amountMinor: string; readonly state: "cotado"; readonly quote: Quote; readonly meta: OnchainMeta; readonly receivedAtMs?: number }
  | { readonly label: string; readonly amountMinor: string; readonly state: "erro"; readonly error: QuoteError }
  | { readonly label: string; readonly amountMinor: string; readonly state: "nao_pedido" }
  | { readonly label: string; readonly amountMinor: string; readonly state: "lendo" };

/** Only a failure of that one size (the provider has no route or no quote for it) lets the next rung be asked: anything else would fail the same way. */
const PER_RUNG: ReadonlySet<string> = new Set(["provider_error", "sem_cotacao"]);

export interface ReadOptions {
  readonly sleep?: (ms: number) => Promise<void>;
  readonly signal?: AbortSignal;
  /** The clock that stamps the moment each quote was read; the age on the screen grows from it. */
  readonly now?: () => number;
  /** The rest of the gap a cancelled ladder left, waited out before the first request of this one: two requests are never closer than the gap. */
  readonly initialDelayMs?: number;
  /** Called with the state of every rung before the first request and after each one: the ones not asked yet are "lendo". */
  readonly onProgress?: (rungs: readonly Rung[]) => void;
}

export async function readLadder(reader: LadderReader, base: Omit<QuoteParams, "amount">, amounts: readonly LadderAmount[], options: ReadOptions = {}): Promise<Rung[]> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  // a wait ends the moment the person cancels: Cancelar is not held up by the gap between two rungs
  const aborted = options.signal === undefined ? null : new Promise<void>((resolve) => (options.signal!.aborted ? resolve() : options.signal!.addEventListener("abort", () => resolve(), { once: true })));
  const wait = (ms: number): Promise<void> => (aborted === null ? sleep(ms) : Promise.race([sleep(ms), aborted]));
  const rungs: Rung[] = amounts.map((a) => ({ label: a.label, amountMinor: a.amountMinor, state: "lendo" as const }));
  options.onProgress?.([...rungs]);
  // never longer than the gap itself: a clock that stepped back must not hold the button for an hour
  if (options.initialDelayMs !== undefined && options.initialDelayMs > 0) await wait(Math.min(options.initialDelayMs, LADDER_GAP_MS));
  for (let i = 0; i < amounts.length; i += 1) {
    if (i > 0) await wait(LADDER_GAP_MS);
    if (options.signal?.aborted) break;
    const amount = amounts[i]!;
    let result: QuoteResult;
    try {
      result = await reader.read({ chainIndex: base.chainIndex, amount: amount.amountMinor, fromToken: base.fromToken, toToken: base.toToken }, options.signal);
    } catch {
      // a reader that throws is a failure of this rung, said as a constant: nothing it threw reaches the screen
      result = { ok: false, error: "network" };
    }
    // a request cancelled while it was in flight is a cancel, not a failure of the network
    if (options.signal?.aborted) break;
    if (result.ok) {
      rungs[i] = { label: amount.label, amountMinor: amount.amountMinor, state: "cotado", quote: result.data, meta: result.meta, receivedAtMs: now() };
      options.onProgress?.([...rungs]);
      continue;
    }
    rungs[i] = { label: amount.label, amountMinor: amount.amountMinor, state: "erro", error: result.error };
    options.onProgress?.([...rungs]);
    if (!PER_RUNG.has(result.error)) break;
  }
  // what was never asked is not being read either
  const done = rungs.map((r): Rung => (r.state === "lendo" ? { label: r.label, amountMinor: r.amountMinor, state: "nao_pedido" } : r));
  options.onProgress?.([...done]);
  return done;
}

// ------------------------------------------------------------------------------------------------------------------ the words

export type ImpactState = "dentro" | "fora" | "desconhecido";

/** The impact is (received - paid) / paid: a deviation either way beyond the limit the person set is outside it, and an unknown one is unknown. */
export function impactState(impactPct: number | null, limitPct: number): ImpactState {
  if (impactPct === null || !Number.isFinite(impactPct) || !Number.isFinite(limitPct) || limitPct <= 0) return "desconhecido";
  return Math.abs(impactPct) > limitPct ? "fora" : "dentro";
}

export interface RungText {
  readonly rotulo: string;
  /** How old the quote is, as the gateway says: a quote served from its cache is old. */
  readonly idade: string;
  readonly paga: string;
  readonly recebe: string;
  readonly impacto: string;
  readonly taxaRede: string;
  readonly taxaTroca: string;
  readonly estado: string;
  readonly tom: "ok" | "alerta" | "bloqueio" | "neutro";
}

const significant = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 6 });
const twoDecimals = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ageText = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `ha ${s} s` : `ha ${Math.round(s / 60)} min`;
};
const finiteOrDash = (v: number | null, format: (n: number) => string): string => (v === null || !Number.isFinite(v) ? "-" : format(v));

function coinText(amountMinor: number, side: Quote["toToken"]): string {
  const symbol = side.symbol ?? "token";
  if (side.decimals === null) {
    // above 2^53 a number has no exact digits: it is said to be approximate and given with six, not with digits it does not have
    if (!Number.isSafeInteger(Math.round(amountMinor))) return `aprox. ${significant.format(amountMinor)} unidades de ${symbol} (decimais nao informados)`;
    return `${BigInt(Math.round(amountMinor)).toString()} unidades de ${symbol} (decimais nao informados)`;
  }
  return `${significant.format(amountMinor / 10 ** side.decimals)} ${symbol}`;
}

const ERROR_TEXT: Readonly<Record<string, string>> = {
  provider_payment_required: "A Trade API recusou: a cota gratuita ou o periodo de teste acabou. A escada fica indisponivel e o sistema nao paga",
  provider_error: "A Trade API nao devolveu cotacao para este tamanho",
  sem_cotacao: "A Trade API nao tem cotacao para este tamanho",
};

export function errorText(error: QuoteError): string {
  return ERROR_TEXT[error] ?? onchainErrorText(error).text;
}

export function rungText(rung: Rung, options: { readonly impactLimitPct: number; /** The clock of the screen: the age of a quote grows with it. */ readonly nowMs?: number }): RungText {
  const none = { idade: "-", paga: "-", recebe: "-", impacto: "-", taxaRede: "-", taxaTroca: "-" };
  switch (rung.state) {
    case "lendo":
      return { rotulo: rung.label, ...none, estado: "lendo", tom: "neutro" };
    case "nao_pedido":
      return { rotulo: rung.label, ...none, estado: "nao pedida", tom: "neutro" };
    case "erro":
      return { rotulo: rung.label, ...none, estado: errorText(rung.error), tom: "alerta" };
    case "cotado": {
      const q = rung.quote;
      const impact = impactState(q.priceImpactPct, options.impactLimitPct);
      const taxes = [q.fromToken.taxRate, q.toToken.taxRate];
      const tax = taxes.filter((t): t is number => t !== null && t > 0).reduce((a, b) => Math.max(a, b), 0);
      const honey = [q.fromToken.isHoneyPot, q.toToken.isHoneyPot];
      // every problem is said, in order of weight; a honeypot blocks and says nothing else
      const problems: string[] = [];
      // the age is the one the gateway gave plus the time on the screen since the quote was read; after 30 s it is old, said by the clock and not only by the cache
      const clocks = rung.receivedAtMs !== undefined && options.nowMs !== undefined;
      const since = clocks ? (Number.isFinite(rung.receivedAtMs) && Number.isFinite(options.nowMs) ? Math.max(0, options.nowMs! - rung.receivedAtMs!) : Number.NaN) : 0;
      const age = rung.meta.ageMs + since;
      // an age that is not a number is not "fresh": it is unknown, and a quote of unknown age is an old one
      if (rung.meta.stale || !Number.isFinite(age) || age > QUOTE_FRESH_MS) problems.push("cotacao velha");
      if (honey.includes(null)) problems.push("honeypot nao informado");
      if (taxes.includes(null)) problems.push("taxa do token nao informada");
      if (tax > 0) problems.push(`taxa do token: ${significant.format(tax * 100)}%`);
      if (impact === "desconhecido") problems.push("impacto nao informado");
      else if (impact === "fora") problems.push("impacto fora do limite");
      const blocked = honey.includes(true);
      return {
        rotulo: rung.label,
        idade: Number.isFinite(age) ? ageText(age) : "-",
        paga: coinText(q.fromAmount, q.fromToken),
        recebe: coinText(q.toAmount, q.toToken),
        impacto: finiteOrDash(q.priceImpactPct, (n) => (Math.round(n * 100) === 0 ? "0,00%" : `${twoDecimals.format(n)}%`)),
        taxaRede: finiteOrDash(q.estimateGasFee, (n) => significant.format(n)),
        taxaTroca: finiteOrDash(q.tradeFee, (n) => significant.format(n)),
        estado: blocked ? "bloqueada: honeypot" : problems.length === 0 ? "dentro do limite" : problems.join("; "),
        tom: blocked ? "bloqueio" : problems.length === 0 ? "ok" : "alerta",
      };
    }
  }
}
