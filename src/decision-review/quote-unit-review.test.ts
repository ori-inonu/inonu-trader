import { expect, test } from "bun:test";
import { createCliExecutor, type CliResult } from "../agent/cli";
import { DEFAULT_CONFIG } from "../agent/config";
import type { Book, PlannedOrder } from "../agent/types";
import { quoteFactsOf } from "../agent/quote-facts";

// Verified 2026-10-14 against OKX /dex-get-quote and CLI v4.6.4 commit cfbb0bafa71898e50762cd9fa77f026b4a8caa1b, swap.rs fetch_quote.
// The earlier unit-unknown premise was wrong; its failure is preserved in QUOTE-UNIT-REVIEW-BEFORE.log, not claimed as an implementation bug.
async function attempt(taxRate = "0", impact = "0.4") {
  const wallet = "0x1111111111111111111111111111111111111111", token = "0xabcdef0123456789abcdef0123456789abcdef01", usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const book: Book = { observedAtMs: 1, positions: [{ id: `token:1:${usdc}`, chainIndex: "1", address: usdc, symbol: "USDC", wallet: "agente", usd: 500, balanceMinor: "500000000", decimals: 6, isCash: true }], cashByChain: { "1": 500 }, totalUsd: 500, agentUsd: 500 };
  const order: PlannedOrder = { candidateId: "buy:synthetic", side: "buy", stance: "buy_third", chainIndex: "1", symbol: "SYNTHETIC", address: token, usd: 25, amountMinor: null, wallet: "agente", profile: "alvo_5", source: "modelo" };
  const out = (data: unknown): CliResult => ({ exitCode: 0, stdout: JSON.stringify({ ok: true, data }), stderr: "", timedOut: false });
  const calls: string[] = [];
  const executor = createCliExecutor({ runner: { run: async (args) => {
    calls.push(args[1]!);
    return args[1] === "quote" ? out({ action: "ok", priceImpactPercent: impact, tradeFee: "0.5", estimateGasFee: "5000", fromToken: { isHoneyPot: false, taxRate: "0", decimal: "6" }, toToken: { isHoneyPot: false, taxRate, decimal: "18" }, toTokenAmount: "123" }) : out({ swapTxHash: "0x" + "5".repeat(64) });
  } }, config: () => ({ ...DEFAULT_CONFIG, managed: { kind: "agentica", evm: wallet, solana: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" } }), book: () => book, timeouts: { quoteMs: 1000, executeMs: 1000 } });
  const result = await executor.execute(order, { cycleId: "synthetic", orderKey: "synthetic:buy", signal: new AbortController().signal });
  return { result, calls };
}

test("the documented USD fee stays separate from native gas units", async () => {
  const { result, calls } = await attempt();
  expect(result.status).toBe("transmitida");
  expect(calls).toEqual(["quote", "execute"]);
  // A positive indicative impact is favourable, not a cost. Native gas remains
  // unconverted; only the reported USD fee is known in this fixture.
  expect((result as { costUsd?: number }).costUsd).toBeCloseTo(0.5, 9);
});

test("adverse signed impact adds its estimated price effect without treating native gas units as USD", async () => {
  const {result,calls}=await attempt("0","-0.4");
  expect(result.status).toBe("transmitida");
  expect(calls).toEqual(["quote","execute"]);
  expect((result as {costUsd?:number}).costUsd).toBeCloseTo(0.6,9);
});

test("the tax cap of five percent uses the documented fractional taxRate", async () => {
  const { result, calls } = await attempt("0.06");
  expect(result).toEqual({ status: "falhou", reason: "imposto_alto" });
  expect(calls).toEqual(["quote"]);
});

test("quote facts labeled percent normalize fractional provider taxes", () => {
  const facts = quoteFactsOf({ fromToken: { taxRate: "0.01" }, toToken: { taxRate: "0.05" } }, 1);
  expect(facts.taxFromPct).toBe(1);
  expect(facts.taxToPct).toBe(5);
});
