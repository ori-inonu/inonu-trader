import { describe, expect, test } from "bun:test";
import { FEATURE_NAMES, type FeatureVector } from "../intel/features/types";
import { Rng } from "../lab/rng";
import { GATE_MESSAGES, GATE_PRIORS, composeVerdict, confidenceWord, type VerdictInput } from "./compose";
import { riskPlan } from "./risk-plan";
import { GATES } from "./types";

const features = (values: Record<string, number | null>, over: { idades?: Record<string, number>; nulos?: Record<string, string> } = {}): FeatureVector => ({
  v: 1, instId: "ETH-USDT", asOfMs: 1, values: Object.fromEntries(FEATURE_NAMES.map((n) => [n, values[n] ?? null])), nulos: over.nulos ?? {}, idades: over.idades ?? {},
});

const bullish = { "trend.ema1h": 1, "trend.ema4h": 1, "flow.warm": 1, "flow.absorbSide": 1, "smc15.breakDir": 1, "smc15.breakChoch": 1, "smc15.breakAge": 4, "cost.moveToCost1h": 4.2 };
const demand = { baixo: 98.5, alto: 99.5, invalidacao: 98, nota: 62.4 };
const supply = { baixo: 100.5, alto: 101.5, invalidacao: 102, nota: 55 };

const input = (over: Partial<VerdictInput> = {}): VerdictInput => ({
  action: "buy", market: "spot", price: 100, jev: { consistency: 0.8, orderingsAgree: true }, features: features(bullish), zone: demand, atr15m: 1, costRoundTripBps: 24,
  targets: [{ preco: 103, tipo: "zona_oposta" }], profile: { capitalUsd: 1000, riskPct: 1 }, placarMedido: false, ...over,
});

describe("the twelve scenarios of the acceptance (AC-INT-3)", () => {
  test("1 a clear buy: the seal, three reasons, the plan, and what could go wrong", () => {
    const v = composeVerdict(input());
    expect([v.selo, v.forcadoPor, v.confianca]).toEqual(["comprar", null, "alta"]);
    expect(v.motivos).toHaveLength(3);
    expect(v.mensagem).toBe("Inonu decidiu comprar perto de 99,50.");
    expect(v.plano).not.toBeNull();
    expect(v.plano!.invalidacao).toBe(98);
    expect(v.notaZona).toBe(62);
    expect(v.avisos).toContain("O acerto destas respostas ainda nao foi medido.");
    expect(v.consultivo).toContain("Nenhuma ordem foi enviada");
  });

  test("2 a clear sell mirrors it", () => {
    const v = composeVerdict(input({ action: "sell", zone: supply, market: "perp", features: features({ "trend.ema1h": -1, "trend.ema4h": -1, "flow.warm": 1, "flow.absorbSide": -1, "cost.moveToCost1h": 4 }), targets: [{ preco: 96, tipo: "zona_oposta" }] }));
    expect([v.selo, v.plano!.lado, v.plano!.entradaReferencia, v.plano!.alvo]).toEqual(["vender", "venda", 100.5, 96]);
    expect(v.motivos[0]).toBe("A tendencia de 1 hora e de 4 horas e de baixa.");
  });

  test("3 warming up: the zones are not trusted", () => {
    const v = composeVerdict(input({ features: features({ ...bullish, "flow.warm": 0 }) }));
    expect([v.selo, v.forcadoPor, v.plano, v.mensagem]).toEqual(["esperar", "aquecimento", null, GATE_MESSAGES.aquecimento]);
  });

  test("4 old data, from the bars or from the flow", () => {
    expect(composeVerdict(input({ features: features(bullish, { nulos: { bars15m: "velas_velhas" } }) })).forcadoPor).toBe("dado_velho");
    expect(composeVerdict(input({ features: features(bullish, { idades: { flow: GATE_PRIORS.maxFlowAgeMs + 1 } }) })).forcadoPor).toBe("dado_velho");
    expect(composeVerdict(input({ features: features(bullish, { idades: { flow: GATE_PRIORS.maxFlowAgeMs } }) })).forcadoPor).toBeNull();
  });

  test("5 the cost eats the move", () => {
    const v = composeVerdict(input({ features: features({ ...bullish, "cost.moveToCost1h": 0.6 }) }));
    expect([v.selo, v.forcadoPor, v.mensagem]).toEqual(["esperar", "custo", GATE_MESSAGES.custo]);
    expect(composeVerdict(input({ features: features({ ...bullish, "cost.moveToCost1h": 1 }) })).forcadoPor).toBeNull();
  });

  test("6 the model was divided", () => {
    expect(composeVerdict(input({ jev: { consistency: 0.2, orderingsAgree: true } })).forcadoPor).toBe("confianca_baixa");
    expect(composeVerdict(input({ jev: { consistency: GATE_PRIORS.minConsistency, orderingsAgree: true } })).forcadoPor).toBeNull();
  });

  test("7 the two orderings of the options disagree", () => {
    const v = composeVerdict(input({ jev: { consistency: 0.9, orderingsAgree: false } }));
    expect([v.selo, v.forcadoPor]).toEqual(["esperar", "ordem_discorda"]);
  });

  test("8 a honeypot, or a risk level of four, is never offered", () => {
    expect(composeVerdict(input({ market: "token", tokenRisk: { honeypot: true, level: 1 } })).forcadoPor).toBe("risco_alto");
    expect(composeVerdict(input({ market: "token", tokenRisk: { honeypot: false, level: 4 } })).forcadoPor).toBe("risco_alto");
    expect(composeVerdict(input({ market: "token", tokenRisk: { honeypot: false, level: 3 } })).forcadoPor).toBeNull();
    expect(composeVerdict(input({ market: "token", tokenRisk: { honeypot: null, level: null } })).forcadoPor).toBeNull();
  });

  test("9 no zone: the plan hangs on one ATR and says so", () => {
    const v = composeVerdict(input({ zone: null, targets: [] }));
    expect(v.selo).toBe("comprar");
    expect(v.plano!.entradaReferencia).toBe(100);
    expect(v.plano!.alvoTipo).toBe("multiplo");
    expect(v.notaZona).toBeNull();
  });

  test("10 the model said hold: esperar, with no gate, and the reason is in the numbers", () => {
    const v = composeVerdict(input({ action: "hold" }));
    expect([v.selo, v.forcadoPor, v.plano]).toEqual(["esperar", null, null]);
    expect(v.mensagem).toBe("Inonu decidiu esperar.");
    expect(v.motivos).toEqual(["Nao ha sinal claro nos numeros de agora."]);
  });

  test("11 no model key", () => {
    const v = composeVerdict(input({ action: null, failure: "sem_chave" }));
    expect([v.selo, v.forcadoPor, v.mensagem]).toEqual(["esperar", "sem_chave", GATE_MESSAGES.sem_chave]);
  });

  test("12 the model failed", () => {
    const v = composeVerdict(input({ action: null, failure: "modelo_falhou" }));
    expect([v.selo, v.forcadoPor]).toEqual(["esperar", "modelo_falhou"]);
    expect(composeVerdict(input({ action: null })).forcadoPor).toBe("modelo_falhou");
  });

  test("every gate has its own message, and a gate is never silent", () => {
    expect(new Set(GATES.map((g) => GATE_MESSAGES[g])).size).toBe(GATES.length);
    for (const g of GATES) expect(GATE_MESSAGES[g].length).toBeGreaterThan(10);
  });
});

