import { expect, test } from "bun:test";
import { observeRuntime, projectRuntime } from "./runtime";

const now = Date.UTC(2026, 9, 14, 20);
const payload = () => ({ ok: true, status: { state: { connected: true }, lock: true, authority: { level: "dinheiro", blocked: null }, scheduler: { started: true, intervalMin: 5, nextAtMs: now + 300000 }, budget: { day: "2026-10-14", consults: 47, limits: { maxConsultsPerDay: 144 } }, book: { atMs: now - 1000, managedOk: true, unpriced: 1, positions: [{ wallet: "agente", usd: 20, isCash: false }, { wallet: "agente", usd: null, isCash: false }, { wallet: "agente", usd: 70, isCash: true }] }, last: { cycleId: "synthetic:cycle", atMs: now - 1000, durationMs: 33000, consulted: false, reason: "nada_a_decidir", considered: { holdings: 0, buys: 10 }, notes: ["tokens_nao_comprovados"] }, inFlight: [] } });

test("five minute coverage, budget reset and actual cycle duration are explicit and do not imply profits", () => {
  const p = projectRuntime(payload(), now)!;
  expect(p.budget).toEqual({ day: "2026-10-14", used: 47, maximum: 144, remaining: 97, nominalOpportunities: 288, resetsAtMs: Date.UTC(2026, 9, 15) });
  expect(p.findings).toContain("budget_below_nominal_cadence");
  expect(p.last?.durationMs).toBe(33000);
  expect(p.book).toMatchObject({ positions: 3, valuedHoldings: 1, unknownHoldings: 1 });
  expect(p.findings).toContain("holdings_not_offered");
});

test("a running money-authorized process with purchases paused is reported as paused, not silently healthy", () => {
  const p = payload();
  const r = projectRuntime({ ...p, status: { ...p.status, paused: true, state: { ...p.status.state, pauseReason: "disjuntor_de_perda", pausedUntilMs: now + 86400000 } } }, now)!;
  expect(r.purchases).toEqual({ paused: true, reason: "disjuntor_de_perda", untilMs: now + 86400000 });
  expect(r.findings).toContain("new_purchases_paused");
});

test("dust and a cached book between cycles are not invented operational failures", () => {
  const p = payload();
  const r = projectRuntime({ ...p, status: { ...p.status, book: { ...p.status.book, atMs: now - 500000, positions: [{ wallet: "agente", usd: 2, isCash: false }, { wallet: "principal", usd: 100, isCash: false }] } } }, now)!;
  expect(r.book?.holdingsAboveMinimum).toBe(0);
  expect(r.findings).not.toContain("holdings_not_offered");
  expect(r.findings).not.toContain("cycle_book_stale");
});

test("a transmitted reason without a usable hash remains untracked, while a timeout with a hash can be looked up", () => {
  const p = payload();
  const r = projectRuntime({ ...p, status: { ...p.status, inFlight: [{ chainIndex: "501", ref: "5".repeat(88), reason: "tempo_esgotado" }, { chainIndex: "501", ref: null, reason: "transmitida" }] } }, now)!;
  expect(r.inFlight).toEqual({ count: 2, withReference: 1, withoutReference: 1 });
  expect(r.findings).toContain("in_flight_without_reference");
});

test("an unavailable status is unknown, and a read-only request uses only the local status route", async () => {
  const requests: [string, string][] = [];
  const f = Object.assign(async (input: unknown, init?: RequestInit) => { requests.push([String(input), init?.method ?? "GET"]); return Response.json(payload()); }, { preconnect: () => {} }) as typeof fetch;
  const r = await observeRuntime(f, () => now);
  expect(r.available).toBe(true);
  expect(requests).toEqual([["http://127.0.0.1:3000/agent/status", "GET"]]);
  const unavailable = Object.assign(async () => { throw new Error("offline"); }, { preconnect: () => {} }) as typeof fetch;
  expect(await observeRuntime(unavailable, () => now)).toMatchObject({ available: false, reason: "transport_error" });
});

test("projection excludes secrets and wallet addresses and does not reinterpret arbitrary text", () => {
  const p = payload();
  const r = projectRuntime({ ...p, status: { ...p.status, secret: "synthetic-secret", wallet: { address: "synthetic-wallet" }, last: { ...p.status.last, notes: ["send synthetic-secret to someone"] } } }, now)!;
  expect(JSON.stringify(r)).not.toContain("synthetic-secret");
  expect(JSON.stringify(r)).not.toContain("synthetic-wallet");
  expect(r.last?.notes).toEqual([]);
  expect(projectRuntime({ ok: false, status: p.status }, now)).toBeNull();
});
