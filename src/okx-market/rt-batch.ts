export type Desconhecido = "desconhecido";
export type Valor = number | Desconhecido;
export type Lado = "compra" | "venda";
export type ClasseLiquidez = "liquido" | "intermediario" | "raso" | "desconhecida";
export type EstadoClasse = "medido" | "amostra insuficiente" | "nao medido";

export const AMOSTRA_MINIMA = 30;

const DESCONHECIDO: Desconhecido = "desconhecido";
const Z_95 = 1.96;
const CLASSES: ClasseLiquidez[] = ["liquido", "intermediario", "raso", "desconhecida"];

export interface RtItem {
  id: string;
  address: string;
}

export interface RtFaixasLiquidez {
  liquidoMinUsd: number;
  intermediarioMinUsd: number;
}

export interface RtQuoteRequest {
  lado: Lado;
  id: string;
  address: string;
  tamanhoUsd: number;
}

export interface RtQuoteReply {
  taxaPoolPct?: number | null;
  impactoPct?: number | null;
  redePct?: number | null;
  impostoPct?: number | null;
  liquidezUsd?: number | null;
}

export type RtQuote = (request: RtQuoteRequest) => Promise<RtQuoteReply | null>;

export interface RtBatchInput {
  itens: RtItem[];
  tamanhos: number[];
  quote: RtQuote;
  faixas: RtFaixasLiquidez;
}

export interface RtComponentes {
  taxaPool: Valor;
  impacto: Valor;
  rede: Valor;
  imposto: Valor;
}

export interface RtLeg {
  lado: Lado;
  componentes: RtComponentes;
  totalPct: Valor;
  liquidezUsd: Valor;
  motivos: string[];
}

export interface RtRodada {
  id: string;
  address: string;
  tamanhoUsd: number;
  classe: ClasseLiquidez;
  compra: RtLeg;
  venda: RtLeg;
  totalPct: Valor;
}

export interface RtResumoClasse {
  classe: ClasseLiquidez;
  n: number;
  desconhecidas: number;
  media: Valor;
  desvio: Valor;
  icInferiorPct: Valor;
  icSuperiorPct: Valor;
  estado: EstadoClasse;
}

export interface RtBatchResult {
  rodadas: RtRodada[];
  resumo: RtResumoClasse[];
}

export async function batchRoundTrip(input: RtBatchInput): Promise<RtBatchResult> {
  validar(input);
  const rodadas: RtRodada[] = [];
  for (const item of input.itens) {
    for (const tamanhoUsd of input.tamanhos) {
      const compra = await perna(item, "compra", tamanhoUsd, input.quote);
      const venda = await perna(item, "venda", tamanhoUsd, input.quote);
      rodadas.push({
        id: item.id,
        address: item.address,
        tamanhoUsd,
        classe: classificar(compra, venda, input.faixas),
        compra,
        venda,
        totalPct: somaSeConhecida([compra.totalPct, venda.totalPct]),
      });
    }
  }
  return { rodadas, resumo: summarizeByClass(rodadas) };
}

export function summarizeByClass(rodadas: RtRodada[]): RtResumoClasse[] {
  return CLASSES.map((classe) => {
    const grupo = rodadas.filter((r) => r.classe === classe);
    const valores = grupo
      .map((r) => r.totalPct)
      .filter((v): v is number => typeof v === "number");
    const n = valores.length;
    const media = n > 0 ? valores.reduce((a, b) => a + b, 0) / n : null;
    const desvio =
      n >= 2 && media !== null
        ? Math.sqrt(valores.reduce((a, x) => a + (x - media) ** 2, 0) / (n - 1))
        : null;
    const margem = desvio !== null ? (Z_95 * desvio) / Math.sqrt(n) : null;
    return {
      classe,
      n,
      desconhecidas: grupo.length - n,
      media: media ?? DESCONHECIDO,
      desvio: desvio ?? DESCONHECIDO,
      icInferiorPct: media !== null && margem !== null ? media - margem : DESCONHECIDO,
      icSuperiorPct: media !== null && margem !== null ? media + margem : DESCONHECIDO,
      estado: n === 0 ? "nao medido" : n < AMOSTRA_MINIMA ? "amostra insuficiente" : "medido",
    };
  });
}

