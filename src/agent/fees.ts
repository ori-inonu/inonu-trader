/**
 * The last network fee quoted on each network (docs/sdd/agente-autonomo/ADENDO-C, FEE-1). The cost of a transaction is a FACT the code measures from the quotes it already reads, with the hour it was read and where it
 * came from: it replaces the fixed dollar reserve of the native coin and is what the Jev is shown. A fee with no hour of reading does not exist, a quote that carries no fee measures nothing, and nothing here is guessed.
 * The age of an entry is read from its hour by whoever uses it. Pure: no clock, no network; the storage is injected.
 */
import type { QuoteFacts } from "./quote-facts";

const FEE_SOURCES = ["cotacao_de_compra", "cotacao_de_venda", "cotacao_de_fechamento"] as const;
export type FeeSource = (typeof FEE_SOURCES)[number];

export interface ChainFee {
  readonly chainIndex: string;
  /** `tradeFee` of the quote: the estimated network fee of one swap, in dollars. */
  readonly tradeFeeUsd: number;
  /** `estimateGasFee` of the quote, in the smallest unit of the native coin; null when the quote did not carry a whole non-negative one. Never added to the dollars. */
  readonly gasEstimate: number | null;
  /** When the quote was read, by the clock of this machine. */
  readonly observedAtMs: number;
  readonly source: FeeSource;
}

export interface FeeIo {
  read(): unknown | null;
  write(value: unknown): void;
}

export interface FeeMemory {
  /** Records the fee of a quote for a network. False when the quote measures nothing or is older than what is kept. */
  observe(chainIndex: string, quote: QuoteFacts, source: FeeSource): boolean;
  get(chainIndex: string): ChainFee | undefined;
  all(): readonly ChainFee[];
  /** Whole minutes between the measurement of a network and `nowMs`; null when there is none or the clock is earlier than it. */
  ageMinutes(chainIndex: string, nowMs: number): number | null;
  health(): { readonly ok: true } | { readonly ok: false; readonly reason: "taxas_ilegiveis" };
}

const CHAIN = /^[1-9]\d{0,11}$/;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseFee(key: string, value: unknown): ChainFee | null {
  if (value === null || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.chainIndex !== key || !CHAIN.test(key)) return null;
  if (!isNum(o.tradeFeeUsd) || o.tradeFeeUsd < 0) return null;
  if (!isNum(o.observedAtMs) || o.observedAtMs <= 0) return null;
  if (o.gasEstimate !== null && !(isNum(o.gasEstimate) && Number.isInteger(o.gasEstimate) && o.gasEstimate >= 0)) return null;
  if (!(FEE_SOURCES as readonly unknown[]).includes(o.source)) return null;
  return { chainIndex: key, tradeFeeUsd: o.tradeFeeUsd, gasEstimate: o.gasEstimate as number | null, observedAtMs: o.observedAtMs, source: o.source as FeeSource };
}

export function createFeeMemory(io: FeeIo): FeeMemory {
  const fees = new Map<string, ChainFee>();
  let healthy = true;
  try {
    const raw = io.read();
    if (raw !== null) {
      const o = raw as { version?: unknown; fees?: unknown };
      if (typeof o !== "object" || Array.isArray(o) || o.version !== 1 || o.fees === null || typeof o.fees !== "object" || Array.isArray(o.fees)) throw new Error("shape");
      for (const [key, value] of Object.entries(o.fees)) {
        const fee = parseFee(key, value);
        if (fee === null) throw new Error("shape");
        fees.set(key, fee);
      }
    }
  } catch {
    healthy = false;
    fees.clear();
  }

  return {
    observe(chainIndex, quote, source) {
      if (!CHAIN.test(chainIndex)) return false;
      if (!isNum(quote.tradeFee) || quote.tradeFee < 0) return false;
      if (!isNum(quote.atMs) || quote.atMs <= 0) return false;
      const kept = fees.get(chainIndex);
      if (kept !== undefined && quote.atMs <= kept.observedAtMs) return false;
      const gas = quote.gasEstimate !== null && isNum(quote.gasEstimate) && Number.isInteger(quote.gasEstimate) && quote.gasEstimate >= 0 ? quote.gasEstimate : null;
      fees.set(chainIndex, { chainIndex, tradeFeeUsd: quote.tradeFee, gasEstimate: gas, observedAtMs: quote.atMs, source });
      try {
        io.write({ version: 1, fees: Object.fromEntries(fees) });
      } catch {
        // a measurement that could not be kept stays in memory for this run
      }
      return true;
    },
    get: (chainIndex) => fees.get(chainIndex),
    all: () => [...fees.values()],
    ageMinutes(chainIndex, nowMs) {
      const fee = fees.get(chainIndex);
      if (fee === undefined || !isNum(nowMs) || nowMs < fee.observedAtMs) return null;
      return Math.floor((nowMs - fee.observedAtMs) / 60_000);
    },
    health: () => (healthy ? { ok: true } : { ok: false, reason: "taxas_ilegiveis" }),
  };
}
