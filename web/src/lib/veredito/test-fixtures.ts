/**
 * The Veredito exactly as the core emits it (hand written from the output of `composeVerdict` for the clear buy of the core's
 * tests), so the screen's tests do not depend on the core's code. `src/verdict/contract.test.ts` in the core feeds the real output
 * of the composer through this parser, which is what keeps the two shapes from drifting. origin: synthetic_fixture, tests only.
 */
import type { Plano, Veredito } from "./types";

export const PLANO: Plano = {
  lado: "compra",
  entradaBaixo: 98.5,
  entradaAlto: 99.5,
  entradaReferencia: 99.5,
  distanciaAteEntradaBps: 50,
  invalidacao: 98,
  alvo: 103,
  alvoTipo: "zona_oposta",
  riscoBps: 150.8,
  alvoBps: 351.8,
  custoBps: 24,
  ganhoRiscoLiquido: 1.88,
  tamanho: { riscoUsd: 10, notionalUsd: 572.23, quantidadeBase: 5.75109271, limitadoPeloCapital: false },
};

export const COMPRAR: Veredito = {
  selo: "comprar",
  confianca: "alta",
  forcadoPor: null,
  mensagem: "Inonu decidiu comprar perto de 99,50.",
  motivos: [
    "A tendencia de 1 hora e de 4 horas e de alta.",
    "Vendas agressivas foram absorvidas: o preco nao caiu apesar delas.",
    "Ha uma zona de demanda logo abaixo do preco (forca 62).",
  ],
  risco: "Contra: a estrutura de 15 minutos virou para baixo ha 2 velas.",
  plano: PLANO,
  notaZona: 62,
  avisos: ["A faixa de entrada fica a 0,50% do preco: a ideia so comeca se o preco chegar la.", "O acerto destas respostas ainda nao foi medido."],
  consultivo: "Nenhuma ordem foi enviada. O plano e calculo sobre o risco que voce escolheu, nao previsao.",
};

export const ESPERAR_PELO_CUSTO: Veredito = {
  selo: "esperar",
  confianca: null,
  forcadoPor: "custo",
  mensagem: "O custo de entrar e sair come mais do que o movimento tipico de 1 hora. Esperar.",
  motivos: [],
  risco: null,
  plano: null,
  notaZona: null,
  avisos: [],
  consultivo: COMPRAR.consultivo,
};

export const SEM_TAMANHO: Veredito = { ...COMPRAR, plano: { ...PLANO, tamanho: null } };
