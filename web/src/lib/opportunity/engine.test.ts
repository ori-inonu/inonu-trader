// The opportunity engine as the page reads it: the contract of the core, strictly, and the rows a person reads. origin: synthetic_fixture, tests only. No network, no clock.
import { describe, expect, test } from "bun:test";
import { ENGINE_CARE, engineRows, MEASURED_LINE, parseEngineState, readingsOf, type EnginePair, type EngineRead } from "./engine";

const FORBIDDEN = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);

const read = (over: Partial<EngineRead> = {}): EngineRead => ({
  price: 1246.5, pos30: 0.26, drawdown90: 0.27, rsi14: 47.4, roomToHigh30: 0.36, gapToLow30: 0.15, roomRatio: 2.4, volRatio: 1.4, noNewLow: true, aboveSma5: true, atrPct: 0.05, meanVol30: 7e7,
  held: { desconto: true, virada: true, participacao: true }, count: 3, ...over,
});
const pair = (over: Partial<EnginePair> = {}): EnginePair => ({ instId: "ZEC-USDT", base: "ZEC", price: 1246.5, change24h: 0.0888, volQuote24h: 77_600_000, spreadBps: 0.9, attention: 1.2, moveAtr: 1.8, read: read(), ...over });
const board = (pairs: EnginePair[]) => ({ asOfMs: 1_000, universe: { listed: 427, liquid: 90, read: 85, failed: 5 }, pairs });
const body = (over: Record<string, unknown> = {}) => ({ ok: true, advisory: true, execution: "never", state: "pronto", board: board([pair()]), ...over });

describe("the contract of the core", () => {
  test("a ready board is read as it is", () => {
    const state = parseEngineState(body());
    expect(state).toMatchObject({ state: "pronto" });
    expect(state?.state === "pronto" && state.board.pairs[0]!.read.held.desconto).toBe(true);
  });

  test("the four states, with the last board kept while it reads again or after a failure", () => {
    expect(parseEngineState({ ok: true, execution: "never", state: "idle" })).toEqual({ state: "idle" });
    expect(parseEngineState({ ok: true, execution: "never", state: "lendo", done: 3, of: 90, board: null })).toEqual({ state: "lendo", done: 3, of: 90, board: null });
    expect(parseEngineState(body({ state: "lendo", done: 3, of: 90 }))).toMatchObject({ state: "lendo", board: { universe: { read: 85 } } });
    expect(parseEngineState({ ok: true, execution: "never", state: "erro", code: "timeout", board: null })).toEqual({ state: "erro", code: "timeout", board: null });
  });

  test("anything that is not the contract is no state: not ok, an order, an unknown state, a ready one without a board, a code that is not a code", () => {
    expect(parseEngineState(null)).toBeNull();
    expect(parseEngineState(body({ ok: false }))).toBeNull();
    expect(parseEngineState(body({ execution: "now" }))).toBeNull();
    expect(parseEngineState(body({ state: "voando" }))).toBeNull();
    expect(parseEngineState(body({ board: null }))).toBeNull();
    expect(parseEngineState(body({ board: { asOfMs: 1 } }))).toBeNull();
    expect(parseEngineState({ ok: true, execution: "never", state: "erro", code: "A OKX disse: erro 123", board: null })).toBeNull();
    expect(parseEngineState({ ok: true, execution: "never", state: "lendo", done: "3", of: 90, board: null })).toBeNull();
  });

  test("a pair that is not exactly the shape is left out and the rest of the board stays true", () => {
    const broken = [pair({ instId: "bad pair" }), pair({ instId: "A-USDT", price: -1 }), pair({ instId: "B-USDT", read: { ...read(), count: 7 } }), pair({ instId: "C-USDT", read: { ...read(), held: { desconto: true } as never } }), pair({ instId: "D-USDT", attention: 5 }), pair({ instId: "E-USDT", attention: Number.NaN }), pair({ instId: "OK-USDT", base: "OK" })];
    const state = parseEngineState(body({ board: board(broken) }));
    expect(state?.state === "pronto" && state.board.pairs.map((p) => p.instId)).toEqual(["OK-USDT"]);
  });
});

describe("the readings in words", () => {
  test("each one is a measurement, written for the reading that holds and for the one that does not", () => {
    const on = readingsOf(read());
    expect(on.map((r) => r.id)).toEqual(["desconto", "virada", "participacao"]);
    expect(on[0]!.text).toBe("no 26% da faixa de 30 dias (0% e a minima) e 27% abaixo da maxima de 90 dias, RSI 47");
    expect(on[1]!.text).toBe("sem minima nova nos ultimos 3 dias e acima da media de 5 dias");
    expect(on[2]!.text).toBe("volume de 24 h em 1,4x a media dos 7 dias anteriores");
    const off = readingsOf(read({ held: { desconto: false, virada: false, participacao: false }, noNewLow: false, aboveSma5: false, volRatio: 0.8, rsi14: null }));
    expect(off.every((r) => !r.on)).toBe(true);
    expect(off[1]!.text).toBe("fez minima nova nos ultimos 3 dias e abaixo da media de 5 dias");
    expect(off[2]!.text).toBe("volume de 24 h em 0,8x a media dos 7 dias anteriores");
    expect(off[0]!.text).not.toContain("RSI");
  });

  test("no mean of volume to compare says so instead of a ratio", () => {
    expect(readingsOf(read({ volRatio: null, held: { desconto: true, virada: true, participacao: false } }))[2]!.text).toBe("sem media de volume para comparar");
  });
});

