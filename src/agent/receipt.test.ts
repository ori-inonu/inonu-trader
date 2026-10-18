import { describe, expect, test } from "bun:test";
import { receiptForTxHash } from "./receipt";

const SIG = "5Ksig1111111111111111111111111111111111111111111111111111111111111111111111111";
const HASH = "0xaBc123def456aBc123def456aBc123def456aBc123def456aBc123def456aBc1";
const WALLET_SOL = "38xPrzDyePKyg4ghstcLWTHBm7jG6ti2Q495yady3pYV";
const WALLET_EVM = "0xb76960373c7309ca1d341bd65d9a78abb2395171";

/**
 * The shape of `wallet history` for an order detail, as the tool's own source (cli/src/commands/agentic_wallet/history, tag v4.6.4) builds it: `data` is an ARRAY of entries with txHash, txStatus
 * (PENDING, ERROR, SUCCESS, CANCELLED, else passed through as the provider's number), chainIndex, from, to, input and output. The list mode is a different shape (`cursor` and `orderList`, no chainIndex and no token
 * address) and is NOT read here.
 */
const entry = (over: Record<string, unknown> = {}) => ({ txHash: SIG, txTime: "1791990000000", txStatus: "SUCCESS", failReason: "", direction: "OUT", from: WALLET_SOL, to: "Jupiter", chainSymbol: "SOL", chainIndex: "501", coinSymbol: "X", coinAmount: "5", ...over });
const bind = { txHash: SIG, chainIndex: "501", wallet: WALLET_SOL };

