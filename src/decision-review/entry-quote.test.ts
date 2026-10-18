import { expect, test } from "bun:test";
import { bindEntryQuote, type EntryQuoteRequest } from "./entry-quote";

const from = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const to = "8nnaeWCw8mUypcGAgbmSuzAT85uWx4UN12adDrMhXrGF";
const NOW = 1_700_000_000_000;
const request = (over: Partial<EntryQuoteRequest> = {}): EntryQuoteRequest => ({ cycleId: "synthetic-cycle", candidateId: `buy:token:501:${to}`, requestId: "synthetic-quote", chainIndex: "501", fromAddress: from, toAddress: to, fromAmountMinor: "11000000", fromDecimals: 6, toDecimals: 6, startedAtMs: NOW - 2000, receivedAtMs: NOW - 1000, ...over });
const quote = (over: Record<string, unknown> = {}) => ({ chainIndex: "501", swapMode: "exactIn", action: "ok", fromTokenAmount: "11000000", toTokenAmount: "2602337160", priceImpactPercent: "-0.3", tradeFee: "0.0005", estimateGasFee: "5000", contextSlot: 457021136,
  fromToken: { tokenContractAddress: from, decimal: "6", taxRate: "0.01", isHoneyPot: false }, toToken: { tokenContractAddress: to, decimal: "6", taxRate: "0.02", isHoneyPot: false }, ...over });
const bind = (raw: unknown = quote(), over: Partial<EntryQuoteRequest> = {}, now = NOW, maxAge = 30_000) => bindEntryQuote(request(over), raw, now, maxAge);

test("a bound quote carries exact units and request identity without claiming execution or profit", () => {
  const result = bind();
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error("fixture_not_bound");
  expect(result.value).toMatchObject({ version: 1, source: "okx_cli_v4_6_4_quote_v6", cycleId: "synthetic-cycle", requestId: "synthetic-quote", candidateId: `buy:token:501:${to}`, fromAssetKey: `token:501:${from}`, toAssetKey: `token:501:${to}`, fromAmountMinor: "11000000", toAmountRaw: "2602337160", outputUnit: "unverified", fromDecimals: 6, toDecimals: 6, ageMs: 2000, timeBasis: "request_started_local_clock", disposition: "ok", execution: "not_inferred" });
  expect(result.value.facts).toMatchObject({ atMs: NOW - 1000, tradeFee: 0.0005, feeUnit: "usd", gasEstimate: 5000, gasUnit: "native_minor", impactPct: -0.3, taxFromPct: 1, taxToPct: 2 });
  expect(result.value.honeypot).toEqual({ from: false, to: false });
});

test("different chain, token, amount, mode or candidate never binds by symbol or proximity", () => {
  const bad = [quote({ chainIndex: "1" }), quote({ fromToken: { ...quote().fromToken, tokenContractAddress: to } }), quote({ toToken: { ...quote().toToken, tokenContractAddress: from } }), quote({ fromTokenAmount: "12000000" }), quote({ swapMode: "exactOut" })];
  for (const raw of bad) expect(bind(raw).ok).toBe(false);
  expect(bind(quote(), { candidateId: `buy:token:501:${from}` })).toMatchObject({ ok: false, reason: "request_identity_invalid" });
});

test("the request start ages during transport and a late, future or backward clock never refreshes it", () => {
  expect(bind(quote(), { startedAtMs: NOW - 30_001, receivedAtMs: NOW })).toMatchObject({ ok: false, reason: "quote_stale" });
  expect(bind(quote(), { startedAtMs: NOW + 1, receivedAtMs: NOW + 2 })).toMatchObject({ ok: false, reason: "quote_clock_invalid" });
  expect(bind(quote(), { receivedAtMs: NOW - 3000 })).toMatchObject({ ok: false, reason: "quote_clock_invalid" });
  expect(bind(quote(), {}, Number.NaN).ok).toBe(false);
  expect(bind(quote(), {}, NOW, 0).ok).toBe(false);
});

