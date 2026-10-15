// T9.4, WAL-4, AC-WAL-3: the reader of what the connected address holds. It only reads the three routes of the local gateway, checks again what comes back, and
// never turns a missing number into zero. origin: synthetic_fixture, tests only (the shapes are the ones src/onchain-read/routes/wallet.ts answers).
import { describe, expect, test } from "bun:test";
import {
  ageText, amountText, checkedParams, checkedResultParams, countText, createHoldingsReader, holdingsErrorText, parseBalances, parseHistory, parseOverview, parsePnl, parseValue,
  parseNetworks, pctText, readingAgeMs, TIME_FRAMES, usdText,
  type HoldingsError,
} from "./holdings";

const ADDRESS = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";
const meta = (ageMs = 0) => ({ tier: "free" as const, cachedAtMs: 1, ageMs, stale: false, budget: { tier: "free" as const, used: 1, cap: null } });
const balanceRow = (over: Record<string, unknown> = {}) => ({ chainIndex: "1", symbol: "ETH", tokenAddress: null, balance: 0.5, priceUsd: 3000, valueUsd: 1500, flaggedRisk: false, ...over });
const historyRow = (over: Record<string, unknown> = {}) => ({
  chainIndex: "1", txHash: "0xabc123", atMs: 1_700_000_000_000, kind: "token", symbol: "USDC", amount: 12.5, tokenAddress: "0xaaa", status: "success", feeNative: null,
  from: "0x11...0000", to: "0xAb...Ef01", flaggedByProvider: false, ...over,
});

