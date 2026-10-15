/**
 * `memepump/tokenList` of the gateway (inonu-desktop-v1 RAS-2 and T8.2, the Memepump family "sob demanda" of the coverage matrix): the launches of a chain at one stage of their life, new on the
 * launch curve, about to migrate, or already migrated to a DEX, each with its market (cap, volume and trades of the last hour), how far along the launch curve it is, and what the holders
 * look like (top 10, developer, insiders, bundlers, snipers, fresh and suspected phishing wallets). Read only, on a click, at most 30 tokens per answer.
 *
 * The code DESCRIBES: it carries the facts a person weighs before putting money in a launch, and says nothing about what to do. Decisions, the same rules as the catalog: provider numbers
 * arrive as strings; a row whose required field does not convert is dropped; a number that cannot be read is null, never zero. Image and social URLs are never forwarded (only whether a
 * link exists), and the wallet of the user is never asked for: `walletAddress`, which would add the user's own position to the answer, is not a parameter of this route.
 *
 * What the live answer of 2026-10-13 taught, and the documentation does not say: `data` is the LIST of tokens itself (the page wraps it in `{cursor, items}`), the address of the token is
 * `tokenAddress` (the page says `tokenContractAddress`), and every percentage is a PERCENT from 0 to 100 (`top10HoldingsPercent` was "50.1642", `bondingPercent` "0.41"). Both
 * spellings and both wrappers are read.
 *
 * This file imports only types from the catalog (no import cycle).
 */
import type { Endpoint, Normalized, Params, Validation } from "../catalog";

type Rec = Record<string, unknown>;

const BAD: Validation = { ok: false, error: "bad_request" };
const DIGITS = /^\d{1,12}$/;
const STAGES: ReadonlySet<string> = new Set(["NEW", "MIGRATING", "MIGRATED"]);
const PERCENT = /^(100(\.0{1,4})?|[1-9]?\d(\.\d{1,4})?)$/;
const DECIMAL = /^(0|[1-9]\d{0,17})(\.\d{1,8})?$/;
const WHOLE = /^\d{1,9}$/;
const ADDRESS = /^[A-Za-z0-9]{1,128}$/;
const STRIPPED = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const MAX_ROWS = 30;

/** Filters on a percent (0 to 100), on an amount in dollars, and on a count: each name is the provider's own. */
const PERCENT_FILTERS = [
  "minTop10HoldingsPercent", "maxTop10HoldingsPercent", "minDevHoldingsPercent", "maxDevHoldingsPercent", "minInsidersPercent", "maxInsidersPercent", "minBundlersPercent", "maxBundlersPercent",
  "minSnipersPercent", "maxSnipersPercent", "minFreshWalletsPercent", "maxFreshWalletsPercent", "minBondingPercent", "maxBondingPercent",
] as const;
const AMOUNT_FILTERS = ["minMarketCapUsd", "maxMarketCapUsd", "minVolumeUsd", "maxVolumeUsd"] as const;
const COUNT_FILTERS = ["minHolders", "maxHolders", "minTokenAge", "maxTokenAge", "minTxCount", "maxTxCount", "minBuyTxCount", "maxBuyTxCount", "minSellTxCount", "maxSellTxCount"] as const;

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

/** A link exists when the provider gave one: the address itself is never forwarded. */
const hasLink = (v: unknown): boolean | null => (v === undefined || v === null ? null : typeof v === "string" && v.trim() !== "");

