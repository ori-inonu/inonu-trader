/**
 * `address-tracker/trades` of the gateway (inonu-desktop-v1 T3.11, fase-2 A-08): the latest trades of wallets the platform tracks (smart money, the top 100 KOLs) or of up to 20 addresses
 * the person names, with filters on the trade (type, size, chain) and on the token it was made on (holders, market cap, liquidity). Read only, on a click.
 *
 * Whether this family is enabled for a key is NOT known (it is absent from the portal's list of rates, fase-2 A-08), so the tier is the higher one until T3.8 measures it, and a provider
 * refusal comes out of the gateway as the closed set of errors, never as a message. Decisions, the same rules as the catalog: provider numbers arrive as strings and a row whose required
 * field does not convert is dropped; a secondary number that cannot be read is null, never zero; the wallets of the trades are other people's and come shortened to first4...last4 to the
 * browser, whole only to the server process (`normalizeInternal`, the engine), as the signals and holders routes already do (SMT-4).
 *
 * The documentation lists five chains for the filter (Solana, Ethereum, BNB Chain, Base, X Layer); anything else is refused here instead of after the provider answered.
 * This file imports only types from the catalog (no import cycle).
 */
import type { Endpoint, Normalized, Params, Validation } from "../catalog";

type Rec = Record<string, unknown>;

const BAD: Validation = { ok: false, error: "bad_request" };
const CHAINS: ReadonlySet<string> = new Set(["501", "1", "56", "8453", "196"]);
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DECIMAL = /^(0|[1-9]\d{0,17})(\.\d{1,8})?$/;
const TX_HASH = /^[A-Za-z0-9]{1,128}$/;
const MAX_WALLETS = 20;
const MAX_ROWS = 100;
const STRIPPED = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

const rec = (v: unknown): Rec | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null);

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(STRIPPED, "").replace(/[\u2014\u2013]/g, "-").replace(/\u00b7/g, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s.length > max ? s.slice(0, max) : s;
}

const short = (address: string): string => (address.length > 8 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address);

function intIn(v: string | undefined, min: number, max: number): number | null {
  if (v === undefined || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

function allowed(params: Params, keys: readonly string[]): boolean {
  return Object.keys(params).every((k) => keys.includes(k));
}

const FILTERS = ["minVolume", "maxVolume", "minHolders", "minMarketCap", "maxMarketCap", "minLiquidity", "maxLiquidity"] as const;

/** The wallets of a multi address request: up to 20, each an EVM address (lower case: it has none) or a Solana one (as it is), each once. */
function walletsOf(raw: string): string | null {
  const parts = raw.split(",");
  if (parts.length < 1 || parts.length > MAX_WALLETS) return null;
  const out: string[] = [];
  for (const part of parts) {
    const a = part.trim();
    const clean = EVM_ADDRESS.test(a) ? a.toLowerCase() : SOLANA_ADDRESS.test(a) ? a : null;
    if (clean === null) return null;
    if (!out.includes(clean)) out.push(clean);
  }
  return out.join(",");
}

function normalizeTrades(data: unknown, whole: boolean): Normalized {
  if (data === null || (Array.isArray(data) && data.length === 0)) return { ok: true, data: [] };
  const holder = Array.isArray(data) ? rec(data[0]) : rec(data);
  if (holder === null) return { ok: false };
  if (holder.trades === undefined) return Object.keys(holder).length === 0 ? { ok: true, data: [] } : { ok: false };
  if (!Array.isArray(holder.trades)) return { ok: false };
  const rows: Rec[] = [];
  for (const item of holder.trades.slice(0, MAX_ROWS)) {
    const t = rec(item);
    if (t === null) continue;
    const chainIndex = typeof t.chainIndex === "string" && /^\d{1,12}$/.test(t.chainIndex) ? t.chainIndex : null;
    const txHash = typeof t.txHash === "string" && TX_HASH.test(t.txHash) ? t.txHash : null;
    const atMs = num(t.tradeTime);
    const side = t.tradeType === "1" || t.tradeType === 1 ? "buy" : t.tradeType === "2" || t.tradeType === 2 ? "sell" : null;
    if (chainIndex === null || txHash === null || atMs === null || atMs <= 0 || side === null) continue;
    const address = typeof t.walletAddress === "string" && /^[A-Za-z0-9]{1,128}$/.test(t.walletAddress) ? t.walletAddress : null;
    rows.push({
      chainIndex,
      txHash,
      [whole ? "wallet" : "walletShort"]: address === null ? null : whole ? address : short(address),
      tokenSymbol: text(t.tokenSymbol, 24),
      tokenAddress: typeof t.tokenContractAddress === "string" && t.tokenContractAddress !== "" ? t.tokenContractAddress : null,
      quoteSymbol: text(t.quoteTokenSymbol, 16),
      quoteAmount: num(t.quoteTokenAmount),
      priceUsd: num(t.tokenPrice),
      marketCapUsd: num(t.marketCap),
      realizedPnlUsd: num(t.realizedPnlUsd),
      side,
      atMs,
    });
  }
  return { ok: true, data: rows };
}

export const ADDRESS_TRACKER_ENDPOINTS: readonly Endpoint[] = [
  {
    // enabled or not for this key: unknown (fase-2 A-08); counted as the higher tier until T3.8 measures it
    id: "address-tracker-trades", route: "/onchain/address-tracker-trades", tier: "premium",
    validate: (p) => {
      if (!allowed(p, ["trackerType", "walletAddress", "tradeType", "chainIndex", ...FILTERS])) return BAD;
      const trackerType = intIn(p.trackerType, 1, 3);
      if (trackerType === null) return BAD;
      let wallets: string | null = null;
      if (trackerType === 3) {
        if (p.walletAddress === undefined) return BAD;
        wallets = walletsOf(p.walletAddress);
        if (wallets === null) return BAD;
      } else if (p.walletAddress !== undefined) {
        // the addresses mean something only for the third kind: a request that names them for another kind is a mistake, not something to ignore
        return BAD;
      }
      const tradeType = p.tradeType === undefined ? undefined : intIn(p.tradeType, 0, 2);
      if (tradeType === null) return BAD;
      if (p.chainIndex !== undefined && !CHAINS.has(p.chainIndex)) return BAD;
      const search = new URLSearchParams({ trackerType: String(trackerType) });
      if (wallets !== null) search.set("walletAddress", wallets);
      if (tradeType !== undefined) search.set("tradeType", String(tradeType));
      if (p.chainIndex !== undefined) search.set("chainIndex", p.chainIndex);
      for (const key of FILTERS) {
        const v = p[key];
        if (v === undefined) continue;
        if (!DECIMAL.test(v)) return BAD;
        search.set(key, v);
      }
      return { ok: true, request: { method: "GET", path: `/api/v6/dex/market/address-tracker/trades?${search.toString()}` }, ttlMs: 30_000 };
    },
    normalize: (data) => normalizeTrades(data, false),
    normalizeInternal: (data) => normalizeTrades(data, true),
  },
];
