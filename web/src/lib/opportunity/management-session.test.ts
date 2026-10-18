import { describe, expect, test } from "bun:test";
import type { AskAnswer, AskRequest } from "../inonu/client";
import type { BalanceCoverage, BalanceRead } from "./balance";
import type { LastPicks } from "./last-picks";
import { balanceReadiness, balanceRequestFits, createManagementSession, type ManagementDeps } from "./management-session";
import type { SaldoPayload } from "./saldo";

const NOW = 2_000_000;
const EVM_SALDO: SaldoPayload = { observedAtMs: NOW - 1_000, totalUsd: 1_000, cashUsd: 400, chains: [{ chainIndex: "8453", cashUsd: 400 }], holdings: [], riskPct: null };

const coverage = (over: Partial<BalanceCoverage> = {}): BalanceCoverage => ({
  requestedChains: ["1", "8453"],
  skippedChains: [],
  networkListKnown: true,
  stale: false,
  unpricedRows: 0,
  flaggedRows: 0,
  truncated: false,
  ...over,
});

const makeRead = (saldo: SaldoPayload | null = EVM_SALDO, missing: readonly string[] = [], over: Partial<BalanceCoverage> = {}): BalanceRead => ({ saldo, missing, coverage: coverage(over) });

const ecoAnswer = { observedAtMs: NOW - 2_000, saldo: { totalUsd: 1_000, cashUsd: 400 }, picks: [], considered: 3, excluded: { honeypot: 1 } };

