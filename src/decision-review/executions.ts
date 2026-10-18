import type { SolanaReceiptEvidence } from "../server/solana-receipts";

const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_:./@-]{1,500}$/.test(v);
const address = (v: unknown): v is string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const signature = (v: unknown): v is string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(v);
const uint = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const minor = (v: unknown): v is string => typeof v === "string" && /^-?(0|[1-9]\d{0,79})$/.test(v) && v !== "-0";
const unsigned = (v: unknown): v is string => minor(v) && !v.startsWith("-");
const digest = (v: unknown) => new Bun.CryptoHasher("sha256").update(JSON.stringify(v)).digest("hex");
export const RECEIPT_ADAPTER = "solana-mainnet-finalized-accounts-v1";

export interface AuditOrder {
  orderKey: string; cycleId: string; atMs: number; stage: string; chainIndex: string; wallet: "agente" | "principal";
  address: string; side: "buy" | "sell"; source: "modelo" | "protecao"; amountMinor: string | null;
  balanceBeforeMinor: string | null; signature: string | null; issue: string | null;
}
export interface OrderSelection { orders: AuditOrder[]; invalidOrderRows: number }

/** Group by durable order key, never symbol. Earlier references are considered only within that same order. */
export function selectOrders(rows: readonly unknown[], walletKind: "agente" | "principal"): OrderSelection {
  const grouped = new Map<string, { order: AuditOrder; identity: string; refs: Set<string> }>();
  let invalidOrderRows = 0;
  for (const raw of rows) {
    const r = obj(raw); if (r?.kind !== "order") continue;
    if (!code(r.orderKey) || !code(r.cycleId) || !uint(r.atMs) || !["preparada", "enviando", "executada", "falhou", "incerta"].includes(r.stage as string) ||
      typeof r.chainIndex !== "string" || !address(r.address) || (r.wallet !== "agente" && r.wallet !== "principal") || (r.side !== "buy" && r.side !== "sell") || (r.source !== "modelo" && r.source !== "protecao") ||
      !(r.ref === null || typeof r.ref === "string") || !(r.amountMinor === null || unsigned(r.amountMinor)) || !(r.balanceBeforeMinor === undefined || r.balanceBeforeMinor === null || unsigned(r.balanceBeforeMinor))) { invalidOrderRows++; continue; }
    const identity = JSON.stringify([r.cycleId, r.chainIndex, r.address, r.wallet, r.side, r.source, r.amountMinor, r.balanceBeforeMinor ?? null]);
    const previous = grouped.get(r.orderKey);
    const order: AuditOrder = { orderKey: r.orderKey, cycleId: r.cycleId, atMs: Math.min(r.atMs, previous?.order.atMs ?? r.atMs), stage: r.stage as string,
      chainIndex: r.chainIndex, wallet: r.wallet, address: r.address, side: r.side, source: r.source, amountMinor: r.amountMinor as string | null,
      balanceBeforeMinor: r.balanceBeforeMinor as string | null ?? null, signature: null,
      issue: previous?.identity !== undefined && previous.identity !== identity ? "order_identity_conflict" : previous?.order.issue ?? null };
    const refs = previous?.refs ?? new Set<string>(); if (signature(r.ref)) refs.add(r.ref);
    grouped.set(order.orderKey, { order, identity, refs });
  }
  const owners = new Map<string, Set<string>>();
  for (const { order, refs } of grouped.values()) for (const ref of refs) { const keys = owners.get(ref) ?? new Set(); keys.add(order.orderKey); owners.set(ref, keys); }
  for (const { order, refs } of grouped.values()) {
    order.signature = refs.size === 1 ? [...refs][0]! : null;
    order.issue ??= order.chainIndex !== "501" ? "unsupported_chain" : order.wallet !== walletKind ? "not_managed_wallet" : refs.size > 1 ? "multiple_signatures_for_order" :
      [...refs].some(ref => owners.get(ref)!.size > 1) ? "signature_shared_by_orders" : refs.size === 0 ? "no_recorded_signature" : null;
  }
  return { orders: [...grouped.values()].map(x => x.order), invalidOrderRows };
}

