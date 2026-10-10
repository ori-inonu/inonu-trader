import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ethers } from "ethers";
import { loadConfig } from "../src/config";
import { AUTHORIZATION_TEMPLATE, EVIDENCE_TEMPLATE, KNOWN_OPEN_RISKS, type LiveQualificationReport } from "../src/live-qualification";
import { UsageError, buildReport, parseArgs, readJsonFile, renderSummary, verifyArtifacts } from "./qualify-live";

// ---------------------------------------------------------------------------
// Harness. Child processes get a minimal explicit environment: nothing leaks in from the developer's shell.
// ---------------------------------------------------------------------------

const script = resolve(import.meta.dir, "qualify-live.ts");
const repoRoot = resolve(import.meta.dir, "..");
const NOW_ISO = "2026-10-11T12:00:00Z";
const NOW = Date.parse(NOW_ISO);
const BANNED = /[\u00B7\u2013\u2014\u2212\u2022\u2219\u22C5\u2027\u30FB]/;
const MODEL_ID = "jev-1.13.0";

const tempDirs: string[] = [];
const tempDir = () => { const dir = mkdtempSync(join(tmpdir(), "qualify-live-test-")); tempDirs.push(dir); return dir; };
afterAll(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); });

/** Throwaway key: random per run, never funded, never reused. */
const randomKey = () => `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const listing = (dir: string) => readdirSync(dir, { recursive: true }).map(String).sort();

/**
 * Async on purpose: a Bun.spawnSync with a timeout, used before a node:child_process spawnSync in a later test file of the
 * same run, made that later spawnSync fail at once with ETIMEDOUT. Async spawn plus an explicit kill timer has no such effect.
 */
async function run(args: string[] = [], env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "--no-env-file", script, ...args], {
    cwd: repoRoot,
    env: { SystemRoot: process.env.SystemRoot ?? "C:/Windows", PATH: process.env.PATH ?? "", ...env },
    stdout: "pipe", stderr: "pipe",
  });
  const killer = setTimeout(() => child.kill(), 30_000);
  try {
    const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { exit: await child.exited, out, err };
  } finally { clearTimeout(killer); }
}

const report = (out: string) => JSON.parse(out) as LiveQualificationReport & { configLoad: { ok: boolean; error?: string }; io: Record<string, unknown> };
const itemOf = (value: LiveQualificationReport, id: string) => value.items.find((entry) => entry.id === id)!;

interface Fixture {
  dir: string; key: string; address: string; env: Record<string, string>; args: string[];
  authorization: Record<string, unknown>; evidence: Record<string, any>;
  write: () => void;
}

/** A complete, internally consistent live-shaped fixture: synthetic key, synthetic files, caps equal to the config defaults. */
function liveFixture(): Fixture {
  const dir = join(tempDir(), "data");
  mkdirSync(dir);
  const key = randomKey();
  const address = ethers.utils.computeAddress(key);
  const files: Record<string, string> = {
    "soak.jsonl": "{\"kind\":\"session\"}\n", "soak.replay.json": "{\"ok\":true}\n", "rehearsal.json": "{\"nonce\":12}\n", "review.md": "synthetic review\n",
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  const authorization = {
    schemaVersion: 1, owner: "Dono Ficticio de Teste", date: "2026-10-11T11:00:00Z", walletAddress: address,
    maxLossUsd: 2, maxSpendUsd: 1, tradeSizeMon: 200, maxPositionMon: 1000, maxCapitalFraction: 0.25, sessionDurationMinutes: 30,
    allowedModelId: MODEL_ID, expiry: "2026-10-12T11:00:00Z",
    acknowledgement: "OWN_FUNDS_RISK: texto de teste do dono ficticio, sem valor real e sem autoria humana.",
  };
  const evidence: Record<string, any> = {
    schemaVersion: 1,
    paperSoakHours: 26.5, paperSoakDataSource: "real-market-paper", paperSoakModelId: MODEL_ID, paperSoakLatchedStop: false, paperSoakFillCount: 7,
    decisionSampleCount: 2500, decisionLatencyP50Ms: 280, decisionLatencyP95Ms: 420, decisionLatencyP99Ms: 900, lateBlockRate: 0.02,
    pendingReceiptCadenceMeasured: true, receiptLagBlocksP95: 2, quoteBlockFraction: 0.97,
    replayReconciled: true, noUnknownCosts: true, soakGasUsd: 1.5, soakJevUsd: 0.2, soakMakerFeeUsd: 0,
    rehearsalAt: "2026-10-11T08:00:00Z", rehearsalWalletAddress: address, rehearsalNonceBefore: 12, rehearsalNonceAfter: 12, rehearsalGasLimit: 350000,
    rehearsalMarginMon: 200, rehearsalMarginUsdc: 20, rehearsalVaultStateRead: true, rehearsalWalletDedicated: true,
    existingOrdersReconciled: true, openOrdersAtStart: 0, balancesReconciled: true, restartBaselineReconciled: true,
    killSwitchDrilled: true, emergencyCancelDrilled: true, independentReviewDone: true, authorizationSigned: true,
    acknowledgedRisks: KNOWN_OPEN_RISKS.map((risk) => risk.id),
    artifacts: {
      paperSoakJournal: { path: "soak.jsonl", sha256: sha256(files["soak.jsonl"]!) },
      replayOutput: { path: "soak.replay.json", sha256: sha256(files["soak.replay.json"]!) },
      rehearsalOutput: { path: "rehearsal.json", sha256: sha256(files["rehearsal.json"]!) },
      independentReviewReport: { path: "review.md", sha256: sha256(files["review.md"]!) },
    },
  };
  const env = {
    DRY_RUN: "false", PRIVATE_KEY: key, MODEL: "jev", TYPESAFE_AI_API_KEY: `JEV_API_CANARY_${sha256(key).slice(0, 12)}`,
    LIVE_ACK: "OWN_FUNDS_RISK", JEV_MODEL_ID: MODEL_ID, AUTO_DEPOSIT: "false",
  };
  const fixture: Fixture = {
    dir, key, address, env, authorization, evidence, args: ["--data-dir", dir, "--now", NOW_ISO],
    write: () => {
      writeFileSync(join(dir, "live-authorization.json"), JSON.stringify(fixture.authorization, null, 2));
      writeFileSync(join(dir, "live-evidence.json"), JSON.stringify(fixture.evidence, null, 2));
    },
  };
  fixture.write();
  return fixture;
}

// ---------------------------------------------------------------------------
// End to end: the real CLI in a child process
// ---------------------------------------------------------------------------

describe("qualify-live CLI (child process)", () => {
  test("with no data files it reports every non-config item as unknown, exits 0 and states what was not done", async () => {
    const dir = tempDir();
    const result = await run(["--data-dir", dir, "--now", NOW_ISO]);
    expect(result.exit).toBe(0);
    const parsed = report(result.out);
    expect(parsed.schema).toBe("live-qualification-v1");
    expect(parsed.configLoad.ok).toBe(true);
    expect(parsed.summary.readyForOwnerReview).toBe(false);
    expect(parsed.summary.grantsPermission).toBe(false);
    expect(parsed.summary.codeGate.status).toBe("separate-and-unchanged");
    expect(parsed.inputs).toEqual({ config: "present", authorization: "absent", evidence: "absent" });
    expect(parsed.io).toMatchObject({ network: false, rpc: false, signing: false, transactionsSent: 0, filesRead: [] });
    for (const entry of parsed.items) {
      if (entry.group !== "config") expect({ id: entry.id, status: entry.status }).toEqual({ id: entry.id, status: "unknown" });
      if (entry.status === "met") expect(entry.group).toBe("config");
    }
    expect(itemOf(parsed, "config.live-requested").status).toBe("unmet");
    expect(itemOf(parsed, "config.model-jev").status).toBe("unmet");
    expect(itemOf(parsed, "config.signer-key-present").status).toBe("unmet");
    expect(parsed.summary.blockers.length).toBe(parsed.items.filter((entry) => entry.status !== "met").length);
    expect(listing(dir)).toEqual([]);
  });

  test("the human summary is pt-BR on stderr, stdout stays pure JSON, and both state the gate is unchanged and nothing was sent", async () => {
    const result = await run(["--data-dir", tempDir(), "--now", NOW_ISO]);
    expect(() => JSON.parse(result.out)).not.toThrow();
    expect(result.err).toContain("Market.init()");
    expect(result.err).toContain("inalterado");
    expect(result.err).toContain("Nada foi enviado");
    expect(result.err).toContain("Checklist completa para revisão do dono: NÃO");
    expect(result.err).toContain("não é autorização");
    expect(result.err).toContain("O assistente não preenche o registro de autorização");
    expect(result.err).toContain("não fornece chaves");
    expect(result.err).toContain("não executa sessão live");
    expect(result.err.split("\n").length).toBeLessThan(40);
    expect(result.out).toContain("separate-and-unchanged");
  });

  test("secret values never appear in any output, only booleans, and a paper config with keys stays unmet for live", async () => {
    const key = randomKey();
    const address = ethers.utils.computeAddress(key);
    const jevCanary = "JEV_API_CANARY_77aa31";
    const ackCanary = "LIVE_ACK_CANARY_55bb90";
    const result = await run(["--data-dir", tempDir(), "--now", NOW_ISO], {
      PRIVATE_KEY: key, TYPESAFE_AI_API_KEY: jevCanary, LIVE_ACK: ackCanary, DRY_RUN: "true", RPC_URL: `https://rpc.example/?apikey=URL_CANARY_99cc`,
    });
    expect(result.exit).toBe(0);
    const everything = result.out + result.err;
    for (const secret of [key, key.slice(2), jevCanary, ackCanary, "URL_CANARY_99cc", address, address.toLowerCase(), address.slice(2).toLowerCase()]) {
      expect({ secret: secret.slice(0, 12), leaked: everything.includes(secret) }).toEqual({ secret: secret.slice(0, 12), leaked: false });
    }
    const parsed = report(result.out);
    expect(itemOf(parsed, "config.signer-key-present").status).toBe("met");
    expect(itemOf(parsed, "config.jev-key-present").status).toBe("met");
    expect(itemOf(parsed, "config.live-ack").status).toBe("unmet");
    expect(itemOf(parsed, "config.live-requested").status).toBe("unmet");
    expect(parsed.summary.readyForOwnerReview).toBe(false);
  });

  test("an invalid environment still produces a complete report, with a generic config error and no stack trace", async () => {
    for (const [env, expected] of [
      [{ DRY_RUN: "false" }, "Live requires"],
      [{ BANKROLL_USD: "NaN" }, "Invalid BANKROLL_USD"],
      [{ PRIVATE_KEY: "0xnot-a-key" }, "Invalid PRIVATE_KEY"],
    ] as const) {
      const result = await run(["--data-dir", tempDir(), "--now", NOW_ISO], env);
      expect(result.exit).toBe(0);
      const parsed = report(result.out);
      expect(parsed.configLoad.ok).toBe(false);
      expect(parsed.configLoad.error).toContain(expected);
      expect(parsed.inputs.config).toBe("absent");
      expect(parsed.items.every((entry) => entry.status === "unknown")).toBe(true);
      expect(result.err).not.toMatch(/\n\s+at /);
      expect(result.err).toContain("Configuração: NÃO carregada");
      expect((result.out + result.err).includes("0xnot-a-key")).toBe(false);
    }
  });

  test("a complete, consistent, hash-verified fixture makes the checklist complete, and still says it is not a permission", async () => {
    const fixture = liveFixture();
    const before = listing(fixture.dir);
    const result = await run(fixture.args, fixture.env);
    expect(result.exit).toBe(0);
    const parsed = report(result.out);
    expect(parsed.items.filter((entry) => entry.status !== "met").map((entry) => `${entry.id}:${entry.codes.join(",")}`)).toEqual([]);
    expect(parsed.summary.readyForOwnerReview).toBe(true);
    expect(parsed.summary.blockers).toEqual([]);
    expect(parsed.summary.grantsPermission).toBe(false);
    expect(parsed.summary.codeGate.note).toContain("inalterado");
    expect(parsed.io.filesRead).toEqual(["live-authorization.json", "live-evidence.json", "soak.jsonl", "soak.replay.json", "rehearsal.json", "review.md"]);
    expect(result.err).toContain("Checklist completa para revisão do dono: SIM");
    expect(result.err).toContain("não é autorização");
    expect(result.err).toContain("Nada foi enviado");
    expect(result.err).toContain("inalterado");
    expect(listing(fixture.dir)).toEqual(before);
    const everything = result.out + result.err;
    for (const secret of [fixture.key, fixture.key.slice(2), fixture.env.TYPESAFE_AI_API_KEY!, fixture.address, fixture.address.toLowerCase(), "Dono Ficticio de Teste"]) {
      expect(everything.includes(secret)).toBe(false);
    }
    for (const phrase of [/pronto para operar/i, /liberado/i, /aprovado/i, /approved/i, /\bgo[- ]live\b/i, /safe to trade/i]) expect(phrase.test(everything)).toBe(false);
  });

  test("changing one fact flips exactly the matching item: a wallet that is not the authorized one", async () => {
    const fixture = liveFixture();
    fixture.authorization.walletAddress = ethers.utils.computeAddress(randomKey());
    fixture.write();
    const parsed = report((await run(fixture.args, fixture.env)).out);
    expect(parsed.summary.readyForOwnerReview).toBe(false);
    expect(parsed.summary.blockers).toEqual(["authorization.wallet-matches-signer", "stage2.rehearsal-wallet"]);
  });

  test("an expired authorization is caught through the clock the CLI is given", async () => {
    const fixture = liveFixture();
    const late = await run(["--data-dir", fixture.dir, "--now", "2026-10-12T11:00:00Z"], fixture.env);
    const parsed = report(late.out);
    expect(itemOf(parsed, "authorization.time-window").codes).toContain("expired");
    expect(parsed.evaluatedAt).toBe("2026-10-12T11:00:00.000Z");
  });

  test("malformed, unreadable, oversized and directory inputs are reported, not crashed on; a UTF-8 BOM is tolerated", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "live-authorization.json"), "{ not json");
    writeFileSync(join(dir, "live-evidence.json"), "\uFEFF" + JSON.stringify(EVIDENCE_TEMPLATE));
    let parsed = report((await run(["--data-dir", dir, "--now", NOW_ISO])).out);
    expect(parsed.inputs).toEqual({ config: "present", authorization: "malformed-json", evidence: "present" });
    expect(itemOf(parsed, "authorization.record-present").status).toBe("unmet");
    expect(itemOf(parsed, "authorization.record-present").codes).toContain("malformed-json");
    expect(itemOf(parsed, "evidence.manifest-valid").status).toBe("met");

    writeFileSync(join(dir, "live-authorization.json"), "x".repeat(1_048_577));
    rmSync(join(dir, "live-evidence.json"));
    mkdirSync(join(dir, "live-evidence.json"));
    parsed = report((await run(["--data-dir", dir, "--now", NOW_ISO])).out);
    expect(parsed.inputs).toEqual({ config: "present", authorization: "unreadable", evidence: "unreadable" });
    expect(itemOf(parsed, "evidence.manifest-valid").codes).toContain("unreadable");
  });

  test("a missing data directory is the same as no files", async () => {
    const parsed = report((await run(["--data-dir", join(tempDir(), "does-not-exist"), "--now", NOW_ISO])).out);
    expect(parsed.inputs).toEqual({ config: "present", authorization: "absent", evidence: "absent" });
  });

  test("artifact hashes are verified locally: mismatch, missing, directory, traversal and outside-the-data-dir files", async () => {
    const fixture = liveFixture();
    writeFileSync(join(fixture.dir, "soak.jsonl"), "tampered after hashing\n");
    rmSync(join(fixture.dir, "rehearsal.json"));
    rmSync(join(fixture.dir, "review.md"));
    mkdirSync(join(fixture.dir, "review.md"));
    writeFileSync(join(dirname(fixture.dir), "outside-canary.txt"), "outside the data directory");
    fixture.evidence.artifacts.replayOutput = { path: "../outside-canary.txt", sha256: sha256("outside the data directory") };
    fixture.write();
    const parsed = report((await run(fixture.args, fixture.env)).out);
    const entry = itemOf(parsed, "evidence.artifacts-verified");
    expect(entry.status).toBe("unmet");
    expect(entry.codes).toEqual(expect.arrayContaining(["mismatch:paperSoakJournal", "missing:rehearsalOutput", "not-regular-file:independentReviewReport", "invalid-declaration:replayOutput"]));
    expect(parsed.io.filesRead).toEqual(["live-authorization.json", "live-evidence.json", "soak.jsonl"]);
    expect(JSON.stringify(parsed).includes("outside-canary")).toBe(false);
  });

  test("a symbolic link is never followed (skipped when the platform forbids creating one)", async () => {
    const fixture = liveFixture();
    const target = join(tempDir(), "target.txt");
    writeFileSync(target, "link target");
    try { symlinkSync(target, join(fixture.dir, "linked.jsonl")); } catch { return; }
    fixture.evidence.artifacts.paperSoakJournal = { path: "linked.jsonl", sha256: sha256("link target") };
    fixture.write();
    const entry = itemOf(report((await run(fixture.args, fixture.env)).out), "evidence.artifacts-verified");
    expect(entry.codes).toContain("not-regular-file:paperSoakJournal");
  });

  test("the same inputs and --now give byte-identical stdout and stderr; no --now uses the current time", async () => {
    const fixture = liveFixture();
    const first = await run(fixture.args, fixture.env);
    const second = await run(fixture.args, fixture.env);
    expect(second.out).toBe(first.out);
    expect(second.err).toBe(first.err);
    const live = report((await run(["--data-dir", fixture.dir], fixture.env)).out);
    expect(Math.abs(Date.parse(live.evaluatedAt) - Date.now())).toBeLessThan(120_000);
  });

  test("rendered output never contains middle dots, em dashes or en dashes", async () => {
    const fixture = liveFixture();
    for (const result of await Promise.all([run(fixture.args, fixture.env), run(["--data-dir", tempDir(), "--now", NOW_ISO]), run(["--help"])])) {
      expect(BANNED.test(result.out + result.err)).toBe(false);
    }
  });

  test("--print-template prints the exact placeholder templates and nothing else; the printed authorization fails validation", async () => {
    const authorization = await run(["--print-template", "authorization"]);
    expect(authorization.exit).toBe(0);
    expect(authorization.err).toBe("");
    expect(JSON.parse(authorization.out)).toEqual(AUTHORIZATION_TEMPLATE);
    const evidence = await run(["--print-template", "evidence"]);
    expect(JSON.parse(evidence.out)).toEqual(EVIDENCE_TEMPLATE);
    const dir = tempDir();
    writeFileSync(join(dir, "live-authorization.json"), authorization.out);
    const parsed = report((await run(["--data-dir", dir, "--now", NOW_ISO])).out);
    expect(itemOf(parsed, "authorization.fields-valid").status).toBe("unmet");
  });

  test("usage errors exit 2 with usage on stderr and nothing on stdout; --help exits 0", async () => {
    for (const args of [["--unknown"], ["--now", "yesterday"], ["--now", "2026-10-11"], ["--data-dir"], ["--print-template", "other"], ["--print-template"],
      ["--data-dir", "a", "--data-dir", "b"], ["--now", NOW_ISO, "--now", NOW_ISO], ["positional"], ["--live"], ["--help", "--now", "x"]]) {
      const result = await run(args);
      expect({ args, exit: result.exit }).toEqual({ args, exit: 2 });
      expect(result.out).toBe("");
      expect(result.err).toContain("Uso:");
    }
    const help = await run(["--help"]);
    expect(help.exit).toBe(0);
    expect(help.out).toContain("Uso:");
    expect(help.out).toContain("--data-dir");
    expect(help.out).toContain("nunca envia");
  });
});

