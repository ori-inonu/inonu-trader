import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticJournals, toJsonl } from "../src/prob/fixtures.ts";
import { DEFAULT_RESAMPLES, DEFAULT_SEED, outsideDataDir, readJournals, runProbCycle, summaryLine } from "./prob-cycle.ts";

const SLOW = 120_000;
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** Uma pasta de journals SINTÉTICOS (nunca dados reais) e uma pasta de saída separada. */
function fixture(extra: { malformedLine?: boolean; omit?: string[] } = {}): { dir: string; out: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "prob-cycle-test-"));
  roots.push(root);
  const dir = join(root, "agent");
  mkdirSync(dir);
  const j = syntheticJournals({ seed: 5, tokens: 10, looks: 180, signal: 1 });
  const files: Record<string, ReadonlyArray<Record<string, unknown>>> = {
    "briefs.jsonl": j.briefs as Array<Record<string, unknown>>,
    "scoreboard.jsonl": j.scoreboard as Array<Record<string, unknown>>,
    "closings.jsonl": j.closings as Array<Record<string, unknown>>,
    "decisions-meta.jsonl": j.decisionsMeta as Array<Record<string, unknown>>,
    "equity.jsonl": j.equity as Array<Record<string, unknown>>,
  };
  for (const [name, rows] of Object.entries(files)) {
    if (extra.omit?.includes(name)) continue;
    writeFileSync(join(dir, name), toJsonl(rows) + (extra.malformedLine === true && name === "briefs.jsonl" ? "isto nao e json\n" : ""));
  }
  return { dir, out: join(root, "saida", "prob-cycle.json"), root };
}

const hashDir = (dir: string): Record<string, string> =>
  Object.fromEntries(readdirSync(dir).map((f) => [f, createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")]));

describe("scripts/prob-cycle", () => {
  test("lê os journals só para leitura e grava o relatório fora da pasta de dados", () => {
    const { dir, out } = fixture();
    const before = hashDir(dir);
    const { report, path } = runProbCycle({ dir, out, seed: 1, resamples: 50, nowMs: 1_700_000_000_000 });
    expect(path).toBe(out);
    expect(existsSync(out)).toBe(true);
    expect(hashDir(dir)).toEqual(before);
    expect(readdirSync(dir).sort()).toEqual(["briefs.jsonl", "closings.jsonl", "decisions-meta.jsonl", "equity.jsonl", "scoreboard.jsonl"]);
    const saved = JSON.parse(readFileSync(out, "utf8"));
    expect(saved.versao).toBe(report.versao);
    expect(saved.experimentos).toHaveLength(8);
    expect(saved.entradas["answers.jsonl"]).toBeNull();
    expect(saved.entradas["briefs.jsonl"].lines).toBe(180);
    expect(saved.qualidade.camposDoBrief.length).toBeGreaterThan(30);
    expect(saved.achados.length).toBeGreaterThanOrEqual(8);
  }, SLOW);

  test("recusa gravar dentro da pasta dos journals", () => {
    const { dir } = fixture();
    const before = hashDir(dir);
    expect(() => runProbCycle({ dir, out: join(dir, "prob-cycle.json"), seed: 1, resamples: 20, nowMs: 0 })).toThrow("somente leitura");
    expect(() => runProbCycle({ dir, out: join(dir, "sub", "x.json"), seed: 1, resamples: 20, nowMs: 0 })).toThrow("somente leitura");
    expect(hashDir(dir)).toEqual(before);
    expect(outsideDataDir("/a/b", "/a/b/c.json")).toBe(false);
    expect(outsideDataDir("/a/b", "/a/c.json")).toBe(true);
    expect(outsideDataDir("/a/b", "/a/bb/c.json")).toBe(true);
  }, SLOW);

  test("é reproduzível: mesma semente e mesmo relógio dão o mesmo arquivo, e a semente muda o resultado", () => {
    const { dir, root } = fixture();
    const a = runProbCycle({ dir, out: join(root, "a", "r.json"), seed: 3, resamples: 40, nowMs: 5 });
    const b = runProbCycle({ dir, out: join(root, "b", "r.json"), seed: 3, resamples: 40, nowMs: 5 });
    const c = runProbCycle({ dir, out: join(root, "c", "r.json"), seed: 4, resamples: 40, nowMs: 5 });
    expect(readFileSync(a.path, "utf8")).toBe(readFileSync(b.path, "utf8"));
    expect(readFileSync(a.path, "utf8")).not.toBe(readFileSync(c.path, "utf8"));
  }, SLOW);

  test("linha malformada é contada e arquivo ausente vira null, sem derrubar o ciclo", () => {
    const { dir, out } = fixture({ malformedLine: true, omit: ["equity.jsonl"] });
    const { report } = runProbCycle({ dir, out, seed: 1, resamples: 30, nowMs: 0 });
    expect(report.entradas["briefs.jsonl"]).toEqual({ lines: 181, malformed: 1 });
    expect(report.entradas["equity.jsonl"]).toBeNull();
  }, SLOW);

  test("o relatório gravado não contém ids de ciclo nem endereços dos dados de entrada", () => {
    const { dir, out } = fixture();
    runProbCycle({ dir, out, seed: 1, resamples: 30, nowMs: 0 });
    const text = readFileSync(out, "utf8");
    const journals = readJournals(dir);
    for (const b of journals.briefs.slice(0, 60)) expect(text.includes(b.cycleId as string)).toBe(false);
    for (const r of journals.scoreboard.slice(0, 60)) if (typeof r.address === "string") expect(text.includes(r.address)).toBe(false);
  }, SLOW);

  test("pasta inexistente é erro claro e a linha de resumo só traz agregados", () => {
    expect(() => readJournals(join(tmpdir(), "nao-existe-prob-cycle"))).toThrow("--dir");
    const { dir, out } = fixture();
    const { report, path } = runProbCycle({ dir, out, seed: 1, resamples: 30, nowMs: 0 });
    const line = summaryLine(report, path);
    expect(line).toContain("prob-cycle:");
    expect(line).toContain("E04:");
    expect(DEFAULT_SEED).toBeGreaterThan(0);
    expect(DEFAULT_RESAMPLES).toBeGreaterThanOrEqual(1000);
  }, SLOW);

  test("a linha de comando roda de ponta a ponta e recusa saída dentro dos dados", () => {
    const { dir, out, root } = fixture();
    const script = join(import.meta.dir, "prob-cycle.ts");
    const ok = Bun.spawnSync(["bun", "--no-env-file", script, "--dir", dir, "--out", out, "--resamples", "30", "--now", "0"], { cwd: root });
    expect(ok.exitCode).toBe(0);
    expect(new TextDecoder().decode(ok.stdout)).toContain("prob-cycle:");
    expect(existsSync(out)).toBe(true);
    const bad = Bun.spawnSync(["bun", "--no-env-file", script, "--dir", dir, "--out", join(dir, "x.json"), "--resamples", "30"], { cwd: root });
    expect(bad.exitCode).not.toBe(0);
    expect(existsSync(join(dir, "x.json"))).toBe(false);
  }, SLOW);
});
