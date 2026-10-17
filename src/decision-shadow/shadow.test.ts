import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClosingRecord } from "../agent/closing";
import { T0, closing } from "./fixtures";
import { SHADOW_ASSUMPTIONS, derivePortfolio, opportunityFromClosing } from "./adapter";
import type { ReasonRecord } from "../decision/types";
import { SHADOW_LIMITS, createEngineShadow, createProductionShadow, tokenOf, type ShadowRecord } from "./shadow";

describe("opportunityFromClosing", () => {
  test("monta a oportunidade só com o que o registro traz, nas unidades certas", () => {
    const a = opportunityFromClosing(closing({ facts: { taxToPct: 0.5 } }), 0.9);
    if (!a.ok) throw new Error(`faltou ${a.missing.join(",")}`);
    const o = a.opportunity;
    expect(o).toMatchObject({ id: "cy-1:buy:token:501:AAA", chain: "501", symbol: "AAA", side: "buy", legs: 2, pWin: 0.9, upBps: 500, downBps: 150, liquidityUsd: 800_000, riskScore: 0.4, horizonMs: SHADOW_ASSUMPTIONS.horizonMs });
    expect(o.priceUsd).toBeUndefined();
    expect(o.atMs).toBe(T0 + 900);
    expect(o.quoteAtMs).toBe(T0 + 900);
    // impacto 0,1% = 10 bps; imposto de compra 0,5% = 50 bps; saída assume o mesmo impacto e imposto.
    expect(o.costs).toMatchObject({ impactBps: 10, dexFeeBps: 50, exitExtraBps: 60, gasUsd: 0.0005, slippageBps: SHADOW_ASSUMPTIONS.slippageBps, mevBps: SHADOW_ASSUMPTIONS.mevBps, spreadBps: 0 });
    expect(a.notes.length).toBeGreaterThan(0);
  });

  test("impacto a favor entra em valor absoluto: o motor nunca conta ganho de cotação", () => {
    const a = opportunityFromClosing(closing({ facts: { impactPct: 0.4 } }), 0.9);
    expect(a.ok && a.opportunity.costs.impactBps).toBe(40);
  });

  test("campo ausente nunca vira zero: a oportunidade volta não avaliável com a lista do que faltou", () => {
    const miss = (r: ClosingRecord, p: number | null = 0.9) => {
      const a = opportunityFromClosing(r, p);
      return a.ok ? [] : a.missing;
    };
    expect(miss(closing({ quote: null }))).toEqual(["quote"]);
    expect(miss(closing({ brief: null }))).toEqual(["brief"]);
    expect(miss(closing({ cand: { l: null } }))).toEqual(["cand.l"]);
    expect(miss(closing({ cand: { r: null } }))).toEqual(["cand.r"]);
    expect(miss(closing({ plano: null }))).toEqual(["plano"]);
    expect(miss(closing({ plano: { alvo: 0, stop: 1 } }))).toEqual(["plano"]);
    expect(miss(closing({ facts: { impactPct: null } }))).toEqual(["quote.impactPct"]);
    expect(miss(closing({ facts: { tradeFee: null } }))).toEqual(["quote.tradeFee"]);
    expect(miss(closing({ facts: { feeUnit: "native_minor" } }))).toEqual(["quote.tradeFee"]);
    expect(miss(closing({ facts: { taxToPct: null } }))).toEqual(["quote.taxToPct"]);
    expect(miss(closing(), null)).toEqual(["pWin"]);
    expect(miss(closing({ quote: null, brief: null }), null)).toEqual(["quote", "brief", "pWin"]);
  });

  test("honeypot e bloqueio do provedor viram token bloqueado", () => {
    const hp = opportunityFromClosing(closing({ quote: { honeypot: { from: false, to: true } } }), 0.9);
    expect(hp.ok && hp.opportunity.blocked).toBe("honeypot");
    const blocked = opportunityFromClosing(closing({ quote: { disposition: "provider_block" } }), 0.9);
    expect(blocked.ok && blocked.opportunity.blocked).toBe("provider_block");
  });
});