interface Seen { url: string; init: RequestInit | undefined }
function fakeFetch(respond: (url: string) => { status?: number; body?: unknown; throws?: boolean; text?: string }) {
  const seen: Seen[] = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    seen.push({ url, init });
    const r = respond(url);
    if (r.throws) throw new Error("down");
    return new Response(r.text ?? JSON.stringify(r.body ?? null), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { seen, fetch };
}
const ok = (data: unknown, m = meta()) => ({ body: { ok: true, data, meta: m } });
const params = { address: ADDRESS, chains: ["1", "8453"] };

describe("the request", () => {
  test("valuation explicitly asks for tokens on the same selected networks as balances", async () => {
    const f = fakeFetch(() => ok(null));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    await reader.value(params);
    await reader.balances(params);
    const value = new URL(f.seen[0]!.url);
    const balances = new URL(f.seen[1]!.url);
    expect(value.searchParams.get("assetType")).toBe("1");
    expect(value.searchParams.get("chains")).toBe(balances.searchParams.get("chains"));
    expect(value.searchParams.get("address")).toBe(balances.searchParams.get("address"));
  });

  test("the address leaves in lower case, the networks once each, with the intent of a click and no credentials", async () => {
    const f = fakeFetch(() => ok({ rows: [], total: 0 }));
    await createHoldingsReader({ base: "http://x", fetch: f.fetch }).balances({ address: ADDRESS, chains: ["1", "8453", "1"] });
    expect(f.seen.length).toBe(1);
    expect(f.seen[0]!.url).toBe(`http://x/onchain/wallet-balances?address=${ADDRESS.toLowerCase()}&chains=1%2C8453`);
    expect(f.seen[0]!.init).toMatchObject({ method: "GET", credentials: "omit", headers: { "x-inonu-intent": "user" } });
  });

  test("the history asks for at most 20 rows and the value asks for no more than the other two", async () => {
    const f = fakeFetch(() => ok(null));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    await reader.history(params);
    await reader.value(params);
    expect(f.seen[0]!.url).toContain("/onchain/wallet-history?");
    expect(f.seen[0]!.url).toContain("limit=20");
    expect(f.seen[1]!.url).toContain("/onchain/wallet-value?");
    expect(f.seen[1]!.url).not.toContain("limit");
  });

  test("a request the gateway would refuse never leaves", async () => {
    const f = fakeFetch(() => ok({ rows: [], total: 0 }));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    const many = Array.from({ length: 21 }, (_, i) => String(i + 1));
    for (const bad of [
      { address: "0x123", chains: ["1"] }, { address: `${ADDRESS}&x=1`, chains: ["1"] }, { address: ADDRESS, chains: [] }, { address: ADDRESS, chains: many },
      { address: ADDRESS, chains: ["1;2"] }, { address: ADDRESS, chains: ["a"] }, { address: "", chains: ["1"] },
    ]) {
      expect(await reader.balances(bad)).toEqual({ ok: false, error: "bad_request" });
      expect(await reader.value(bad)).toEqual({ ok: false, error: "bad_request" });
      expect(await reader.history(bad)).toEqual({ ok: false, error: "bad_request" });
    }
    expect(f.seen.length).toBe(0);
    expect(checkedParams({ address: ADDRESS, chains: ["1", "1"] })).toEqual({ address: ADDRESS.toLowerCase(), chains: ["1"] });
  });
});

describe("what comes back", () => {
  test("balances: the rows, the total and the age", async () => {
    const f = fakeFetch(() => ok({ rows: [balanceRow(), balanceRow({ chainIndex: "8453", symbol: "USDC", tokenAddress: "0xa0b8", balance: 37.19, priceUsd: null, valueUsd: null, flaggedRisk: true })], total: 5 }, meta(4000)));
    const r = await createHoldingsReader({ base: "http://x", fetch: f.fetch }).balances(params);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.total).toBe(5);
      expect(r.data.rows[1]).toMatchObject({ symbol: "USDC", priceUsd: null, valueUsd: null, flaggedRisk: true });
      expect(r.meta.ageMs).toBe(4000);
    }
  });

  test("balances preserve an unknown provider risk mark alongside explicit true and false", async () => {
    const f = fakeFetch(() => ok({ rows: [
      balanceRow({ symbol: "UNKNOWN", flaggedRisk: null }),
      balanceRow({ symbol: "FLAGGED", flaggedRisk: true }),
      balanceRow({ symbol: "UNFLAGGED", flaggedRisk: false }),
    ], total: 3 }));
    const r = await createHoldingsReader({ base: "http://x", fetch: f.fetch }).balances(params);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.rows.map((row) => row.flaggedRisk)).toEqual([null, true, false]);
  });

  test("a row about a network that was not asked is a contract error, whole", async () => {
    const f = fakeFetch(() => ok({ rows: [balanceRow(), balanceRow({ chainIndex: "56" })], total: 2 }));
    expect(await createHoldingsReader({ base: "http://x", fetch: f.fetch }).balances(params)).toEqual({ ok: false, error: "schema" });
  });

  test("a payload that is null is no data, not an error and not zero", async () => {
    const f = fakeFetch(() => ok(null));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    expect(await reader.value(params)).toEqual({ ok: false, error: "sem_dados" });
    expect(await reader.balances(params)).toEqual({ ok: false, error: "sem_dados" });
  });

  test("an empty list of balances is an answer: the wallet holds nothing on these networks", async () => {
    const f = fakeFetch(() => ok({ rows: [], total: 0 }));
    const r = await createHoldingsReader({ base: "http://x", fetch: f.fetch }).balances(params);
    expect(r.ok && r.data.rows.length === 0).toBe(true);
  });

  test("the value", async () => {
    const f = fakeFetch(() => ok({ totalValueUsd: 1234.5 }));
    const r = await createHoldingsReader({ base: "http://x", fetch: f.fetch }).value(params);
    expect(r.ok && r.data.totalValueUsd).toBe(1234.5);
  });
});

