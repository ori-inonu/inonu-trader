/**
 * The list of networks the OKX wallet APIs know, with their own logo (inonu-desktop-v1 CHN-1, ICO-2, T3.5): `balance/supported/chain`, free, valid for a day.
 * It is what lets the desk list EVERY network of the ecosystem by name and draw each one with its own mark, instead of a short fixed list and letters.
 *
 * Only types come from the catalog (no import cycle). The logo is a URL that this process fetches itself (see src/inonu/chain-icons.ts): the browser never
 * contacts the host, and a URL that is not https on a host of the provider's own is dropped here already, so nothing downstream ever sees one.
 */
import type { Endpoint, Normalized } from "../catalog";

type Rec = Record<string, unknown>;

/** The hosts the provider keeps its logos on. Anything else is dropped (null), never fetched. */
export const LOGO_HOSTS: ReadonlySet<string> = new Set(["static.coinall.ltd", "static.okx.com", "static.oklink.com"]);

const DIGITS = /^\d{1,12}$/;
const MAX_ROWS = 200;
const STRIPPED = /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;

const rec = (v: unknown): Rec | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null);

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(STRIPPED, "").replace(/[\u2014\u2013]/g, "-").replace(/\u00b7/g, " ").replace(/\s+/g, " ").trim();
  return s === "" ? null : s.length > max ? s.slice(0, max) : s;
}

/** An https URL on a host of the list, with no credentials and no odd port, or null. */
export function allowedLogoUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || !LOGO_HOSTS.has(url.hostname)) return null;
  return url.href;
}

function normalizeNetworks(data: unknown): Normalized {
  if (data === null || (Array.isArray(data) && data.length === 0)) return { ok: true, data: [] };
  if (!Array.isArray(data)) return { ok: false };
  const rows: Array<{ chainIndex: string; name: string; symbol: string | null; logoUrl: string | null }> = [];
  const seen = new Set<string>();
  for (const item of data) {
    const r = rec(item);
    if (r === null) continue;
    // the lists of the provider spell the same fields in more than one way
    const chainIndex = typeof r.chainIndex === "string" ? r.chainIndex : null;
    const name = clean(r.name ?? r.chainName, 40);
    if (chainIndex === null || !DIGITS.test(chainIndex) || name === null || seen.has(chainIndex)) continue;
    seen.add(chainIndex);
    rows.push({ chainIndex, name, symbol: clean(r.shortName ?? r.chainSymbol, 12), logoUrl: allowedLogoUrl(r.logoUrl ?? r.chainLogo ?? r.chainLogoUrl) });
    if (rows.length === MAX_ROWS) break;
  }
  return { ok: true, data: rows };
}

export const CHAIN_LIST_ENDPOINTS: readonly Endpoint[] = [
  {
    id: "networks", route: "/onchain/networks", tier: "free",
    validate: (p) =>
      Object.keys(p).length === 0
        ? { ok: true, request: { method: "GET", path: "/api/v6/dex/balance/supported/chain" }, ttlMs: 24 * 3_600_000 }
        : { ok: false, error: "bad_request" },
    normalize: normalizeNetworks,
  },
];
