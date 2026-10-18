import { describe, expect, spyOn, test } from "bun:test";
import { runArchiveDiscoveryCli } from "./okx-archive-discovery.ts";
import { envelope, makeClock, makeFakeFetch, type FakeReply } from "../src/onchainos/fakes.ts";

const args = ["--module", "1", "--inst-type", "SWAP", "--instruments", "BTC-USDT", "--aggregation", "daily", "--begin", "1756569600000", "--end", "1756656000000"];
const listing = [{ dateAggrType: "daily", totalSizeMB: "0", ts: "1756882260390", details: [] }];
function setup(reply: FakeReply = { body: envelope(listing) }) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const clock = makeClock();
  const fake = makeFakeFetch([reply], clock);
  return { stdout, stderr, fake, clock, ports: { stdout: (text: string) => { stdout.push(text); }, stderr: (text: string) => { stderr.push(text); }, fetch: fake.fetch, now: clock.now, sleep: clock.sleep } };
}

describe("archive CLI AD08", () => {
  test("a fresh module import performs no global IO or network call", async () => {
    const network = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async () => { throw new Error("unexpected network during import"); }, { preconnect: () => undefined }));
    const output = spyOn(console, "log").mockImplementation(() => undefined);
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const imported = await import(new URL("./okx-archive-discovery.ts?import-safety", import.meta.url).href);
      expect(typeof imported.runArchiveDiscoveryCli).toBe("function");
      expect(network).not.toHaveBeenCalled();
      expect(output).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally { network.mockRestore(); output.mockRestore(); errors.mockRestore(); }
  });
  test("default dry run prints validated plan and qualification without invoking any fetch", async () => {
    const s = setup({ throws: new Error("fetch must not run") });
    expect(await runArchiveDiscoveryCli(args, s.ports)).toBe(0);
    expect(s.fake.calls).toHaveLength(0);
    expect(s.stderr).toEqual([]);
    expect(s.stdout).toHaveLength(1);
    const plan = JSON.parse(s.stdout[0]!);
    expect(plan).toMatchObject({ mode: "dry_run", schemaVersion: "okx_archive_discovery_v1", networkEnabled: false, request: { query: { module: "1", instType: "SWAP", instFamilyList: "BTC-USDT", begin: "1756569600000", end: "1756656000000" }, datePolicy: { timezone: "UTC+8", beginDate: "2025-08-31", endDate: "2025-09-01" } }, qualification: { historicalCoverage: "unknown", rights: "unknown", fileAccess: "unknown", fileSchema: "unknown", executionAvailability: "unknown", strategyQualified: false, financiallyAuthorized: false } });
    expect(Object.hasOwn(plan, "meta")).toBe(false);
    expect(Object.hasOwn(plan, "providerTimestampMs")).toBe(false);
  });
  test("--public explicitly performs exactly one injected metadata read", async () => {
    const s = setup();
    expect(await runArchiveDiscoveryCli([...args, "--public"], s.ports)).toBe(0);
    expect(s.fake.calls).toHaveLength(1);
    expect(s.fake.calls[0]!.path).toBe("/api/v5/public/market-data-history");
    expect(s.fake.calls[0]!.headers).toEqual({});
    const result = JSON.parse(s.stdout[0]!);
    expect(result).toMatchObject({ mode: "public_metadata", schemaVersion: "okx_archive_discovery_v1", providerTimestampMs: 1756882260390, files: [], meta: { attempts: 1, requestedAtMs: 1_700_000_000_000, receivedAtMs: 1_700_000_000_000 }, qualification: { strategyQualified: false, financiallyAuthorized: false } });
    expect(s.stderr).toEqual([]);
  });
  test("SPOT instruments map to instIdList; argument order is immaterial", async () => {
    const s = setup();
    expect(await runArchiveDiscoveryCli(["--end", "1756656000000", "--begin", "1756569600000", "--aggregation", "daily", "--instruments", "BTC-USDT,ETH-USDT", "--inst-type", "SPOT", "--module", "2"], s.ports)).toBe(0);
    const query = JSON.parse(s.stdout[0]!).request.query;
    expect(query.instIdList).toBe("BTC-USDT,ETH-USDT");
    expect(Object.hasOwn(query, "instFamilyList")).toBe(false);
    expect(s.fake.calls).toHaveLength(0);
  });
  test("help is import-safe and has no request or clock requirement", async () => {
    const s = setup();
    const clockThrows = () => { throw new Error("clock must not run for help"); };
    expect(typeof runArchiveDiscoveryCli).toBe("function");
    expect(await runArchiveDiscoveryCli(["--help"], { ...s.ports, now: clockThrows })).toBe(0);
    expect(s.stdout[0]).toContain("bun --no-env-file scripts/okx-archive-discovery.ts");
    expect(s.stdout[0]).toContain("--public");
    expect(s.stdout[0]).toContain("dry run");
    expect(s.fake.calls).toHaveLength(0);
    expect(s.stderr).toEqual([]);
  });
  test("usage failures reject unknown/duplicate/missing flags, URLs and positional text with zero calls", async () => {
    for (const invalid of [[], ["--public"], ["--help", "--public"], [...args, "--help"], [...args, "--module", "2"], [...args, "--public", "--public"], [...args, "--url", "https://example.com"], [...args, "https://example.com"], [...args, "position"], args.slice(0, -1), ["--module", "--inst-type"], ["--module=1", ...args.slice(2)], [...args.slice(0, 1), "99", ...args.slice(2)], [...args.slice(0, 5), "https://static.okx.com/a.zip", ...args.slice(6)]]) {
      const s = setup();
      expect(await runArchiveDiscoveryCli(invalid, s.ports)).toBe(2);
      expect(s.fake.calls).toHaveLength(0);
      expect(s.stdout).toEqual([]);
      expect(s.stderr).toHaveLength(1);
      expect(s.stderr[0]).toContain("invalid_request");
      expect(s.stderr[0]).not.toContain("example.com");
    }
  });
  test("invalid public query is still rejected before sending", async () => {
    const s = setup();
    const invalid = [...args]; invalid[11] = "0";
    expect(await runArchiveDiscoveryCli([...invalid, "--public"], s.ports)).toBe(2);
    expect(s.fake.calls).toHaveLength(0);
  });
  test("HTTP, API, schema and network failures exit1 without successful output or retries", async () => {
    for (const [reply, kind] of [[{ status: 429, body: "private provider text" }, "rate_limited"], [{ status: 503 }, "http"], [{ body: envelope([], "51000", "private provider text") }, "api"], [{ body: envelope([{ unknown: "field" }]) }, "schema"], [{ throws: new Error("private network text") }, "network"]] as const) {
      const s = setup(reply);
      expect(await runArchiveDiscoveryCli([...args, "--public"], s.ports)).toBe(1);
      expect(s.fake.calls).toHaveLength(1);
      expect(s.stdout).toEqual([]);
      expect(s.stderr).toHaveLength(1);
      expect(s.stderr[0]).toContain(kind);
      expect(s.stderr[0]).not.toContain("private");
    }
  });
  test("failing output port exits1 with a bounded error", async () => {
    const s = setup();
    expect(await runArchiveDiscoveryCli(args, { ...s.ports, stdout: () => { throw new Error("private output error"); } })).toBe(1);
    expect(s.fake.calls).toHaveLength(0);
    expect(s.stderr).toEqual(["archive discovery failed: internal_error"]);
  });
});
