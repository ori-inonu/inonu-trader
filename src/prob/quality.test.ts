import { describe, expect, test } from "bun:test";
import { briefRowsFrom, buildPricePath, type BriefItemRow, type Row } from "./dataset.ts";
import { auditBriefFields, auditField, auditListFields, auditMeta, auditPriceConsistency, auditScoreboard, auditVerdicts, distOf, ksTwoSample, BRIEF_FIELDS, type FieldSpec } from "./quality.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 17, 12);

function row(token: string, atMs: number, item: Row): BriefItemRow {
  return { cycleId: `c${atMs}`, candidateId: `buy:token:501:${token}`, tokenKey: `501:${token}`, atMs, item, offered: [], requested: null, verdict: null, pBuy: null, pSkip: null, pBuyTenth: null, verdictSum: null, topMargin: null, facets: null, codeClosed: false, context: null };
}

const spec = (extra: Partial<FieldSpec> = {}): FieldSpec => ({ id: "r", unit: "0 a 5", min: 0, max: 5, integer: true, get: (r) => r.item.r, ...extra });

describe("auditoria de um campo", () => {
  test("separa ausente, nulo, zero, impossível e tipo inesperado", () => {
    const rows = [
      row("A", T0, { r: 2 }),
      row("A", T0 + 2 * MIN, { r: 0 }),
      row("A", T0 + 4 * MIN, { r: null }),
      row("A", T0 + 6 * MIN, {}),
      row("A", T0 + 8 * MIN, { r: 9 }),
      row("A", T0 + 10 * MIN, { r: 1.5 }),
      row("A", T0 + 12 * MIN, { r: "x" }),
    ];
    const a = auditField(rows, spec());
    expect(a.n).toBe(7);
    expect(a.absent).toBe(1);
    expect(a.nulls).toBe(1);
    expect(a.present).toBe(4);
    expect(a.nonNumeric).toBe(1);
    expect(a.zeros).toBe(1);
    expect(a.impossible).toBe(2);
    expect(a.flags).toContain("valor_impossivel");
    expect(a.flags).toContain("tipo_inesperado");
    expect(a.presentShare).toBeCloseTo(4 / 7, 12);
  });

  test("detecta campo constante e campo congelado entre consultas seguidas do mesmo token", () => {
    const frozen = Array.from({ length: 30 }, (_, i) => row("A", T0 + i * 2 * MIN, { r: 3 }));
    const a = auditField(frozen, spec());
    expect(a.constant).toBe(true);
    expect(a.flags).toContain("constante");
    expect(a.unchangedShare).toBe(1);
    expect(a.flags).toContain("congelado_entre_consultas");
    const moving = Array.from({ length: 30 }, (_, i) => row("A", T0 + i * 2 * MIN, { r: i % 5 }));
    const m = auditField(moving, spec());
    expect(m.constant).toBe(false);
    expect(m.unchangedShare).toBe(0);
    // consultas separadas por mais de 10 minutos não são "seguidas"
    const sparse = auditField([row("A", T0, { r: 1 }), row("A", T0 + 60 * MIN, { r: 1 })], spec());
    expect(sparse.unchangedPairs).toBe(0);
    expect(sparse.unchangedShare).toBeNull();
  });

  test("outliers por MAD e deriva entre a primeira e a segunda metade", () => {
    const values = Array.from({ length: 60 }, (_, i) => 10 + (i % 5));
    const rows = values.map((v, i) => row(`T${i % 6}`, T0 + i * 2 * MIN, { x: i === 30 ? 5000 : v }));
    const a = auditField(rows, { id: "x", unit: "u", get: (r) => r.item.x });
    expect(a.outliers).toBe(1);
    expect(a.max).toBe(5000);
    const shifted = Array.from({ length: 80 }, (_, i) => row(`T${i % 6}`, T0 + i * 2 * MIN, { x: (i < 40 ? 10 : 30) + (i % 7) }));
    const d = auditField(shifted, { id: "x", unit: "u", get: (r) => r.item.x });
    expect(d.drift?.flagged).toBe(true);
    expect(d.flags).toContain("deriva");
    const stable = Array.from({ length: 80 }, (_, i) => row(`T${i % 6}`, T0 + i * 2 * MIN, { x: 10 + ((i * 7) % 11) }));
    expect(auditField(stable, { id: "x", unit: "u", get: (r) => r.item.x }).drift?.flagged).toBe(false);
  });

  test("a legenda do brief dá faixas para os campos conhecidos e a auditoria cobre todos", () => {
    const rows = [row("A", T0, { r: 1, tm: { rsi: 120 }, l: -5, c: -150 })];
    const out = auditBriefFields(rows);
    expect(out).toHaveLength(BRIEF_FIELDS.length);
    const rsi = out.find((f) => f.id === "tm.rsi")!;
    expect(rsi.impossible).toBe(1);
    expect(out.find((f) => f.id === "l")!.impossible).toBe(1);
    expect(out.find((f) => f.id === "c")!.impossible).toBe(1);
    expect(out.find((f) => f.id === "mo.r5")!.absent).toBe(1);
    expect(out.find((f) => f.id === "mo.r5")!.flags).toContain("mais_da_metade_ausente");
  });

  test("campos de lista", () => {
    const out = auditListFields([row("A", T0, { m: [], f: ["a", "b"], o: ["skip"], pf: ["alvo_2"] }), row("A", T0 + MIN, { m: ["x"], f: ["a"], o: ["skip"] })]);
    const m = out.find((f) => f.id === "m")!;
    expect(m.empty).toBe(1);
    expect(m.distinctCodes).toBe(1);
    expect(out.find((f) => f.id === "pf")!.absent).toBe(1);
  });
});

