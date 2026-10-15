/**
 * Read-only routes for the address the person connected (inonu-desktop-v1 T3.12 and T9.4, WAL-4): total value, token
 * balances, history, and the PnL family of the portfolio API. Nothing here signs, prepares or sends anything; every route
 * is a GET of data the provider already shows about a public address.
 *
 * This file is self contained on purpose: it imports TYPES from the catalog and nothing else, so the catalog can import
 * it without an import cycle (a cycle would leave WALLET_ENDPOINTS uninitialized when this file is loaded first).
 *
 * Decisions (the same rules as the catalog, doc §4): provider numbers arrive as strings; a row whose REQUIRED field does
 * not convert is dropped, never turned into zero; secondary fields become null. The address of the person is the INPUT
 * and is never echoed back. The counterparties of a transaction are other people's wallets: they are shortened to
 * first4...last4 like every other wallet the browser sees. Token valuation and balances both include risky tokens for
 * reconciliation. The provider uses different encodings for this filter on the two routes; each row keeps its risk flag.
 *
 * Tiers: the family table of wallet.md gives balance and history as Free, latest-pnl as Basic and overview and recent-pnl
 * as Premium. Whatever the portal does not publish is counted at the higher tier until T3.8 measures it.
 */
import type { Endpoint, Normalized, Params, Validation } from "../catalog";

type Rec = Record<string, unknown>;

const BAD: Validation = { ok: false, error: "bad_request" };
const DIGITS = /^\d{1,12}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TOKEN_ID = /^[A-Za-z0-9]{1,128}$/;
const CURSOR = /^[A-Za-z0-9._-]{1,128}$/;
const SOLANA_CHAIN = "501";
const MAX_CHAINS = 20;
const MAX_BALANCE_ROWS = 200;
const HISTORY_LIMIT = 20;
const STRIPPED = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

function rec(v: unknown): Rec | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function text(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** Strict numeric conversion: the provider writes unknown numbers as "" or "null", and those stay null. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Untrusted provider text: control and bidi characters out, the punctuation the desk forbids normalized, truncated. */
function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .replace(STRIPPED, "")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u00b7/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s === "") return null;
  return s.length > max ? s.slice(0, max) : s;
}

function short(address: unknown): string | null {
  const a = text(address);
  if (a === null) return null;
  return a.length > 8 ? `${a.slice(0, 4)}...${a.slice(-4)}` : a;
}

function allowed(params: Params, keys: readonly string[]): boolean {
  return Object.keys(params).every((k) => keys.includes(k));
}

