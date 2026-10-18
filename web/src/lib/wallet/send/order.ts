/**
 * An order the person is about to confirm, and the check of what the provider gave for it against what the person asked (WAL-10, EXE-3, EXE-4, EXE-12). The provider is trusted for prices and routes, and it is not
 * trusted to say which transaction the wallet should sign: the transaction is compared to the order field by field, and anything that is not exactly an exchange of the two tokens, for the amount asked, from the
 * person's own account, sent to a router the person trusts on that network, is refused before the wallet is ever asked.
 *
 * Three things the provider cannot make true by saying so: the decimals (the order's own come from the registry or from the token, and the provider's must equal them), the dollars of the order (they come from the
 * dollar coin of the order, whose price is one, never from a price the provider names for the other token), and the address the swap is sent to and the address the approval is given to (they must be in the list the
 * person trusts for that network, so a transaction to a third contract with the calldata of a transfer is stopped even when every number around it is consistent).
 *
 * Pure: no clock, no network, no storage, no wallet.
 */

/** The address the aggregator uses for the native coin of an EVM network. */
export const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** `approve(address,uint256)`. */
export const APPROVE_SELECTOR = "0x095ea7b3";
/** `allowance(address,address)`. */
export const ALLOWANCE_SELECTOR = "0xdd62ed3e";

/**
 * Functions of a token or of an NFT that a SWAP never calls: moving the token to someone, giving someone the right to move it, minting, burning. A transaction whose calldata starts with one of them is stopped
 * even if it goes to a router the person trusts (defence in depth: the router list is the main defence, this is the second).
 */
const FORBIDDEN_SELECTORS: ReadonlySet<string> = new Set([
  "0xa9059cbb", // transfer(address,uint256)
  "0x23b872dd", // transferFrom(address,address,uint256)
  "0x095ea7b3", // approve(address,uint256)
  "0x39509351", // increaseAllowance(address,uint256)
  "0xa457c2d7", // decreaseAllowance(address,uint256)
  "0xa22cb465", // setApprovalForAll(address,bool)
  "0x42842e0e", // safeTransferFrom(address,address,uint256)
  "0xb88d4fde", // safeTransferFrom(address,address,uint256,bytes)
  "0xf242432a", // safeTransferFrom(address,address,uint256,uint256,bytes)
  "0x2eb2c2d6", // safeBatchTransferFrom(...)
  "0xd505accf", // permit(...)
  "0x40c10f19", // mint(address,uint256)
  "0xa0712d68", // mint(uint256)
  "0x42966c68", // burn(uint256)
  "0x9dc29fac", // burn(address,uint256)
]);

export interface OrderToken {
  readonly address: string;
  readonly symbol: string;
  readonly decimals: number;
}

export interface Order {
  /**
   * Which side of the order is the dollar coin: a purchase pays with one (`from`), a sale receives one (`to`). It is decided by the STRUCTURE of the order (the coin to pay or to receive is always one of the dollar
   * coins of the registry of the network), never by a symbol, because a symbol can come from the provider: a token that calls itself "USDC" is not a dollar.
   */
  readonly dollarSide: "from" | "to";
  readonly chainIndex: string;
  readonly chainIdHex: string;
  readonly side: "buy" | "sell";
  readonly from: OrderToken;
  readonly to: OrderToken;
  /** How much of `from` is given, in its smallest unit, as whole digits. */
  readonly amountMinor: string;
  /** The account of the person that signs, lower case. */
  readonly account: string;
  /** The slippage the person confirmed, in percent. */
  readonly slippagePct: number;
  readonly briefHash: string | null;
}

/** The swap as the gateway hands it over (`/onchain/swap`, routes/trade.ts). */
export interface SwapAnswer {
  readonly chainIndex: string | null;
  readonly family: "evm" | "solana";
  readonly tx: {
    readonly from: string | null;
    readonly to: string | null;
    readonly data: string;
    readonly value: string;
    readonly gas: string | null;
    readonly gasPrice: string | null;
    readonly maxPriorityFeePerGas: string | null;
    readonly minReceiveAmount: string | null;
    readonly slippagePercent: number | null;
  };
  readonly route: {
    readonly fromAmount: string;
    readonly toAmount: string;
    readonly priceImpactPct: number | null;
    readonly tradeFee: number | null;
    readonly estimateGasFee: number | null;
    readonly dexNames: readonly string[];
    readonly fromToken: RouteToken;
    readonly toToken: RouteToken;
  };
}

