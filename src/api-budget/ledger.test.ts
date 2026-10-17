import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultLedgerPath, readLedger, updateLedger } from "./ledger.ts";

const dir = mkdtempSync(join(tmpdir(), "api-budget-ledger-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("ledger do api-budget", () => {
  test("cria o diretorio e persiste a alteracao entre chamadas", async () => {
    const path = join(dir, "nested", "ledger.json");
    await updateLedger(path, (state) => {
      state.blocked.x = 5;
    });
    expect(await updateLedger(path, (state) => state.blocked.x)).toBe(5);
  });

  test("atualizacoes concorrentes nao perdem incremento", async () => {
    const path = join(dir, "race.json");
    await Promise.all(
      Array.from({ length: 20 }, () =>
        updateLedger(path, (state) => {
          state.cooldown.k = (state.cooldown.k ?? 0) + 1;
        }),
      ),
    );
    expect(await updateLedger(path, (state) => state.cooldown.k)).toBe(20);
  });
});

describe("robustez do ledger", () => {
  test("sem git no PATH (app instalado) o caminho padrão não lança e cai em data/ do diretório atual", () => {
    const saved = process.env.JEV_API_BUDGET_LEDGER;
    delete process.env.JEV_API_BUDGET_LEDGER;
    try {
      const path = defaultLedgerPath(() => null);
      expect(path.replaceAll("\\", "/").endsWith("/data/api-budget/ledger.json")).toBe(true);
      expect(path.startsWith(process.cwd())).toBe(true);
    } finally {
      if (saved !== undefined) process.env.JEV_API_BUDGET_LEDGER = saved;
    }
  });

  test("com git, o ledger fica ao lado do diretório git comum, para todos os worktrees", () => {
    const saved = process.env.JEV_API_BUDGET_LEDGER;
    delete process.env.JEV_API_BUDGET_LEDGER;
    try {
      const path = defaultLedgerPath(() => join(dir, "repo", ".git"));
      expect(path).toBe(join(dir, "repo", "data", "api-budget", "ledger.json"));
    } finally {
      if (saved !== undefined) process.env.JEV_API_BUDGET_LEDGER = saved;
    }
  });

  test("a variável de ambiente manda sobre o git", () => {
    const saved = process.env.JEV_API_BUDGET_LEDGER;
    process.env.JEV_API_BUDGET_LEDGER = join(dir, "forcado.json");
    try {
      expect(defaultLedgerPath(() => join(dir, "repo", ".git"))).toBe(join(dir, "forcado.json"));
    } finally {
      if (saved === undefined) delete process.env.JEV_API_BUDGET_LEDGER;
      else process.env.JEV_API_BUDGET_LEDGER = saved;
    }
  });

  test("ledger truncado por uma queda é posto de lado e o orçamento recomeça em vez de travar", async () => {
    const path = join(dir, "corrompido", "ledger.json");
    await updateLedger(path, (state) => void (state.blocked.a = 1));
    writeFileSync(path, '{"usage":{"x":{"m":{"stamp":"2026-10","n":9');
    expect(await updateLedger(path, (state) => Object.keys(state.blocked).length)).toBe(0);
    expect(existsSync(`${path}.corrupt`)).toBe(true);
    expect(readLedger(path).blocked).toEqual({});
  });

  test("JSON válido que não é um objeto também recomeça", async () => {
    const path = join(dir, "corrompido2", "ledger.json");
    await updateLedger(path, () => 0);
    writeFileSync(path, "null");
    expect(await updateLedger(path, (state) => state.usage)).toEqual({});
  });

  test("ledger antigo sem o campo de endpoints continua legível", async () => {
    const path = join(dir, "antigo", "ledger.json");
    await updateLedger(path, () => 0);
    writeFileSync(path, JSON.stringify({ usage: {}, blocked: { k: 5 }, cooldown: {} }));
    expect(await updateLedger(path, (state) => state.blocked.k)).toBe(5);
  });
});

describe("ledger sob concorrência e erros de leitura", () => {
  test("readLedger preserva os contadores por endpoint", async () => {
    const path = join(dir, "leitura", "ledger.json");
    await updateLedger(path, (state) => {
      state.endpoints = { a: { m: { stamp: "2026-10", n: 3 } } };
    });
    expect(readLedger(path).endpoints).toEqual({ a: { m: { stamp: "2026-10", n: 3 } } });
  });

  test("erro de leitura que não é conteúdo inválido sobe e não apaga o estado", async () => {
    const path = join(dir, "erro-es", "ledger.json");
    mkdirSync(path, { recursive: true }); // ler um diretório como arquivo dá EISDIR: erro de E/S, não corrupção
    await expect(updateLedger(path, () => 0)).rejects.toThrow();
    expect(existsSync(`${path}.corrupt`)).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  test("30 gravações concorrentes não perdem nenhum incremento", async () => {
    const path = join(dir, "carga", "ledger.json");
    await Promise.all(Array.from({ length: 30 }, () => updateLedger(path, (state) => void (state.cooldown.n = (state.cooldown.n ?? 0) + 1))));
    expect(readLedger(path).cooldown.n).toBe(30);
  });

  test("trava abandonada há mais de 10 s é reclamada por um só esperador, sem perder incremento", async () => {
    const path = join(dir, "trava-velha", "ledger.json");
    await updateLedger(path, () => 0);
    mkdirSync(`${path}.lock`);
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${path}.lock`, old, old);
    await Promise.all([1, 2, 3].map(() => updateLedger(path, (state) => void (state.cooldown.n = (state.cooldown.n ?? 0) + 1))));
    expect(readLedger(path).cooldown.n).toBe(3);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });
});
