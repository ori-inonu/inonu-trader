import { describe, expect, test } from "bun:test";
import { ceilings, createBudgetRegistry, entryId, monthlyRemaining, poolId, type BudgetEntry } from "./registry.ts";

const base: BudgetEntry = { module: "onchainos", endpoint: "/quote", key: "OKX_API_KEY", validated: true, fonte: "docs" };

describe("registro de orçamento", () => {
  test("tetos por minuto, hora e dia derivam de rps e dos limites declarados", () => {
    expect(ceilings({ ...base, rps: 1 })).toEqual({ minute: 60, hour: 3600, day: 86400 });
    expect(ceilings({ ...base, rps: 5, rpm: 100, rpd: 1000 })).toEqual({ minute: 100, hour: 6000, day: 1000 });
    expect(ceilings(base)).toEqual({ minute: null, hour: null, day: null });
  });

  test("franquia mensal restante nunca fica negativa e nao existe sem franquia", () => {
    expect(monthlyRemaining({ ...base, franquiaMensal: 100_000 }, 99_990)).toBe(10);
    expect(monthlyRemaining({ ...base, franquiaMensal: 100 }, 150)).toBe(0);
    expect(monthlyRemaining(base, 150)).toBeNull();
  });

  test("rejeita chave com cara de segredo, rps fora da faixa e entradas duplicadas", () => {
    expect(() => createBudgetRegistry([{ ...base, key: "sk-live-123" }])).toThrow("variável de ambiente");
    expect(() => createBudgetRegistry([{ ...base, rps: 20 }])).toThrow("rps");
    expect(() => createBudgetRegistry([base, { ...base }])).toThrow("duplicada");
  });

  test("entradas do mesmo pool precisam declarar os mesmos limites", () => {
    const a: BudgetEntry = { ...base, endpoint: "/a", pool: "basic", franquiaMensal: 100 };
    expect(() => createBudgetRegistry([a, { ...a, endpoint: "/b" }])).not.toThrow();
    expect(() => createBudgetRegistry([a, { ...a, endpoint: "/b", franquiaMensal: 200 }])).toThrow("pool basic");
    expect(poolId({ ...a })).toBe(poolId({ ...a, endpoint: "/b" }));
    expect(poolId({ ...a })).not.toBe(poolId({ ...a, key: "OTHER_KEY" }));
    expect(poolId({ ...base })).toBe(entryId(base));
  });

  test("find separa entradas pela cadeia", () => {
    const registry = createBudgetRegistry([
      { ...base, chain: "196" },
      { ...base, chain: "501", rpd: 5 },
    ]);
    expect(registry.find({ module: "onchainos", endpoint: "/quote", key: "OKX_API_KEY", chain: "501" })?.rpd).toBe(5);
    expect(registry.find({ module: "onchainos", endpoint: "/quote", key: "OKX_API_KEY" })).toBeUndefined();
  });
});
