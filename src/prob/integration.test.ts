import { describe, expect, test } from "bun:test";
import { briefRowsFrom, buildLaterBriefIndex, buildScoreboardIndex, labelBriefRows, labelRow, type Row } from "./dataset.ts";
import { buildReport, type Journals } from "./report.ts";

const id = "buy:token:501:SyntheticAgeContractOnly";
const brief = (cycleId: string, atMs: number, ag: unknown): Row => ({
  cycleId, atMs,
  candidates: [{ id, kind: "buy", stances: ["skip", "buy_tenth"] }],
  brief: { compras: { [id]: { mo: { ag, r15: 1 } } } },
  verdicts: { [id]: { skip: 0.4, buy_tenth: 0.6 } },
});
const empty: Journals = { briefs: [], scoreboard: [], closings: [], decisionsMeta: [], equity: [], files: {} };

describe("contratos da integracao offline", () => {
  test("idade desconhecida nao e tratada como barra atual em nenhuma ponta", () => {
    for (const age of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const rows = briefRowsFrom([brief("a", 0, 5), brief("b", 900_000, age)]);
      expect(buildLaterBriefIndex(rows).get("501:SyntheticAgeContractOnly")?.[1]?.agMin).toBeNull();
      expect(labelBriefRows(rows, [], [])[0]?.labels["15m"].source).toBeNull();
      const reversed = briefRowsFrom([brief("a", 0, age), brief("b", 900_000, 5)]);
      expect(labelBriefRows(reversed, [], [])[0]?.labels["15m"].source).toBeNull();
    }
    const valid = briefRowsFrom([brief("a", 0, 5), brief("b", 900_000, 5)]);
    expect(labelBriefRows(valid, [], [])[0]?.labels["15m"].retBps).toBe(100);
    const ctx = { scoreboard: buildScoreboardIndex([]), path: new Map(), later: buildLaterBriefIndex(valid) };
    expect(labelRow({ cycleId: "a", candidateId: id, tokenKey: "501:SyntheticAgeContractOnly", atMs: 0 }, ctx)["15m"].source).toBeNull();
  });

  test("rotulo exato continua elegivel sem idade de barra", () => {
    const key = `a:${id}`;
    const scoreboard = [{ kind: "decision", key, entryPriceUsd: 1 }, { kind: "settlement", key, window: "15m", priceUsd: 1.1 }];
    const ctx = { scoreboard: buildScoreboardIndex(scoreboard), path: new Map(), later: new Map() };
    const label = labelRow({ cycleId: "a", candidateId: id, tokenKey: "501:SyntheticAgeContractOnly", atMs: 0 }, ctx)["15m"];
    expect(label.source).toBe("scoreboard_exato");
    expect(label.retBps).toBeCloseTo(1000);
  });

  test("relatorio vazio declara cobertura parcial sem diagnosticos de outra amostra", () => {
    const report = buildReport(empty, { seed: 1, resamples: 10, nowMs: 0 });
    expect(report.versao).toBe("prob-cycle-v2");
    expect(report.suiteDeExperimentos).toBe("prob-cycle-exp-v2");
    expect((report as unknown as { leitura: unknown }).leitura).toEqual({
      cobertura: "parcial", journalsAtivos: ["briefs", "scoreboard", "closings", "decisions-meta", "equity"],
      somentePresenca: ["answers", "prices", "fills"], segmentosRotacionados: "nao_lidos",
    });
    const prose = JSON.stringify([report.achados, report.limites, report.backlog, report.experimentos, report.saidaAntecipada]);
    for (const stale of ["120 consultas", "110 bps", "pulou todas", "faltam em mais da metade", "quedas de 99%", "21 tokens e uma janela de 5 horas", "retorno -100%"])
      expect(prose).not.toContain(stale);
    expect(report.conjunto.consultas).toBe(0);
  });
});
test("texto livre dos journals nao vira chave ou conteudo do relatorio", () => {
  const marker = "SyntheticOpaquePayloadForPrivacyOnly";
  const r = buildReport({ ...empty,
    scoreboard: [{ kind: "decision", key: "k", cycleId: "a", candidateId: id, atMs: 0, entryPriceUsd: 1, stance: marker }, { kind: "settlement", key: "k", window: marker, priceUsd: 1 }],
    closings: [{ cycleId: "a", candidateId: id, atMs: 0, wouldReason: marker }],
    files: { [marker]: { lines: 1, malformed: 0 } },
  }, { seed: 1, resamples: 10, nowMs: 0 });
  expect(JSON.stringify(r).includes(marker)).toBe(false);
});