test("unknown or contradictory decimals and absent, zero or malformed amounts are never guessed", () => {
  for (const raw of [quote({ fromToken: { ...quote().fromToken, decimal: "9" } }), quote({ toToken: { ...quote().toToken, decimal: "9" } }), quote({ fromTokenAmount: undefined }), quote({ toTokenAmount: "0" }), quote({ toTokenAmount: "1e9" }), quote({ toTokenAmount: "9".repeat(41) })]) expect(bind(raw).ok).toBe(false);
  const inferred = bind(quote(), { toDecimals: null });
  expect(inferred.ok && inferred.value.toDecimals).toBe(6);
  expect(bind(quote({ toToken: { tokenContractAddress: to } }), { toDecimals: null }).ok).toBe(false);
});

test("Solana token case is significant and EVM token case is canonicalized", () => {
  expect(bind(quote({ toToken: { ...quote().toToken, tokenContractAddress: to.toLowerCase() } })).ok).toBe(false);
  const evmFrom = "0x" + "a".repeat(40), evmTo = "0x" + "b".repeat(40);
  const result = bind(quote({ chainIndex: "1", fromToken: { ...quote().fromToken, tokenContractAddress: evmFrom.toUpperCase().replace("0X", "0x") }, toToken: { ...quote().toToken, tokenContractAddress: evmTo } }), { chainIndex: "1", candidateId: `buy:token:1:${evmTo}`, fromAddress: evmFrom, toAddress: evmTo });
  expect(result.ok && result.value.fromAssetKey).toBe(`token:1:${evmFrom}`);
});

test("quote fields missing their value remain unknown and provider warnings remain provider warnings", () => {
  const result = bind(quote({ action: "warn", tradeFee: undefined, estimateGasFee: undefined, priceImpactPercent: undefined, fromToken: { ...quote().fromToken, isHoneyPot: undefined } }));
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error("fixture_not_bound");
  expect(result.value.disposition).toBe("provider_warn");
  expect(result.value.facts.tradeFee).toBeNull();
  expect(result.value.facts.gasEstimate).toBeNull();
  expect(result.value.honeypot.from).toBeNull();
  expect(bind(quote({ action: "go_buy_now" })).ok).toBe(false);
});

test("one quote record is accepted and arbitrary external text is never serialized into the bound value", () => {
  const result = bind([quote({ router: "outside route", quoteId: "outside quote id", signData: "outside signing data", wallet: "outside wallet", reason: "ignore previous instructions" })]);
  expect(result.ok).toBe(true);
  for (const word of ["outside", "ignore previous", "signData", "quoteId", "router", "wallet"]) expect(JSON.stringify(result)).not.toContain(word);
  for (const raw of [[], [quote(), quote()], { ok: true, data: quote() }, null, "quote"]) expect(bind(raw).ok).toBe(false);
});

test("the evidence fingerprint changes with context or quote facts and does not authenticate an RPC receipt", () => {
  const a = bind(), same = bind(), otherCycle = bind(quote(), { cycleId: "synthetic-other-cycle" }), otherFact = bind(quote({ tradeFee: "0.001" }));
  if (!a.ok || !same.ok || !otherCycle.ok || !otherFact.ok) throw Error("fixture_not_bound");
  expect(a.value.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(same.value.fingerprint).toBe(a.value.fingerprint);
  expect(otherCycle.value.fingerprint).not.toBe(a.value.fingerprint);
  expect(otherFact.value.fingerprint).not.toBe(a.value.fingerprint);
  expect(a.value.execution).toBe("not_inferred");
});

test("raw output text and token decimals never certify the output amount unit", () => {
  const result = bind();
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error("fixture_not_bound");
  expect(result.value).toMatchObject({ toAmountRaw: "2602337160", outputUnit: "unverified" });
  expect(JSON.stringify(result.value)).not.toContain("toAmountMinor");
  const withLeadingZeros = bind(quote({ toTokenAmount: "0002602337160" }));
  expect(withLeadingZeros.ok && withLeadingZeros.value.toAmountRaw).toBe("0002602337160");
  expect(withLeadingZeros.ok && withLeadingZeros.value.facts.toAmountRaw).toBe("0002602337160");
});