describe("derivePortfolio", () => {
  test("patrimônio sai do tamanho e da fração da carteira; a posição do próprio token sai do brief", () => {
    const d = derivePortfolio(closing({ cand: { y: 10 } }))!;
    // US$ 10 são 5% da carteira: US$ 200. 10% já mantido no token: US$ 20.
    expect(d.portfolio.equityUsd).toBeCloseTo(200, 9);
    expect(d.portfolio.exposureUsd).toEqual({ AAA: 20 });
    expect(d.portfolio.dayPnlUsd).toBe(0);
    expect(d.notes.length).toBeGreaterThan(0);
  });

  test("sem fração da carteira ou sem cotação não há como derivar", () => {
    expect(derivePortfolio(closing({ tam: { cart: null, liq: null } }))).toBeNull();
    expect(derivePortfolio(closing({ tam: { cart: 0, liq: null } }))).toBeNull();
    expect(derivePortfolio(closing({ quote: null }))).toBeNull();
  });
});

function shadow(pWin: Parameters<typeof createEngineShadow>[0]["pWin"], extra: Partial<Parameters<typeof createEngineShadow>[0]> = {}) {
  const logged: ShadowRecord[] = [];
  const s = createEngineShadow({ pWin, clock: { now: () => T0 + 1500 }, log: (r) => void logged.push(r), ...extra });
  return { s, logged };
}

