/**
 * The Veredito as the desk receives it (VER-1): the shape of `veredito` in the answer of `/inonu/ask`, mirrored from the core
 * (`src/verdict/types.ts`). The action is the model's; the rest is arithmetic and a fixed dictionary over measured numbers. The
 * web build cannot import from `src/`, so the shape lives here too and the parser below refuses anything that is not exactly it.
 */
export type Selo = "comprar" | "vender" | "esperar";
export type Confianca = "baixa" | "media" | "alta";
export type TargetKind = "zona_oposta" | "piscina" | "perfil" | "multiplo";

export const GATES = ["sem_chave", "modelo_falhou", "risco_alto", "aquecimento", "dado_velho", "ordem_discorda", "confianca_baixa", "custo"] as const;
export type GateId = (typeof GATES)[number];

export interface Plano {
  readonly lado: "compra" | "venda";
  readonly entradaBaixo: number;
  readonly entradaAlto: number;
  readonly entradaReferencia: number;
  readonly distanciaAteEntradaBps: number;
  readonly invalidacao: number;
  readonly alvo: number;
  readonly alvoTipo: TargetKind;
  readonly riscoBps: number;
  readonly alvoBps: number;
  readonly custoBps: number;
  readonly ganhoRiscoLiquido: number | null;
  readonly tamanho: { readonly riscoUsd: number; readonly notionalUsd: number; readonly quantidadeBase: number; readonly limitadoPeloCapital: boolean } | null;
}

export interface Veredito {
  readonly selo: Selo;
  readonly confianca: Confianca | null;
  readonly forcadoPor: GateId | null;
  readonly mensagem: string;
  readonly motivos: readonly string[];
  readonly risco: string | null;
  readonly plano: Plano | null;
  readonly notaZona: number | null;
  readonly avisos: readonly string[];
  readonly consultivo: string;
}

/** What the person chose to risk; both null until they say. */
export interface Perfil {
  readonly capitalUsd: number | null;
  readonly riskPct: number | null;
}
