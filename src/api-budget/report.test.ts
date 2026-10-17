import { describe, expect, test } from "bun:test";
import type { LedgerState } from "./ledger.ts";
import { markBlocked, markCooldown, takeSlot } from "./limiter.ts";
import { okxEntries, OKX_MARKET_ENDPOINTS, OKX_QUOTE_PATH, OKX_TRADE_TRIAL_MS } from "./okx.ts";
import { createBudgetRegistry } from "./registry.ts";
import { budgetReport } from "./report.ts";

const T0 = Date.UTC(2026, 9, 17, 12);
const fresh = (): LedgerState => ({ usage: {}, blocked: {}, cooldown: {} });
const registry = createBudgetRegistry(okxEntries({ tradeKeyCreatedAtMs: T0 - OKX_TRADE_TRIAL_MS + 1000 }));
const entryOf = (endpoint: string) => registry.entries.find((e) => e.endpoint === endpoint)!;
const basicPath = OKX_MARKET_ENDPOINTS.find((e) => e.tier === "basic")!.path;
const premiumPath = OKX_MARKET_ENDPOINTS.find((e) => e.tier === "premium")!.path;
const pool = (report: ReturnType<typeof budgetReport>, name: string) => report.pools.find((p) => p.pool === name)!;

describe("relatório do orçamento", () => {
  test("um relatório por pool, com franquia mensal separada dos tetos teóricos", () => {
    const state = fresh();
    for (let i = 0; i < 7; i++) takeSlot(state, entryOf(basicPath), "normal", T0);
    takeSlot(state, entryOf(premiumPath), "normal", T0);
    const report = budgetReport(registry, state, T0);
    expect(report.pools.map((p) => p.pool).sort()).toEqual(["market-basic", "market-free", "market-premium", "trade"]);

    const basic = pool(report, "market-basic");
    expect(basic.monthly).toEqual({ franquia: 100_000, used: 7, remaining: 99_993, usedPct: 0.01 });
    expect(basic.ceilings).toEqual({ minute: null, hour: null, day: null });
    expect(basic.endpoints).toBe(OKX_MARKET_ENDPOINTS.filter((e) => e.tier === "basic").length);
    expect(basic.validated).toBe(false);
    expect(basic.unvalidated).toBe(OKX_MARKET_ENDPOINTS.filter((e) => e.tier === "basic" && !e.listed).length);
    expect(pool(report, "market-premium").unvalidated).toBe(0);
    expect(pool(report, "market-premium").monthly.used).toBe(1);

    const trade = pool(report, "trade");
    expect(trade.ceilings).toEqual({ minute: 60, hour: 3600, day: 86_400 });
    expect(trade.monthly.franquia).toBeNull();
    expect(trade.validated).toBe(true);
    expect(trade.status).toBe("ok");
  });

  test("status: bloqueio 402, cooldown 429, franquia esgotada e Trial vencido", () => {
    const state = fresh();
    markBlocked(state, entryOf(premiumPath), T0);
    markCooldown(state, entryOf(basicPath), T0 + 5000);
    expect(pool(budgetReport(registry, state, T0), "market-premium").status).toBe("blocked_402");
    expect(pool(budgetReport(registry, state, T0), "market-basic").status).toBe("cooldown_429");
    expect(pool(budgetReport(registry, state, T0 + 6000), "market-basic").status).toBe("ok");

    const full = fresh();
    full.usage[`pool|okx|OKX_WEB3_API_KEY|market-basic`] = { m: { stamp: "2026-10", n: 100_000 } };
    expect(pool(budgetReport(registry, full, T0), "market-basic").status).toBe("exhausted");

    expect(pool(budgetReport(registry, fresh(), T0 + 2000), "trade").status).toBe("expired");
    expect(pool(budgetReport(registry, fresh(), T0), "trade").expiresAt).toBe(T0 + 1000);
  });

  test("uso de janelas antigas não conta e o relatório não escreve no ledger", () => {
    const state = fresh();
    takeSlot(state, entryOf(OKX_QUOTE_PATH), "normal", T0);
    const snapshot = JSON.stringify(state);
    expect(pool(budgetReport(registry, state, T0), "trade").used).toEqual({ minute: 1, hour: 1, day: 1, month: 0 });
    expect(pool(budgetReport(registry, state, T0 + 61_000), "trade").used.minute).toBe(0);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  test("o relatório carrega o nome da variável da chave e nunca um valor", () => {
    const text = JSON.stringify(budgetReport(registry, fresh(), T0));
    expect(text).toContain("OKX_WEB3_API_KEY");
    expect(text).not.toMatch(/sk-|secret|passphrase/i);
  });
});
