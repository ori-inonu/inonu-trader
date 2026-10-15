import { describe, expect, test } from "bun:test";
import { FEATURE_NAMES } from "../intel/features/types";
import { FEATURES_READ, allReasons, prosFor, riskSentence, whyWait } from "./reasons";

const bullish = {
  "trend.ema1h": 1, "trend.ema4h": 1, "trend.regime15m": 1, "trend.adx15m": 31.4,
  "smc15.breakDir": 1, "smc15.breakChoch": 1, "smc15.breakAge": 4,
  "smc1h.rangePos": 0.2, "smc15.sweepKind": 1, "smc15.sweepAge": 3,
  "flow.absorbSide": 1, "flow.deltaRatio": 0.31,
  "zone.demandNota": 62, "zone.demandBps": 20,
  "cost.moveToCost1h": 4.2,
};

describe("the dictionary only reads features that exist", () => {
  test("every name a rule reads is in the FeatureVector", () => {
    for (const name of FEATURES_READ) expect(FEATURE_NAMES, name).toContain(name);
  });
  test("and every one of them is read by some rule (an orphan would be a silent loss)", () => {
    const source = require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "reasons.ts"), "utf8") as string;
    for (const name of FEATURES_READ) expect(source.split(`"${name}"`).length - 1 + source.split(`\`\${prefix}.${name.split(".")[1]}\``).length - 1, name).toBeGreaterThan(1);
  });
});

describe("reasons in favour of a buy", () => {
  test("the three strongest come first, in plain words", () => {
    const pros = prosFor(bullish, "compra");
    expect(pros.map((r) => r.id)).toEqual(["tendencia_1h_4h", "absorcao", "estrutura_smc15"]);
    expect(pros[0]!.text).toBe("A tendencia de 1 hora e de 4 horas e de alta.");
    expect(pros[1]!.text).toBe("Vendas agressivas foram absorvidas: o preco nao caiu apesar delas.");
    expect(pros[2]!.text).toBe("A estrutura de 15 minutos virou para cima ha 4 velas.");
  });
  test("the same numbers have nothing to say in favour of a sell, except the cost, which is for either side", () => {
    expect(prosFor(bullish, "venda").map((r) => r.id)).toEqual(["custo_folgado"]);
  });
  test("a break older than twelve bars, a flat delta and a middle range say nothing", () => {
    const quiet = { "smc15.breakDir": 1, "smc15.breakChoch": 1, "smc15.breakAge": 13, "flow.deltaRatio": 0.1, "smc1h.rangePos": 0.5 };
    expect(allReasons(quiet)).toEqual([]);
  });
  test("a trend of one hour alone is a weaker reason than both", () => {
    const p = prosFor({ "trend.ema1h": 1, "trend.ema4h": 0 }, "compra");
    expect(p.map((r) => [r.id, r.weight])).toEqual([["tendencia_1h", 0.4]]);
    expect(allReasons({ "trend.ema1h": 1, "trend.ema4h": -1 })).toEqual([]);
  });
});

describe("what can go wrong", () => {
  test("the strongest reason in favour of the other side, phrased as the cost of being wrong", () => {
    const s = riskSentence({ ...bullish, "trend.ema4h": -1, "trend.ema1h": -1, "flow.absorbSide": 0, "smc15.breakDir": -1, "smc15.breakChoch": 0, "smc15.breakAge": 2 }, "compra");
    expect(s).toBe("Contra: a tendencia de 1 hora e de 4 horas e de baixa.");
  });
  test("with no reason against, a very volatile hour is said; with none of that, a heavy cost; else nothing", () => {
    expect(riskSentence({ "vol.rank24h": 0.95 }, "compra")).toContain("volatilidade");
    expect(riskSentence({ "cost.moveToCost1h": 1.4 }, "compra")).toBe("O custo de entrar e sair pesa: o movimento tipico de 1 hora e so 1,4 vezes ele.");
    expect(riskSentence({}, "compra")).toBeNull();
  });
});

describe("waiting", () => {
  test("strong reasons on both sides say so; none says there is no clear signal", () => {
    expect(whyWait({ "trend.ema1h": 1, "trend.ema4h": 1, "smc15.sweepKind": -1, "smc15.sweepAge": 2 })).toBe("Os sinais apontam para os dois lados.");
    expect(whyWait({})).toBe("Nao ha sinal claro nos numeros de agora.");
  });
});

describe("the words", () => {
  test("plain ASCII, no dash, no middle dot, nothing that promises", () => {
    for (const side of ["compra", "venda"] as const) {
      for (const values of [bullish, { ...bullish, "drv.fundingBps": -6, "trend.extAtr15m": -3, "mom.rsi15m": 20 }, { "drv.fundingBps": 7, "trend.extAtr15m": 3, "mom.rsi15m": 80, "smc1h.rangePos": 0.9 }]) {
        const texts = [...allReasons(values).map((r) => r.text), riskSentence(values, side) ?? "", whyWait(values)];
        for (const t of texts) {
          expect(t, t).toMatch(/^[\x20-\x7e]*$/);
          expect(t).not.toMatch(/[\u2013\u2014\u00b7]/);
          expect(t.toLowerCase()).not.toMatch(/lucro|garant|vai (subir|cair)|certeza/);
        }
      }
    }
  });
});
