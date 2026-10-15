import type { ReceiptStatus } from "../agent/receipt";
import type { ReceiptLookup } from "../agent/reconcile";

export interface SolanaReceiptEvidence {
  readonly status: ReceiptStatus;
  readonly slot: number;
  readonly feeLamports: string | null;
  readonly nativeDeltaLamports: string | null;
  readonly tokenDeltas: readonly { readonly mint: string; readonly decimals: number; readonly deltaMinor: string }[] | null;
  /** Optional audit detail. Total transaction fee and fee charged to this wallet differ when another signer pays. */
  readonly walletFeeLamports?: string | null;
  readonly blockTimeMs?: number | null;
  /** Only the token accounts mentioned in this transaction, never a complete wallet inventory. */
  readonly affectedTokenBalances?: readonly { readonly mint: string; readonly decimals: number; readonly beforeMinor: string; readonly afterMinor: string; readonly coverage: "transaction_accounts" }[] | null;
}

const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const sig = (v: unknown): v is string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(v);
const address = (v: unknown): v is string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const uint = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function affectedBalances(meta: Record<string, unknown>, wallet: string, keyCount: number): SolanaReceiptEvidence["affectedTokenBalances"] {
  if (!Array.isArray(meta.preTokenBalances) || !Array.isArray(meta.postTokenBalances)) return null;
  const accounts = new Map<number, { owner: string; mint: string; decimals: number }>();
  const totals = new Map<string, { mint: string; decimals: number; before: bigint; after: bigint }>();
  for (const [rows, side] of [[meta.preTokenBalances, "before"], [meta.postTokenBalances, "after"]] as const) {
    const seen = new Set<number>();
    for (const raw of rows) {
      const b = obj(raw), a = obj(b?.uiTokenAmount);
      if (!uint(b?.accountIndex) || b.accountIndex >= keyCount || seen.has(b.accountIndex) || !address(b.owner) || !address(b.mint) || !uint(a?.decimals) || a.decimals > 255 || typeof a.amount !== "string" || !/^\d{1,20}$/.test(a.amount)) return null;
      const amount = BigInt(a.amount); if (amount > 18446744073709551615n) return null;
      seen.add(b.accountIndex);
      const previous = accounts.get(b.accountIndex);
      if (previous && (previous.owner !== b.owner || previous.mint !== b.mint || previous.decimals !== a.decimals)) return null;
      accounts.set(b.accountIndex, { owner: b.owner, mint: b.mint, decimals: a.decimals });
      if (b.owner !== wallet) continue;
      const total = totals.get(b.mint) ?? { mint: b.mint, decimals: a.decimals, before: 0n, after: 0n };
      if (total.decimals !== a.decimals) return null;
      total[side] += amount; totals.set(b.mint, total);
    }
  }
  return [...totals.values()].map(t => ({ mint: t.mint, decimals: t.decimals, beforeMinor: t.before.toString(), afterMinor: t.after.toString(), coverage: "transaction_accounts" as const }));
}

/** A final transaction is evidence only for its exact signature and actual signer. Missing data never means failure or zero. */
export function solanaReceiptEvidence(raw: unknown, binding: { readonly signature: string; readonly wallet: string; readonly slot: number }): SolanaReceiptEvidence | null {
  const r = obj(raw), transaction = obj(r?.transaction), meta = obj(r?.meta), message = obj(transaction?.message);
  if (!sig(binding.signature) || !address(binding.wallet) || !uint(binding.slot) || r?.slot !== binding.slot || transaction === null || meta === null || !Object.hasOwn(meta, "err") || !Array.isArray(transaction.signatures) || transaction.signatures[0] !== binding.signature || !Array.isArray(message?.accountKeys)) return null;
  const keys = message.accountKeys.map(obj);
  const walletAt = keys.findIndex(k => k?.pubkey === binding.wallet && k.signer === true);
  if (walletAt < 0) return null;
  const feeLamports = uint(meta.fee) ? String(meta.fee) : null;
  const walletFeeLamports = feeLamports === null || !address(keys[0]?.pubkey) ? null : keys[0]?.pubkey === binding.wallet ? feeLamports : "0";
  const blockTimeMs = uint(r.blockTime) && Number.isSafeInteger(r.blockTime * 1000) ? r.blockTime * 1000 : null;
  const pre = Array.isArray(meta.preBalances) ? meta.preBalances[walletAt] : undefined;
  const post = Array.isArray(meta.postBalances) ? meta.postBalances[walletAt] : undefined;
  const nativeDeltaLamports = uint(pre) && uint(post) ? (BigInt(post) - BigInt(pre)).toString() : null;
  const deltas = new Map<string, { mint: string; decimals: number; delta: bigint }>();
  let tokenBalancesKnown = false;
  // When token balances are unavailable no fill is invented. Native lamport movement is not all called a fee (rent/transfers may be present).
  if (Array.isArray(meta.preTokenBalances) && Array.isArray(meta.postTokenBalances)) {
    tokenBalancesKnown = [...meta.preTokenBalances, ...meta.postTokenBalances].every(item => typeof obj(item)?.owner === "string");
    for (const [rows, factor] of [[meta.preTokenBalances, -1n], [meta.postTokenBalances, 1n]] as const) {
      for (const item of rows) {
        const b = obj(item), amount = obj(b?.uiTokenAmount);
        if (b?.owner !== binding.wallet) continue;
        if (!address(b.mint) || !uint(amount?.decimals) || amount.decimals > 255 || typeof amount.amount !== "string" || !/^\d{1,32}$/.test(amount.amount)) return null;
        const rawAmount = BigInt(amount.amount);
        if (rawAmount > 18446744073709551615n) return null;
        const before = deltas.get(b.mint);
        if (before !== undefined && before.decimals !== amount.decimals) return null;
        deltas.set(b.mint, { mint: b.mint, decimals: amount.decimals, delta: (before?.delta ?? 0n) + factor * rawAmount });
      }
    }
  }
  return { status: meta.err === null ? "success" : "failed", slot: binding.slot, feeLamports, nativeDeltaLamports,
    walletFeeLamports, blockTimeMs, affectedTokenBalances: affectedBalances(meta, binding.wallet, keys.length),
    tokenDeltas: tokenBalancesKnown ? [...deltas.values()].filter(d => d.delta !== 0n).map(d => ({ mint: d.mint, decimals: d.decimals, deltaMinor: d.delta.toString() })) : null };
}

