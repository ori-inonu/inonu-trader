import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closing } from "../src/decision-shadow/fixtures";
import { readClosings, replayClosings, summarizeShadow } from "./shadow-engine";

const dir = mkdtempSync(join(tmpdir(), "shadow-engine-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("shadow-engine", () => {
  const strong = closing({ answer: { buy: 0.9, skip: 0.1 } });
  const weak = closing({ answer: { buy: 0.1, skip: 0.9 } });
  const noQuote = closing({ quote: null, answer: null });
  const records = replayClosings([strong, weak, noQuote], { mode: "bruta" });

  test("cada fechamento vira uma linha; sem cotação o motor não avalia e diz o que faltou", () => {
    expect(records).toHaveLength(3);
    expect(records[0]!.engine?.action).toBe("COMPRAR");
    expect(records[1]!.engine).toMatchObject({ action: "NAO_OPERAR", reasons: ["no_edge"] });
    expect(records[2]!.engine).toBeNull();
    expect(records[2]!.missing).toContain("quote");
  });

  test("resumo: avaliáveis, ações, motivos, cruzamento com a produção e compras que o motor recusa", () => {
    const s = summarizeShadow(records, "bruta", 0);
    expect(s).toMatchObject({ total: 3, evaluated: 2, engineOperates: 1, pWinMode: "bruta" });
    expect(s.engine.byAction).toEqual({ COMPRAR: 1, NAO_OPERAR: 1 });
    expect(s.engine.byReason).toEqual({ ok: 1, no_edge: 1 });
    expect(s.notEvaluated.count).toBe(1);
    expect(s.notEvaluated.missing.quote).toBe(1);
    // a produção (fixture) diz "buy" nos três; o motor concorda em um, recusa um e não avalia um
    expect(s.agreement).toEqual({ buy: { COMPRAR: 1, NAO_OPERAR: 1, nao_avaliavel: 1 } });
    expect(s.productionBuysEngineRefuses).toEqual({ count: 1, byReason: { no_edge: 1 } });
    expect(s.engine.netEdgeBps?.n).toBe(2);
  });

  test("sem probabilidade nada é avaliado: o resumo não inventa decisão", () => {
    const none = replayClosings([strong, weak], { mode: "ausente" });
    const s = summarizeShadow(none, "ausente", 0);
    expect(s.evaluated).toBe(0);
    expect(s.engine.byAction).toEqual({});
    expect(s.engine.netEdgeBps).toBeNull();
    expect(s.notEvaluated.missing.pWin).toBe(2);
  });

  test("o resumo não carrega id de ciclo, endereço nem assinatura", () => {
    const text = JSON.stringify(summarizeShadow(records, "bruta", 0));
    expect(text).not.toContain("cy-1");
    expect(text).not.toContain("buy:token:501");
    expect(text).toContain("limitations");
  });

  test("a idade da cotação no replay é a do momento do uso, então uma cotação lida há mais de 15 s é recusada", () => {
    const old = closing({ quote: { receivedAtMs: 1_792_000_000_900, reviewedAtMs: 1_792_000_000_900 } });
    const lateClock = replayClosings([old], { mode: "bruta" });
    expect(lateClock[0]!.inputs.quoteAgeMs).toBe(1000);
  });

  test("lê o journal real linha a linha e ignora linha corrompida", () => {
    const file = join(dir, "closings.jsonl");
    writeFileSync(file, `${JSON.stringify(strong)}\nnão é json\n\n${JSON.stringify(weak)}\n`);
    expect(readClosings(file)).toHaveLength(2);
  });
});
