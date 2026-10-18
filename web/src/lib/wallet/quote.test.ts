// T9.5, WAL-5: the reader of one quote from the local gateway (GET /onchain/quote). The envelope and the payload are checked strictly: whatever is not
// exactly the documented shape is an error, never a number on the screen. The request carries the chain, the amount and the two token addresses and
// nothing else, with no credentials and the intent of a click. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { createQuoteReader, parseQuote } from "./quote";

const side = (over: Record<string, unknown> = {}) => ({ address: "0xaaa", symbol: "TOK", decimals: 18, unitPriceUsd: 2, taxRate: 0, isHoneyPot: false, ...over });
const GOOD = {
  chainIndex: "8453", mode: "exactIn", fromAmount: 100_000_000, toAmount: 5e19, priceImpactPct: -0.4, estimateGasFee: 120_000, tradeFee: 0.12,
  fromToken: side({ address: "0xusdc", symbol: "USDC", decimals: 6, unitPriceUsd: 1 }), toToken: side(),
};
const NORMALIZED_LEGACY = { ...GOOD, fromAmountRaw: null, toAmountRaw: null, outputUnit: "unverified" as const };
const META = { tier: "basic", cachedAtMs: 1, ageMs: 5, stale: false, budget: { tier: "basic", used: 1, cap: null } } as const;
const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
const PARAMS = { chainIndex: "8453", amount: "100000000", fromToken: "0xusdc", toToken: "0xaaa" };

describe("the payload", () => {
  test("new raw amounts survive exactly and unverified output metadata is checked", () => {
    const data = { ...GOOD, fromAmount: 9007199254740992, fromAmountRaw: "9007199254740993", toAmount: 1.2345678901234568e29, toAmountRaw: "123456789012345678901234567890", outputUnit: "unverified" as const };
    expect(parseQuote(data)).toEqual(data);
    for (const bad of [
      { ...data, fromAmountRaw: 9007199254740993 }, { ...data, toAmountRaw: "1e20" },
      { ...data, toAmountRaw: "-1" }, { ...data, toAmountRaw: " 12" },
      { ...data, toAmountRaw: "9".repeat(129) }, { ...data, outputUnit: "atomic" },
    ]) expect(parseQuote(bad)).toBeNull();
  });

  test("old gateways remain readable with missing raw precision and output units explicitly unknown", () => {
    expect(parseQuote(GOOD)).toMatchObject({ fromAmountRaw: null, toAmountRaw: null, outputUnit: "unverified", tradeFee: 0.12, estimateGasFee: 120000 });
  });

  test("a good one comes back as it is, with a flag the provider left out kept as unknown", () => {
    expect(parseQuote(GOOD)).toEqual(NORMALIZED_LEGACY);
    const silent = parseQuote({ ...GOOD, toToken: side({ isHoneyPot: null, taxRate: null, decimals: null }) })!;
    expect(silent.toToken.isHoneyPot).toBeNull();
    expect(silent.toToken.taxRate).toBeNull();
    expect(silent.toToken.decimals).toBeNull();
  });

  test("anything off the shape is null: the wrong type, a missing side, a number that is not finite, a flag that is a text", () => {
    for (const bad of [null, "x", [], {}, { ...GOOD, fromAmount: "100" }, { ...GOOD, toAmount: Number.NaN }, { ...GOOD, toAmount: -1 }, { ...GOOD, fromToken: null }, { ...GOOD, toToken: "TOK" }, { ...GOOD, toToken: side({ isHoneyPot: "no" }) }, { ...GOOD, priceImpactPct: "0.4" }, { ...GOOD, toToken: side({ decimals: 1.5 }) }]) {
      expect(parseQuote(bad)).toBeNull();
    }
  });

  test("the free text of a field is cut, so a long name cannot take over the screen", () => {
    const long = parseQuote({ ...GOOD, toToken: side({ symbol: "T".repeat(300) }) })!;
    expect(long.toToken.symbol!.length).toBeLessThanOrEqual(20);
  });
});