describe("errors of the transport and of the gateway", () => {
  const read = (respond: Parameters<typeof fakeFetch>[0]) => createHoldingsReader({ base: "http://x", fetch: fakeFetch(respond).fetch }).balances(params);

  test("no connection, an old server (404 without an envelope) and a refused origin (403)", async () => {
    expect(await createHoldingsReader({ base: "http://x", fetch: fakeFetch(() => ({ throws: true })).fetch }).balances(params)).toEqual({ ok: false, error: "network" });
    expect(await read(() => ({ status: 404, text: "<html>not found</html>" }))).toEqual({ ok: false, error: "backend_stale" });
    expect(await read(() => ({ status: 404, body: { ok: false, error: "not_found" } }))).toEqual({ ok: false, error: "backend_stale" });
    expect(await read(() => ({ status: 403, text: "no" }))).toEqual({ ok: false, error: "origin_denied" });
  });

  test("a code of the gateway passes through, one that is not known is a contract error", async () => {
    expect(await read(() => ({ status: 429, body: { ok: false, error: "rate_limited" } }))).toEqual({ ok: false, error: "rate_limited" });
    expect(await read(() => ({ status: 200, body: { ok: false, error: "budget_exhausted" } }))).toEqual({ ok: false, error: "budget_exhausted" });
    expect(await read(() => ({ status: 500, body: { ok: false, error: "made_up" } }))).toEqual({ ok: false, error: "schema" });
  });

  test("a good looking body under an error status, a body that is not an envelope, or no age, is a contract error", async () => {
    expect(await read(() => ({ status: 500, body: { ok: true, data: { rows: [], total: 0 }, meta: meta() } }))).toEqual({ ok: false, error: "schema" });
    expect(await read(() => ({ body: { rows: [] } }))).toEqual({ ok: false, error: "schema" });
    expect(await read(() => ({ body: { ok: true, data: { rows: [], total: 0 } } }))).toEqual({ ok: false, error: "schema" });
    expect(await read(() => ({ text: "not json" }))).toEqual({ ok: false, error: "schema" });
  });

  test("every error has a sentence of its own, with no accent and no dash", () => {
    const all: HoldingsError[] = ["network", "backend_stale", "origin_denied", "sem_dados", "no_credentials", "incomplete_credentials", "budget_exhausted", "pace_limited", "rate_limited",
      "provider_unauthorized", "provider_payment_required", "provider_error", "schema", "unsupported_chain", "clock_skew", "bad_request"];
    const texts = all.map(holdingsErrorText);
    expect(new Set(texts).size).toBe(all.length);
    for (const t of texts) {
      expect(t).not.toMatch(/[^\x20-\x7e]/);
      expect(t.length).toBeGreaterThan(10);
    }
  });
});

describe("the strict parsers", () => {
  const asked = ["1"];

  test("balances: any row that is not exactly the shape drops the whole answer", () => {
    expect(parseBalances({ rows: [balanceRow()], total: 1 }, asked)?.rows.length).toBe(1);
    const bad: Array<Record<string, unknown>> = [
      { symbol: "" }, { symbol: 7 }, { balance: -1 }, { balance: "1" }, { balance: Number.NaN }, { priceUsd: "3" }, { valueUsd: -2 }, { flaggedRisk: "no" }, { tokenAddress: 5 },
      { chainIndex: 1 }, { symbol: "A".repeat(25) }, { symbol: "A\nB" },
    ];
    for (const over of bad) expect(parseBalances({ rows: [balanceRow(over)], total: 1 }, asked)).toBeNull();
    expect(parseBalances({ rows: ["x"], total: 1 }, asked)).toBeNull();
    expect(parseBalances({ rows: [], total: -1 }, asked)).toBeNull();
    expect(parseBalances({ rows: [balanceRow()], total: 0 }, asked)).toBeNull();
    expect(parseBalances({ rows: [] }, asked)).toBeNull();
    expect(parseBalances(null, asked)).toBeNull();
  });

  test("history: kinds and statuses are the three the route gives, a hash is plain characters", () => {
    expect(parseHistory({ cursor: "123", rows: [historyRow()] }, asked)?.rows[0]).toMatchObject({ kind: "token", status: "success", from: "0x11...0000" });
    expect(parseHistory({ cursor: null, rows: [historyRow({ kind: null, status: null })] }, asked)?.rows.length).toBe(1);
    const bad: Array<Record<string, unknown>> = [
      { kind: "other" }, { status: "ok" }, { txHash: "has space" }, { txHash: "" }, { atMs: "1" }, { atMs: Number.POSITIVE_INFINITY }, { amount: "1" }, { flaggedByProvider: 1 }, { chainIndex: "56" },
    ];
    for (const over of bad) expect(parseHistory({ cursor: null, rows: [historyRow(over)] }, asked)).toBeNull();
    expect(parseHistory({ cursor: 5, rows: [] }, asked)).toBeNull();
    expect(parseHistory({ rows: "x" }, asked)).toBeNull();
  });

  test("value: a number of zero or more", () => {
    expect(parseValue({ totalValueUsd: 0 })).toEqual({ totalValueUsd: 0 });
    for (const bad of [{ totalValueUsd: -1 }, { totalValueUsd: "1" }, {}, null, []]) expect(parseValue(bad)).toBeNull();
  });
});

