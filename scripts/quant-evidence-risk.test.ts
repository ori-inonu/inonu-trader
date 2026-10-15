import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { simulateCandles } from "../src/quant/test-support";

const ROOT = resolve(import.meta.dir, "..");
const BAR = 900_000;

function run(args: string[]) {
  const r = Bun.spawnSync(["bun", "--no-env-file", "run", join(ROOT, "scripts", "quant-evidence-risk.ts"), ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function captureDir(symbols: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "quant-evi-"));
  symbols.forEach((symbol, i) => {
    const candles = simulateCandles({ seed: 10 + i, bars: 400, sigmaDaily: 0.04, barMs: BAR, substeps: 20, startMs: 1_800_000_000_000 });
    writeFileSync(join(dir, `${symbol}-USDT-SWAP-15m.json`), JSON.stringify({ instId: `${symbol}-USDT-SWAP`, barMs: BAR, capturedAtMs: 1_800_000_000_000 + 400 * BAR + 1_000, candles }));
  });
  return dir;
}

describe("scripts/quant-evidence-risk.ts", () => {
  test("the offline synthetic evidence demo is labelled synthetic and only the symbol with a capture carries risk", () => {
    const dir = captureDir(["ETH"]);
    try {
      const r = run(["--demo-evidence", "--dir", dir, "--json"]);
      expect(r.code).toBe(0);
      const report = JSON.parse(r.out) as { label: string; origin: string; realData: boolean; evidenceStatus: string | null; positions: { key: string; valueUsd: number | null }[]; analysis: { risk: { status: string; excluded?: unknown[]; riskedShare?: number } } };
      expect(report.label).toContain("sintetic");
      expect(report.origin).toBe("synthetic_fixture");
      expect(report.realData).toBe(false);
      expect(report.analysis.risk.status).toBe("ok");
      expect(report.positions.some((p) => p.key === "ETH")).toBe(true);
      expect(report.analysis.risk.riskedShare!).toBeGreaterThan(0);
      expect(report.analysis.risk.riskedShare!).toBeLessThan(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a contract token that shares a ticker with a capture is not matched on its own, only when the user says so", () => {
    const dir = captureDir(["ETH", "FIXB"]);
    const FIXB = "1:contract:0x00000000000000000000000000000000000b0002";
    try {
      const alone = JSON.parse(run(["--demo-evidence", "--dir", dir, "--json"]).out) as { positions: { key: string }[]; analysis: { risk: { riskedShare: number } } };
      expect(alone.positions.some((p) => p.key === "FIXB")).toBe(false);
      expect(alone.positions.some((p) => p.key === FIXB)).toBe(true);
      const stated = JSON.parse(run(["--demo-evidence", "--dir", dir, "--json", "--map", `${FIXB}=FIXB`]).out) as { positions: { key: string }[]; explicitMappings: Record<string, string>; analysis: { risk: { riskedShare: number } } };
      expect(stated.positions.some((p) => p.key === "FIXB")).toBe(true);
      expect(stated.explicitMappings).toEqual({ [FIXB]: "FIXB" });
      expect(stated.analysis.risk.riskedShare).toBeGreaterThan(alone.analysis.risk.riskedShare);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a malformed --map is refused", () => {
    const r = run(["--demo-evidence", "--map", "nonsense"]);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("--map expects");
  });

  test("with no capture at all the concentration is still reported and the risk is unavailable with a reason", () => {
    const dir = captureDir([]);
    try {
      const r = run(["--demo-evidence", "--dir", dir, "--json"]);
      expect(r.code).toBe(0);
      const report = JSON.parse(r.out) as { analysis: { concentration: { hhi: number | null }; risk: { status: string; reason?: string } } };
      expect(report.analysis.concentration.hhi).not.toBeNull();
      expect(report.analysis.risk).toEqual({ status: "unavailable", reason: "no_returns" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a missing or unreadable evidence file is refused", () => {
    expect(run(["--evidence", join(tmpdir(), "does-not-exist-quant.json")]).code).not.toBe(0);
    expect(run([]).code).not.toBe(0);
  });

  test("an evidence file without a balances section is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "quant-evi-"));
    try {
      const file = join(dir, "e.json");
      writeFileSync(file, JSON.stringify({ schema: "wallet_evidence_v2", balances: null }));
      const r = run(["--evidence", file, "--dir", dir]);
      expect(r.code).not.toBe(0);
      expect(r.err).toContain("balances");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
