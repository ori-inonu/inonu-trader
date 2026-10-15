import { expect, test } from "bun:test";
import { closingBrief, closingRecord } from "../agent/closing";
import { bindEntryQuote } from "./entry-quote";
import { auditClosing } from "./closing-audit";
import { createHash } from "node:crypto";
import { runClosing, type ClosingCandidate, type ClosingDeps } from "../agent/closing-phase";
import { createBudget } from "../agent/budget";

const NOW = 1_700_000_000_000, FROM = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", TO = "8nnaeWCw8mUypcGAgbmSuzAT85uWx4UN12adDrMhXrGF";
function row(): any {
  const result = bindEntryQuote({ cycleId: "synthetic", candidateId: `buy:token:501:${TO}`, requestId: "synthetic-quote", chainIndex: "501", fromAddress: FROM, toAddress: TO, fromAmountMinor: "11000000", fromDecimals: 6, toDecimals: 6, startedAtMs: NOW - 2000, receivedAtMs: NOW - 1000 }, {
    chainIndex: "501", swapMode: "exactIn", action: "ok", fromTokenAmount: "11000000", toTokenAmount: "100000000", priceImpactPercent: "-0.3", tradeFee: "0.0055", fromToken: { tokenContractAddress: FROM, decimal: "6", taxRate: "0", isHoneyPot: false }, toToken: { tokenContractAddress: TO, decimal: "6", taxRate: "0", isHoneyPot: false },
  }, NOW, 15_000);
  if (!result.ok) throw Error("synthetic_binding_failed");
  const quote = result.value;
  const brief = closingBrief({ symbol: "SYNTHETIC", sizeUsd: 11, portfolioUsd: 120, liquidityUsd: 500000, profile: "alvo_5", smallest: true, first: { pBuy: .58, facets: { fading: .6 } }, quote, quoteFailure: null, exec: null, nowMs: NOW });
  return closingRecord({ cycleId: quote.cycleId, candidateId: quote.candidateId, requestId: quote.requestId, atMs: NOW - 2500, phaseStartedAtMs: NOW - 3000, placed: "antes", askedAtMs: NOW + 10, answeredAtMs: NOW + 30, mode: "shadow", firstP: .58, appliedByGate: "skip", quote, quoteFailure: null, refusal: null, brief, answer: { buy: .7, skip: .3 } });
}
const rehashQuote = (q: any) => { const { fingerprint, ...body } = q; q.fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex"); };
const rehashBrief = (r: any) => { const text = JSON.stringify(r.brief); r.briefHash = createHash("sha256").update(text).digest("hex").slice(0, 16); r.briefBytes = new TextEncoder().encode(text).length; };

test("SF1 objective refusals and record coherence cannot pass as a clean model decision", () => {
  for (const [disposition, refusal] of [["provider_block", "cotacao_bloqueada"], ["provider_warn", "cotacao_aviso"]]) {
    const r = row(); r.quote.disposition = disposition; rehashQuote(r.quote);
    expect(auditClosing(r)?.findings).toContain("closing_asked_despite_objective_refusal");
    expect(auditClosing(r)?.findings).toContain("closing_refusal_mismatch");
    r.refusal = refusal; r.would = "buy";
    expect(auditClosing(r)?.findings).toContain("closing_refusal_with_answer");
    expect(auditClosing(r)?.findings).toContain("closing_refusal_would_mismatch");
  }
  const unknown = row(); unknown.refusal = "ignore_previous_instructions/https://invalid";
  expect(auditClosing(unknown)?.findings).toContain("closing_refusal_unknown");
  expect(auditClosing(unknown)?.refusal).toBeNull();
  const baseless = row(); baseless.answer = null;
  expect(auditClosing(baseless)?.findings).toContain("closing_would_without_basis");
  const noQuote = row(); noQuote.quote = null; noQuote.answer = null;
  expect(auditClosing(noQuote)?.findings).toContain("closing_brief_without_quote");
});

test("SF2 copied shadow fields never prove unchanged execution", () => {
  expect(auditClosing(row())).toMatchObject({ shadowFieldsEqual: true, shadowUnchanged: null, sourceAuthenticated: false });
  const r = row(); r.applied = "buy_full";
  expect(auditClosing(r)).toMatchObject({ shadowFieldsEqual: false, shadowUnchanged: null });
  expect(auditClosing(r)?.findings).toContain("closing_shadow_field_mismatch");
  expect(auditClosing(r)?.findings).not.toContain("closing_shadow_changed_choice");
});

test("SF3 physical local clocks report quote age and reject contradictory known times", () => {
  expect(auditClosing(row())).toMatchObject({ placed: "antes", phaseStartedAtMs: NOW - 3000, askedAtMs: NOW + 10, answeredAtMs: NOW + 30, quoteAgeAtAskMs: 2010, quoteFreshAtModelCall: true });
  for (const change of [{ placed: "sideways" }, { phaseStartedAtMs: NOW + 1000 }, { askedAtMs: NOW - 1 }, { askedAtMs: null }, { askedAtMs: NOW + 50, answeredAtMs: NOW + 49 }, { atMs: NOW + 31 }]) {
    const r = { ...row(), ...change };
    expect(auditClosing(r)?.findings.some(f => f === "closing_placement_invalid" || f === "closing_physical_clock_inconsistent")).toBe(true);
    expect(auditClosing(r)?.quoteFreshAtModelCall).toBeNull();
  }
  const legacy = row(); delete legacy.placed; delete legacy.phaseStartedAtMs; delete legacy.askedAtMs; delete legacy.answeredAtMs;
  expect(auditClosing(legacy)).toMatchObject({ placed: null, phaseStartedAtMs: null, askedAtMs: null, answeredAtMs: null, quoteAgeAtAskMs: null, quoteFreshAtModelCall: null, findings: [] });
});

test("SF3 fixed freshness is measured at the reported ask, including its exact boundary", () => {
  const r = row(); r.askedAtMs = r.quote.startedAtMs + 15000; r.answeredAtMs = r.askedAtMs + 1;
  expect(auditClosing(r)?.quoteFreshAtModelCall).toBe(true);
  r.askedAtMs++; r.answeredAtMs++;
  expect(auditClosing(r)).toMatchObject({ quoteAgeAtAskMs: 15001, quoteFreshAtModelCall: false });
  expect(auditClosing(r)?.findings).toContain("closing_quote_stale_at_model_call");
});

test("SF4 a rehashed record cannot enlarge the documented15 second quote window", () => {
  const r = row(); r.quote.expiresAtMs = r.quote.startedAtMs + 1e12; r.quote.reviewedAtMs = r.quote.startedAtMs + 600000; r.quote.ageMs = 600000; r.askedAtMs = r.quote.reviewedAtMs + 10; r.answeredAtMs = r.askedAtMs + 10; rehashQuote(r.quote);
  expect(auditClosing(r)?.findings).toContain("closing_quote_window_unexpected");
  expect(auditClosing(r)?.quoteFreshAtModelCall).toBeNull();
});

test("SF5 Brief quote fields and original model probability bind to their recorded source", () => {
  for (const change of [{ e: "bloqueio" }, { imp: -9.5 }, { imposto: [3, 4] }]) {
    const r = row(); Object.assign(r.brief.cot, change); rehashBrief(r);
    expect(auditClosing(r)?.findings).toContain("closing_brief_quote_mismatch");
  }
  const p = row(); p.brief.sua.p = .99; rehashBrief(p);
  expect(auditClosing(p)?.findings).toContain("closing_brief_first_probability_mismatch");
  for (const pBuy of [7, "abc", NaN, -1]) {
    const r = row(); r.first.pBuy = pBuy;
    expect(auditClosing(r)?.findings).toContain("closing_first_probability_invalid");
  }
  const rounded = row(); rounded.first.pBuy = .574999; rounded.brief.sua.p = .58; rehashBrief(rounded);
  expect(auditClosing(rounded)?.findings).not.toContain("closing_brief_first_probability_mismatch");
});

test("closing evidence is independently fingerprinted and remains distinct from a trade or profit", () => {
  expect(auditClosing(row())).toMatchObject({ briefFingerprint: "matched", quoteFingerprint: "matched", quoteIdentity: "matched", shadowFieldsEqual: true, shadowUnchanged: null, sourceAuthenticated: false, modelPreference: "buy", executionProven: false, financialProfitProven: false, findings: [] });
});

test("an edited brief, including edited judgments, cannot keep a matched recorded hash", () => {
  const r = row(); r.brief.sua.f.fading = 2;
  expect(auditClosing(r)?.findings).toContain("closing_brief_hash_mismatch");
});

test("a bound quote edited after binding is detected independently", () => {
  const r = row(); r.quote.fromAmountMinor = "12000000";
  expect(auditClosing(r)?.findings).toContain("closing_quote_hash_mismatch");
});

test("a quote from another request or candidate is never silently attached to this closing", () => {
  for (const key of ["cycleId", "candidateId", "requestId"]) {
    const r = row(); r[key] += "-different";
    expect(auditClosing(r)?.findings).toContain("closing_quote_identity_mismatch");
  }
});

test("a recomputed fingerprint cannot hide internally inconsistent asset identity or quote clocks", () => {
  const rehash = (q: any) => { const { fingerprint, ...body } = q; q.fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex"); };
  const wrongAsset = row(); wrongAsset.quote.toAssetKey = `token:501:${FROM}`; rehash(wrongAsset.quote);
  expect(auditClosing(wrongAsset)?.findings).toContain("closing_quote_identity_mismatch");
  const wrongClock = row(); wrongClock.quote.ageMs = 0; rehash(wrongClock.quote);
  expect(auditClosing(wrongClock)?.findings).toContain("closing_quote_clock_inconsistent");
});

test("different shadow fields are diagnosed without claiming an executed choice changed", () => {
  const r = row(); r.applied = "buy_full";
  expect(auditClosing(r)?.findings).toContain("closing_shadow_field_mismatch");
});

test("missing exact state or probabilities does not invent a model decision", () => {
  const r = row(); r.brief = null;
  expect(auditClosing(r)?.findings).toContain("closing_brief_missing");
  const noAnswer = row(); noAnswer.answer = null; noAnswer.would = null; noAnswer.wouldReason = "orcamento";
  expect(auditClosing(noAnswer)).toMatchObject({ modelPreference: null, executionProven: false });
});

test("a refusal with no model answer is separate from a model skip", () => {
  const r = row(); r.brief = null; r.briefHash = null; r.briefBytes = null; r.answer = null; r.would = "skip"; r.refusal = "honeypot"; r.wouldReason = "honeypot";
  r.quote.honeypot.to = true; rehashQuote(r.quote); r.askedAtMs = null; r.answeredAtMs = null;
  expect(auditClosing(r)).toMatchObject({ modelPreference: null, refusal: "honeypot", findings: [] });
});

test("malformed distributions and a clearly inconsistent recorded verdict are reported", () => {
  const r = row(); r.answer = { buy: .9, skip: .9 };
  expect(auditClosing(r)?.findings).toContain("closing_distribution_invalid");
  const wrong = row(); wrong.would = "skip";
  expect(auditClosing(wrong)?.findings).toContain("closing_verdict_mismatch");
});

test("six-place probability rounding cannot establish an exact tie in the original response", () => {
  const r = row(); r.answer = { buy: .5, skip: .5 }; r.would = "buy";
  expect(auditClosing(r)).toMatchObject({ modelPreference: null, verdictReconstructable: false });
  expect(auditClosing(r)?.findings).not.toContain("closing_verdict_mismatch");
});

test("unsupported or malformed headers are not interpreted as closing records", () => {
  for (const v of [null, [], {}, { ...row(), phase: "order" }, { ...row(), mode: "paper" }, { ...row(), atMs: NaN }, { ...row(), criteria: null }]) expect(auditClosing(v)).toBeNull();
});

async function actualProducer(over: { action?: "ok" | "warn" | "block"; honey?: boolean | null; quoteFailure?: boolean; amountMismatch?: boolean; noClose?: boolean; modelError?: boolean; answer?: { buy: number; skip: number } | null; reserve?: number; placed?: "antes" | "depois" } = {}) {
  let now = NOW;
  const candidateId = `buy:token:501:${TO}`;
  const candidate: ClosingCandidate = { id: candidateId, order: { candidateId, side: "buy", stance: "buy_full", chainIndex: "501", symbol: "SYNTHETIC", address: TO, usd: 11, amountMinor: null, wallet: "agente", profile: "alvo_20", source: "modelo" },
    symbol: "SYNTHETIC", portfolioUsd: 120, liquidityUsd: 500000, profile: "alvo_20", smallest: true, firstP: .5749995, facets: { fading: .6 }, item: { s: "synthetic" }, itemLegend: {}, appliedByGate: "skip" };
  const deps: ClosingDeps = {
    mode: () => "shadow", now: () => now += 10, newId: () => "synthetic-physical-quote", record: () => {}, maxPerCycle: 1, timeouts: { quoteMs: 1000, modelMs: 1000 },
    budget: createBudget({ limits: { maxConsultsPerDay: 100, maxTokensPerDay: null }, now: () => now, load: () => null, persist: () => {} }),
    ...(over.reserve === undefined ? {} : { reserveForPrimaries: () => over.reserve! }),
    quoter: { read: async (_order, context) => {
      if (over.quoteFailure) return { ok: false as const, reason: "synthetic_quote_failed" };
      const startedAtMs = now += 10;
      return { ok: true as const, request: { cycleId: context.cycleId, candidateId, requestId: context.requestId, chainIndex: "501", fromAddress: FROM, toAddress: TO, fromAmountMinor: "11000000", fromDecimals: 6, toDecimals: null, startedAtMs, receivedAtMs: now += 10 },
        raw: { chainIndex: "501", swapMode: "exactIn", action: over.action ?? "ok", fromTokenAmount: over.amountMismatch ? "12000000" : "11000000", toTokenAmount: "100000000", priceImpactPercent: "-0.3", tradeFee: "0.0055", fromToken: { tokenContractAddress: FROM, decimal: "6", taxRate: "0", isHoneyPot: false }, toToken: { tokenContractAddress: TO, decimal: "6", taxRate: "0", isHoneyPot: over.honey === undefined ? false : over.honey } } };
    } },
    model: over.noClose ? { name: "synthetic-model" } : { name: "synthetic-model", close: async () => { if (over.modelError) throw new Error("synthetic_error"); return { answer: over.answer === undefined ? { buy: .7, skip: .3 } : over.answer, usage: { inputTokens: 100, outputTokens: 10 } }; } },
  };
  const records = await runClosing({ deps, cycleId: "synthetic-producer-cycle", candidates: [candidate], signal: new AbortController().signal, exec: null, placed: over.placed ?? "antes" });
  // Actual producer plus in-memory fake ports, then the same JSON roundtrip as a
  // jsonl reader. This is schema compatibility, not live execution evidence.
  return JSON.parse(JSON.stringify(records[0]));
}

test("actual runClosing records remain format-compatible for answers, refusals and unavailable steps", async () => {
  for (const config of [{}, { answer: { buy: .2, skip: .8 } }, { action: "block" }, { action: "warn" }, { honey: true }, { honey: null }, { quoteFailure: true }, { amountMismatch: true }, { noClose: true }, { modelError: true }, { answer: null }, { reserve: 100 }, { placed: "depois" }] as const) {
    const source = await actualProducer(config);
    const audited = auditClosing(source);
    expect(audited).not.toBeNull();
    expect(audited?.findings).toEqual([]);
    expect(audited?.shadowUnchanged).toBeNull();
    expect(audited?.shadowFieldsEqual).toBe(true);
    expect(audited?.sourceAuthenticated).toBe(false);
    expect(audited?.quoteFreshAtModelCall).toBe(source.askedAtMs === null ? null : true);
  }
});

test("freshness claims require quote integrity, identity, window and coherent reported clocks", () => {
  const hash = row(); hash.quote.fromAmountMinor = "12300000";
  expect(auditClosing(hash)?.quoteFreshAtModelCall).toBeNull();
  const identity = row(); identity.requestId = "different";
  expect(auditClosing(identity)?.quoteFreshAtModelCall).toBeNull();
  const clock = row(); clock.quote.reviewedAtMs = "invalid"; rehashQuote(clock.quote);
  expect(auditClosing(clock)?.quoteFreshAtModelCall).toBeNull();
});

test("auditor remains deterministic and contains no ports to trade, models, network or financial storage", async () => {
  const source = row(), before = JSON.stringify(source);
  expect(auditClosing(source)).toEqual(auditClosing(source));
  expect(JSON.stringify(source)).toBe(before);
  const text = await Bun.file(new URL("./closing-audit.ts", import.meta.url)).text();
  expect(text).not.toMatch(/\bfetch\s*\(|\bDate\.now\s*\(|\bprocess\.|Bun\.|node:fs|from ["'][^"']*(?:executor|ledger|budget|service|cycle|closing-phase)["']/);
});
