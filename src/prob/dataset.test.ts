import { describe, expect, test } from "bun:test";
import {
  anonId,
  briefRowsFrom,
  buildLaterBriefIndex,
  buildPricePath,
  buildScoreboardIndex,
  closingRowsFrom,
  coverageOf,
  dataAgeMs,
  labelBriefRows,
  labelRow,
  nearestPoint,
  parseJsonl,
  scoreRowsFrom,
  tokenKeyOf,
  upLabel,
  type LabelContext,
  type Row,
} from "./dataset.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 17, 12);
const ADDR = "TokenAddressForTestsOnly1111111111111111111111";

const brief = (cycleId: string, atMs: number, item: Row, verdict: Record<string, number>, extra: Row = {}): Row => ({
  cycleId,
  atMs,
  candidates: [
    { id: "hold:token:501:native@agente", kind: "holding", stances: ["hold"] },
    { id: `buy:token:501:${ADDR}`, kind: "buy", stances: ["skip", "buy_tenth", "buy_third", "buy_two_thirds", "buy_full"] },
  ],
  brief: { compras: { [`buy:token:501:${ADDR}`]: item } },
  verdicts: { [`buy:token:501:${ADDR}`]: verdict },
  requested: { [`buy:token:501:${ADDR}`]: "skip" },
  facets: { [`buy:token:501:${ADDR}`]: { late_entry: 0.2, fading: 0.6 } },
  contexto: { btc_1h: 0.3 },
  ...extra,
});

describe("identificadores", () => {
  test("tokenKeyOf extrai cadeia e endereço e ignora o sufixo da carteira", () => {
    expect(tokenKeyOf("buy:token:501:ABC")).toBe("501:ABC");
    expect(tokenKeyOf("hold:token:501:ABC@agente")).toBe("501:ABC");
    expect(tokenKeyOf("buy:token:1:0xAA:BB")).toBe("1:0xAA:BB");
    expect(tokenKeyOf("estranho")).toBeNull();
    expect(tokenKeyOf("buy:pool:501:ABC")).toBeNull();
  });

  test("anonId é estável, depende do sal e não contém o texto original", () => {
    expect(anonId("T", "501:ABC")).toBe(anonId("T", "501:ABC"));
    expect(anonId("T", "501:ABC")).not.toBe(anonId("T", "501:ABD"));
    expect(anonId("T", "501:ABC", "outro")).not.toBe(anonId("T", "501:ABC"));
    expect(anonId("T", "501:ABC")).toMatch(/^T[0-9a-f]{6}$/);
  });

  test("parseJsonl ignora linhas vazias e conta as malformadas", () => {
    const { rows, malformed } = parseJsonl('{"a":1}\n\nnão é json\n[1,2]\n{"b":2}\n');
    expect(rows).toEqual([{ a: 1 }, { b: 2 }]);
    expect(malformed).toBe(2);
  });
});

describe("linhas do brief", () => {
  test("pBuy é a soma das opções buy_*, com margem e sinalização de fechamento pelo código", () => {
    const rows = briefRowsFrom([brief("c1", T0, { mo: { r15: 1 } }, { skip: 0.4, buy_tenth: 0.45, buy_third: 0.1, buy_two_thirds: 0.05, buy_full: 0 })]);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.tokenKey).toBe(`501:${ADDR}`);
    expect(r.pBuy).toBeCloseTo(0.6, 12);
    expect(r.pSkip).toBe(0.4);
    expect(r.pBuyTenth).toBe(0.45);
    expect(r.verdictSum).toBeCloseTo(1, 12);
    expect(r.topMargin).toBeCloseTo(0.05, 12);
    expect(r.codeClosed).toBe(false);
    expect(r.facets).toEqual({ late_entry: 0.2, fading: 0.6 });
    const closed = briefRowsFrom([brief("c2", T0, {}, { skip: 1 }, { candidates: [{ id: `buy:token:501:${ADDR}`, kind: "buy", stances: ["skip"] }] })]);
    expect(closed[0]?.codeClosed).toBe(true);
  });

  test("candidato sem item no brief, sem formato válido ou sem verdict não quebra e não inventa probabilidade", () => {
    const noItem = brief("c3", T0, {}, { skip: 1 }, { brief: { compras: {} } });
    expect(briefRowsFrom([noItem])).toHaveLength(0);
    const noVerdict = briefRowsFrom([brief("c4", T0, { a: 1 }, {}, { verdicts: {} })]);
    expect(noVerdict[0]?.pBuy).toBeNull();
    expect(noVerdict[0]?.topMargin).toBeNull();
    expect(briefRowsFrom([{ cycleId: "x" }, { atMs: 1 }])).toEqual([]);
  });
});

