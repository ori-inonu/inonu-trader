// RAS-3, DAT-2: what each cell of the Rastreador says. A value the exchange gave is formatted as the desk formats it; one it did not
// give is a dash with the reason on the title, never a made up number; a measurement that is old or not taken says so; the
// pressure shows the measured value with its sign and a descriptive word, never an instruction (FLX-10).
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { cellsFor, type CellContext } from "./cells";
import type { PressureRead } from "./flow";
import type { RastreadorRow } from "./model";
import type { PerformanceRead } from "./performance";

const NOW = 1_800_000_000_000;
const row = (over: Partial<RastreadorRow> = {}): RastreadorRow => ({ id: "BTC-USDT", mercado: "spot", base: "BTC", preco: 80_000, var24hPct: 5.2631, volUsd24h: 900_000_000, volAprox: false, rank: 2, tsMs: NOW, ...over });
const ctx = (over: Partial<CellContext> = {}): CellContext => ({ windowIds: new Set(["BTC-USDT"]), pressure: new Map(), performance: new Map(), nowMs: NOW, ...over });
const pressureRead = (valor: number, over: Partial<Extract<PressureRead, { ok: true }>["pressure"] & object> = {}): PressureRead => ({
  ok: true, atMs: NOW - 5000, rejected: 0, pressure: { valor, compra: 30, venda: 10, negocios: 12, janelaMs: 45_000, ...over },
});

describe("the exchange's own values", () => {
  test("rank, price, change and volume as the desk formats them", () => {
    const c = cellsFor(row(), ctx());
    expect(c.rank).toMatchObject({ text: "2" });
    expect(c.preco).toMatchObject({ text: "80.000" });
    expect(c.var24h).toMatchObject({ text: "+5,26%", tone: "up" });
    expect(c.vol).toMatchObject({ text: "900 mi" });
    expect(c.mercado).toMatchObject({ text: "Spot" });
    expect(c.ativo).toMatchObject({ text: "BTC" });
  });

  test("a fall is down, a flat day carries no colour, and a tiny price keeps its digits", () => {
    expect(cellsFor(row({ var24hPct: -3.846 }), ctx()).var24h).toMatchObject({ text: "-3,85%", tone: "down" });
    expect(cellsFor(row({ var24hPct: 0 }), ctx()).var24h.tone).toBe("none");
    expect(cellsFor(row({ preco: 0.00001 }), ctx()).preco.text).toBe("0,00001000");
  });

  test("an unknown value is a dash with the reason, never zero", () => {
    const c = cellsFor(row({ var24hPct: null, volUsd24h: null, rank: null, preco: null }), ctx());
    expect(c.var24h).toMatchObject({ text: "-", title: "A OKX nao informou a abertura de 24 horas" });
    expect(c.vol).toMatchObject({ text: "-", title: "A OKX nao informou o volume" });
    expect(c.rank).toMatchObject({ text: "-", title: "Sem volume conhecido, sem posicao" });
    expect(c.preco).toMatchObject({ text: "-" });
  });

  test("a perpetual's volume is marked approximate and says how it was made", () => {
    const c = cellsFor(row({ id: "BTC-USDT-SWAP", mercado: "perp", volAprox: true, volUsd24h: 1_600_000_000 }), ctx());
    expect(c.vol.text).toBe("~1,6 bi");
    expect(c.vol.title).toBe("Aproximado: contratos vezes o tamanho do contrato vezes o ultimo preco");
    expect(c.mercado.text).toBe("Perpetuo");
  });
});

