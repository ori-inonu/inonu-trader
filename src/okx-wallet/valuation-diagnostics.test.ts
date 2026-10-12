import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { buildWalletValuationDiagnostics, WalletValuationDiagnosticsError } from "./valuation-diagnostics";

const ADDRESS = "0xabcdef0000000000000000000000000000000001";
const CONTRACT = "0xabcdef0000000000000000000000000000000002";
const NOW = 1_760_000_000_000;
const MAX_AGE = 60_000;

function asset(overrides: Record<string, unknown> = {}) {
  return { chainIndex: "196", tokenContractAddress: CONTRACT, address: ADDRESS, symbol: "FIXTURE",
    balance: "0002.5000", rawBalance: "2500000000000000000", tokenPrice: "01.2000", isRiskToken: false, ...overrides };
}

function capture(rows: Record<string, unknown>[] = [asset()]) {
  return { schema: "okx_wallet_balance_capture_v1", endpoint: "all_token_balances", sourceClaim: "synthetic",
    capturedAtMs: NOW - 10, request: { address: ADDRESS, chains: ["196", "143"], excludeRiskToken: "0" },
    response: { code: "0", data: [{ tokenAssets: rows }] } };
}

function diagnose(input: unknown = capture(), nowMs = NOW, maxAgeMs = MAX_AGE) {
  return buildWalletValuationDiagnostics({ capture: input, nowMs, maxAgeMs });
}