describe("caminho de preço e ponto mais próximo", () => {
  const scoreboard: Row[] = [
    { kind: "decision", key: "c1:buy:token:501:A|inacao", cycleId: "c1", candidateId: "buy:token:501:A", chainIndex: "501", address: "A", atMs: T0, entryPriceUsd: 1, stance: "skip", usd: 10 },
    { kind: "settlement", key: "c1:buy:token:501:A|inacao", window: "15m", priceUsd: 1.01, settledAtMs: T0 + 16 * MIN },
    { kind: "settlement", key: "c1:buy:token:501:A|inacao", window: "1h", priceUsd: null, settledAtMs: T0 + 61 * MIN, reason: "sem_preco" },
  ];
  const equity: Row[] = [{ atMs: T0 + 30 * MIN, holdings: [{ id: "501:A", priceUsd: 1.5 }, { id: "501:native", priceUsd: 100 }] }];

  test("junta entradas, liquidações com preço e carteira, ordenados; liquidação sem preço fica de fora", () => {
    const path = buildPricePath(scoreboard, equity);
    const a = path.get("501:A")!;
    expect(a.map((p) => [p.src, p.price])).toEqual([["entrada", 1], ["liquidacao", 1.01], ["patrimonio", 1.5]]);
    expect(a[1]!.atMs).toBe(T0 + 15 * MIN);
    expect(path.has("501:native")).toBe(true);
  });

  test("nearestPoint respeita a tolerância e exclui os pontos da própria decisão", () => {
    const a = buildPricePath(scoreboard, equity).get("501:A")!;
    expect(nearestPoint(a, T0 + 14 * MIN, 2 * MIN)?.price).toBe(1.01);
    expect(nearestPoint(a, T0 + 10 * MIN, 2 * MIN)).toBeNull();
    expect(nearestPoint(a, T0 + 1 * MIN, 2 * MIN, new Set(["c1:buy:token:501:A|inacao"]))).toBeNull();
    expect(nearestPoint(undefined, T0, MIN)).toBeNull();
  });
});

