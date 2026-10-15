import { expect, test } from "bun:test";
import { readShadowQuotes } from "./shadow-quotes";
import type { ShadowMark } from "./shadow";
const mark: ShadowMark = { id: "a", chainIndex: "501", contract: "Mint", symbol: "A", action: "buy", atMs: 1000, priceUsd: 2, exposureUsd: 1 };
const meta = { ageMs: 0, stale: false, cachedAtMs: 1000 };
test("shadow costs cap six GET quotes, retain unverified units and never zero missing costs", async () => {
  const calls: unknown[] = [];
  const results = await readShadowQuotes(Array.from({length: 9}, (_,i) => ({...mark,id:String(i)})), {
    search: async () => ({ data: [{ chainIndex: "501", address: "Mint", decimals: 6 }], meta }),
    quote: async p => { calls.push(p); return { ok: true, data: { chainIndex: "501", mode: "exactIn", fromAmountRaw: "1000000", fromToken: { address: p.fromToken }, toToken: { address: p.toToken }, tradeFee: null, priceImpactPct: -2, outputUnit: "unverified" }, meta } as never; },
  }, new AbortController().signal, () => 1000);
  expect(calls).toHaveLength(6);
  expect(results).toHaveLength(6);
  expect(results[0]?.cost.outputUnitVerified).toBe(false);
  expect(results[0]?.cost.networkFeeUsd).toBeNull();
  expect(results[0]?.cost.executionDragUsd).toBeNull();
});
test("stale or mismatched decimals and abort cannot initiate quote", async () => {
  let calls = 0;
  const deps = { search: async () => ({ data: [{ chainIndex: "501", address: "Other", decimals: 6 }], meta }), quote: async () => { calls++; return {ok:false,error:"schema"} as const; } };
  expect((await readShadowQuotes([mark], deps, new AbortController().signal, () => 1000))[0]?.note).toContain("Metadados");
  const stopped = new AbortController(); stopped.abort();
  expect(await readShadowQuotes([mark], deps, stopped.signal, () => 1000)).toEqual([]);
  expect(calls).toBe(0);
});
