import { describe, expect, test } from "bun:test";
import { aucStat, skillStat, summarize, verdictOf, walkForwardRun, type Pred } from "./evaluate.ts";
import { createRng } from "./rng.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 17, 12);

/** Previsões sintéticas: 24 tokens, `n` linhas; `edge` = quanto a probabilidade acompanha o desfecho. */
function preds(n: number, edge: number, seed: number, baseRate = 0.4): Pred[] {
  const rng = createRng(seed);
  const out: Pred[] = [];
  for (let i = 0; i < n; i += 1) {
    const y: 0 | 1 = rng() < baseRate ? 1 : 0;
    const p = Math.min(0.95, Math.max(0.05, baseRate + edge * (y === 1 ? 1 : -1) * (0.5 + 0.5 * rng()) + 0.05 * (rng() - 0.5)));
    out.push({ token: `T${i % 24}`, block: String(Math.floor(i / 20)), fold: 1, atMs: T0 + i * MIN, p, pBase: baseRate, y });
  }
  return out;
}

const OPTIONS = { seed: 7, resamples: 300, comparisons: 4 };

describe("métricas de previsões empilhadas", () => {
  test("AUC e Brier skill coerentes com a construção", () => {
    const p = preds(600, 0.25, 1);
    expect(aucStat(p) as number).toBeGreaterThan(0.85);
    expect(skillStat(p) as number).toBeGreaterThan(0.3);
    const none = preds(600, 0, 2);
    expect(Math.abs((aucStat(none) as number) - 0.5)).toBeLessThan(0.08);
    expect(aucStat([])).toBeNull();
    expect(skillStat([])).toBeNull();
  });

  test("referência constante com Brier zero: skill indefinido (null)", () => {
    const rows: Pred[] = [{ token: "A", block: "0", fold: 1, atMs: T0, p: 0.5, pBase: 1, y: 1 }];
    expect(skillStat(rows)).toBeNull();
  });
});

describe("veredito", () => {
  test("sinal real com bastante dado é demonstrado", () => {
    const s = summarize(preds(900, 0.25, 3), 0, OPTIONS);
    expect(s.n).toBe(900);
    expect(s.tokens).toBe(24);
    expect(verdictOf(s)).toBe("sinal_demonstrado");
    expect(s.auc.conservativeAdjusted?.[0]).toBeGreaterThan(0.5);
  });

  test("ruído puro não é demonstrado, em várias sementes", () => {
    for (const seed of [11, 12, 13, 14]) {
      const v = verdictOf(summarize(preds(500, 0, seed), 0, OPTIONS));
      expect(v).not.toBe("sinal_demonstrado");
    }
  });

  test("modelo confiante e errado é pior que a taxa-base; amostra pequena é inconclusiva", () => {
    const wrong = preds(600, -0.3, 5);
    expect(verdictOf(summarize(wrong, 0, OPTIONS))).toBe("pior_que_a_taxa_base");
    expect(verdictOf(summarize(preds(40, 0.25, 6), 0, OPTIONS))).toBe("inconclusivo");
    expect(verdictOf(summarize([], 0, OPTIONS))).toBe("inconclusivo");
  });

  test("poucos tokens: sem intervalo, logo inconclusivo e com o motivo", () => {
    const few = preds(300, 0.25, 8).map((r) => ({ ...r, token: `T${r.atMs % 2}`, block: "0" }));
    const s = summarize(few, 0, OPTIONS);
    expect(s.auc.conservativeAdjusted).toBeNull();
    expect(s.auc.reason).toContain("poucos_agrupamentos");
    expect(verdictOf(s)).toBe("inconclusivo");
  });

  test("o intervalo corrigido é mais largo que o de 95%", () => {
    const s = summarize(preds(500, 0.1, 9), 0, { ...OPTIONS, comparisons: 20 });
    const wide = s.auc.conservativeAdjusted as [number, number];
    const narrow = s.auc.conservative as [number, number];
    expect(wide[0]).toBeLessThanOrEqual(narrow[0]);
    expect(wide[1]).toBeGreaterThanOrEqual(narrow[1]);
  });
});

describe("walk-forward", () => {
  const n = 400;
  const input = {
    times: Array.from({ length: n }, (_, i) => T0 + i * MIN),
    y: Array.from({ length: n }, (_, i) => ((i * 7) % 10 < 4 ? 1 : 0) as 0 | 1),
    tokens: Array.from({ length: n }, (_, i) => `T${i % 10}`),
    horizonMs: 15 * MIN,
    folds: 4,
    minTrain: 30,
    minTest: 30,
    blockMs: 30 * MIN,
  };

  test("a referência de cada dobra é a taxa-base do treino e o treino nunca invade o teste", () => {
    const seen: Array<{ trainEnd: number; testStart: number; rate: number }> = [];
    const run = walkForwardRun(input, (train, test) => {
      const rate = train.reduce((s, i) => s + (input.y[i] as number), 0) / train.length;
      seen.push({ trainEnd: Math.max(...train.map((i) => input.times[i] as number)), testStart: Math.min(...test.map((i) => input.times[i] as number)), rate });
      return test.map(() => rate);
    });
    expect(run.folds).toHaveLength(4);
    for (const s of seen) expect(s.trainEnd + input.horizonMs).toBeLessThanOrEqual(s.testStart);
    for (const p of run.preds) expect(p.pBase).toBeCloseTo(seen[p.fold - 1]!.rate, 12);
    expect(run.preds).toHaveLength(run.folds.reduce((s, f) => s + f.test, 0));
  });

  test("previsão null abstém, ajuste que falha abstém a dobra inteira, e tudo é contado", () => {
    let call = 0;
    const run = walkForwardRun(input, (train, test) => {
      call += 1;
      if (call === 2) return null;
      return test.map((_, k) => (k % 2 === 0 ? null : 0.4));
    });
    const tested = run.folds.reduce((s, f) => s + f.test, 0);
    expect(run.preds.length + run.abstained).toBe(tested);
    expect(run.folds.filter((f) => !f.fitted)).toHaveLength(1);
    expect(run.abstained).toBeGreaterThan(0);
  });

  test("dobras puladas por purga são devolvidas", () => {
    const run = walkForwardRun({ ...input, horizonMs: 10 * 24 * 60 * MIN }, () => []);
    expect(run.folds).toHaveLength(0);
    expect(run.skipped.length).toBe(4);
  });

  test("probabilidades fora de [0,1] são limitadas e não finitas viram abstenção", () => {
    const run = walkForwardRun(input, (_train, test) => test.map((_, k) => (k === 0 ? 1.7 : k === 1 ? Number.NaN : -0.2)));
    expect(run.preds.every((p) => p.p >= 0 && p.p <= 1)).toBe(true);
    expect(run.abstained).toBeGreaterThan(0);
  });
});
