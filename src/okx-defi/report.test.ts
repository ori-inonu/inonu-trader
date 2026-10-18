import { expect, test } from "bun:test";
import { buildDefiReport, DefiReportError, type DefiErrorCode } from "./report.ts";

function capture(endpoint: "search" | "detail", data: unknown, capturedAtMs: number | null = 900) {
  return { schema: "okx_defi_capture_v1", endpoint, sourceClaim: "synthetic", capturedAtMs, response: { code: 0, data } };
}

function input() {
  return {
    search: capture("search", { total: 8, list: [{ investmentId: "00123", chainIndex: "1", name: "Produto busca", platformName: "Plataforma", rate: "0.123400", tvl: "0", feeRate: "0" }] }),
    detail: capture("detail", { investmentId: "00123", chainIndex: "1", investmentName: "Produto detalhe", platformName: "Plataforma", rate: "12.34", rateTypeDesc: "APY", tvl: "0", feeRate: "0", isInvestable: true, isSupportRedeem: true, isSupportClaim: true }),
    nowMs: 1000,
    maxAgeMs: 100,
  };
}

test("D1-D4: matching identities preserve independent observations and never qualify execution", () => {
  const report = buildDefiReport(input());
  expect(report.observations.map((row) => row.source)).toEqual(["search", "detail"]);
  expect(report.association).toEqual({ status: "identity_match_unverified", searchIndex: 0, detailIndex: 1 });
  expect(report.searchCoverage).toEqual({ claimedTotal: 8, observedCount: 1, status: "partial_unverified" });
  expect(report.observations[0]!.identity).toEqual({ investmentId: "00123", representation: "text", chainIndex: "1" });
  expect(report.observations[0]!.advertisedYield).toEqual({ value: "0.123400", label: "APY", unit: "decimal_fraction" });
  expect(report.observations[1]!.advertisedYield).toEqual({ value: "12.34", label: "APY", unit: "unknown" });
  expect(report.observations[1]!.tvl).toEqual({ value: "0", unit: "unknown" });
  expect(report.execution).toBe("not_qualified");
  expect([report.netReturn, report.executableExit, report.totalCosts]).toEqual([null, null, null]);
  expect(report.personalEligibility).toBe("unknown");
});

