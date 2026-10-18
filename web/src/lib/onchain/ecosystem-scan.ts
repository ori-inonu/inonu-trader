/**
 * The scan behind the opportunity board of the ecosystem: for each network the person chose, ONE read of the hot list and ONE read of the purchases of the tracked wallets (two reads
 * of the OnchainOS gateway, no model). It runs only when the person clicks "Varrer", one network after the other so the gateway's own limiter is never pushed, and what it read stays
 * in a store shared by the whole page, so leaving the tab and coming back shows the same reading with its age instead of spending the reads again.
 *
 * A read that fails is a note on its network ("A OKX respondeu com erro"), never a zero and never the end of the scan: the other networks go on.
 */
import { useSyncExternalStore } from "react";
import { onchainErrorText } from "../mesa/onchain-rows";
import { createOnchainClient, type OnchainClient, type OnchainResult } from "./client";
import { CHAIN_ORDER } from "./chains";
import type { ChainScan } from "./opportunities";

export interface ScanTarget {
  readonly chainIndex: string;
  readonly name: string;
}

/** The most networks one scan reads: two reads each, so twelve at most. */
export const SCAN_MAX_CHAINS = 6;

/** The networks the first scan reads: the ones with the most tokens and tracked wallets, plus the OKX's own. */
export const DEFAULT_SCAN_CHAINS: readonly string[] = ["501", "8453", "56", "1", "196"];

export const SCAN_STORAGE_KEY = "inonu.ecosystem.chains.v1";

const KNOWN = new Map(CHAIN_ORDER.map((c) => [c.chainIndex, c.name]));

/** The saved choice, defensively: only networks the desk knows by name, no repeats, at most `SCAN_MAX_CHAINS`; anything else is the default. */
export function parseChains(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return DEFAULT_SCAN_CHAINS;
  const picked: string[] = [];
  for (const v of raw) if (typeof v === "string" && KNOWN.has(v) && !picked.includes(v)) picked.push(v);
  return picked.length === 0 ? DEFAULT_SCAN_CHAINS : picked.slice(0, SCAN_MAX_CHAINS);
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined;

export function loadChains(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage): readonly string[] {
  try {
    const raw = storage?.getItem(SCAN_STORAGE_KEY);
    return raw == null ? DEFAULT_SCAN_CHAINS : parseChains(JSON.parse(raw));
  } catch {
    return DEFAULT_SCAN_CHAINS;
  }
}

export function saveChains(chains: readonly string[], storage: WritableStorage = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(SCAN_STORAGE_KEY, JSON.stringify(chains));
  } catch {
    // a blocked or full storage only means the choice is not remembered
  }
}

export function targetsOf(chains: readonly string[]): readonly ScanTarget[] {
  return chains.filter((c) => KNOWN.has(c)).map((chainIndex) => ({ chainIndex, name: KNOWN.get(chainIndex)! }));
}

function listOf<T>(result: OnchainResult<T[]>): { readonly list: T[] | null; readonly error: string | null } {
  return result.ok ? { list: result.data, error: null } : { list: null, error: onchainErrorText(result.error).text };
}

/** One network: its two reads together (they do not depend on each other), each failing on its own. */
export async function scanChain(client: Pick<OnchainClient, "hotTokens" | "signals">, target: ScanTarget, nowMs: () => number): Promise<ChainScan> {
  const guarded = async <T>(read: () => Promise<OnchainResult<T[]>>): Promise<{ readonly list: T[] | null; readonly error: string | null }> => {
    try {
      return listOf(await read());
    } catch {
      return { list: null, error: "A leitura nao chegou ao servidor local" };
    }
  };
  const [hot, signals] = await Promise.all([
    guarded(() => client.hotTokens({ chainIndex: target.chainIndex, timeFrame: 4, limit: 100 }, "user")),
    guarded(() => client.signals({ chainIndex: target.chainIndex, walletType: "1,2,3", limit: 100 }, "user")),
  ]);
  return { chainIndex: target.chainIndex, chainName: target.name, hot: hot.list, signals: signals.list, hotError: hot.error, signalsError: signals.error, atMs: nowMs() };
}

export interface EcosystemState {
  readonly status: "idle" | "scanning" | "ready";
  readonly scans: readonly ChainScan[];
  /** The networks of the scan that is running or finished. */
  readonly targets: readonly ScanTarget[];
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
}

const IDLE: EcosystemState = { status: "idle", scans: [], targets: [], startedAtMs: null, finishedAtMs: null };

export interface EcosystemStore {
  readonly getState: () => EcosystemState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Starts a scan; ignored while one is running (a second click must not double the reads). */
  readonly start: (client: Pick<OnchainClient, "hotTokens" | "signals">, targets: readonly ScanTarget[]) => Promise<void>;
}

export function createEcosystemStore(now: () => number = Date.now): EcosystemStore {
  let state: EcosystemState = IDLE;
  const listeners = new Set<() => void>();
  const set = (next: EcosystemState) => {
    state = next;
    for (const l of listeners) l();
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: async (client, targets) => {
      if (state.status === "scanning" || targets.length === 0) return;
      set({ status: "scanning", scans: [], targets, startedAtMs: now(), finishedAtMs: null });
      for (const target of targets) {
        const scanned = await scanChain(client, target, now);
        set({ ...state, scans: [...state.scans, scanned] });
      }
      set({ ...state, status: "ready", finishedAtMs: now() });
    },
  };
}

let shared: EcosystemStore | null = null;

/** One store for the whole page: the tab can be closed and opened again without losing, or repeating, a scan. */
export function sharedEcosystemStore(): EcosystemStore {
  shared ??= createEcosystemStore();
  return shared;
}

export function useEcosystemScan(): { readonly state: EcosystemState; readonly scan: (chains: readonly string[], client?: Pick<OnchainClient, "hotTokens" | "signals">) => void } {
  const store = sharedEcosystemStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, () => IDLE);
  return { state, scan: (chains, client) => void store.start(client ?? createOnchainClient(), targetsOf(chains)) };
}