describe("a receipt counts only when it is OUR transaction on OUR network from OUR account, in the shape the tool documents", () => {
  test("the documented statuses are read, anything else (a provider number the tool passes through, a word nobody documented) is unknown, never success", () => {
    const status = (txStatus: unknown) => receiptForTxHash([entry({ txStatus })], bind);
    expect(status("SUCCESS")).toBe("success");
    expect(status("ERROR")).toBe("failed");
    expect(status("CANCELLED")).toBe("failed");
    expect(status("PENDING")).toBe("pending");
    for (const odd of ["success", "5", "DONE", "", 4, null, undefined, { value: "SUCCESS" }]) expect(status(odd)).toBeNull();
  });

  test("the transaction hash must be ours: another hash is another transaction, EVM hashes match in any case and Solana signatures exactly", () => {
    expect(receiptForTxHash([entry({ txHash: "someone-elses" })], bind)).toBeNull();
    expect(receiptForTxHash([entry({ txHash: HASH, chainIndex: "1", from: WALLET_EVM })], { txHash: HASH.toLowerCase(), chainIndex: "1", wallet: WALLET_EVM.toUpperCase().replace("0X", "0x") })).toBe("success");
    expect(receiptForTxHash([entry()], { ...bind, txHash: SIG.toLowerCase() })).toBeNull();
  });

  test("the network must be ours, and the entry must say so", () => {
    expect(receiptForTxHash([entry({ chainIndex: "56" })], bind)).toBeNull();
    expect(receiptForTxHash([entry({ chainIndex: 501 })], bind)).toBe("success");
    const without = entry();
    delete (without as Record<string, unknown>).chainIndex;
    expect(receiptForTxHash([without], bind)).toBeNull();
  });

  test("the account must be ours: a transaction from another address, or an entry that does not say, is not a receipt of our order", () => {
    expect(receiptForTxHash([entry({ from: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" })], bind)).toBeNull();
    const without = entry();
    delete (without as Record<string, unknown>).from;
    expect(receiptForTxHash([without], bind)).toBeNull();
    // a Solana address with another case is another address; an agent wallet we do not know is no binding at all
    expect(receiptForTxHash([entry({ from: WALLET_SOL.replace("Q", "q") })], bind)).toBeNull();
    expect(receiptForTxHash([entry()], { ...bind, wallet: null })).toBeNull();
  });

  test("only the documented shape: `data` is an array of entries; an object, a nested diagnostic, a list page or a string is not", () => {
    expect(receiptForTxHash({ diagnostic: entry() }, bind)).toBeNull();
    expect(receiptForTxHash(entry(), bind)).toBeNull();
    expect(receiptForTxHash([{ cursor: "c1", orderList: [entry()] }], bind)).toBeNull();
    expect(receiptForTxHash([{ detail: entry() }], bind)).toBeNull();
    expect(receiptForTxHash(`txStatus: SUCCESS ${SIG}`, bind)).toBeNull();
    expect(receiptForTxHash(null, bind)).toBeNull();
    expect(receiptForTxHash([], bind)).toBeNull();
  });

  test("a transfer of the same token under ANOTHER hash is never a receipt of our swap (the review's probe)", () => {
    const transfer = entry({ txHash: "TransferHash1111111111111111111111111111111111111111111111111111111111111111", direction: "IN", from: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" });
    expect(receiptForTxHash([transfer], bind)).toBeNull();
  });

  test("several entries with our hash must agree; a disagreement is not a receipt", () => {
    expect(receiptForTxHash([entry(), entry()], bind)).toBe("success");
    expect(receiptForTxHash([entry(), entry({ txStatus: "ERROR" })], bind)).toBeNull();
    expect(receiptForTxHash([entry({ txStatus: "PENDING" }), entry({ txStatus: "PENDING" })], bind)).toBe("pending");
  });
});

describe("the shape the tool REALLY answered (a read-only look at this account's own history on 2026-10-14: keys and types only, no value kept)", () => {
  test("an own contract call on X Layer: a numeric direction code, null amounts and links, an empty input, and `from` a plain string that is the agent's own address", () => {
    const xlayer = { txHash: HASH, txTime: "1791990000000", txStatus: "SUCCESS", failReason: null, direction: "3", from: WALLET_EVM, to: "0x0000000000000000000000000000000000000001", chainSymbol: "OKB", chainIndex: "196", coinSymbol: "OKB", coinAmount: null, explorerUrl: null, confirmedCount: "9999", hideTxType: "0", repeatTxType: "0", serviceCharge: "0.0001", serviceChargeUsd: "0.0100", input: [], output: [] };
    expect(receiptForTxHash([xlayer], { txHash: HASH, chainIndex: "196", wallet: WALLET_EVM })).toBe("success");
    // whatever the direction code is (3, 4, 8, 40, IN, OUT), it plays no part: the hash, the network and the sender decide
    for (const direction of ["3", "4", "8", "40", "IN", "OUT", ""]) expect(receiptForTxHash([{ ...xlayer, direction }], { txHash: HASH, chainIndex: "196", wallet: WALLET_EVM })).toBe("success");
  });

  test("a swap on Solana: `data` is an array of ONE entry, `from` is the agent's own address as a plain string, `to` is the program, the direction is a code (5), and failReason is null", () => {
    const swap = { txHash: SIG, txTime: "1791990000000", txStatus: "SUCCESS", failReason: null, direction: "5", from: WALLET_SOL, to: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", chainSymbol: "SOL", chainIndex: "501", coinSymbol: "SOL", coinAmount: "0", explorerUrl: null, confirmedCount: "123456", contractName: "Jupiter", hideTxType: "0", repeatTxType: "0", serviceCharge: "0.0001", serviceChargeUsd: "0.0100", input: [{ name: "USDC", amount: "100.000000", direction: "" }], output: [{ name: "BONK", amount: "1234567.89", direction: "" }] };
    expect(receiptForTxHash([swap], bind)).toBe("success");
    expect(receiptForTxHash([{ ...swap, txStatus: "ERROR", failReason: "slippage" }], bind)).toBe("failed");
    expect(receiptForTxHash([{ ...swap, txStatus: "PENDING" }], bind)).toBe("pending");
  });

  test("an incoming transfer on Solana, in the same shape, is not the receipt of an order of ours: its sender is somebody else", () => {
    const incoming = { txHash: SIG, txStatus: "SUCCESS", direction: "IN", from: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", to: WALLET_SOL, chainIndex: "501", input: [{ name: "SOL", amount: "0.5", direction: "" }], output: [] };
    expect(receiptForTxHash([incoming], bind)).toBeNull();
  });
});
