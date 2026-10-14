/**
 * The other side of an order (WAL-10, EXE-10): giving a token the wallet holds in exchange for a dollar coin of the same network. The amount is a fraction of what the wallet holds NOW, read from the token itself
 * (`balanceOf`) and computed in whole units, never from a price or a float: "all" is exactly the balance and can never be more. The token's own `decimals` is read the same way, because the amount in its smallest
 * unit cannot be worked out without it. Only a token with a plain contract can be given: the coin of the network is not (it pays the fee of the order, and spending all of it would leave none).
 *
 * Pure, but for the two reads of a provider that the caller hands in (a wallet extension that answers `eth_call`); nothing here sends or signs.
 */
import { EVM_CHAINS } from "../../evm-multichain";
import type { TicketDraft, TicketPlan } from "../ticket";
import { NATIVE_TOKEN } from "./order";
import type { SendProvider } from "./provider";

export const FRACTIONS = [
  { id: "terco", label: "Um terco", num: 1, den: 3 },
  { id: "metade", label: "Metade", num: 1, den: 2 },
  { id: "doisTercos", label: "Dois tercos", num: 2, den: 3 },
  { id: "tudo", label: "Tudo", num: 1, den: 1 },
] as const;
export type FractionId = (typeof FRACTIONS)[number]["id"];
export const DEFAULT_FRACTION: FractionId = "metade";

export const isFractionId = (v: unknown): v is FractionId => FRACTIONS.some((f) => f.id === v);

/** The part of the balance, rounded DOWN to a whole unit, as digits; null when it comes to nothing. */
export function fractionOf(balance: bigint, id: FractionId): string | null {
  const f = FRACTIONS.find((x) => x.id === id);
  if (f === undefined || balance <= BigInt(0)) return null;
  const part = (balance * BigInt(f.num)) / BigInt(f.den);
  return part > BigInt(0) ? part.toString() : null;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * What the order of a draft can do on this network: a purchase pays with one of the dollar coins of the registry, a sale receives one of them. Same shape as the ticket's plan, so the panel reads one thing.
 * The ticket keeps its own plan (it quotes purchases only); this is the one of the order panel.
 */
export function orderPlan(draft: TicketDraft, base: TicketPlan): TicketPlan {
  if (draft.acao === "buy") return base;
  const chain = EVM_CHAINS.find((c) => c.chainIndex === draft.chainIndex) ?? null;
  if (chain === null) return { chain, pay: [], quotable: false, reason: "O app ainda nao tem uma moeda para receber conhecida para esta rede" };
  if (!EVM_ADDRESS.test(draft.tokenAddress) || draft.tokenAddress.toLowerCase() === NATIVE_TOKEN) return { chain, pay: [], quotable: false, reason: "So da para trocar um token com contrato proprio: a moeda da rede paga a taxa da ordem" };
  const receive = chain.tokens.filter((t) => t.contract.toLowerCase() !== draft.tokenAddress.toLowerCase());
  if (receive.length === 0) return { chain, pay: [], quotable: false, reason: "Este token e a propria moeda em dolar da rede: nao ha para o que trocar" };
  return { chain, pay: receive, quotable: true, reason: null };
}

const BALANCE_OF = "0x70a08231";
const DECIMALS = "0x313ce567";
const READ_TIMEOUT_MS = 15_000;

function read(provider: SendProvider, to: string, data: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("wallet_timeout")), READ_TIMEOUT_MS);
    Promise.resolve(provider.request({ method: "eth_call", params: [{ to: to.toLowerCase(), data }, "latest"] })).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** How many decimals a token has, read from the token itself; null when it cannot be read as a small whole number (then no order is made: the amounts of the order depend on it). */
export async function readDecimals(provider: SendProvider, tokenAddress: string): Promise<number | null> {
  if (!EVM_ADDRESS.test(tokenAddress)) return null;
  try {
    const decimals = await read(provider, tokenAddress, DECIMALS);
    if (typeof decimals !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(decimals)) return null;
    const d = Number(BigInt(decimals));
    return Number.isInteger(d) && d >= 0 && d <= 36 ? d : null;
  } catch {
    return null;
  }
}

/** How much of the token the wallet holds and how many decimals it has, read from the token; null when either cannot be read in the shape of a number (then no order is made). */
export async function readHolding(provider: SendProvider, tokenAddress: string, owner: string): Promise<{ readonly balance: bigint; readonly decimals: number } | null> {
  if (!EVM_ADDRESS.test(tokenAddress) || !EVM_ADDRESS.test(owner)) return null;
  try {
    const balance = await read(provider, tokenAddress, `${BALANCE_OF}${owner.slice(2).toLowerCase().padStart(64, "0")}`);
    const decimals = await read(provider, tokenAddress, DECIMALS);
    if (typeof balance !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(balance)) return null;
    if (typeof decimals !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(decimals)) return null;
    const d = Number(BigInt(decimals));
    if (!Number.isInteger(d) || d < 0 || d > 36) return null;
    return { balance: BigInt(balance), decimals: d };
  } catch {
    return null;
  }
}
