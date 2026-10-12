import { describe, expect, test } from "bun:test";
import { normalizeArchiveRequest } from "./archive-discovery.ts";
import * as archive from "./archive-discovery.ts";
import { envelope, makeClock, makeFakeFetch } from "./fakes.ts";
import type { FetchLike } from "./http.ts";
import { OnchainosError } from "./errors.ts";

const ms = (iso: string): string => String(Date.parse(iso));
const request = (extra: Record<string, unknown> = {}) => ({ module: "1", instType: "SWAP", instFamilyList: "BTC-USDT", dateAggrType: "daily", begin: ms("2025-08-31T00:00:00Z"), end: ms("2025-09-01T00:00:00Z"), ...extra });
function invalid(input: unknown): void {
  try { normalizeArchiveRequest(input); throw new Error("accepted invalid request"); }
  catch (error) { expect(error).toBeInstanceOf(OnchainosError); expect((error as OnchainosError).kind).toBe("invalid_request"); }
}

describe("archive request contract AD01-AD02", () => {
  test("preserves original timestamps and exposes inclusive UTC8 date buckets", () => {
    const value = normalizeArchiveRequest(request({ begin: ms("2025-08-30T17:32:00Z"), end: ms("2025-08-31T16:00:00Z") }));
    expect(value.query).toEqual({ module: "1", instType: "SWAP", instFamilyList: "BTC-USDT", dateAggrType: "daily", begin: "1756575120000", end: "1756656000000" });
    expect(value.datePolicy).toEqual({ timezone: "UTC+8", offsetMinutes: 480, aggregation: "daily", beginDate: "2025-08-31", endDate: "2025-09-01", inclusiveBuckets: 2, endDayOnly: false });
    expect(value.selectors).toEqual(["BTC-USDT"]);
  });
  test("accepts documented modules, four instrument types and bounded selector arrays", () => {
    for (const module of ["1", "2", "3", "4", "5", "6", "11"] as const) {
      for (const instType of ["SPOT", "FUTURES", "SWAP", "OPTION"]) {
        if (module === "3" && instType === "SPOT") continue;
        const input = { module, instType, dateAggrType: "daily", begin: ms("2025-11-01T00:00:00Z"), end: ms("2025-11-01T00:00:00Z"), [instType === "SPOT" ? "instIdList" : "instFamilyList"]: module === "3" ? "ANY" : ["BTC-USDT"] };
        expect(normalizeArchiveRequest(input).query.module).toBe(module);
      }
    }
  });
  test("rejects unknown fields, invalid types, inherited fields, symbols and accessors", () => {
    for (const input of [null, [], "request", request({ module: 1 }), request({ extra: "x" }), request({ begin: 1 }), request({ begin: "1e3" }), request({ begin: "-1" }), request({ begin: "4102444800001" }), Object.assign(Object.create({ injected: true }), request()), { ...request(), [Symbol("x")]: 1 }, Object.defineProperty(request(), "hidden", { value: true }), Object.defineProperty(request(), "begin", { get: () => "0" })]) invalid(input);
  });
  test("rejects both list fields, wrong list kind, empty, duplicate, unsafe and oversized selectors", () => {
    for (const extra of [{ instIdList: "BTC-USDT" }, { instFamilyList: "" }, { instFamilyList: [] }, { instFamilyList: "BTC-USDT,BTC-USDT" }, { instFamilyList: "BTC-USDT,ANY" }, { instFamilyList: "https://x" }, { instFamilyList: "BTC USDT" }, { instFamilyList: Array.from({ length: 11 }, (_, i) => `C${i}-USDT`) }]) invalid(request(extra));
    invalid({ module: "1", instType: "SPOT", instFamilyList: "BTC-USDT", dateAggrType: "daily", begin: "0", end: "0" });
  });
  test("ANY is a sole daily selector for modules 1,2,3,11 only", () => {
    for (const module of ["1", "2", "3", "11"]) expect(normalizeArchiveRequest(request({ module, instFamilyList: "ANY" })).selectors).toEqual(["ANY"]);
    for (const module of ["4", "5", "6"]) invalid(request({ module, instFamilyList: "ANY" }));
    invalid(request({ instFamilyList: "ANY", dateAggrType: "monthly" }));
  });
  test("daily funding requires non-SPOT ANY; monthly funding accepts explicit families", () => {
    invalid(request({ module: "3" }));
    invalid({ module: "3", instType: "SPOT", instIdList: "ANY", dateAggrType: "daily", begin: "0", end: "0" });
    expect(normalizeArchiveRequest(request({ module: "3", dateAggrType: "monthly" })).query.instFamilyList).toBe("BTC-USDT");
  });
  test("books use UTC0 and module6 OPTION exposes only end day with one family", () => {
    const value = normalizeArchiveRequest(request({ module: "6", instType: "OPTION", begin: ms("2024-02-28T23:00:00Z"), end: ms("2024-03-01T01:00:00Z") }));
    expect(value.datePolicy).toEqual({ timezone: "UTC+0", offsetMinutes: 0, aggregation: "daily", beginDate: "2024-03-01", endDate: "2024-03-01", inclusiveBuckets: 1, endDayOnly: true });
    expect(value.query.begin).toBe("1709161200000");
    invalid(request({ module: "6", instType: "OPTION", instFamilyList: "BTC-USDT,ETH-USDT" }));
    invalid(request({ module: "6", dateAggrType: "monthly" }));
  });
  test("inclusive daily bucket bound includes leap day and rejects eleven buckets", () => {
    expect(normalizeArchiveRequest(request({ module: "4", begin: ms("2024-02-24T23:59:59Z"), end: ms("2024-03-04T00:00:00Z") })).datePolicy.inclusiveBuckets).toBe(10);
    invalid(request({ module: "4", begin: ms("2024-02-24T23:59:59Z"), end: ms("2024-03-05T00:00:00Z") }));
    invalid(request({ begin: "2", end: "1" }));
  });
  test("calendar month range uses inclusive month buckets across year and UTC8 rollover", () => {
    const value = normalizeArchiveRequest(request({ dateAggrType: "monthly", begin: ms("2023-12-31T16:00:00Z"), end: ms("2024-10-31T15:59:59Z") }));
    expect(value.datePolicy.beginDate).toBe("2024-01");
    expect(value.datePolicy.endDate).toBe("2024-10");
    expect(value.datePolicy.inclusiveBuckets).toBe(10);
    invalid(request({ dateAggrType: "monthly", begin: ms("2023-12-31T16:00:00Z"), end: ms("2024-10-31T16:00:00Z") }));
  });
  test("module5 rejects buckets before 2025-11-01 as adapter bound", () => {
    invalid(request({ module: "5", begin: ms("2025-10-31T23:59:59Z"), end: ms("2025-11-01T00:00:00Z") }));
    expect(normalizeArchiveRequest(request({ module: "5", begin: ms("2025-11-01T00:00:00Z"), end: ms("2025-11-01T23:59:59Z") })).datePolicy.beginDate).toBe("2025-11-01");
  });
  test("rejects sparse and accessor lists before consulting their contents", () => {
    invalid(request({ instFamilyList: new Array(1) }));
    let invoked = false;
    const list = Object.defineProperty(["BTC-USDT"], "0", { get: () => { invoked = true; return "BTC-USDT"; } });
    invalid(request({ instFamilyList: list }));
    expect(invoked).toBe(false);
    invalid(request({ instFamilyList: Object.assign(["BTC-USDT"], { extra: true }) }));
  });
});