describe("rótulos por fonte", () => {
  const key = `buy:token:501:${ADDR}`;
  const scoreboard: Row[] = [
    { kind: "decision", key: `c1:${key}|inacao`, cycleId: "c1", candidateId: key, chainIndex: "501", address: ADDR, atMs: T0, entryPriceUsd: 1, stance: "skip", usd: 10, inaction: true },
    { kind: "settlement", key: `c1:${key}|inacao`, window: "15m", priceUsd: 1.01, settledAtMs: T0 + 16 * MIN },
  ];
  const ctxFor = (extraScoreboard: Row[] = [], laterRows: ReturnType<typeof briefRowsFrom> = []): LabelContext => ({
    scoreboard: buildScoreboardIndex([...scoreboard, ...extraScoreboard]),
    path: buildPricePath([...scoreboard, ...extraScoreboard], []),
    later: buildLaterBriefIndex(laterRows),
  });
  const query = { cycleId: "c1", candidateId: key, tokenKey: `501:${ADDR}`, atMs: T0, agMin: 5 };

  test("rótulo exato do placar pela chave do ciclo e candidato (inclusive com sufixo de inação)", () => {
    const l = labelRow(query, ctxFor())["15m"];
    expect(l.source).toBe("scoreboard_exato");
    expect(l.retBps).toBeCloseTo(100, 6);
    expect(labelRow(query, ctxFor())["1h"].source).toBeNull();
  });

  test("caminho de preço de outras decisões do mesmo token, sem reaproveitar os pontos da própria decisão", () => {
    const others: Row[] = [
      { kind: "decision", key: "c9:other|inacao", cycleId: "c9", candidateId: key, chainIndex: "501", address: ADDR, atMs: T0 + 30 * MIN, entryPriceUsd: 1.3, stance: "skip", usd: 10 },
      { kind: "decision", key: "c8:other|inacao", cycleId: "c8", candidateId: key, chainIndex: "501", address: ADDR, atMs: T0 + 1 * MIN, entryPriceUsd: 1.2, stance: "skip", usd: 10 },
      { kind: "decision", key: "c7:other|inacao", cycleId: "c7", candidateId: key, chainIndex: "501", address: ADDR, atMs: T0 + 61 * MIN, entryPriceUsd: 1.44, stance: "skip", usd: 10 },
    ];
    const l = labelRow(query, ctxFor(others));
    // 1 h: preço perto de t (1,2) e perto de t + 1 h (1,44): +2000 bps; a decisão própria não conta
    expect(l["1h"].bySource.caminho_de_preco).toBeCloseTo(2000, 6);
    expect(l["1h"].source).toBe("caminho_de_preco");
    // 15 min: o exato continua tendo prioridade, e o caminho de preço aparece como fonte disponível para comparação
    expect(l["15m"].source).toBe("scoreboard_exato");
  });

  test("brief posterior alinhado pelo fim da janela e pela idade do fechamento da última barra", () => {
    const alone = (rows: ReturnType<typeof briefRowsFrom>): LabelContext => ({ scoreboard: buildScoreboardIndex([]), path: new Map(), later: buildLaterBriefIndex(rows) });
    // barra começou há 5 min (recém-fechada): o dado é do instante do brief; 15 min depois de T0 casa com 15 min
    const fresh = briefRowsFrom([brief("c5", T0 + 15 * MIN, { mo: { r15: 1.5, r1: 3, ag: 5 } }, { skip: 1 })]);
    const l = labelRow({ ...query, cycleId: "cX" }, alone(fresh));
    expect(l["15m"].source).toBe("brief_posterior");
    expect(l["15m"].retBps).toBeCloseTo(150, 6);
    // 1 h não casa (o brief posterior está a 15 min)
    expect(l["1h"].source).toBeNull();
    // barra começou há 8 min: o fechamento dela tem 3 min de idade, então um brief 18 min depois termina em T0 + 15 min
    const aged = briefRowsFrom([brief("c6", T0 + 18 * MIN, { mo: { r15: 2, ag: 8 } }, { skip: 1 })]);
    expect(labelRow({ ...query, cycleId: "cX" }, alone(aged))["15m"].retBps).toBeCloseTo(200, 6);
    // brief posterior desalinhado (40 min depois) não é usado para 15 min
    const far = briefRowsFrom([brief("c7", T0 + 40 * MIN, { mo: { r15: 9, ag: 5 } }, { skip: 1 })]);
    expect(labelRow({ ...query, cycleId: "cX" }, alone(far))["15m"].source).toBeNull();
    // o brief da própria linha (mesmo instante) nunca serve de rótulo dela
    const same = briefRowsFrom([brief("c0", T0, { mo: { r15: 7, ag: 5 } }, { skip: 1 })]);
    expect(labelRow({ ...query, cycleId: "cX" }, alone(same))["15m"].source).toBeNull();
    expect(dataAgeMs(5)).toBe(0);
    expect(dataAgeMs(8)).toBe(3 * MIN);
    expect(dataAgeMs(2)).toBe(0);
  });

  test("no horizonte de 4 h o brief posterior é medido mas nunca escolhido como rótulo", () => {
    const later = briefRowsFrom([brief("c8", T0 + 240 * MIN, { mo: { ag: 5 }, tm: { r4: 6 } }, { skip: 1 })]);
    const ctx: LabelContext = { scoreboard: buildScoreboardIndex([]), path: new Map(), later: buildLaterBriefIndex(later) };
    const l = labelRow({ ...query, cycleId: "cX" }, ctx)["4h"];
    expect(l.bySource.brief_posterior).toBeCloseTo(600, 6);
    expect(l.source).toBeNull();
    expect(l.retBps).toBeNull();
  });

  test("labelBriefRows e coverageOf contam fontes e tokens", () => {
    const rows = briefRowsFrom([brief("c1", T0, { mo: { r15: 0.5, ag: 5 } }, { skip: 0.9, buy_tenth: 0.1 }), brief("c5", T0 + 15 * MIN, { mo: { r15: 1.5, r1: 3, ag: 5 } }, { skip: 1 })]);
    const labeled = labelBriefRows(rows, scoreboard, []);
    const cov = coverageOf(labeled.map((l) => ({ tokenKey: l.row.tokenKey, labels: l.labels })), "15m");
    expect(cov.rows).toBe(2);
    expect(cov.labeled).toBe(1);
    expect(cov.bySource.scoreboard_exato).toBe(1);
    expect(cov.availableBySource.brief_posterior).toBeGreaterThanOrEqual(1);
    expect(cov.share).toBe(0.5);
    expect(cov.tokens).toBe(1);
    expect(coverageOf([], "1h").share).toBeNull();
  });

  test("upLabel", () => {
    expect(upLabel(30, 30)).toBe(1);
    expect(upLabel(29.9, 30)).toBe(0);
    expect(upLabel(null, 30)).toBeNull();
    expect(upLabel(Number.NaN, 0)).toBeNull();
  });
});