describe("createEngineShadow", () => {
  test("probabilidade bruta (exploratória): decide, marca como não calibrada e registra a divergência com a produção", () => {
    const { s, logged } = shadow({ mode: "bruta" });
    const r = s.observe(closing())!;
    expect(logged).toEqual([r]);
    expect(r.pWin).toEqual({ mode: "bruta_nao_calibrada", value: 0.9 });
    expect(r.engine).toMatchObject({ action: "COMPRAR", reasons: ["ok"] });
    expect(r.production).toEqual({ would: "buy", wouldReason: "resposta_do_jev", applied: "buy_tenth", firstPBuy: 0.6, answerBuy: 0.9 });
    expect(r.inputs).toMatchObject({ quoteAgeMs: 600, impactBps: 10, liquidityUsd: 800_000, riskScore: 0.4, upBps: 500, downBps: 150 });
    expect(r.assumptions.join(" ")).toContain("premissa");
  });

  test("a mesma compra com probabilidade baixa vira NAO_OPERAR com motivo", () => {
    const { s } = shadow({ mode: "bruta" });
    const r = s.observe(closing({ answer: { buy: 0.1, skip: 0.9 } }))!;
    expect(r.engine).toMatchObject({ action: "NAO_OPERAR", reasons: ["no_edge"] });
    expect(r.engine!.netEdgeBps).toBeLessThan(0);
  });

  test("sem o segundo olhar usa a primeira resposta", () => {
    const { s } = shadow({ mode: "bruta" });
    expect(s.observe(closing({ answer: null, first: 0.8 }))!.pWin.value).toBe(0.8);
  });

  test("probabilidade ausente: não avalia, registra o que faltou e não inventa", () => {
    const { s } = shadow({ mode: "ausente" });
    const r = s.observe(closing())!;
    expect(r.engine).toBeNull();
    expect(r.missing).toEqual(["pWin"]);
    expect(r.pWin).toEqual({ mode: "ausente", value: null });
  });

  test("calibrada: usa o calibrador e, quando ele não tem amostra, não avalia", () => {
    const ok = shadow({ mode: "calibrada", calibrate: (p) => p / 2 }).s.observe(closing())!;
    expect(ok.pWin).toEqual({ mode: "calibrada", value: 0.45 });
    const none = shadow({ mode: "calibrada", calibrate: () => null }).s.observe(closing())!;
    expect(none.engine).toBeNull();
    expect(none.pWin.mode).toBe("ausente");
    expect(none.missing).toEqual(["pWin"]);
  });

  test("executor indisponível aparece como motivo do motor", () => {
    const { s } = shadow({ mode: "bruta" }, { executorAvailable: () => false });
    expect(s.observe(closing())!.engine).toMatchObject({ action: "NAO_OPERAR", reasons: ["executor_unavailable"] });
  });

  test("cotação velha demais para o limite do motor é recusada", () => {
    const { s } = shadow({ mode: "bruta" }, { clock: { now: () => T0 + 900 + SHADOW_LIMITS.maxQuoteAgeMs + 1 } });
    expect(s.observe(closing())!.engine!.reasons).toEqual(["quote_stale"]);
  });

  test("sem carteira derivável nem informada a oportunidade não é avaliada", () => {
    const { s } = shadow({ mode: "bruta" });
    expect(s.observe(closing({ tam: { cart: null, liq: null } }))!.missing).toEqual(["portfolio"]);
  });

  test("a carteira real, quando a produção a conhece, vale sobre a derivada", () => {
    // A carteira derivada vale US$ 200 (teto de posição de 35%: US$ 70). Com US$ 2.000 reais o teto sobe a US$ 700.
    const derived = shadow({ mode: "bruta" }).s.observe(closing())!;
    expect(derived.engine!.sizeUsd).toBeLessThanOrEqual(70.0001);
    const real = shadow({ mode: "bruta" }, { portfolio: () => ({ equityUsd: 2000, peakEquityUsd: 2000, cashUsd: 2000, dayPnlUsd: 0, exposureUsd: {}, correlation: () => 0 }) }).s.observe(closing())!;
    expect(real.engine!.sizeUsd).toBeGreaterThan(70);
    expect(real.engine!.sizeUsd).toBeLessThanOrEqual(700.0001);
    expect(real.assumptions.join(" ")).not.toContain("patrimônio derivado");
  });

  test("observar nunca lança nem muda nada: falha do log devolve null", () => {
    const s = createEngineShadow({ pWin: { mode: "bruta" }, clock: { now: () => T0 + 1500 }, log: () => { throw new Error("disco cheio"); } });
    expect(s.observe(closing())).toBeNull();
    expect(s.observe({} as ClosingRecord)).toBeNull();
  });
});

describe("createProductionShadow", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-shadow-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("grava uma linha por avaliação na pasta do agente e respeita o desligamento", () => {
    let on = true;
    const prod = createProductionShadow({ dir, now: () => T0 + 1500, enabled: () => on });
    expect(prod.observe(closing())).not.toBeNull();
    const file = join(dir, "engine-shadow.jsonl");
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(1);
    on = false;
    expect(prod.observe(closing())).toBeNull();
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(1);
    const off = createProductionShadow({ dir: join(dir, "nunca"), now: () => T0, enabled: () => false });
    off.observe(closing());
    expect(existsSync(join(dir, "nunca"))).toBe(false);
  });
});