describe("archive discovery transport AD06-AD07", () => {
  const client = (fetch: FetchLike, clock = makeClock(), extra: Record<string, unknown> = {}) => archive.createArchiveDiscoveryClient({ fetch, now: clock.now, sleep: clock.sleep, ...extra });
  test("is offline by default and invalid requests make zero calls", async () => {
    const fake = makeFakeFetch([{ body: envelope(row()) }]);
    const c = client(fake.fetch);
    await expect(c.discover(request())).rejects.toMatchObject({ kind: "offline" });
    await expect(c.discover(request({ module: "99" }))).rejects.toMatchObject({ kind: "invalid_request" });
    expect(fake.calls).toHaveLength(0);
    expect(c.quota.snapshot()).toMatchObject({ totalAttempts: 0 });
    expect(c.info).toEqual({ source: "okx-public-v5", origin: "https://www.okx.com", ready: false, requestsPerSecond: 1, burst: 1, timeoutMs: 10_000, maxRetries: 0 });
    const live = client(fake.fetch, makeClock(), { allowNetwork: true });
    await expect(live.discover(request({ end: "0" }))).rejects.toMatchObject({ kind: "invalid_request" });
    expect(fake.calls).toHaveLength(0);
  });
  test("fixed public GET has empty headers, no body, redirect error, and separate read/provider times", async () => {
    const clock = makeClock(1_800_000_000_000);
    const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const fetch: FetchLike = async (url, init) => {
      seen.push({ url, init });
      return { status: 200, text: async () => { clock.advance(7); return JSON.stringify(envelope(row())); } };
    };
    const c = client(fetch, clock, { allowNetwork: true });
    const result = await c.discover(request());
    expect(seen).toHaveLength(1);
    const sent = seen[0]!;
    const url = new URL(sent.url);
    expect(url.origin).toBe("https://www.okx.com");
    expect(url.pathname).toBe("/api/v5/public/market-data-history");
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...normalizeArchiveRequest(request()).query });
    expect(sent.init).toMatchObject({ method: "GET", headers: {}, redirect: "error", cache: "no-store" });
    expect(Object.keys(sent.init).sort()).toEqual(["cache", "headers", "method", "redirect", "signal"]);
    expect(sent.init.signal).toBeInstanceOf(AbortSignal);
    expect(result.schemaVersion).toBe("okx_archive_discovery_v1");
    expect(result.request).toEqual(normalizeArchiveRequest(request()));
    expect(result.meta).toEqual({ source: "okx-public-v5", endpoint: "/api/v5/public/market-data-history", tier: "public", httpStatus: 200, attempts: 1, requestedAtMs: 1_800_000_000_000, receivedAtMs: 1_800_000_000_007 });
    expect(result.providerTimestampMs).toBe(1_756_882_260_390);
    expect(result.qualification).toEqual({ historicalCoverage: "unknown", rights: "unknown", fileAccess: "unknown", fileSchema: "unknown", executionAvailability: "unknown", strategyQualified: false, financiallyAuthorized: false });
    expect(c.quota.snapshot()).toMatchObject({ totalAttempts: 1, calls: { public: 1 }, attempts: { public: 1 }, retries: 0 });
  });
  test("one token per second serializes concurrent calls with burst one", async () => {
    const clock = makeClock();
    const fake = makeFakeFetch([{ body: envelope(row()) }, { body: envelope(row()) }, { body: envelope(row()) }], clock);
    const c = client(fake.fetch, clock, { allowNetwork: true });
    await Promise.all([c.discover(request()), c.discover(request()), c.discover(request())]);
    expect(fake.calls.map((call) => call.atMs)).toEqual([1_700_000_000_000, 1_700_000_001_000, 1_700_000_002_000]);
    expect(clock.sleeps).toEqual([1000, 1000]);
    expect(c.quota.snapshot()).toMatchObject({ totalAttempts: 3, calls: { public: 3 }, attempts: { public: 3 }, retries: 0 });
  });
  test("429 and 5xx never retry and provider errors preserve bounded transport facts", async () => {
    for (const status of [429, 500, 503]) {
      const fake = makeFakeFetch([{ status, body: "unavailable" }, { body: envelope(row()) }]);
      const c = client(fake.fetch, makeClock(), { allowNetwork: true });
      await expect(c.discover(request())).rejects.toMatchObject({ kind: status === 429 ? "rate_limited" : "http", httpStatus: status, attempts: 1 });
      expect(fake.calls).toHaveLength(1);
      expect(c.quota.snapshot().retries).toBe(0);
    }
    const fake = makeFakeFetch([{ body: envelope([], "51000", "invalid parameter") }]);
    await expect(client(fake.fetch, makeClock(), { allowNetwork: true }).discover(request())).rejects.toMatchObject({ kind: "api", apiCode: "51000", attempts: 1 });
  });
  test("rejects non-JSON, wrong envelopes/listings, too large bodies and network/body failures", async () => {
    for (const [reply, kind] of [
      [{ body: "not-json" }, "schema"], [{ body: {} }, "schema"], [{ body: envelope(row({ ts: "wrong" })) }, "schema"],
      [{ body: " ".repeat(1_000_001) }, "too_large"], [{ throws: new Error("private fetch detail") }, "network"],
      [{ bodyThrows: true }, "network"],
    ] as const) {
      const fake = makeFakeFetch([reply]);
      await expect(client(fake.fetch, makeClock(), { allowNetwork: true }).discover(request())).rejects.toMatchObject({ kind });
      expect(fake.calls).toHaveLength(1);
    }
  });
  test("no listed file causes another fetch and empty listings remain unqualified", async () => {
    const fake = makeFakeFetch([{ body: envelope(row({ details: [], totalSizeMB: "0" })) }]);
    const result = await client(fake.fetch, makeClock(), { allowNetwork: true }).discover(request());
    expect(fake.calls).toHaveLength(1);
    expect(result.files).toEqual([]);
    expect(result.qualification.historicalCoverage).toBe("unknown");
    expect(result.qualification.fileAccess).toBe("unknown");
    expect(result.qualification.strategyQualified).toBe(false);
  });
});