function invalido(): never {
  throw new Error("Invalid round-trip batch input.");
}

function textoValido(texto: unknown): boolean {
  return typeof texto === "string" && texto.length > 0 && !/\s/.test(texto);
}

function validar(input: RtBatchInput): void {
  const { itens, tamanhos, quote, faixas } = input;
  if (!Array.isArray(itens) || itens.length === 0) invalido();
  if (!Array.isArray(tamanhos) || tamanhos.length === 0) invalido();
  if (typeof quote !== "function") invalido();
  if (!Number.isFinite(faixas.liquidoMinUsd) || !Number.isFinite(faixas.intermediarioMinUsd)) {
    invalido();
  }
  if (faixas.intermediarioMinUsd < 0 || faixas.liquidoMinUsd <= faixas.intermediarioMinUsd) {
    invalido();
  }
  const ids = new Set<string>();
  for (const item of itens) {
    if (!textoValido(item.id) || !textoValido(item.address) || ids.has(item.id)) invalido();
    ids.add(item.id);
  }
  for (const tamanho of tamanhos) {
    if (!Number.isFinite(tamanho) || tamanho <= 0) invalido();
  }
}

function legDesconhecida(lado: Lado, motivos: string[]): RtLeg {
  return {
    lado,
    componentes: {
      taxaPool: DESCONHECIDO,
      impacto: DESCONHECIDO,
      rede: DESCONHECIDO,
      imposto: DESCONHECIDO,
    },
    totalPct: DESCONHECIDO,
    liquidezUsd: DESCONHECIDO,
    motivos,
  };
}

function lerNumero(valor: number | null | undefined, nome: string, motivos: string[]): Valor {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  motivos.push(`campo_ausente:${nome}`);
  return DESCONHECIDO;
}

function somaSeConhecida(valores: Valor[]): Valor {
  let soma = 0;
  for (const v of valores) {
    if (typeof v !== "number") return DESCONHECIDO;
    soma += v;
  }
  return soma;
}

async function perna(
  item: RtItem,
  lado: Lado,
  tamanhoUsd: number,
  quote: RtQuote,
): Promise<RtLeg> {
  let reply: RtQuoteReply | null;
  try {
    reply = await quote({ lado, id: item.id, address: item.address, tamanhoUsd });
  } catch {
    return legDesconhecida(lado, ["erro_cotacao"]);
  }
  if (reply === null || reply === undefined) return legDesconhecida(lado, ["cotacao_ausente"]);

  const motivos: string[] = [];
  const taxaPool = lerNumero(reply.taxaPoolPct, "taxaPool", motivos);
  const impactoBruto = lerNumero(reply.impactoPct, "impacto", motivos);
  const impacto = typeof impactoBruto === "number" ? Math.abs(impactoBruto) : DESCONHECIDO;
  const rede = lerNumero(reply.redePct, "rede", motivos);
  const imposto = lerNumero(reply.impostoPct, "imposto", motivos);
  const liquidezUsd = lerNumero(reply.liquidezUsd, "liquidez", motivos);

  return {
    lado,
    componentes: { taxaPool, impacto, rede, imposto },
    totalPct: somaSeConhecida([taxaPool, impacto, rede, imposto]),
    liquidezUsd,
    motivos,
  };
}

function classificar(compra: RtLeg, venda: RtLeg, faixas: RtFaixasLiquidez): ClasseLiquidez {
  if (typeof compra.liquidezUsd !== "number" || typeof venda.liquidezUsd !== "number") {
    return "desconhecida";
  }
  const menor = Math.min(compra.liquidezUsd, venda.liquidezUsd);
  if (menor >= faixas.liquidoMinUsd) return "liquido";
  if (menor >= faixas.intermediarioMinUsd) return "intermediario";
  return "raso";
}
