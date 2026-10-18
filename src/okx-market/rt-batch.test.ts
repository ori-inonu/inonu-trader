import { describe, expect, test } from "bun:test";
import {
  batchRoundTrip,
  summarizeByClass,
  type RtItem,
  type RtQuoteReply,
  type RtQuoteRequest,
  type RtRodada,
} from "./rt-batch";

const faixas = { liquidoMinUsd: 500000, intermediarioMinUsd: 50000 };
const A: RtItem = { id: "A", address: "0xA" };
const B: RtItem = { id: "B", address: "0xB" };

const completa: RtQuoteReply = {
  taxaPoolPct: 0.25,
  impactoPct: -0.1,
  redePct: 0.01,
  impostoPct: 0,
  liquidezUsd: 2000000,
};

const quoteCompleta = async (): Promise<RtQuoteReply> => ({ ...completa });

function rodada(classe: RtRodada["classe"], totalPct: number): RtRodada {
  const perna = {
    lado: "compra" as const,
    componentes: { taxaPool: 0, impacto: 0, rede: 0, imposto: 0 },
    totalPct,
    liquidezUsd: 2000000,
    motivos: [],
  };
  return {
    id: "X",
    address: "0xX",
    tamanhoUsd: 10,
    classe,
    compra: perna,
    venda: { ...perna, lado: "venda" },
    totalPct,
  };
}