function decimalMinor(value: string, decimals: number): string {
  const negative = value.startsWith("-"); const digits = negative ? value.slice(1) : value;
  if (decimals === 0) return value;
  const padded = digits.padStart(decimals + 1, "0");
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return (negative ? "-" : "") + padded.slice(0, -decimals) + (fraction ? "." + fraction : "");
}

interface Cash { mint: string; decimals: number; deltaMinor: string; amount: string }
interface Fill { mint: string; decimals: number; deltaMinor: string; beforeAffectedMinor: string; afterAffectedMinor: string; scope: "transaction_accounts" }
export interface ExecutionAudit {
  orderKey: string; cycleId: string; atMs: number; side: "buy" | "sell"; source: "modelo" | "protecao";
  mint: string; signature: string | null; status: string; stage: string; issue: string | null;
  slot: number | null; blockTimeMs: number | null; fill: Fill | null; cash: Cash | null;
  walletFeeLamports: string | null; nativeDeltaLamports: string | null; nativeExcludingNetworkFeeLamports: string | null;
  outcome: "unattributed" | "bought_unmatched" | "sale_without_matched_entry" | "round_trip_component";
  netUsd: null;
}
interface RoundTrip {
  buyOrderKey: string; sellOrderKey: string; mint: string; quantityMinor: string; quoteMint: string; quoteDecimals: number;
  cashFlowMinor: string; cashFlow: string; walletFeeLamports: string | null; nativeDeltaLamports: string | null;
  nativeExcludingNetworkFeeLamports: string | null; basis: "ledger_zero_before_buy"; scope: "matched_agent_orders"; netUsd: null;
}
const plusKnown = (a: string | null, b: string | null) => a !== null && b !== null ? (BigInt(a) + BigInt(b)).toString() : null;