const overviewRaw = (over: Record<string, unknown> = {}) => ({
  winRatePct: 50, realizedPnlUsd: 120.5, buyCount: 10, sellCount: 4, buyVolumeUsd: 502.3, sellVolumeUsd: 300, avgBuyValueUsd: 50.2, top3PnlTokenPercent: 12, ...over,
});
const pnlRowRaw = (over: Record<string, unknown> = {}) => ({
  chainIndex: "1", symbol: "GREG", tokenAddress: "0x7666", balanceAmount: 1000, balanceUsd: 59.3, realizedUsd: 0, unrealizedUsd: -15.9, totalUsd: -15.9, totalPct: -20.99, positionPct: 100,
  lastActiveMs: 1_700_000_000_000, ...over,
});

describe("the result routes", () => {
  test("the overview asks for one network and one window, and the pnl for one network and at most 20 rows", async () => {
    const f = fakeFetch((url) => (url.includes("wallet-overview") ? ok(overviewRaw(), meta(0)) : ok({ cursor: null, rows: [pnlRowRaw()] })));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    const o = await reader.overview({ address: ADDRESS, chainIndex: "1", timeFrame: 4 });
    const p = await reader.pnl({ address: ADDRESS, chainIndex: "1", timeFrame: 4 });
    expect(f.seen[0]!.url).toBe(`http://x/onchain/wallet-overview?address=${ADDRESS.toLowerCase()}&chainIndex=1&timeFrame=4`);
    expect(f.seen[1]!.url).toBe(`http://x/onchain/wallet-pnl?address=${ADDRESS.toLowerCase()}&chainIndex=1&limit=20`);
    expect(f.seen[0]!.init).toMatchObject({ method: "GET", credentials: "omit", headers: { "x-inonu-intent": "user" } });
    expect(o.ok && o.data.buyCount).toBe(10);
    expect(p.ok && p.data.rows[0]!.symbol).toBe("GREG");
  });

  test("a request the gateway would refuse never leaves: Solana, a window outside 1 to 5, a bad address or network", async () => {
    const f = fakeFetch(() => ok(overviewRaw()));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    for (const bad of [
      { address: ADDRESS, chainIndex: "501", timeFrame: 3 }, { address: ADDRESS, chainIndex: "1", timeFrame: 0 }, { address: ADDRESS, chainIndex: "1", timeFrame: 6 },
      { address: ADDRESS, chainIndex: "1", timeFrame: 2.5 }, { address: "0x123", chainIndex: "1", timeFrame: 3 }, { address: ADDRESS, chainIndex: "a", timeFrame: 3 },
      { address: ADDRESS, chainIndex: "1,56", timeFrame: 3 },
    ]) {
      expect(await reader.overview(bad)).toEqual({ ok: false, error: "bad_request" });
      expect(await reader.pnl(bad)).toEqual({ ok: false, error: "bad_request" });
    }
    expect(f.seen.length).toBe(0);
    expect(checkedResultParams({ address: ADDRESS, chainIndex: "8453", timeFrame: 5 })).toEqual({ address: ADDRESS.toLowerCase(), chainIndex: "8453", timeFrame: 5 });
  });

  test("the five windows are the provider's, in order", () => {
    expect(TIME_FRAMES.map((t) => [t.value, t.label])).toEqual([[1, "1 dia"], [2, "3 dias"], [3, "7 dias"], [4, "1 mes"], [5, "3 meses"]]);
  });

  test("an empty answer is no data, and a row of a network that was not asked is a contract error", async () => {
    const empty = createHoldingsReader({ base: "http://x", fetch: fakeFetch(() => ok(null)).fetch });
    expect(await empty.overview({ address: ADDRESS, chainIndex: "1", timeFrame: 3 })).toEqual({ ok: false, error: "sem_dados" });
    const wrong = createHoldingsReader({ base: "http://x", fetch: fakeFetch(() => ok({ cursor: null, rows: [pnlRowRaw({ chainIndex: "56" })] })).fetch });
    expect(await wrong.pnl({ address: ADDRESS, chainIndex: "1", timeFrame: 3 })).toEqual({ ok: false, error: "schema" });
  });

  test("overview parser: every field a number or null, counts and volumes never negative", () => {
    expect(parseOverview(overviewRaw())?.winRatePct).toBe(50);
    expect(parseOverview(overviewRaw({ winRatePct: null, buyCount: null }))).toMatchObject({ winRatePct: null, buyCount: null });
    for (const over of [{ winRatePct: "50" }, { buyCount: -1 }, { sellVolumeUsd: -0.5 }, { realizedPnlUsd: Number.NaN }, { top3PnlTokenPercent: {} }]) expect(parseOverview(overviewRaw(over))).toBeNull();
    // a missing field is not null: it is a contract error
    const { winRatePct: _dropped, ...rest } = overviewRaw();
    expect(parseOverview(rest)).toBeNull();
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview([])).toBeNull();
  });

  test("pnl parser: symbol and network required, numbers number or null, the cursor plain text", () => {
    const asked = ["1"];
    expect(parsePnl({ cursor: "123", rows: [pnlRowRaw()] }, asked)?.rows[0]).toMatchObject({ symbol: "GREG", totalPct: -20.99 });
    expect(parsePnl({ cursor: null, rows: [pnlRowRaw({ balanceUsd: null, lastActiveMs: null, tokenAddress: null })] }, asked)?.rows.length).toBe(1);
    for (const over of [{ symbol: "" }, { symbol: 5 }, { totalUsd: "1" }, { totalPct: Number.POSITIVE_INFINITY }, { chainIndex: "56" }, { tokenAddress: 7 }]) {
      expect(parsePnl({ cursor: null, rows: [pnlRowRaw(over)] }, asked)).toBeNull();
    }
    expect(parsePnl({ cursor: 5, rows: [] }, asked)).toBeNull();
    expect(parsePnl({ rows: "x" }, asked)).toBeNull();
  });

  test("percent and count text: two decimals, a dash for unknown, never zero for missing", () => {
    expect(pctText(-20.99)).toBe("-20,99%");
    expect(pctText(12.5)).toBe("12,50%");
    expect(pctText(null)).toBe("-");
    expect(pctText(Number.NaN)).toBe("-");
    expect(countText(1234)).toBe("1.234");
    expect(countText(null)).toBe("-");
  });
});

