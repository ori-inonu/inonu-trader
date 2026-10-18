/**
 * The composition of the Veredito (INT-1.3, VER-1 to VER-6). Pure.
 *
 * What it does:
 *   1. takes the ACTION from the model's answer (buy, sell, hold) and mirrors it; it never derives an action from a score, a zone
 *      or a reason (VER-2). The only thing it may do on its own is turn the answer into "esperar", through a gate;
 *   2. runs the gates in a fixed order, and the first that fires says so with its own message (VER-3);
 *   3. when the answer stands, builds the plan (VER-4) and the reasons (VER-5) from measured numbers.
 *
 * The confidence is only a word for how consistent the model's own answers were (the concentration of its probabilities, the
 * formula of the TypeSafe documentation); it is NOT a chance of winning and the card does not say it is (VER-6).
 */
import type { FeatureVector } from "../intel/features/types";
import { prosFor, riskSentence, whyWait, type Side } from "./reasons";
import { riskPlan } from "./risk-plan";
import { CONSULTIVO, type Confianca, type GateId, type RiskPlan, type RiskProfile, type Selo, type TargetCandidate, type Verdict } from "./types";

/** Priors of the gates. Nothing measured says these are the right values; the Placar is what will. */
export const GATE_PRIORS = Object.freeze({
  /** Below this concentration of the model's probabilities the model was divided. */
  minConsistency: 0.3,
  /** The usual hourly move over the round trip cost: under it, the cost eats the move. */
  minMoveToCost: 1,
  /** The flow older than this is not the flow now. */
  maxFlowAgeMs: 120_000,
  /** A token whose risk level is at or above this is not offered at all. */
  maxTokenRiskLevel: 4,
});

export const GATE_MESSAGES: Readonly<Record<GateId, string>> = {
  sem_chave: "Falta a chave do modelo em Configuracoes. Nada foi consultado.",
  modelo_falhou: "O modelo nao respondeu. Esperar e o resultado seguro.",
  risco_alto: "O risco deste ativo e alto demais para sugerir qualquer entrada. Esperar.",
  aquecimento: "O fluxo ainda esta aquecendo e as zonas sao pouco confiaveis. Esperar.",
  dado_velho: "Os dados estao velhos demais para decidir. Esperar.",
  ordem_discorda: "O modelo mudou de resposta quando as opcoes mudaram de ordem. Esperar.",
  confianca_baixa: "O modelo ficou dividido entre as opcoes. Esperar.",
  custo: "O custo de entrar e sair come mais do que o movimento tipico de 1 hora. Esperar.",
};

export interface VerdictInput {
  /** The model's answer; null when it did not answer. */
  readonly action: "buy" | "sell" | "hold" | null;
  /** How the request ended when the model did not answer. */
  readonly failure?: "sem_chave" | "modelo_falhou" | null;
  readonly market: "spot" | "perp" | "token";
  readonly price: number | null;
  /** The model's own consistency, from 0 (divided) to 1 (sure), and whether two orderings of the options agreed; null when not known. */
  readonly jev?: { readonly consistency: number | null; readonly orderingsAgree: boolean | null } | null;
  readonly features: FeatureVector | null;
  /** The zone the answer is anchored on, when the model chose one. */
  readonly zone?: { readonly baixo: number; readonly alto: number; readonly invalidacao: number | null; readonly nota: number } | null;
  readonly atr15m: number | null;
  readonly costRoundTripBps: number | null;
  readonly targets: readonly TargetCandidate[];
  readonly profile: RiskProfile | null;
  /** Risk of an on-chain token: a honeypot flag or a level from 0 to 5. */
  readonly tokenRisk?: { readonly honeypot: boolean | null; readonly level: number | null } | null;
  /** Whether the Placar has a number yet. */
  readonly placarMedido: boolean;
}

const px = (n: number): string => {
  const digits = n >= 1000 ? 1 : n >= 10 ? 2 : n >= 1 ? 3 : 5;
  return n.toFixed(digits).replace(".", ",");
};

/** Basis points as a share of the price in words a person reads: 50 bps is "0,50%". */
const pctText = (bps: number): string => `${(Math.max(0, bps) / 100).toFixed(2).replace(".", ",")}%`;

export function confidenceWord(consistency: number | null): Confianca | null {
  if (consistency === null || !Number.isFinite(consistency)) return null;
  return consistency < 0.4 ? "baixa" : consistency < 0.7 ? "media" : "alta";
}

