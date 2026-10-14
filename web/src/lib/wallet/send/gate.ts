/**
 * The gate every order passes before the wallet is asked to sign it (WAL-10, EXE-1 to EXE-6, EXE-8, EXE-12): the person's own settings (on, not stopped, a cap per order and a cap per day), the order against those
 * caps, the freshness of what the provider gave, the safety of the token (not a honeypot, a tax inside the limit), the impact inside the limit and consistent with the prices, the account and the network of the wallet
 * equal to the order, the transaction equal to the order and sent to a router the person trusts, the log able to keep the attempt, and the confirmation the person typed. It returns EVERY reason that blocks, so the
 * screen can say all of them at once, and it returns permission to send only when there is none.
 *
 * The permission is a value this module alone can make (`Cleared`): the module that talks to the wallet refuses anything else, so a screen cannot send by building the call itself. The caps, the opt-in and the
 * stop are a function of their own (`limitBlocks`) so that the module that talks to the wallet can ask them again, with fresh values, at the last moment before the request.
 *
 * Pure: the clock comes in as an argument; no network, no storage, no wallet.
 */
import { fmtNumber } from "../../desk/ui/format";
import type { TradeSettings } from "./settings";
import { APPROVAL_PROBLEM_TEXT, SWAP_PROBLEM_TEXT, impliedImpactPct, orderUsd, verifyApproval, verifySwap, type ApproveAnswer, type Order, type SwapAnswer, type Trust } from "./order";

/** A quote and its calldata are good for this long: after it the price may have moved and the transaction may no longer match (EXE-3). */
export const QUOTE_MAX_AGE_MS = 30_000;
/** The impact the provider names and the one its own numbers imply may differ by this much (percentage points) before the answer is called inconsistent. */
const IMPACT_TOLERANCE_PTS = 2;

export type BlockCode =
  | "desligado"
  | "parado"
  | "sem_teto"
  | "sem_teto_diario"
  | "valor_desconhecido"
  | "acima_do_teto"
  | "acima_do_dia"
  | "sem_registro"
  | "carteira_desconectada"
  | "conta_diferente"
  | "rede_diferente"
  | "sem_cotacao"
  | "cotacao_velha"
  | "impacto_desconhecido"
  | "impacto_alto"
  | "preco_incoerente"
  | "honeypot"
  | "honeypot_desconhecido"
  | "taxa_desconhecida"
  | "taxa_alta"
  | "transacao"
  | "roteador_novo"
  | "aprovacao"
  | "gastador_novo"
  | "confirmacao";

export interface Block {
  readonly code: BlockCode;
  readonly text: string;
}

