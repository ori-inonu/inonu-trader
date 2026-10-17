/**
 * The agent's view of the wallets, from the balances the provider reports (AUT-2): every token as a position with its EXACT raw balance (the amount a sale is worked out from), its decimals inferred from the
 * two strings the provider gives and checked against each other, and its value in dollars. Cash is a dollar coin whose price is near a dollar: a scam token named like one is a position, not cash. A token the
 * provider flags as risk is left out and counted; a token with no usable price keeps its balance and an unknown value (never zero) and stays out of the totals. Pure: no clock, no network, no storage.
 */
import type { RawTokenAsset } from "../okx-wallet/portfolio";
import type { Book, HoldingFacts, Position, WalletKind } from "./types";

/**
 * The dollar coins the agent counts as CASH: the real contracts of the big issuers, by network. A name and a price near a dollar prove nothing (anyone can airdrop a token called USDC and price it at 1.00),
 * so cash is recognised by the contract only. A network that is not here has no cash the agent trusts, and its dollar coins are ordinary, unverified tokens until someone adds the contract after checking it.
 */
export const DOLLAR_CONTRACTS: Readonly<Record<string, readonly string[]>> = {
 "1": ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "0xdac17f958d2ee523a2206206994597c13d831ec7", "0x6b175474e89094c44da98b954eedeac495271d0f"],
 "56": ["0x55d398326f99059ff775485246999027b3197955", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"],
 "8453": ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
 "42161": ["0xaf88d065e77c8cc2239327c5edb3a432268e5831", "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"],
 "137": ["0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"],
 "10": ["0x0b2c639c533813f4aa9d7837caf62653d097ff85", "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"],
 "501": ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"],
};
/** Even a real contract must trade near a dollar: a de-pegged coin is not cash. */
const PEG = { min: 0.97, max: 1.03 } as const;

export function isDollarCoin(chainIndex: string, address: string, priceUsd: number | null): boolean {
 if (priceUsd === null || !Number.isFinite(priceUsd) || priceUsd < PEG.min || priceUsd > PEG.max) return false;
 const known = DOLLAR_CONTRACTS[chainIndex];
 if (known === undefined) return false;
 const wanted = chainIndex === "501" ? address : address.toLowerCase();
 return known.includes(wanted);
}

const PLAIN = /^\d+(\.\d+)?$/;
const WHOLE = /^\d+$/;

/** The decimals of a token from its human balance and its raw balance: the raw one must be the human one times a power of ten, exactly. Null when the two do not agree. */
export function decimalsOf(balanceText: string, rawBalance: string): number | null {
 if (!PLAIN.test(balanceText) || !WHOLE.test(rawBalance)) return null;
 const [whole, fraction = ""] = balanceText.split(".");
 const digits = BigInt(`${whole}${fraction}`);
 const raw = BigInt(rawBalance);
 if (digits === 0n || raw === 0n || raw % digits !== 0n) return null;
 const ratio = (raw / digits).toString();
 if (!/^10*$/.test(ratio)) return null;
 return fraction.length + (ratio.length - 1);
}

const cents = (v: number): number | null => {
 if (!Number.isFinite(v)) return null;
 // Above this magnitude, scaling by 100 can overflow; cents are below the number's precision anyway.
 return Math.abs(v) > Number.MAX_VALUE / 100 ? v : Math.round(v * 100) / 100;
};
const numberOf = (text: string): number | null => {
 if (!PLAIN.test(text)) return null;
 const value = Number(text);
 return Number.isFinite(value) ? value : null;
};

const addressOf = (chainIndex: string, contract: string): string => (contract === "" ? "native" : chainIndex === "501" ? contract : contract.toLowerCase());

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** A contract string is text from outside until it looks like an address of its network: free text would reach the ledger, the plan and the prompt. */
const isAddress = (chainIndex: string, address: string): boolean => address === "native" || (chainIndex === "501" ? SOLANA_ADDRESS.test(address) : EVM_ADDRESS.test(address));

/** A token anyone can create names itself anything: the label that enters the book (and so the ledger, the screen and every prompt) is plain characters, cut short, or "?". */
export function cleanSymbol(raw: unknown): string {
 const text = typeof raw === "string" ? raw.replace(/[^A-Za-z0-9$._-]/g, "").slice(0, 12) : "";
 return text === "" ? "?" : text;
}

export interface WalletRead {
 readonly wallet: WalletKind;
 /** What the provider reported for the wallet; an empty list is a wallet that was read and holds nothing. */
 readonly assets: readonly RawTokenAsset[];
}

export interface BookBuild {
 readonly book: Book;
 /** Tokens the provider flags as risk, left out. */
 readonly flagged: number;
 /** Tokens with a balance and no usable price, kept with an unknown value. */
 readonly unpriced: number;
}