/** Read-only public RPC fallback for an existing Solana signature. It has no signing or sendTransaction method. */
export function createSolanaReceiptReader(options: { readonly fetch: typeof fetch; readonly timeoutMs?: number }) {
  // Chain 501 in this adapter is the official mainnet endpoint. Another cluster/provider requires explicit chain qualification.
  const rpcUrl = "https://api.mainnet-beta.solana.com";
  return async (binding: { readonly signature: string; readonly wallet: string }, signal: AbortSignal): Promise<SolanaReceiptEvidence | null> => {
    if (!sig(binding.signature) || !address(binding.wallet) || signal.aborted) return null;
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs ?? 8000)]);
    const call = async (id: number, method: "getSignatureStatuses" | "getTransaction", params: unknown[]) => {
      const response = await options.fetch(rpcUrl, { method: "POST", redirect: "error", signal: requestSignal,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
      if (!response.ok) throw new Error("solana_rpc_unavailable");
      const text = await response.text(); if (text.length > 1_000_000) throw new Error("solana_rpc_too_large");
      const envelope = obj(JSON.parse(text));
      if (envelope?.jsonrpc !== "2.0" || envelope.id !== id || envelope.error !== undefined) throw new Error("solana_rpc_invalid_response");
      return envelope.result;
    };
    try {
      const result = obj(await call(1, "getSignatureStatuses", [[binding.signature], { searchTransactionHistory: true }]));
      if (!Array.isArray(result?.value) || result.value.length !== 1) return null;
      const status = obj(result.value[0]);
      if (status === null || !uint(status.slot)) return null;
      // A not-yet-final status remains pending, including a processed error that might disappear with a fork.
      if (status.confirmationStatus === "processed" || status.confirmationStatus === "confirmed") return { status: "pending", slot: status.slot, feeLamports: null, nativeDeltaLamports: null, tokenDeltas: null };
      if (status.confirmationStatus !== "finalized") return null;
      const tx = await call(2, "getTransaction", [binding.signature, { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 }]);
      const evidence = solanaReceiptEvidence(tx, { ...binding, slot: status.slot });
      if (evidence === null || !Object.hasOwn(status, "err") || (status.err === null) !== (evidence.status === "success")) return null;
      return evidence;
    } catch { return null; }
  };
}

/** Reuse an exact-hash lookup when its provider is down or behind. The caller retains the existing journal and settlement rules. */
export function withSolanaReceiptFallback(primary: ReceiptLookup, read: ReturnType<typeof createSolanaReceiptReader>, walletOf: () => string | null): ReceiptLookup {
  return async (order, signal) => {
    let status: ReceiptStatus | null = null;
    try { status = await primary(order, signal); } catch { /* unknown, not a transaction failure */ }
    if (status === "success" || status === "failed" || signal.aborted || order.chainIndex !== "501" || !sig(order.ref)) return status;
    const wallet = walletOf(); if (!address(wallet)) return status;
    const evidence = await read({ signature: order.ref, wallet }, signal);
    return evidence?.status ?? status;
  };
}

/* ---------------------------------------------------------------- the transaction of an order that never carried a reference */

/** What an order says about the transaction it made, for the cases where the signing tool refused after the broadcast and printed no signature. */
export interface SolanaOrderQuery {
  readonly wallet: string;
  /** The order was written at this time: a transaction before it (less a minute of clock) is not its. */
  readonly sinceMs: number;
  readonly side: "buy" | "sell";
  readonly mint: string;
  /** What a sale gives up, in the token's smallest unit; null for a purchase (its size is in dollars). */
  readonly amountMinor: string | null;
  readonly usd: number;
}

