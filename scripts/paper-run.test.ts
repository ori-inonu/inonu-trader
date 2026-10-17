import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "./bench-decision";
import { paperRun } from "./paper-run";

const dir = mkdtempSync(join(tmpdir(), "paper-run-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("paper-run", () => {
  test("cada oportunidade deixa uma decisão no log, com motivo; as executadas deixam o resultado", async () => {
    const log = join(dir, "reasons.jsonl");
    const report = await paperRun(generate(400), log);
    expect(report.simulado).toBe(true);
    expect(report.summary.total).toBe(400);
    expect(report.summary.invalid).toBe(0);

    const rejected = report.summary.byAction.NAO_OPERAR ?? 0;
    const trades = report.summary.trades.count;
    expect(rejected + trades).toBe(400);
    expect(rejected).toBeGreaterThan(0);
    expect(report.summary.rejections.reduce((s, r) => s + r.count, 0)).toBe(rejected);

    // Toda decisão de operar acabou numa porta paper: ou preencheu, ou foi recusada com motivo.
    expect(Object.values(report.summary.trades.fills).reduce((s, n) => s + n, 0)).toBe(trades);

    const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBe(rejected + 2 * trades);
    expect(lines.every((l) => JSON.parse(l).mode === "paper")).toBe(true);
  });

  test("latência da decisão local e do envio medidas à parte, o resto declarado como não medido", async () => {
    const report = await paperRun(generate(200), join(dir, "lat.jsonl"));
    expect(Object.keys(report.latency.measured).sort()).toEqual(["decisao_local", "submissao"]);
    expect(report.latency.notMeasured).toEqual(["dados", "cotacao", "assinatura", "inclusao", "finalizacao"]);
    expect(report.latency.measured.decisao_local!.p95).toBeLessThan(80);
  });

  test("é determinístico: mesma semente, mesma mistura de decisões", async () => {
    const a = await paperRun(generate(300), join(dir, "a.jsonl"));
    const b = await paperRun(generate(300), join(dir, "b.jsonl"));
    expect(a.summary.byAction).toEqual(b.summary.byAction);
    expect(a.summary.rejections).toEqual(b.summary.rejections);
  });

  test("o log anterior é descartado: rodar duas vezes não acumula", async () => {
    const log = join(dir, "twice.jsonl");
    await paperRun(generate(100), log);
    const second = await paperRun(generate(100), log);
    expect(second.summary.total).toBe(100);
    expect(existsSync(log)).toBe(true);
  });
});
