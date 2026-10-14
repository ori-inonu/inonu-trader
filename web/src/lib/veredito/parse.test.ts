import { describe, expect, test } from "bun:test";
import { parsePerfil, parsePlacar, parsePlano, parseVeredito } from "./parse";
import { COMPRAR, ESPERAR_PELO_CUSTO, PLANO } from "./test-fixtures";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("parseVeredito (VER-1)", () => {
  test("what the core emits is read as it is, through JSON", () => {
    expect(parseVeredito(clone(COMPRAR))).toEqual(COMPRAR);
    expect(parseVeredito(clone(ESPERAR_PELO_CUSTO))).toEqual(ESPERAR_PELO_CUSTO);
  });

  test("the contract is closed: an extra key, a missing key or a non object is refused", () => {
    expect(parseVeredito({ ...clone(COMPRAR), extra: 1 })).toBeNull();
    const { risco: _risco, ...missing } = clone(COMPRAR);
    expect(parseVeredito(missing)).toBeNull();
    for (const bad of [null, undefined, 3, "x", [], true]) expect(parseVeredito(bad)).toBeNull();
  });

  test("words outside the vocabulary are refused: the seal, the confidence and the gate", () => {
    expect(parseVeredito({ ...clone(COMPRAR), selo: "long" })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), confianca: "certa" })).toBeNull();
    expect(parseVeredito({ ...clone(ESPERAR_PELO_CUSTO), forcadoPor: "mau_humor" })).toBeNull();
  });

  test("only esperar can be forced by a gate", () => {
    expect(parseVeredito({ ...clone(COMPRAR), forcadoPor: "custo" })).toBeNull();
    expect(parseVeredito({ ...clone(ESPERAR_PELO_CUSTO), forcadoPor: null })).not.toBeNull();
  });

  test("texts are bounded, lists are bounded and every item is a text", () => {
    expect(parseVeredito({ ...clone(COMPRAR), mensagem: "x".repeat(241) })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), mensagem: "" })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), motivos: ["a", "b", "c", "d"] })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), motivos: [1] })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), avisos: Array.from({ length: 9 }, () => "a") })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), risco: 5 })).toBeNull();
  });

  test("a broken plan breaks the whole value, never a half drawn card", () => {
    expect(parseVeredito({ ...clone(COMPRAR), plano: { ...PLANO, alvo: Number.NaN } })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), plano: { ...PLANO, lado: "long" } })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), plano: { ...PLANO, extra: 1 } })).toBeNull();
    expect(parseVeredito({ ...clone(COMPRAR), notaZona: "62" })).toBeNull();
  });
});

describe("parsePlano", () => {
  test("a null ratio and a null size are allowed (the cost ate the target; no profile)", () => {
    expect(parsePlano({ ...PLANO, ganhoRiscoLiquido: null, tamanho: null })).toEqual({ ...PLANO, ganhoRiscoLiquido: null, tamanho: null });
  });
  test("a size has exactly its four fields", () => {
    expect(parsePlano({ ...PLANO, tamanho: { riscoUsd: 1, notionalUsd: 2, quantidadeBase: 3 } })).toBeNull();
    expect(parsePlano({ ...PLANO, tamanho: { riscoUsd: 1, notionalUsd: 2, quantidadeBase: 3, limitadoPeloCapital: "no" } })).toBeNull();
  });
  test("a target kind outside the four is refused", () => {
    expect(parsePlano({ ...PLANO, alvoTipo: "sonho" })).toBeNull();
  });
});

describe("parsePerfil", () => {
  test("two numbers or two nulls, never one", () => {
    expect(parsePerfil({ capitalUsd: 1000, riskPct: 0.5 })).toEqual({ capitalUsd: 1000, riskPct: 0.5 });
    expect(parsePerfil({ capitalUsd: null, riskPct: null })).toEqual({ capitalUsd: null, riskPct: null });
    expect(parsePerfil({ capitalUsd: 1000, riskPct: null })).toBeNull();
    expect(parsePerfil({ capitalUsd: 1000, riskPct: 1, extra: 1 })).toBeNull();
    expect(parsePerfil({ capitalUsd: "1", riskPct: 1 })).toBeNull();
  });
});

describe("parsePlacar", () => {
  const placar = (over: Record<string, unknown> = {}) => ({ ok: true, placar: { estado: "nao_medido", minimo: 30, texto: "Placar: 3 de 30 respostas medidas. Sem numero ate la.", decisoes: { medidas: 3, total: 5 }, ...over }, gravador: {}, advisory: true, execution: "never" });
  test("the state, the sentence and the count", () => {
    expect(parsePlacar(placar())).toEqual({ estado: "nao_medido", texto: "Placar: 3 de 30 respostas medidas. Sem numero ate la.", medidas: 3, minimo: 30 });
  });
  test("anything else is nothing", () => {
    expect(parsePlacar({ ...placar(), ok: false })).toBeNull();
    expect(parsePlacar(placar({ estado: "otimo" }))).toBeNull();
    expect(parsePlacar(placar({ texto: "" }))).toBeNull();
    expect(parsePlacar(placar({ decisoes: {} }))).toBeNull();
    expect(parsePlacar(null)).toBeNull();
    expect(parsePlacar({ ok: true })).toBeNull();
  });
});

describe("parseMedicao", () => {
  const placar = { estado: "nao_medido", minimo: 30, texto: "Placar: 0 de 30 respostas medidas. Sem numero ate la.", decisoes: { medidas: 0, total: 0 } };
  const gravador = { enabled: true, snapshots: 48, labels: 12, decisions: 2, writeErrors: 0, bytes: 1234, running: false, skipped: {} };
  test("the Placar with the health of the recorder", async () => {
    const { parseMedicao } = await import("./parse");
    expect(parseMedicao({ ok: true, placar, gravador })).toEqual({
      placar: { estado: "nao_medido", texto: placar.texto, medidas: 0, minimo: 30 },
      gravador: { ligado: true, fotos: 48, resultados: 12, respostas: 2, falhasDeGravacao: 0, bytes: 1234 },
    });
  });
  test("a recorder block that is not readable is left out, and a Placar that is not readable is nothing", async () => {
    const { parseMedicao } = await import("./parse");
    expect(parseMedicao({ ok: true, placar, gravador: { enabled: true } })?.gravador).toBeNull();
    expect(parseMedicao({ ok: true, placar, gravador: { ...gravador, snapshots: -1 } })?.gravador).toBeNull();
    expect(parseMedicao({ ok: true, placar: {}, gravador })).toBeNull();
    expect(parseMedicao(null)).toBeNull();
  });
});