const SOLANA_STABLES: ReadonlySet<string> = new Set(["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]);

/**
 * Whether a final, successful transaction of the wallet is the swap of this order: a sale took exactly (within half a percent) the order's amount of its token out and something came in; a purchase brought its token in
 * for about the dollars of stablecoin that went out. Anything the transaction does not say (a balance that could not be read) is no match. Pure.
 */
export function swapMatches(evidence: SolanaReceiptEvidence, q: SolanaOrderQuery): boolean {
  if (evidence.status !== "success" || evidence.tokenDeltas === null) return false;
  const mine = evidence.tokenDeltas.find((d) => d.mint === q.mint);
  if (mine === undefined) return false;
  const delta = BigInt(mine.deltaMinor);
  if (q.side === "sell") {
    if (q.amountMinor === null || !/^\d{1,32}$/.test(q.amountMinor)) return false;
    const amount = BigInt(q.amountMinor);
    if (amount <= 0n || delta >= 0n) return false;
    const left = -delta;
    const gap = left > amount ? left - amount : amount - left;
    if (gap * 1000n > amount * 5n) return false;
    return evidence.tokenDeltas.some((d) => d.mint !== q.mint && BigInt(d.deltaMinor) > 0n) || (evidence.nativeDeltaLamports !== null && BigInt(evidence.nativeDeltaLamports) > 0n);
  }
  if (delta <= 0n || !Number.isFinite(q.usd) || q.usd <= 0) return false;
  return evidence.tokenDeltas.some((d) => {
    if (!SOLANA_STABLES.has(d.mint) || BigInt(d.deltaMinor) >= 0n) return false;
    const spent = Number(-BigInt(d.deltaMinor)) / 10 ** d.decimals;
    return spent >= q.usd * 0.85 && spent <= q.usd * 1.15;
  });
}

/**
 * Read-only: the one recent transaction of the wallet that is the swap of this order, when the tool said no after broadcasting and kept no signature. It lists the wallet's latest finalized signatures, reads those
 * made after the order, and answers only when exactly one of them moved what the order moved (`swapMatches`); two that fit, or none, or any failure, is null. It has no method that signs or sends.
 */
export function createSolanaSwapFinder(options: { readonly fetch: typeof fetch; readonly timeoutMs?: number }) {
  const rpcUrl = "https://api.mainnet-beta.solana.com";
  return async (q: SolanaOrderQuery, signal: AbortSignal): Promise<{ readonly signature: string; readonly evidence: SolanaReceiptEvidence } | null> => {
    if (!address(q.wallet) || !address(q.mint) || !Number.isFinite(q.sinceMs) || signal.aborted) return null;
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs ?? 12_000)]);
    let next = 0;
    const call = async (method: "getSignaturesForAddress" | "getTransaction", params: unknown[]) => {
      const id = ++next;
      const response = await options.fetch(rpcUrl, { method: "POST", redirect: "error", signal: requestSignal, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
      if (!response.ok) throw new Error("solana_rpc_unavailable");
      const text = await response.text();
      if (text.length > 1_000_000) throw new Error("solana_rpc_too_large");
      const envelope = obj(JSON.parse(text));
      if (envelope?.jsonrpc !== "2.0" || envelope.id !== id || envelope.error !== undefined) throw new Error("solana_rpc_invalid_response");
      return envelope.result;
    };
    try {
      const list = await call("getSignaturesForAddress", [q.wallet, { limit: 20, commitment: "finalized" }]);
      if (!Array.isArray(list)) return null;
      const entries = list.map(obj);
      // A successful signature with an unknown time may belong to this window.
      // Skipping it cannot establish that another signature is the unique match.
      if (entries.some(e => e === null || !sig(e.signature) || !uint(e.slot) || !Object.hasOwn(e, "err") || (e.err === null && !uint(e.blockTime)))) return null;
      // A full page that has not reached an older timestamp may hide another
      // candidate beyond the page, even when most listed transactions failed.
      if (entries.length >= 20 && !entries.some(e => uint(e!.blockTime) && e!.blockTime * 1000 < q.sinceMs - 60_000)) return null;
      const recent = (entries as Record<string, unknown>[])
        .filter(e => e.err === null && (e.blockTime as number) * 1000 >= q.sinceMs - 60_000);
      // Bound RPC work without silently discarding a possible second match.
      if (recent.length > 8) return null;
      const matches: { signature: string; evidence: SolanaReceiptEvidence }[] = [];
      for (const entry of recent) {
        const tx = await call("getTransaction", [entry.signature, { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 0 }]);
        const evidence = solanaReceiptEvidence(tx, { signature: entry.signature as string, wallet: q.wallet, slot: entry.slot as number });
        if (evidence === null || evidence.status !== "success" || evidence.tokenDeltas === null || evidence.nativeDeltaLamports === null) return null;
        if (swapMatches(evidence, q)) matches.push({ signature: entry.signature as string, evidence });
      }
      return matches.length === 1 ? matches[0]! : null;
    } catch {
      return null;
    }
  };
}
