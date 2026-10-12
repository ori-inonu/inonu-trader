import {
  createWalletSession, discoverOkxProvider,
  type Eip1193Provider, type OkxDiscoverySurface, type WalletSession, type WalletSnapshot,
} from "./okx-wallet";
import type { WalletTransactionPreflightResult } from "./wallet-transaction-preflight";

export interface SharedWalletSnapshot {
  readonly available: boolean;
  readonly ready: boolean;
  readonly snapshot: WalletSnapshot;
  readonly revision: number;
  readonly identityKey: string | null;
}

const disconnected: WalletSnapshot = Object.freeze({
  status: "disconnected", account: null, chainId: null, balances: null,
  observedAtMs: null, observation: null, error: null,
});
export const walletServerSnapshot: SharedWalletSnapshot = Object.freeze({
  available: false, ready: false, snapshot: disconnected, revision: 0, identityKey: null,
});

export function walletChainIndex(snapshot: WalletSnapshot): "196" | "143" | null {
  if (snapshot.chainId === "0xc4") return "196";
  if (snapshot.chainId === "0x8f") return "143";
  return null;
}

function identity(snapshot: WalletSnapshot): string | null {
  const chain = walletChainIndex(snapshot);
  return chain && snapshot.account ? `${chain}:${snapshot.account.toLowerCase()}` : null;
}

function validProvider(value: unknown): value is Eip1193Provider {
  if (!value || typeof value !== "object") return false;
  const provider = value as Partial<Eip1193Provider>;
  return typeof provider.request === "function" && typeof provider.on === "function" && typeof provider.removeListener === "function";
}

/** One in-memory, local-only session, retained by every mounted wallet consumer. */
export function createWalletStore() {
  const listeners = new Set<() => void>();
  let state = walletServerSnapshot;
  let references = 0;
  let revision = 0;
  let sessionToken = 0;
  const invalidationListeners = new Set<() => void>();
  /** Any provider, account, network or request change retires proposals reviewed under the previous session token. */
  const bumpSession = () => {
    sessionToken++;
    for (const listener of invalidationListeners) listener();
  };
  let identityTag: string | null = null;
  let identityHash: string | null = null;
  let session: WalletSession | null = null;
  let provider: Eip1193Provider | null = null;
  let unsubscribe: (() => void) | null = null;
  let stopDiscovery: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let activeSurface: OkxDiscoverySurface | null = null;

  const publish = (snapshot: WalletSnapshot, available: boolean, ready = true) => {
    const nextIdentity = identity(snapshot);
    if (nextIdentity !== identityTag) { revision++; identityTag = nextIdentity; identityHash = null; }
    state = Object.freeze({ available, ready, snapshot, revision, identityKey: identityHash });
    for (const listener of listeners) listener();
    if (nextIdentity && !identityHash) {
      const observedRevision = revision;
      void crypto.subtle.digest("SHA-256", new TextEncoder().encode(nextIdentity)).then((digest) => {
        if (revision !== observedRevision || identityTag !== nextIdentity || !references) return;
        identityHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
        state = Object.freeze({ ...state, identityKey: identityHash });
        for (const listener of listeners) listener();
      }).catch(() => {});
    }
  };
  const invalidate = () => {
    revision++;
    bumpSession();
    publish(Object.freeze({ ...state.snapshot, balances: null, observation: null, observedAtMs: null }), state.available);
  };
  const disposeSession = () => {
    bumpSession();
    unsubscribe?.();
    unsubscribe = null;
    session?.dispose();
    session = null;
    for (const event of ["accountsChanged", "chainChanged", "disconnect"]) provider?.removeListener(event, invalidate);
    provider = null;
  };
  const adopt = (next: Eip1193Provider) => {
    if (!references || provider === next) return;
    disposeSession();
    revision++;
    provider = next;
    // Register invalidation before the session listeners, including repeated events.
    for (const event of ["accountsChanged", "chainChanged", "disconnect"]) provider.on(event, invalidate);
    session = createWalletSession(provider);
    unsubscribe = session.subscribe((snapshot) => { bumpSession(); publish(snapshot, true); });
    publish(session.getSnapshot(), true);
  };
  const inspectAnchor = () => {
    if (validProvider(activeSurface?.okxwallet)) adopt(activeSurface.okxwallet);
    else if (provider) {
      disposeSession();
      revision++;
      publish(disconnected, false);
    }
  };
  const stop = () => {
    stopDiscovery?.();
    stopDiscovery = null;
    if (timer !== null) clearInterval(timer);
    timer = null;
    activeSurface?.removeEventListener("ethereum#initialized", inspectAnchor);
    activeSurface?.removeEventListener("okxwallet#initialized", inspectAnchor);
    activeSurface = null;
    disposeSession();
    revision++;
    publish(disconnected, false, false);
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    retain(surface: OkxDiscoverySurface) {
      if (references && activeSurface !== surface) throw new Error("A wallet store belongs to one browser surface.");
      references++;
      if (references === 1) {
        activeSurface = surface;
        publish(disconnected, false);
        stopDiscovery = discoverOkxProvider(surface, adopt);
        surface.addEventListener("ethereum#initialized", inspectAnchor);
        surface.addEventListener("okxwallet#initialized", inspectAnchor);
        timer = setInterval(inspectAnchor, 500);
      }
      let released = false;
      return () => { if (released) return; released = true; if (--references === 0) stop(); };
    },
    connect() { revision++; bumpSession(); return session?.connect() ?? Promise.resolve(); },
    refresh() { bumpSession(); return session?.refresh() ?? Promise.resolve(); },
    switchToMonad() { invalidate(); return session?.switchToMonad() ?? Promise.resolve(); },
    switchToXLayer() { invalidate(); return session?.switchToXLayer() ?? Promise.resolve(); },
    disconnect() { revision++; bumpSession(); session?.disconnect(); },
    preflightTransaction(input: unknown): Promise<WalletTransactionPreflightResult> {
      return session?.preflightTransaction(input)
        ?? Promise.resolve({ status: "blocked", reason: "session_unavailable", executionQualified: false });
    },
    getSessionToken: () => sessionToken,
    subscribeSessionInvalidation(listener: () => void) {
      invalidationListeners.add(listener);
      return () => { invalidationListeners.delete(listener); };
    },
  };
}

export type WalletStore = ReturnType<typeof createWalletStore>;
let browserStore: WalletStore | null = null;
export function getBrowserWalletStore(): WalletStore {
  browserStore ??= createWalletStore();
  return browserStore;
}