describe("how it reads on the screen", () => {
  test("a quantity: whole above a thousand, four decimals above one, six significant digits below, nothing is zero", () => {
    expect(amountText(12_345_678)).toBe("12.345.678");
    expect(amountText(37.192124)).toBe("37,1921");
    expect(amountText(0.000012345678)).toBe("0,0000123457");
    expect(amountText(0)).toBe("0");
    expect(amountText(null)).toBe("-");
    expect(amountText(Number.NaN)).toBe("-");
  });

  test("dollars with two decimals, a missing value is a dash and never US$ 0,00", () => {
    expect(usdText(1234.5)).toBe("US$ 1.234,50");
    expect(usdText(null)).toBe("-");
    expect(usdText(Number.POSITIVE_INFINITY)).toBe("-");
  });

  test("a price under one cent is not drawn as zero, and a zero or a minus zero is a plain zero", () => {
    expect(usdText(0.0000149)).toBe("US$ 0,0000149");
    expect(usdText(0.004)).toBe("US$ 0,004");
    expect(usdText(0.005)).toBe("US$ 0,01");
    expect(usdText(-0.001)).toBe("US$ -0,001");
    expect(usdText(0)).toBe("US$ 0,00");
    expect(usdText(-0)).toBe("US$ 0,00");
    expect(pctText(-0.004)).toBe("-0,004%");
    expect(pctText(0)).toBe("0,00%");
    expect(pctText(-20.99)).toBe("-20,99%");
    expect(pctText(null)).toBe("-");
    for (const n of [0.0000149, -0.001, 0.004, 0.0049]) {
      expect(usdText(n)).not.toMatch(/^US\$ -?0,00$/);
      expect(pctText(n)).not.toMatch(/^-?0,00%$/);
    }
  });

  test("the age counts what the gateway said and the time on the screen; a clock that went back adds nothing; no reading has no age", () => {
    expect(readingAgeMs([meta(4000), meta(10_000)], 1000, 6000)).toBe(15_000);
    expect(readingAgeMs([meta(2000)], 5000, 1000)).toBe(2000);
    expect(readingAgeMs([], 1, 2)).toBeNull();
    expect(readingAgeMs([meta()], Number.NaN, 2)).toBeNull();
    expect(ageText(15_000)).toBe("ha 15 s");
    expect(ageText(150_000)).toBe("ha 2 min");
    expect(ageText(2 * 3_600_000)).toBe("ha 2 h");
    expect(ageText(3 * 86_400_000)).toBe("ha 3 d");
    expect(ageText(null)).toBe("-");
    expect(ageText(Number.NaN)).toBe("-");
  });
});

