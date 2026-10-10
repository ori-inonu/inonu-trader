/**
 * Read-only Solana session through the OKX Wallet extension.
 *
 * Provider: `window.okxwallet.solana` (OKX dapp-connect docs, Solana provider,
 * read 2026-10-10): `connect()` resolves with `publicKey`, events `connect`,
 * `disconnect` and `accountChanged`. Balances are read from a public Solana
 * JSON-RPC endpoint with `getBalance` and `getTokenAccountsByOwner`; nothing is
 * signed and no transaction is sent.
 */
export interface SolanaPublicKeyLike {
  toString(): string;
}

export interface OkxSolanaProvider {
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: SolanaPublicKeyLike } | void>;
  disconnect?(): Promise<void>;
  publicKey?: SolanaPublicKeyLike | null;
  isConnected?: boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface SolanaTokenSpec {
  symbol: string;
  mint: string;
  decimals: number;
}

/** Mainnet mints; identity is the mint address, never the symbol. */
export const SOLANA_TOKENS: readonly SolanaTokenSpec[] = [
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCdmgwKTnd", decimals: 6 },
];

export const SOLANA_RPC_DEFAULT = "https://api.mainnet-beta.solana.com";

export type SolanaStatus = "unavailable" | "disconnected" | "connecting" | "connected" | "reading" | "error";

export interface SolanaBalances {
  sol: string;
  tokens: { symbol: string; mint: string; amount: string }[];
  slot: string;
}

export interface SolanaSnapshot {
  status: SolanaStatus;
  account: string | null;
  balances: SolanaBalances | null;
  observedAtMs: number | null;
  error: string | null;
}

export interface SolanaSession {
  getSnapshot(): SolanaSnapshot;
  subscribe(listener: (snapshot: SolanaSnapshot) => void): () => void;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  disconnect(): void;
  dispose(): void;
}

export type JsonRpcFetch = (body: string) => Promise<unknown>;

export interface SolanaSessionOptions {
  rpcUrl?: string;
  rpcFetch?: JsonRpcFetch;
  now?: () => number;
  timeoutMs?: number;
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseSolanaAccount(value: unknown): string | null {
  if (value && typeof value === "object" && "toString" in value) {
    try {
      const text = (value as SolanaPublicKeyLike).toString();
      return BASE58.test(text) ? text : null;
    } catch {
      return null;
    }
  }
  return typeof value === "string" && BASE58.test(value) ? value : null;
}

export function isOkxSolanaProvider(value: unknown): value is OkxSolanaProvider {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OkxSolanaProvider>;
  return typeof candidate.connect === "function" && typeof candidate.on === "function";
}

function formatUnits(value: bigint, decimals: number): string {
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultRpcFetch(url: string, timeoutMs: number): JsonRpcFetch {
  return async (body) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: controller.signal });
      if (!response.ok) throw new Error("rpc http error");
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  };
}

function rpcResult(envelope: unknown): unknown {
  if (!isRecord(envelope) || "error" in envelope || !("result" in envelope)) throw new Error("rpc error");
  return envelope.result;
}

/** Reads SOL (lamports) and the listed SPL token balances at one commitment level. */
export async function readSolanaBalances(account: string, rpc: JsonRpcFetch, tokens: readonly SolanaTokenSpec[] = SOLANA_TOKENS): Promise<SolanaBalances> {
  if (!BASE58.test(account)) throw new Error("invalid account");
  const call = (id: number, method: string, params: unknown[]) => JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const balance = rpcResult(await rpc(call(1, "getBalance", [account, { commitment: "confirmed" }])));
  if (!isRecord(balance) || !isRecord(balance.context) || typeof balance.value !== "number" || !Number.isSafeInteger(balance.value) || balance.value < 0 ||
    typeof balance.context.slot !== "number" || !Number.isSafeInteger(balance.context.slot)) throw new Error("invalid balance response");
  const tokenRows: SolanaBalances["tokens"] = [];
  for (const token of tokens) {
    const accounts = rpcResult(await rpc(call(2, "getTokenAccountsByOwner", [account, { mint: token.mint }, { encoding: "jsonParsed", commitment: "confirmed" }])));
    if (!isRecord(accounts) || !Array.isArray(accounts.value)) throw new Error("invalid token response");
    let total = BigInt(0);
    for (const entry of accounts.value) {
      const info = isRecord(entry) && isRecord(entry.account) && isRecord(entry.account.data) && isRecord(entry.account.data.parsed) && isRecord(entry.account.data.parsed.info)
        ? entry.account.data.parsed.info : null;
      const amount = info && isRecord(info.tokenAmount) ? info.tokenAmount.amount : null;
      const decimals = info && isRecord(info.tokenAmount) ? info.tokenAmount.decimals : null;
      if (typeof amount !== "string" || !/^\d+$/.test(amount) || decimals !== token.decimals) throw new Error("invalid token account");
      total += BigInt(amount);
    }
    tokenRows.push({ symbol: token.symbol, mint: token.mint, amount: formatUnits(total, token.decimals) });
  }
  return { sol: formatUnits(BigInt(balance.value), 9), tokens: tokenRows, slot: String(balance.context.slot) };
}