/** A name from the provider, as it is put in a sentence: no control character, no direction mark, no zero width character, and not long. */
const nameOf = (text: string | null): string => (text === null ? "token" : text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").slice(0, 20) || "token");

const pct = (v: number): string => String(v).replace(".", ",");
const usd = (v: number): string => `US$ ${fmtNumber(v, 2)}`;

/** The routers and the approval addresses the person trusts on the network of an order. */
export function trustOf(settings: TradeSettings, chainIndex: string): Trust {
  return { routers: settings.trustedRouters[chainIndex] ?? [], spenders: settings.trustedSpenders[chainIndex] ?? [] };
}

/**
 * The part of the gate that depends only on what the person allowed and on what has been spent: on, not stopped, both caps set, the order under both. It is asked at the click, and asked again, with values read
 * again, by the module that talks to the wallet, right before the request. `value` null means the order's dollars are unknown, and that is a reason too.
 */
export function limitBlocks(settings: TradeSettings, value: number | null, spentLast24hUsd: number): Block[] {
  const blocks: Block[] = [];
  const block = (code: BlockCode, text: string): void => void blocks.push({ code, text });
  if (!settings.enabled) block("desligado", "O envio pela carteira esta desligado. Ligue em Configuracoes");
  if (settings.killed) block("parado", "O envio esta parado. Ele so volta quando voce ligar de novo em Configuracoes");
  if (settings.perOperationUsd === null) block("sem_teto", "Defina em Configuracoes o teto de uma ordem em dolares");
  if (settings.dailyUsd === null) block("sem_teto_diario", "Defina em Configuracoes o teto de ordens por dia em dolares");
  if (value === null) block("valor_desconhecido", "O valor da ordem em dolares nao pode ser calculado");
  else {
    if (settings.perOperationUsd !== null && value > settings.perOperationUsd) block("acima_do_teto", `A ordem vale ${usd(value)}, acima do seu teto de ${usd(settings.perOperationUsd)} por ordem`);
    if (settings.dailyUsd !== null && spentLast24hUsd + value > settings.dailyUsd) block("acima_do_dia", `Com esta ordem as de 24 horas somam ${usd(spentLast24hUsd + value)}, acima do seu teto de ${usd(settings.dailyUsd)} por dia`);
  }
  return blocks;
}

export interface GateInput {
  readonly settings: TradeSettings;
  readonly nowMs: number;
  /** What the swaps of the last 24 hours add up to, from the log. */
  readonly spentLast24hUsd: number;
  /** Whether the log can keep the attempt across a reload: without it the daily cap forgets. */
  readonly logDurable: boolean;
  readonly order: Order;
  readonly step: "approve" | "swap";
  /** What the provider gave for the swap, and when this page got it; null before the person asked to review. */
  readonly swap: SwapAnswer | null;
  readonly swapFetchedAtMs: number | null;
  /** The approval, for the approve step. */
  readonly approval: ApproveAnswer | null;
  /** What the wallet says it is now: the account and the network, as the wallet reported them. */
  readonly wallet: { readonly account: string | null; readonly chainIdHex: string | null };
  /** What the person typed to confirm. */
  readonly typed: string;
}

declare const clearedBrand: unique symbol;

/** Permission to send ONE step of ONE order. Only `evaluateGate` makes one; the wallet module checks it with `isCleared`. */
export interface Cleared {
  readonly [clearedBrand]: true;
  readonly step: "approve" | "swap";
  readonly order: Order;
  readonly swap: SwapAnswer;
  readonly approval: ApproveAnswer | null;
  /** What the order is worth, in dollars. */
  readonly usd: number;
  readonly issuedAtMs: number;
  /** When the provider's answer for this order came back: the module that sends checks the age of the QUOTE again, right before the wallet is asked. */
  readonly fetchedAtMs: number;
}

const issued = new WeakSet<object>();

export function isCleared(value: unknown): value is Cleared {
  return typeof value === "object" && value !== null && issued.has(value);
}

export type GateResult = { readonly ok: true; readonly cleared: Cleared } | { readonly ok: false; readonly blocks: readonly Block[] };

/** The symbol the person types: the token that is traded for the money, whichever side the order is on. */
export function confirmationWord(order: Order): string {
  return order.side === "buy" ? order.to.symbol : order.from.symbol;
}

export function evaluateGate(input: GateInput): GateResult {
  const { settings, order, swap } = input;
  const blocks: Block[] = [];
  const block = (code: BlockCode, text: string): void => void blocks.push({ code, text });

  const value = swap === null ? null : orderUsd(order, swap);
  // before the review there is no order value yet: the caps are then not asked, only what is known without it
  blocks.push(...limitBlocks(settings, value, input.spentLast24hUsd).filter((b) => swap !== null || b.code !== "valor_desconhecido"));
  if (!input.logDurable) block("sem_registro", "Este navegador nao guarda o registro local das ordens, e sem ele o teto do dia nao se sustenta. Nada sera enviado");

  if (input.wallet.account === null || input.wallet.chainIdHex === null) block("carteira_desconectada", "A carteira esta desconectada. Conecte e tente de novo");
  else {
    if (input.wallet.account.toLowerCase() !== order.account.toLowerCase()) block("conta_diferente", "A conta da carteira mudou desde que a ordem foi montada. Monte a ordem de novo");
    if (input.wallet.chainIdHex.toLowerCase() !== order.chainIdHex.toLowerCase()) block("rede_diferente", "A carteira esta em outra rede. Troque a rede na carteira e tente de novo");
  }

  if (swap === null || input.swapFetchedAtMs === null) block("sem_cotacao", "Revise a ordem para buscar a transacao e a cotacao");
  else {
    if (input.nowMs - input.swapFetchedAtMs > QUOTE_MAX_AGE_MS) block("cotacao_velha", `A cotacao tem mais de ${QUOTE_MAX_AGE_MS / 1000} s. Revise de novo`);
    if (input.nowMs - input.swapFetchedAtMs < 0) block("cotacao_velha", "O relogio da pagina e a cotacao nao batem. Revise de novo");

    const claimed = swap.route.priceImpactPct;
    const implied = impliedImpactPct(order, swap);
    if (claimed === null) block("impacto_desconhecido", "O provedor nao informou o impacto no preco");
    else if (Math.abs(claimed) > settings.maxImpactPct) block("impacto_alto", `O impacto no preco e ${pct(claimed)}%, acima do seu limite de ${pct(settings.maxImpactPct)}%`);
    if (implied !== null && Math.abs(implied) > settings.maxImpactPct) block("impacto_alto", `As contas da propria rota dao um impacto de ${pct(Math.round(implied * 100) / 100)}%, acima do seu limite de ${pct(settings.maxImpactPct)}%`);
    // by size, not by sign: a provider may write a loss as a negative number and the route's own numbers as a positive one, and both mean the same impact
    if (claimed !== null && implied !== null && Math.abs(Math.abs(claimed) - Math.abs(implied)) > IMPACT_TOLERANCE_PTS) block("preco_incoerente", "O impacto que o provedor informa nao bate com os precos e as quantidades da rota. Nada sera enviado");
    if (implied === null) block("preco_incoerente", "O provedor nao deu o preco do token, entao o impacto nao pode ser conferido pelas contas da rota");

    for (const token of [swap.route.fromToken, swap.route.toToken]) {
      const name = nameOf(token.symbol);
      if (token.isHoneyPot === true) block("honeypot", `${name} esta marcado como honeypot: pode nao ser possivel sair dele`);
      else if (token.isHoneyPot === null) block("honeypot_desconhecido", `O provedor nao disse se ${name} e um honeypot`);
      if (token.taxRate === null) block("taxa_desconhecida", `O provedor nao informou a taxa de ${name}`);
      // the provider writes the tax as a fraction of the trade (0.01 is one percent)
      else if (token.taxRate * 100 > settings.maxTaxPct) block("taxa_alta", `${name} cobra ${pct(Math.round(token.taxRate * 10_000) / 100)}% por troca, acima do seu limite de ${pct(settings.maxTaxPct)}%`);
    }

    const trust = trustOf(settings, order.chainIndex);
    for (const problem of verifySwap(order, swap, trust)) {
      if (problem === "roteador_novo") block("roteador_novo", SWAP_PROBLEM_TEXT[problem]);
      else block("transacao", SWAP_PROBLEM_TEXT[problem]);
    }
    if (input.step === "approve") {
      if (input.approval === null) block("aprovacao", "Falta a aprovacao do token para o roteador");
      else {
        for (const problem of verifyApproval(order, input.approval, trust)) {
          if (problem === "gastador_novo") block("gastador_novo", APPROVAL_PROBLEM_TEXT[problem]);
          else block("aprovacao", APPROVAL_PROBLEM_TEXT[problem]);
        }
      }
    }
  }

  const word = confirmationWord(order);
  if (input.typed.trim().toUpperCase() !== word.toUpperCase() || word.length === 0) block("confirmacao", `Digite ${word} para confirmar`);

  // an order whose value could not be worked out never gets here with a number; the type below needs one
  if (blocks.length > 0 || swap === null || value === null) return { ok: false, blocks };

  const cleared = Object.freeze({ step: input.step, order, swap, approval: input.step === "approve" ? input.approval : null, usd: value, issuedAtMs: input.nowMs, fetchedAtMs: input.swapFetchedAtMs! }) as unknown as Cleared;
  issued.add(cleared);
  return { ok: true, cleared };
}