export interface RouteToken {
  readonly address: string | null;
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly unitPriceUsd: number | null;
  readonly taxRate: number | null;
  readonly isHoneyPot: boolean | null;
}

/** The approval as the gateway hands it over (`/onchain/approve`). */
export interface ApproveAnswer {
  readonly data: string;
  readonly spender: string;
  readonly gasLimit: string | null;
  readonly gasPrice: string | null;
}

/** What the person trusts on the network of the order: the routers a swap may go to and the addresses an approval may be given to. Lower case. */
export interface Trust {
  readonly routers: readonly string[];
  readonly spenders: readonly string[];
}

export type SwapProblem =
  | "rede"
  | "valor"
  | "token_de_origem"
  | "token_de_destino"
  | "casas_decimais"
  | "conta"
  | "destino_da_transacao"
  | "roteador_novo"
  | "funcao_proibida"
  | "valor_nativo"
  | "minimo_incoerente"
  | "slippage_diferente"
  | "familia";

export const SWAP_PROBLEM_TEXT: Readonly<Record<SwapProblem, string>> = {
  rede: "A resposta do provedor e de outra rede",
  valor: "O valor da troca nao e o que voce pediu",
  token_de_origem: "O token que sai nao e o que voce pediu",
  token_de_destino: "O token que entra nao e o que voce pediu",
  casas_decimais: "As casas decimais que o provedor informou nao sao as do token",
  conta: "A transacao e de outra conta, nao da sua carteira",
  destino_da_transacao: "A transacao vai para um endereco que nao e um roteador de troca",
  roteador_novo: "O roteador desta transacao ainda nao foi confirmado por voce nesta rede",
  funcao_proibida: "A transacao chama uma funcao de mover ou liberar token, que uma troca nao chama",
  valor_nativo: "A moeda da rede enviada com a transacao nao bate com o valor da troca",
  minimo_incoerente: "O minimo recebido fica longe do que a cotacao promete",
  slippage_diferente: "A tolerancia de preco da transacao nao e a que voce confirmou",
  familia: "A transacao nao e do tipo que esta carteira envia",
};

const lower = (s: string | null): string | null => (s === null ? null : s.toLowerCase());
const big = (s: string): bigint => BigInt(s);

/** The first four bytes of the calldata, as `0x` and eight hex digits; null when it is not calldata. */
export function selectorOf(data: string): string | null {
  return /^0x[0-9a-fA-F]{8}/.test(data) ? data.slice(0, 10).toLowerCase() : null;
}

