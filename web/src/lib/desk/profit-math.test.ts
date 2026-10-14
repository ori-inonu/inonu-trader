// The account of the profit: what a plan is worth after the costs, and how often it must work to break even. It predicts nothing. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { PLANO } from "../veredito/test-fixtures";
import { profitLines, profitMath } from "./profit-math";

describe("profitMath", () => {
  test("the plan of the fixture: the target and the stop in percent, the cost, what is left after it, the net ratio the core already computed", () => {
    const m = profitMath(PLANO);
    expect(m.targetPct).toBeCloseTo(3.518, 6);
    expect(m.stopPct).toBeCloseTo(1.508, 6);
    expect(m.costPct).toBeCloseTo(0.24, 6);
    expect(m.gainNetPct).toBeCloseTo(3.278, 6);
    expect(m.lossNetPct).toBeCloseTo(1.748, 6);
    // the same number the core puts in the plan (1.88 after costs)
    expect(m.netRatio).toBeCloseTo(PLANO.ganhoRiscoLiquido!, 2);
  });

  test("the break even is the loss over the sum of the gain and the loss, after costs", () => {
    const m = profitMath(PLANO);
    expect(m.breakEvenPct).toBeCloseTo((1.748 / (3.278 + 1.748)) * 100, 4);
    expect(m.breakEvenPct!).toBeGreaterThan(30);
    expect(m.breakEvenPct!).toBeLessThan(40);
    // a plan that risks as much as it can win needs a little more than half the times, because of the cost
    const even = profitMath({ ...PLANO, alvoBps: 100, riscoBps: 100, custoBps: 20 });
    expect(even.breakEvenPct!).toBeGreaterThan(50);
  });

  test("in dollars: the most gained at the target after costs, and the most lost at the stop (the loss the core gave already has the cost in it)", () => {
    const m = profitMath(PLANO);
    expect(m.usd).not.toBeNull();
    expect(m.usd!.notional).toBeCloseTo(572.23, 2);
    expect(m.usd!.loss).toBe(10);
    expect(m.usd!.gain).toBeCloseTo((572.23 * 327.8) / 10_000, 2);
  });

  test("without a profile there are no dollars, and nothing is invented", () => {
    expect(profitMath({ ...PLANO, tamanho: null }).usd).toBeNull();
  });

  test("a cost that eats the target leaves no gain, no break even and no ratio: no share of the times is enough", () => {
    for (const custoBps of [351.8, 400, 1000]) {
      const m = profitMath({ ...PLANO, custoBps });
      expect(m.gainNetPct).toBeNull();
      expect(m.breakEvenPct).toBeNull();
      expect(m.netRatio).toBeNull();
      expect(m.usd?.gain).toBeNull();
    }
  });

  test("numbers that are not numbers never become a result", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = profitMath({ ...PLANO, alvoBps: bad });
      expect(m.gainNetPct).toBeNull();
      expect(m.breakEvenPct).toBeNull();
    }
  });
});

describe("profitLines", () => {
  const MEASURED = "Acerto do Inonu: ainda nao medido.";

  test("the three sums and the dollars, in plain words, with the break even read against what is measured", () => {
    const lines = profitLines(profitMath(PLANO), MEASURED);
    expect(lines[0]).toBe("Se der certo: +3,28% (alvo 3,52% menos 0,24% de custo).");
    expect(lines[1]).toBe("Se der errado: -1,75% (a ideia cai em 1,51%, mais 0,24% de custo).");
    expect(lines[2]).toBe("Para empatar, o plano precisa dar certo em 35% das vezes. Acerto do Inonu: ainda nao medido.");
    expect(lines[3]).toBe("Com o seu risco: ganha ate US$ 18,76 ou perde US$ 10,00, em US$ 572,23.");
    expect(lines.length).toBe(4);
  });

  test("no dollar line without a profile", () => {
    expect(profitLines(profitMath({ ...PLANO, tamanho: null }), MEASURED).length).toBe(3);
  });

  test("a plan the cost eats says so in one line, with both numbers", () => {
    expect(profitLines(profitMath({ ...PLANO, custoBps: 400 }), MEASURED)).toEqual(["O custo de entrar e sair (4,00%) come o alvo (3,52%): este plano nao paga."]);
  });

  test("plain ASCII, no middle dot or dash, and no promise: no word of a chance, a forecast or a guarantee", () => {
    for (const lines of [profitLines(profitMath(PLANO), MEASURED), profitLines(profitMath({ ...PLANO, custoBps: 400 }), MEASURED)]) {
      for (const line of lines) {
        expect(line).not.toMatch(/[^\x20-\x7e]/);
        expect(line.toLowerCase()).not.toMatch(/garant|certeza|previs|chance de ganhar|lucro certo|sem risco/);
      }
    }
  });

  test("thousands are separated with a dot and decimals with a comma", () => {
    const lines = profitLines(profitMath({ ...PLANO, tamanho: { riscoUsd: 100, notionalUsd: 12_345.678, quantidadeBase: 1, limitadoPeloCapital: false } }), MEASURED);
    expect(lines[3]).toContain("em US$ 12.345,68.");
  });
});