describe("Kolmogorov-Smirnov", () => {
  test("amostras iguais dão D pequeno, deslocadas dão D grande, muito pequenas dão null", () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    expect(ksTwoSample(a, a)?.d).toBe(0);
    const far = ksTwoSample(a, a.map((v) => v + 100))!;
    expect(far.d).toBe(1);
    expect(far.critical).toBeGreaterThan(0);
    expect(ksTwoSample([1, 2], [3, 4])).toBeNull();
  });
});

describe("probabilidades do Jev", () => {
  const mk = (verdict: Record<string, number> | null): BriefItemRow => {
    const base = row("A", T0, {});
    if (verdict === null) return base;
    const sum = Object.values(verdict).reduce((s, v) => s + v, 0);
    const pBuy = Object.entries(verdict).filter(([k]) => k.startsWith("buy_")).reduce((s, [, v]) => s + v, 0);
    return { ...base, verdict, pBuy, pBuyTenth: verdict.buy_tenth ?? null, verdictSum: sum };
  };

  test("soma fora de 1, grade de centésimos, empates e diferença entre pBuy e buy_tenth", () => {
    const rows = [mk({ skip: 0.4, buy_tenth: 0.5, buy_third: 0.1 }), mk({ skip: 0.4, buy_tenth: 0.5, buy_third: 0.1 }), mk({ skip: 0.9, buy_tenth: 0.05 }), mk(null)];
    const a = auditVerdicts(rows);
    expect(a.rows).toBe(4);
    expect(a.withoutVerdict).toBe(1);
    expect(a.sumOff).toBe(1);
    expect(a.onHundredthsGrid).toBe(true);
    expect(a.pBuyDistinct).toBe(2);
    expect(a.pBuyTieShare).toBeCloseTo(2 / 3, 12);
    expect(a.buyTenthDiffersFromSum).toBeCloseTo(2 / 3, 12);
    const fine = auditVerdicts([mk({ skip: 0.4123, buy_tenth: 0.5877 })]);
    expect(fine.onHundredthsGrid).toBe(false);
  });
});

