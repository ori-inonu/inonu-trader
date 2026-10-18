import { describe, expect, test } from "bun:test";
import { briefRowsFrom, closingRowsFrom, labelBriefRows, scoreRowsFrom } from "./dataset.ts";
import { EXPERIMENT_SUITE_VERSION, runExperiments, type Case, type ExperimentRecord } from "./experiments.ts";
import { syntheticJournals } from "./fixtures.ts";

const SLOW = 120_000;

function run(signal: number, seed: number): ExperimentRecord[] {
  const j = syntheticJournals({ seed, tokens: 12, looks: 260, signal });
  const labeled = labelBriefRows(briefRowsFrom(j.briefs), j.scoreboard, j.equity);
  return runExperiments({ briefs: labeled, scoreRows: scoreRowsFrom(j.scoreboard), closings: closingRowsFrom(j.closings), seed: 99, resamples: 80 });
}

const casesOf = (records: ExperimentRecord[], id: string): Case[] => (records.find((r) => r.id.startsWith(id))?.resultado ?? []) as Case[];

describe("lista de experimentos", () => {
  const planted = run(1.5, 3);

  test("cada experimento declara hipótese, método, resultado, veredito e próxima hipótese, com a versão da suíte", () => {
    expect(planted.map((r) => r.id.split("-")[0])).toEqual(["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E08"]);
    for (const r of planted) {
      expect(r.versao).toBe(EXPERIMENT_SUITE_VERSION);
      expect(r.hipotese.length).toBeGreaterThan(30);
      expect(r.metodo.length).toBeGreaterThan(30);
      expect(r.proximaHipotese.length).toBeGreaterThan(30);
      expect(r.resultado).toBeDefined();
      expect(["sinal_demonstrado", "sinal_nao_demonstrado", "pior_que_a_taxa_base", "inconclusivo", "descritivo"]).toContain(r.veredito);
    }
  }, SLOW);

  test("um sinal plantado no estado observável é recuperado (E04 demonstrado a 15 min, com AUC e Brier skill positivos)", () => {
    const e04 = planted.find((r) => r.id.startsWith("E04"))!;
    expect(e04.veredito).toBe("sinal_demonstrado");
    const c = casesOf(planted, "E04").find((x) => x.horizonte === "15m" && x.limiarBps === 30 && x.parametros?.lambda === 20)!;
    expect(c.primario).toBe(true);
    expect((c.auc?.conservativeAdjusted ?? [0, 0])[0]).toBeGreaterThan(0.5);
    expect((c.brierSkill?.conservativeAdjusted ?? [0, 0])[0]).toBeGreaterThan(0);
    expect(c.dobras).toBeGreaterThanOrEqual(2);
  }, SLOW);

  test("o Jev sintético não tem sinal: nem o bruto nem o calibrado são demonstrados, mesmo com sinal no mercado", () => {
    expect(planted.find((r) => r.id.startsWith("E02"))!.veredito).not.toBe("sinal_demonstrado");
    expect(planted.find((r) => r.id.startsWith("E03"))!.veredito).not.toBe("sinal_demonstrado");
  }, SLOW);

  test("horizonte de 4 h sem dobras válidas depois da purga é inconclusivo, com o motivo das dobras puladas", () => {
    const four = casesOf(planted, "E02").filter((c) => c.horizonte === "4h");
    expect(four.length).toBeGreaterThan(0);
    for (const c of four) {
      if (c.n === 0) {
        expect(c.veredito).toBe("inconclusivo");
        expect(c.dobrasPuladas.length).toBeGreaterThan(0);
        expect(c.dobrasPuladas[0]?.motivo).toBe("treino_insuficiente");
      }
    }
  }, SLOW);

  test("a taxa-base entra como linha descritiva, sem AUC nem Brier skill", () => {
    const base = casesOf(planted, "E06").find((c) => c.modelo === "taxa_base")!;
    expect(base.veredito).toBe("descritivo");
    expect(base.auc).toBeNull();
    expect(base.brierSkill).toBeNull();
  }, SLOW);
});

describe("ruído puro", () => {
  test("sem sinal no mercado, nenhum experimento afirma sinal (duas sementes)", () => {
    for (const seed of [21, 22]) {
      const records = run(0, seed);
      for (const r of records) expect(r.veredito, `${r.id} semente ${seed}`).not.toBe("sinal_demonstrado");
    }
  }, SLOW);

  test("é determinístico para a mesma semente", () => {
    const a = run(0, 5);
    const b = run(0, 5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, SLOW);
});