function gateOf(input: VerdictInput): GateId | null {
  if (input.action === null) return input.failure === "sem_chave" ? "sem_chave" : "modelo_falhou";
  const risk = input.tokenRisk;
  if (risk !== undefined && risk !== null && (risk.honeypot === true || (risk.level !== null && risk.level >= GATE_PRIORS.maxTokenRiskLevel))) return "risco_alto";
  if (input.action === "hold") return null; // nothing to force: it already waits
  const v = input.features;
  if (v !== null) {
    if (v.values["flow.warm"] === 0) return "aquecimento";
    const flowAge = v.idades.flow;
    if (v.nulos.bars15m === "velas_velhas" || (flowAge !== undefined && flowAge > GATE_PRIORS.maxFlowAgeMs)) return "dado_velho";
  }
  if (input.jev?.orderingsAgree === false) return "ordem_discorda";
  if (input.jev?.consistency !== undefined && input.jev.consistency !== null && input.jev.consistency < GATE_PRIORS.minConsistency) return "confianca_baixa";
  const move = v?.values["cost.moveToCost1h"];
  if (move !== undefined && move !== null && move < GATE_PRIORS.minMoveToCost) return "custo";
  return null;
}

function waiting(input: VerdictInput, gate: GateId | null, extra: Partial<Verdict> = {}): Verdict {
  const values = input.features?.values ?? {};
  const held = gate === null;
  return {
    selo: "esperar",
    confianca: confidenceWord(input.jev?.consistency ?? null),
    forcadoPor: gate,
    mensagem: held ? "Inonu decidiu esperar." : GATE_MESSAGES[gate],
    motivos: held ? [whyWait(values)] : [],
    risco: null,
    plano: null,
    notaZona: null,
    avisos: [],
    consultivo: CONSULTIVO,
    ...extra,
  };
}

export function composeVerdict(input: VerdictInput): Verdict {
  const gate = gateOf(input);
  if (gate !== null || input.action === "hold" || input.action === null) return waiting(input, gate);

  const side: Side = input.action === "buy" ? "compra" : "venda";
  const selo: Selo = input.action === "buy" ? "comprar" : "vender";
  const values = input.features?.values ?? {};
  const avisos: string[] = [];

  let plano: RiskPlan | null = null;
  if (input.market === "token") avisos.push("Para tokens on-chain ainda nao ha plano de risco.");
  else if (input.price === null) avisos.push("Sem preco, nao ha plano de risco.");
  else {
    const result = riskPlan({ side, price: input.price, zone: input.zone ?? null, atr15m: input.atr15m, costRoundTripBps: input.costRoundTripBps, targets: input.targets, profile: input.profile });
    if (result.ok) plano = result.plan;
    else if (result.reason === "ja_invalidada") return waiting(input, null, { mensagem: "O preco ja passou do ponto em que a ideia cai. Esperar.", motivos: [] });
    else avisos.push("Faltam dados para calcular o plano de risco.");
  }

  if (plano !== null) {
    if (plano.distanciaAteEntradaBps > 0) avisos.push(`A faixa de entrada fica a ${pctText(plano.distanciaAteEntradaBps)} do preco: a ideia so comeca se o preco chegar la.`);
    if (plano.ganhoRiscoLiquido === null || plano.ganhoRiscoLiquido < 1) avisos.push("Depois dos custos, o ganho estimado e menor que o risco.");
    if (plano.tamanho === null) avisos.push("Informe seu capital e quanto aceita perder em Configuracoes para ver o tamanho.");
    else if (plano.tamanho.limitadoPeloCapital) avisos.push("O tamanho foi limitado ao seu capital: nao ha alavancagem aqui.");
  }
  if (input.market === "spot" && side === "venda") avisos.push("No spot, vender so vale se voce ja tem o ativo.");
  if (!input.placarMedido) avisos.push("O acerto destas respostas ainda nao foi medido.");

  return {
    selo,
    confianca: confidenceWord(input.jev?.consistency ?? null),
    forcadoPor: null,
    mensagem: plano === null ? `Inonu decidiu ${selo}.` : `Inonu decidiu ${selo}${plano.distanciaAteEntradaBps > 0 ? ` perto de ${px(plano.entradaReferencia)}` : ""}.`,
    motivos: prosFor(values, side).map((r) => r.text),
    risco: riskSentence(values, side),
    plano,
    notaZona: input.zone === null || input.zone === undefined ? null : Math.round(input.zone.nota),
    avisos,
    consultivo: CONSULTIVO,
  };
}
