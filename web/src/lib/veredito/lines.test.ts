import { describe, expect, test } from "bun:test";
import { confidenceLine, parseNumberInput, planRows, SEAL_WORD, TARGET_WORD, zoneLine } from "./lines";
import { PLANO } from "./test-fixtures";

describe("the plan as rows (VER-4)", () => {
  test("the clear buy, in percent and with the size for the risk chosen", () => {
    expect(planRows(PLANO, "ETH")).toEqual([
      { rotulo: "Entrada", valor: "98,500 a 99,500", dica: "abaixo do preco agora, a 0,50%" },
      { rotulo: "A ideia cai em", valor: "98,000", dica: "1,51% de risco a partir da entrada" },
      { rotulo: "Alvo", valor: "103,000", dica: "3,52% acima, perto da zona do lado oposto" },
      { rotulo: "Ganho sobre risco", valor: "1,88", dica: "depois dos custos" },
      { rotulo: "Custo de entrar e sair", valor: "0,24%", dica: "taxas, folga de execucao e spread" },
      { rotulo: "Tamanho", valor: "US$ 572,23 (5,751 ETH)", dica: "para perder US$ 10,00 se a ideia cair" },
    ]);
  });

  test("without a profile there is no size row: nothing is invented to fill it", () => {
    const rows = planRows({ ...PLANO, tamanho: null }, "ETH");
    expect(rows.map((r) => r.rotulo)).not.toContain("Tamanho");
    expect(rows).toHaveLength(5);
  });

  test("a price already inside the band, and a target that does not pay the cost", () => {
    const rows = planRows({ ...PLANO, distanciaAteEntradaBps: 0, entradaBaixo: 99, entradaAlto: 99, entradaReferencia: 99, ganhoRiscoLiquido: null }, "ETH");
    expect(rows[0]).toEqual({ rotulo: "Entrada", valor: "99,000", dica: "o preco ja esta na faixa" });
    expect(rows[3]!.valor).toBe("o custo come o alvo");
  });

  test("a sell says above and below the other way round, and a limited size says why", () => {
    const rows = planRows({ ...PLANO, lado: "venda", alvoTipo: "multiplo", tamanho: { riscoUsd: 5, notionalUsd: 100, quantidadeBase: 0.00123456, limitadoPeloCapital: true } }, "BTC");
    expect(rows[0]!.dica).toBe("acima do preco agora, a 0,50%");
    expect(rows[2]!.dica).toBe("3,52% abaixo, 1,5 vez o risco");
    expect(rows[5]).toEqual({ rotulo: "Tamanho", valor: "US$ 100,00 (0,00123 BTC)", dica: "limitado ao seu capital, sem alavancagem" });
  });

  test("a price keeps the decimals the desk gives a price of that size", () => {
    const rows = planRows({ ...PLANO, entradaBaixo: 64210.5, entradaAlto: 64210.5, entradaReferencia: 64210.5, invalidacao: 64500.2, alvo: 63000 }, "BTC");
    expect([rows[0]!.valor, rows[1]!.valor, rows[2]!.valor]).toEqual(["64.211", "64.500", "63.000"]);
    const small = planRows({ ...PLANO, entradaBaixo: 0.01234, entradaAlto: 0.01234, entradaReferencia: 0.01234, invalidacao: 0.0121, alvo: 0.0131 }, "PEPE");
    expect(small[0]!.valor).toBe("0,012340");
  });

  test("every target kind has words", () => {
    for (const kind of ["zona_oposta", "piscina", "perfil", "multiplo"] as const) expect(TARGET_WORD[kind].length).toBeGreaterThan(5);
  });
});

describe("the other lines", () => {
  test("the seal is a word", () => {
    expect(SEAL_WORD).toEqual({ comprar: "Comprar", vender: "Vender", esperar: "Esperar" });
  });
  test("the confidence is about the consistency of the answers and says when it is not informed", () => {
    expect(confidenceLine("alta")).toBe("Consistencia das respostas do modelo: alta.");
    expect(confidenceLine("media")).toBe("Consistencia das respostas do modelo: media.");
    expect(confidenceLine(null)).toBe("Consistencia das respostas do modelo: nao informada.");
  });
  test("the strength of the zone is described and not sold as a forecast", () => {
    expect(zoneLine(62)).toBe("Forca da zona: 62 de 100. Descreve a zona, nao preve o preco.");
    expect(zoneLine(null)).toBeNull();
  });
});

describe("what a person types", () => {
  test("a comma or a dot, spaces around, and nothing else", () => {
    expect(parseNumberInput("0,5")).toBe(0.5);
    expect(parseNumberInput(" 1.5 ")).toBe(1.5);
    expect(parseNumberInput("2500")).toBe(2500);
    for (const bad of ["", "abc", "1,2,3", "-1", "1e3", "0x10", "1 000", ",5", "5,"]) expect(parseNumberInput(bad), bad).toBeNull();
  });
});
