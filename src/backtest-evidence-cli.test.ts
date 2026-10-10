import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    const target = resolve(directory);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("backtest-evidence-cli-")) {
      throw new Error(`refusing to remove unexpected temp path: ${target}`);
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "backtest-evidence-cli-"));
  temporaryDirectories.push(directory);
  return directory;
}

function syntheticJournal(): string {
  return [
    JSON.stringify({
      kind: "session",
      ts: 1_000,
      sessionId: "cli-offline-fixture",
      dataSource: "synthetic",
      model: "mock",
      bankrollUsd: 100,
      initialMon: 2,
      initialMid: 10,
      makerFeeBps: 0,
    }),
    JSON.stringify({ kind: "block", block: 1, ts: 2_000, mid: 11 }),
  ].join("\n");
}

async function runCli(directory: string, journalPath: string, manifestPath?: string) {
  const scriptPath = resolve(import.meta.dir, "../scripts/backtest.ts");
  const command = [
    process.execPath,
    "--no-env-file",
    "--no-install",
    "run",
    scriptPath,
    "--journal",
    journalPath,
  ];
  if (manifestPath !== undefined) command.push("--manifest", manifestPath);
  const child = Bun.spawn(command, {
    cwd: directory,
    env: {
      SystemRoot: Bun.env.SystemRoot ?? "",
      TEMP: directory,
      TMP: directory,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function expectedEngineSha256(): Promise<string> {
  const engineSource = await Bun.file(resolve(import.meta.dir, "backtest.ts")).text();
  return createHash("sha256").update(engineSource, "utf8").digest("hex");
}

describe("backtest evidence CLI", () => {
  test("keeps a valid accounting replay when a supplied manifest is malformed", async () => {
    const directory = createTemporaryDirectory();
    const journalPath = join(directory, "fixture.jsonl");
    const manifestPath = join(directory, "manifest.json");
    const journal = syntheticJournal();
    const malformedManifest = "{ SYNTHETIC_PRIVATE_CONTENT_MUST_NOT_LEAK";
    writeFileSync(journalPath, journal, "utf8");
    writeFileSync(manifestPath, malformedManifest, "utf8");

    const { stdout, stderr, exitCode } = await runCli(directory, journalPath, manifestPath);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const actual = JSON.parse(stdout) as {
      ok: boolean;
      result: { netPnlUsd: number; fillCount: number };
      assessment: {
        metadataStatus: string;
        reasons: string[];
        observed: { engineSha256: string };
      };
    };
    expect(actual.ok).toBe(true);
    expect(actual.result).toMatchObject({ netPnlUsd: 2, fillCount: 0 });
    expect(actual.assessment.metadataStatus).toBe("invalid");
    expect(actual.assessment.reasons).toContain("manifest-json-invalid");
    expect(actual.assessment.observed.engineSha256).toBe(await expectedEngineSha256());
    expect(stdout).not.toContain("SYNTHETIC_PRIVATE_CONTENT_MUST_NOT_LEAK");
  });

  test("preserves the journal-only invocation and adds an accounting-only assessment", async () => {
    const directory = createTemporaryDirectory();
    const journalPath = join(directory, "fixture.jsonl");
    const journal = syntheticJournal();
    writeFileSync(journalPath, journal, "utf8");

    const { stdout, stderr, exitCode } = await runCli(directory, journalPath);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const actual = JSON.parse(stdout) as {
      ok: boolean;
      journal: { path: string; sha256: string };
      result: { netPnlUsd: number; fillCount: number };
      assessment: {
        metadataStatus: string;
        evidenceKind: string;
        strategyQualified: boolean;
        financiallyAuthorized: boolean;
        reasons: string[];
        observed: { engineSha256: string };
      };
    };

    expect(actual.ok).toBe(true);
    expect(actual.journal.path).toBe(resolve(journalPath));
    expect(actual.journal.sha256).toBe(createHash("sha256").update(journal, "utf8").digest("hex"));
    expect(actual.result).toMatchObject({ netPnlUsd: 2, fillCount: 0 });
    expect(actual.assessment.metadataStatus).toBe("missing");
    expect(actual.assessment.evidenceKind).toBe("accounting-replay-only");
    expect(actual.assessment.strategyQualified).toBe(false);
    expect(actual.assessment.financiallyAuthorized).toBe(false);
    expect(actual.assessment.reasons).toContain("manifest-missing");
    expect(actual.assessment.observed.engineSha256).toBe(await expectedEngineSha256());
  });

  test("classifies an unreadable optional manifest without leaking its path", async () => {
    const directory = createTemporaryDirectory();
    const journalPath = join(directory, "fixture.jsonl");
    const missingManifestPath = join(directory, "private-missing-manifest.json");
    writeFileSync(journalPath, syntheticJournal(), "utf8");

    const { stdout, stderr, exitCode } = await runCli(directory, journalPath, missingManifestPath);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const actual = JSON.parse(stdout) as {
      ok: boolean;
      result: { netPnlUsd: number };
      assessment: { metadataStatus: string; reasons: string[] };
    };

    expect(actual.ok).toBe(true);
    expect(actual.result.netPnlUsd).toBe(2);
    expect(actual.assessment.metadataStatus).toBe("invalid");
    expect(actual.assessment.reasons).toContain("manifest-unreadable");
    expect(stdout).not.toContain(missingManifestPath);
  });

  test("reports an invalid journal through the legacy JSON error channel", async () => {
    const directory = createTemporaryDirectory();
    const journalPath = join(directory, "invalid.jsonl");
    writeFileSync(journalPath, "SYNTHETIC_JOURNAL_PRIVATE_TOKEN", "utf8");

    const { stdout, stderr, exitCode } = await runCli(directory, journalPath);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const actual = JSON.parse(stderr) as { ok: boolean; error: string };

    expect(actual).toEqual({ ok: false, error: "journal line 1 is malformed JSON" });
    expect(stderr).not.toContain("SYNTHETIC_JOURNAL_PRIVATE_TOKEN");
  });

  test("fails the CLI closed for a lost live receipt without emitting P&L", async () => {
    const directory = createTemporaryDirectory();
    const journalPath = join(directory, "lost-receipt.jsonl");
    const journal = [
      JSON.stringify({
        kind: "session",
        ts: 1_000,
        sessionId: "cli-lost-receipt-fixture",
        dataSource: "live",
        model: "mock",
        bankrollUsd: 100,
        initialMon: 2,
        initialMid: 10,
        makerFeeBps: 0,
      }),
      JSON.stringify({
        kind: "quote",
        block: 1,
        ts: 1_010,
        mid: 10,
        quote: { side: "buy", size: 0.1, price: 9, status: "lost", orderId: null, txHash: "0xunknown", gasMon: 0 },
      }),
    ].join("\n");
    writeFileSync(journalPath, journal, "utf8");

    const { stdout, stderr, exitCode } = await runCli(directory, journalPath);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const actual = JSON.parse(stderr) as { ok: boolean; error: string };
    expect(actual.ok).toBe(false);
    expect(actual.error).toContain("lost quote has an unknown receipt");
    expect(stderr).not.toContain("receiptCount");
    expect(stderr).not.toContain("netPnlUsd");
  });
});
