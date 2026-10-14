/**
 * The Solana account of the OKX Wallet (T9.1, WAL-1). Solana is not an EVM network: the extension keeps it as a second provider (`okxwallet.solana`) with its own
 * account and no network to switch, so the app learns the account with its own click. This session does only that. It connects when asked, one request at a time,
 * and keeps the account and what the wallet says afterwards. It reads no balances (the local gateway does, when the person clicks), signs nothing and sends
 * nothing: the only things it asks the provider are `connect`, to listen and to stop listening.
 *
 * The provider is the one the page already has; this module never finds it (see `discoverOkxSolanaProvider`) and never connects it by itself.
 */
import { parseSolanaAccount, type OkxSolanaProvider } from "../okx-solana";
import { WalletTimeoutError, classifyWalletError, walletError, type WalletErrorInfo } from "./errors";

export type SolanaAccountStatus = "disconnected" | "connecting" | "connected";

export interface SolanaAccountSnapshot {
  readonly status: SolanaAccountStatus;
  /** The base58 account, or null: it is never half known. */
  readonly account: string | null;
  /** Why the last click did not connect, in our words. */
  readonly error: WalletErrorInfo | null;
  /** What the wallet told on its own after a connection (the account changed, the wallet disconnected), in our words. */
  readonly notice: string | null;
}

export interface SolanaAccountSession {
  getSnapshot(): SolanaAccountSnapshot;
  subscribe(listener: (snapshot: SolanaAccountSnapshot) => void): () => void;
  /** Only the click of a person calls this. */
  connect(): Promise<void>;
  /** Forgets the account here. The permission the person gave in the extension is not touched. */
  disconnect(): void;
  dispose(): void;
}

/**
 * The Solana side of the wallet as a screen needs it (T9.1, WAL-1): whether the provider was found, whether the looking is over, whether a click is waiting for the
 * person, the account (known only once it is connected) and the texts, already in our words (see errors.ts).
 */
export interface SolanaSide {
  readonly available: boolean;
  readonly ready: boolean;
  readonly connecting: boolean;
  readonly account: string | null;
  readonly errorText: string | null;
  readonly notice: string | null;
  /** Only the click of a person calls this. */
  readonly onConnect: () => void;
}

export function solanaSideOf(hook: {
  readonly available: boolean;
  readonly ready: boolean;
  readonly snapshot: SolanaAccountSnapshot;
  readonly connect: () => Promise<void>;
}): SolanaSide {
  const { snapshot } = hook;
  return {
    available: hook.available,
    ready: hook.ready,
    connecting: snapshot.status === "connecting",
    account: snapshot.status === "connected" ? snapshot.account : null,
    errorText: snapshot.error?.text ?? null,
    notice: snapshot.notice,
    onConnect: () => void hook.connect(),
  };
}

export interface SolanaAccountOptions {
  /** How long to wait for the wallet; the person may have to confirm in a popup. Default one minute. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const NOTICE_CHANGED = "A conta Solana da carteira mudou. O que foi lido foi descartado.";
const NOTICE_GONE = "A carteira Solana foi desconectada. Conecte de novo para ler.";

const EMPTY: SolanaAccountSnapshot = { status: "disconnected", account: null, error: null, notice: null };

export function createSolanaAccountSession(provider: OkxSolanaProvider, options: SolanaAccountOptions = {}): SolanaAccountSession {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const listeners = new Set<(snapshot: SolanaAccountSnapshot) => void>();
  let snapshot: SolanaAccountSnapshot = EMPTY;
  let disposed = false;
  // after "disconnect here" or before the first click, what the wallet announces is not a connection: only a click connects
  let allowed = false;
  let revision = 0;
  let waiting = false;

  const publish = (next: SolanaAccountSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of [...listeners]) listener(snapshot);
  };

  const onAccountChanged = (...args: unknown[]) => {
    if (disposed || !allowed) return;
    revision += 1;
    const account = parseSolanaAccount(args[0]);
    if (account === null) publish({ status: "disconnected", account: null, error: null, notice: NOTICE_GONE });
    else publish({ status: "connected", account, error: null, notice: account === snapshot.account ? null : NOTICE_CHANGED });
  };
  const onDisconnect = () => {
    if (disposed || !allowed) return;
    revision += 1;
    publish({ status: "disconnected", account: null, error: null, notice: NOTICE_GONE });
  };
  provider.on("accountChanged", onAccountChanged);
  provider.on("disconnect", onDisconnect);

  /** The wallet's answer, or our own timeout: whichever comes first. A throw at once is a failure like any other. */
  function ask(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new WalletTimeoutError()), timeoutMs);
      try {
        Promise.resolve(provider.connect()).then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async function connect(): Promise<void> {
    if (disposed || waiting) return;
    waiting = true;
    allowed = true;
    const mine = ++revision;
    publish({ status: "connecting", account: null, error: null, notice: null });
    try {
      const answer = await ask();
      if (disposed || mine !== revision) return;
      const given = typeof answer === "object" && answer !== null ? (answer as { publicKey?: unknown }).publicKey : undefined;
      const account = parseSolanaAccount(given ?? provider.publicKey);
      if (account === null) publish({ status: "disconnected", account: null, error: walletError("desconhecido"), notice: null });
      else publish({ status: "connected", account, error: null, notice: null });
    } catch (error) {
      if (disposed || mine !== revision) return;
      publish({ status: "disconnected", account: null, error: classifyWalletError(error), notice: null });
    } finally {
      waiting = false;
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect,
    disconnect() {
      if (disposed) return;
      allowed = false;
      revision += 1;
      publish(EMPTY);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision += 1;
      const remove = provider.removeListener ?? provider.off;
      if (remove) {
        remove.call(provider, "accountChanged", onAccountChanged);
        remove.call(provider, "disconnect", onDisconnect);
      }
      listeners.clear();
    },
  };
}