const file = (extra: Record<string, unknown> = {}) => ({ dateTs: "1756656000000", filename: "BTC-USDT-SWAP-trades-2025-09-01.zip", sizeMB: "10.820000000000000001", url: "https://static.okx.com/cdn/okex/traderecords/trades/daily/20250901/BTC-USDT-SWAP-trades-2025-09-01.zip", ...extra });
const group = (extra: Record<string, unknown> = {}) => ({ dateRangeStart: "1756569600000", dateRangeEnd: "1756656000000", instId: "", instFamily: "BTC-USDT", instType: "SWAP", groupSizeMB: "10.820000000000000001", groupDetails: [file()], ...extra });
const row = (extra: Record<string, unknown> = {}) => [{ dateAggrType: "daily", totalSizeMB: "10.820000000000000001", ts: "1756882260390", details: [group()], ...extra }];
const parse = (data: unknown, input: unknown = request()) => archive.parseArchiveResponse(data, normalizeArchiveRequest(input));
function malformed(data: unknown, input: unknown = request()): void {
  try { parse(data, input); throw new Error("accepted malformed provider data"); }
  catch (error) { expect(error).toBeInstanceOf(OnchainosError); expect((error as OnchainosError).kind).toBe("schema"); }
}

describe("archive listing schema AD03-AD05", () => {
  test("archive basename directly under the required prefix is safe without invented nesting", () => {
    expect(parse(row({ details: [group({ groupDetails: [file({ filename: "archive.zip", url: "https://static.okx.com/cdn/okex/traderecords/archive.zip" })] })] })).files[0]!.filename).toBe("archive.zip");
  });
  test("provider arrays and objects reject sparse entries, hidden extras and accessors without reading them", () => {
    let invoked = false;
    const getterFile = { ...file() };
    Object.defineProperty(getterFile, "url", { enumerable: true, get: () => { invoked = true; return file().url; } });
    const getterList = [file()];
    Object.defineProperty(getterList, "0", { get: () => { invoked = true; return file(); } });
    malformed(new Array(1));
    malformed(row({ details: new Array(1) }));
    malformed(row({ details: [group({ groupDetails: getterList })] }));
    malformed(row({ details: [group({ groupDetails: [getterFile] })] }));
    malformed(row({ details: Object.assign([], { extra: true }) }));
    malformed(row({ details: [group({ groupDetails: Object.assign([], { extra: true }) })] }));
    expect(invoked).toBe(false);
  });
  test("retains exact MB text, provider timestamp, group identities and explicit example alias", () => {
    const value = parse(row());
    expect(value.providerTimestampMs).toBe(1756882260390);
    expect(value.totalSizeMB).toBe("10.820000000000000001");
    expect(value.groups).toEqual([{ instId: "", instFamily: "BTC-USDT", instType: "SWAP", dateRangeStartMs: 1756569600000, dateRangeEndMs: 1756656000000, groupSizeMB: "10.820000000000000001", listedFileCount: 1 }]);
    expect(value.files[0]).toEqual({ instId: "", instFamily: "BTC-USDT", filename: file().filename, url: file().url, sizeMB: "10.820000000000000001", dateTimestampMs: 1756656000000, dateTimestampText: "1756656000000", dateKey: "2025-09-01", timestampAlias: "dateTs" });
  });
  test("accepts table dataTs, identical aliases, and absent response-table instType", () => {
    const onlyTable = file(); delete (onlyTable as Partial<ReturnType<typeof file>>).dateTs; Object.assign(onlyTable, { dataTs: "1756656000000" });
    const noType = group({ groupDetails: [onlyTable] }); delete (noType as Partial<ReturnType<typeof group>>).instType;
    expect(parse(row({ details: [noType] })).files[0]?.timestampAlias).toBe("dataTs");
    expect(parse(row({ details: [noType] })).groups[0]?.instType).toBeUndefined();
    expect(parse(row({ details: [group({ groupDetails: [file({ dataTs: "1756656000000" })] })] })).files[0]?.timestampAlias).toBe("both");
  });
  test("rejects absent, conflicting, numeric and malformed timestamp aliases", () => {
    const missing = file(); delete (missing as Partial<ReturnType<typeof file>>).dateTs;
    for (const item of [missing, file({ dataTs: "1756569600000" }), file({ dateTs: 1756656000000 }), file({ dateTs: "1e3" }), file({ dateTs: "-1" })]) malformed(row({ details: [group({ groupDetails: [item] })] }));
  });
  test("empty details means no files listed with coverage unknown", () => {
    expect(parse(row({ totalSizeMB: "0", details: [] })).files).toEqual([]);
    expect(parse(row({ totalSizeMB: "0", details: [] })).providerTimestampMs).toBe(1756882260390);
  });
  test("rejects wrong row counts, unknown fields and provider object prototypes", () => {
    for (const data of [[], [...row(), ...row()], {}, [null], row({ extra: true }), [Object.assign(Object.create({ foo: 1 }), row()[0])], row({ details: [group({ extra: true })] }), row({ details: [group({ groupDetails: [file({ extra: true })] })] }), row({ dateAggrType: "monthly" }), row({ ts: "NaN" })]) malformed(data);
  });
  test("bounds groups and overall files before inspecting individual file values", () => {
    malformed(row({ details: new Array(101).fill(group()) }));
    const groups = Array.from({ length: 100 }, (_, i) => group({ instFamily: `C${i}-USDT`, groupDetails: new Array(21).fill(file()) }));
    malformed(row({ details: groups }), request({ instFamilyList: "ANY" }));
  });
  test("rejects foreign, missing or duplicate identities and mismatched optional instType", () => {
    for (const extra of [{ instFamily: "ETH-USDT" }, { instId: "BTC-USDT-SWAP" }, { instFamily: "" }, { instType: "SPOT" }, { instFamily: "ANY" }]) malformed(row({ details: [group(extra)] }));
    malformed(row({ details: [group(), group()] }));
    malformed(row({ details: [group({ groupDetails: [file(), file()] })] }));
    const spot = request({ instType: "SPOT", instIdList: "BTC-USDT" }); delete (spot as Record<string, unknown>).instFamilyList;
    expect(parse(row({ details: [group({ instId: "BTC-USDT", instFamily: "", instType: "SPOT" })] }), spot).files[0]?.instId).toBe("BTC-USDT");
  });
  test("group and file ranges are inclusive provider date buckets", () => {
    for (const extra of [{ dateRangeStart: "1756656000001", dateRangeEnd: "1756656000000" }, { dateRangeStart: "1756483200000" }, { dateRangeEnd: "1756742400000" }, { dateRangeStart: "1756656000000", groupDetails: [file({ dateTs: "1756569600000" })] }, { groupDetails: [file({ dateTs: "1756742400000" })] }]) malformed(row({ details: [group(extra)] }));
    expect(parse(row({ details: [group({ groupDetails: [file({ dateTs: "1756659600000" })] })] })).files[0]?.dateKey).toBe("2025-09-01");
  });
  test("monthly file matching uses calendar buckets and module6 OPTION only accepts end day", () => {
    const monthly = request({ dateAggrType: "monthly", begin: ms("2024-01-31T16:00:00Z"), end: ms("2024-03-31T15:59:59Z") });
    const monthlyData = row({ dateAggrType: "monthly", details: [group({ dateRangeStart: ms("2024-02-01T00:00:00Z"), dateRangeEnd: ms("2024-03-01T00:00:00Z"), groupDetails: [file({ dataTs: ms("2024-02-29T16:00:00Z"), dateTs: ms("2024-02-29T16:00:00Z") })] })] });
    expect(parse(monthlyData, monthly).files[0]?.dateKey).toBe("2024-03");
    malformed(row(), request({ module: "6", instType: "OPTION" }));
  });
  test("nonnegative MB decimal text remains exact and rejects coercions and exponents", () => {
    for (const sizeMB of [1, "", "-1", "1e3", "NaN", "Infinity", "0.1 ", "1".repeat(129)]) malformed(row({ details: [group({ groupDetails: [file({ sizeMB })] })] }));
    expect(parse(row({ details: [group({ groupDetails: [file({ sizeMB: "0" })] })] })).files[0]?.sizeMB).toBe("0");
  });
  test("only canonical static.okx.com HTTPS zip URLs within archive prefix are listed", () => {
    const base = file().url;
    for (const url of [base.replace("https:", "http:"), base.replace("static.okx.com", "static.okx.com.evil.test"), base.replace("static.okx.com", "user@static.okx.com"), base.replace("static.okx.com", "static.okx.com:443"), base + "?x=1", base + "#x", base.replace("/trades/", "/../trades/"), base.replace("/trades/", "/./trades/"), base.replace("/trades/", "/%2e%2e/trades/"), base.replace("/trades/", "/%252e%252e/trades/"), base.replace("/trades/", "\\trades/"), base.replace("traderecords/", "traderecords-other/"), base.replace("BTC-USDT-SWAP-trades", "ETH-USDT-SWAP-trades"), base + " ", base.replace("/trades/", "//trades/")]) malformed(row({ details: [group({ groupDetails: [file({ url })] })] }));
    for (const filename of ["../a.zip", "a.exe", "a.zip.zip", "a b.zip", "a".repeat(257) + ".zip"]) malformed(row({ details: [group({ groupDetails: [file({ filename })] })] }));
    expect(parse(row()).files[0]?.url).toBe(base);
  });
});