describe("the request", () => {
  test("raw input identity distinguishes a one-atom difference hidden by the numeric projection", async () => {
    const params = { ...PARAMS, amount: "9007199254740993" };
    const data = { ...GOOD, fromAmount: 9007199254740992, fromAmountRaw: "9007199254740992", toAmountRaw: null, outputUnit: "unverified" };
    const ask = (quote: unknown) => createQuoteReader({ base: "", fetch: reply({ ok: true, data: quote, meta: META }) }).read(params);
    expect(await ask(data)).toEqual({ ok: false, error: "schema" });
    expect(await ask({ ...data, fromAmountRaw: "9007199254740993" })).toMatchObject({ ok: true });
    // Numeric-only legacy gateways remain supported, with raw precision unknown.
    expect(await ask({ ...GOOD, fromAmount: 9007199254740992 })).toMatchObject({ ok: true, data: { fromAmountRaw: null, outputUnit: "unverified" } });
  });

  test("a GET with the chain, the amount and the two tokens, no credentials, and the header of a click", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const reader = createQuoteReader({ base: "http://local", fetch: async (url, init) => (seen.push({ url: String(url), ...(init ? { init } : {}) }), new Response(JSON.stringify({ ok: true, data: GOOD, meta: META }))) });
    const result = await reader.read(PARAMS);
    expect(result).toEqual({ ok: true, data: NORMALIZED_LEGACY, meta: META });
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/onchain/quote");
    expect(Object.fromEntries(url.searchParams)).toEqual({ chainIndex: "8453", amount: "100000000", fromToken: "0xusdc", toToken: "0xaaa" });
    expect(seen[0]!.init?.method).toBe("GET");
    expect(seen[0]!.init?.credentials).toBe("omit");
    expect((seen[0]!.init?.headers as Record<string, string>)["x-inonu-intent"]).toBe("user");
  });

  test("a refusal of the gateway comes back as its code, and the ones the transport knows are told apart", async () => {
    for (const code of ["provider_payment_required", "budget_exhausted", "no_credentials", "provider_error", "bad_request", "unsupported_chain"] as const) {
      expect(await createQuoteReader({ base: "", fetch: reply({ ok: false, error: code }) }).read(PARAMS)).toEqual({ ok: false, error: code });
    }
    // the gateway serializes the code as `code` in some answers
    expect(await createQuoteReader({ base: "", fetch: reply({ ok: false, code: "pace_limited" }, 429) }).read(PARAMS)).toEqual({ ok: false, error: "pace_limited" });
    expect(await createQuoteReader({ base: "", fetch: reply({ message: "x" }, 404) }).read(PARAMS)).toEqual({ ok: false, error: "backend_stale" });
    expect(await createQuoteReader({ base: "", fetch: reply({}, 403) }).read(PARAMS)).toEqual({ ok: false, error: "origin_denied" });
    expect(await createQuoteReader({ base: "", fetch: async () => { throw new Error("offline"); } }).read(PARAMS)).toEqual({ ok: false, error: "network" });
  });

  test("an answer that is not the envelope, a code nobody knows, or a payload that is not a quote is a schema error and never a number", async () => {
    expect(await createQuoteReader({ base: "", fetch: reply({ ok: true, data: { ...GOOD, toAmount: "5" }, meta: META }) }).read(PARAMS)).toEqual({ ok: false, error: "schema" });
    expect(await createQuoteReader({ base: "", fetch: reply({ ok: true, data: GOOD }) }).read(PARAMS)).toEqual({ ok: false, error: "schema" });
    expect(await createQuoteReader({ base: "", fetch: reply({ ok: false, error: "SENTINEL-whatever" }) }).read(PARAMS)).toEqual({ ok: false, error: "schema" });
    expect(await createQuoteReader({ base: "", fetch: reply("not an envelope") }).read(PARAMS)).toEqual({ ok: false, error: "schema" });
    expect(await createQuoteReader({ base: "", fetch: async () => new Response("<html>", { status: 502 }) }).read(PARAMS)).toEqual({ ok: false, error: "schema" });
  });

  test("a valid body with an error status is not an answer: the status is read too", async () => {
    expect(await createQuoteReader({ base: "", fetch: reply({ ok: true, data: GOOD, meta: META }, 500) }).read(PARAMS)).toEqual({ ok: false, error: "schema" });
  });

  test("the gateway has nothing for a size (an empty payload): that is a quote that does not exist, not a broken contract", async () => {
    expect(await createQuoteReader({ base: "", fetch: reply({ ok: true, data: null, meta: META }) }).read(PARAMS)).toEqual({ ok: false, error: "sem_cotacao" });
  });

  test("a quote that is not about what was asked is a contract error: another network, another amount, another token", async () => {
    const ask = (data: unknown) => createQuoteReader({ base: "", fetch: reply({ ok: true, data, meta: META }) }).read(PARAMS);
    expect(await ask({ ...GOOD, chainIndex: "1" })).toEqual({ ok: false, error: "schema" });
    expect(await ask({ ...GOOD, fromAmount: 200_000_000 })).toEqual({ ok: false, error: "schema" });
    expect(await ask({ ...GOOD, toToken: side({ address: "0xbbb" }) })).toEqual({ ok: false, error: "schema" });
    expect(await ask({ ...GOOD, fromToken: side({ address: "0xother" }) })).toEqual({ ok: false, error: "schema" });
    // the case of an EVM address is not a difference, and an address the provider did not echo is not a mismatch
    expect(await ask({ ...GOOD, toToken: side({ address: "0xAAA" }) })).toMatchObject({ ok: true });
    expect(await ask({ ...GOOD, chainIndex: null, toToken: side({ address: null }) })).toMatchObject({ ok: true });
  });

  test("a request whose parts are not what the gateway takes is refused here, before it leaves", async () => {
    let calls = 0;
    const reader = createQuoteReader({ base: "", fetch: async () => (calls += 1, new Response("{}")) });
    for (const bad of [{ ...PARAMS, chainIndex: "x" }, { ...PARAMS, amount: "1.5" }, { ...PARAMS, amount: "0" }, { ...PARAMS, fromToken: "" }, { ...PARAMS, toToken: "a b" }, { ...PARAMS, fromToken: "x".repeat(200) }]) {
      expect(await reader.read(bad)).toEqual({ ok: false, error: "bad_request" });
    }
    expect(calls).toBe(0);
  });
});
