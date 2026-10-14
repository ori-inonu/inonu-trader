/**
 * Which signals the chart shows (ASK-8): the answer of Inonu, the zones, the measured flow and the tracked wallets of an
 * on-chain token, and for the wallets the parameters the provider offers (type, minimum value, minimum addresses). Kept on THIS
 * machine in the browser storage under its own key. Any content that is not exactly the expected shape falls back to the
 * defaults, field by field, so a hand edited or older payload never breaks the desk, and a blocked storage changes nothing.
 *
 * The wallet parameters narrow what is DRAWN. They are not sent to the provider, so changing them costs no quota.
 */
export const SIGNALS_KEY = "inonu.chart.signals.v1";

export type WalletKind = "smart_money" | "kol" | "whale";
const KINDS: readonly WalletKind[] = ["smart_money", "kol", "whale"];

/** Values the selectors offer. The parser accepts any whole, bounded number, so an older list never breaks. */
export const MIN_USD_OPTIONS: readonly number[] = [0, 1_000, 10_000, 100_000];
export const MIN_ADDRESS_OPTIONS: readonly number[] = [1, 2, 3, 5];
const MAX_MIN_USD = 1e12;
const MAX_MIN_ADDRESSES = 100;

export interface SignalFilters {
  /** The answer of the model: the chip, the outline of the chosen zone and the older glyphs. */
  readonly inonu: boolean;
  readonly zonas: boolean;
  readonly fluxo: boolean;
  /** Tracked-wallet purchase marks of an on-chain token. */
  readonly carteiras: boolean;
  readonly tipos: readonly WalletKind[];
  readonly minUsd: number;
  readonly minEnderecos: number;
}

export const DEFAULT_SIGNALS: SignalFilters = { inonu: true, zonas: true, fluxo: true, carteiras: true, tipos: [...KINDS], minUsd: 0, minEnderecos: 1 };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const flag = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

export function parseSignals(raw: unknown): SignalFilters {
  if (!isRec(raw)) return DEFAULT_SIGNALS;
  let tipos: readonly WalletKind[] = DEFAULT_SIGNALS.tipos;
  if (Array.isArray(raw.tipos)) {
    const known = KINDS.filter((kind) => (raw.tipos as unknown[]).includes(kind));
    // an empty list is a choice (no wallet type); a list with no known type is garbage
    tipos = raw.tipos.length === 0 ? [] : known.length > 0 ? known : DEFAULT_SIGNALS.tipos;
  }
  const minUsd = typeof raw.minUsd === "number" && Number.isFinite(raw.minUsd) && raw.minUsd >= 0 && raw.minUsd <= MAX_MIN_USD ? raw.minUsd : DEFAULT_SIGNALS.minUsd;
  const minEnderecos =
    typeof raw.minEnderecos === "number" && Number.isInteger(raw.minEnderecos) && raw.minEnderecos >= 1 && raw.minEnderecos <= MAX_MIN_ADDRESSES ? raw.minEnderecos : DEFAULT_SIGNALS.minEnderecos;
  return {
    inonu: flag(raw.inonu, DEFAULT_SIGNALS.inonu),
    zonas: flag(raw.zonas, DEFAULT_SIGNALS.zonas),
    fluxo: flag(raw.fluxo, DEFAULT_SIGNALS.fluxo),
    carteiras: flag(raw.carteiras, DEFAULT_SIGNALS.carteiras),
    tipos,
    minUsd,
    minEnderecos,
  };
}

/** The smallest slice of Storage this needs; null on the server or when the storage is blocked. */
export interface SignalsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSignals(storage: SignalsStorage | null): SignalFilters {
  if (storage === null) return DEFAULT_SIGNALS;
  try {
    const raw = storage.getItem(SIGNALS_KEY);
    return raw === null ? DEFAULT_SIGNALS : parseSignals(JSON.parse(raw));
  } catch {
    return DEFAULT_SIGNALS;
  }
}

export function saveSignals(storage: SignalsStorage | null, filters: SignalFilters): void {
  if (storage === null) return;
  try {
    storage.setItem(SIGNALS_KEY, JSON.stringify(filters));
  } catch {
    // full or blocked: the choice lasts until the page closes
  }
}

interface MarkLike {
  readonly walletType: WalletKind;
  readonly count: number;
  readonly amountUsd: number;
}

/**
 * The tracked-wallet marks that pass the filters, still grouped by candle; a candle left with no mark is dropped. A minimum is
 * only applied when it is above its neutral value, and a mark whose value the provider did not give fails a real minimum
 * instead of passing it.
 */
export function filterWalletMarks<M extends MarkLike>(marks: ReadonlyMap<number, readonly M[]>, filters: SignalFilters): Map<number, M[]> {
  const out = new Map<number, M[]>();
  if (!filters.carteiras) return out;
  for (const [index, list] of marks) {
    const kept = list.filter(
      (m) => filters.tipos.includes(m.walletType) && (filters.minUsd <= 0 || m.amountUsd >= filters.minUsd) && (filters.minEnderecos <= 1 || m.count >= filters.minEnderecos),
    );
    if (kept.length > 0) out.set(index, kept);
  }
  return out;
}
