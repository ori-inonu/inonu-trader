import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { parseCaptureText } from "../src/lab/capture-format.ts";
import { CAPTURE_FILES } from "../src/onchainos/capture.ts";
import { CANARY_KEY, CANARY_PASSPHRASE, CANARY_SECRET, envelope, makeClock, makeFakeFetch, makeMemoryFs, makeMemoryFsState, type FakeCall, type FakeReply, type MemoryFsState } from "../src/onchainos/fakes.ts";
import { FIXTURES } from "../src/onchainos/fixtures.ts";
import { runCli, type CliIo } from "./onchainos-capture.ts";

const NOW_MS = 1_791_715_200_000; // 2026-10-11T10:40:00Z
const OUT = join("/mem", "cli-run");

const ROUTES: Record<string, keyof typeof FIXTURES> = {
  "/api/v5/market/ticker|BTC-USDT-SWAP": "public.ticker.swap/live",
  "/api/v5/market/ticker|BTC-USDT": "public.ticker.spot/live",
  "/api/v5/market/books|BTC-USDT-SWAP": "public.books.swap/live",
  "/api/v5/market/books|BTC-USDT": "public.books.spot/live",
  "/api/v5/market/candles|BTC-USDT-SWAP": "public.candles.swap/live",
  "/api/v5/market/candles|BTC-USDT": "public.candles.spot/live",
  "/api/v5/public/mark-price|BTC-USDT-SWAP": "public.mark-price/live",
  "/api/v5/public/funding-rate|BTC-USDT-SWAP": "public.funding-rate/live",
  "/api/v5/public/funding-rate-history|BTC-USDT-SWAP": "public.funding-rate-history/live",
  "/api/v5/public/open-interest|BTC-USDT-SWAP": "public.open-interest/live",
};

const TOKEN_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

function liveRoute(call: FakeCall): FakeReply {
  if (call.path.startsWith("/api/v6/")) {
    if (call.path === "/api/v6/dex/market/candles") return { body: envelope([[String(NOW_MS - 180_000), "1", "2", "0.5", "1.5", "10", "15", "1"]]) };
    return { body: envelope([{ chainIndex: "1", tokenContractAddress: TOKEN_ADDRESS, time: "1", price: "3200.5" }]) };
  }
  const instId = new URLSearchParams(call.query).get("instId") ?? "";
  const key = ROUTES[`${call.path}|${instId}`];
  return key === undefined ? { status: 404, body: "sem rota" } : { body: FIXTURES[key].body };
}

interface Harness {
  io: CliIo;
  out: string[];
  err: string[];
  calls: FakeCall[];
  state: MemoryFsState;
}

function harness(env: Record<string, string | undefined> = {}, route: (call: FakeCall) => FakeReply = liveRoute): Harness {
  const clock = makeClock(NOW_MS);
  const fake = makeFakeFetch(route, clock);
  const out: string[] = [];
  const err: string[] = [];
  const state = makeMemoryFsState();
  const io: CliIo = { env, stdout: (text) => out.push(text), stderr: (text) => err.push(text), fetch: fake.fetch, now: clock.now, sleep: clock.sleep, fs: makeMemoryFs(state) };
  return { io, out, err, calls: fake.calls, state };
}

const json = (h: Harness): Record<string, any> => JSON.parse(h.out.join(""));
const CREDENTIALS_ENV = { OKX_WEB3_API_KEY: CANARY_KEY, OKX_WEB3_API_SECRET: CANARY_SECRET, OKX_WEB3_API_PASSPHRASE: CANARY_PASSPHRASE };

// built from char codes so that this file does not contain the characters it forbids
const FORBIDDEN_TYPOGRAPHY = new RegExp(`[${String.fromCharCode(0x2014, 0x2013, 0x00b7, 0x2212, 0x2022)}]`);