function intIn(v: string | undefined, min: number, max: number): number | null {
  if (v === undefined || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

function get(path: string, query: Record<string, string | number | undefined>): { readonly method: "GET"; readonly path: string } {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) search.set(k, String(v));
  const qs = search.toString();
  return { method: "GET", path: qs ? `${path}?${qs}` : path };
}

/** Where an address lives: EVM addresses are case free and are lowercased in the provider path (one signed request per wallet); Solana ones are not. The gateway keys its cache on the raw parameters, so the browser reader sends lowercase too. */
function addressOf(raw: string | undefined): { readonly address: string; readonly family: "evm" | "solana" } | null {
  if (raw === undefined) return null;
  if (EVM_ADDRESS.test(raw)) return { address: raw.toLowerCase(), family: "evm" };
  if (SOLANA_ADDRESS.test(raw)) return { address: raw, family: "solana" };
  return null;
}

/** A comma list of network ids, deduplicated; a Solana address only goes with network 501 and an EVM one never does. */
function chainsOf(raw: string | undefined, family: "evm" | "solana"): string | null {
  if (raw === undefined || raw === "") return null;
  const ids = raw.split(",");
  if (ids.length > MAX_CHAINS || ids.some((c) => !DIGITS.test(c))) return null;
  const unique = [...new Set(ids)];
  if (family === "solana" ? unique.length !== 1 || unique[0] !== SOLANA_CHAIN : unique.includes(SOLANA_CHAIN)) return null;
  return unique.join(",");
}

/** One network for the single-network routes: the same family rule. */
function chainOf(raw: string | undefined, family: "evm" | "solana"): string | null {
  if (raw === undefined || !DIGITS.test(raw)) return null;
  return family === "solana" ? (raw === SOLANA_CHAIN ? raw : null) : raw === SOLANA_CHAIN ? null : raw;
}

/** The token of a token route: plain characters, with an EVM contract lowercased when the network is EVM. */
function tokenOf(raw: string | undefined, family: "evm" | "solana"): string | null {
  if (raw === undefined || !TOKEN_ID.test(raw)) return null;
  // a contract of an EVM network is 0x and 40 hex digits: anything else the provider would refuse after the gateway had accepted it
  if (family === "evm" && !EVM_ADDRESS.test(raw)) return null;
  return family === "evm" ? raw.toLowerCase() : raw;
}

const EMPTY: Normalized = { ok: true, data: null };
const emptyPayload = (data: unknown): boolean => data === null || (Array.isArray(data) && data.length === 0);

/* ---------- total value and balances ---------- */

function normalizeTotalValue(data: unknown): Normalized {
  if (emptyPayload(data)) return EMPTY;
  const first = rec(arr(data)[0]);
  const total = first === null ? null : num(first.totalValue);
  return total === null || total < 0 ? { ok: false } : { ok: true, data: { totalValueUsd: total } };
}

function normalizeBalances(data: unknown): Normalized {
  if (emptyPayload(data)) return { ok: true, data: { rows: [], total: 0 } };
  if (!Array.isArray(data)) return { ok: false };
  const rows: Array<{
    chainIndex: string; symbol: string; tokenAddress: string | null; balance: number; priceUsd: number | null; valueUsd: number | null; flaggedRisk: boolean | null;
  }> = [];
  let offered = 0;
  for (const entry of data) {
    const e = rec(entry);
    if (e === null) return { ok: false };
    for (const item of arr(e.tokenAssets)) {
      offered += 1;
      const a = rec(item);
      if (a === null) continue;
      const chainIndex = text(a.chainIndex);
      const symbol = clean(a.symbol, 24);
      const balance = num(a.balance);
      if (chainIndex === null || !DIGITS.test(chainIndex) || symbol === null || balance === null || balance < 0) continue;
      const price = num(a.tokenPrice);
      rows.push({
        chainIndex,
        symbol,
        tokenAddress: text(a.tokenContractAddress),
        balance,
        priceUsd: price !== null && price >= 0 ? price : null,
        valueUsd: price !== null && price >= 0 ? balance * price : null,
        flaggedRisk: typeof a.isRiskToken === "boolean" ? a.isRiskToken : null,
      });
    }
  }
  // rows were offered and not one could be read: the provider changed its shape, and that is an error, never an empty wallet
  if (offered > 0 && rows.length === 0) return { ok: false };
  // biggest first; a balance with no price sorts after every priced one instead of pretending to be zero
  rows.sort((x, y) => (y.valueUsd ?? -1) - (x.valueUsd ?? -1));
  return { ok: true, data: { rows: rows.slice(0, MAX_BALANCE_ROWS), total: rows.length } };
}

/* ---------- history ---------- */

const KIND = new Map<string, "native" | "internal" | "token">([["0", "native"], ["1", "internal"], ["2", "token"]]);
const STATUS = new Set(["success", "fail", "pending"]);

function normalizeHistory(data: unknown): Normalized {
  if (emptyPayload(data)) return { ok: true, data: { cursor: null, rows: [] } };
  const first = rec(arr(data)[0]);
  if (first === null) return { ok: false };
  const rows = arr(first.transactions)
    .map(rec)
    .filter((t): t is Rec => t !== null)
    .map((t) => {
      const chainIndex = text(t.chainIndex);
      const txHash = text(t.txHash);
      const atMs = num(t.txTime);
      if (chainIndex === null || !DIGITS.test(chainIndex) || txHash === null || !TOKEN_ID.test(txHash) || atMs === null) return null;
      const status = text(t.txStatus);
      return {
        chainIndex,
        txHash,
        atMs,
        kind: KIND.get(text(t.itype) ?? "") ?? null,
        symbol: clean(t.symbol, 24),
        amount: num(t.amount),
        tokenAddress: text(t.tokenContractAddress),
        status: status !== null && STATUS.has(status) ? status : null,
        feeNative: num(t.txFee),
        from: short(rec(arr(t.from)[0])?.address),
        to: short(rec(arr(t.to)[0])?.address),
        flaggedByProvider: t.hitBlacklist === true,
      };
    })
    .filter((r) => r !== null);
  return { ok: true, data: { cursor: text(first.cursor), rows } };
}

/* ---------- PnL family ---------- */

function normalizeTokenPnl(data: unknown): Normalized {
  const first = Array.isArray(data) ? rec(data[0]) : rec(data);
  if (first === null) return emptyPayload(data) ? EMPTY : { ok: false };
  if (typeof first.isPnlSupported !== "boolean") return { ok: false };
  // a network or token the provider does not compute PnL for answers zeros: zero is not "no profit", it is "not computed"
  const supported = first.isPnlSupported;
  const n = (v: unknown): number | null => (supported ? num(v) : null);
  return {
    ok: true,
    data: {
      supported,
      realizedUsd: n(first.realizedPnlUsd),
      unrealizedUsd: n(first.unrealizedPnlUsd),
      totalUsd: n(first.totalPnlUsd),
      realizedPct: n(first.realizedPnlPercent),
      unrealizedPct: n(first.unrealizedPnlPercent),
      totalPct: n(first.totalPnlPercent),
    },
  };
}

function normalizeOverview(data: unknown): Normalized {
  const first = Array.isArray(data) ? rec(data[0]) : rec(data);
  if (first === null) return emptyPayload(data) ? EMPTY : { ok: false };
  return {
    ok: true,
    data: {
      winRatePct: num(first.winRate),
      realizedPnlUsd: num(first.realizedPnlUsd),
      buyCount: num(first.buyTxCount),
      sellCount: num(first.sellTxCount),
      buyVolumeUsd: num(first.buyTxVolume),
      sellVolumeUsd: num(first.sellTxVolume),
      avgBuyValueUsd: num(first.avgBuyValueUsd),
      top3PnlTokenPercent: num(first.top3PnlTokenPercent),
    },
  };
}

function normalizeRecentPnl(data: unknown): Normalized {
  const first = Array.isArray(data) ? rec(data[0]) : rec(data);
  if (first === null) return emptyPayload(data) ? { ok: true, data: { cursor: null, rows: [] } } : { ok: false };
  const rows = arr(first.pnlList)
    .map(rec)
    .filter((r): r is Rec => r !== null)
    .map((r) => {
      const chainIndex = text(r.chainIndex);
      const symbol = clean(r.tokenSymbol, 24);
      if (chainIndex === null || !DIGITS.test(chainIndex) || symbol === null) return null;
      return {
        chainIndex,
        symbol,
        tokenAddress: text(r.tokenContractAddress),
        balanceAmount: num(r.tokenBalanceAmount),
        balanceUsd: num(r.tokenBalanceUsd),
        realizedUsd: num(r.realizedPnlUsd),
        unrealizedUsd: num(r.unrealizedPnlUsd),
        totalUsd: num(r.totalPnlUsd),
        totalPct: num(r.totalPnlPercent),
        positionPct: num(r.tokenPositionPercent),
        lastActiveMs: num(r.lastActiveTimestamp),
      };
    })
    .filter((r) => r !== null);
  return { ok: true, data: { cursor: text(first.cursor), rows } };
}

/* ---------- the routes ---------- */

export const WALLET_ENDPOINTS: readonly Endpoint[] = [
  {
    id: "wallet-value", route: "/onchain/wallet-value", tier: "free",
    validate: (p) => {
      if (!allowed(p, ["address", "chains", "assetType"])) return BAD;
      const who = addressOf(p.address);
      const chains = who === null ? null : chainsOf(p.chains, who.family);
      const assetType = p.assetType === undefined ? 1 : intIn(p.assetType, 0, 2);
      if (who === null || chains === null || assetType === null) return BAD;
      return { ok: true, request: get("/api/v6/dex/balance/total-value-by-address", { address: who.address, chains, assetType, excludeRiskToken: "false" }), ttlMs: 60_000 };
    },
    normalize: normalizeTotalValue,
  },
  {
    id: "wallet-balances", route: "/onchain/wallet-balances", tier: "free",
    validate: (p) => {
      if (!allowed(p, ["address", "chains"])) return BAD;
      const who = addressOf(p.address);
      const chains = who === null ? null : chainsOf(p.chains, who.family);
      if (who === null || chains === null) return BAD;
      return { ok: true, request: get("/api/v6/dex/balance/all-token-balances-by-address", { address: who.address, chains, excludeRiskToken: "1" }), ttlMs: 30_000 };
    },
    normalize: normalizeBalances,
  },
  {
    id: "wallet-history", route: "/onchain/wallet-history", tier: "free",
    validate: (p) => {
      if (!allowed(p, ["address", "chains", "token", "cursor", "limit"])) return BAD;
      const who = addressOf(p.address);
      if (who === null) return BAD;
      const chains = p.chains === undefined ? undefined : chainsOf(p.chains, who.family);
      const token = p.token === undefined ? undefined : tokenOf(p.token, who.family);
      const limit = p.limit === undefined ? HISTORY_LIMIT : intIn(p.limit, 1, HISTORY_LIMIT);
      if (chains === null || token === null || limit === null) return BAD;
      if (p.cursor !== undefined && !CURSOR.test(p.cursor)) return BAD;
      // a token filter without the network it lives on is ambiguous: the provider needs the network to read it
      if (token !== undefined && (chains === undefined || chains.includes(","))) return BAD;
      return {
        ok: true,
        request: get("/api/v6/dex/post-transaction/transactions-by-address", { address: who.address, chains, tokenContractAddress: token, cursor: p.cursor, limit }),
        ttlMs: 120_000,
      };
    },
    normalize: normalizeHistory,
  },
  {
    id: "wallet-token-pnl", route: "/onchain/wallet-token-pnl", tier: "basic",
    validate: (p) => {
      if (!allowed(p, ["address", "chainIndex", "token"])) return BAD;
      const who = addressOf(p.address);
      const chain = who === null ? null : chainOf(p.chainIndex, who.family);
      const token = who === null ? null : tokenOf(p.token, who.family);
      if (who === null || chain === null || token === null) return BAD;
      return {
        ok: true,
        request: get("/api/v6/dex/market/portfolio/token/latest-pnl", { chainIndex: chain, walletAddress: who.address, tokenContractAddress: token }),
        ttlMs: 300_000,
      };
    },
    normalize: normalizeTokenPnl,
  },
  {
    // tier not published: counted as Premium until T3.8 measures it
    id: "wallet-overview", route: "/onchain/wallet-overview", tier: "premium",
    validate: (p) => {
      if (!allowed(p, ["address", "chainIndex", "timeFrame"])) return BAD;
      const who = addressOf(p.address);
      const chain = who === null ? null : chainOf(p.chainIndex, who.family);
      const timeFrame = intIn(p.timeFrame, 1, 5);
      if (who === null || chain === null || timeFrame === null) return BAD;
      return {
        ok: true,
        request: get("/api/v6/dex/market/portfolio/overview", { chainIndex: chain, walletAddress: who.address, timeFrame }),
        ttlMs: 600_000,
      };
    },
    normalize: normalizeOverview,
  },
  {
    // tier not published: counted as Premium until T3.8 measures it
    id: "wallet-pnl", route: "/onchain/wallet-pnl", tier: "premium",
    validate: (p) => {
      if (!allowed(p, ["address", "chainIndex", "cursor", "limit"])) return BAD;
      const who = addressOf(p.address);
      const chain = who === null ? null : chainOf(p.chainIndex, who.family);
      const limit = p.limit === undefined ? undefined : intIn(p.limit, 1, 100);
      if (who === null || chain === null || limit === null) return BAD;
      if (p.cursor !== undefined && !CURSOR.test(p.cursor)) return BAD;
      return {
        ok: true,
        request: get("/api/v6/dex/market/portfolio/recent-pnl", { chainIndex: chain, walletAddress: who.address, cursor: p.cursor, limit }),
        ttlMs: 300_000,
      };
    },
    normalize: normalizeRecentPnl,
  },
];