describe("linhas do placar e dos fechamentos", () => {
  test("retorno exato por horizonte, liquidação sem preço marcada, não-compras e fechados pelo código", () => {
    const key = `buy:token:501:${ADDR}`;
    const rows: Row[] = [
      { kind: "decision", key: `c1:${key}|inacao`, cycleId: "c1", candidateId: key, chainIndex: "501", address: ADDR, atMs: T0, entryPriceUsd: 2, stance: "skip", usd: 10, inaction: true, triggers: ["fechada_pelo_codigo"], families: ["fluxo"], posture: "neutra", facets: { fading: 0.5 } },
      { kind: "settlement", key: `c1:${key}|inacao`, window: "1h", priceUsd: 2.02, settledAtMs: T0 + 61 * MIN },
      { kind: "settlement", key: `c1:${key}|inacao`, window: "15m", priceUsd: null, settledAtMs: T0 + 16 * MIN, reason: "sem_preco" },
      { kind: "decision", key: "c2:hold:token:501:X@agente", cycleId: "c2", candidateId: "hold:token:501:X@agente", chainIndex: "501", address: "X", atMs: T0, entryPriceUsd: 1, stance: "hold", usd: 5 },
    ];
    const out = scoreRowsFrom(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.retBps["1h"]).toBeCloseTo(100, 6);
    expect(out[0]?.retBps["15m"]).toBeNull();
    expect(out[0]?.settledWithoutPrice["15m"]).toBe(true);
    expect(out[0]?.settledWithoutPrice["4h"]).toBe(false);
    expect(out[0]?.codeClosed).toBe(true);
    expect(out[0]?.facets).toEqual({ fading: 0.5 });
  });

  test("fechamento: tempos da cotação e do modelo, gasto e custo de entrada", () => {
    const key = `buy:token:501:${ADDR}`;
    const rows = closingRowsFrom([
      { cycleId: "c1", candidateId: key, atMs: T0, first: { pBuy: 0.5 }, quote: { startedAtMs: T0 + 1, receivedAtMs: T0 + 1001 }, brief: { sua: { f: { fading: 40 } }, cot: { entra: 0.3, imp: -0.2 }, cand: { s: "X" } }, answer: { buy: 0.2, skip: 0.8 }, would: "skip", wouldReason: "resposta_do_jev", askedAtMs: T0 + 1010, answeredAtMs: T0 + 1300 },
      { cycleId: "c2", candidateId: key, atMs: T0 + 5 * MIN, first: { pBuy: 0.4 }, quote: null, answer: null, would: null, wouldReason: "reserva_para_primarias" },
      { cycleId: "c3", candidateId: "formato-invalido", atMs: T0 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.quoteMs).toBe(1000);
    expect(rows[0]?.modelMs).toBe(290);
    expect(rows[0]?.spentMs).toBe(1300);
    expect(rows[0]?.entryCostPct).toBe(0.3);
    expect(rows[0]?.facets).toEqual({ fading: 0.4 });
    expect(rows[1]?.spentMs).toBe(0);
    expect(rows[1]?.quoted).toBe(false);
    expect(rows[1]?.secondBuy).toBeNull();
  });
});