describe("the order of the gates", () => {
  test("a risk of a token comes before the warm-up, the warm-up before old data, and so on", () => {
    const everything = input({ market: "token", tokenRisk: { honeypot: true, level: null }, features: features({ ...bullish, "flow.warm": 0, "cost.moveToCost1h": 0.1 }, { nulos: { bars15m: "velas_velhas" } }), jev: { consistency: 0.1, orderingsAgree: false } });
    expect(composeVerdict(everything).forcadoPor).toBe("risco_alto");
    expect(composeVerdict({ ...everything, tokenRisk: null }).forcadoPor).toBe("aquecimento");
    expect(composeVerdict({ ...everything, tokenRisk: null, features: features({ ...bullish, "cost.moveToCost1h": 0.1 }, { nulos: { bars15m: "velas_velhas" } }) }).forcadoPor).toBe("dado_velho");
    expect(composeVerdict({ ...everything, tokenRisk: null, features: features({ ...bullish, "cost.moveToCost1h": 0.1 }) }).forcadoPor).toBe("ordem_discorda");
    expect(composeVerdict({ ...everything, tokenRisk: null, features: features({ ...bullish, "cost.moveToCost1h": 0.1 }), jev: { consistency: 0.1, orderingsAgree: true } }).forcadoPor).toBe("confianca_baixa");
    expect(composeVerdict({ ...everything, tokenRisk: null, features: features({ ...bullish, "cost.moveToCost1h": 0.1 }), jev: { consistency: 0.9, orderingsAgree: true } }).forcadoPor).toBe("custo");
  });
  test("a hold is never gated by the numbers, only by a failure or a risk", () => {
    expect(composeVerdict(input({ action: "hold", features: features({ ...bullish, "flow.warm": 0 }) })).forcadoPor).toBeNull();
  });
});