describe("perna de papel: decisão, execução simulada e reconciliação", () => {
  const strong = () => closing({ answer: { buy: 0.9, skip: 0.1 } });
  const weak = () => closing({ answer: { buy: 0.1, skip: 0.9 } });

  function paperShadow(priceOf: (o: unknown, r: ClosingRecord) => Promise<number | undefined>) {
    const paperLog: ReasonRecord[] = [];
    const s = createEngineShadow({
      pWin: { mode: "bruta" },
      clock: { now: () => T0 + 1500 },
      log: () => undefined,
      paper: { priceOf: priceOf as never, log: (r) => void paperLog.push(r) },
    });
    return { s, paperLog };
  }

  test("a compra aprovada vira ordem de papel, com a decisão antes e o resultado depois, e custo reconciliado", async () => {
    const { s, paperLog } = paperShadow(async () => 2);
    const out = s.observe(strong())!;
    expect(out.engine?.action).toBe("COMPRAR");
    await s.settled();
    expect(paperLog).toHaveLength(2);
    expect(paperLog.every((r) => r.mode === "paper")).toBe(true);
    expect(paperLog[0]!.fill).toBeUndefined();
    const last = paperLog[1]!;
    expect(last.fill?.status).toBe("filled");
    expect(last.reconciliation).toMatchObject({ id: "cy-1:buy:token:501:AAA" });
    expect(Number.isFinite(last.reconciliation!.errorBps)).toBe(true);
    expect(last.decision.action).toBe("COMPRAR");
  });

  test("compra recusada pelo motor não gera nada no papel", async () => {
    const { s, paperLog } = paperShadow(async () => 2);
    expect(s.observe(weak())!.engine?.action).toBe("NAO_OPERAR");
    await s.settled();
    expect(paperLog).toEqual([]);
  });

  test("sem preço de referência o papel é recusado com bad_data e nada é preenchido", async () => {
    const { s, paperLog } = paperShadow(async () => undefined);
    s.observe(strong());
    await s.settled();
    expect(paperLog).toHaveLength(1);
    expect(paperLog[0]!.decision.reasons).toEqual(["bad_data"]);
    expect(paperLog[0]!.fill).toBeUndefined();
  });

  test("a mesma compra observada duas vezes gera uma ordem de papel só", async () => {
    const { s, paperLog } = paperShadow(async () => 2);
    s.observe(strong());
    s.observe(strong());
    await s.settled();
    expect(paperLog.filter((r) => r.fill?.status === "filled")).toHaveLength(1);
    expect(paperLog.some((r) => r.decision.reasons.includes("duplicate"))).toBe(true);
  });

  test("leitura de preço que lança não derruba o observador nem a produção", async () => {
    const { s, paperLog } = paperShadow(async () => {
      throw new Error("gateway caiu");
    });
    expect(s.observe(strong())!.engine?.action).toBe("COMPRAR");
    await s.settled();
    expect(paperLog).toEqual([]);
  });

  test("sem a opção de papel o observador só decide", async () => {
    const s = createEngineShadow({ pWin: { mode: "bruta" }, clock: { now: () => T0 + 1500 }, log: () => undefined });
    s.observe(strong());
    await s.settled();
  });

  test("tokenOf lê rede e endereço do id do candidato e recusa qualquer outra forma", () => {
    expect(tokenOf("buy:token:501:AAA")).toEqual({ chainIndex: "501", address: "AAA" });
    expect(tokenOf("hold:token:1:0xabc")).toEqual({ chainIndex: "1", address: "0xabc" });
    expect(tokenOf("buy:pool:501:AAA")).toBeNull();
    expect(tokenOf("buy:token:sol:AAA")).toBeNull();
    expect(tokenOf("buy:token:501:")).toBeNull();
    expect(tokenOf("lixo")).toBeNull();
  });

  test("a montagem de produção grava engine-paper.jsonl quando recebe a leitura de preço do ciclo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "engine-paper-"));
    try {
      const seen: string[] = [];
      const prod = createProductionShadow({ dir, now: () => T0 + 1500, freshPrice: async (chain, address) => (seen.push(`${chain}:${address}`), 2) });
      prod.observe(strong());
      await prod.settled();
      expect(seen).toEqual(["501:AAA"]);
      const text = readFileSync(join(dir, "engine-paper.jsonl"), "utf8");
      expect(text.trim().split(String.fromCharCode(10)).length).toBe(2);
      expect(text).toContain('"status":"filled"');
      const none = createProductionShadow({ dir: join(dir, "sem-preco"), now: () => T0 + 1500 });
      none.observe(strong());
      await none.settled();
      expect(existsSync(join(dir, "sem-preco", "engine-paper.jsonl"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
