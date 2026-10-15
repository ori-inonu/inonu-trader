import { describe, expect, test } from "bun:test";
import { riskPlan, type PlanInput } from "./risk-plan";
import type { RiskPlan } from "./types";

const demand = { baixo: 98.5, alto: 99.5, invalidacao: 98 };
const supply = { baixo: 100.5, alto: 101.5, invalidacao: 102 };

const base = (over: Partial<PlanInput> = {}): PlanInput => ({ side: "compra", price: 100, zone: demand, atr15m: 1, costRoundTripBps: 24, targets: [{ preco: 103, tipo: "zona_oposta" }], profile: null, ...over });
const plan = (over: Partial<PlanInput> = {}): RiskPlan => {
  const r = riskPlan(base(over));
  if (!r.ok) throw new Error(`no plan: ${r.reason}`);
  return r.plan;
};

describe("a buy over a demand zone, worked on paper", () => {
  // price 100, zone 98.5 to 99.5, the idea ends at 98, the opposing zone starts at 103, round trip cost 24 bps
  test("the entry waits at the upper edge when the price is above the band", () => {
    const p = plan();
    expect([p.entradaBaixo, p.entradaAlto, p.entradaReferencia]).toEqual([98.5, 99.5, 99.5]);
    expect(p.distanciaAteEntradaBps).toBe(50); // 0.5 over 100
    expect(p.invalidacao).toBe(98);
  });
  test("risk, target and the reward over the risk net of cost", () => {
    const p = plan();
    expect([p.alvo, p.alvoTipo]).toEqual([103, "zona_oposta"]);
    expect(p.riscoBps).toBe(150.8); // 1.5 / 99.5
    expect(p.alvoBps).toBe(351.8); // 3.5 / 99.5
    expect(p.custoBps).toBe(24);
    expect(p.ganhoRiscoLiquido).toBe(1.88); // (351.76 - 24) / (150.75 + 24)
  });
  test("the price inside the band is the entry itself", () => {
    const p = plan({ price: 99 });
    expect([p.entradaReferencia, p.distanciaAteEntradaBps]).toEqual([99, 0]);
  });
});

describe("the size for the risk the person chose", () => {
  test("1 percent of 1000 dollars over a stop that costs 174.75 bps in all", () => {
    const p = plan({ profile: { capitalUsd: 1000, riskPct: 1 } });
    // recomputed here with no rounding: risk 10 dollars over (150.7538 + 24) bps, at an entry of 99.5
    const notional = 10 / ((((1.5 / 99.5) * 10_000) + 24) / 10_000);
    expect(p.tamanho!.riscoUsd).toBe(10);
    expect(p.tamanho!.notionalUsd).toBeCloseTo(notional, 2);
    expect(p.tamanho!.quantidadeBase).toBeCloseTo(notional / 99.5, 6);
    expect(p.tamanho!.limitadoPeloCapital).toBe(false);
    // and the loss if the idea ends at the invalidation, cost included, is the 10 dollars chosen
    expect(p.tamanho!.notionalUsd * ((p.riscoBps + p.custoBps) / 10_000)).toBeCloseTo(10, 1);
  });
  test("never more than the capital: there is no leverage here", () => {
    const p = plan({ profile: { capitalUsd: 100, riskPct: 5 } });
    expect(p.tamanho).toEqual({ riscoUsd: 5, notionalUsd: 100, quantidadeBase: 1.00502513, limitadoPeloCapital: true }); // 100 / 99.5
  });
  test("without a profile, or with a nonsense one, there is no size", () => {
    expect(plan().tamanho).toBeNull();
    for (const profile of [{ capitalUsd: null, riskPct: 1 }, { capitalUsd: 1000, riskPct: null }, { capitalUsd: 1000, riskPct: 0 }, { capitalUsd: -5, riskPct: 1 }, { capitalUsd: 1000, riskPct: 150 }, { capitalUsd: Number.NaN, riskPct: 1 }]) {
      expect(plan({ profile }).tamanho, JSON.stringify(profile)).toBeNull();
    }
  });
});

