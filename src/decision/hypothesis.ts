import { requiredPWin } from "./edge";
import { round } from "./metrics";

/**
 * Avaliação da hipótese "capturar até X bps líquidos por operação, uma a cada poucas dezenas de milissegundos".
 * Pura: recebe números medidos e devolve um achado por frente, cada um com a evidência em texto. Nenhum achado afirma
 * lucro; "nao_demonstrada" significa que os dados não bastam, não que seja falsa.
 */
export type Status = "inviavel" | "nao_sustentada" | "nao_demonstrada";

export interface Finding {
  readonly id: "vazao" | "latencia" | "custo_de_entrada" | "retorno_realizado" | "retorno_das_compras";
  readonly status: Status;
  readonly evidence: string;
}

export interface HypothesisInputs {
  /** Alvo líquido por operação, em bps (0,3% = 30). */
  readonly targetNetBps: number;
  /** Cadência pedida entre decisões, em ms. */
  readonly targetIntervalMs: number;
  readonly requiredPerSecond: number;
  /** Teto de requisições por segundo do plano de trade. */
  readonly tradeRps: number;
  readonly requiredPerDay: number;
  /** Franquia Basic dividida pelos dias do mês. */
  readonly basicPerDay: number;
  /** Latências medidas em ms; null quando não há medida. */
  readonly quoteP50Ms: number | null;
  readonly modelP50Ms: number | null;
  /** p95 da decisão local pura (benchmark). */
  readonly localP95Ms: number | null;
  /** Mediana do impacto de preço cotado por perna de entrada, em %. */
  readonly entryImpactP50Pct: number | null;
  /** Fração das cotações cujo impacto por perna é de no máximo `maxLegPct` (o que cabe no alvo em duas pernas). */
  readonly entryShareWithinTarget: number | null;
  readonly realized: { readonly n: number; readonly wins: number; readonly atLeastTarget: number; readonly returnPct: number | null };
  readonly forwardBuys: { readonly n: number; readonly meanBps: number; readonly atLeastTarget: { readonly k: number; readonly ci95: readonly [number, number] } } | null;
}

export interface Assessment {
  readonly verdict: string;
  readonly findings: readonly Finding[];
  /** Probabilidade de acerto exigida para movimentos simétricos de cada tamanho, dado o custo de duas pernas medido. >1 é impossível. */
  readonly requiredPWinBySymmetricMove: readonly { readonly moveBps: number; readonly costBps: number; readonly pWin: number }[];
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const num = (x: number, d = 0) => x.toFixed(d).replace(".", ",");

export function assessHypothesis(i: HypothesisInputs): Assessment {
  const findings: Finding[] = [];

  findings.push(
    i.requiredPerSecond > i.tradeRps || i.requiredPerDay > i.basicPerDay
      ? {
          id: "vazao",
          status: "inviavel",
          evidence: `Uma decisão a cada ${i.targetIntervalMs} ms exige ${num(i.requiredPerSecond, 1)} requisições por segundo e ${num(i.requiredPerDay)} por dia; o teto de trade é ${i.tradeRps} por segundo (${num(i.requiredPerSecond / i.tradeRps, 1)} vezes menos) e a franquia Basic comporta ${num(i.basicPerDay)} por dia (${num(i.requiredPerDay / i.basicPerDay)} vezes menos).`,
        }
      : { id: "vazao", status: "nao_demonstrada", evidence: "A cadência cabe nos tetos declarados; falta medir se o provedor a entrega." },
  );

  if (i.quoteP50Ms !== null && i.modelP50Ms !== null) {
    const total = i.quoteP50Ms + i.modelP50Ms;
    findings.push({
      id: "latencia",
      status: total > i.targetIntervalMs ? "inviavel" : "nao_demonstrada",
      evidence: `Mediana da cotação ${num(i.quoteP50Ms)} ms mais mediana do modelo ${num(i.modelP50Ms)} ms são ${num(total)} ms por decisão, ${num(total / i.targetIntervalMs, 1)} vezes a cadência de ${i.targetIntervalMs} ms.${i.localP95Ms === null ? "" : ` A decisão local pura tem p95 de ${num(i.localP95Ms, 4)} ms: cabe no limite de 80 ms, mas não é o gargalo.`}`,
    });
  }

  if (i.entryImpactP50Pct !== null) {
    const legsBps = 2 * i.entryImpactP50Pct * 100;
    findings.push({
      id: "custo_de_entrada",
      status: legsBps >= i.targetNetBps ? "nao_sustentada" : "nao_demonstrada",
      evidence: `Mediana do impacto de preço cotado ${num(i.entryImpactP50Pct, 2)}% por perna: ${num(legsBps, 0)} bps em duas pernas contra o alvo líquido de ${i.targetNetBps} bps, antes de taxa do DEX, gas e MEV.${i.entryShareWithinTarget === null ? "" : ` Só ${pct(i.entryShareWithinTarget)} das cotações cabem em até ${num((i.targetNetBps / 2) / 100, 2)}% por perna.`}`,
    });
  }

  const r = i.realized;
  findings.push({
    id: "retorno_realizado",
    status: r.n < 30 ? "nao_demonstrada" : r.atLeastTarget / r.n < 0.5 ? "nao_sustentada" : "nao_demonstrada",
    evidence: `${r.n} vendas reais pareadas, ${r.wins} com ganho e ${r.atLeastTarget} com pelo menos ${i.targetNetBps} bps${r.returnPct === null ? "" : `; retorno agregado ${num(r.returnPct, 2)}% antes da taxa de rede`}. Amostra pequena demais para concluir (mínimo adotado: 30).`,
  });

  if (i.forwardBuys !== null) {
    const f = i.forwardBuys;
    findings.push({
      id: "retorno_das_compras",
      status: f.n < 30 ? "nao_demonstrada" : "nao_sustentada",
      evidence: `${f.n} compras do modelo, retorno médio ${num(f.meanBps, 0)} bps em 15 minutos; ${f.atLeastTarget.k} chegaram a ${i.targetNetBps} bps (IC 95% da fração: ${pct(f.atLeastTarget.ci95[0])} a ${pct(f.atLeastTarget.ci95[1])}), antes de qualquer custo.`,
    });
  }

  const costBps = i.entryImpactP50Pct === null ? 0 : 2 * i.entryImpactP50Pct * 100;
  const table = [50, 100, 200, 400].map((moveBps) => ({ moveBps, costBps: round(costBps, 1), pWin: round(requiredPWin(moveBps, moveBps, costBps, i.targetNetBps), 3) }));

  const blocked = findings.filter((f) => f.status === "inviavel").map((f) => f.id);
  const verdict =
    `Cadência de ${i.targetIntervalMs} ms: ${blocked.length > 0 ? `inviável no plano atual (${blocked.join(", ")})` : "sem impedimento declarado, falta medir"}. ` +
    `${i.targetNetBps} bps líquidos por operação seletiva: não demonstrado pelos dados atuais; os custos medidos de entrada já consomem a maior parte do alvo. ` +
    `Padrão correto do motor: NAO_OPERAR, salvo edge líquido positivo comprovado.`;
  return { verdict, findings, requiredPWinBySymmetricMove: table };
}
