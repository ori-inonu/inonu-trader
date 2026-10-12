import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GevPilotPanelView } from "../components/GevPilotPanel/GevPilotPanel";
import { createGevPilotController, gevPilotStateForWallet } from "./gev-pilot-client";
import { pilotContextKey, type PilotRequest, type PilotCycle } from "../../../src/pilot/protocol";
import type { WalletSnapshot, XLayerWalletBalances } from "./okx-wallet";
import { evaluatePilot } from "../../../src/pilot/service";
import { createPilotFixture } from "../../../src/pilot/testing-fixture";

const account = "0x1111111111111111111111111111111111111111";
const NOW = 1_800_000_000_000;
function balances(block = "0x7b"): XLayerWalletBalances {
  return { network: "xlayer", okb: "1", usdt: "20", usdt0: "0", nativeUsdc: "0", usdcBridged: "0", usdcE: "0", block };
}
function wallet(overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
  return { status: "connected", account, chainId: "0xc4", observedAtMs: NOW, error: null,
    balances: balances(), ...overrides };
}
function hold(request: PilotRequest): PilotCycle {
  return { protocol: "gev-wallet-pilot-v1", sessionId: request.sessionId, requestId: request.requestId,
    contextKey: pilotContextKey(request), cycleId: "cycle-0001", maskedAccount: "0x1111...1111", chainId: "0xc4", chainIndex: "196",
    mode: "simulation", execution: "disabled", status: "hold", source: "unavailable", dataVersion: null, observedAtMs: null,
    coverage:{status:"unknown",chains:[],valueComplete:null,unitsQualified:null,quoteCostsComplete:null,assetCount:null},quoteObservedAtMs:null,
    completedAtMs: NOW, validUntilMs: NOW, knownValueUsd: null, candidates: [], verdicts: [], decision: null, plan: null,
    reasons: ["source_unavailable"], inferenceCostUsd: null, billedCostUsd: null, realizedProfitUsd: null };
}
function reply(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}
/** Explicit fixture: qualifies frontend safety only, never real access or P2. */
function simulated(request: PilotRequest): PilotCycle {
  const cycle = hold(request);
  return { ...cycle, status: "simulated", source: "fixture", dataVersion: "a".repeat(64), observedAtMs: NOW,
    coverage:{status:"qualified",chains:["196"],valueComplete:true,unitsQualified:true,quoteCostsComplete:true,assetCount:2},quoteObservedAtMs:NOW,
    validUntilMs: NOW + 10_000, knownValueUsd: 20, inferenceCostUsd: 0.001, reasons: [],
    candidates: [{ id: "rt_196_usdt_okb", kind: "dex_round_trip", title: "USDT → OKB → USDT", chainIndex: "196",
      from: { chainIndex: "196", tokenContractAddress: "0x2222222222222222222222222222222222222222", symbol: "USDT", decimals: 6 },
      to: { chainIndex: "196", tokenContractAddress: "", symbol: "OKB", decimals: 18 },
      sizeUsd: 5, sizeAtomic: "5000000", expectedOutAtomic: "5500000", expectedLeg1OutAtomic: "100000000000000000",
      pairKey: "196:usdt:okb", netUsd: 0.47, priceImpactPercent: 0.1,
      costs: { complete: true, networkFeeUsd: 0.01, tradingFeeUsd: 0.01, inferenceUsd: 0.001 },
      quoteAgeMs: 0, quoteHash: "b".repeat(32), notes: [], researchOnly: false }],
    verdicts: [{ candidateId: "rt_196_usdt_okb", eligible: true, reasons: [] }],
    decision: { choice: "rt_196_usdt_okb", probabilities: { hold: 0.1, rt_196_usdt_okb: 0.9 }, confidence: 0.8, latencyMs: 1, inputTokens: 100, model: "fixture" },
    plan: { planId: "plan_fixture_01", candidateId: "rt_196_usdt_okb", kind: "dex_round_trip", createdAtMs: NOW, expiresAtMs: NOW + 8_000,
      steps: [{ kind: "swap", chainIndex: "196", description: "Etapa hipotética USDT → OKB" }], quoteHash: "b".repeat(32), maxLossUsd: 5,
      idempotencyKey: "c".repeat(32), executionQualification: "qualified_dry_run" },
  };
}
function harness(respond: (request: PilotRequest) => Promise<Response> = async (r) => reply(hold(r))) {
  let time = NOW;
  let sequence = 0;
  let handle = 0;
  const timers = new Map<number, { due: number; run: () => void }>();
  const requests: PilotRequest[] = [];
  const signals: AbortSignal[] = [];
  const controller = createGevPilotController({ sessionId: "session-0001", now: () => time,
    nonce: () => `request-${String(++sequence).padStart(4, "0")}`, requestDeadlineMs: 5_000,
    scheduler: {
      setTimeout(run: () => void, delay: number) { const id = ++handle; timers.set(id, { run, due: time + delay }); return id; },
      clearTimeout(id: unknown) { timers.delete(id as number); },
    },
    fetch: async (_url, init) => { const r = JSON.parse(String(init.body)); requests.push(r); signals.push(init.signal!); return respond(r); },
  });
  return { controller, requests, signals, timers,
    advance(ms: number) {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.run(); }
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("public pilot controller — manual simulation", () => {
  it("accepts the actual backend fixture cycle through the public HTTP response contract", async () => {
    const h = harness(async r => reply(await evaluatePilot(r, createPilotFixture(() => NOW))));
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    const state = h.controller.getSnapshot();
    expect(state.reason).not.toBe("invalid_response");
    expect(state.status).toBe("simulated");
    expect(state.cycle?.source).toBe("fixture");
    expect(state.activePlan?.quoteHash).toBe(state.cycle?.candidates[0]?.quoteHash);
    expect(state.activePlan?.executionQualification).toBe("qualified_dry_run");
    h.controller.dispose();
  });

  it("posts only a fresh shared observation to loopback and records an unavailable hold", async () => {
    const controller = createGevPilotController({ sessionId: "session-0001", now: () => NOW, nonce: () => "request-0001",
      fetch: async (url, init) => {
        expect(url).toBe("http://127.0.0.1:3020/pilot/cycles");
        expect(init?.method).toBe("POST");
        expect(init?.credentials).toBe("omit");
        expect(init?.redirect).toBe("error");
        const request = JSON.parse(String(init?.body));
        expect(request).toEqual({ sessionId: "session-0001", requestId: "request-0001", account, chainId: "0xc4", observedAtMs: NOW, block: "123" });
        return reply(hold(request));
      } });
    controller.setWallet(wallet());
    expect(controller.getSnapshot().canEvaluate).toBe(true);
    expect(controller.getSnapshot().cycle).toBeNull();
    await controller.evaluate();
    expect(controller.getSnapshot().status).toBe("hold");
    expect(controller.getSnapshot().cycle?.reasons).toEqual(["source_unavailable"]);
    expect(controller.getSnapshot().activePlan).toBeNull();
    controller.dispose();
  });

  it.each([
    ["account (same mask)", () => wallet({ account: "0x1111222222222222222222222222222222221111" })],
    ["network", () => wallet({ chainId: "0x8f" })],
    ["block", () => wallet({ balances: balances("0x7c") })],
    ["observation", () => wallet({ observedAtMs: NOW - 1 })],
    ["reading", () => wallet({ status: "reading" })],
    ["disconnected", () => wallet({ status: "disconnected" })],
    ["stale", () => wallet({ observedAtMs: NOW - 60_001 })],
  ] as const)("invalidates immediately on %s and ignores the delayed previous reply", async (_name: string, changed: () => WalletSnapshot) => {
    const delayed = deferred<Response>();
    const h = harness(() => delayed.promise);
    h.controller.setWallet(wallet());
    const pending = h.controller.evaluate();
    h.controller.setWallet(changed());
    expect(h.controller.getSnapshot().cycle).toBeNull();
    expect(h.controller.getSnapshot().activePlan).toBeNull();
    expect(h.signals[0]?.aborted).toBe(true);
    delayed.resolve(reply(hold(h.requests[0]!)));
    await pending;
    expect(h.controller.getSnapshot().cycle).toBeNull();
    h.controller.dispose();
  });

  it("settles a request deadline even when the transport ignores abort; late replies stay ignored", async () => {
    const delayed = deferred<Response>();
    const h = harness(() => delayed.promise);
    h.controller.setWallet(wallet());
    const pending = h.controller.evaluate();
    h.advance(5_000);
    await pending;
    expect(h.controller.getSnapshot().reason).toBe("request_timeout");
    expect(h.signals[0]?.aborted).toBe(true);
    delayed.resolve(reply(hold(h.requests[0]!)));
    await Promise.resolve();
    expect(h.controller.getSnapshot().cycle).toBeNull();
    h.controller.dispose();
    expect(h.timers.size).toBe(0);
  });

  it("ages the shared observation locally, without polling or another HTTP request", async () => {
    const h = harness();
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    h.advance(60_001);
    expect(h.controller.getSnapshot().canEvaluate).toBe(false);
    expect(h.controller.getSnapshot().cycle).toBeNull();
    expect(h.requests).toHaveLength(1);
    h.controller.dispose();
  });

  it("expires the hypothetical plan at the earliest plan/cycle deadline, retaining only history", async () => {
    const h = harness(async (r) => reply(simulated(r)));
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    expect(h.controller.getSnapshot().activePlan?.candidateId).toBe("rt_196_usdt_okb");
    h.advance(8_000);
    expect(h.controller.getSnapshot().status).toBe("expired");
    expect(h.controller.getSnapshot().activePlan).toBeNull();
    expect(h.controller.getSnapshot().cycle?.cycleId).toBe("cycle-0001");
    h.controller.dispose();
  });

  it.each([
    ["protocol", (c: PilotCycle) => { c.protocol = "bad" as never; }],
    ["session", (c: PilotCycle) => { c.sessionId = "other-session"; }],
    ["request", (c: PilotCycle) => { c.requestId = "request-9999"; }],
    ["context", (c: PilotCycle) => { c.contextKey = "unrelated-context"; }],
    ["chain", (c: PilotCycle) => { c.chainId = "0x8f"; }],
    ["chain index", (c: PilotCycle) => { c.chainIndex = "143"; }],
    ["mask", (c: PilotCycle) => { c.maskedAccount = "0x2222...2222"; }],
    ["execution", (c: PilotCycle) => { c.execution = "enabled" as never; }],
    ["source", (c: PilotCycle) => { c.source = "synthetic" as never; }],
    ["schema", (c: PilotCycle) => { delete (c as Partial<PilotCycle>).reasons; }],
    ["extra transaction data", (c: PilotCycle) => { Object.assign(c, { transaction: { data: "0x1234" } }); }],
    ["future completion", (c: PilotCycle) => { c.completedAtMs = NOW + 1; }],
    ["real profit", (c: PilotCycle) => { c.realizedProfitUsd = 1 as never; }],
  ] as const)("rejects an invalid HTTP cycle (%s) through the public seam", async (_name: string, mutate: (c: PilotCycle) => void) => {
    const h = harness(async (r) => { const c = hold(r); mutate(c); return reply(c); });
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    expect(h.controller.getSnapshot().status).toBe("error");
    expect(h.controller.getSnapshot().cycle).toBeNull();
    expect(h.controller.getSnapshot().activePlan).toBeNull();
    h.controller.dispose();
  });

  it.each([
    ["unknown cost", (c: PilotCycle) => { c.inferenceCostUsd = null; }],
    ["unknown units", (c: PilotCycle) => { c.candidates[0]!.from.decimals = null; }],
    ["incomplete costs", (c: PilotCycle) => { c.candidates[0]!.costs.complete = false; }],
    ["invalid confidence", (c: PilotCycle) => { c.decision!.confidence = 1.1; }],
    ["invalid probabilities", (c: PilotCycle) => { c.decision!.probabilities.hold = 0.9; }],
    ["unrelated choice", (c: PilotCycle) => { c.decision!.choice = "another_candidate"; }],
    ["rejected candidate", (c: PilotCycle) => { c.verdicts[0]!.eligible = false; c.verdicts[0]!.reasons = ["costs_incomplete"]; }],
    ["plan identity", (c: PilotCycle) => { c.plan!.candidateId = "other"; }],
    ["plan quote", (c: PilotCycle) => { c.plan!.quoteHash = "d".repeat(32); }],
    ["live qualification", (c: PilotCycle) => { c.plan!.executionQualification = "qualified_live"; }],
    ["stale data", (c: PilotCycle) => { c.observedAtMs = NOW - 60_001; }],
    ["future data", (c: PilotCycle) => { c.observedAtMs = NOW + 1; }],
    ["missing version", (c: PilotCycle) => { c.dataVersion = null; }],
    ["quote older than policy", (c: PilotCycle) => { c.candidates[0]!.quoteAgeMs = 16_000; }],
    ["quote deadline exceeded", (c: PilotCycle) => { c.validUntilMs = NOW + 30_000; c.plan!.expiresAtMs = NOW + 30_000; }],
    ["inventory deadline exceeded", (c: PilotCycle) => { c.observedAtMs = NOW - 59_999; }],
    ["missing quote observation", (c: PilotCycle) => { c.quoteObservedAtMs = null; }],
    ["quote expired during inference", (c: PilotCycle) => { c.quoteObservedAtMs = NOW - 15_001; }],
    ["quote observation in future", (c: PilotCycle) => { c.quoteObservedAtMs = NOW + 1; }],
    ["unverified coverage", (c: PilotCycle) => { Object.assign(c, {coverage:{status:"unknown",chains:[],valueComplete:null,unitsQualified:null,quoteCostsComplete:null,assetCount:null}}); }],
    ["private coverage data", (c: PilotCycle) => { Object.assign(c, {coverage:{status:"qualified",chains:["196"],valueComplete:true,unitsQualified:true,quoteCostsComplete:true,assetCount:2,address:account}}); }],
    ["unavailable simulation", (c: PilotCycle) => { c.source = "unavailable"; }],
  ] as const)("blocks an unqualified simulated result (%s)", async (_name: string, mutate: (c: PilotCycle) => void) => {
    const h = harness(async (r) => { const c = simulated(r); mutate(c); return reply(c); });
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    expect(h.controller.getSnapshot().status).toBe("error");
    expect(h.controller.getSnapshot().activePlan).toBeNull();
    h.controller.dispose();
  });

  it.each([
    ["HTTP failure", () => new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } })],
    ["non JSON", () => new Response("{}", { headers: { "Content-Type": "text/html" } })],
    ["malformed JSON", () => new Response("{broken", { headers: { "Content-Type": "application/json" } })],
    ["oversized response", () => new Response(" ".repeat(131_073), { headers: { "Content-Type": "application/json" } })],
  ] as const)("fails closed on %s", async (_name: string, respond: () => Response) => {
    const h = harness(async () => respond());
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    expect(h.controller.getSnapshot().status).toBe("error");
    expect(h.controller.getSnapshot().cycle).toBeNull();
    h.controller.dispose();
  });

  it("rejects a nonfinite number encoded on the wire (JSON.stringify would silently replace Infinity with null)", async () => {
    const h = harness(async r => new Response(JSON.stringify(hold(r)).replace('"knownValueUsd":null', '"knownValueUsd":1e999'),
      { headers: { "Content-Type": "application/json" } }));
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    expect(h.controller.getSnapshot().reason).toBe("invalid_response");
    expect(h.controller.getSnapshot().cycle).toBeNull();
    h.controller.dispose();
  });
});