describe("rt-batch", () => {
  test("1. Soma dos quatro componentes em um tamanho", async () => {
    const result = await batchRoundTrip({
      itens: [A],
      tamanhos: [10],
      quote: quoteCompleta,
      faixas,
    });
    const [r] = result.rodadas;
    expect(r).toBeDefined();
    expect(r!.compra.totalPct).toBeCloseTo(0.36, 10);
    expect(r!.venda.totalPct).toBeCloseTo(0.36, 10);
    expect(r!.totalPct).toBeCloseTo(0.72, 10);
    expect(r!.compra.componentes.impacto).toBe(0.1);
    expect(r!.classe).toBe("liquido");
  });

  test("2. Campo ausente vira desconhecido, nunca zero", async () => {
    const semImposto = async (req: RtQuoteRequest): Promise<RtQuoteReply> => {
      if (req.lado === "compra") {
        const { impostoPct: _omitido, ...resto } = completa;
        return resto;
      }
      return { ...completa };
    };
    const result = await batchRoundTrip({
      itens: [A],
      tamanhos: [10],
      quote: semImposto,
      faixas,
    });
    const [r] = result.rodadas;
    expect(r!.compra.componentes.imposto).toBe("desconhecido");
    expect(r!.compra.totalPct).toBe("desconhecido");
    expect(r!.totalPct).toBe("desconhecido");
    expect(r!.compra.motivos).toContain("campo_ausente:imposto");
    const liquido = summarizeByClass(result.rodadas).find((c) => c.classe === "liquido");
    expect(liquido!.n).toBe(0);
    expect(liquido!.desconhecidas).toBe(1);
    expect(liquido!.estado).toBe("nao medido");
  });

  test("3. Cotacao nula gera rodada desconhecida", async () => {
    const result = await batchRoundTrip({
      itens: [A],
      tamanhos: [10],
      quote: async () => null,
      faixas,
    });
    const [r] = result.rodadas;
    expect(r!.compra.componentes.taxaPool).toBe("desconhecido");
    expect(r!.compra.componentes.impacto).toBe("desconhecido");
    expect(r!.compra.componentes.rede).toBe("desconhecido");
    expect(r!.compra.componentes.imposto).toBe("desconhecido");
    expect(r!.compra.motivos).toContain("cotacao_ausente");
    expect(r!.compra.liquidezUsd).toBe("desconhecido");
    expect(r!.venda.liquidezUsd).toBe("desconhecido");
    expect(r!.classe).toBe("desconhecida");
    expect(r!.totalPct).toBe("desconhecido");
  });

  test("4. Erro da cotacao nao derruba o lote", async () => {
    const quote = async (req: RtQuoteRequest): Promise<RtQuoteReply> => {
      if (req.id === "A") throw new Error("boom");
      return { ...completa };
    };
    const result = await batchRoundTrip({
      itens: [A, B],
      tamanhos: [10],
      quote,
      faixas,
    });
    expect(result.rodadas).toHaveLength(2);
    const [ra, rb] = result.rodadas;
    expect(ra!.totalPct).toBe("desconhecido");
    expect(ra!.compra.motivos).toContain("erro_cotacao");
    expect(rb!.totalPct).toBeCloseTo(0.72, 10);
  });

  test("5. Numero nao finito vira desconhecido", async () => {
    const quote = async (): Promise<RtQuoteReply> => ({
      taxaPoolPct: 0.25,
      impactoPct: Number.NaN,
      redePct: Number.POSITIVE_INFINITY,
      impostoPct: 0,
      liquidezUsd: 2000000,
    });
    const result = await batchRoundTrip({
      itens: [A],
      tamanhos: [10],
      quote,
      faixas,
    });
    const perna = result.rodadas[0]!.compra;
    expect(perna.componentes.impacto).toBe("desconhecido");
    expect(perna.componentes.rede).toBe("desconhecido");
    expect(perna.componentes.taxaPool).toBe(0.25);
    expect(perna.componentes.imposto).toBe(0);
    expect(perna.totalPct).toBe("desconhecido");
  });

  test("6. Classe pela faixa de liquidez", async () => {
    const liquidez: Record<string, number> = { L: 600000, I: 60000, R: 10000 };
    const quote = async (req: RtQuoteRequest): Promise<RtQuoteReply> => ({
      ...completa,
      liquidezUsd: liquidez[req.id],
    });
    const result = await batchRoundTrip({
      itens: [
        { id: "L", address: "0xL" },
        { id: "I", address: "0xI" },
        { id: "R", address: "0xR" },
      ],
      tamanhos: [10],
      quote,
      faixas,
    });
    expect(result.rodadas.map((r) => r.classe)).toEqual([
      "liquido",
      "intermediario",
      "raso",
    ]);
  });

  test("7. Classe pela perna menos liquida e desconhecida sem liquidez", async () => {
    const primeira = async (req: RtQuoteRequest): Promise<RtQuoteReply> => ({
      ...completa,
      liquidezUsd: req.lado === "compra" ? 600000 : 40000,
    });
    const r1 = await batchRoundTrip({ itens: [A], tamanhos: [10], quote: primeira, faixas });
    expect(r1.rodadas[0]!.classe).toBe("raso");

    const segunda = async (req: RtQuoteRequest): Promise<RtQuoteReply> => {
      const { liquidezUsd: _omitido, ...resto } = completa;
      return req.lado === "compra" ? { ...completa, liquidezUsd: 600000 } : resto;
    };
    const r2 = await batchRoundTrip({ itens: [A], tamanhos: [10], quote: segunda, faixas });
    expect(r2.rodadas[0]!.classe).toBe("desconhecida");
  });

  test("8. IC com n igual a 30", async () => {
    const quote = async (): Promise<RtQuoteReply> => ({
      taxaPoolPct: 0.25,
      impactoPct: 0,
      redePct: 0,
      impostoPct: 0,
      liquidezUsd: 2000000,
    });
    const itens = Array.from({ length: 30 }, (_, i) => ({ id: `I${i}`, address: `0x${i}` }));
    const result = await batchRoundTrip({ itens, tamanhos: [10], quote, faixas });
    const resumo = summarizeByClass(result.rodadas).find((c) => c.classe === "liquido");
    expect(resumo!.n).toBe(30);
    expect(resumo!.media).toBeCloseTo(0.5, 10);
    expect(resumo!.desvio).toBeCloseTo(0, 10);
    expect(resumo!.icInferiorPct).toBeCloseTo(0.5, 10);
    expect(resumo!.icSuperiorPct).toBeCloseTo(0.5, 10);
    expect(resumo!.estado).toBe("medido");
    expect(resumo!.desconhecidas).toBe(0);
  });

  test("9. Amostra insuficiente com n igual a 29", async () => {
    const quote = async (): Promise<RtQuoteReply> => ({
      taxaPoolPct: 0.25,
      impactoPct: 0,
      redePct: 0,
      impostoPct: 0,
      liquidezUsd: 2000000,
    });
    const itens = Array.from({ length: 29 }, (_, i) => ({ id: `I${i}`, address: `0x${i}` }));
    const result = await batchRoundTrip({ itens, tamanhos: [10], quote, faixas });
    const resumo = summarizeByClass(result.rodadas).find((c) => c.classe === "liquido");
    expect(resumo!.n).toBe(29);
    expect(resumo!.media).toBeCloseTo(0.5, 10);
    expect(resumo!.estado).toBe("amostra insuficiente");
  });

  test("10. Classe sem amostra vira nao medido", async () => {
    const result = await batchRoundTrip({
      itens: [A],
      tamanhos: [10],
      quote: quoteCompleta,
      faixas,
    });
    const raso = summarizeByClass(result.rodadas).find((c) => c.classe === "raso");
    expect(raso!.n).toBe(0);
    expect(raso!.media).toBe("desconhecido");
    expect(raso!.desvio).toBe("desconhecido");
    expect(raso!.icInferiorPct).toBe("desconhecido");
    expect(raso!.icSuperiorPct).toBe("desconhecido");
    expect(raso!.estado).toBe("nao medido");
  });

  test("11. Desvio e IC com n igual a 1", () => {
    const resumo = summarizeByClass([rodada("liquido", 0.5)]).find(
      (c) => c.classe === "liquido",
    );
    expect(resumo!.n).toBe(1);
    expect(resumo!.media).toBe(0.5);
    expect(resumo!.desvio).toBe("desconhecido");
    expect(resumo!.icInferiorPct).toBe("desconhecido");
    expect(resumo!.icSuperiorPct).toBe("desconhecido");
    expect(resumo!.estado).toBe("amostra insuficiente");
  });

  test("12. Desvio amostral e intervalo com duas rodadas", () => {
    const resumo = summarizeByClass([rodada("liquido", 1), rodada("liquido", 3)]).find(
      (c) => c.classe === "liquido",
    );
    expect(resumo!.n).toBe(2);
    expect(resumo!.media).toBeCloseTo(2, 10);
    expect(resumo!.desvio).toBeCloseTo(Math.SQRT2, 5);
    expect(resumo!.icInferiorPct).toBeCloseTo(0.04, 2);
    expect(resumo!.icSuperiorPct).toBeCloseTo(3.96, 2);
    expect(resumo!.estado).toBe("amostra insuficiente");
  });

  test("13. Entrada invalida falha antes de chamar a cotacao", async () => {
    const erro = "Invalid round-trip batch input.";
    let chamadas = 0;
    const quote = async (): Promise<RtQuoteReply> => {
      chamadas++;
      return { ...completa };
    };
    await expect(
      batchRoundTrip({ itens: [A], tamanhos: [0], quote, faixas }),
    ).rejects.toThrow(erro);
    await expect(
      batchRoundTrip({ itens: [A, { id: "A", address: "0xB" }], tamanhos: [10], quote, faixas }),
    ).rejects.toThrow(erro);
    await expect(
      batchRoundTrip({
        itens: [A],
        tamanhos: [10],
        quote,
        faixas: { liquidoMinUsd: 10, intermediarioMinUsd: 50 },
      }),
    ).rejects.toThrow(erro);
    expect(chamadas).toBe(0);
  });

  test("14. Duas cotacoes por rodada, na ordem certa", async () => {
    const chamadas: RtQuoteRequest[] = [];
    const quote = async (req: RtQuoteRequest): Promise<RtQuoteReply> => {
      chamadas.push(req);
      return { ...completa };
    };
    const result = await batchRoundTrip({
      itens: [A, B],
      tamanhos: [10, 100],
      quote,
      faixas,
    });
    expect(chamadas).toHaveLength(8);
    for (let i = 0; i < 8; i += 2) {
      expect(chamadas[i]!.lado).toBe("compra");
      expect(chamadas[i + 1]!.lado).toBe("venda");
    }
    expect(chamadas[0]!.address).toBe("0xA");
    expect(chamadas[0]!.tamanhoUsd).toBe(10);
    expect(chamadas[2]!.tamanhoUsd).toBe(100);
    expect(chamadas[4]!.address).toBe("0xB");
    expect(chamadas[6]!.tamanhoUsd).toBe(100);
    expect(result.rodadas.map((r) => `${r.id}${r.tamanhoUsd}`)).toEqual([
      "A10",
      "A100",
      "B10",
      "B100",
    ]);
  });
});
