import { describe, expect, test } from "bun:test";
import {
  createStageTimer,
  formatStageLine,
  percentile,
  recordStages,
  summarize,
  type Stage,
  type StageSample,
} from "./stage-timing.ts";

function relogio(inicio = 0) {
  let agora = inicio;
  return {
    now: () => agora,
    avanca: (ms: number) => {
      agora = ms;
    },
  };
}

describe("createStageTimer", () => {
  test("start e end medem a duração com relógio falso", () => {
    const clock = relogio(1000);
    const timer = createStageTimer({ now: clock.now });
    timer.start("livro");
    clock.avanca(1250);
    expect(timer.end("livro")).toBe(250);
    const snap = timer.snapshot();
    expect(snap.amostras).toEqual([{ etapa: "livro", ms: 250 }]);
    expect(snap.abertas).toEqual([]);
  });

  test("etapas aninhadas têm duração própria, na ordem de término", () => {
    const clock = relogio(0);
    const timer = createStageTimer({ now: clock.now });
    timer.start("modelo");
    clock.avanca(10);
    timer.start("ordem");
    clock.avanca(30);
    timer.end("ordem");
    clock.avanca(50);
    timer.end("modelo");
    expect(timer.snapshot().amostras).toEqual([
      { etapa: "ordem", ms: 20 },
      { etapa: "modelo", ms: 50 },
    ]);
  });

  test("etapa sem fim não gera amostra e aparece em abertas", () => {
    const clock = relogio(0);
    const timer = createStageTimer({ now: clock.now });
    timer.start("fatos");
    clock.avanca(500);
    const snap = timer.snapshot();
    expect(snap.amostras).toEqual([]);
    expect(snap.abertas).toEqual(["fatos"]);
  });

  test("end sem start não grava nada e devolve null", () => {
    const timer = createStageTimer({ now: relogio().now });
    expect(timer.end("momentum")).toBeNull();
    expect(timer.snapshot().amostras).toEqual([]);
  });

  test("duração negativa vira amostra nula e é contada no resumo", () => {
    const clock = relogio(500);
    const timer = createStageTimer({ now: clock.now });
    timer.start("ordem");
    clock.avanca(400);
    expect(timer.end("ordem")).toBeNull();
    expect(timer.snapshot().amostras).toEqual([{ etapa: "ordem", ms: null }]);
    const [resumo] = summarize(timer.snapshot().amostras);
    expect(resumo).toEqual({
      etapa: "ordem",
      n: 0,
      nulas: 1,
      p50: null,
      p95: null,
      p99: null,
      max: null,
    });
  });

  test("record com valor negativo ou não finito vira nulo e fica fora dos percentis", () => {
    const timer = createStageTimer({ now: relogio().now });
    timer.record("livro", 120);
    timer.record("livro", -5);
    timer.record("livro", Number.NaN);
    expect(timer.snapshot().amostras.map((a) => a.ms)).toEqual([120, null, null]);
    const [resumo] = summarize(timer.snapshot().amostras);
    expect(resumo).toEqual({
      etapa: "livro",
      n: 1,
      nulas: 2,
      p50: 120,
      p95: 120,
      p99: 120,
      max: 120,
    });
  });

  test("reinício de etapa aberta substitui o instante inicial", () => {
    const clock = relogio(0);
    const timer = createStageTimer({ now: clock.now });
    timer.start("livro");
    clock.avanca(100);
    timer.start("livro");
    clock.avanca(130);
    expect(timer.end("livro")).toBe(30);
    expect(timer.snapshot().amostras).toEqual([{ etapa: "livro", ms: 30 }]);
  });

  test("etapa desconhecida lança TypeError e nada é gravado", () => {
    const timer = createStageTimer({ now: relogio().now });
    expect(() => timer.start("desconhecida" as Stage)).toThrow(TypeError);
    expect(() => timer.record("desconhecida" as Stage, 5)).toThrow(TypeError);
    expect(timer.snapshot().amostras).toEqual([]);
  });
});

describe("percentile", () => {
  test("posto mais próximo com 21 valores", () => {
    const valores = Array.from({ length: 21 }, (_, i) => i + 1);
    expect(percentile(valores, 50)).toBe(11);
    expect(percentile(valores, 95)).toBe(20);
    expect(percentile(valores, 99)).toBe(21);
    expect(percentile(valores, 100)).toBe(21);
  });

  test("amostra de um valor e lista vazia", () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 99)).toBe(7);
    expect(percentile([], 50)).toBeNull();
    expect(() => percentile([1, 2], 0)).toThrow(RangeError);
  });
});

describe("summarize", () => {
  test("segue a ordem de STAGES e não inventa etapas", () => {
    const amostras: StageSample[] = [
      { etapa: "ordem", ms: 5 },
      { etapa: "livro", ms: 3 },
      { etapa: "ordem", ms: 9 },
    ];
    const resumos = summarize(amostras);
    expect(resumos.map((r) => r.etapa)).toEqual(["livro", "ordem"]);
    const ordem = resumos[1];
    expect(ordem?.n).toBe(2);
    expect(ordem?.p50).toBe(5);
    expect(ordem?.max).toBe(9);
  });
});

describe("formatStageLine e recordStages", () => {
  test("formatStageLine gera chaves na ordem fixa e quebra de linha", () => {
    expect(
      formatStageLine({ ts: 1000, ciclo: "c1", etapa: "livro", ms: 250, consultou: true }),
    ).toBe('{"ts":1000,"ciclo":"c1","etapa":"livro","ms":250,"consultou":true}\n');
  });

  test("formatStageLine com ms nulo", () => {
    const linha = formatStageLine({
      ts: 2000,
      ciclo: "c2",
      etapa: "ordem",
      ms: null,
      consultou: false,
    });
    expect(linha).toContain('"ms":null');
    expect(linha.endsWith("\n")).toBe(true);
  });

  test("recordStages grava uma linha por amostra e conta falhas", () => {
    const timer = createStageTimer({ now: relogio().now });
    timer.record("livro", 1);
    timer.record("fatos", 2);
    timer.record("modelo", 3);
    const linhas: string[] = [];
    let chamada = 0;
    const resultado = recordStages({
      timer,
      ts: 9000,
      ciclo: "c9",
      consultou: true,
      append: (linha) => {
        chamada += 1;
        if (chamada === 2) throw new Error("disco cheio");
        linhas.push(linha);
      },
    });
    expect(resultado).toEqual({ gravadas: 2, falhas: 1 });
    expect(chamada).toBe(3);
    expect(linhas.length).toBe(2);
    for (const linha of linhas) {
      const obj = JSON.parse(linha) as Record<string, unknown>;
      expect(obj.ciclo).toBe("c9");
      expect(obj.consultou).toBe(true);
      expect(obj.ts).toBe(9000);
    }
  });
});
