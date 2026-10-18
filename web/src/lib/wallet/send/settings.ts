/**
 * What the person allows the app to carry out through their own wallet (WAL-10, EXE-1, EXE-2, EXE-8, EXE-12): the option, the caps, the limits, the kill switch, and the routers and approval addresses the person has
 * decided to trust on each network. It is kept on THIS machine, in the browser storage, and read back only if it is exactly the closed shape below: a hand edited or older payload falls back to the defaults, and
 * the default is OFF. Nothing here sends or signs; the gate (`gate.ts`) is what reads it.
 *
 * The storage is shared by every tab, so it is RE-READ on every `get()` and every change is a read-modify-write: a stop clicked in one tab stops the others, and a Settings tab that is out of date cannot
 * silently turn a stopped switch back on (only an explicit `unkill` can). A storage that is missing or blocked leaves the settings in memory for this page, and the default (off) is what a new page reads.
 */

export const TRADE_SETTINGS_KEY = "inonu.trade.settings.v1";

/** The addresses the person trusts on each network, lower case: the router the swap is sent to, and the address the approval is given to. */
export type TrustedAddresses = Readonly<Record<string, readonly string[]>>;

export interface TradeSettings {
  /** "Permitir enviar pela minha carteira": off until the person turns it on in Configuracoes. */
  readonly enabled: boolean;
  /** The most one order may be worth, in dollars; null means no cap, and no cap means no order. */
  readonly perOperationUsd: number | null;
  /** The most the orders of the last 24 hours may add up to, in dollars; null means no cap, and no cap means no order. */
  readonly dailyUsd: number | null;
  /** The largest price impact the person accepts, in percent. */
  readonly maxImpactPct: number;
  /** The largest tax of the token (a token that charges on a trade) the person accepts, in percent. */
  readonly maxTaxPct: number;
  /** The slippage the order is asked for and the person confirms, in percent, with at most two decimals. */
  readonly slippagePct: number;
  /** The kill switch: while true nothing is sent, whatever else says yes. */
  readonly killed: boolean;
  /** The routers the person trusts, by network: a swap that goes anywhere else is stopped until the person says this one is right. */
  readonly trustedRouters: TrustedAddresses;
  /** The addresses the person trusts to be given an approval, by network. */
  readonly trustedSpenders: TrustedAddresses;
}

export const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  enabled: false,
  perOperationUsd: null,
  dailyUsd: null,
  maxImpactPct: 1,
  maxTaxPct: 5,
  slippagePct: 1,
  killed: false,
  trustedRouters: {},
  trustedSpenders: {},
};

/** The limits of what a person may type: above them the field is refused, not clamped. */
export const LIMITS = {
  /** A cap above this is not a cap of a person who is protecting their balance, and is refused as a typing error. */
  maxCapUsd: 1_000_000,
  maxImpactPct: 10,
  maxTaxPct: 30,
  maxSlippagePct: 5,
  /** Networks and addresses per network the person can trust: a short list, never a way to trust everything. */
  maxTrustedChains: 20,
  maxTrustedPerChain: 4,
} as const;

const KEYS = Object.keys(DEFAULT_TRADE_SETTINGS).sort().join(",");
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAIN = /^\d{1,12}$/;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const capOrNull = (v: unknown): v is number | null => v === null || (isNum(v) && v > 0 && v <= LIMITS.maxCapUsd);
const twoDecimals = (v: number): boolean => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;

function parseTrusted(raw: unknown): TrustedAddresses | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > LIMITS.maxTrustedChains) return null;
  const out: Record<string, readonly string[]> = {};
  for (const [chain, list] of entries) {
    if (!CHAIN.test(chain) || !Array.isArray(list) || list.length > LIMITS.maxTrustedPerChain) return null;
    if (!list.every((a) => typeof a === "string" && EVM_ADDRESS.test(a))) return null;
    if (new Set(list).size !== list.length) return null;
    out[chain] = [...(list as string[])];
  }
  return out;
}