/** Receipt cash movements are real; interpreting them as whole-wallet profit would require independent inventory and cost basis. */
export function auditExecutions(selection: OrderSelection, evidence: ReadonlyMap<string, SolanaReceiptEvidence>, completeLedger: boolean): { orders: ExecutionAudit[]; roundTrips: RoundTrip[] } {
  const orders: ExecutionAudit[] = selection.orders.map(o => {
    const e = o.issue === null ? evidence.get(o.orderKey) : undefined;
    const fee = e?.walletFeeLamports ?? null, native = e?.nativeDeltaLamports ?? null;
    let fill: Fill | null = null, cash: Cash | null = null, issue = o.issue;
    if (e?.status === "success" && e.tokenDeltas !== null && e.affectedTokenBalances != null) {
      const changes = e.tokenDeltas.filter(d => BigInt(d.deltaMinor) !== 0n);
      const mine = changes.find(d => d.mint === o.address), other = changes.filter(d => d.mint !== o.address);
      const balances = e.affectedTokenBalances.find(d => d.mint === o.address);
      const quoteBalance = other.length === 1 ? e.affectedTokenBalances.find(d => d.mint === other[0]!.mint) : undefined;
      const delta = mine === undefined ? 0n : BigInt(mine.deltaMinor);
      if (mine && balances && quoteBalance && balances.decimals === mine.decimals && other.length === 1 && quoteBalance.decimals === other[0]!.decimals &&
        BigInt(balances.afterMinor) - BigInt(balances.beforeMinor) === delta && BigInt(quoteBalance.afterMinor) - BigInt(quoteBalance.beforeMinor) === BigInt(other[0]!.deltaMinor) &&
        (o.side === "buy" ? delta > 0n && BigInt(other[0]!.deltaMinor) < 0n : delta < 0n && BigInt(other[0]!.deltaMinor) > 0n && o.amountMinor !== null && -delta === BigInt(o.amountMinor))) {
        fill = { mint: mine.mint, decimals: mine.decimals, deltaMinor: mine.deltaMinor, beforeAffectedMinor: balances.beforeMinor, afterAffectedMinor: balances.afterMinor, scope: "transaction_accounts" };
        cash = { mint: other[0]!.mint, decimals: other[0]!.decimals, deltaMinor: other[0]!.deltaMinor, amount: decimalMinor(other[0]!.deltaMinor, other[0]!.decimals) };
      } else issue ??= "movement_not_an_exact_two_token_fill";
    } else if (e?.status === "success") issue ??= "token_account_proof_unavailable";
    if (!e && issue === null) issue = "receipt_unavailable";
    return { orderKey: o.orderKey, cycleId: o.cycleId, atMs: o.atMs, side: o.side, source: o.source, mint: o.address, signature: o.signature,
      stage: o.stage, status: e?.status ?? "unknown", issue, slot: e?.slot ?? null, blockTimeMs: e?.blockTimeMs ?? null, fill, cash,
      walletFeeLamports: fee, nativeDeltaLamports: native, nativeExcludingNetworkFeeLamports: plusKnown(native, fee),
      outcome: fill === null ? "unattributed" : o.side === "buy" ? "bought_unmatched" : "sale_without_matched_entry", netUsd: null };
  });
  const roundTrips: RoundTrip[] = [];
  if (!completeLedger || selection.invalidOrderRows > 0) return { orders, roundTrips };
  // Only a complete recorded entry and exit of one lot are paired. Partial fills and missing basis stay unpaired.
  const chronological = orders.toSorted((a, b) => a.atMs - b.atMs);
  const entries = new Map<string, ExecutionAudit>();
  for (const o of chronological) {
    const original = selection.orders.find(r => r.orderKey === o.orderKey)!;
    const entry = entries.get(o.mint);
    // An unresolved or unrelated intervening operation on that same asset destroys the simple one-lot attribution.
    if (o.stage === "preparada" && o.signature === null) continue;
    if (o.side === "buy" && o.fill && o.cash && original.balanceBeforeMinor === "0" && o.fill.beforeAffectedMinor === "0" && o.blockTimeMs !== null) { entries.set(o.mint, o); continue; }
    entries.delete(o.mint);
    if (!entry?.fill || !entry.cash || !o.fill || !o.cash || o.side !== "sell" || o.blockTimeMs === null || entry.blockTimeMs === null || o.blockTimeMs < entry.blockTimeMs || o.slot === null || entry.slot === null || o.slot <= entry.slot ||
      o.fill.decimals !== entry.fill.decimals || BigInt(o.fill.deltaMinor) !== -BigInt(entry.fill.deltaMinor) || o.fill.afterAffectedMinor !== "0" || o.cash.mint !== entry.cash.mint || o.cash.decimals !== entry.cash.decimals || original.balanceBeforeMinor !== entry.fill.deltaMinor) continue;
    const cashFlowMinor = plusKnown(entry.cash.deltaMinor, o.cash.deltaMinor)!;
    const walletFeeLamports = plusKnown(entry.walletFeeLamports, o.walletFeeLamports), nativeDeltaLamports = plusKnown(entry.nativeDeltaLamports, o.nativeDeltaLamports);
    roundTrips.push({ buyOrderKey: entry.orderKey, sellOrderKey: o.orderKey, mint: o.mint, quantityMinor: entry.fill.deltaMinor,
      quoteMint: o.cash.mint, quoteDecimals: o.cash.decimals, cashFlowMinor, cashFlow: decimalMinor(cashFlowMinor, o.cash.decimals),
      walletFeeLamports, nativeDeltaLamports, nativeExcludingNetworkFeeLamports: plusKnown(nativeDeltaLamports, walletFeeLamports), basis: "ledger_zero_before_buy", scope: "matched_agent_orders", netUsd: null });
    entry.outcome = "round_trip_component"; o.outcome = "round_trip_component";
  }
  return { orders, roundTrips };
}

export interface ReceiptCacheEntry { wallet: string; signature: string; checkedAtMs: number; evidence: SolanaReceiptEvidence | null }
export interface ReceiptCache { version: 1; adapter: typeof RECEIPT_ADAPTER; entries: Record<string, ReceiptCacheEntry> }
export const emptyReceiptCache = (): ReceiptCache => ({ version: 1, adapter: RECEIPT_ADAPTER, entries: {} });
export const receiptCacheKey = (wallet: string, signature: string) => digest([RECEIPT_ADAPTER, wallet, signature]);