export function createSolanaSession(provider: OkxSolanaProvider, options: SolanaSessionOptions = {}): SolanaSession {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 8_000);
  const rpc = options.rpcFetch ?? defaultRpcFetch(options.rpcUrl ?? SOLANA_RPC_DEFAULT, timeoutMs);
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(snapshot: SolanaSnapshot) => void>();
  let revision = 0;
  let disposed = false;
  let locallyDisconnected = false;
  let snapshot: SolanaSnapshot = { status: "disconnected", account: null, balances: null, observedAtMs: null, error: null };

  const publish = (next: SolanaSnapshot) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
  };

  const read = async (operation: number, account: string) => {
    publish({ status: "reading", account, balances: null, observedAtMs: null, error: null });
    try {
      const balances = await readSolanaBalances(account, rpc);
      if (disposed || operation !== revision) return;
      publish({ status: "connected", account, balances, observedAtMs: now(), error: null });
    } catch {
      if (disposed || operation !== revision) return;
      publish({ status: "error", account, balances: null, observedAtMs: null, error: "Não foi possível ler os saldos na Solana. Tente atualizar." });
    }
  };

  const handleAccountChanged = (...args: unknown[]) => {
    if (disposed || locallyDisconnected) return;
    const account = parseSolanaAccount(args[0]);
    revision++;
    if (!account) {
      publish({ status: "disconnected", account: null, balances: null, observedAtMs: null, error: "A conta Solana mudou. Conecte novamente." });
      return;
    }
    publish({ status: "connected", account, balances: null, observedAtMs: null, error: null });
    void read(revision, account);
  };
  const handleDisconnect = () => {
    if (disposed || locallyDisconnected) return;
    revision++;
    publish({ status: "disconnected", account: null, balances: null, observedAtMs: null, error: "A carteira Solana foi desconectada." });
  };
  provider.on("accountChanged", handleAccountChanged);
  provider.on("disconnect", handleDisconnect);

  const connect = async () => {
    if (disposed) return;
    locallyDisconnected = false;
    const operation = ++revision;
    publish({ status: "connecting", account: null, balances: null, observedAtMs: null, error: null });
    try {
      const result = await provider.connect();
      if (disposed || operation !== revision) return;
      const account = parseSolanaAccount(result && typeof result === "object" ? result.publicKey : provider.publicKey);
      if (!account) {
        publish({ status: "error", account: null, balances: null, observedAtMs: null, error: "A carteira não informou uma conta Solana válida." });
        return;
      }
      publish({ status: "connected", account, balances: null, observedAtMs: null, error: null });
      await read(operation, account);
    } catch (error) {
      if (disposed || operation !== revision) return;
      const code = error && typeof error === "object" ? (error as { code?: unknown }).code : null;
      publish({ status: "error", account: null, balances: null, observedAtMs: null, error: code === 4001 ? "A conexão Solana foi recusada no OKX." : "Não foi possível conectar à Solana pelo OKX." });
    }
  };

  const refresh = async () => {
    if (disposed || locallyDisconnected || !snapshot.account) return;
    const operation = ++revision;
    await read(operation, snapshot.account);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    connect,
    refresh,
    disconnect() {
      if (disposed) return;
      locallyDisconnected = true;
      revision++;
      publish({ status: "disconnected", account: null, balances: null, observedAtMs: null, error: "Sessão Solana encerrada neste painel. As permissões do OKX não foram alteradas." });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      const remove = provider.removeListener ?? provider.off;
      if (remove) {
        remove.call(provider, "accountChanged", handleAccountChanged);
        remove.call(provider, "disconnect", handleDisconnect);
      }
      listeners.clear();
    },
  };
}

/** Finds `okxwallet.solana` on the page without requesting access. */
export function discoverOkxSolanaProvider(surface: { okxwallet?: unknown }): OkxSolanaProvider | null {
  const wallet = surface.okxwallet;
  if (!wallet || typeof wallet !== "object") return null;
  const solana = (wallet as { solana?: unknown }).solana;
  return isOkxSolanaProvider(solana) ? solana : null;
}
