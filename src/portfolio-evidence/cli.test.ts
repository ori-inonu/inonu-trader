/**
 * CLI, demo and report tests. The CLI is exercised with injected env, fetch, clock and file port; one test runs the real
 * entry point as a subprocess for the offline commands only.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { CANARY_KEY, CANARY_PASSPHRASE, CANARY_SECRET, envelope, makeClock, makeFakeFetch, makeMemoryFs, makeMemoryFsState } from "../onchainos/fakes.ts";
import { CREDENTIAL_ENV_NAMES, runCli, type CliIo } from "./cli.ts";
import { runDemo } from "./demo.ts";
import { FIXTURE_ACCOUNT, FIXTURE_LABEL, FIXTURE_TOKEN_A } from "./fixtures.ts";
import { summarizeEvidence } from "./report.ts";
import { FAKE_FORBIDDEN_DASHES } from "./test-support.ts";

function io(overrides: Partial<CliIo> = {}) {
  const clock = makeClock();
  const fake = makeFakeFetch(() => ({ status: 404, body: "" }), clock);
  const out: string[] = [];
  const err: string[] = [];
  const base: CliIo = { env: {}, fetch: fake.fetch, now: clock.now, sleep: clock.sleep, out: (line) => out.push(line), err: (line) => err.push(line), fs: makeMemoryFs(makeMemoryFsState()) };
  return { io: { ...base, ...overrides }, out, err, fake };
}

describe("demo", () => {
  test("every acceptance scenario holds, and the label comes first", async () => {
    const scenarios = runDemo();
    expect(scenarios.map((scenario) => scenario.acceptance)).toEqual(["A1", "A2 e A3", "A4", "A5", "A6", "A7"]);
    for (const scenario of scenarios) for (const expectation of scenario.expectations) expect({ claim: expectation.claim, holds: expectation.holds }).toEqual({ claim: expectation.claim, holds: true });
    const { io: cli, out, fake } = io();
    expect(await runCli(["demo"], cli)).toBe(0);
    expect(out[0]).toBe(FIXTURE_LABEL);
    expect(out.join("\n")).toContain("Todas as expectativas da demonstracao conferem");
    expect(fake.calls).toHaveLength(0);
  });

  test("the demo and the report use no middle dot, em dash or en dash and never print the account", async () => {
    const { io: cli, out } = io();
    await runCli(["demo"], cli);
    const text = out.join("\n");
    expect(text).not.toMatch(FAKE_FORBIDDEN_DASHES);
    expect(text).not.toContain(FIXTURE_ACCOUNT);
    for (const scenario of runDemo()) expect(summarizeEvidence(scenario.evidence).join("\n")).not.toMatch(FAKE_FORBIDDEN_DASHES);
  });

  test("--json prints the full evidence of each scenario", async () => {
    const { io: cli, out } = io();
    await runCli(["demo", "--json"], cli);
    const objects = out.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
    expect(objects).toHaveLength(6);
    expect(objects.every((evidence) => evidence.origin === "synthetic_fixture" && evidence.realData === false)).toBe(true);
  });

  test("a real data evidence is labeled as real, a synthetic one as synthetic", () => {
    const [first] = runDemo();
    expect(summarizeEvidence(first!.evidence)[0]).toBe(FIXTURE_LABEL);
    expect(summarizeEvidence({ ...first!.evidence, origin: "okx_web3_api", realData: true })[0]).toContain("DADO REAL");
  });
});

describe("plan", () => {
  test("lists the calls and limits without credentials or network, and prints only the account hash", async () => {
    const { io: cli, out, fake } = io();
    const code = await runCli(["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1,501", "--history", "--pnl-chains", "1", "--liquidity", "--risk", "--probe", "--max-calls", "20"], cli);
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("balance.all: ate 1 chamada(s)");
    expect(text).toContain("history.byAddress: ate 3 chamada(s)");
    expect(text).toContain("Teto de chamadas 20");
    expect(text).toContain("nao declarados");
    expect(text).not.toContain(FIXTURE_ACCOUNT);
    expect(fake.calls).toHaveLength(0);
  });

  test("bad arguments are a usage error", async () => {
    for (const args of [["plan"], ["plan", "--address", FIXTURE_ACCOUNT], ["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--risk-filter", "7"], ["plan", "--bogus"], ["plan", "--address"], ["plan", "--address", FIXTURE_ACCOUNT, "--chains", "1", "--max-calls", "x"], ["nothing"]]) {
      const { io: cli, err } = io();
      expect(await runCli(args, cli)).toBe(2);
      expect(err.length).toBeGreaterThan(0);
    }
  });
});

describe("refresh needs three explicit switches and real credentials in the process environment", () => {
  const base = ["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1"];
  const env = { OKX_WEB3_API_KEY: CANARY_KEY, OKX_WEB3_API_SECRET: CANARY_SECRET, OKX_WEB3_API_PASSPHRASE: CANARY_PASSPHRASE };

  test("without each switch it refuses and sends nothing", async () => {
    for (const switches of [[], ["--live"], ["--live", "--credentials-from-env"], ["--live", "--allow-network"], ["--credentials-from-env", "--allow-network"]]) {
      const { io: cli, err, fake } = io({ env });
      expect(await runCli([...base, ...switches], cli)).toBe(2);
      expect(err.join(" ")).toContain("refresh recusado");
      expect(fake.calls).toHaveLength(0);
    }
  });

  test("missing credentials: names are listed, values never, nothing is sent", async () => {
    const { io: cli, err, fake } = io({ env: { OKX_WEB3_API_KEY: CANARY_KEY } });
    expect(await runCli([...base, "--live", "--credentials-from-env", "--allow-network"], cli)).toBe(2);
    const text = err.join(" ");
    expect(text).toContain("OKX_WEB3_API_SECRET");
    expect(text).toContain("OKX_WEB3_API_PASSPHRASE");
    expect(text).not.toContain(CANARY_KEY);
    expect(fake.calls).toHaveLength(0);
    expect(CREDENTIAL_ENV_NAMES).toHaveLength(3);
  });

  test("with every gate open (and a fake fetch) only the read paths are called, signed, and no secret is printed", async () => {
    const clock = makeClock();
    const fake = makeFakeFetch((call) => {
      if (call.path === "/api/v6/dex/balance/all-token-balances-by-address") return { body: envelope([{ tokenAssets: [{ chainIndex: "1", tokenContractAddress: "", address: FIXTURE_ACCOUNT, symbol: "ETH", balance: "0.01", rawBalance: "10000000000000000", tokenPrice: "3000", isRiskToken: false }] }]) };
      if (call.path === "/api/v6/dex/balance/total-value-by-address") return { body: envelope([{ totalValue: "30" }]) };
      return { status: 404, body: "" };
    }, clock);
    const { io: cli, out, err } = io({ env, fetch: fake.fetch, now: clock.now, sleep: clock.sleep });
    const code = await runCli([...base, "--live", "--credentials-from-env", "--allow-network", "--no-market", "--store-dir", "mem://store"], cli);
    expect(code).toBe(0);
    expect(fake.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /api/v6/dex/balance/all-token-balances-by-address", "GET /api/v6/dex/balance/total-value-by-address"]);
    expect(fake.calls.every((call) => call.headers["OK-ACCESS-KEY"] === CANARY_KEY && call.headers["OK-ACCESS-SIGN"] !== undefined)).toBe(true);
    const text = [...out, ...err].join("\n");
    for (const secret of [CANARY_KEY, CANARY_SECRET, CANARY_PASSPHRASE, FIXTURE_ACCOUNT]) expect(text).not.toContain(secret);
    expect(text).toContain("Patrimonio");
    expect(text).toContain("DADO REAL");
    expect(text).toContain("endereco informado sera enviado");
  });

  test("an access refusal exits non-zero and says why in closed codes", async () => {
    const clock = makeClock();
    const fake = makeFakeFetch(() => ({ status: 403, body: "" }), clock);
    const { io: cli, out } = io({ env, fetch: fake.fetch, now: clock.now, sleep: clock.sleep });
    const code = await runCli([...base, "--live", "--credentials-from-env", "--allow-network"], cli);
    expect(code).toBe(1);
    expect(out.join("\n")).toContain("access_denied_or_region_restricted");
    expect(fake.calls).toHaveLength(1);
  });

  test("a usage error from the collector is reported without echoing arguments", async () => {
    const { io: cli, err } = io({ env });
    expect(await runCli([...base, "--live", "--credentials-from-env", "--allow-network", "--max-calls", "999"], cli)).toBe(2);
    expect(err.join(" ")).not.toContain(FIXTURE_ACCOUNT);
  });
});

describe("real entry point (offline commands only)", () => {
  const main = join(import.meta.dir, "main.ts");
  const run = (args: string[]) =>
    spawnSync("bun", ["--no-env-file", main, ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" }, timeout: 60_000 });

  test("demo runs and exits 0", () => {
    const result = run(["demo"]);
    expect(result.status).toBe(0);
    expect(result.stdout.split("\n")[0]).toBe(FIXTURE_LABEL);
    expect(result.stdout).toContain("Nenhuma chamada de rede foi feita");
  });

  test("refresh without the switches refuses (exit 2) and never needs a network", () => {
    const result = run(["refresh", "--address", FIXTURE_ACCOUNT, "--chains", "1"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("refresh recusado");
  });

  test("the placeholder token is a contract-shaped, invented address", () => {
    expect(FIXTURE_TOKEN_A).toMatch(/^0x0{25,}[0-9a-f]+$/);
  });
});