/** What is wrong with the swap the provider gave for this order; an empty list means it is exactly an exchange of the two tokens, for the amount, from the person's account, to a router the person trusts. */
export function verifySwap(order: Order, swap: SwapAnswer, trust: Trust): SwapProblem[] {
  const problems: SwapProblem[] = [];
  if (swap.family !== "evm") problems.push("familia");
  if (swap.chainIndex !== order.chainIndex) problems.push("rede");
  if (swap.route.fromAmount !== order.amountMinor) problems.push("valor");
  if (lower(swap.route.fromToken.address) !== order.from.address.toLowerCase()) problems.push("token_de_origem");
  if (lower(swap.route.toToken.address) !== order.to.address.toLowerCase()) problems.push("token_de_destino");
  // the decimals are the order's own (the registry's, or read from the token): the provider's must be the same, or the dollars and the amounts shown would be the provider's invention
  if (swap.route.fromToken.decimals !== order.from.decimals || swap.route.toToken.decimals !== order.to.decimals) problems.push("casas_decimais");
  // the transaction names its account, and it is the one that signs; one that names none is read as the person's own
  if (swap.tx.from !== null && swap.tx.from.toLowerCase() !== order.account.toLowerCase()) problems.push("conta");

  const to = lower(swap.tx.to);
  const fromAddress = order.from.address.toLowerCase();
  const toAddress = order.to.address.toLowerCase();
  // a swap goes to a router. One that goes to the person's own account, to the zero address or straight to either token is a transfer or a trap, whatever the calldata says
  if (to === null || !EVM_ADDRESS.test(to) || to === order.account.toLowerCase() || to === ZERO_ADDRESS || to === fromAddress || to === toAddress) problems.push("destino_da_transacao");
  // and to a router the person said is right for this network: any other contract could be holding a different token and doing something else with the same numbers around it
  else if (!trust.routers.map((r) => r.toLowerCase()).includes(to)) problems.push("roteador_novo");

  const selector = selectorOf(swap.tx.data);
  if (selector === null || FORBIDDEN_SELECTORS.has(selector)) problems.push("funcao_proibida");

  // the coin of the network travels with the transaction only when it is the coin being given, and then it is exactly the amount
  const native = fromAddress === NATIVE_TOKEN;
  if (!/^\d{1,78}$/.test(swap.tx.value) || swap.tx.value !== (native ? order.amountMinor : "0")) problems.push("valor_nativo");

  // the minimum received cannot be zero or far under what the quote promises, whatever the slippage says: a transaction that accepts almost nothing is a sandwich waiting to happen
  const min = swap.tx.minReceiveAmount;
  // an amount that is not whole digits is a problem, never an exception: the gate must be able to say why, whatever the provider sent
  if (min === null || !/^\d{1,78}$/.test(min) || !/^\d{1,78}$/.test(swap.route.toAmount) || big(min) <= BigInt(0)) problems.push("minimo_incoerente");
  else {
    const promised = big(swap.route.toAmount);
    const floorPct = BigInt(Math.max(0, Math.floor((100 - (order.slippagePct + 1)) * 100)));
    if (big(min) > promised || big(min) * BigInt(10_000) < promised * floorPct) problems.push("minimo_incoerente");
  }
  if (swap.tx.slippagePercent === null || Math.abs(swap.tx.slippagePercent - order.slippagePct) > 0.0001) problems.push("slippage_diferente");
  return problems;
}

export type ApprovalProblem = "aprovacao_formato" | "aprovacao_seletor" | "aprovacao_gastador" | "gastador_novo" | "aprovacao_valor" | "aprovacao_moeda_da_rede";

export const APPROVAL_PROBLEM_TEXT: Readonly<Record<ApprovalProblem, string>> = {
  aprovacao_formato: "A aprovacao nao tem o formato de uma aprovacao de token",
  aprovacao_seletor: "A aprovacao nao chama a funcao de aprovar",
  aprovacao_gastador: "A aprovacao libera um endereco diferente do roteador informado",
  gastador_novo: "O endereco que receberia a aprovacao ainda nao foi confirmado por voce nesta rede",
  aprovacao_valor: "A aprovacao libera mais ou menos do que o valor da troca",
  aprovacao_moeda_da_rede: "A moeda da rede nao precisa de aprovacao",
};

/** The two words of an `approve(spender, amount)` call: the address and the amount, or null when the calldata is anything else. Exactly one call, exactly two words. */
export function decodeApprove(data: string): { readonly spender: string; readonly amount: bigint } | null {
  if (!/^0x[0-9a-fA-F]+$/.test(data) || data.length !== 10 + 128) return null;
  if (data.slice(0, 10).toLowerCase() !== APPROVE_SELECTOR) return null;
  const spenderWord = data.slice(10, 74);
  const amountWord = data.slice(74);
  // an address is the last twenty bytes of its word, the first twelve are zero
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(spenderWord)) return null;
  return { spender: `0x${spenderWord.slice(24)}`.toLowerCase(), amount: BigInt(`0x${amountWord}`) };
}