function closedError(input: unknown, code: string, nowMs = NOW, maxAgeMs = MAX_AGE) {
  let error: unknown;
  try { diagnose(input, nowMs, maxAgeMs); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(WalletValuationDiagnosticsError);
  expect(error).toMatchObject({ code, message: code });
}

function unknownMoney(report: ReturnType<typeof diagnose>) {
  expect(report).toMatchObject({ execution: "not_qualified", eligibility: "unknown", completePortfolioValueUsd: null,
    netReturnUsd: null, realizedNetUsd: null, totalCostsUsd: null, executableExitLiquidityUsd: null, reinvestableUsd: null });
  for (const row of report.rows) expect(row.rowValueUsd).toBeNull();
}

test("T01 preserves the original capture, exact field texts, group locators and financial unknowns", () => {
  const input = { ...capture(), extra: { explanation: "declared", numeric: -0 },
    request: { ...capture().request, extra: [1, true] },
    response: { code: 0, message: "success", data: [
      { group: "first", tokenAssets: [asset({ tokenExtra: { kept: true } })] },
      { group: "second", tokenAssets: [asset({ chainIndex: "143", balance: "0", tokenPrice: "0", isRiskToken: true })] }
    ] } };
  const result = diagnose(input);
  expect(result).toMatchObject({ schema: "okx_wallet_valuation_diagnostics_v1", method: "GET",
    path: "/api/v6/dex/balance/all-token-balances-by-address", sourceClaim: "synthetic", verification: "unverified",
    generatedAtMs: NOW, capturedAtMs: NOW - 10, maxAgeMs: MAX_AGE, selection: input.request });
  expect(JSON.stringify(result.capture)).toBe(JSON.stringify(input));
  expect(result.representedCaptureSha256).toBe(createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex"));
  expect(result.rows.map(row => row.locator)).toEqual(["/response/data/0/tokenAssets/0", "/response/data/1/tokenAssets/0"]);
  expect(result.rows[0]!.fields.balance).toEqual({ presence: "present", jsonType: "string", rawValue: "0002.5000", issues: [],
    syntax: "decimal_text", decimalText: "0002.5000", unit: "unknown", scale: "unknown" });
  expect(result.rows[0]!.fields.rawBalance).toMatchObject({ rawValue: "2500000000000000000", unit: "unknown", scale: "unknown" });
  expect(result.rows[0]!.fields.tokenPrice).toEqual({ presence: "present", jsonType: "string", rawValue: "01.2000", issues: [],
    syntax: "decimal_text", decimalText: "01.2000", documentedUnit: "USD" });
  expect(result.rows[1]!.fields.balance).toMatchObject({ presence: "present", rawValue: "0", decimalText: "0" });
  expect(result.rows[1]!.riskClaim).toBe(true);
  unknownMoney(result);
});

test("T04 distinguishes declared capture age from unknown provider price freshness", () => {
  const cases = [
    [null, null, "unknown"], [NOW + 1, null, "future"], [NOW, 0, "fresh_local_capture"],
    [NOW - MAX_AGE, MAX_AGE, "fresh_local_capture"], [NOW - MAX_AGE - 1, MAX_AGE + 1, "stale"]
  ] as const;
  for (const [capturedAtMs, localAgeMs, localFreshness] of cases) {
    const result = diagnose({ ...capture(), capturedAtMs, providerTimestamp: NOW });
    expect(result).toMatchObject({ localAgeMs, localFreshness, providerPriceAsOfMs: null, providerPriceFreshness: "unknown" });
  }
  for (const now of [0, -1, 1.5, NaN, Infinity, 8_640_000_000_000_001]) closedError(null, "invalid_clock", now);
  for (const age of [0, -1, 1.5, NaN, Infinity, 3_600_001]) closedError(null, "invalid_clock", NOW, age);
  for (const capturedAtMs of [0, -1, 1.5, 8_640_000_000_000_001]) closedError({ ...capture(), capturedAtMs }, "invalid_capture");
  expect(diagnose({ ...capture(), capturedAtMs: 1 }, 8_640_000_000_000_000, 3_600_000).localAgeMs).toBe(8_639_999_999_999_999);
  expect(diagnose({ ...capture(), capturedAtMs: 1 }, 1, 1).localFreshness).toBe("fresh_local_capture");
});

test("T05 retains all returned rows and treats unreported requested chains as unknown", () => {
  for (const [excludeRiskToken, filterClaim] of [[null, "default_filtered_claimed"], ["0", "filtered_claimed"], ["1", "unfiltered_claimed"]] as const) {
    const input = { ...capture(), request: { ...capture().request, chains: ["143", "196", "501"], excludeRiskToken },
      response: { code: "0", data: [{ tokenAssets: [] }, { tokenAssets: [
        asset(), asset({ chainIndex: "1" }), asset({ chainIndex: "9999" }), asset({ chainIndex: 196, isRiskToken: "false" })
      ] }] } };
    const result = diagnose(input);
    expect(result.coverage).toBe("partial_unverified");
    expect(result.requestedChains).toEqual([
      { chainIndex: "143", observedRowCount: 0, accountMatchRowCount: 0, presence: "not_reported" },
      { chainIndex: "196", observedRowCount: 1, accountMatchRowCount: 1, presence: "observed" },
      { chainIndex: "501", observedRowCount: 0, accountMatchRowCount: 0, presence: "not_reported" }
    ]);
    expect(result.rows).toHaveLength(4);
    expect(result.outsideSelectionLocators).toEqual(["/response/data/1/tokenAssets/1"]);
    expect(result.unknownChainLocators).toEqual(["/response/data/1/tokenAssets/2", "/response/data/1/tokenAssets/3"]);
    expect(result).toMatchObject({ filterClaim, actualRiskFilter: "unknown" });
    expect(result.rows[3]!.riskClaim).toBeNull();
    unknownMoney(result);
  }
  for (const data of [[], [{ tokenAssets: [] }]]) {
    const result = diagnose({ ...capture(), response: { code: 0, data } });
    expect(result.rows).toEqual([]);
    expect(result.requestedChains).toEqual([
      { chainIndex: "196", observedRowCount: 0, accountMatchRowCount: 0, presence: "not_reported" },
      { chainIndex: "143", observedRowCount: 0, accountMatchRowCount: 0, presence: "not_reported" }
    ]);
    unknownMoney(result);
  }
});

test("T07 marks every candidate duplicate across groups without economic deduplication", () => {
  const upper = (value: string) => "0x" + value.slice(2).toUpperCase();
  const input = { ...capture(), response: { code: "0", data: [
    { tokenAssets: [asset(), asset({ tokenContractAddress: "" }), asset({ tokenContractAddress: ADDRESS })] },
    { tokenAssets: [asset({ address: upper(ADDRESS), tokenContractAddress: upper(CONTRACT), symbol: "DIFFERENT" }),
      asset({ tokenContractAddress: "", balance: "8" }), asset({ chainIndex: "143" }),
      asset({ tokenContractAddress: null }), asset({ tokenContractAddress: "invalid" }),
      asset({ address: "invalid" }), asset({ chainIndex: "9999" })] }
  ] } };
  const result = diagnose(input);
  const locator = (group: number, row: number) => `/response/data/${group}/tokenAssets/${row}`;
  const contractKey = JSON.stringify(["196", ADDRESS, ["contract", CONTRACT]]);
  const nativeKey = JSON.stringify(["196", ADDRESS, ["native_marker"]]);
  expect(result.economicDeduplication).toBe("not_performed");
  expect(result.rows).toHaveLength(10);
  expect(result.duplicateCandidates).toEqual([
    { key: contractKey, locators: [locator(0, 0), locator(1, 0)] },
    { key: nativeKey, locators: [locator(0, 1), locator(1, 1)] }
  ]);
  for (const index of [0, 1, 3, 4]) expect(result.rows[index]!.candidateDuplicate).toBe(true);
  expect(result.rows[0]!.candidateIdentity).toEqual({ key: contractKey, chainIndex: "196", address: ADDRESS,
    asset: { kind: "contract", address: CONTRACT } });
  expect(result.rows[1]!.candidateIdentity).toEqual({ key: nativeKey, chainIndex: "196", address: ADDRESS,
    asset: { kind: "native_marker" } });
  for (const index of [2, 5]) {
    expect(result.rows[index]!.candidateDuplicate).toBe(false);
  }
  for (const row of result.rows.slice(6)) {
    expect(row.candidateIdentity).toBeNull();
    expect(row.candidateDuplicate).toBe(false);
  }
  expect(JSON.stringify(result.capture)).toBe(JSON.stringify(input));
  unknownMoney(result);
});

test("T07 maximum duplicate input lists locators once per candidate group", () => {
  const result = diagnose(capture(Array.from({ length: 4096 }, () => ({ chainIndex: "196", address: ADDRESS, tokenContractAddress: "" }))));
  expect(result.rows).toHaveLength(4096);
  expect(result.rows.every(row => row.candidateDuplicate)).toBe(true);
  expect(result.rows.every(row => !Object.hasOwn(row, "duplicateLocators"))).toBe(true);
  expect(result.duplicateCandidates).toHaveLength(1);
  expect(result.duplicateCandidates[0]!.locators).toHaveLength(4096);
  expect(result.duplicateCandidates[0]!.locators[4095]).toBe("/response/data/0/tokenAssets/4095");
});

test("T09 accepts exact resource boundaries and rejects non-JSON trees without invoking accessors", () => {
  const nested = (depth: number): unknown => {
    let result: unknown = null;
    for (let index = 0; index < depth; index++) result = { next: result };
    return result;
  };
  expect(diagnose({ ...capture([]), extra: nested(31) }).rows).toEqual([]);
  closedError({ ...capture([]), extra: nested(32) }, "input_limit");
  expect(diagnose({ ...capture([]), response: { code: 0, data: Array.from({ length: 256 }, () => ({ tokenAssets: [] })) } }).rows).toEqual([]);
  closedError({ ...capture([]), response: { code: 0, data: Array.from({ length: 257 }, () => ({ tokenAssets: [] })) } }, "input_limit");
  expect(diagnose(capture(Array.from({ length: 4096 }, () => ({})))).rows).toHaveLength(4096);
  closedError(capture(Array.from({ length: 4097 }, () => ({}))), "input_limit");
  const padded = { ...capture([]), padding: "é" };
  const fixedBytes = Buffer.byteLength(JSON.stringify(padded), "utf8") - 2;
  padded.padding += "x".repeat(1_048_576 - fixedBytes - 2);
  expect(Buffer.byteLength(JSON.stringify(padded), "utf8")).toBe(1_048_576);
  expect(diagnose(padded).rows).toEqual([]);
  padded.padding += "x";
  closedError(padded, "input_limit");
  let accesses = 0;
  const getter = Object.defineProperty({}, "secret", { enumerable: true, get() { accesses++; throw new Error("private-value"); } });
  const nonEnumerable = Object.defineProperty({}, "secret", { value: "private-value", enumerable: false });
  const symbol = { [Symbol("secret")]: "private-value" };
  const hole = Array(1);
  const arrayProperty = Object.assign([1], { extra: true });
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  const inherited = Object.create({ extra: "runtime" });
  const failingProxy = new Proxy({}, { ownKeys() { throw new Error("private-value"); } });
  for (const extra of [getter, nonEnumerable, symbol, hole, arrayProperty, cycle, inherited, failingProxy,
    undefined, NaN, Infinity, -Infinity, 1n, () => 1, new Date(), new Map(), new Set(), new Uint8Array(1)]) {
    closedError({ ...capture([]), extra }, "invalid_capture");
  }
  expect(accesses).toBe(0);
  const shared = { value: "retained" };
  const nullPrototype = Object.assign(Object.create(null), { value: "retained" });
  expect(diagnose({ ...capture([]), extras: [shared, shared, nullPrototype] }).capture.extras).toEqual([shared, shared, { value: "retained" }]);
});

test("T02 distinguishes missing, empty and divergent fields without coercing decimal text", () => {
  const names = ["chainIndex", "tokenContractAddress", "address", "symbol", "balance", "rawBalance", "tokenPrice", "isRiskToken"] as const;
  for (const name of names) {
    const missing: Record<string, unknown> = asset(); delete missing[name];
    expect(diagnose(capture([missing])).rows[0]!.fields[name]).toMatchObject({ presence: "absent", jsonType: "absent", rawValue: null, issues: ["missing_field"] });
    for (const [value, jsonType] of [["", "string"], [null, "null"], [0, "number"], [false, "boolean"], [[], "array"], [{ nested: "retained" }, "object"]] as const) {
      const field = diagnose(capture([asset({ [name]: value })])).rows[0]!.fields[name];
      expect(field).toMatchObject({ presence: value === "" ? "empty" : "present", jsonType, rawValue: value,
        issues: jsonType === (name === "isRiskToken" ? "boolean" : "string") ? [] : ["invalid_type"] });
    }
  }
  for (const name of ["balance", "rawBalance", "tokenPrice"] as const) {
    for (const value of ["0", "000.0000", "123456789012345678901234567890.0123456789"]) {
      expect(diagnose(capture([asset({ [name]: value })])).rows[0]!.fields[name]).toMatchObject({ presence: "present", syntax: "decimal_text", decimalText: value, rawValue: value });
    }
    for (const value of ["+1", "-1", "1e2", "1E2", " 1", "1 ", ".1", "1.", "１２", "NaN", "1\n"]) {
      expect(diagnose(capture([asset({ [name]: value })])).rows[0]!.fields[name]).toMatchObject({ syntax: "invalid_text", decimalText: null, rawValue: value });
    }
    expect(diagnose(capture([asset({ [name]: "" })])).rows[0]!.fields[name]).toMatchObject({ presence: "empty", syntax: "empty", decimalText: null });
    expect(diagnose(capture([asset({ [name]: 1 })])).rows[0]!.fields[name]).toMatchObject({ syntax: null, decimalText: null, rawValue: 1 });
  }
});

test("T03 preserves oversized quantities and never infers units from native decimals", () => {
  const huge = "9".repeat(400) + ".0000";
  for (const chainIndex of ["196", "143"]) {
    const result = diagnose(capture([asset({ chainIndex, tokenContractAddress: "", balance: huge, rawBalance: huge, tokenPrice: "0" })]));
    expect(result.rows[0]!.fields.balance).toMatchObject({ decimalText: huge, unit: "unknown", scale: "unknown" });
    expect(result.rows[0]!.fields.rawBalance).toMatchObject({ decimalText: huge, unit: "unknown", scale: "unknown" });
    expect(result.rows[0]!.fields.tokenPrice).toMatchObject({ decimalText: "0", documentedUnit: "USD" });
    unknownMoney(result);
  }
});

test("T06 validates account syntax by family and compares case only for EVM", () => {
  const upper = "0x" + ADDRESS.slice(2).toUpperCase();
  const evm = diagnose(capture([asset({ address: upper }), asset({ address: CONTRACT }), asset({ address: "0X" + ADDRESS.slice(2) }),
    asset({ address: "invalid" }), asset({ chainIndex: "1" }), asset({ chainIndex: "501", address: "A".repeat(32), tokenContractAddress: "B".repeat(32) })]));
  expect(evm.rows.map(row => row.accountAssociation)).toEqual(["format_match_unverified", "mismatch", "unknown", "unknown", "format_match_unverified", "unknown"]);
  expect(evm.rows[4]!.selectionMembership).toBe("outside_selection");
  expect(evm.rows[5]!.candidateIdentity?.address).toBe("A".repeat(32));
  for (const [chainIndex, address, other, contract] of [
    ["501", "A".repeat(32), "a" + "A".repeat(31), "B".repeat(32)],
    ["195", "T" + "A".repeat(33), "Ta" + "A".repeat(32), "T" + "B".repeat(33)],
    ["784", "0x" + "a".repeat(64), "0xA" + "a".repeat(63), "0x" + "b".repeat(64)],
    ["607", "x".repeat(48), "X" + "x".repeat(47), "y".repeat(48)],
    ["0", "1" + "A".repeat(25), "1a" + "A".repeat(24), "3" + "B".repeat(25)]
  ]) {
    const input = { ...capture([asset({ chainIndex, address, tokenContractAddress: contract }),
      asset({ chainIndex, address: other, tokenContractAddress: contract }), asset({ chainIndex, address: "invalid" })]),
      request: { address, chains: [chainIndex], excludeRiskToken: null } };
    const result = diagnose(input);
    expect(result.rows.map(row => row.accountAssociation)).toEqual(["format_match_unverified", "mismatch", "unknown"]);
    expect(result.rows[0]!.candidateIdentity?.address).toBe(address);
    expect(result.rows[1]!.candidateIdentity?.address).toBe(other);
    expect(result.duplicateCandidates).toEqual([]);
    expect(result.requestedChains[0]).toMatchObject({ observedRowCount: 3, accountMatchRowCount: 1 });
  }
});

test("T08 rejects invalid capture and envelope structure with closed errors", () => {
  for (const code of [0, "0"]) expect(diagnose({ ...capture(), response: { ...capture().response, code } }).rows).toHaveLength(1);
  for (const value of [null, [], 1, "raw-private-value", { ...capture(), schema: "other" }, { ...capture(), endpoint: "other" },
    { ...capture(), sourceClaim: "imported" }, { ...capture(), capturedAtMs: "private-value" }, { ...capture(), request: null }]) closedError(value, "invalid_capture");
  for (const name of ["schema", "endpoint", "sourceClaim", "capturedAtMs", "request"]) {
    const input: Record<string, unknown> = capture(); delete input[name]; closedError(input, "invalid_capture");
  }
  for (const changes of [{ address: "invalid" }, { address: 0 }, { chains: [] }, { chains: ["196", "196"] },
    { chains: ["unknown"] }, { chains: "196" }, { chains: [196] }, { chains: Array(51).fill("196") },
    { excludeRiskToken: 0 }, { excludeRiskToken: false }, { excludeRiskToken: "2" }]) {
    closedError({ ...capture(), request: { ...capture().request, ...changes } }, "invalid_capture");
  }
  for (const name of ["address", "chains", "excludeRiskToken"]) {
    const request: Record<string, unknown> = capture().request; delete request[name];
    closedError({ ...capture(), request }, "invalid_capture");
  }
  for (const response of [null, [], {}, { code: false, data: [] }, { code: "1", message: "private-value", data: [] },
    { code: 0 }, { code: 0, data: {} }, { code: 0, data: [null] }, { code: 0, data: [[]] },
    { code: 0, data: [{}] }, { code: 0, data: [{ tokenAssets: {} }] },
    { code: 0, data: [{ tokenAssets: [null] }] }, { code: 0, data: [{ tokenAssets: [[]] }] }]) {
    closedError({ ...capture(), response }, "invalid_envelope");
  }
  const noResponse: Record<string, unknown> = capture(); delete noResponse.response; closedError(noResponse, "invalid_envelope");
});

test("T10 is deterministic, copies mutable input and has no I/O, environment or model accesses", () => {
  const input = { ...capture([asset({ symbol: { nested: ["original"] } })]), extra: { nested: ["original"], number: -0 } };
  const original = JSON.stringify(input);
  const first = diagnose(input), second = diagnose(input);
  expect(first).toEqual(second);
  expect(JSON.stringify(input)).toBe(original);
  expect((first.capture.extra as { number: number }).number).toBe(0);
  input.extra.nested[0] = "changed-input";
  (first.capture.extra as { nested: string[] }).nested[0] = "changed-output";
  (first.rows[0]!.fields.symbol.rawValue as { nested: string[] }).nested[0] = "changed-output-field";
  expect(input.extra.nested[0]).toBe("changed-input");
  expect((input.response.data[0]!.tokenAssets[0]!.symbol as { nested: string[] }).nested[0]).toBe("original");
  expect((second.capture.extra as { nested: string[] }).nested[0]).toBe("original");
  expect((second.rows[0]!.fields.symbol.rawValue as { nested: string[] }).nested[0]).toBe("original");
  const reversed = Object.fromEntries(Object.entries(capture()).reverse());
  expect(diagnose(reversed).representedCaptureSha256).not.toBe(diagnose(capture()).representedCaptureSha256);
  expect(diagnose(reversed).representedCaptureSha256).toBe(createHash("sha256").update(JSON.stringify(reversed), "utf8").digest("hex"));

  // Mocks stay in a separate process so other test files cannot inherit them.
  const moduleUrl = pathToFileURL(`${import.meta.dir}/valuation-diagnostics.ts`).href;
  const script = `
    import { mock } from "bun:test";
    let accesses = 0;
    const forbidden = () => { accesses++; throw new Error("forbidden_access"); };
    for (const name of ["node:fs", "node:fs/promises"]) mock.module(name, () => ({
      readFile: forbidden, readFileSync: forbidden, writeFile: forbidden, writeFileSync: forbidden,
      open: forbidden, openSync: forbidden, readdir: forbidden, stat: forbidden, existsSync: forbidden
    }));
    for (const name of ["node:http", "node:https", "node:net", "node:tls"]) mock.module(name, () => ({
      request: forbidden, get: forbidden, connect: forbidden, createConnection: forbidden, createServer: forbidden
    }));
    mock.module("ai", () => ({ experimental_evaluate: forbidden, generateText: forbidden, streamText: forbidden }));
    mock.module("@ai-sdk/typesafe-ai", () => ({ typeSafeAi: forbidden }));
    globalThis.fetch = forbidden;
    const { buildWalletValuationDiagnostics } = await import(${JSON.stringify(moduleUrl)});
    const originalEnv = process.env;
    process.env = new Proxy({}, { get: forbidden, has: forbidden, ownKeys: forbidden });
    try {
      const result = buildWalletValuationDiagnostics({ capture: ${JSON.stringify(capture())}, nowMs: ${NOW}, maxAgeMs: ${MAX_AGE} });
      if (result.execution !== "not_qualified") throw new Error("unexpected_execution");
    } finally { process.env = originalEnv; }
    if (accesses !== 0) throw new Error("forbidden_access_observed");
    process.stdout.write("pure_call_verified");
  `;
  const child = spawnSync(process.execPath, ["--no-env-file", "-e", script], { windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024 });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr.toString()).toBe("");
  expect(child.stdout.toString()).toBe("pure_call_verified");
});

test("T11 leaves an API-claimed fresh capture financially unqualified", () => {
  const input = { ...capture([asset({ balance: "123", rawBalance: "123000", tokenPrice: "9999", priceAsOfMs: NOW, decimals: 3 })]),
    sourceClaim: "okx_api_claimed", capturedAtMs: NOW, providerPriceAsOfMs: NOW, requestVerified: true };
  const result = diagnose(input);
  expect(result).toMatchObject({ sourceClaim: "okx_api_claimed", verification: "unverified", localFreshness: "fresh_local_capture",
    providerPriceAsOfMs: null, providerPriceFreshness: "unknown", coverage: "partial_unverified", actualRiskFilter: "unknown" });
  expect(result.rows[0]!.fields.balance).toMatchObject({ unit: "unknown", scale: "unknown", decimalText: "123" });
  expect(JSON.stringify(result.capture)).toBe(JSON.stringify(input));
  unknownMoney(result);
});