describe("the target", () => {
  test("a candidate closer than the risk is skipped; with none left the target is 1.5 times the risk", () => {
    const p = plan({ targets: [{ preco: 100.5, tipo: "piscina" }] });
    expect([p.alvoTipo, p.alvo]).toEqual(["multiplo", 99.5 + 1.5 * 1.5]);
  });
  test("the nearest candidate that is far enough wins, whatever its kind", () => {
    const p = plan({ targets: [{ preco: 104, tipo: "piscina" }, { preco: 101.2, tipo: "perfil" }, { preco: 99.8, tipo: "zona_oposta" }, { preco: 98, tipo: "piscina" }] });
    expect([p.alvo, p.alvoTipo]).toEqual([101.2, "perfil"]);
  });
  test("a cost that is as large as the target leaves no ratio instead of a negative one", () => {
    expect(plan({ costRoundTripBps: 400 }).ganhoRiscoLiquido).toBeNull();
  });
});

describe("a sell mirrors it", () => {
  test("entry at the lower edge of the supply zone, target below", () => {
    const p = plan({ side: "venda", zone: supply, targets: [{ preco: 96, tipo: "zona_oposta" }, { preco: 99.8, tipo: "perfil" }] }); // 99.8 is closer than the risk
    expect([p.entradaReferencia, p.invalidacao, p.alvo, p.alvoTipo]).toEqual([100.5, 102, 96, "zona_oposta"]);
    expect(p.riscoBps).toBe(149.3); // 1.5 / 100.5
    expect(p.alvoBps).toBe(447.8); // 4.5 / 100.5
  });
  test("a target above the entry is not a target for a sell", () => {
    const p = plan({ side: "venda", zone: supply, targets: [{ preco: 105, tipo: "piscina" }] });
    expect(p.alvoTipo).toBe("multiplo");
    expect(p.alvo).toBe(100.5 - 1.5 * 1.5);
  });
});

describe("without a zone the plan hangs on one ATR", () => {
  test("entry now, the idea ends one ATR away, target 1.5 ATR", () => {
    const p = plan({ zone: null, targets: [] });
    expect([p.entradaReferencia, p.invalidacao, p.alvo, p.alvoTipo, p.riscoBps, p.alvoBps]).toEqual([100, 99, 101.5, "multiplo", 100, 150]);
    expect(p.ganhoRiscoLiquido).toBe(1.02); // (150 - 24) / (100 + 24)
  });
  test("a zone with no level of its own falls back to the ATR", () => {
    const p = plan({ zone: { baixo: 98.5, alto: 99.5, invalidacao: null } });
    expect(p.invalidacao).toBe(98.5);
  });
});

describe("when there is nothing honest to say", () => {
  const reason = (over: Partial<PlanInput>) => {
    const r = riskPlan(base(over));
    return r.ok ? "ok" : r.reason;
  };
  test("no price, no cost, a broken band, no invalidation, an invalidation on the wrong side", () => {
    expect(reason({ price: Number.NaN })).toBe("sem_preco");
    expect(reason({ price: 0 })).toBe("sem_preco");
    expect(reason({ costRoundTripBps: null })).toBe("sem_custo");
    expect(reason({ zone: { baixo: 99.5, alto: 98.5, invalidacao: 98 } })).toBe("faixa_invalida");
    expect(reason({ zone: { baixo: 98.5, alto: 99.5, invalidacao: null }, atr15m: null })).toBe("sem_invalidacao");
    expect(reason({ zone: { baixo: 98.5, alto: 99.5, invalidacao: 99.9 } })).toBe("sem_invalidacao");
    expect(reason({ side: "venda", zone: supply, atr15m: 1, targets: [] })).toBe("ok");
    expect(reason({ side: "venda", zone: { baixo: 100.5, alto: 101.5, invalidacao: 100.1 } })).toBe("sem_invalidacao");
  });
  test("a price that is already past the level that ends the idea is not given a plan", () => {
    expect(reason({ price: 97.5 })).toBe("ja_invalidada");
    expect(reason({ side: "venda", zone: supply, price: 102.5 })).toBe("ja_invalidada");
  });
});