function fails(value: Parameters<typeof buildDefiReport>[0], code: DefiErrorCode) {
  try {
    buildDefiReport(value);
  } catch (error) {
    expect(error).toBeInstanceOf(DefiReportError);
    if (!(error instanceof DefiReportError)) throw error;
    expect(error.code).toBe(code);
    expect(error.message).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

test("D1: only a numeric success envelope with object data is accepted", () => {
  for (const code of ["0", 1, null, false, {}, "PRIVATE_SENTINEL"]) {
    fails({ ...input(), search: { ...input().search, response: { code, data: { total: 0, list: [] }, msg: "PRIVATE_SENTINEL" } } }, "invalid_envelope");
  }
  for (const data of [null, [], 3, "PRIVATE_SENTINEL"]) {
    fails({ ...input(), detail: capture("detail", data) }, "invalid_envelope");
  }
  for (const response of [undefined, null, [], 0]) {
    fails({ ...input(), search: { ...input().search, response } }, "invalid_envelope");
  }
});

test("D1: capture schema endpoint and source claim cannot be inferred", () => {
  for (const search of [null, [], 1, {}, { ...input().search, schema: "unknown" }, { ...input().search, endpoint: "detail" }, { ...input().search, sourceClaim: "verified" }]) {
    fails({ ...input(), search }, "invalid_capture");
  }
  fails({ ...input(), detail: { ...input().detail, endpoint: "search" } }, "invalid_capture");
});

test("D1: a single page may be empty or contain twenty products while remaining partial", () => {
  const empty = buildDefiReport({ ...input(), search: capture("search", { total: 0, list: [] }) });
  expect(empty.association).toEqual({ status: "unmatched", searchIndex: null, detailIndex: 0 });
  expect(empty.observations).toHaveLength(1);
  const list = Array.from({ length: 20 }, (_, index) => ({ investmentId: `p${index}`, chainIndex: "1" }));
  const full = buildDefiReport({ ...input(), search: capture("search", { total: 100, list }) });
  expect(full.observations).toHaveLength(21);
  expect(full.searchCoverage).toEqual({ claimedTotal: 100, observedCount: 20, status: "partial_unverified" });
  for (const data of [{ total: 21, list: [...list, { investmentId: "last", chainIndex: "1" }] }, { total: 0, list: [list[0]] }, { total: -1, list: [] }, { total: 0.5, list: [] }, { total: Number.MAX_SAFE_INTEGER + 1, list: [] }, { total: "0", list: [] }, { total: 0, list: null }, { total: 1, list: [null] }, { total: 1, list: [[]] }]) {
    fails({ ...input(), search: capture("search", data) }, "invalid_search");
  }
});

test("D1/D4: clocks are bounded explicit integers and freshness is local capture age", () => {
  for (const nowMs of [-1, 0.5, NaN, Infinity, 8640000000000001]) fails({ ...input(), nowMs }, "invalid_clock");
  for (const maxAgeMs of [0, -1, 0.5, NaN, Infinity, 3600001]) fails({ ...input(), maxAgeMs }, "invalid_clock");
  for (const capturedAtMs of [undefined, "900", -1, 0.5, NaN, Infinity, 8640000000000001]) {
    fails({ ...input(), search: { ...input().search, capturedAtMs } }, "invalid_clock");
  }
  const boundary = buildDefiReport({ ...input(), nowMs: 8640000000000000, maxAgeMs: 3600000, search: capture("search", { total: 0, list: [] }, null), detail: capture("detail", { investmentId: "1", chainIndex: "1" }, 8640000000000000) });
  expect(boundary.observations[0]!.provenance.ageMs).toBe(0);
  for (const [timestamp, ageMs, freshness] of [[null, null, "unknown"], [1001, null, "future"], [900, 100, "fresh_local_capture"], [899, 101, "stale"], [0, 1000, "stale"]] as const) {
    const result = buildDefiReport({ ...input(), detail: { ...input().detail, capturedAtMs: timestamp, providerTimestampMs: 1000, providerTtlMs: 100000 } });
    expect(result.observations[1]!.provenance).toEqual({ sourceClaim: "synthetic", verification: "unverified", capturedAtMs: timestamp, ageMs, freshness, providerTimestampMs: null, providerTtlMs: null });
  }
});

test("D2: product identity preserves exact text and only accepts safe positive integer IDs", () => {
  for (const investmentId of ["00123", "p_1.foo:bar-2", "a".repeat(128), 123, Number.MAX_SAFE_INTEGER]) {
    const result = buildDefiReport({ ...input(), detail: capture("detail", { investmentId, chainIndex: "1" }) });
    expect(result.observations[1]!.identity).toEqual({ investmentId: String(investmentId), representation: typeof investmentId === "string" ? "text" : "safe_integer", chainIndex: "1" });
  }
  for (const investmentId of [undefined, null, "", "a".repeat(129), " 123", "123 ", "é", "a/b", "a\n", 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, {}, []]) {
    fails({ ...input(), detail: capture("detail", { investmentId, chainIndex: "1", name: "PRIVATE_SENTINEL" }) }, "invalid_identity");
  }
  for (const chainIndex of [undefined, null, 1, "0", "01", "1.0", "1 ", "-1", "1".repeat(21), "Ethereum"]) {
    fails({ ...input(), detail: capture("detail", { investmentId: "123", chainIndex, network: "Ethereum" }) }, "invalid_identity");
  }
  expect(buildDefiReport({ ...input(), detail: capture("detail", { investmentId: "x", chainIndex: "9".repeat(20) }) }).observations[1]!.identity.chainIndex).toBe("9".repeat(20));
});

test("D2: exact identity pairs detect duplicates and correlate without normalizing or substituting", () => {
  const data = { total: 2, list: [{ investmentId: "123", chainIndex: "1", platformName: "A" }, { investmentId: 123, chainIndex: "1", platformName: "B" }] };
  fails({ ...input(), search: capture("search", data) }, "duplicate_identity");
  const search = capture("search", { total: 2, list: [{ investmentId: "00123", chainIndex: "1" }, { investmentId: 123, chainIndex: "1" }] });
  const exact = buildDefiReport({ ...input(), search, detail: capture("detail", { investmentId: "123", chainIndex: "1" }) });
  expect(exact.association).toEqual({ status: "identity_match_unverified", searchIndex: 1, detailIndex: 2 });
  expect(exact.observations.map((row) => row.identity.representation)).toEqual(["text", "safe_integer", "text"]);
  const networkMismatch = buildDefiReport({ ...input(), search, detail: capture("detail", { investmentId: "123", chainIndex: "2", network: "same label" }) });
  expect(networkMismatch.association).toEqual({ status: "unmatched", searchIndex: null, detailIndex: 2 });
  const distinct = buildDefiReport({ ...input(), search: capture("search", { total: 2, list: [{ investmentId: "a:1", chainIndex: "2" }, { investmentId: "a", chainIndex: "12" }] }) });
  expect(distinct.observations).toHaveLength(3);
});

test("D3: missing optionals become finite unknowns and search extras are inapplicable", () => {
  const value = buildDefiReport({ ...input(), search: capture("search", { total: 1, list: [{ investmentId: "1", chainIndex: "1", analysisPlatformId: "private", network: "private", isInvestable: true, isSupportRedeem: true, isSupportClaim: true }] }), detail: capture("detail", { investmentId: "1", chainIndex: "1" }) });
  expect(value.observations[0]!.issues).toEqual([
    { field: "productName", code: "missing_optional" }, { field: "platformName", code: "missing_optional" }, { field: "advertisedYield.value", code: "missing_optional" }, { field: "tvl.value", code: "missing_optional" }, { field: "fee.value", code: "missing_optional" },
  ]);
  expect([value.observations[0]!.platformId, value.observations[0]!.network]).toEqual([null, null]);
  expect(value.observations[0]!.capabilities).toEqual({ isInvestable: null, isSupportRedeem: null, isSupportClaim: null });
  expect(value.observations[1]!.issues).toHaveLength(11);
  expect(value.observations[1]!.issues.every((issue) => issue.code === "missing_optional")).toBe(true);
});

test("D3: optional text honors exact UTF16 bounds and excludes whitespace or control text", () => {
  const valid = { investmentId: "1", chainIndex: "1", investmentName: "  Café 🍵  ", platformName: "p".repeat(160), analysisPlatformId: "a".repeat(128), network: "n".repeat(80), rateTypeDesc: "l".repeat(32) };
  const result = buildDefiReport({ ...input(), detail: capture("detail", valid) }).observations[1]!;
  expect(result.productName).toBe("  Café 🍵  ");
  expect(result.platformName).toBe("p".repeat(160));
  for (const [field, values] of [["investmentName", ["", " \t ", "\nsecret", "\u0000secret", "\u0085secret", "x".repeat(161), "🍵".repeat(81)]], ["platformName", ["x".repeat(161)]], ["analysisPlatformId", ["x".repeat(129)]], ["network", ["x".repeat(81)]], ["rateTypeDesc", ["x".repeat(33)]]] as const) {
    for (const invalid of values) {
      const row = buildDefiReport({ ...input(), detail: capture("detail", { ...valid, [field]: invalid }) }).observations[1]!;
      expect(row.issues.filter((issue) => issue.code === "invalid_optional")).toHaveLength(1);
      const exported = field === "investmentName" ? row.productName : field === "platformName" ? row.platformName : field === "analysisPlatformId" ? row.platformId : field === "network" ? row.network : row.advertisedYield.label;
      expect(exported).toBeNull();
    }
  }
});

test("D3: decimals remain exact text while unsupported numeric forms become unknown", () => {
  for (const rate of ["0", "-0", "-0.125", "99999999999999999999999999.000000001", "1".repeat(96)]) {
    const row = buildDefiReport({ ...input(), detail: capture("detail", { investmentId: "1", chainIndex: "1", rate, tvl: "0", feeRate: "0" }) }).observations[1]!;
    expect(row.advertisedYield.value).toBe(rate);
    expect(row.fee).toEqual({ value: "0", basis: "unknown", completeCost: null });
  }
  for (const bad of [0, 0.1, "01", "+1", "1e2", "1%", "1.", ".1", " 1", "1\n", "Infinity", "NaN", "1".repeat(97), {}, []]) {
    const row = buildDefiReport({ ...input(), detail: capture("detail", { investmentId: "1", chainIndex: "1", rate: bad, tvl: bad, feeRate: bad, rateType: 1 }) }).observations[1]!;
    expect([row.advertisedYield.value, row.tvl.value, row.fee.value, row.advertisedYield.label]).toEqual([null, null, null, null]);
    expect(row.issues.filter((issue) => issue.code === "invalid_optional").map((issue) => issue.field)).toEqual(["advertisedYield.value", "tvl.value", "fee.value"]);
  }
  for (const bad of ["-0", "-1.2"]) {
    const row = buildDefiReport({ ...input(), detail: capture("detail", { investmentId: "1", chainIndex: "1", tvl: bad, feeRate: bad }) }).observations[1]!;
    expect([row.tvl.value, row.fee.value]).toEqual([null, null]);
  }
});

test("D3/D4: strict booleans and whitelist cannot promote execution or export private extras", () => {
  const extra = { secret: "PRIVATE_SENTINEL", underlyingToken: [{ address: "PRIVATE_SENTINEL" }], calldata: "PRIVATE_SENTINEL", url: "PRIVATE_SENTINEL", qualified: true, netReturn: "PRIVATE_SENTINEL", providerTimestampMs: 1000, providerTtlMs: 5000 };
  const original = { ...input(), search: { ...input().search, ...extra, response: { code: 0, msg: "PRIVATE_SENTINEL", data: { total: 1, list: [{ investmentId: "00123", chainIndex: "1", name: "Busca", rate: "900", tvl: "999999999999", feeRate: "0", ...extra, isInvestable: true }] } } }, detail: capture("detail", { investmentId: "00123", chainIndex: "1", ...extra, rate: "900", tvl: "999999999999", feeRate: "0", isInvestable: "true", isSupportRedeem: 1, isSupportClaim: false }) };
  const before = JSON.stringify(original);
  const report = buildDefiReport(original);
  expect(JSON.stringify(original)).toBe(before);
  expect(JSON.stringify(report)).not.toContain("PRIVATE_SENTINEL");
  expect(report.observations[1]!.capabilities).toEqual({ isInvestable: null, isSupportRedeem: null, isSupportClaim: false });
  expect(report.execution).toBe("not_qualified");
  expect([report.netReturn, report.totalCosts, report.executableExit]).toEqual([null, null, null]);
  const imported = buildDefiReport({ ...input(), detail: { ...input().detail, sourceClaim: "okx_api_claimed" } });
  expect(imported.mode).toBe("imported");
  expect(imported.observations.map((row) => row.provenance.verification)).toEqual(["unverified", "unverified"]);
});
