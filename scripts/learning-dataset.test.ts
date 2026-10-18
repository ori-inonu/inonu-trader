import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FEATURE_NAMES } from "../src/intel/features/types";

async function cli(dir: string, args: string[] = []) {
  const proc = Bun.spawn([process.execPath, "--no-env-file", join(import.meta.dir, "learning-dataset.ts"),
    "--dir", dir, "--horizon", "15m", "--as-of-ms", "2400000",
    "--min-train-groups", "1", "--test-groups", "1", ...args],
    { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  return { stdout, stderr, exit };
}
test("CLI exports real recorder files without altering them or reading decisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "learning-cli-"));
  try {
    const snaps = [0, 1_200_000, 1_500_000].map((asOfMs, i) => ({
      id: String(i), asOfMs, instId: "BTC-USDT", market: "spot", price: 100,
      costRoundTripBps: 20, atr15m: null, zones: { demanda: null, oferta: null }, origem: "relogio",
      features: { v: 1, instId: "BTC-USDT", asOfMs,
        values: Object.fromEntries(FEATURE_NAMES.map((name) => [name, null])),
        nulos: Object.fromEntries(FEATURE_NAMES.map((name) => [name, "sem_dados"])), idades: {} },
    }));
    const labels = snaps.map((s) => ({
      snapshotId: s.id, horizonte: "15m", completo: true, motivoIncompleto: null,
      brutoLongBps: 30, liquidoLongBps: 10, liquidoShortBps: -50,
      maxAltaBps: 50, maxQuedaBps: 0, barreiraLong: null, barreiraShort: null,
      zonaDemanda: null, zonaOferta: null,
    }));
    const snapPath = join(dir, "snapshots-2026-10-13.jsonl"), labPath = join(dir, "labels-2026-10-13.jsonl");
    await Bun.write(snapPath, snaps.map((s) => JSON.stringify(s)).join("\n") + "\n");
    await Bun.write(labPath, labels.map((l) => JSON.stringify(l)).join("\n") + "\n");
    await Bun.write(join(dir, "decisions.jsonl"), "PRIVATE_MALFORMED_DO_NOT_READ");
    await Bun.write(join(dir, ".env"), "SECRET_TEST_VALUE=not-exported");
    const before = await Promise.all([Bun.file(snapPath).arrayBuffer(), Bun.file(labPath).arrayBuffer()]);
    const hash = (bytes: ArrayBuffer) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const hashes = before.map(hash);
    const files = (await readdir(dir)).sort();
    const result = await cli(dir);
    expect(result.exit).toBe(0);
    const dataset = JSON.parse(result.stdout);
    expect(dataset.status).toBe("ready_for_evaluation");
    expect(dataset.rows).toHaveLength(3);
    expect(dataset.folds[0].train).toEqual([0]);
    expect(dataset.folds[0].test).toEqual([1]);
    expect(dataset.sources.map((source: { name: string }) => source.name)).toEqual(["labels-2026-10-13.jsonl", "snapshots-2026-10-13.jsonl"]);
    expect(dataset.sources.map((source: { sha256: string }) => source.sha256)).toEqual([hashes[1], hashes[0]]);
    expect(result.stdout).not.toContain("PRIVATE_MALFORMED");
    expect(result.stdout).not.toContain("SECRET_TEST_VALUE");
    expect((await readdir(dir)).sort()).toEqual(files);
    const after = await Promise.all([Bun.file(snapPath).arrayBuffer(), Bun.file(labPath).arrayBuffer()]);
    expect(after.map(hash)).toEqual(hashes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI reports empty evidence and rejects duplicate or invalid options without source content", async () => {
  const dir = await mkdtemp(join(tmpdir(), "learning-cli-"));
  try {
    const empty = await cli(dir);
    expect(empty.exit).toBe(0);
    expect(JSON.parse(empty.stdout).status).toBe("insufficient_data");
    expect(JSON.parse(empty.stdout).sources).toEqual([]);
    for (const args of [["--as-of-ms", "NaN"], ["--embargo-ms", "-1"], ["--min-train-groups", "0"], ["--unknown", "PRIVATE"]]) {
      const result = await cli(dir, args);
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(/^learning_dataset: (invalid_arguments|invalid_options)\r?\n$/);
      expect(result.stderr).not.toContain("PRIVATE");
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI fails malformed recorder records and UTF-8 with filename and line only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "learning-cli-"));
  try {
    const path = join(dir, "snapshots-2026-10-13.jsonl");
    for (const [contents, error] of [
      ["\nPRIVATE_BAD_JSON", "invalid_json: snapshots-2026-10-13.jsonl:2"],
      ['{"PRIVATE_SECRET":"not-a-snapshot"}', "invalid_record: snapshots-2026-10-13.jsonl:1"],
      [new Uint8Array([0xff]), "invalid_utf8: snapshots-2026-10-13.jsonl"],
    ] as const) {
      await Bun.write(path, contents);
      const result = await cli(dir);
      expect(result.exit).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.trim()).toBe("learning_dataset: " + error);
      expect(result.stderr).not.toContain("PRIVATE");
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI rejects nonregular files and directory links before reading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "learning-cli-"));
  try {
    await mkdir(join(dir, "snapshots-2026-10-13.jsonl"));
    const regular = await cli(dir);
    expect(regular.exit).toBe(1);
    expect(regular.stderr.trim()).toBe("learning_dataset: non_regular_file: snapshots-2026-10-13.jsonl");
    await mkdir(join(dir, "owned-target"));
    await symlink(join(dir, "owned-target"), join(dir, "labels-2026-10-13.jsonl"), process.platform === "win32" ? "junction" : "dir");
    const link = await cli(dir);
    expect(link.exit).toBe(1);
    expect(link.stderr.trim()).toBe("learning_dataset: non_regular_file: labels-2026-10-13.jsonl");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("CLI enforces a combined byte cap before parsing the oversized file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "learning-cli-"));
  try {
    const path = join(dir, "snapshots-2026-10-13.jsonl");
    await Bun.write(path, "");
    await truncate(path, 64 * 1024 * 1024 + 1);
    const result = await cli(dir);
    expect(result.exit).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("learning_dataset: byte_limit: snapshots-2026-10-13.jsonl");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
