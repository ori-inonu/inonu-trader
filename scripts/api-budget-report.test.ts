import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReport, format } from "./api-budget-report";

const dir = mkdtempSync(join(tmpdir(), "api-budget-report-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const NOW = Date.UTC(2026, 9, 17, 13);

describe("api-budget-report", () => {
  test("sem ledger nem contador: pools vazios, ritmo do cliente e nenhuma projeção", () => {
    const report = buildReport({ ledgerPath: join(dir, "nao-existe.json"), plan: "free", now: NOW });
    expect(report.budget.pools.map((p) => p.pool).sort()).toEqual(["market-basic", "market-free", "market-premium", "trade"]);
    expect(report.clientPacing).toMatchObject({ minIntervalMs: 1100, perMinute: 54, perHour: 3240, perDay: 77_760 });
    expect(report.projection.source).toBeNull();
  });

  test("o contador diário do gateway vira projeção por faixa", () => {
    const usage = join(dir, "usage-2026-10.json");
    writeFileSync(usage, JSON.stringify({ version: 1, month: "2026-10", days: { "15": { basic: 4753, premium: 1309 }, "16": { basic: 4934, premium: 2270 }, "17": { basic: 3204, premium: 1249 } } }));
    const report = buildReport({ ledgerPath: join(dir, "nao-existe.json"), usagePath: usage, plan: "free", now: NOW });
    expect(report.projection.source).toBe("usage-2026-10.json");
    expect(report.projection.basic?.used).toBe(12_891);
    expect(report.projection.premium?.used).toBe(4828);
    const text = format(report);
    expect(text).toContain("market-basic");
    expect(text).toContain("n/p");
    expect(text).toContain("projeção do mês");
  });

  test("o texto traz só o nome da variável da chave", () => {
    const text = format(buildReport({ ledgerPath: join(dir, "x.json"), plan: "free", now: NOW }));
    expect(text).toContain("OKX_WEB3_API_KEY");
    expect(text).not.toMatch(/passphrase|secret/i);
  });

  test("plano desconhecido falha em vez de cair no Free", () => {
    expect(() => buildReport({ ledgerPath: join(dir, "x.json"), plan: "inventado", now: NOW })).toThrow("plano OKX desconhecido");
  });
});