function validEvidence(raw: unknown): raw is SolanaReceiptEvidence {
  const e = obj(raw);
  if (!e || !["success", "failed", "pending"].includes(e.status as string) || !uint(e.slot) || !(e.feeLamports === null || unsigned(e.feeLamports)) || !(e.nativeDeltaLamports === null || minor(e.nativeDeltaLamports))) return false;
  if (!(e.walletFeeLamports === undefined || e.walletFeeLamports === null || unsigned(e.walletFeeLamports)) || !(e.blockTimeMs === undefined || e.blockTimeMs === null || uint(e.blockTimeMs))) return false;
  const validList = (v: unknown, detailed: boolean) => v === null || (Array.isArray(v) && v.length <= 256 && new Set(v.map(x => obj(x)?.mint)).size === v.length && v.every(x => {
    const d = obj(x); return d !== null && address(d.mint) && uint(d.decimals) && d.decimals <= 255 && (detailed ? unsigned(d.beforeMinor) && unsigned(d.afterMinor) && d.coverage === "transaction_accounts" : minor(d.deltaMinor));
  }));
  return validList(e.tokenDeltas, false) && (e.affectedTokenBalances === undefined || validList(e.affectedTokenBalances, true));
}
export function parseReceiptCache(raw: unknown): ReceiptCache | null {
  const r = obj(raw), entries = obj(r?.entries);
  if (r?.version !== 1 || r.adapter !== RECEIPT_ADAPTER || entries === null || Object.keys(entries).length > 2000) return null;
  for (const [key, rawEntry] of Object.entries(entries)) {
    const e = obj(rawEntry);
    if (!e || !address(e.wallet) || !signature(e.signature) || receiptCacheKey(e.wallet, e.signature) !== key || !uint(e.checkedAtMs) || !(e.evidence === null || validEvidence(e.evidence))) return null;
  }
  return raw as ReceiptCache;
}

/** At most four exact-hash lookups, two read-only RPC requests each. Old unqueried orders cannot starve behind a pending latest one. */
export async function refreshReceiptCache(orders: readonly AuditOrder[], wallet: string, saved: ReceiptCache,
  read: (binding: { wallet: string; signature: string }, signal: AbortSignal) => Promise<SolanaReceiptEvidence | null>, nowMs: number, maxLookups = 4): Promise<{ cache: ReceiptCache; evidence: Map<string, SolanaReceiptEvidence>; lookups: number }> {
  const cache: ReceiptCache = { ...saved, entries: { ...saved.entries } };
  const eligible = orders.filter(o => o.issue === null && o.signature !== null);
  let lookups = 0;
  const limit = Math.min(4, Math.max(0, Math.trunc(maxLookups)));
  const candidates = eligible.toSorted((a, b) => (cache.entries[receiptCacheKey(wallet, a.signature!)]?.checkedAtMs ?? 0) - (cache.entries[receiptCacheKey(wallet, b.signature!)]?.checkedAtMs ?? 0) || b.atMs - a.atMs);
  for (const order of candidates) {
    const key = receiptCacheKey(wallet, order.signature!), previous = cache.entries[key];
    const e = previous?.evidence;
    const complete = e?.status === "failed" ? e.walletFeeLamports != null && e.nativeDeltaLamports !== null : e?.status === "success" && e.affectedTokenBalances != null && e.tokenDeltas !== null && e.walletFeeLamports != null && e.nativeDeltaLamports !== null;
    if (complete || (previous && previous.checkedAtMs <= nowMs && nowMs - previous.checkedAtMs < 60_000) || lookups >= limit) continue;
    lookups++;
    let result: SolanaReceiptEvidence | null = null;
    try { result = await read({ wallet, signature: order.signature! }, AbortSignal.timeout(9000)); } catch { /* unknown is not failure */ }
    cache.entries[key] = { wallet, signature: order.signature!, checkedAtMs: nowMs, evidence: result !== null && validEvidence(result) ? result : null };
  }
  const evidence = new Map<string, SolanaReceiptEvidence>();
  for (const o of eligible) { const e = cache.entries[receiptCacheKey(wallet, o.signature!)]?.evidence; if (e) evidence.set(o.orderKey, e); }
  cache.entries = Object.fromEntries(Object.entries(cache.entries).sort((a, b) => b[1].checkedAtMs - a[1].checkedAtMs).slice(0, 2000));
  return { cache, evidence, lookups };
}
