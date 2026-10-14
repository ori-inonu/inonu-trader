/**
 * The one Solana account of the page (T9.1, WAL-1), shared by every screen that shows it, the way the EVM wallet is: a screen that mounts retains the store, a screen that
 * leaves releases it, and the last one to leave takes the session down. Looking for the provider (`okxwallet.solana`) asks for no access; only `connect()` reaches the
 * wallet, and only the click of a person calls it. Nothing here reads a balance, signs or sends.
 */
import { discoverOkxSolanaProvider } from "../okx-solana";
import { createSolanaAccountSession, type SolanaAccountSession, type SolanaAccountSnapshot } from "./solana-account";

export interface SolanaStoreState {
  /** The Solana provider of the extension was found. */
  readonly available: boolean;
  /** The looking is over: if it is not available now, it is not there. */
  readonly ready: boolean;
  readonly snapshot: SolanaAccountSnapshot;
}

export interface SolanaStore {
  subscribe(listener: () => void): () => void;
  /** The same object until something changes (what `useSyncExternalStore` needs). */
  getSnapshot(): SolanaStoreState;
  /** A screen that shows Solana mounted. Returns the way out; leaving twice by the same handle counts once. */
  retain(surface: { okxwallet?: unknown }): () => void;
  connect(): Promise<void>;
  disconnect(): void;
}

export interface SolanaStoreOptions {
  /** Runs `fn` later; returns the way to cancel. Default: a timer. */
  readonly schedule?: (fn: () => void, ms: number) => () => void;
  /** When to look again if the extension has not injected its provider yet. The extension does it a moment after the page loads. */
  readonly lookAgainMs?: readonly number[];
  readonly timeoutMs?: number;
}

const DISCONNECTED: SolanaAccountSnapshot = { status: "disconnected", account: null, error: null, notice: null };
const INITIAL: SolanaStoreState = { available: false, ready: false, snapshot: DISCONNECTED };
export const solanaServerSnapshot: SolanaStoreState = INITIAL;

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export function createSolanaStore(options: SolanaStoreOptions = {}): SolanaStore {
  const schedule = options.schedule ?? defaultSchedule;
  const lookAgainMs = options.lookAgainMs ?? [400, 1500];
  const listeners = new Set<() => void>();
  let state: SolanaStoreState = INITIAL;
  let refs = 0;
  let session: SolanaAccountSession | null = null;
  let unsubscribe: (() => void) | null = null;
  let cancels: Array<() => void> = [];

  const set = (next: SolanaStoreState) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  function attach(surface: { okxwallet?: unknown }): boolean {
    if (session !== null) return true;
    const provider = discoverOkxSolanaProvider(surface);
    if (provider === null) return false;
    session = createSolanaAccountSession(provider, options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs });
    unsubscribe = session.subscribe((snapshot) => set({ ...state, snapshot }));
    set({ available: true, ready: true, snapshot: session.getSnapshot() });
    return true;
  }

  function start(surface: { okxwallet?: unknown }) {
    if (attach(surface)) return;
    if (lookAgainMs.length === 0) {
      set({ ...state, ready: true });
      return;
    }
    lookAgainMs.forEach((delay, index) => {
      cancels.push(
        schedule(() => {
          if (refs === 0) return;
          if (attach(surface)) return;
          if (index === lookAgainMs.length - 1) set({ ...state, ready: true });
        }, delay),
      );
    });
  }

  function stop() {
    for (const cancel of cancels) cancel();
    cancels = [];
    unsubscribe?.();
    unsubscribe = null;
    session?.dispose();
    session = null;
    state = INITIAL;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    retain(surface) {
      refs += 1;
      if (refs === 1) start(surface);
      let left = false;
      return () => {
        if (left) return;
        left = true;
        refs -= 1;
        if (refs === 0) {
          stop();
          for (const listener of [...listeners]) listener();
        }
      };
    },
    connect: () => session?.connect() ?? Promise.resolve(),
    disconnect: () => session?.disconnect(),
  };
}

let browserStore: SolanaStore | null = null;
/** The store of the page. Created on first use in the browser, so nothing is looked for before a screen asks. */
export function getBrowserSolanaStore(): SolanaStore {
  browserStore ??= createSolanaStore();
  return browserStore;
}
