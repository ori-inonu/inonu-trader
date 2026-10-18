import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outsideDataDir, runProbCycle } from "./prob-cycle.ts";

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "prob-safety-synthetic-")); roots.push(root);
  const dir = join(root, "agent"); mkdirSync(dir);
  writeFileSync(join(dir, "briefs.jsonl"), "");
  return { root, dir, options: { dir, seed: 1, resamples: 10, nowMs: 0 } };
}

describe("protecao dos journals offline", () => {
  test("nome com dois pontos continua dentro dos journals", () => {
    const { dir, options } = fixture();
    const out = join(dir, "..report.json");
    expect(outsideDataDir(dir, out)).toBe(false);
    expect(() => runProbCycle({ ...options, out })).toThrow("somente leitura");
    expect(existsSync(out)).toBe(false);
  });
  test("junction externa nao permite escrever dentro dos journals", () => {
    const { root, dir, options } = fixture();
    const alias = join(root, "alias"); symlinkSync(dir, alias, "junction");
    const out = join(alias, "sub", "report.json");
    expect(outsideDataDir(dir, out)).toBe(false);
    expect(() => runProbCycle({ ...options, out })).toThrow("somente leitura");
    expect(existsSync(join(dir, "sub"))).toBe(false);
    expect(outsideDataDir(alias, join(dir, "report.json"))).toBe(false);
    expect(outsideDataDir(dir, join(root, "saida", "report.json"))).toBe(true);
  });
  test("nao sobrescreve arquivo existente nem hardlink a journal", () => {
    const { root, dir, options } = fixture();
    const existing = join(root, "existing.json"); writeFileSync(existing, "preservar");
    expect(() => runProbCycle({ ...options, out: existing })).toThrow("EEXIST");
    expect(readFileSync(existing, "utf8")).toBe("preservar");
    const linked = join(root, "linked.json"); linkSync(join(dir, "briefs.jsonl"), linked);
    expect(() => runProbCycle({ ...options, out: linked })).toThrow("EEXIST");
    expect(readFileSync(join(dir, "briefs.jsonl"), "utf8")).toBe("");
  });
  test("CLI exige --dir mesmo quando existe uma pasta padrao sintetica", () => {
    const { root, dir } = fixture();
    const fallback = join(root, "InonuTrader", "data"); mkdirSync(fallback, { recursive: true });
    symlinkSync(dir, join(fallback, "agent"), "junction");
    const out = join(root, "report.json");
    const run = Bun.spawnSync(["bun", "--no-env-file", join(import.meta.dir, "prob-cycle.ts"), "--out", out, "--resamples", "10"], {
      cwd: root, env: { ...process.env, LOCALAPPDATA: root },
    });
    expect(run.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(run.stderr)).toContain("passe --dir");
    expect(existsSync(out)).toBe(false);
  });
});