// ---------------------------------------------------------------------------
// In-process units
// ---------------------------------------------------------------------------

describe("qualify-live units", () => {
  test("parseArgs validates every flag and reports usage errors", () => {
    expect(parseArgs([])).toEqual({ dataDir: "data", nowMs: null, printTemplate: null, help: false });
    expect(parseArgs(["--data-dir", "x", "--now", NOW_ISO])).toEqual({ dataDir: "x", nowMs: NOW, printTemplate: null, help: false });
    expect(parseArgs(["--print-template", "evidence"]).printTemplate).toBe("evidence");
    expect(parseArgs(["--help"]).help).toBe(true);
    for (const bad of [["--now"], ["--now", "x"], ["--data-dir", ""], ["--bogus"], ["--print-template", "x"], ["extra"]]) expect(() => parseArgs(bad)).toThrow(UsageError);
  });

  test("readJsonFile distinguishes absent, malformed, unreadable and ok, and strips a BOM", async () => {
    const dir = tempDir();
    expect(await readJsonFile(join(dir, "missing.json"))).toEqual({ state: "absent" });
    writeFileSync(join(dir, "ok.json"), "\uFEFF{\"a\":1}");
    expect(await readJsonFile(join(dir, "ok.json"))).toEqual({ state: "ok", value: { a: 1 } });
    writeFileSync(join(dir, "null.json"), "null");
    expect(await readJsonFile(join(dir, "null.json"))).toEqual({ state: "ok", value: null });
    writeFileSync(join(dir, "bad.json"), "{");
    expect(await readJsonFile(join(dir, "bad.json"))).toEqual({ state: "error", error: "malformed-json" });
    mkdirSync(join(dir, "folder.json"));
    expect(await readJsonFile(join(dir, "folder.json"))).toEqual({ state: "error", error: "unreadable" });
  });

  test("verifyArtifacts only reads files whose declaration is well formed and inside the data directory", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "a.txt"), "alpha");
    const good = sha256("alpha");
    const manifest = { artifacts: {
      paperSoakJournal: { path: "a.txt", sha256: good.toUpperCase() },
      replayOutput: { path: "a.txt", sha256: sha256("other") },
      rehearsalOutput: { path: "nope.txt", sha256: good },
      independentReviewReport: { path: "../escape.txt", sha256: good },
    } };
    const { checks, filesRead } = await verifyArtifacts(manifest, dir);
    expect(checks).toEqual({
      paperSoakJournal: { status: "match" }, replayOutput: { status: "mismatch" }, rehearsalOutput: { status: "missing" },
    });
    expect(filesRead).toEqual(["a.txt", "a.txt"]);
    expect(await verifyArtifacts(null, dir)).toEqual({ checks: {}, filesRead: [] });
    expect(await verifyArtifacts({ artifacts: "x" }, dir)).toEqual({ checks: {}, filesRead: [] });
  });

  test("buildReport turns a loaded config into a sanitized snapshot with booleans only, using an injected loader and clock", async () => {
    const key = randomKey();
    const env = { DRY_RUN: "false", PRIVATE_KEY: key, MODEL: "jev", TYPESAFE_AI_API_KEY: "SYNTHETIC_JEV_VALUE", LIVE_ACK: "OWN_FUNDS_RISK", JEV_MODEL_ID: MODEL_ID };
    const result = await buildReport({ env, dataDir: tempDir(), now: () => NOW, loadConfig: async (source) => loadConfig(source) });
    expect(result.configLoad).toEqual({ ok: true });
    expect(itemOf(result.report, "config.live-requested").status).toBe("met");
    expect(itemOf(result.report, "config.live-ack").status).toBe("met");
    expect(itemOf(result.report, "authorization.wallet-matches-signer").status).toBe("unknown");
    const text = JSON.stringify(result);
    for (const secret of [key, key.slice(2), "SYNTHETIC_JEV_VALUE", ethers.utils.computeAddress(key)]) expect(text.includes(secret)).toBe(false);

    const failing = await buildReport({ env: { DRY_RUN: "false" }, dataDir: tempDir(), now: () => NOW, loadConfig: async (source) => loadConfig(source) });
    expect(failing.configLoad.ok).toBe(false);
    expect(failing.report.inputs.config).toBe("absent");
    const odd = await buildReport({ env: {}, dataDir: tempDir(), now: () => NOW, loadConfig: async () => { throw new Error(`0x${"ab".repeat(32)} leaked`); } });
    expect(odd.configLoad.ok).toBe(false);
    expect(JSON.stringify(odd).includes("ab".repeat(32))).toBe(false);
  });

  test("renderSummary lists at most a handful of blockers and always carries the safety statements", async () => {
    const result = await buildReport({ env: {}, dataDir: tempDir(), now: () => NOW, loadConfig: async (source) => loadConfig(source) });
    const lines = renderSummary(result);
    expect(lines.length).toBeLessThan(40);
    const text = lines.join("\n");
    expect(text).toContain("Itens: ");
    expect(text).toContain("Bloqueios");
    expect(text).toContain("Market.init()");
    expect(text).toContain("Nada foi enviado");
    expect(text).toContain("docs/LIVE-QUALIFICATION.md");
    expect(lines.every((line) => !BANNED.test(line))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Static guard: the CLI cannot reach the network, a signer or the execution path
// ---------------------------------------------------------------------------

describe("qualify-live static guard", () => {
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(readFileSync(script, "utf8")).replace(/\s+/g, " ");

  test("no network, RPC, signing, wallet construction, execution modules or file writes", () => {
    const forbidden = [
      "fetch(", "WebSocket", "XMLHttpRequest", "Bun.serve", "node:net", "node:http", "node:https", "node:child_process", "Bun.spawn",
      "../src/market", "../src/chain", "../src/trader", "../src/server", "../src/index", "../src/model", "../src/trades", "../src/book",
      "new ethers.Wallet", "Wallet(", "createRandom", "signTransaction", "signMessage", "sendTransaction", "Provider(", "eth_", "rpc(",
      "Bun.write", "writeFile", "appendFile", "mkdirSync", "rmSync", "unlinkSync", "renameSync", "copyFile", "createWriteStream", "process.exit(",
    ];
    for (const token of forbidden) expect({ token, found: code.includes(token) }).toEqual({ token, found: false });
  });

  test("config is loaded lazily so an invalid environment becomes a report instead of a crash", () => {
    expect(/\bimport\s[^;]*\bfrom\s*"\.\.\/src\/config"/.test(code)).toBe(false);
    expect(code).toContain('import("../src/config")');
  });
});
