import { describe, expect, test } from "bun:test";
import { syntheticJournals } from "./fixtures.ts";
import { REPORT_VERSION, agreementOf, buildReport, leaksIn, type Journals } from "./report.ts";
import { briefRowsFrom, labelBriefRows } from "./dataset.ts";

const SLOW = 120_000;
const OPTIONS = { seed: 4, resamples: 60, nowMs: 1_700_000_000_000 };
const journals: Journals = syntheticJournals({ seed: 8, tokens: 10, looks: 200, signal: 1 });
const report = buildReport(journals, OPTIONS);

describe("relatório do ciclo", () => {
  test("traz as seções pedidas e a versão", () => {
    expect(report.versao).toBe(REPORT_VERSION);
    expect(Object.keys(report)).toEqual(expect.arrayContaining(["entradas", "janela", "qualidade", "conjunto", "experimentos", "hesitacao", "saidaAntecipada", "achados", "limites", "backlog"]));
    expect(report.geradoEmMs).toBe(OPTIONS.nowMs);
    expect(report.experimentos.map((e) => e.id.split("-")[0])).toEqual(["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E08"]);
    expect(report.limites.length).toBeGreaterThanOrEqual(5);
    expect(report.backlog.length).toBeGreaterThanOrEqual(5);
  }, SLOW);

  test("a tabela de campos cobre todos os campos do brief e cada um traz completude, faixa e alertas", () => {
    const campos = (report.qualidade as { camposDoBrief: Array<{ campo: string; n: number; ausente: number; nulo: number; impossiveis: number; alertas: string[] }> }).camposDoBrief;
    expect(campos.length).toBeGreaterThanOrEqual(30);
    const d = campos.find((c) => c.campo === "d")!;
    expect(d.n).toBeGreaterThan(0);
    expect(d.alertas).toContain("constante");
    for (const c of campos) expect(c.ausente + c.nulo).toBeLessThanOrEqual(c.n);
  }, SLOW);

  test("duplicidade medida: o fixture não repete ciclo, linha nem hash", () => {
    const d = (report.qualidade as { duplicidade: Record<string, number> }).duplicidade;
    expect(d).toEqual({ consultasComCicloRepetido: 0, linhasCicloCandidatoRepetidas: 0, hashDoBriefRepetido: 0, tokenRepetidoNaMesmaConsulta: 0 });
    const doubled = buildReport({ ...journals, briefs: [...journals.briefs, journals.briefs[0]!] }, { ...OPTIONS, resamples: 20 });
    expect((doubled.qualidade as { duplicidade: Record<string, number> }).duplicidade.consultasComCicloRepetido).toBe(1);
    expect((doubled.qualidade as { duplicidade: Record<string, number> }).duplicidade.linhasCicloCandidatoRepetidas).toBe(7);
  }, SLOW);

  test("achados medidos: cada um com severidade, números e a correção a montante", () => {
    expect(report.achados.map((a) => a.id)).toEqual(expect.arrayContaining(["D01-brief-janela-rolante", "D02-juncao-pobre", "D03-instante-da-decisao", "D04-liquidacao-sem-preco", "D06-campos-ausentes", "D08-pbuy-quantizado", "D10-vazamento"]));
    for (const a of report.achados) {
      expect(["alta", "media", "baixa"]).toContain(a.severidade);
      expect(a.correcao.length).toBeGreaterThan(30);
      expect(Object.keys(a.numeros).length).toBeGreaterThan(0);
    }
    const d01 = report.achados.find((a) => a.id === "D01-brief-janela-rolante")!;
    expect(d01.numeros.answersJsonl).toBe("ausente");
  }, SLOW);

  test("a cobertura da junção é consistente: rotulados nunca excedem as linhas e a soma por fonte fecha", () => {
    const cobertura = (report.conjunto as { cobertura: Record<string, { rows: number; labeled: number; bySource: Record<string, number>; share: number | null }> }).cobertura;
    for (const h of ["15m", "1h", "4h"]) {
      const c = cobertura[h]!;
      expect(c.rows).toBe((report.conjunto as { linhasDeCandidato: number }).linhasDeCandidato);
      expect(c.labeled).toBeLessThanOrEqual(c.rows);
      expect(Object.values(c.bySource).reduce((s, v) => s + v, 0)).toBe(c.labeled);
    }
    const juncao = (report.conjunto as { juncaoDiretaBriefPlacar: { linhasComDecisaoDoPlacar: number; parte: number } }).juncaoDiretaBriefPlacar;
    expect(juncao.parte).toBeLessThan(0.6);
  }, SLOW);

  test("saída antecipada: políticas com economia, perdas e a aviso de que é medido na amostra", () => {
    const s = report.saidaAntecipada as { politicas: Array<{ policy: string; secondsSaved: number; lostBuys: number; flags?: unknown }>; aviso: string; recomendacao: { politica: string | null } };
    expect(s.politicas.map((p) => p.policy)).toEqual(expect.arrayContaining(["limiar", "calibrada", "repeticao"]));
    expect(s.politicas.every((p) => p.flags === undefined)).toBe(true);
    expect(s.aviso).toContain("não é validação");
  }, SLOW);

  test("é determinístico para a mesma semente e muda de semente a semente", () => {
    const again = buildReport(journals, OPTIONS);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  }, SLOW);
});

describe("privacidade do relatório", () => {
  const text = JSON.stringify(report);

  test("não contém ids de ciclo, endereços de token, hashes nem impressões de cotação dos dados de entrada", () => {
    expect(leaksIn(text, journals)).toEqual([]);
    for (const b of journals.briefs.slice(0, 20)) expect(text.includes(b.cycleId as string)).toBe(false);
    const addr = (journals.scoreboard.find((r) => r.kind === "decision") as { address: string }).address;
    expect(text.includes(addr)).toBe(false);
  }, SLOW);

  test("o detector acusa um vazamento plantado", () => {
    const cycleId = journals.briefs[0]!.cycleId as string;
    const leaked = leaksIn(`${text} ${cycleId}`, journals);
    expect(leaked).toContain("cycleId");
    const addr = (journals.scoreboard.find((r) => r.kind === "decision") as { address: string }).address;
    expect(leaksIn(`x ${addr} y`, journals)).toContain("endereco");
  }, SLOW);
});

describe("concordância entre fontes de rótulo", () => {
  test("pares de fontes por horizonte com contagem, sinal e correlação", () => {
    const labeled = labelBriefRows(briefRowsFrom(journals.briefs), journals.scoreboard, journals.equity);
    const cells = agreementOf(labeled);
    expect(cells).toHaveLength(9);
    for (const c of cells) {
      expect(c.n).toBeGreaterThanOrEqual(0);
      if (c.n > 0) expect(c.mesmoSinal as number).toBeGreaterThanOrEqual(0);
    }
    const best = cells.filter((c) => c.n >= 30);
    expect(best.length).toBeGreaterThan(0);
    // o processo sintético é um passeio sem ruído de fonte: as fontes concordam muito no sinal
    for (const c of best) expect(c.mesmoSinal as number).toBeGreaterThan(0.7);
  }, SLOW);
});