describe("the rows", () => {
  test("keep the order the core gave, at the budget of a tab, and say how many pairs were read; a pair with no reading in its favour is still a pair that is out of the ordinary", () => {
    const none = pair({ instId: "NONE-USDT", base: "NONE", read: read({ count: 0, held: { desconto: false, virada: false, participacao: false } }) });
    const many = Array.from({ length: 15 }, (_, i) => pair({ instId: `P${i}-USDT`, base: `P${i}` }));
    const { rows, total } = engineRows(board([...many.slice(0, 3), none, ...many.slice(3)]), 12);
    expect(total).toBe(16);
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.symbol).slice(0, 4)).toEqual(["P0", "P1", "P2", "NONE"]);
    expect(rows[3]!.count).toBe(0);
    expect(engineRows(null)).toEqual({ rows: [], total: 0 });
  });

  test("what is out of the ordinary is told as two facts and a level of the bar: the move in ranges of the pair, its volume against its week", () => {
    const [row] = engineRows(board([pair({ attention: 1.2, moveAtr: -2.34, read: read({ volRatio: 1.4 }) })])).rows;
    expect(row!.unusual).toEqual({ move: "-2,3x", volume: "1,4x", level: 0.6 });
    const quiet = engineRows(board([pair({ attention: 0, moveAtr: null, read: read({ volRatio: null }) })])).rows[0]!;
    expect(quiet.unusual).toEqual({ move: "-", volume: "-", level: 0 });
    expect(engineRows(board([pair({ attention: 2 })])).rows[0]!.unusual.level).toBe(1);
  });

  test("the numbers a person reads: price at its magnitude, signed change, money traded, spread, the room up and the gap down", () => {
    const [row] = engineRows(board([pair()])).rows;
    expect(row).toMatchObject({ instId: "ZEC-USDT", symbol: "ZEC", count: 3, spread: "0,9 bps" });
    expect(row!.change.tone).toBe("up");
    expect(row!.change.text).toBe("+8,88%");
    expect(row!.volume).toContain("mi");
    const falling = engineRows(board([pair({ change24h: -0.12 })])).rows[0]!;
    expect(falling.change).toMatchObject({ tone: "down", text: "-12,00%" });
  });

  test("the marks of care are measurements with their number, and a healthy pair has none", () => {
    expect(engineRows(board([pair()])).rows[0]!.marks).toEqual([]);
    const marked = engineRows(board([pair({ change24h: -0.12, spreadBps: 9.5, read: read({ atrPct: 0.11 }) })])).rows[0]!;
    expect(marked.marks).toEqual(["oscila 11% por dia em media", "caiu 12% em 24 h", "spread de 9,5 bps"]);
    // the limit is the edge: at it counts
    expect(engineRows(board([pair({ read: read({ atrPct: ENGINE_CARE.atrPct }) })])).rows[0]!.marks).toHaveLength(1);
  });

  test("the line that says what the history measured is on the screen's own terms: honest about the result, plain ASCII, no order word", () => {
    expect(MEASURED_LINE).toContain("nenhuma leitura do historico de precos teve vantagem firme");
    expect(MEASURED_LINE).toContain("nao o que vai subir");
    expect(MEASURED_LINE).not.toMatch(FORBIDDEN);
    expect(MEASURED_LINE).toMatch(/^[ -~]+$/);
    expect(MEASURED_LINE.toLowerCase()).not.toMatch(/(comprar|compre|vender|venda|sinal|sinais|recomend|aconselh|deve)/);
  });

  test("a change the exchange did not send is not a zero", () => {
    expect(engineRows(board([pair({ change24h: null })])).rows[0]!.change.tone).toBe("none");
  });

  test("no middle dot, no dash, no broken number and no word of an order in anything it writes", () => {
    const rows = engineRows(board([pair({ change24h: -0.2, spreadBps: 12, read: read({ atrPct: 0.2 }) }), pair({ instId: "N-USDT", base: "N", read: read({ volRatio: null, rsi14: null, noNewLow: false, aboveSma5: false, held: { desconto: true, virada: false, participacao: false }, count: 1 }) })])).rows;
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(FORBIDDEN);
    for (const word of ["NaN", "undefined", "Infinity"]) expect(text).not.toContain(word);
    expect(text.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|sinais|recomend|aconselh|deve)\b/);
  });
});
