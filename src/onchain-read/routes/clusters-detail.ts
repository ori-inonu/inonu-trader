/**
 * `cluster/list` of the gateway (inonu-desktop-v1 T3.10, fase-2 F2-OCX-5): the groups of addresses that move together among the top 300 holders of a token, up to 100 groups, each with what
 * it holds, whether it is buying or selling, what it paid and what it made. It is the biggest payload of the family and it is read only on a click (Premium, valid for 15 minutes).
 *
 * Decisions, the same rules as the catalog: the provider writes every number as a string and the literal word "null" for the unknown (a row that cannot be read is dropped, a number that
 * cannot be read is null, never zero). Two things the documentation leaves open were read live on 2026-10-13 and are passed through untouched, with their reading written here:
 * `holdingPercent` is a FRACTION (0.10284 for a group holding 10.28% of the supply of BONK), and `averageHoldingPeriod` is an epoch moment in seconds (1768447365 is January 2026), not a
 * duration, which is why it keeps the provider's name instead of being called a period of time. The addresses of the wallets of a group are other
 * people's: the browser gets them shortened to first4...last4 and at most `BROWSER_ADDRESSES` per group; the server process alone (`normalizeInternal`) gets them whole, for the engine.
 *
 * The documentation names the list `clustList` in the table and `clusterList` in the example, and wraps it in an object; both spellings and an array wrapper are read.
 * This file imports only types from the catalog (no import cycle).
 */
import { normalizeTokenAddress } from "../../okx-market/token-identity";
import type { Endpoint, Normalized, Params, Validation } from "../catalog";

type Rec = Record<string, unknown>;

const BAD: Validation = { ok: false, error: "bad_request" };
const DIGITS = /^\d{1,12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const TREND = /^[A-Za-z]{1,16}$/;
const MAX_GROUPS = 100;
const MAX_ADDRESSES_INTERNAL = 300;
const BROWSER_ADDRESSES = 5;

const rec = (v: unknown): Rec | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * A timestamp the provider writes as "0" when it does not know: zero is "not known", not 1970. Read live on 2026-10-13: `lastActiveTimestamp` is in SECONDS (1791912423 was six hours
 * old), while the rest of this gateway speaks milliseconds, so a value that small is converted and one that already has thirteen digits is kept.
 */
function moment(v: unknown): number | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return n < 1e11 ? n * 1000 : n;
}

const short = (address: string): string => (address.length > 8 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address);
const ADDRESS = /^[A-Za-z0-9]{1,128}$/;
/** What a token of any chain may look like, and the one shape an EVM contract has (the chains whose own addresses start with 0x and are longer are Sui and Aptos). */
const TOKEN_SHAPE = /^[A-Za-z0-9_:.-]{1,128}$/;
const EVM_CONTRACT = /^0x[0-9a-fA-F]{40}$/;
const LONG_0X_CHAINS: ReadonlySet<string> = new Set(["784", "637"]);

function allowed(params: Params, keys: readonly string[]): boolean {
  return Object.keys(params).every((k) => keys.includes(k));
}

function wallet(v: unknown, whole: boolean): Rec | null {
  const r = rec(v);
  if (r === null) return null;
  const address = typeof r.address === "string" && ADDRESS.test(r.address) ? r.address : null;
  if (address === null) return null;
  return {
    [whole ? "address" : "wallet"]: whole ? address : short(address),
    holdingAmount: num(r.holdingAmount),
    holdingUsd: num(r.holdingValueUsd),
    holdingPct: num(r.holdingPercent),
    avgHoldingPeriod: num(r.averageHoldingPeriod),
    lastActiveMs: moment(r.lastActiveTimestamp),
    rank: num(r.addressRank),
    // an unknown flag stays unknown: a missing answer is never "not an exchange"
    isContract: typeof r.isContract === "boolean" ? r.isContract : null,
    isExchange: typeof r.isExchange === "boolean" ? r.isExchange : null,
    isKol: typeof r.isKol === "boolean" ? r.isKol : null,
  };
}

function normalizeList(data: unknown, whole: boolean): Normalized {
  if (data === null || (Array.isArray(data) && data.length === 0)) return { ok: true, data: [] };
  const holder = Array.isArray(data) ? rec(data[0]) : rec(data);
  if (holder === null) return { ok: false };
  const raw = holder.clusterList ?? holder.clustList;
  // an object that does not hold the list at all is a contract change, not an empty token
  if (raw === undefined) return Object.keys(holder).length === 0 ? { ok: true, data: [] } : { ok: false };
  if (!Array.isArray(raw)) return { ok: false };
  const groups: Rec[] = [];
  let wallets = 0;
  for (const item of raw.slice(0, MAX_GROUPS)) {
    const g = rec(item);
    if (g === null) continue;
    const holdingAmount = num(g.holdingAmount);
    const holdingUsd = num(g.holdingValueUsd);
    // a group with neither an amount nor a value says nothing a person can use
    if (holdingAmount === null && holdingUsd === null) continue;
    const members: Rec[] = [];
    const cap = whole ? Math.max(0, MAX_ADDRESSES_INTERNAL - wallets) : BROWSER_ADDRESSES;
    const list = arr(g.clusterAddressList);
    for (const w of list) {
      if (members.length >= cap) break;
      const row = wallet(w, whole);
      if (row !== null) members.push(row);
    }
    wallets += members.length;
    groups.push({
      holdingAmount,
      holdingUsd,
      holdingPct: num(g.holdingPercent),
      trend: arr(g.trendType).filter((t): t is string => typeof t === "string" && TREND.test(t)).slice(0, 6),
      avgHoldingPeriod: num(g.averageHoldingPeriod),
      pnlUsd: num(g.pnlUsd),
      pnlPct: num(g.pnlPercent),
      buyVolumeUsd: num(g.buyVolume),
      avgBuyPriceUsd: num(g.averageBuyPriceUsd),
      sellVolumeUsd: num(g.sellVolume),
      avgSellPriceUsd: num(g.averageSellPriceUsd),
      lastActiveMs: moment(g.lastActiveTimestamp),
      addressCount: list.length,
      members,
    });
  }
  return { ok: true, data: groups };
}

export const CLUSTER_DETAIL_ENDPOINTS: readonly Endpoint[] = [
  {
    // Premium and valid for 15 minutes, as the fase-2 table says; the real tier is measured by T3.8
    id: "cluster-list", route: "/onchain/cluster-list", tier: "premium",
    validate: (p) => {
      if (!allowed(p, ["chainIndex", "token"]) || p.chainIndex === undefined || p.token === undefined || !DIGITS.test(p.chainIndex)) return BAD;
      if (p.token === "" || p.token.length > 128 || CONTROL.test(p.token) || !TOKEN_SHAPE.test(p.token)) return BAD;
      // a contract that starts with 0x on an EVM chain is 0x and 40 hex digits: anything else the provider would refuse after the gateway had accepted it
      if (/^0x/i.test(p.token) && !LONG_0X_CHAINS.has(p.chainIndex) && !EVM_CONTRACT.test(p.token)) return BAD;
      const token = normalizeTokenAddress(p.chainIndex, p.token);
      const search = new URLSearchParams({ chainIndex: p.chainIndex, tokenContractAddress: token });
      return { ok: true, request: { method: "GET", path: `/api/v6/dex/market/token/cluster/list?${search.toString()}` }, ttlMs: 900_000 };
    },
    normalize: (data) => normalizeList(data, false),
    normalizeInternal: (data) => normalizeList(data, true),
  },
];
