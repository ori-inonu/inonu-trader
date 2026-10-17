import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createBudgetRegistry, poolId } from "./registry.ts";
import { OKX_KEY_ENV, OKX_MARKET_ENDPOINTS, OKX_MARKET_PLANS, OKX_QUOTE_PATH, OKX_TRADE_PATHS, OKX_TRADE_TRIAL_MS, okxEntries } from "./okx.ts";

const T0 = Date.UTC(2026, 9, 1);

describe("registro OKX", () => {
  test("todo caminho que o cliente assina está cadastrado, e só eles", () => {
    // Quem assina caminhos OKX: o catálogo de rotas, o teste de conexão (probe) e os módulos de rotas.
    const dir = join(import.meta.dir, "../onchain-read");
    const routes = readdirSync(join(dir, "routes")).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts")).map((file) => join("routes", file));
    const source = ["catalog.ts", "probe.ts", ...routes].map((file) => readFileSync(join(dir, file), "utf8")).join(" ");
    const signed = new Set(source.match(/\/api\/v6\/dex\/[A-Za-z0-9/-]+/g) ?? []);
    const registered = new Set([...OKX_MARKET_ENDPOINTS.map((e) => e.path), ...OKX_TRADE_PATHS]);
    expect([...signed].filter((path) => !registered.has(path))).toEqual([]);
    expect([...registered].filter((path) => !signed.has(path))).toEqual([]);
  });

  test("a cotação, o swap e a aprovação pertencem ao pool Trade, com o mesmo RPS", () => {
    expect(OKX_TRADE_PATHS).toContain(OKX_QUOTE_PATH);
    const entries = okxEntries().filter((e) => OKX_TRADE_PATHS.includes(e.endpoint));
    expect(entries.length).toBe(OKX_TRADE_PATHS.length);
    for (const entry of entries) expect(entry).toMatchObject({ pool: "trade", rps: 1 });
  });

  test("plano Free: 100 mil Basic e 100 mil Premium compartilhados por faixa, faixa gratuita sem franquia", () => {
    const registry = createBudgetRegistry(okxEntries());
    const find = (endpoint: string) => registry.entries.find((e) => e.endpoint === endpoint)!;
    const basic = OKX_MARKET_ENDPOINTS.filter((e) => e.tier === "basic");
    const premium = OKX_MARKET_ENDPOINTS.filter((e) => e.tier === "premium");
    expect(new Set(basic.map((e) => poolId(find(e.path)))).size).toBe(1);
    expect(new Set(premium.map((e) => poolId(find(e.path)))).size).toBe(1);
    expect(poolId(find(basic[0]!.path))).not.toBe(poolId(find(premium[0]!.path)));
    expect(find(basic[0]!.path).franquiaMensal).toBe(100_000);
    expect(find(premium[0]!.path).franquiaMensal).toBe(100_000);
    for (const e of OKX_MARKET_ENDPOINTS.filter((x) => x.tier === "free")) expect(find(e.path).franquiaMensal).toBeUndefined();
  });

  test("Market não declara RPS: o provedor não publicou, então nenhum teto por minuto, hora ou dia é inventado", () => {
    for (const entry of okxEntries().filter((e) => e.pool?.startsWith("market-"))) {
      expect(entry.rps).toBeUndefined();
      expect(entry.rpm).toBeUndefined();
    }
  });

  test("Trade usa o Trial documentado: 1 RPS, validade de 60 dias só quando a criação da chave é conhecida", () => {
    const quote = (options?: Parameters<typeof okxEntries>[0]) => okxEntries(options).find((e) => e.endpoint === OKX_QUOTE_PATH)!;
    expect(quote().rps).toBe(1);
    expect(quote().expiresAt).toBeUndefined();
    expect(quote({ tradeKeyCreatedAtMs: T0 }).expiresAt).toBe(T0 + OKX_TRADE_TRIAL_MS);
    expect(OKX_TRADE_TRIAL_MS).toBe(60 * 86_400_000);
    expect(quote({ tradeRps: 5 }).rps).toBe(5);
    expect(quote().validated).toBe(true);
  });

  test("endpoints fora da página de custos ficam marcados como não validados", () => {
    const unlisted = OKX_MARKET_ENDPOINTS.filter((e) => !e.listed).map((e) => e.path);
    expect(unlisted.length).toBeGreaterThan(0);
    for (const entry of okxEntries().filter((e) => unlisted.includes(e.endpoint))) expect(entry.validated).toBe(false);
    for (const entry of okxEntries().filter((e) => e.pool?.startsWith("market-") && !unlisted.includes(e.endpoint))) expect(entry.validated).toBe(true);
  });

  test("planos pagos trocam só as cotas e o Enterprise é ilimitado", () => {
    const basic = (plan: string) => okxEntries({ plan }).find((e) => e.pool === "market-basic")!.franquiaMensal;
    expect(basic("starter")).toBe(OKX_MARKET_PLANS.starter!.basic ?? undefined);
    expect(basic("starter")).toBe(2_000_000);
    expect(basic("enterprise")).toBeUndefined();
    expect(() => okxEntries({ plan: "inventado" })).toThrow("plano OKX desconhecido");
  });

  test("a chave é o nome da variável de ambiente, nunca um valor", () => {
    for (const entry of okxEntries()) expect(entry.key).toBe(OKX_KEY_ENV);
    expect(OKX_KEY_ENV).toBe("OKX_WEB3_API_KEY");
  });
});