describe("alinhamento de tempo, vazamento e placar", () => {
  test("auditMeta conta fato posterior à pergunta, briefs sem meta e latências", () => {
    const briefs: Row[] = [{ cycleId: "a", atMs: T0 }, { cycleId: "b", atMs: T0 + MIN }, { cycleId: "c", atMs: T0 + 2 * MIN }];
    const meta: Row[] = [
      { cycleId: "a", metadata: { askedAtMs: T0 + 9000, answeredAtMs: T0 + 9400, factAvailableAtMs: T0 + 8990 } },
      { cycleId: "b", metadata: { askedAtMs: T0 + MIN + 9000, answeredAtMs: T0 + MIN + 9300, factAvailableAtMs: T0 + MIN + 9500 } },
      { cycleId: "b", metadata: { askedAtMs: T0 + MIN + 9000 } },
      { cycleId: "z", metadata: {} },
    ];
    const a = auditMeta(meta, briefs);
    expect(a.factAfterAsk).toBe(1);
    expect(a.briefsWithoutMeta).toBe(1);
    expect(a.metaWithoutBrief).toBe(1);
    expect(a.duplicateCycles).toBe(1);
    expect(a.modelLatencyMs?.n).toBe(2);
    expect(a.cycleStartToAskMs?.p50).toBe(9000);
  });

  test("auditScoreboard: duplicadas, órfãs, liquidação antes do fim da janela, sem preço, extremos e instante do ciclo", () => {
    const d = (key: string, at: number, price: number | null, extra: Row = {}): Row => ({ kind: "decision", key, cycleId: `cy${key}`, atMs: at, stance: "skip", entryPriceUsd: price, candidateId: "buy:token:501:A", ...extra });
    const s = (key: string, window: string, settled: number, price: number | null): Row => ({ kind: "settlement", key, window, settledAtMs: settled, priceUsd: price });
    const board: Row[] = [
      d("k1", T0, 1, { inaction: true }),
      d("k1", T0, 1),
      d("k2", T0, null, { triggers: ["fechada_pelo_codigo"] }),
      s("k1", "15m", T0 + 16 * MIN, 1),
      s("k1", "1h", T0 + 30 * MIN, 120),
      s("k1", "4h", T0 + 5 * 60 * MIN, null),
      s("fantasma", "15m", T0, 1),
    ];
    const briefs: Row[] = [{ cycleId: "cyk1", atMs: T0 }];
    const a = auditScoreboard(board, briefs);
    expect(a.duplicateDecisionKeys).toBe(1);
    expect(a.orphanSettlements).toBe(1);
    expect(a.settledBeforeWindowEnd).toBe(1);
    expect(a.entryPriceMissing).toBe(1);
    expect(a.settledWithoutPrice["4h"]).toEqual({ n: 1, withoutPrice: 1, share: 1 });
    expect(a.extremeReturn1h.beyond5000bps).toBe(1);
    expect(a.zeroReturnShare["15m"]).toBe(1);
    expect(a.decisionTimeIsCycleStart).toBe(true);
    expect(a.codeClosedShare).toBeCloseTo(1 / 3, 12);
  });

  test("consistência de preço entre fontes e preço da carteira repetido", () => {
    const board: Row[] = [
      { kind: "decision", key: "k1", cycleId: "c1", atMs: T0, chainIndex: "501", address: "A", entryPriceUsd: 1 },
      { kind: "decision", key: "k2", cycleId: "c2", atMs: T0 + MIN, chainIndex: "501", address: "A", entryPriceUsd: 1.1 },
    ];
    const eq: Row[] = [
      { atMs: T0, holdings: [{ id: "501:B", priceUsd: 2 }] },
      { atMs: T0 + 4 * MIN, holdings: [{ id: "501:B", priceUsd: 2 }] },
      { atMs: T0 + 8 * MIN, holdings: [{ id: "501:B", priceUsd: 2.1 }] },
    ];
    const out = auditPriceConsistency(buildPricePath(board, eq));
    expect(out.pairs).toBeGreaterThanOrEqual(1);
    expect(out.absDiffBps?.max).toBeCloseTo(1000, 6);
    expect(out.equityPairs).toBe(2);
    expect(out.equityUnchangedShare).toBe(0.5);
  });

  test("distOf ignora não finitos e devolve null para vazio", () => {
    expect(distOf([])).toBeNull();
    expect(distOf([1, 2, 3, Number.NaN])?.n).toBe(3);
    expect(distOf([5])?.p50).toBe(5);
  });

  test("briefRowsFrom alimenta a auditoria do formato real sem quebrar", () => {
    const rows = briefRowsFrom([{ cycleId: "c", atMs: T0, candidates: [{ id: "buy:token:501:A", kind: "buy", stances: ["skip"] }], brief: { compras: { "buy:token:501:A": { r: 1 } } }, verdicts: { "buy:token:501:A": { skip: 1 } } }]);
    expect(auditBriefFields(rows)).toHaveLength(BRIEF_FIELDS.length);
  });
});
