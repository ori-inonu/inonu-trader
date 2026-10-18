// The Inonu tab of the simple desk opens with what the code ALREADY read for free, before anyone asks the model: whether the moment lines up, what the market costs to move through, and
// what the Inonu answered last time. Descriptions only. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { marketRead } from "../desk/market-read";
import type { DeskBook, DeskBookLevel } from "../desk/types";
import { preReadLines } from "./pre-read";

const lvl = (px: number, sz: number): DeskBookLevel => ({ px, sz, orders: 0 });
const BOOK: DeskBook = { instId: "BTC-USDT", asks: [lvl(100.1, 5), lvl(100.2, 10), lvl(100.5, 100)], bids: [lvl(100.0, 5), lvl(99.9, 10), lvl(99.5, 100)], tsMs: 1_000_000, seqId: null, checksumOk: null };
const market = (over: Partial<Parameters<typeof marketRead>[0]> = {}) => marketRead({ book: BOOK, quoteMultiplier: 1, nowMs: 1_002_000, stale: false, plan: null, ...over });
const scenario = { headline: "Vale perguntar ao Inonu agora: 4 de 4 condicoes alinhadas e sem resposta recente.", worthAsking: true };
const answer = { word: "Esperar", age: "ha 7 min", fresh: true };

describe("the lines", () => {
  test("the scenario, the cost of the market and the last answer, in that order, each with its kind", () => {
    const lines = preReadLines({ scenario, market: market(), answer });
    expect(lines.map((l) => l.kind)).toEqual(["cenario", "mercado", "resposta"]);
    expect(lines[0]).toMatchObject({ tone: "worth", text: scenario.headline });
    expect(lines[1]!.text).toContain("Mercado normal: ir e voltar com US$ 1.000 custa US$ 2,00 (0,20%).");
    expect(lines[2]!.text).toBe("Ultima resposta do Inonu: Esperar, ha 7 min.");
  });

  test("the scenario is stressed only when a question is worth asking", () => {
    expect(preReadLines({ scenario: { headline: "Cenario ainda nao alinhado: 1 de 4 condicoes.", worthAsking: false }, market: market(), answer })[0]!.tone).toBe("plain");
  });

  test("an old answer is called old, and no answer is said as such", () => {
    expect(preReadLines({ scenario, market: null, answer: { ...answer, fresh: false, age: "ha 3 h" } }).at(-1)!.text).toBe("Ultima resposta do Inonu: Esperar, ha 3 h (antiga).");
    expect(preReadLines({ scenario, market: null, answer: null }).at(-1)!.text).toBe("O Inonu ainda nao respondeu para este ativo.");
  });

  test("what could not be read is left out, never filled in: no book gives no cost line", () => {
    expect(preReadLines({ scenario, market: market({ book: null }), answer }).map((l) => l.kind)).toEqual(["cenario", "resposta"]);
    expect(preReadLines({ scenario, market: null, answer: null }).map((l) => l.kind)).toEqual(["cenario", "resposta"]);
    expect(preReadLines({ scenario, market: market({ stale: true }), answer: null }).map((l) => l.kind)).toEqual(["cenario", "resposta"]);
  });

  test("plain ASCII, with no word of an order outside the Inonu's own answer", () => {
    const text = preReadLines({ scenario, market: market(), answer: null }).map((l) => l.text).join(" ");
    expect(text).not.toMatch(/[^\x20-\x7e]/);
    expect(text.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|recomend|aconselh|deve)\b/);
  });
});