/** What was kept, if it is exactly the shape; otherwise null. */
export function parseTradeSettings(raw: unknown): TradeSettings | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join(",") !== KEYS) return null;
  if (typeof r.enabled !== "boolean" || typeof r.killed !== "boolean") return null;
  if (!capOrNull(r.perOperationUsd) || !capOrNull(r.dailyUsd)) return null;
  if (!isNum(r.maxImpactPct) || r.maxImpactPct <= 0 || r.maxImpactPct > LIMITS.maxImpactPct) return null;
  if (!isNum(r.maxTaxPct) || r.maxTaxPct < 0 || r.maxTaxPct > LIMITS.maxTaxPct) return null;
  if (!isNum(r.slippagePct) || r.slippagePct <= 0 || r.slippagePct > LIMITS.maxSlippagePct || !twoDecimals(r.slippagePct)) return null;
  const trustedRouters = parseTrusted(r.trustedRouters);
  const trustedSpenders = parseTrusted(r.trustedSpenders);
  if (trustedRouters === null || trustedSpenders === null) return null;
  return {
    enabled: r.enabled,
    perOperationUsd: r.perOperationUsd,
    dailyUsd: r.dailyUsd,
    maxImpactPct: r.maxImpactPct,
    maxTaxPct: r.maxTaxPct,
    slippagePct: r.slippagePct,
    killed: r.killed,
    trustedRouters,
    trustedSpenders,
  };
}