describe("the plan and the warnings", () => {
  test("the numbers are exactly those of the plan module, so an independent script can recompute them", () => {
    const v = composeVerdict(input());
    const direct = riskPlan({ side: "compra", price: 100, zone: demand, atr15m: 1, costRoundTripBps: 24, targets: [{ preco: 103, tipo: "zona_oposta" }], profile: { capitalUsd: 1000, riskPct: 1 } });
    expect(direct.ok && v.plano).toEqual(direct.ok ? direct.plan : null);
  });
  test("the entry that waits, a ratio under one, a missing profile and the cap are all said", () => {
    const wait = composeVerdict(input({ profile: null, costRoundTripBps: 200 }));
    expect(wait.avisos).toContain("A faixa de entrada fica a 0,50% do preco: a ideia so comeca se o preco chegar la.");
    expect(wait.avisos).toContain("Depois dos custos, o ganho estimado e menor que o risco.");
    expect(wait.avisos).toContain("Informe seu capital e quanto aceita perder em Configuracoes para ver o tamanho.");
    expect(composeVerdict(input({ profile: { capitalUsd: 100, riskPct: 5 } })).avisos).toContain("O tamanho foi limitado ao seu capital: nao ha alavancagem aqui.");
  });
  test("a token has no plan, a spot sell is a warning, a price already past the end of the idea waits", () => {
    const token = composeVerdict(input({ market: "token", features: null, zone: null }));
    expect([token.selo, token.plano]).toEqual(["comprar", null]);
    expect(token.avisos).toContain("Para tokens on-chain ainda nao ha plano de risco.");
    expect(composeVerdict(input({ action: "sell", zone: supply, targets: [] })).avisos).toContain("No spot, vender so vale se voce ja tem o ativo.");
    const late = composeVerdict(input({ price: 97.5 }));
    expect([late.selo, late.forcadoPor, late.mensagem]).toEqual(["esperar", null, "O preco ja passou do ponto em que a ideia cai. Esperar."]);
  });
  test("a measured Placar drops the warning that it is not measured", () => {
    expect(composeVerdict(input({ placarMedido: true })).avisos).not.toContain("O acerto destas respostas ainda nao foi medido.");
  });
});

describe("the confidence is a word for the model's consistency, nothing more", () => {
  test("bands and unknown", () => {
    expect([confidenceWord(0.1), confidenceWord(0.39), confidenceWord(0.4), confidenceWord(0.69), confidenceWord(0.7), confidenceWord(1)]).toEqual(["baixa", "baixa", "media", "media", "alta", "alta"]);
    expect([confidenceWord(null), confidenceWord(Number.NaN)]).toEqual([null, null]);
    expect(composeVerdict(input({ jev: null })).confianca).toBeNull();
  });
});

describe("the action is always the model's (VER-2)", () => {
  test("over thousands of random inputs the seal is comprar only for buy, vender only for sell, and a gate always means esperar", () => {
    const rng = new Rng(20261013, "verdict");
    const pick = <T,>(xs: readonly T[]): T => xs[rng.int(xs.length)]!;
    for (let i = 0; i < 4000; i += 1) {
      const action = pick(["buy", "sell", "hold", null] as const);
      const v = composeVerdict(input({
        action,
        failure: pick([null, "sem_chave", "modelo_falhou"] as const),
        market: pick(["spot", "perp", "token"] as const),
        price: pick([100, 97, 103, null]),
        jev: pick([null, { consistency: rng.next(), orderingsAgree: pick([true, false, null]) }]),
        features: pick([null, features({ ...bullish, "flow.warm": pick([0, 1]), "cost.moveToCost1h": rng.next() * 5 })]),
        zone: pick([null, demand, supply]),
        atr15m: pick([null, 1, 0]),
        costRoundTripBps: pick([null, 24, 500]),
        tokenRisk: pick([null, { honeypot: pick([true, false, null]), level: pick([null, 0, 4]) }]),
        profile: pick([null, { capitalUsd: 1000, riskPct: 1 }]),
        placarMedido: pick([true, false]),
      }));
      if (v.selo === "comprar") expect(action).toBe("buy");
      if (v.selo === "vender") expect(action).toBe("sell");
      if (v.forcadoPor !== null) expect(v.selo).toBe("esperar");
      if (v.selo !== "esperar") expect(v.forcadoPor).toBeNull();
    }
  });
});

describe("the words", () => {
  test("every sentence of every scenario is plain ASCII, with no dash, no middle dot and no promise", () => {
    const scenarios = [input(), input({ action: "sell", zone: supply }), input({ action: "hold" }), input({ features: features({ ...bullish, "flow.warm": 0 }) }), input({ market: "token", features: null, zone: null }), input({ profile: null, costRoundTripBps: 300 })];
    for (const v of scenarios.map((s) => composeVerdict(s))) {
      for (const t of [v.mensagem, v.consultivo, v.risco ?? "", ...v.motivos, ...v.avisos]) {
        expect(t, t).toMatch(/^[\x20-\x7e]*$/);
        expect(t).not.toMatch(/[\u2013\u2014\u00b7]/);
        expect(t.toLowerCase()).not.toMatch(/lucro|garant|certeza|vai (subir|cair)/);
      }
    }
  });
});