export function bookFromAssets(reads: readonly WalletRead[], observedAtMs: number): BookBuild {
 const merged = new Map<string, Position>();
 const flaggedKeys = new Set<string>();
 let flagged = 0;
 for (const read of reads) {
  for (const a of read.assets) {
   const address = addressOf(a.chainIndex, a.tokenContractAddress);
   if (!isAddress(a.chainIndex, address)) {
    flagged++;
    continue;
   }
   if (a.isRiskToken) {
    flagged++;
    if (read.wallet === "agente") flaggedKeys.add(`${a.chainIndex}:${address}`);
    continue;
   }
   const id = `token:${a.chainIndex}:${address}`;
   const balance = numberOf(a.balance);
   const price = numberOf(a.tokenPrice);
   const decimals = decimalsOf(a.balance, a.rawBalance);
   const zeroBalance = /^0+(?:\.0+)?$/.test(a.balance) && WHOLE.test(a.rawBalance) && BigInt(a.rawBalance) === 0n;
   const usd = (decimals !== null || zeroBalance) && balance !== null && price !== null && price > 0 ? cents(balance * price) : null;
   const raw = decimals === null ? null : a.rawBalance;
   const key = `${read.wallet}|${id}`;
   const before = merged.get(key);
   if (before === undefined) {
    merged.set(key, { id, chainIndex: a.chainIndex, address, symbol: cleanSymbol(a.symbol), wallet: read.wallet, usd, balanceMinor: raw, decimals: raw === null ? null : decimals, isCash: isDollarCoin(a.chainIndex, address, price), priceUsd: price !== null && price > 0 ? price : null });
    continue;
   }
   // the same token twice in one wallet: one position, summed exactly
   const combinedUsd = before.usd !== null && usd !== null ? cents(before.usd + usd) : null;
   merged.set(key, {
    ...before,
    usd: combinedUsd,
    balanceMinor: before.balanceMinor !== null && raw !== null ? (BigInt(before.balanceMinor) + BigInt(raw)).toString() : null,
   });
  }
 }
 const positions = [...merged.values()];
 return {
  book: { observedAtMs, positions, ...totalsOf(positions, reads.some((r) => r.wallet === "agente"), reads.length > 0), flaggedKeys: [...flaggedKeys] },
  flagged,
  unpriced: positions.filter((p) => p.usd === null).length,
 };
}

/** The totals of a set of positions: only priced ones count, an agent wallet that was read and is empty is worth zero (unknown is not zero), and cash is the dollar coins of the managed wallet by network. */
function totalsOf(positions: readonly Position[], agentRead: boolean, anyRead: boolean): Pick<Book, "cashByChain" | "totalUsd" | "agentUsd"> {
 const sum = (list: readonly Position[]): number | null => {
  let total = 0;
  for (const p of list) {
   if (p.usd === null) continue;
   const next = total + p.usd;
   if (!Number.isFinite(next)) return null;
   total = next;
  }
  return cents(total);
 };
 const priced = positions.filter((p) => p.usd !== null && Number.isFinite(p.usd));
 const agentPositions = positions.filter((p) => p.wallet === "agente");
 const agentPriced = agentPositions.filter((p) => p.usd !== null && Number.isFinite(p.usd));
 const invalidCashChains = new Set<string>();
 const cashByChain: Record<string, number> = {};
 for (const p of agentPositions) {
  if (!p.isCash || p.usd === null || !Number.isFinite(p.usd) || invalidCashChains.has(p.chainIndex)) continue;
  const next = (cashByChain[p.chainIndex] ?? 0) + p.usd;
  if (!Number.isFinite(next)) {
   delete cashByChain[p.chainIndex];
   invalidCashChains.add(p.chainIndex);
  }
  else {
   const rounded = cents(next);
   if (rounded === null) delete cashByChain[p.chainIndex];
   else cashByChain[p.chainIndex] = rounded;
  }
 }
 return {
  cashByChain,
  totalUsd: priced.length > 0 ? sum(priced) : positions.length > 0 ? null : anyRead ? 0 : null,
  agentUsd: !agentRead ? null : agentPriced.length > 0 ? sum(agentPriced) : agentPositions.length === 0 ? 0 : null,
 };
}

export interface VerifiedBook {
 readonly book: Book;
 /** Priced tokens whose value no pool could back, left out of every total. */
 readonly unverified: number;
}

/**
 * A price is a claim, and an airdropped token can claim any price: the real public address this was tried on held tokens "worth" tens of millions of dollars that no market would pay a cent for. A token's
 * value counts only if the pool the provider reports for it is at least as big as the value (a position cannot be worth more than the liquidity that could pay for it). The native coin and the cash (real
 * dollar contracts) are trusted; everything else without that proof keeps its balance and loses its value: unknown, left out of the totals, never offered to the model.
 */
export function verifyBook(book: Book, factsOf: (position: Position) => HoldingFacts | null): VerifiedBook {
 let unverified = 0;
 const positions = book.positions.map((p): Position => {
  if (p.usd !== null && !Number.isFinite(p.usd)) {
   unverified++;
   return { ...p, usd: null };
  }
  if (p.isCash || p.usd === null || p.address === "native") return p;
  const liquidity = factsOf(p)?.liquidityUsd ?? null;
  if (liquidity !== null && Number.isFinite(liquidity) && liquidity > 0 && p.usd <= liquidity) return p;
  unverified++;
  return { ...p, usd: null };
 });
 if (unverified === 0) return { book, unverified };
 const agentRead = book.agentUsd !== null || positions.some((p) => p.wallet === "agente");
 return { book: { observedAtMs: book.observedAtMs, positions, ...totalsOf(positions, agentRead, true), flaggedKeys: book.flaggedKeys ?? [] }, unverified };
}