describe("pilot visual contract — shared snapshot only", () => {
  it("renders a recorded expired hold and its actual reason without an active plan", async () => {
    const h = harness(async r => { const c = hold(r); c.reasons = ["inventory_access_unverified"]; return reply(c); });
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    const html = renderToStaticMarkup(createElement(GevPilotPanelView, { snapshot: wallet(), state: h.controller.getSnapshot(), nowMs: NOW, onEvaluate: () => {} }));
    expect(html).toContain("Acesso ao inventário não verificado");
    expect(html).toContain("Fonte indisponível");
    expect(html).toContain("Lucro real");
    expect(html).toContain("desconhecido");
    expect(html).toContain("Avaliar em simulação");
    expect(html).not.toContain("Plano hipotético ativo");
    expect(html).not.toContain(account);
    h.controller.dispose();
  });

  it("labels fixture, confidence and hypothetical return explicitly, then hides expired steps", async () => {
    const h = harness(async r => reply(simulated(r)));
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    const state = h.controller.getSnapshot();
    const render = (nowMs: number) => renderToStaticMarkup(createElement(GevPilotPanelView, { snapshot: wallet(), state, nowMs, onEvaluate: () => {} }));
    expect(render(NOW)).toContain("Fixture de teste");
    expect(render(NOW)).toContain("não é probabilidade de ganho");
    expect(render(NOW)).toContain("Resultado líquido hipotético");
    expect(render(NOW)).toContain("Plano hipotético ativo");
    expect(render(NOW)).toContain("X Layer, 2 ativos, valor completo na fonte");
    expect(render(NOW)).toContain("qualificados na fonte");
    expect(render(NOW + 8_000)).not.toContain("Etapa hipotética USDT");
    expect(render(NOW + 8_000)).toContain("Ciclo expirado");
    h.controller.dispose();
  });

  it.each([
    ["same-mask account", () => wallet({ account: "0x1111222222222222222222222222222222221111" })],
    ["reading", () => wallet({ status: "reading" })],
    ["block", () => wallet({ balances: balances("0x7c") })],
    ["observation", () => wallet({ observedAtMs: NOW - 1 })],
    ["network", () => wallet({ chainId: "0x8f" })],
    ["disconnected", () => wallet({ status: "disconnected" })],
    ["stale", () => wallet({ observedAtMs: NOW - 60_001 })],
  ] as const)("hides prior result on %s during render, without waiting for effects", async (_name: string, changed: () => WalletSnapshot) => {
    const h = harness(async r => reply(simulated(r)));
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    const state = h.controller.getSnapshot();
    expect(gevPilotStateForWallet(state, changed(), NOW).activePlan).toBeNull();
    const html = renderToStaticMarkup(createElement(GevPilotPanelView, { snapshot: changed(), state, nowMs: NOW, onEvaluate: () => {} }));
    expect(html).not.toContain("cycle-0001");
    expect(html).not.toContain("Plano hipotético ativo");
    expect(html).toContain("disabled");
    h.controller.dispose();
  });

  it("shows candidate gate rejections and a real source declaration without claiming verified P2", async () => {
    const h = harness(async r => {
      const c = simulated(r);
      c.status = "hold"; c.source = "real"; c.decision = null; c.plan = null; c.inferenceCostUsd = null;
      c.verdicts[0] = { candidateId: c.candidates[0]!.id, eligible: false, reasons: ["net_below_minimum"] };
      c.reasons = ["no_eligible_candidate"];
      return reply(c);
    });
    h.controller.setWallet(wallet());
    await h.controller.evaluate();
    const html = renderToStaticMarkup(createElement(GevPilotPanelView, { snapshot: wallet(), state: h.controller.getSnapshot(), nowMs: NOW, onEvaluate: () => {} }));
    expect(html).toContain("Fonte real");
    expect(html).toContain("Rejeitado");
    expect(html).toContain("net_below_minimum");
    expect(html).toContain("Acesso real ainda não certificado");
    expect(html).toContain("Cobertura do inventário");
    expect(html).toContain("X Layer, 2 ativos, valor completo na fonte");
    h.controller.dispose();
  });
});
