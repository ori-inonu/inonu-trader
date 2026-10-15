/**
 * The Veredito (INT-1.x, VER-1 to VER-6): what the person sees after "Pedir ao Inonu". The ACTION is the model's: the code only
 * mirrors it (comprar, vender, esperar) and may force "esperar", never the other way. Everything else (the plan, the reasons, the
 * words) is arithmetic and a fixed dictionary over measured numbers. Pure shapes; text is plain ASCII, no dash, no middle dot.
 */
export type Selo = "comprar" | "vender" | "esperar";
export type Confianca = "baixa" | "media" | "alta";

/** The gates that force "esperar". Each one has its own message (VER-3). */
export const GATES = ["sem_chave", "modelo_falhou", "risco_alto", "aquecimento", "dado_velho", "ordem_discorda", "confianca_baixa", "custo"] as const;
export type GateId = (typeof GATES)[number];

/** What the person chose to risk; both null until they say. */
export interface RiskProfile {
  readonly capitalUsd: number | null;
  /** Percent of the capital to lose if the idea fails, for one operation (0.5 means half of one percent). */
  readonly riskPct: number | null;
}

export type TargetKind = "zona_oposta" | "piscina" | "perfil" | "multiplo";

export interface TargetCandidate {
  readonly preco: number;
  readonly tipo: Exclude<TargetKind, "multiplo">;
}

export interface RiskPlan {
  readonly lado: "compra" | "venda";
  /** The band where the idea is meant to start: the limits of the zone, or the price now when there is no zone. */
  readonly entradaBaixo: number;
  readonly entradaAlto: number;
  /** The entry the numbers below are measured from: the price now when it is inside the band, else the nearest edge of the band. */
  readonly entradaReferencia: number;
  /** Distance from the price now to the entry reference, in bps; zero when the price is already inside the band. */
  readonly distanciaAteEntradaBps: number;
  /** The price at which the idea no longer holds. */
  readonly invalidacao: number;
  readonly alvo: number;
  readonly alvoTipo: TargetKind;
  readonly riscoBps: number;
  readonly alvoBps: number;
  /** Fees, slippage and the quoted spread for entering and leaving, in bps. */
  readonly custoBps: number;
  /** Net reward over net risk: (target minus cost) over (risk plus cost). Null when the target does not even pay the cost. */
  readonly ganhoRiscoLiquido: number | null;
  /** Null without a risk profile. */
  readonly tamanho: { readonly riscoUsd: number; readonly notionalUsd: number; readonly quantidadeBase: number; readonly limitadoPeloCapital: boolean } | null;
}

export interface Verdict {
  readonly selo: Selo;
  /** How consistent the model's own answers were, in words; null when the answer carried no probability. Not a chance of winning. */
  readonly confianca: Confianca | null;
  /** Which gate forced "esperar", or null when the model's answer stands. */
  readonly forcadoPor: GateId | null;
  readonly mensagem: string;
  /** Up to three reasons in plain words, in favour of the seal. */
  readonly motivos: readonly string[];
  /** What can go wrong, in one sentence, or null. */
  readonly risco: string | null;
  readonly plano: RiskPlan | null;
  /** The strength of the zone the plan is anchored on, 0 to 100. Descriptive, not a probability. */
  readonly notaZona: number | null;
  /** Things the person should know about how far the numbers can be trusted. */
  readonly avisos: readonly string[];
  readonly consultivo: string;
}

export const CONSULTIVO = "Nenhuma ordem foi enviada. O plano e calculo sobre o risco que voce escolheu, nao previsao.";
