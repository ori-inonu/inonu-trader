import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function run(script: string, args: string[]) {
  const r = Bun.spawnSync(["bun", "--no-env-file", "run", join(ROOT, "scripts", script), ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

describe("scripts/quant-capture.ts", () => {
  test("without --allow-network it only prints the plan, sends nothing and writes nothing", () => {
    const out = mkdtempSync(join(tmpdir(), "quant-capture-"));
    try {
      const r = run("quant-capture.ts", ["--inst", "BTC-USDT-SWAP", "--bar", "15m", "--days", "5", "--out", out]);
      expect(r.code).toBe(0);
      expect(r.err).toContain("plan only");
      expect(r.err).toContain("Nothing was sent");
      expect(readdirSync(out)).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("an instrument that is not a perpetual id is refused before anything else", () => {
    const r = run("quant-capture.ts", ["--inst", "BTC-USDT", "--allow-network"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("inst must look like");
  });

  test("an unsupported bar or an absurd window is refused", () => {
    expect(run("quant-capture.ts", ["--bar", "7m"]).code).not.toBe(0);
    expect(run("quant-capture.ts", ["--days", "9999"]).code).not.toBe(0);
  });
});

describe("scripts/quant-calibrate.ts", () => {
  test("a capture whose hash does not match is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "quant-cal-"));
    try {
      const candles = Array.from({ length: 5 }, (_, i) => ({ startMs: 1_800_000_000_000 + i * 900_000, open: 1, high: 1, low: 1, close: 1, volume: 1, confirmed: true }));
      writeFileSync(join(dir, "X-USDT-SWAP-15m.json"), JSON.stringify({ schema: "quant_candles_v1", source: "test", instId: "X-USDT-SWAP", bar: "15m", barMs: 900_000, capturedAtMs: 1_800_000_000_000, count: 5, sha256: "0".repeat(64), candles }));
      const r = run("quant-calibrate.ts", ["--dir", dir, "--out", join(dir, "result.json")]);
      expect(r.code).not.toBe(0);
      expect(r.err).toContain("sha256 mismatch");
      expect(readdirSync(dir)).not.toContain("result.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a directory without captures is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "quant-cal-"));
    try {
      const r = run("quant-calibrate.ts", ["--dir", dir, "--out", join(dir, "result.json")]);
      expect(r.code).not.toBe(0);
      expect(r.err).toContain("no captures");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unknown schema is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "quant-cal-"));
    try {
      writeFileSync(join(dir, "X-USDT-SWAP-15m.json"), JSON.stringify({ schema: "other", candles: [] }));
      const r = run("quant-calibrate.ts", ["--dir", dir, "--out", join(dir, "result.json")]);
      expect(r.code).not.toBe(0);
      expect(r.err).toContain("unknown schema");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