/** A number the person typed, with the comma or the point, in a range; null when it is not one. Never clamped: a value out of range is an error to show. */
export function parseTyped(text: string, min: number, max: number, inclusiveMin = false, maxDecimals = 4): number | null {
  const clean = text.trim().replace(",", ".");
  if (!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${maxDecimals}})?$`).test(clean)) return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value > max) return null;
  return inclusiveMin ? (value >= min ? value : null) : value > min ? value : null;
}

export interface TradeSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const withAddress = (list: TrustedAddresses, chainIndex: string, address: string): TrustedAddresses => {
  const current = list[chainIndex] ?? [];
  return current.includes(address) ? list : { ...list, [chainIndex]: [...current, address] };
};

export function createTradeSettingsStore(options: { readonly storage?: TradeSettingsStorage | null } = {}) {
  const storage = options.storage ?? null;
  let memory: TradeSettings = DEFAULT_TRADE_SETTINGS;
  /**
   * The stop is STICKY in memory when it could not be written: a page that stopped the orders while its storage was full or blocked, and whose old content says "not stopped", does not turn it back on at the next
   * read. Only an explicit `unkill` that could be kept clears it.
   */
  let stopped = false;
  /** What is kept NOW: another tab may have changed it since this page last looked. */
  const fresh = (): TradeSettings => {
    if (storage !== null) {
      try {
        const kept = storage.getItem(TRADE_SETTINGS_KEY);
        // nothing kept is the default, and a kept payload that is not exactly the shape is the default too: never a half read
        memory = (kept === null ? null : parseTradeSettings(JSON.parse(kept))) ?? DEFAULT_TRADE_SETTINGS;
      } catch {
        // a blocked storage leaves what this page knew
      }
    }
    if (stopped && !memory.killed) memory = { ...memory, killed: true };
    return memory;
  };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // a listener that fails must not keep the others from hearing
      }
    }
  };
  /** Keeps the settings; false when they could NOT be kept (a storage that is full or blocked), and then nothing changed. */
  const write = (next: TradeSettings): boolean => {
    try {
      storage?.setItem(TRADE_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    memory = next;
    notify();
    return true;
  };
  return {
    get: (): TradeSettings => fresh(),
    /**
     * Replaces the settings with a closed, valid shape; anything else is refused and nothing changes. The stop is never undone by a save: a page that is out of date cannot turn it back on, only `unkill` can,
     * and the trusted addresses are the ones kept now, never the ones this page last saw. False when it was refused or could not be kept.
     */
    set(next: TradeSettings, change: { readonly unkill?: boolean } = {}): boolean {
      const checked = parseTradeSettings(next);
      if (checked === null) return false;
      const now = fresh();
      const killed = change.unkill === true ? false : now.killed || checked.killed;
      const kept = write({ ...checked, killed, trustedRouters: now.trustedRouters, trustedSpenders: now.trustedSpenders });
      if (kept && change.unkill === true) stopped = false;
      return kept;
    },
    /** The kill switch: stops everything at once, and it is the one change that never needs the rest of the settings to be valid. It holds even when it cannot be written. */
    kill(): void {
      const now = fresh();
      if (!write({ ...now, killed: true })) {
        // the stop could not be written: it holds for this page anyway, and a later read of the old storage cannot turn it back on
        stopped = true;
        memory = { ...now, killed: true };
        notify();
      }
    },
    /**
     * The person said this router (or this approval address) is right for this network; either may be given alone. Only an address in the shape of one is kept, and only a few per network. False when it was
     * refused (not an address, a full list) or could not be kept: nothing is trusted then.
     */
    trust(chainIndex: string, router: string | null, spender: string | null): boolean {
      const now = fresh();
      const r = router === null ? null : router.toLowerCase();
      const s = spender === null ? null : spender.toLowerCase();
      if (r === null && s === null) return false;
      if (!CHAIN.test(chainIndex) || (r !== null && !EVM_ADDRESS.test(r)) || (s !== null && !EVM_ADDRESS.test(s))) return false;
      const known = chainIndex in now.trustedRouters || chainIndex in now.trustedSpenders;
      const chains = new Set([...Object.keys(now.trustedRouters), ...Object.keys(now.trustedSpenders)]);
      if (!known && chains.size >= LIMITS.maxTrustedChains) return false;
      if (r !== null && (now.trustedRouters[chainIndex] ?? []).length >= LIMITS.maxTrustedPerChain && !(now.trustedRouters[chainIndex] ?? []).includes(r)) return false;
      if (s !== null && (now.trustedSpenders[chainIndex] ?? []).length >= LIMITS.maxTrustedPerChain && !(now.trustedSpenders[chainIndex] ?? []).includes(s)) return false;
      return write({
        ...now,
        trustedRouters: r === null ? now.trustedRouters : withAddress(now.trustedRouters, chainIndex, r),
        trustedSpenders: s === null ? now.trustedSpenders : withAddress(now.trustedSpenders, chainIndex, s),
      });
    },
    /** Takes back the trust of a network. False when it could not be kept (then the trust stays). */
    untrust(chainIndex: string): boolean {
      const now = fresh();
      const { [chainIndex]: _router, ...routers } = now.trustedRouters;
      const { [chainIndex]: _spender, ...spenders } = now.trustedSpenders;
      return write({ ...now, trustedRouters: routers, trustedSpenders: spenders });
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Tells the listeners that the storage changed under this page (another tab wrote it). */
    changedElsewhere(): void {
      fresh();
      notify();
    },
  };
}

export type TradeSettingsStore = ReturnType<typeof createTradeSettingsStore>;

let shared: TradeSettingsStore | null = null;

/** The one store of the page: Configuracoes writes it, the order panel reads it. It is the browser's local storage, not the tab's, so a restart does not turn it on again by itself and does not forget a stop. */
export function sharedTradeSettings(): TradeSettingsStore {
  if (shared === null) {
    shared = createTradeSettingsStore({ storage: localStorageOrNull() });
    // another tab wrote the settings (a stop, a change): this page hears it and its screens read it again
    try {
      if (typeof window !== "undefined") {
        const store = shared;
        window.addEventListener("storage", (e) => {
          if (e.key === TRADE_SETTINGS_KEY || e.key === null) store.changedElsewhere();
        });
      }
    } catch {
      // no events: every read of the settings still reads the storage again
    }
  }
  return shared;
}

function localStorageOrNull(): TradeSettingsStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