describe("the list of networks", () => {
  test("a number and a name each; a repeated number once; an unreadable row makes the list a contract error", () => {
    expect(parseNetworks([{ chainIndex: "1", name: "Ethereum" }, { chainIndex: "1", name: "Again" }, { chainIndex: "8453", name: "Base", logoUrl: "https://x" }])).toEqual([{ chainIndex: "1", name: "Ethereum" }, { chainIndex: "8453", name: "Base" }]);
    expect(parseNetworks([])).toEqual([]);
    for (const bad of [{}, [null], [{ chainIndex: 1, name: "x" }], [{ chainIndex: "a", name: "x" }], [{ chainIndex: "1", name: "" }], [{ chainIndex: "1" }]]) expect(parseNetworks(bad)).toBeNull();
  });

  test("the reader asks the gateway for it with no parameter, and a list that is not one is an error", async () => {
    const f = fakeFetch(() => ok([{ chainIndex: "1", name: "Ethereum" }]));
    const reader = createHoldingsReader({ base: "http://x", fetch: f.fetch });
    const r = await reader.networks();
    expect(r.ok && r.data).toEqual([{ chainIndex: "1", name: "Ethereum" }]);
    expect(f.seen[0]!.url).toBe("http://x/onchain/networks?");
    const bad = createHoldingsReader({ base: "http://x", fetch: fakeFetch(() => ok({ nope: 1 })).fetch });
    expect(await bad.networks()).toEqual({ ok: false, error: "schema" });
  });
});

describe("a read the person cancelled", () => {
  test("is cancelled, not a lost connection", async () => {
    const controller = new AbortController();
    const fetch = async (_url: string, init?: RequestInit): Promise<Response> => {
      controller.abort();
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response("{}");
    };
    const reader = createHoldingsReader({ base: "http://x", fetch });
    expect(await reader.balances({ address: ADDRESS, chains: ["1"] }, controller.signal)).toEqual({ ok: false, error: "cancelled" });
    expect(holdingsErrorText("cancelled")).toBe("Leitura cancelada.");
    const down = createHoldingsReader({ base: "http://x", fetch: async () => { throw new Error("down"); } });
    expect(await down.balances({ address: ADDRESS, chains: ["1"] })).toEqual({ ok: false, error: "network" });
  });
});