/** What is wrong with the approval the provider gave for this order: it must approve exactly the address it named, an address the person trusts, for exactly the amount of the order, and never "unlimited". */
export function verifyApproval(order: Order, approval: ApproveAnswer, trust: Trust): ApprovalProblem[] {
  if (order.from.address.toLowerCase() === NATIVE_TOKEN) return ["aprovacao_moeda_da_rede"];
  const decoded = decodeApprove(approval.data);
  if (decoded === null) return [/^0x095ea7b3/i.test(approval.data) ? "aprovacao_formato" : "aprovacao_seletor"];
  const problems: ApprovalProblem[] = [];
  if (decoded.spender !== approval.spender.toLowerCase()) problems.push("aprovacao_gastador");
  else if (!trust.spenders.map((s) => s.toLowerCase()).includes(decoded.spender)) problems.push("gastador_novo");
  if (decoded.amount !== big(order.amountMinor)) problems.push("aprovacao_valor");
  return problems;
}

/** The calldata of `allowance(owner, spender)`, to ask the token how much the router may already spend. */
export function allowanceCall(owner: string, spender: string): string | null {
  if (!EVM_ADDRESS.test(owner) || !EVM_ADDRESS.test(spender)) return null;
  return `${ALLOWANCE_SELECTOR}${owner.slice(2).toLowerCase().padStart(64, "0")}${spender.slice(2).toLowerCase().padStart(64, "0")}`;
}

const units = (minor: string, decimals: number): number => Number(big(minor)) / 10 ** decimals;

/**
 * What an order is worth in dollars, or null when it cannot be worked out. The dollar coin of the order is worth one dollar, so a purchase is worth exactly what it pays and a sale is worth what it is expected to
 * receive; for a sale the price the provider gives for the token is taken too, and the LARGER of the two counts (a provider that understates one side cannot lower the value of the order under a cap). An order
 * The dollar coin is the one the order says it is (`dollarSide`), never one that a symbol says.
 */
export function orderUsd(order: Order, swap: SwapAnswer): number | null {
  if (!/^\d{1,78}$/.test(swap.route.fromAmount) || !/^\d{1,78}$/.test(swap.route.toAmount)) return null;
  if (order.dollarSide === "from") {
    const usd = units(swap.route.fromAmount, order.from.decimals);
    return Number.isFinite(usd) ? usd : null;
  }
  const received = units(swap.route.toAmount, order.to.decimals);
  const price = swap.route.fromToken.unitPriceUsd;
  const byToken = price !== null && price > 0 ? units(swap.route.fromAmount, order.from.decimals) * price : 0;
  const usd = Math.max(received, byToken);
  return Number.isFinite(usd) ? usd : null;
}

/**
 * The price impact the numbers of the route imply, in percent (the share of the dollars given that does not come back), or null when it cannot be worked out. It is what the provider's own prices and amounts add up
 * to: a claimed impact far from it is an inconsistency, and one that is over the limit is a reason against the order.
 */
export function impliedImpactPct(order: Order, swap: SwapAnswer): number | null {
  if (!/^\d{1,78}$/.test(swap.route.fromAmount) || !/^\d{1,78}$/.test(swap.route.toAmount)) return null;
  const fromPrice = order.dollarSide === "from" ? 1 : swap.route.fromToken.unitPriceUsd;
  const toPrice = order.dollarSide === "to" ? 1 : swap.route.toToken.unitPriceUsd;
  if (fromPrice === null || toPrice === null || fromPrice <= 0 || toPrice <= 0) return null;
  const given = units(swap.route.fromAmount, order.from.decimals) * fromPrice;
  const got = units(swap.route.toAmount, order.to.decimals) * toPrice;
  if (!Number.isFinite(given) || !Number.isFinite(got) || given <= 0) return null;
  return ((given - got) / given) * 100;
}

/** An amount in the smallest unit as a plain decimal text for the person to read, exact and without exponent: "250.5" for 250500000000000000000 with 18 decimals; a tiny amount says so instead of showing zero. */
export function formatMinor(minor: string, decimals: number, maxFraction = 8): string {
  if (!/^\d{1,78}$/.test(minor) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return "-";
  const digits = minor.padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? "" : digits.slice(digits.length - decimals).slice(0, maxFraction).replace(/0+$/, "");
  if (whole === "0" && fraction === "" && /[1-9]/.test(minor)) return `menos de 0.${"0".repeat(Math.max(0, maxFraction - 1))}1`;
  return fraction === "" ? whole : `${whole}.${fraction}`;
}