function normalize(data: unknown): Normalized {
  if (data === null || (Array.isArray(data) && data.length === 0)) return { ok: true, data: [] };
  // the live answer is the list itself; the page wraps it in an object (or an array holding that object)
  const first = Array.isArray(data) ? rec(data[0]) : null;
  const wrapped = Array.isArray(data) ? (first !== null && first.items !== undefined ? first : null) : rec(data);
  let items: unknown;
  if (wrapped !== null) {
    if (wrapped.items === undefined) return Object.keys(wrapped).length === 0 ? { ok: true, data: [] } : { ok: false };
    items = wrapped.items;
  } else {
    items = data;
  }
  if (!Array.isArray(items)) return { ok: false };
  const rows: Rec[] = [];
  for (const item of items.slice(0, MAX_ROWS)) {
    const t = rec(item);
    if (t === null) continue;
    const chainIndex = typeof t.chainIndex === "string" && DIGITS.test(t.chainIndex) ? t.chainIndex : null;
    const rawAddress = t.tokenAddress ?? t.tokenContractAddress;
    const address = typeof rawAddress === "string" && ADDRESS.test(rawAddress) ? rawAddress : null;
    const symbol = text(t.symbol, 24);
    if (chainIndex === null || address === null || symbol === null) continue;
    const market = rec(t.market) ?? {};
    const tags = rec(t.tags) ?? {};
    const social = rec(t.social) ?? {};
    const created = num(t.createdTimestamp);
    rows.push({
      chainIndex,
      protocolId: typeof t.protocolId === "string" && DIGITS.test(t.protocolId) ? t.protocolId : null,
      address,
      symbol,
      name: text(t.name, 40),
      createdMs: created !== null && created > 0 ? created : null,
      marketCapUsd: num(market.marketCapUsd),
      volume1hUsd: num(market.volumeUsd1h),
      txCount1h: num(market.txCount1h),
      buyTx1h: num(market.buyTxCount1h),
      sellTx1h: num(market.sellTxCount1h),
      bondingPct: num(t.bondingPercent),
      // percentages of 0 to 100, as read live (50.1642 is fifty percent)
      top10: num(tags.top10HoldingsPercent),
      dev: num(tags.devHoldingsPercent),
      insiders: num(tags.insidersPercent),
      bundlers: num(tags.bundlersPercent),
      snipers: num(tags.snipersPercent),
      freshWallets: num(tags.freshWalletsPercent),
      phishing: num(tags.suspectedPhishingWalletPercent),
      holders: num(tags.totalHolders),
      hasX: hasLink(social.x),
      hasTelegram: hasLink(social.telegram),
      hasWebsite: hasLink(social.website),
      dexScreenerPaid: typeof social.dexScreenerPaid === "boolean" ? social.dexScreenerPaid : null,
      communityTakeover: typeof social.communityTakeover === "boolean" ? social.communityTakeover : null,
      liveOnPumpFun: typeof social.liveOnPumpFun === "boolean" ? social.liveOnPumpFun : null,
      aped: num(t.aped),
    });
  }
  return { ok: true, data: rows };
}

function allowed(params: Params, keys: readonly string[]): boolean {
  return Object.keys(params).every((k) => keys.includes(k));
}

export const MEMEPUMP_ENDPOINTS: readonly Endpoint[] = [
  {
    // the family is "sob demanda" in the coverage matrix; its charge layer is not published, so it is counted as the higher one until T3.8 measures it
    id: "memepump-list", route: "/onchain/memepump-list", tier: "premium",
    validate: (p) => {
      if (!allowed(p, ["chainIndex", "stage", "protocolIdList", ...PERCENT_FILTERS, ...AMOUNT_FILTERS, ...COUNT_FILTERS])) return BAD;
      if (p.chainIndex === undefined || !DIGITS.test(p.chainIndex) || p.stage === undefined || !STAGES.has(p.stage)) return BAD;
      const search = new URLSearchParams({ chainIndex: p.chainIndex, stage: p.stage });
      if (p.protocolIdList !== undefined) {
        const ids = p.protocolIdList.split(",");
        if (ids.length < 1 || ids.length > 10 || ids.some((id) => !DIGITS.test(id))) return BAD;
        search.set("protocolIdList", [...new Set(ids)].join(","));
      }
      const take = (keys: readonly string[], pattern: RegExp): boolean => {
        for (const key of keys) {
          const v = p[key];
          if (v === undefined) continue;
          if (!pattern.test(v)) return false;
          search.set(key, v);
        }
        return true;
      };
      if (!take(PERCENT_FILTERS, PERCENT) || !take(AMOUNT_FILTERS, DECIMAL) || !take(COUNT_FILTERS, WHOLE)) return BAD;
      return { ok: true, request: { method: "GET", path: `/api/v6/dex/market/memepump/tokenList?${search.toString()}` }, ttlMs: 30_000 };
    },
    normalize,
  },
];