describe("onchainos-capture CLI", () => {
  test("D22: --help prints the usage on stdout, exits 0 and touches nothing", async () => {
    const h = harness();
    expect(await runCli(["--help"], h.io)).toBe(0);
    const text = h.out.join("");
    for (const needle of ["plan", "run", "--allow-network", "--credentials-from-env", "OKX_WEB3_API_KEY", "OKX_WEB3_API_SECRET", "OKX_WEB3_API_PASSPHRASE", "--max-epochs", "--source", "--out", "public-okx", "onchainos"]) expect(text).toContain(needle);
    expect(text).toMatch(/nada .*prova lucro/i);
    expect(h.calls.length).toBe(0);
    expect(h.err.join("")).toBe("");
    expect(await runCli(["-h"], harness().io)).toBe(0);
    expect(await runCli([], harness().io)).toBe(2);
  });

  test("D22: plan with no arguments prints the calls of one epoch and the quota cost, without any network", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = ((): never => {
      throw new Error("fetch global usado");
    }) as unknown as typeof fetch;
    try {
      const h = harness();
      expect(await runCli(["plan"], h.io)).toBe(0);
      const plan = json(h);
      expect(h.calls.length).toBe(0);
      expect(plan.schema).toBe("onchainos-capture-plan-v1");
      expect(plan.network).toMatch(/nenhuma chamada/);
      expect(plan.source).toBe("public-okx");
      expect(plan.epochs).toBe(60);
      expect(plan.epochMs).toBe(60_000);
      expect(plan.requestsPerSecond).toBe(1);
      expect(plan.callsPerEpoch.length).toBe(10);
      expect(plan.callsPerEpoch[0]).toMatchObject({ endpointId: "public.ticker", method: "GET", path: "/api/v5/market/ticker", tier: "public", frequency: "every_epoch" });
      expect(plan.totals.minCalls).toBe(9 * 60 + 1);
      expect(plan.totals.maxCalls).toBe(9 * 60 + 60);
      expect(plan.totals.byTier.public).toEqual({ min: 541, max: 600 });
      expect(plan.totals.costKnown).toBe(true);
      expect(plan.totals.minDurationSeconds).toBe(600);
      expect(plan.totals.freeMonthlyAllowance).toMatchObject({ basic: 100_000, premium: 100_000 });
      expect(plan.notice).toMatch(/nada .*prova lucro/i);
      expect(h.err.join("")).toMatch(/Plano/);
      expect(h.err.join("")).toMatch(/sem rede/);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("D22: the onchainos plan counts basic and free calls per tier and compares with the free monthly allowance", async () => {
    const h = harness();
    const code = await runCli(["plan", "--source", "onchainos", "--token", `WETH-USDC=1:${TOKEN_ADDRESS},WBTC-USDC=1:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599`, "--max-epochs", "10", "--rps", "2"], h.io);
    expect(code).toBe(0);
    const plan = json(h);
    expect(plan.source).toBe("onchainos");
    expect(plan.callsPerEpoch.map((call: { endpointId: string; tier: string }) => `${call.endpointId}:${call.tier}`)).toEqual(["market.price.candles:basic", "market.price.candles:basic", "market.price.price:basic", "market.index.current-price:free"]);
    expect(plan.totals.byTier.basic).toEqual({ min: 30, max: 30 });
    expect(plan.totals.byTier.free).toEqual({ min: 10, max: 10 });
    expect(plan.totals.costKnown).toBe(true);
    expect(plan.totals.freeMonthlyAllowance.basicUsedPercentMax).toBeCloseTo(0.03, 6);
    expect(plan.totals.minDurationSeconds).toBe(20);
    expect(plan.requestsPerSecond).toBe(2);
    expect(JSON.stringify(plan)).not.toMatch(/credenc.*valor/i);
    expect(h.calls.length).toBe(0);
  });

  test("D22: plan filters by kind and instrument and reports a mistake as a usage error with exit 2", async () => {
    const small = harness();
    expect(await runCli(["plan", "--inst", "BTC-USDT-SWAP", "--kinds", "ticker,funding,mark", "--max-epochs", "5"], small.io)).toBe(0);
    expect(json(small).callsPerEpoch.map((call: { endpointId: string }) => call.endpointId)).toEqual(["public.ticker", "public.mark-price", "public.funding-rate", "public.funding-rate-history"]);
    const cases: string[][] = [
      ["plan", "--source", "kuru"],
      ["plan", "--source", "onchainos"],
      ["plan", "--source", "onchainos", "--token", "weth=1:0xabc"],
      ["plan", "--source", "onchainos", "--token", `WETH-USDC=1:${TOKEN_ADDRESS}`, "--kinds", "ticker"],
      ["plan", "--inst", "btc-usdt"],
      ["plan", "--kinds", "ticker,trade"],
      ["plan", "--bar", "1M"],
      ["plan", "--max-epochs", "0"],
      ["plan", "--max-epochs", "abc"],
      ["plan", "--rps", "6"],
      ["plan", "--rps", "0"],
      ["plan", "--epoch-ms", "10"],
      ["plan", "--unknown-flag"],
      ["plan", "extra"],
      ["plan", "--max-epochs"],
      ["plan", "--max-epochs", "1", "--max-epochs", "2"],
      ["plan", "--out", "x"],
      ["nope"],
    ];
    for (const argv of cases) {
      const h = harness();
      expect(await runCli(argv, h.io), argv.join(" ")).toBe(2);
      expect(h.out.join(""), argv.join(" ")).toBe("");
      expect(h.err.join("")).toMatch(/erro de uso/);
      expect(h.calls.length).toBe(0);
    }
  });

  test("D22: run needs --allow-network, an explicit bound and a folder; without them nothing is sent and nothing is written", async () => {
    const cases: string[][] = [
      ["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "1"],
      ["run", "--source", "public-okx", "--max-epochs", "1", "--allow-network"],
      ["run", "--source", "public-okx", "--out", OUT, "--allow-network"],
      ["run", "--out", OUT, "--max-epochs", "1", "--allow-network"],
    ];
    for (const argv of cases) {
      const h = harness();
      expect(await runCli(argv, h.io), argv.join(" ")).toBe(2);
      expect(h.calls.length).toBe(0);
      expect(h.state.files.size).toBe(0);
      expect(h.out.join("")).toBe("");
    }
    const noNetwork = harness();
    await runCli(["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "1"], noNetwork.io);
    expect(noNetwork.err.join("")).toMatch(/--allow-network/);
  });

  test("D22: the onchainos source also needs --credentials-from-env and names the missing variables, never a value", async () => {
    const without = harness(CREDENTIALS_ENV);
    const argv = ["run", "--source", "onchainos", "--out", OUT, "--max-epochs", "1", "--allow-network", "--token", `WETH-USDC=1:${TOKEN_ADDRESS}`];
    expect(await runCli(argv, without.io)).toBe(2);
    expect(without.err.join("")).toMatch(/--credentials-from-env/);
    expect(without.calls.length).toBe(0);

    const partial = harness({ OKX_WEB3_API_KEY: CANARY_KEY, OKX_WEB3_API_SECRET: "" });
    expect(await runCli([...argv, "--credentials-from-env"], partial.io)).toBe(2);
    const message = partial.err.join("");
    expect(message).toContain("OKX_WEB3_API_SECRET");
    expect(message).toContain("OKX_WEB3_API_PASSPHRASE");
    expect(message).not.toContain("OKX_WEB3_API_KEY");
    expect(message).not.toContain(CANARY_KEY);
    expect(partial.calls.length).toBe(0);

    const noTokens = harness(CREDENTIALS_ENV);
    expect(await runCli(["run", "--source", "onchainos", "--out", OUT, "--max-epochs", "1", "--allow-network", "--credentials-from-env"], noTokens.io)).toBe(2);
    expect(noTokens.err.join("")).toMatch(/--token/);

    const publicWithCredentials = harness(CREDENTIALS_ENV);
    expect(await runCli(["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "1", "--allow-network", "--credentials-from-env"], publicWithCredentials.io)).toBe(2);
    expect(publicWithCredentials.err.join("")).toMatch(/não usa credenciais/);
  });

  test("D22: a public-okx run captures into the folder, prints the JSON report on stdout and a short Portuguese summary on stderr, and exits 0", async () => {
    const h = harness();
    const code = await runCli(["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "2", "--allow-network", "--rps", "5", "--inst", "BTC-USDT-SWAP", "--kinds", "ticker,funding,mark"], h.io);
    expect(code).toBe(0);
    const report = json(h);
    expect(report.schema).toBe("onchainos-capture-report-v1");
    expect(report.status).toBe("completed");
    expect(report.epochsCommitted).toBe(2);
    expect(report.epochsWrittenThisRun).toBe(2);
    expect(report.records.byKind.ticker).toBe(2);
    expect(report.records.byKind.mark).toBe(2);
    expect(report.records.byKind.funding).toBe(4);
    expect(report.calls.attempts.public).toBe(h.calls.length);
    expect(report.calls.costKnown).toBe(true);
    expect(report.stop).toBeNull();
    const data = h.state.files.get(join(OUT, CAPTURE_FILES.data)) ?? "";
    expect(parseCaptureText(data).length).toBe(8);
    expect([...h.state.files.keys()].length).toBe(3);
    const summary = h.err.join("");
    expect(summary).toMatch(/Captura somente leitura/);
    expect(summary).toMatch(/fonte public-okx/);
    expect(summary).toMatch(/épocas/);
    expect(summary).toMatch(/Nada aqui prova lucro/);
    for (const call of h.calls) {
      expect(call.url.startsWith("https://www.okx.com/api/v5/")).toBe(true);
      expect(Object.keys(call.headers)).toEqual([]);
    }
  });

  test("D22: a run stopped by the duration limit is still a complete report and exits 0", async () => {
    const h = harness();
    const code = await runCli(["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "50", "--max-duration-ms", "90000", "--allow-network", "--rps", "5", "--inst", "BTC-USDT-SWAP", "--kinds", "ticker"], h.io);
    expect(code).toBe(0);
    expect(json(h).status).toBe("duration_limit");
    expect(h.err.join("")).toMatch(/limite de duração/);
  });

  test("D22: a run that has to stop (a malformed answer) exits 3, prints the report with the reason and keeps what was written", async () => {
    const h = harness({}, (call) => (call.path === "/api/v5/market/books" ? { body: envelope([{ asks: [["10", "1", "0", "1"]], bids: [["11", "1", "0", "1"]], ts: "1" }]) } : liveRoute(call)));
    const code = await runCli(["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "3", "--allow-network", "--rps", "5", "--inst", "BTC-USDT-SWAP", "--kinds", "ticker,book"], h.io);
    expect(code).toBe(3);
    const report = json(h);
    expect(report.status).toBe("stopped");
    expect(report.stop).toMatchObject({ kind: "malformed_record" });
    expect(report.stop.message).toMatch(/cruzado/);
    expect(h.err.join("")).toMatch(/PARADA/);
  });

  test("D22: running again on the same folder resumes: the second invocation writes only what is missing", async () => {
    const h = harness();
    const base = ["run", "--source", "public-okx", "--out", OUT, "--allow-network", "--rps", "5", "--inst", "BTC-USDT-SWAP", "--kinds", "ticker"];
    expect(await runCli([...base, "--max-epochs", "1"], h.io)).toBe(0);
    h.out.length = 0;
    expect(await runCli([...base, "--max-epochs", "3"], h.io)).toBe(0);
    const report = json(h);
    expect(report.epochsCommitted).toBe(3);
    expect(report.epochsWrittenThisRun).toBe(2);
    expect(parseCaptureText(h.state.files.get(join(OUT, CAPTURE_FILES.data)) ?? "").length).toBe(3);
  });

  test("D22 D7: an onchainos run signs with the environment credentials and NOTHING secret appears in stdout, stderr, the files or the report", async () => {
    const h = harness(CREDENTIALS_ENV);
    const code = await runCli(["run", "--source", "onchainos", "--out", OUT, "--max-epochs", "2", "--allow-network", "--credentials-from-env", "--token", `WETH-USDC=1:${TOKEN_ADDRESS}`, "--rps", "10"], h.io);
    expect(code).toBe(0);
    expect(h.calls.length).toBeGreaterThan(4);
    for (const call of h.calls) {
      expect(call.headers["OK-ACCESS-KEY"]).toBe(CANARY_KEY);
      expect(call.headers["OK-ACCESS-PASSPHRASE"]).toBe(CANARY_PASSPHRASE);
      expect(call.url.startsWith("https://web3.okx.com/api/v6/")).toBe(true);
    }
    const signatures = h.calls.map((call) => call.headers["OK-ACCESS-SIGN"] ?? "");
    const everything = [h.out.join(""), h.err.join(""), ...h.state.files.values()].join("\n");
    for (const forbidden of [CANARY_KEY, CANARY_SECRET, CANARY_PASSPHRASE, ...signatures, "OK-ACCESS"]) expect(everything.includes(forbidden), forbidden).toBe(false);
    const report = json(h);
    expect(report.calls.attempts.basic).toBeGreaterThan(0);
    expect(report.calls.attempts.free).toBeGreaterThan(0);
    expect(report.calls.costKnown).toBe(true);
    expect(parseCaptureText(h.state.files.get(join(OUT, CAPTURE_FILES.data)) ?? "").some((record) => record.kind === "mark" && record.inst === "WETH-USDC")).toBe(true);
  });

  test("D22 D7: an authentication failure that echoes the secrets exits 3 and leaks nothing", async () => {
    const h = harness(CREDENTIALS_ENV, (call) => ({ status: 401, body: { code: "50113", msg: `bad ${call.headers["OK-ACCESS-KEY"]} ${CANARY_SECRET} ${call.headers["OK-ACCESS-SIGN"]} ${CANARY_PASSPHRASE}`, data: [] } }));
    const code = await runCli(["run", "--source", "onchainos", "--out", OUT, "--max-epochs", "1", "--allow-network", "--credentials-from-env", "--token", `WETH-USDC=1:${TOKEN_ADDRESS}`], h.io);
    expect(code).toBe(3);
    const signatures = h.calls.map((call) => call.headers["OK-ACCESS-SIGN"] ?? "");
    const everything = [h.out.join(""), h.err.join(""), ...h.state.files.values()].join("\n");
    for (const forbidden of [CANARY_KEY, CANARY_SECRET, CANARY_PASSPHRASE, ...signatures]) expect(everything.includes(forbidden), forbidden).toBe(false);
    expect(json(h).stop).toMatchObject({ kind: "provider" });
  });

  test("D24: no em dash, en dash, middle dot, typographic minus or bullet in anything the CLI prints", async () => {
    const outputs: string[] = [];
    const scenarios: string[][] = [
      ["--help"],
      ["plan"],
      ["plan", "--source", "onchainos", "--token", `WETH-USDC=1:${TOKEN_ADDRESS}`],
      ["plan", "--kinds", "nope"],
      ["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "1"],
      ["run", "--source", "public-okx", "--out", OUT, "--max-epochs", "1", "--allow-network", "--rps", "5", "--inst", "BTC-USDT-SWAP", "--kinds", "ticker,funding"],
      ["run", "--source", "onchainos", "--out", OUT, "--max-epochs", "1", "--allow-network"],
    ];
    for (const argv of scenarios) {
      const h = harness(CREDENTIALS_ENV);
      await runCli(argv, h.io);
      outputs.push(h.out.join(""), h.err.join(""));
    }
    expect(outputs.join("").length).toBeGreaterThan(2000);
    for (const text of outputs) expect(FORBIDDEN_TYPOGRAPHY.test(text)).toBe(false);
  });

  test("D22: the CLI module does not run anything when it is imported", () => {
    expect(typeof runCli).toBe("function");
  });
});
