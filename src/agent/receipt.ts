/**
 * The receipt of one order in the signing tool's own history (`wallet history --chain <network> --tx-hash <hash>`). The shape is the one the tool's source documents (cli/src/commands/agentic_wallet/history,
 * tag v4.6.4): for an order detail `data` is an ARRAY of entries with `txHash`, `txStatus` (PENDING, ERROR, SUCCESS, CANCELLED; any other value is the provider's number passed through and means nothing here),
 * `chainIndex`, `from`, `to`, `input` and `output`. The list mode is another shape (`cursor` and `orderList`, with no network and no token address in it) and is not used: a list cannot be bound to a swap.
 *
 * An entry counts as the receipt of an order only when it is THAT order: the transaction hash we hold is the entry's hash, the network is ours, and the entry says it came from the agent's own address. A transfer
 * of the same token under another hash, a nested diagnostic, a page of a list, an entry that does not say its network or its sender: none of them is a receipt, and what is not a receipt is unknown, never success. Pure.
 */

export type ReceiptStatus = "pending" | "success" | "failed";

const statusOf = (v: unknown): ReceiptStatus | null => {
  if (v === "SUCCESS") return "success";
  if (v === "ERROR" || v === "CANCELLED") return "failed";
  if (v === "PENDING") return "pending";
  return null;
};

const isEvm = (s: string): boolean => /^0x[0-9a-fA-F]+$/.test(s);
/** EVM identifiers are the same in any case; Solana ones are Base58 and a different case is a different thing. */
const same = (a: string, b: string): boolean => (isEvm(a) && isEvm(b) ? a.toLowerCase() === b.toLowerCase() : a === b);

export interface ReceiptBinding {
  /** The transaction hash (or Solana signature) the order was sent under. */
  readonly txHash: string;
  readonly chainIndex: string;
  /** The agent's own address on that network; null when it is not known, and then nothing can be bound. */
  readonly wallet: string | null;
}

/** What the tool's own history says about the order sent under this hash from this account on this network; null when nothing in it is that order, or the entries that are disagree. */
export function receiptForTxHash(data: unknown, bind: ReceiptBinding): ReceiptStatus | null {
  if (!Array.isArray(data) || bind.wallet === null) return null;
  const matches: unknown[] = [];
  for (const item of data) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const e = item as Record<string, unknown>;
    if (typeof e.txHash !== "string" || !same(e.txHash, bind.txHash)) continue;
    if ((typeof e.chainIndex !== "string" && typeof e.chainIndex !== "number") || String(e.chainIndex) !== bind.chainIndex) continue;
    if (typeof e.from !== "string" || !same(e.from, bind.wallet)) continue;
    matches.push(e.txStatus);
  }
  if (matches.length === 0) return null;
  const first = statusOf(matches[0]);
  return first !== null && matches.every((s) => statusOf(s) === first) ? first : null;
}