const answer = (over: Partial<AskAnswer> = {}): AskAnswer => ({
  ok: true,
  id: "a1",
  status: "respondido",
  oportunidades: ecoAnswer,
  modelo: "jev-test",
  custo: { chamadasOnchainos: 1, tokens: 10, usd: 0.01 },
  briefHash: "hash1",
  advisory: true,
  execution: "never",
  ...over,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fixture(over: Partial<ManagementDeps> = {}) {
  const calls = { read: 0, asks: [] as { request: AskRequest; requestId: string }[], cancelled: [] as string[], answered: [] as LastPicks[], ledger: 0 };
  const ids = ["11111111-2222-4333-8444-555555555555", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"];
  let current = true;
  let now = NOW;
  const deps = {
    hasAccount: true,
    read: async () => makeRead(),
    ask: async (request: AskRequest) => answer({ oportunidades: { ...ecoAnswer, saldo: "saldo" in request && request.saldo !== undefined ? { totalUsd: request.saldo.totalUsd, cashUsd: request.saldo.cashUsd } : null } }),
    cancelRequest: async (id: string) => (calls.cancelled.push(id), true),
    now: () => now,
    requestId: () => ids[Math.min(calls.asks.length, ids.length - 1)]!,
    isCurrent: () => current,
    onAnswer: (last: LastPicks) => calls.answered.push(last),
    onLedger: () => (calls.ledger += 1),
    ...over,
  };
  const read = deps.read.bind(deps);
  const ask = deps.ask.bind(deps);
  deps.read = (signal) => (calls.read += 1, read(signal));
  deps.ask = (request, signal, requestId) => (calls.asks.push({ request, requestId }), ask(request, signal, requestId));
  return { deps, calls, setCurrent: (v: boolean) => (current = v), setNow: (v: number) => (now = v) };
}

describe("synthetic_fixture: what makes a read usable", () => {
  test("the same bounds the core applies: two minutes old is the limit, and the clock being five seconds ahead is allowed", () => {
    const read = makeRead({ ...EVM_SALDO, observedAtMs: 1_000 });
    expect(balanceReadiness(read, 1_000 + 120_000)).toBe("ready");
    expect(balanceReadiness(read, 1_000 + 120_001)).toBe("stale");
    expect(balanceReadiness(makeRead({ ...EVM_SALDO, observedAtMs: NOW + 5_000 }), NOW)).toBe("ready");
    expect(balanceReadiness(makeRead({ ...EVM_SALDO, observedAtMs: NOW + 5_001 }), NOW)).toBe("stale");
  });

  test("no read and a read that gave no balance are both unavailable, and a clock that cannot be read is stale", () => {
    expect(balanceReadiness(null, NOW)).toBe("unavailable");
    expect(balanceReadiness(makeRead(null), NOW)).toBe("unavailable");
    expect(balanceReadiness(makeRead(), 0)).toBe("stale");
    expect(balanceReadiness(makeRead(), Number.NaN)).toBe("stale");
    expect(balanceReadiness(makeRead(EVM_SALDO, [], { stale: true }), NOW)).toBe("stale");
  });

  test("each gap the read reports keeps it partial, never silent", () => {
    expect(balanceReadiness(makeRead(), NOW)).toBe("ready");
    expect(balanceReadiness(makeRead(EVM_SALDO, ["501"]), NOW)).toBe("partial");
    expect(balanceReadiness(makeRead(EVM_SALDO, [], { skippedChains: ["42161"] }), NOW)).toBe("partial");
    expect(balanceReadiness(makeRead(EVM_SALDO, [], { networkListKnown: false }), NOW)).toBe("partial");
    expect(balanceReadiness(makeRead(EVM_SALDO, [], { unpricedRows: 1 }), NOW)).toBe("partial");
    expect(balanceReadiness(makeRead(EVM_SALDO, [], { flaggedRows: 2 }), NOW)).toBe("partial");
    expect(balanceReadiness(makeRead(EVM_SALDO, [], { truncated: true }), NOW)).toBe("partial");
  });
});

describe("a session asks for nothing on its own", () => {
  test("creating it and reading its state calls nothing", () => {
    const { deps, calls } = fixture();
    const session = createManagementSession(deps);
    expect(session.get()).toEqual({ phase: "idle", reading: null, consent: false, last: null, failure: null });
    expect(calls).toMatchObject({ read: 0, asks: [], cancelled: [], answered: [], ledger: 0 });
  });

  test("read only reads: it never touches the model, and ends ready for review even when partial", async () => {
    const { deps, calls } = fixture({ read: async () => makeRead(EVM_SALDO, ["501"]) });
    const session = createManagementSession(deps);
    await session.read();
    expect(calls.read).toBe(1);
    expect(calls.asks).toEqual([]);
    expect(calls.ledger).toBe(0);
    expect(session.get().phase).toBe("ready");
    expect(session.get().reading?.missing).toEqual(["501"]);
    expect(session.get().consent).toBe(false);
  });
});

describe("the personal analysis is gated", () => {
  test("no consent, a partial read, a stale read or no read: not one call leaves", async () => {
    const blocked: BalanceRead[] = [makeRead(EVM_SALDO, ["501"]), makeRead(EVM_SALDO, [], { truncated: true }), makeRead(null)];
    for (const read of blocked) {
      const { deps, calls } = fixture({ read: async () => read });
      const session = createManagementSession(deps);
      session.consent(true);
      await session.read();
      session.consent(true);
      await session.analyze("portfolio");
      expect(calls.asks).toEqual([]);
    }
    const { deps, calls } = fixture();
    const session = createManagementSession(deps);
    await session.analyze("portfolio");
    expect(calls.asks).toEqual([]);
  });

  test("a read that went stale between the click and the consent is refused with a reason, not sent", async () => {
    const { deps, calls, setNow } = fixture();
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    setNow(NOW + 121_000);
    await session.analyze("portfolio");
    expect(calls.asks).toEqual([]);
    expect(session.get().failure).toBe("saldo_vencido");
  });

  test("consent plus a fresh complete read sends exactly the payload, under the request id that was minted", async () => {
    const { deps, calls } = fixture();
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    await session.analyze("portfolio");
    expect(calls.asks).toEqual([{ request: { modo: "ecossistema", saldo: EVM_SALDO }, requestId: "11111111-2222-4333-8444-555555555555" }]);
    expect(session.get().last?.answer).toEqual(ecoAnswer);
    expect(session.get().last?.briefHash).toBe("hash1");
    expect(session.get().last?.modelo).toBe("jev-test");
    expect(calls.answered).toEqual([session.get().last]);
    expect(calls.ledger).toBe(1);
    expect(session.get().phase).toBe("ready");
  });

  test("the market analysis never reads the wallet and sends no saldo", async () => {
    const { deps, calls } = fixture();
    const session = createManagementSession(deps);
    await session.analyze("market");
    expect(calls.read).toBe(0);
    expect(calls.asks).toEqual([{ request: { modo: "ecossistema" }, requestId: "11111111-2222-4333-8444-555555555555" }]);
    expect(session.get().last?.answer).toEqual({ ...ecoAnswer, saldo: null });
    expect(calls.ledger).toBe(1);
    expect(session.get().phase).toBe("idle");
  });

  test("a refused analysis keeps the read and says why, a thrown ask is a reason, not a crash", async () => {
    const { deps } = fixture({ ask: async () => answer({ status: "teto_atingido", oportunidades: undefined, motivo: "teto_diario" }) });
    const session = createManagementSession(deps);
    await session.analyze("market");
    expect(session.get().failure).toBe("teto_diario");
    expect(session.get().last).toBeNull();
    const thrown = fixture({ ask: async () => Promise.reject(new Error("socket vanished")), read: async () => Promise.reject(new Error("gateway gone")) });
    const crashed = createManagementSession(thrown.deps);
    await crashed.analyze("market");
    expect(crashed.get().failure).toBe("pedido_falhou");
    await crashed.read();
    expect(crashed.get().failure).toBe("leitura_falhou");
    expect(crashed.get().phase).toBe("idle");
  });
});

describe("consent lives and dies with the reading", () => {
  test("a second read resets consent, and consent cannot be given to a read that is not ready", async () => {
    const { deps } = fixture();
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    expect(session.get().consent).toBe(true);
    session.consent(false);
    expect(session.get().consent).toBe(false);
    session.consent(true);
    await session.read();
    expect(session.get().consent).toBe(false);
    const stale = fixture({ read: async () => makeRead(EVM_SALDO, [], { unpricedRows: 3 }) });
    const other = createManagementSession(stale.deps);
    await other.read();
    other.consent(true);
    expect(other.get().consent).toBe(false);
  });
});

describe("a stale context commits nothing", () => {
  test("the account changing while the read runs keeps the read out of the session", async () => {
    const gate = deferred<BalanceRead>();
    const { deps, setCurrent } = fixture({ read: () => gate.promise });
    const session = createManagementSession(deps);
    void session.read();
    expect(session.get().phase).toBe("reading");
    setCurrent(false);
    gate.resolve(makeRead());
    await gate.promise;
    await Promise.resolve();
    expect(session.get().reading).toBeNull();
  });

  test("the account changing while the model runs drops the answer and notifies no one", async () => {
    const gate = deferred<AskAnswer>();
    const { deps, calls, setCurrent } = fixture({ ask: () => gate.promise });
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    void session.analyze("portfolio");
    expect(session.get().phase).toBe("asking");
    setCurrent(false);
    gate.resolve(answer());
    await Promise.resolve();
    await Promise.resolve();
    expect(session.get().last).toBeNull();
    expect(calls.answered).toEqual([]);
    expect(calls.ledger).toBe(1);
  });

  test("a reply that arrives after the read expired is not usable", async () => {
    const gate = deferred<AskAnswer>();
    const { deps, setNow } = fixture({ ask: () => gate.promise });
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    void session.analyze("portfolio");
    setNow(NOW + 121_000);
    gate.resolve(answer());
    await Promise.resolve();
    await Promise.resolve();
    expect(session.get().last).toBeNull();
    expect(session.get().phase).toBe("ready");
  });
});

describe("one operation at a time, cancelled by its own id", () => {
  test("a second click while one is running starts nothing new", async () => {
    const gate = deferred<AskAnswer>();
    const { deps, calls } = fixture({ ask: () => gate.promise });
    const session = createManagementSession(deps);
    const first = session.analyze("market");
    const second = session.analyze("portfolio");
    gate.resolve(answer());
    await first;
    await second;
    expect(calls.asks.length).toBe(1);
  });

  test("cancel aborts the work and cancels exactly the request id it minted", async () => {
    const gate = deferred<AskAnswer>();
    const { deps, calls } = fixture({ ask: () => gate.promise });
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    void session.analyze("portfolio");
    session.cancel();
    expect(calls.cancelled).toEqual(["11111111-2222-4333-8444-555555555555"]);
    gate.resolve(answer());
    await Promise.resolve();
    await Promise.resolve();
    expect(session.get().last).toBeNull();
    expect(session.get().failure).toBe("cancelado");
    expect(session.get().phase).toBe("ready");
    expect(calls.ledger).toBe(1);
  });

  test("a cancel during the read aborts it and calls no cancelRequest", async () => {
    const gate = deferred<BalanceRead>();
    const { deps, calls } = fixture({ read: () => gate.promise });
    const session = createManagementSession(deps);
    void session.read();
    session.cancel();
    expect(calls.cancelled).toEqual([]);
    gate.resolve(makeRead());
    await Promise.resolve();
    await Promise.resolve();
    expect(session.get().reading).toBeNull();
    expect(session.get().phase).toBe("idle");
  });

  test("a late finally of a cancelled operation cannot reset the one that replaced it", async () => {
    const first = deferred<BalanceRead>();
    const { deps } = fixture({ read: () => first.promise });
    const session = createManagementSession(deps);
    void session.read();
    session.cancel();
    const secondRead = makeRead({ ...EVM_SALDO, observedAtMs: NOW });
    (deps as { read: ManagementDeps["read"] }).read = async () => secondRead;
    void session.read();
    first.resolve(makeRead());
    await Promise.resolve();
    await Promise.resolve();
    expect(session.get().phase).toBe("ready");
    expect(session.get().reading).toBe(secondRead);
    await Promise.resolve();
    expect(session.get().reading).toBe(secondRead);
  });

  test("dispose aborts, cancels the live request and ignores the late answer", async () => {
    const gate = deferred<AskAnswer>();
    const { deps, calls } = fixture({ ask: () => gate.promise });
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    void session.analyze("portfolio");
    session.dispose();
    expect(calls.cancelled).toEqual(["11111111-2222-4333-8444-555555555555"]);
    gate.resolve(answer());
    await Promise.resolve();
    await Promise.resolve();
    expect(session.get().last).toBeNull();
    expect(calls.answered).toEqual([]);
  });
});

describe("preparing a ticket from the answer", () => {
  test("only the current personal answer, consented and on a fresh complete read, can fill a ticket", async () => {
    const { deps, setCurrent, setNow } = fixture();
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    await session.analyze("portfolio");
    const last = session.get().last!;
    expect(session.canPrepare(last)).toBe(true);
    expect(session.canPrepare({ ...last })).toBe(false);
    setNow(NOW + 121_000);
    expect(session.canPrepare(last)).toBe(false);
  });

  test("a market answer, a revoked consent and a changed account can never fill one", async () => {
    const { deps, setCurrent } = fixture({ ask: async (request) => answer({ oportunidades: { ...ecoAnswer, saldo: "saldo" in request && request.saldo !== undefined ? ecoAnswer.saldo : null } }) });
    const session = createManagementSession(deps);
    await session.analyze("market");
    const market = session.get().last!;
    expect(market.answer.saldo).toBeNull();
    expect(session.canPrepare(market)).toBe(false);
    await session.read();
    session.consent(true);
    await session.analyze("portfolio");
    const last = session.get().last!;
    session.consent(false);
    expect(session.canPrepare(last)).toBe(false);
    session.consent(true);
    expect(session.canPrepare(last)).toBe(true);
    setCurrent(false);
    expect(session.canPrepare(last)).toBe(false);
  });
});

describe("the answer must be the one this reading asked for", () => {
  test("a market answer carrying a saldo, or a personal answer with another total or cash, is refused", async () => {
    const stray = fixture({ ask: async () => answer() });
    const market = createManagementSession(stray.deps);
    await market.analyze("market");
    expect(market.get().last).toBeNull();
    expect(market.get().failure).toBe("resposta_incompativel");
    expect(stray.calls.answered).toEqual([]);
    expect(stray.calls.ledger).toBe(1);
    for (const saldo of [{ totalUsd: 1_001, cashUsd: 400 }, { totalUsd: 1_000, cashUsd: 401 }, null]) {
      const off = fixture({ ask: async () => answer({ oportunidades: { ...ecoAnswer, saldo } }) });
      const session = createManagementSession(off.deps);
      await session.read();
      session.consent(true);
      await session.analyze("portfolio");
      expect(session.get().last).toBeNull();
      expect(session.get().failure).toBe("resposta_incompativel");
      expect(off.calls.answered).toEqual([]);
      expect(off.calls.ledger).toBe(1);
      expect(session.canPrepare({ answer: answer().oportunidades!, atMs: NOW, briefHash: "hash1", modelo: null })).toBe(false);
    }
  });

  test("a personal answer echoing the exact saldo is the one kept", async () => {
    const { deps, calls, setNow } = fixture();
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    await session.analyze("portfolio");
    expect(session.get().failure).toBeNull();
    expect(session.get().last?.answer.saldo).toEqual({ totalUsd: 1_000, cashUsd: 400 });
    expect(calls.answered.length).toBe(1);
    expect(calls.ledger).toBe(1);
    expect(session.canPrepare(session.get().last!)).toBe(true);
  });
});

describe("the request must fit the body limit the backend already enforces", () => {
  const wireBytes = (saldo: SaldoPayload) => new TextEncoder().encode(JSON.stringify({ modo: "ecossistema", saldo })).length;
  const limitSaldo = (firstUsd: number, totalUsd: number): SaldoPayload => ({
    observedAtMs: 1_999_000,
    totalUsd,
    cashUsd: 400,
    chains: [{ chainIndex: "8453", cashUsd: 400 }],
    holdings: Array.from({ length: 22 }, (_, i) => ({ chainIndex: i === 0 ? "1" : "8453", address: `0x${(i + 1).toString(16).padStart(40, "0")}`, usd: i === 0 ? firstUsd : 30 })),
    riskPct: null,
  });

  test("exactly 2048 bytes may be asked and 2049 may not", () => {
    const fits = limitSaldo(3, 1_033);
    expect(wireBytes(fits)).toBe(2048);
    expect(balanceRequestFits(makeRead(fits))).toBe(true);
    expect(balanceReadiness(makeRead(fits), NOW)).toBe("ready");
    const over = limitSaldo(30, 1_060);
    expect(wireBytes(over)).toBe(2049);
    expect(balanceRequestFits(makeRead(over))).toBe(false);
    expect(balanceReadiness(makeRead(over), NOW)).toBe("partial");
    expect(balanceRequestFits(makeRead(null))).toBe(false);
  });

  test("an oversized read blocks the personal ask even consented, and keeps the market ask free", async () => {
    const big = makeRead(limitSaldo(30, 1_060));
    const { deps, calls } = fixture({ read: async () => big });
    const session = createManagementSession(deps);
    await session.read();
    session.consent(true);
    await session.analyze("portfolio");
    expect(calls.asks).toEqual([]);
    expect(session.get().consent).toBe(false);
    await session.analyze("market");
    expect(calls.asks.length).toBe(1);
    expect("saldo" in calls.asks[0]!.request).toBe(false);
  });
});