describe("the pressure of the flow", () => {
  const withRead = (read: PressureRead | "lendo", over: Partial<CellContext> = {}) => ctx({ pressure: new Map([["BTC-USDT", read]]), ...over });

  test("the measured value with its sign and a word that describes it", () => {
    expect(cellsFor(row(), withRead(pressureRead(0.5))).pressao).toMatchObject({ text: "+0,50 Pressao compradora forte", tone: "up" });
    expect(cellsFor(row(), withRead(pressureRead(-0.2))).pressao).toMatchObject({ text: "-0,20 Pressao vendedora", tone: "down" });
    expect(cellsFor(row(), withRead(pressureRead(0.03))).pressao).toMatchObject({ text: "+0,03 Equilibrada", tone: "none" });
  });

  test("the title says how it was measured and how old it is", () => {
    const title = cellsFor(row(), withRead(pressureRead(0.5))).pressao.title!;
    expect(title).toContain("12 negocios");
    expect(title).toContain("45 s");
    expect(title).toContain("ha 5 s");
  });

  test("a measure older than three minutes is marked old instead of being passed off as current", () => {
    const old: PressureRead = { ...(pressureRead(0.5) as Extract<PressureRead, { ok: true }>), atMs: NOW - 200_000 };
    const cell = cellsFor(row(), withRead(old)).pressao;
    expect(cell.text).toBe("+0,50 Pressao compradora forte");
    expect(cell.stale).toBe(true);
    expect(cell.title).toContain("dado velho");
    expect(cellsFor(row(), withRead(pressureRead(0.5))).pressao.stale).toBe(false);
  });

  test("a few trades are said to be few, and the value is still shown", () => {
    const cell = cellsFor(row(), withRead(pressureRead(1, { negocios: 3 }))).pressao;
    expect(cell.text).toBe("+1,00 Poucos negocios");
  });

  test("outside the calculation window, being read, nothing traded, or failed: a dash with the reason", () => {
    expect(cellsFor(row(), ctx({ windowIds: new Set() })).pressao).toMatchObject({ text: "-", title: "Fora da janela de calculo" });
    expect(cellsFor(row(), withRead("lendo")).pressao).toMatchObject({ text: "lendo", title: "Lendo os negocios do ultimo minuto" });
    expect(cellsFor(row(), withRead({ ok: true, pressure: null, atMs: NOW, rejected: 0 })).pressao).toMatchObject({ text: "-", title: "Sem negocios no ultimo minuto" });
    expect(cellsFor(row(), withRead({ ok: false, reason: "sem_conexao" })).pressao).toMatchObject({ text: "-", title: "Sem conexao com a OKX" });
    expect(cellsFor(row(), withRead({ ok: false, reason: "okx_recusou" })).pressao.title).toBe("A OKX recusou a leitura");
  });

  test("the window and the number of trades have their own columns", () => {
    const c = cellsFor(row(), withRead(pressureRead(0.5)));
    expect(c.janela.text).toBe("45 s");
    expect(c.negocios.text).toBe("12");
    const none = cellsFor(row(), ctx());
    expect(none.janela.text).toBe("-");
    expect(none.negocios.text).toBe("-");
  });
});

describe("the change of the hour and of four hours", () => {
  const withPerf = (read: PerformanceRead | "lendo", over: Partial<CellContext> = {}) => ctx({ performance: new Map([["BTC-USDT", read]]), ...over });

  test("signed and coloured when read", () => {
    const c = cellsFor(row(), withPerf({ ok: true, atMs: NOW, var1h: 1.234, var4h: -2.5 }));
    expect(c.var1h).toMatchObject({ text: "+1,23%", tone: "up" });
    expect(c.var4h).toMatchObject({ text: "-2,50%", tone: "down" });
  });

  test("a window the candles did not cover is a dash that says so", () => {
    const c = cellsFor(row(), withPerf({ ok: true, atMs: NOW, var1h: 1, var4h: null }));
    expect(c.var4h).toMatchObject({ text: "-", title: "Velas insuficientes para esta janela" });
  });

  test("outside the window, being read or failed", () => {
    expect(cellsFor(row(), ctx({ windowIds: new Set() })).var1h.title).toBe("Fora da janela de calculo");
    expect(cellsFor(row(), withPerf("lendo")).var1h.text).toBe("lendo");
    expect(cellsFor(row(), withPerf({ ok: false, reason: "falhou" })).var1h.title).toBe("A OKX nao devolveu as velas");
  });
});

describe("rules of the interface", () => {
  test("every text is plain ASCII with no middle dot, dash or accent, and no word of an order", () => {
    const reads = [pressureRead(0.5), pressureRead(-0.5), pressureRead(0), "lendo" as const, { ok: false as const, reason: "sem_conexao" as const }];
    for (const read of reads) {
      const cells = cellsFor(row({ volAprox: true, mercado: "perp" }), ctx({ pressure: new Map([["BTC-USDT", read]]) }));
      for (const cell of Object.values(cells)) {
        for (const text of [cell.text, cell.title ?? ""]) {
          expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
          for (const word of ["comprar", "compre", "vender", "venda", "buy", "sell", "hold", "action", "signal", "recommend", "vote", "side", "sinal"]) expect(new RegExp(`\\b${word}\\b`, "i").test(text)).toBe(false);
        }
      }
    }
  });
});
