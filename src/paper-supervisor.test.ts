import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PaperCapital,
  type PaperCapitalConfig,
  type PaperPlan,
  type PaperReceipt,
} from "./paper-capital";
import {
  PaperSupervisorError,
  PaperSupervisor,
  type PaperAdapterResult,
  canonicalJson,
  canonicalEnvelope,
  createInitialEnvelope,
  sealEnvelope,
  validateEnvelope,
  type PaperSupervisorAdapter,
  type PaperSupervisorEnvelope,
  type PaperSupervisorStore,
  type PaperSupervisorTickResult,
} from "./paper-supervisor";
import { SqlitePaperSupervisorStore } from "./paper-supervisor-store";

const asset = { chainId: "31337", token: "native", decimals: 0, venue: "synthetic" } as const;
const config: PaperCapitalConfig = {
  asset,
  initialAtoms: "1000",
  maxCommittedAtoms: "400",
  maxDrawdownAtoms: "100",
};
const plan: PaperPlan = { id: "core-gain", asset, inputAtoms: "100", costBudgetAtoms: "10" };
const testRoots: string[] = [];

function newTestRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "inonu-supervisor-core-"));
  testRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of testRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reseal(envelope: PaperSupervisorEnvelope, changes: Partial<Omit<PaperSupervisorEnvelope, "sha256">>): PaperSupervisorEnvelope {
  const { sha256: _discard, ...body } = envelope;
  return sealEnvelope({ ...body, ...changes });
}

function observedEnvelope(returnedAtoms: string, id: string): PaperSupervisorEnvelope {
  const currentPlan: PaperPlan = { ...plan, id };
  const capital = new PaperCapital(config);
  capital.reserve(currentPlan);
  capital.start(currentPlan.id);
  const initial = createInitialEnvelope({ config, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
  const { sha256: _discard, ...body } = initial;
  return sealEnvelope({
    ...body,
    capital: capital.checkpoint(),
    attempts: [{
      attemptId: "e".repeat(32),
      planId: currentPlan.id,
      planSha256: createHash("sha256").update(canonicalJson(currentPlan)).digest("hex"),
      phase: "observed",
      observation: {
        evidenceId: "f".repeat(128),
        receipt: {
          receiptId: id,
          planId: currentPlan.id,
          asset,
          inputAtoms: currentPlan.inputAtoms,
          returnedAtoms,
          externalCostAtoms: "0",
          costsComplete: true,
          outcome: "completed",
        },
      },
    }],
  });
}

function memoryStore(initial?: PaperSupervisorEnvelope, createdFresh = true): PaperSupervisorStore {
  let envelope: PaperSupervisorEnvelope = initial ?? createInitialEnvelope({
    config,
    adapterId: "core-test-v1",
    owner: { token: "a".repeat(32), pid: 701 },
  });
  return {
    createdFresh,
    async load() { return copy(envelope); },
    async assertOwner(expectedGeneration) {
      expect(envelope.generation).toBe(expectedGeneration);
      expect(envelope.owner).toEqual({ token: "a".repeat(32), pid: 701 });
    },
    async publish(expectedGeneration, next) {
      expect(envelope.generation).toBe(expectedGeneration);
      expect(next.generation).toBe(expectedGeneration + 1);
      envelope = copy(next);
      return copy(envelope);
    },
    async release(expectedGeneration) {
      expect(envelope.generation).toBe(expectedGeneration);
      const { sha256: _sha256, ...body } = envelope;
      envelope = sealEnvelope({ ...body, generation: expectedGeneration + 1, owner: null });
      return copy(envelope);
    },
    async close() {},
  };
}

describe("PaperSupervisor durable lifecycle", () => {
  test("strictly validates canonical envelopes, links, accessors, flags, and identifier/digit boundaries", () => {
    const base = createInitialEnvelope({ config, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
    const escapedId = Array.from({ length: 128 }, (_unused, index) => index % 2 === 0 ? "\\" : '"').join("");
    const maximumReceipt = observedEnvelope("9".repeat(4096), escapedId);
    expect(validateEnvelope(maximumReceipt, { config, adapterId: "core-test-v1" }).attempts[0]?.observation?.receipt.returnedAtoms).toHaveLength(4096);
    expect(() => validateEnvelope(observedEnvelope("9".repeat(4097), escapedId))).toThrow();
    expect(() => validateEnvelope(observedEnvelope("01", escapedId))).toThrow();
    expect(() => validateEnvelope(observedEnvelope("1", `${escapedId}x`))).toThrow();
    expect(() => validateEnvelope(maximumReceipt, { config, adapterId: "other-adapter" })).toThrow("identity_mismatch");
    expect(() => validateEnvelope(base, { config: { ...config, initialAtoms: "1001" }, adapterId: "core-test-v1" })).toThrow("identity_mismatch");

    const invalid: unknown[] = [
      reseal(base, { generation: 1_000_001 }),
      reseal(base, { adapterId: "a".repeat(129) }),
      reseal(base, { configSha256: "b".repeat(64) }),
      reseal(base, { owner: { token: "not-a-token", pid: 701 } }),
      reseal(base, { owner: { token: "a".repeat(32), pid: 0 } }),
      reseal(base, { hold: "forged" as "adapter_contract" }),
      reseal(base, { capital: {} as PaperSupervisorEnvelope["capital"] }),
      reseal(maximumReceipt, { attempts: [{ ...maximumReceipt.attempts[0]!, planId: "missing-plan" }] }),
      reseal(maximumReceipt, { attempts: [maximumReceipt.attempts[0]!, { ...maximumReceipt.attempts[0]!, planId: "missing-plan" }] }),
    ];
    for (const candidate of invalid) expect(() => validateEnvelope(candidate)).toThrow();

    const invalidFlags = [
      { strategyQualified: true },
      { financiallyAuthorized: true },
      { mode: "live" },
      { version: 2 },
    ];
    for (const patch of invalidFlags) {
      const { sha256: _discard, ...body } = base;
      const candidate = sealEnvelope({ ...body, ...patch } as unknown as Omit<PaperSupervisorEnvelope, "sha256">);
      expect(() => validateEnvelope(candidate)).toThrow();
    }

    const extraKey = copy(base) as unknown as Record<string, unknown>;
    extraKey.unrecognized = false;
    expect(() => validateEnvelope(extraKey)).toThrow("invalid_envelope");
    const nestedExtra = copy(base);
    (nestedExtra.owner as unknown as Record<string, unknown>).unrecognized = "x";
    expect(() => validateEnvelope(nestedExtra)).toThrow("invalid_envelope");
    const symbolic = copy(base) as unknown as Record<PropertyKey, unknown>;
    symbolic[Symbol("hidden")] = true;
    expect(() => validateEnvelope(symbolic)).toThrow("invalid_envelope");
    let getterCalls = 0;
    const accessor = copy(base) as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "generation", { enumerable: true, configurable: true, get() { getterCalls++; return 0; } });
    expect(() => validateEnvelope(accessor)).toThrow("invalid_envelope");
    expect(getterCalls).toBe(0);
    const cycle = copy(base) as unknown as Record<string, unknown>;
    (cycle.capital as Record<string, unknown>).cycle = cycle;
    expect(() => validateEnvelope(cycle)).toThrow("invalid_envelope");
    const customPrototype = copy(base);
    Object.setPrototypeOf(customPrototype.capital.config.asset, new Date());
    expect(() => validateEnvelope(customPrototype)).toThrow("invalid_envelope");

    const reordered = copy(base);
    const capitalEntries = Object.entries(reordered.capital).reverse();
    reordered.capital = Object.fromEntries(capitalEntries) as unknown as PaperSupervisorEnvelope["capital"];
    const reorderedEnvelope = reseal(reordered, {});
    expect(() => validateEnvelope(reorderedEnvelope)).toThrow("invalid_envelope");

    const damagedChecksum = copy(base);
    damagedChecksum.sha256 = "0".repeat(64);
    expect(() => validateEnvelope(damagedChecksum)).toThrow("invalid_envelope");
    const malformedChecksum = copy(base);
    malformedChecksum.sha256 = "bad";
    expect(() => validateEnvelope(malformedChecksum)).toThrow("invalid_envelope");
  });

  test("bounds all persisted capital config and reserve fields before accepting a checkpoint", () => {
    const large = "9".repeat(4097);
    const oversizedConfig: PaperCapitalConfig = { ...config, initialAtoms: large, maxCommittedAtoms: large };
    const oversizedConfigEnvelope = createInitialEnvelope({ config: oversizedConfig, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
    expect(() => validateEnvelope(oversizedConfigEnvelope)).toThrow("invalid_envelope");

    const largeCapital = new PaperCapital(oversizedConfig);
    largeCapital.reserve({ ...plan, id: "bounded-plan", inputAtoms: large, costBudgetAtoms: "0" });
    const initial = createInitialEnvelope({ config: oversizedConfig, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
    const { sha256: _discard, ...body } = initial;
    const oversizedReserveAmount = sealEnvelope({ ...body, capital: largeCapital.checkpoint() });
    expect(() => validateEnvelope(oversizedReserveAmount)).toThrow("invalid_envelope");

    const oversizedPlanIdLedger = new PaperCapital(config);
    oversizedPlanIdLedger.reserve({ ...plan, id: "p".repeat(129) });
    const normalInitial = createInitialEnvelope({ config, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
    const { sha256: _normalDiscard, ...normalBody } = normalInitial;
    const oversizedPlanId = sealEnvelope({ ...normalBody, capital: oversizedPlanIdLedger.checkpoint() });
    expect(() => validateEnvelope(oversizedPlanId)).toThrow("invalid_envelope");
  });

  test("refuses an oversized envelope before replaying its capital journal", () => {
    const ledger = new PaperCapital(config);
    for (let index = 0; index < 256; index++) {
      const id = `${index.toString().padStart(3, "0")}-${"x".repeat(4090)}`;
      ledger.reserve({ ...plan, id, inputAtoms: "1", costBudgetAtoms: "0" });
      ledger.cancel(id);
    }
    const initial = createInitialEnvelope({ config, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
    const { sha256: _discard, ...body } = initial;
    const oversized = sealEnvelope({ ...body, capital: ledger.checkpoint() });
    let replayCalled = false;
    const descriptor = Object.getOwnPropertyDescriptor(PaperCapital, "restore")!;
    Object.defineProperty(PaperCapital, "restore", { ...descriptor, value: () => { replayCalled = true; throw new Error("capital_replay_started"); } });
    try {
      expect(() => validateEnvelope(oversized)).toThrow("envelope_too_large");
      expect(replayCalled).toBe(false);
    } finally {
      Object.defineProperty(PaperCapital, "restore", descriptor);
    }
  });

  test("trial-settles observed receipts against their exact inflight capital before accepting them", () => {
    const incomplete = observedEnvelope("100", "observed-incomplete-cost");
    const incompleteAttempt = copy(incomplete.attempts[0]!);
    incompleteAttempt.observation!.receipt.externalCostAtoms = null;
    incompleteAttempt.observation!.receipt.costsComplete = false;
    expect(() => validateEnvelope(reseal(incomplete, { attempts: [incompleteAttempt] }))).toThrow("invalid_envelope");

    const unfunded = observedEnvelope("0", "observed-unfunded");
    const unfundedAttempt = copy(unfunded.attempts[0]!);
    unfundedAttempt.observation!.receipt.externalCostAtoms = "1001";
    expect(() => validateEnvelope(reseal(unfunded, { attempts: [unfundedAttempt] }))).toThrow("invalid_envelope");

    const priorPlan: PaperPlan = { ...plan, id: "observed-prior-settled" };
    const targetPlan: PaperPlan = { ...plan, id: "observed-target-inflight" };
    const priorReceipt: PaperReceipt = {
      receiptId: "shared-observed-receipt", planId: priorPlan.id, asset, inputAtoms: "100", returnedAtoms: "100",
      externalCostAtoms: "0", costsComplete: true, outcome: "completed",
    };
    const capital = new PaperCapital(config);
    capital.reserve(priorPlan); capital.start(priorPlan.id); capital.settle(priorReceipt);
    capital.reserve(targetPlan); capital.start(targetPlan.id);
    const base = createInitialEnvelope({ config, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
    const { sha256: _discard, ...body } = base;
    const conflicting = sealEnvelope({
      ...body,
      capital: capital.checkpoint(),
      attempts: [
        {
          attemptId: "1".repeat(32), planId: priorPlan.id,
          planSha256: createHash("sha256").update(canonicalJson(priorPlan)).digest("hex"),
          phase: "settled" as const, observation: { evidenceId: "prior-evidence", receipt: priorReceipt },
        },
        {
          attemptId: "2".repeat(32), planId: targetPlan.id,
          planSha256: createHash("sha256").update(canonicalJson(targetPlan)).digest("hex"),
          phase: "observed" as const, observation: {
            evidenceId: "conflict-evidence",
            receipt: { ...priorReceipt, planId: targetPlan.id },
          },
        },
      ],
    });
    expect(() => validateEnvelope(conflicting)).toThrow("invalid_envelope");
  });

  test("restores strict A+B inflight and C reserved, settles only known recovery, then persists cancellation", async () => {
    const planA: PaperPlan = { ...plan, id: "recovery-a" };
    const planB: PaperPlan = { ...plan, id: "recovery-b" };
    const planC: PaperPlan = { ...plan, id: "recovery-c", inputAtoms: "50", costBudgetAtoms: "5" };
    const ledger = new PaperCapital(config);
    ledger.reserve(planA); ledger.start(planA.id);
    ledger.reserve(planB); ledger.start(planB.id);
    ledger.reserve(planC);
    const initial = createInitialEnvelope({ config, adapterId: "core-test-v1", owner: { token: "a".repeat(32), pid: 701 } });
    const attempts = [planA, planB].map((current, index) => ({
      attemptId: `${index + 1}`.repeat(32),
      planId: current.id,
      planSha256: createHash("sha256").update(canonicalJson(current)).digest("hex"),
      phase: "intent" as const,
      observation: null,
    }));
    const { sha256: _oldHash, ...initialBody } = initial;
    const restored = sealEnvelope({ ...initialBody, generation: 0, capital: ledger.checkpoint(), attempts });
    let reconcileCalls = 0;
    let executeCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { executeCalls++; return { kind: "pending", reason: "fresh_must_not_dispatch" }; },
      async reconcile(request) {
        reconcileCalls++;
        if (request.plan.id === planA.id) return { kind: "terminal", evidenceId: "recovery-effect-a", receipt: {
          receiptId: "recovery-receipt-a", planId: planA.id, asset, inputAtoms: "100", returnedAtoms: "120", externalCostAtoms: "5", costsComplete: true, outcome: "completed",
        } satisfies PaperReceipt };
        if (reconcileCalls === 2) return { kind: "pending", reason: "recovery-b-pending" };
        return { kind: "terminal", evidenceId: "recovery-effect-b", receipt: {
          receiptId: "recovery-receipt-b", planId: planB.id, asset, inputAtoms: "100", returnedAtoms: "100", externalCostAtoms: "0", costsComplete: true, outcome: "completed",
        } satisfies PaperReceipt };
      },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const store = memoryStore(restored, false);
    const supervisor = await PaperSupervisor.open({ store, adapter });

    expect(supervisor.status().capital).toMatchObject({ balanceAtoms: "1000", committedAtoms: "275", recoveryRequired: true });
    const settledA = await supervisor.tick({ plan: { ...plan, id: "fresh-during-recovery" }, expiresAtMs: Date.now() + 60_000 });
    expect(settledA.kind).toBe("settled");
    expect(supervisor.status().capital).toMatchObject({ balanceAtoms: "1015", committedAtoms: "165", recoveryRequired: true });
    expect(PaperCapital.restore((await store.load()).capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "165", recoveryRequired: true });
    expect(supervisor.status().capital.plans.map(({ id, status }) => [id, status])).toEqual([
      [planA.id, "settled"], [planB.id, "inflight"], [planC.id, "reserved"],
    ]);

    expect(await supervisor.tick()).toMatchObject({ kind: "held", reason: "outcome_pending" });
    expect(supervisor.status().capital).toMatchObject({ balanceAtoms: "1015", committedAtoms: "165", recoveryRequired: true });
    expect(PaperCapital.restore((await store.load()).capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "165", recoveryRequired: true });
    expect((await supervisor.tick()).kind).toBe("settled");
    expect(supervisor.status().capital).toMatchObject({ balanceAtoms: "1015", committedAtoms: "55", recoveryRequired: false });
    expect(PaperCapital.restore((await store.load()).capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "55", recoveryRequired: false });
    expect(await supervisor.tick()).toMatchObject({ kind: "cancelled" });
    const saved = await store.load();
    expect(PaperCapital.restore(saved.capital).snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "0", recoveryRequired: false });
    expect(PaperCapital.restore(saved.capital).snapshot()).toMatchObject({
      balanceAtoms: "1015", committedAtoms: "0", recoveryRequired: false,
    });
    expect(saved.capital.events.at(-1)).toEqual({ type: "cancel", planId: planC.id });
    expect(saved.attempts.map(({ phase }) => phase)).toEqual(["settled", "settled"]);
    expect(executeCalls).toBe(0);

    const partial = new PaperCapital(config);
    partial.reserve(planA); partial.start(planA.id); partial.reserve(planB);
    partial.settle({ receiptId: "fresh-ledger-a", planId: planA.id, asset, inputAtoms: "100", returnedAtoms: "120", externalCostAtoms: "5", costsComplete: true, outcome: "completed" });
    expect(partial.snapshot()).toMatchObject({ balanceAtoms: "1015", committedAtoms: "110", recoveryRequired: false });
    expect(PaperCapital.restore(partial.checkpoint()).snapshot()).toMatchObject({ recoveryRequired: false });
    await supervisor.close();

    const freshStore = memoryStore();
    const freshSupervisor = await PaperSupervisor.open({
      store: freshStore,
      adapter: {
        async execute(request) {
          return { kind: "terminal", evidenceId: `fresh-partial-effect-${request.plan.id}`, receipt: {
            receiptId: `fresh-partial-receipt-${request.plan.id}`, planId: request.plan.id, asset,
            inputAtoms: request.plan.inputAtoms, returnedAtoms: "120", externalCostAtoms: "5", costsComplete: true, outcome: "completed",
          } satisfies PaperReceipt };
        },
        async reconcile() { return { kind: "unknown", reason: "no_saved_intent" }; },
        async drain() { return { drained: true }; },
        async close() {},
      },
    });
    expect(await freshSupervisor.tick({ plan: { ...plan, id: "fresh-partial-first" }, expiresAtMs: Date.now() + 60_000 }))
      .toMatchObject({ kind: "settled" });
    expect(freshSupervisor.status()).toMatchObject({ operationalState: "ready", capital: { balanceAtoms: "1015", committedAtoms: "0", recoveryRequired: false } });
    expect(PaperCapital.restore((await freshStore.load()).capital).snapshot())
      .toMatchObject({ balanceAtoms: "1015", committedAtoms: "0", recoveryRequired: false });
    expect(await freshSupervisor.tick({ plan: { ...plan, id: "fresh-partial-settled" }, expiresAtMs: Date.now() + 60_000 }))
      .toMatchObject({ kind: "settled" });
    expect(freshSupervisor.status()).toMatchObject({ operationalState: "ready", capital: { balanceAtoms: "1030", committedAtoms: "0", recoveryRequired: false } });
    expect(PaperCapital.restore((await freshStore.load()).capital).snapshot())
      .toMatchObject({ balanceAtoms: "1030", committedAtoms: "0", recoveryRequired: false });
    await freshSupervisor.close();
  });

  test("persists intent before one execution, observes before settlement, and acknowledges the exact gain", async () => {
    const order: string[] = [];
    const adapter: PaperSupervisorAdapter = {
      async execute(request) {
        order.push(`execute:${request.attemptId}`);
        return {
          kind: "terminal",
          evidenceId: "effect-core-1",
          receipt: {
            receiptId: "receipt-core-1",
            planId: request.plan.id,
            asset,
            inputAtoms: "100",
            returnedAtoms: "120",
            externalCostAtoms: "5",
            costsComplete: true,
            outcome: "completed",
          } satisfies PaperReceipt,
        };
      },
      async reconcile() { throw new Error("fresh work must not reconcile"); },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const store = memoryStore();
    const originalPublish = store.publish.bind(store);
    store.publish = async (expected, candidate) => {
      const nextStatus = PaperCapital.restore(candidate.capital).snapshot();
      const phases = candidate.attempts.map((attempt) => attempt.phase).join(",");
      if (candidate.attempts.some((attempt) => attempt.phase === "intent")) order.push(`intent:${phases}`);
      if (candidate.attempts.some((attempt) => attempt.phase === "observed")) order.push(`observation:${phases}`);
      if (nextStatus.balanceAtoms === "1015") order.push("settlement:1015");
      return originalPublish(expected, candidate);
    };
    const supervisor = await PaperSupervisor.open({ store, adapter });

    const result = await supervisor.tick({ plan, expiresAtMs: Date.now() + 60_000 });
    const status = supervisor.status();

    expect(result.kind).toBe("settled");
    expect(status.capital.balanceAtoms).toBe("1015");
    expect(status.capital.realizedNetAtoms).toBe("15");
    expect(status.capital.committedAtoms).toBe("0");
    expect(status.capital.recoveryRequired).toBe(false);
    expect(status.heldAttemptIds).toEqual([]);
    expect(order).toHaveLength(4);
    expect(order[0]).toMatch(/^intent:/);
    expect(order[1]).toMatch(/^execute:/);
    expect(order[2]).toMatch(/^observation:/);
    expect(order[3]).toBe("settlement:1015");

    const closed = await supervisor.close();
    expect(closed.resourcesClosed).toBe(true);
    expect(closed.ownerReleased).toBe(true);
  });

  test("returns bounded truthful incomplete closure when adapter drain ignores abort", async () => {
    const baseStore = memoryStore();
    let releaseCalls = 0;
    let storeClosed = false;
    const store: PaperSupervisorStore = {
      ...baseStore,
      async release(generation) { releaseCalls++; return baseStore.release(generation); },
      async close() { storeClosed = true; await baseStore.close(); },
    };
    let drainSignal: AbortSignal | undefined;
    let adapterCloseCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { throw new Error("unexpected_execute"); },
      async reconcile() { return { kind: "unknown", reason: "no_attempt" }; },
      drain(signal) { drainSignal = signal; return new Promise(() => {}); },
      async close() { adapterCloseCalls++; },
    };
    const supervisor = await PaperSupervisor.open({ store, adapter, limits: { drainTimeoutMs: 20 } });

    const started = Date.now();
    const result = await supervisor.close();
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(500);
    expect(result).toEqual({ kind: "drain_incomplete", resourcesClosed: false, ownerReleased: false });
    expect(drainSignal?.aborted).toBe(true);
    expect(adapterCloseCalls).toBe(0);
    expect(releaseCalls).toBe(0);
    expect(storeClosed).toBe(true);
    expect(supervisor.status()).toMatchObject({ resourcesClosed: false, ownerReleased: false });
  });

  test("keeps acknowledged owner release while reporting uncertain store closure consistently", async () => {
    const stateDir = join(newTestRoot(), "state");
    const store = await SqlitePaperSupervisorStore.create({
      stateDir,
      config,
      adapterId: "close-ack-core-v1",
      owner: { token: "c".repeat(32), pid: 903 },
    });
    const actualClose = store.close.bind(store);
    store.close = async () => {
      await actualClose();
      throw new Error("store_close_ack_lost");
    };
    const adapter: PaperSupervisorAdapter = {
      async execute() { throw new Error("unexpected_execute"); },
      async reconcile() { return { kind: "unknown", reason: "none" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store, adapter });

    const closed = await supervisor.close();
    const status = supervisor.status();
    const disk = new Database(join(stateDir, "supervisor.sqlite"), { readonly: true });
    const row = disk.query("SELECT owner_token, owner_pid FROM supervisor_state WHERE id=1").get() as { owner_token: string | null; owner_pid: number | null };
    disk.close();

    expect(closed).toEqual({ kind: "drain_incomplete", resourcesClosed: false, ownerReleased: true });
    expect(status).toMatchObject({ operationalState: "quarantined", resourcesClosed: false, ownerReleased: true });
    expect(status.operationalState).not.toBe("closed");
    expect(row).toEqual({ owner_token: null, owner_pid: null });
    expect(await supervisor.close()).toEqual(closed);
  });

  test("rejects an invalid initial monotonic clock before loading or dispatching work", async () => {
    let loads = 0;
    const store = memoryStore();
    const originalLoad = store.load.bind(store);
    store.load = async () => { loads++; return originalLoad(); };
    let executeCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { executeCalls++; return { kind: "pending", reason: "unexpected" }; },
      async reconcile() { return { kind: "unknown", reason: "none" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const invalidClock = { monotonicNowMs: () => Number.POSITIVE_INFINITY, wallNowMs: () => 1, async wait() {} };

    await expect(PaperSupervisor.open({ store, adapter, clock: invalidClock })).rejects.toMatchObject({ code: "clock_invalid" });

    expect(loads).toBe(0);
    expect(executeCalls).toBe(0);
  });

  test("advances the wall-clock high-water after reservation and blocks fresh intake on regression", async () => {
    const executed: string[] = [];
    const walls = [100, 100, 200, 150, 150];
    const clock = {
      monotonicNowMs: () => 0,
      wallNowMs() { const value = walls.shift(); if (value === undefined) throw new Error("unexpected_wall_read"); return value; },
      async wait() {},
    };
    const adapter: PaperSupervisorAdapter = {
      async execute(request) {
        executed.push(request.plan.id);
        return {
          kind: "terminal",
          evidenceId: `effect-${request.plan.id}`,
          receipt: {
            receiptId: `receipt-${request.plan.id}`,
            planId: request.plan.id,
            asset,
            inputAtoms: request.plan.inputAtoms,
            returnedAtoms: "100",
            externalCostAtoms: "0",
            costsComplete: true,
            outcome: "completed",
          } satisfies PaperReceipt,
        };
      },
      async reconcile() { return { kind: "unknown", reason: "unexpected_reconcile" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store: memoryStore(), adapter, clock });

    const first = await supervisor.tick({ plan: { ...plan, id: "clock-high-water" }, expiresAtMs: 1000 });
    const second = await supervisor.tick({ plan: { ...plan, id: "clock-after-regression" }, expiresAtMs: 1000 });

    expect(first.kind).toBe("settled");
    expect(second).toMatchObject({ kind: "held", reason: "clock_invalid" });
    expect(executed).toEqual(["clock-high-water"]);
    expect(supervisor.status()).toMatchObject({ holdReason: "clock_invalid" });
    await supervisor.close();
  });

  test("allows known recovery after a clock regression but keeps fresh intake blocked", async () => {
    const walls = [100, 100, 100, 99, 100, 100];
    const clock = {
      monotonicNowMs: () => 0,
      wallNowMs() { const value = walls.shift(); if (value === undefined) throw new Error("unexpected_wall_read"); return value; },
      async wait() {},
    };
    let executions = 0;
    let reconciliations = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { executions++; return { kind: "pending", reason: "known_inflight" }; },
      async reconcile(request) {
        reconciliations++;
        return {
          kind: "terminal",
          evidenceId: "recovered-effect",
          receipt: {
            receiptId: "recovered-receipt",
            planId: request.plan.id,
            asset,
            inputAtoms: request.plan.inputAtoms,
            returnedAtoms: "100",
            externalCostAtoms: "0",
            costsComplete: true,
            outcome: "completed",
          } satisfies PaperReceipt,
        };
      },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store: memoryStore(), adapter, clock });

    const first = await supervisor.tick({ plan: { ...plan, id: "clock-recovery-inflight" }, expiresAtMs: 1000 });
    const recovered = await supervisor.tick({ plan: { ...plan, id: "clock-recovery-inflight" }, expiresAtMs: 1000 });
    const fresh = await supervisor.tick({ plan: { ...plan, id: "clock-after-recovery" }, expiresAtMs: 1000 });

    expect(first).toMatchObject({ kind: "held", reason: "outcome_pending" });
    expect(recovered.kind).toBe("settled");
    expect(fresh).toMatchObject({ kind: "held", reason: "clock_invalid" });
    expect(executions).toBe(1);
    expect(reconciliations).toBe(1);
    expect(supervisor.status()).toMatchObject({ holdReason: "clock_invalid", capital: { balanceAtoms: "1000" } });
    await supervisor.close();
  });

  test("keeps an acknowledged intent without dispatch when abort arrives at the intent boundary", async () => {
    const controller = new AbortController();
    const store = memoryStore();
    let executeCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { executeCalls++; throw new Error("execute_must_not_start_after_abort"); },
      async reconcile() { return { kind: "unknown", reason: "none" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({
      store,
      adapter,
      onStage(stage) { if (stage === "intent_saved") controller.abort(); },
    });

    const result = await supervisor.tick({ plan, expiresAtMs: Date.now() + 60_000 }, controller.signal);
    const saved = await store.load();

    expect(executeCalls).toBe(0);
    expect(result).toMatchObject({ kind: "held", reason: "adapter_aborted" });
    expect(saved.attempts[0]).toMatchObject({ phase: "intent", observation: null });
    expect(PaperCapital.restore(saved.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110", recoveryRequired: true });
    expect((await supervisor.close()).ownerReleased).toBe(true);
  });

  test("rejects nonfinite, fractional, and out-of-range limits before touching state", async () => {
    const invalidCases: Array<{ field: keyof import("./paper-supervisor").PaperSupervisorLimits; value: number }> = [
      { field: "maxTicks", value: 0 }, { field: "maxTicks", value: 21 }, { field: "maxTicks", value: 1.5 }, { field: "maxTicks", value: Number.NaN },
      { field: "maxDurationMs", value: 0 }, { field: "maxDurationMs", value: 10_001 }, { field: "maxDurationMs", value: 1.5 }, { field: "maxDurationMs", value: Number.POSITIVE_INFINITY },
      { field: "cadenceMs", value: 0 }, { field: "cadenceMs", value: 1_001 }, { field: "cadenceMs", value: 1.5 }, { field: "cadenceMs", value: Number.NaN },
      { field: "adapterTimeoutMs", value: 0 }, { field: "adapterTimeoutMs", value: 2_001 }, { field: "adapterTimeoutMs", value: 1.5 }, { field: "adapterTimeoutMs", value: Number.POSITIVE_INFINITY },
      { field: "drainTimeoutMs", value: 0 }, { field: "drainTimeoutMs", value: 2_001 }, { field: "drainTimeoutMs", value: 1.5 }, { field: "drainTimeoutMs", value: Number.NEGATIVE_INFINITY },
    ];
    for (const { field, value } of invalidCases) {
      let loads = 0;
      const store = memoryStore();
      const originalLoad = store.load.bind(store);
      store.load = async () => { loads++; return originalLoad(); };
      const limits = { [field]: value };
      await expect(PaperSupervisor.open({ store, adapter: {
        async execute() { throw new Error("invalid_limits_must_not_execute"); },
        async reconcile() { throw new Error("invalid_limits_must_not_reconcile"); },
        async drain() { return { drained: true }; },
        async close() {},
      }, limits })).rejects.toMatchObject({ code: "invalid_limits" });
      expect(loads).toBe(0);
    }
  });

  test("holds fresh intake after invalid post-reservation wall or monotonic samples", async () => {
    const cases: Array<{ name: string; monotonic: number[]; wall: number[] }> = [
      { name: "wall-nan", monotonic: [10, 11], wall: [100, 100, Number.NaN, 100] },
      { name: "wall-infinity", monotonic: [10, 11], wall: [100, 100, Number.POSITIVE_INFINITY, 100] },
      { name: "wall-negative", monotonic: [10, 11], wall: [100, 100, -1, 100] },
      { name: "wall-fraction", monotonic: [10, 11], wall: [100, 100, 100.5, 100] },
      { name: "wall-regression", monotonic: [10, 11], wall: [100, 100, 99, 100] },
      { name: "monotonic-nan", monotonic: [10, Number.NaN], wall: [100, 100, 100] },
      { name: "monotonic-regression", monotonic: [10, 9], wall: [100, 100, 100] },
    ];
    for (const scenario of cases) {
      const wall = [...scenario.wall];
      const monotonic = [...scenario.monotonic];
      const clock = {
        monotonicNowMs() { const value = monotonic.shift(); if (value === undefined) return 11; return value; },
        wallNowMs() { const value = wall.shift(); if (value === undefined) return 100; return value; },
        async wait() {},
      };
      const store = memoryStore();
      let executions = 0;
      const adapter: PaperSupervisorAdapter = {
        async execute() { executions++; return { kind: "pending", reason: "unexpected" }; },
        async reconcile() { return { kind: "unknown", reason: "none" }; },
        async drain() { return { drained: true }; },
        async close() {},
      };
      const supervisor = await PaperSupervisor.open({ store, adapter, clock });
      const invalid = await supervisor.tick({ plan: { ...plan, id: scenario.name }, expiresAtMs: 1_000 });
      const fresh = await supervisor.tick({ plan: { ...plan, id: `${scenario.name}-fresh` }, expiresAtMs: 1_000 });
      const saved = await store.load();

      expect(invalid).toMatchObject({ kind: "cancelled" });
      expect(fresh).toMatchObject({ kind: "held", reason: "clock_invalid" });
      expect(executions).toBe(0);
      expect(saved.capital.events.map((event) => event.type)).toEqual(["reserve", "cancel"]);
      expect(supervisor.status().holdReason).toBe("clock_invalid");
      await supervisor.close();
    }
  });

  test("bounds abort and expiry at each pre-intent reservation phase", async () => {
    type JournalEventType = PaperSupervisorEnvelope["capital"]["events"][number]["type"];
    const scenarios: Array<{
      name: string;
      walls: number[];
      abortAtReserve: boolean;
      abortBeforeTick: boolean;
      expiresAtMs: number;
      expected: "cancelled" | "held";
      reason?: string;
      events: JournalEventType[];
    }> = [
      { name: "abort-before-reserve", walls: [100, 100], abortAtReserve: false, abortBeforeTick: true, expiresAtMs: 1_000, expected: "cancelled", events: [] },
      { name: "expired-before-reserve", walls: [100, 100], abortAtReserve: false, abortBeforeTick: false, expiresAtMs: 99, expected: "held", reason: "opportunity_expired", events: [] },
      { name: "abort-after-reserve", walls: [100, 100, 100], abortAtReserve: true, abortBeforeTick: false, expiresAtMs: 1_000, expected: "cancelled", events: ["reserve", "cancel"] },
      { name: "expires-after-reserve", walls: [100, 100, 101], abortAtReserve: false, abortBeforeTick: false, expiresAtMs: 100, expected: "cancelled", events: ["reserve", "cancel"] },
    ];

    for (const scenario of scenarios) {
      const walls = [...scenario.walls];
      const clock = {
        monotonicNowMs: () => 0,
        wallNowMs() { const value = walls.shift(); if (value === undefined) throw new Error(`unexpected_wall_read:${scenario.name}`); return value; },
        async wait() {},
      };
      const controller = new AbortController();
      let executions = 0;
      const store = memoryStore();
      const supervisor = await PaperSupervisor.open({
        store,
        adapter: {
          async execute() { executions++; return { kind: "pending", reason: "must_not_execute_before_intent" }; },
          async reconcile() { throw new Error("must_not_reconcile_before_intent"); },
          async drain() { return { drained: true }; },
          async close() {},
        },
        clock,
        onStage(stage) { if (scenario.abortAtReserve && stage === "reserved_saved") controller.abort(); },
      });
      if (scenario.abortBeforeTick) controller.abort();

      const result = await supervisor.tick({ plan: { ...plan, id: scenario.name }, expiresAtMs: scenario.expiresAtMs }, controller.signal);
      const saved = await store.load();
      const actualEvents = saved.capital.events.map((event) => event.type);

      if (scenario.expected === "held") expect(result).toMatchObject({ kind: "held", reason: scenario.reason });
      else expect(result).toMatchObject({ kind: scenario.expected });
      expect(actualEvents).toEqual(scenario.events);
      expect(saved.attempts).toEqual([]);
      expect(executions).toBe(0);
      expect(supervisor.status().capital.committedAtoms).toBe("0");
      await supervisor.close();
    }
  });

  test("serializes overlapping ticks and waits a full cadence after slow provider work", async () => {
    let resolveExecution!: (result: PaperAdapterResult) => void;
    let markStarted!: () => void;
    const execution = new Promise<PaperAdapterResult>((resolve) => { resolveExecution = resolve; });
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let executeCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { executeCalls++; markStarted(); return execution; },
      async reconcile() { return { kind: "unknown", reason: "none" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store: memoryStore(), adapter });
    const firstTick = supervisor.tick({ plan: { ...plan, id: "busy-first" }, expiresAtMs: Date.now() + 60_000 });
    await started;
    expect(await supervisor.tick({ plan: { ...plan, id: "busy-second" }, expiresAtMs: Date.now() + 60_000 })).toEqual({ kind: "busy" });
    expect(executeCalls).toBe(1);
    resolveExecution({ kind: "pending", reason: "bounded_busy_probe" });
    expect(await firstTick).toMatchObject({ kind: "held", reason: "outcome_pending" });
    expect(supervisor.status().completedTicks).toBe(1);
    await supervisor.close();

    let now = 0;
    const opportunityTimes: number[] = [];
    const waitDurations: number[] = [];
    const clock = {
      monotonicNowMs: () => now,
      wallNowMs: () => 1,
      async wait(ms: number) { waitDurations.push(ms); now += ms; },
    };
    const cadenceSupervisor = await PaperSupervisor.open({
      store: memoryStore(), adapter: {
        async execute() { throw new Error("empty_cadence_must_not_execute"); },
        async reconcile() { return { kind: "unknown", reason: "none" }; },
        async drain() { return { drained: true }; },
        async close() {},
      },
      clock,
      limits: { maxTicks: 3, maxDurationMs: 100, cadenceMs: 10 },
    });
    const results = await cadenceSupervisor.run({ nextOpportunity(index) {
      opportunityTimes.push(now);
      expect(index).toBe(opportunityTimes.length - 1);
      now += 25;
      return undefined;
    } });

    expect(results).toEqual([{ kind: "idle" }, { kind: "idle" }, { kind: "idle" }]);
    expect(opportunityTimes).toEqual([0, 35, 70]);
    expect(waitDurations).toEqual([10, 10]);
    await cadenceSupervisor.close();
  });

  test("bounds a pending opportunity provider by run duration and abort", async () => {
    const adapter: PaperSupervisorAdapter = {
      async execute() { throw new Error("unexpected_execute"); },
      async reconcile() { return { kind: "unknown", reason: "none" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store: memoryStore(), adapter, limits: { maxDurationMs: 25 } });
    const started = Date.now();
    const timedOut = await supervisor.run({ nextOpportunity: () => new Promise(() => {}) });
    expect(Date.now() - started).toBeLessThan(500);
    expect(timedOut).toEqual([]);
    expect(supervisor.status().completedTicks).toBe(0);

    const controller = new AbortController();
    const pendingRun = supervisor.run({ nextOpportunity: () => new Promise(() => {}), signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    expect(await pendingRun).toEqual([{ kind: "cancelled" }]);
    expect((await supervisor.close()).kind).toBe("closed");
  });

  test("reports elapsed time from a direct status sample after ticks", async () => {
    let now = 0;
    const clock = { monotonicNowMs: () => now, wallNowMs: () => 1, async wait() {} };
    const adapter: PaperSupervisorAdapter = {
      async execute() { throw new Error("unexpected_execute"); },
      async reconcile() { return { kind: "unknown", reason: "none" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store: memoryStore(), adapter, clock });
    await supervisor.tick();
    now = 37;

    expect(supervisor.status().elapsedMs).toBe(37);
    await supervisor.close();
  });

  test("does not report a committed owner release as incomplete when its stage observer rejects", async () => {
    const adapter: PaperSupervisorAdapter = {
      async execute() { throw new Error("unexpected_execute"); },
      async reconcile() { return { kind: "unknown", reason: "none" }; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({
      store: memoryStore(),
      adapter,
      onStage(stage) { if (stage === "owner_released") throw new Error("observer_failed"); },
    });

    const result = await supervisor.close();

    expect(result).toEqual({ kind: "closed", resourcesClosed: true, ownerReleased: true });
    expect(supervisor.status()).toMatchObject({ operationalState: "closed", resourcesClosed: true, ownerReleased: true });
  });

  test("times out execute, aborts its signal, and ignores a late terminal completion", async () => {
    const stateDir = join(newTestRoot(), "state");
    const store = await SqlitePaperSupervisorStore.create({
      stateDir,
      config,
      adapterId: "execute-timeout-core-v1",
      owner: { token: "d".repeat(32), pid: 904 },
    });
    let finishLate!: (result: PaperAdapterResult) => void;
    let markStarted!: (signal: AbortSignal) => void;
    const started = new Promise<AbortSignal>((resolve) => { markStarted = resolve; });
    const late = new Promise<PaperAdapterResult>((resolve) => { finishLate = resolve; });
    const adapter: PaperSupervisorAdapter = {
      execute(_request, signal) { markStarted(signal); return late; },
      async reconcile() { throw new Error("timed_out_execute_must_not_reconcile_in_same_tick"); },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store, adapter, limits: { adapterTimeoutMs: 20 } });
    const tick = await supervisor.tick({ plan: { ...plan, id: "execute-timeout" }, expiresAtMs: Date.now() + 60_000 });
    const signal = await started;
    const beforeLate = await store.load();
    const statusBeforeLate = supervisor.status();

    expect(tick).toMatchObject({ kind: "held", reason: "adapter_timeout" });
    expect(signal.aborted).toBe(true);
    expect(beforeLate.generation).toBe(2);
    expect(beforeLate.attempts[0]).toMatchObject({ phase: "intent", observation: null });
    expect(PaperCapital.restore(beforeLate.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110", recoveryRequired: true });
    expect(statusBeforeLate.lastAdapterError).toBe("adapter_timeout");

    finishLate({
      kind: "terminal",
      evidenceId: "late-execute-effect",
      receipt: { receiptId: "late-execute-receipt", planId: "execute-timeout", asset, inputAtoms: "100", returnedAtoms: "120", externalCostAtoms: "5", costsComplete: true, outcome: "completed" },
    });
    await late;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const afterLate = await store.load();

    expect(canonicalJson(afterLate)).toBe(canonicalJson(beforeLate));
    expect(supervisor.status()).toMatchObject({ generation: statusBeforeLate.generation, capital: statusBeforeLate.capital, heldAttemptIds: statusBeforeLate.heldAttemptIds });
    expect((await supervisor.close()).kind).toBe("closed");
  });

  test("times out reconciliation and ignores a late terminal result without fresh execution", async () => {
    const stateDir = join(newTestRoot(), "state");
    const owner = { token: "e".repeat(32), pid: 905 };
    const store = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId: "reconcile-timeout-core-v1", owner });
    const ledger = new PaperCapital(config);
    const recoveryPlan = { ...plan, id: "reconcile-timeout" };
    ledger.reserve(recoveryPlan);
    ledger.start(recoveryPlan.id);
    const initial = await store.load();
    const { sha256: _oldHash, ...body } = initial;
    const attempt = {
      attemptId: "f".repeat(32),
      planId: recoveryPlan.id,
      planSha256: createHash("sha256").update(canonicalJson(recoveryPlan)).digest("hex"),
      phase: "intent" as const,
      observation: null,
    };
    const restored = sealEnvelope({ ...body, generation: 1, capital: ledger.checkpoint(), attempts: [attempt] });
    await store.close();
    const disk = new Database(join(stateDir, "supervisor.sqlite"));
    disk.query("UPDATE supervisor_state SET generation=?, envelope_json=? WHERE id=1").run(restored.generation, canonicalEnvelope(restored));
    disk.close();
    const resumed = await SqlitePaperSupervisorStore.resume({
      stateDir,
      config,
      adapterId: "reconcile-timeout-core-v1",
      owner: { token: "1".repeat(32), pid: 906 },
      recoverOwner: { expectedToken: owner.token, expectedPid: owner.pid, verifyExited: () => true },
    });
    let finishLate!: (result: PaperAdapterResult) => void;
    let markStarted!: (signal: AbortSignal) => void;
    const started = new Promise<AbortSignal>((resolve) => { markStarted = resolve; });
    const late = new Promise<PaperAdapterResult>((resolve) => { finishLate = resolve; });
    let executeCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { executeCalls++; throw new Error("recovery_must_not_execute"); },
      reconcile(_request, signal) { markStarted(signal); return late; },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const supervisor = await PaperSupervisor.open({ store: resumed, adapter, limits: { adapterTimeoutMs: 20 } });
    const tick = await supervisor.tick({ plan: { ...plan, id: "fresh-during-reconcile-timeout" }, expiresAtMs: Date.now() + 60_000 });
    const signal = await started;
    const beforeLate = await resumed.load();

    expect(tick).toMatchObject({ kind: "held", reason: "adapter_timeout" });
    expect(signal.aborted).toBe(true);
    expect(executeCalls).toBe(0);
    expect(beforeLate.generation).toBe(2);
    expect(beforeLate.attempts[0]).toMatchObject({ phase: "intent", observation: null });
    expect(PaperCapital.restore(beforeLate.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110", recoveryRequired: true });

    finishLate({
      kind: "terminal",
      evidenceId: "late-reconcile-effect",
      receipt: { receiptId: "late-reconcile-receipt", planId: recoveryPlan.id, asset, inputAtoms: "100", returnedAtoms: "120", externalCostAtoms: "5", costsComplete: true, outcome: "completed" },
    });
    await late;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(canonicalJson(await resumed.load())).toBe(canonicalJson(beforeLate));
    expect(supervisor.status()).toMatchObject({ generation: beforeLate.generation, capital: { balanceAtoms: "1000", committedAtoms: "110", recoveryRequired: true }, heldAttemptIds: [attempt.attemptId] });
    expect(executeCalls).toBe(0);
    expect((await supervisor.close()).kind).toBe("closed");
  });

  test("reports incomplete close truthfully for uncooperative timed-out execute and reconcile", async () => {
    for (const operation of ["execute", "reconcile"] as const) {
      const recoveryPlan = { ...plan, id: `close-uncooperative-${operation}` };
      let initial: PaperSupervisorEnvelope | undefined;
      if (operation === "reconcile") {
        const ledger = new PaperCapital(config);
        ledger.reserve(recoveryPlan);
        ledger.start(recoveryPlan.id);
        const empty = createInitialEnvelope({ config, adapterId: `close-uncooperative-${operation}`, owner: { token: "a".repeat(32), pid: 701 } });
        const { sha256: _previousHash, ...body } = empty;
        initial = sealEnvelope({
          ...body,
          generation: 1,
          capital: ledger.checkpoint(),
          attempts: [{
            attemptId: "b".repeat(32),
            planId: recoveryPlan.id,
            planSha256: createHash("sha256").update(canonicalJson(recoveryPlan)).digest("hex"),
            phase: "intent",
            observation: null,
          }],
        });
      }
      const base = memoryStore(initial, operation === "execute");
      let releaseCalls = 0;
      let storeCloseCalls = 0;
      const store: PaperSupervisorStore = {
        createdFresh: base.createdFresh,
        load: () => base.load(),
        assertOwner: (generation) => base.assertOwner(generation),
        publish: (generation, candidate) => base.publish(generation, candidate),
        async release(generation) { releaseCalls++; return base.release(generation); },
        async close() { storeCloseCalls++; await base.close(); },
      };
      let finishLate!: (result: PaperAdapterResult) => void;
      let markStarted!: (signal: AbortSignal) => void;
      const started = new Promise<AbortSignal>((resolve) => { markStarted = resolve; });
      const late = new Promise<PaperAdapterResult>((resolve) => { finishLate = resolve; });
      let executeCalls = 0;
      let reconcileCalls = 0;
      let drainCalls = 0;
      let adapterCloseCalls = 0;
      const adapter: PaperSupervisorAdapter = {
        execute(_request, signal) { executeCalls++; markStarted(signal); return late; },
        reconcile(_request, signal) { reconcileCalls++; markStarted(signal); return late; },
        async drain() { drainCalls++; return { drained: true }; },
        async close() { adapterCloseCalls++; },
      };
      const supervisor = await PaperSupervisor.open({
        store,
        adapter,
        limits: { adapterTimeoutMs: 15, drainTimeoutMs: 20 },
      });
      const tick = operation === "execute"
        ? await supervisor.tick({ plan: recoveryPlan, expiresAtMs: Date.now() + 60_000 })
        : await supervisor.tick();
      const signal = await started;
      const beforeClose = await store.load();
      const startedClose = Date.now();
      const closeResult = await supervisor.close();
      const closeElapsed = Date.now() - startedClose;
      const statusAfterClose = supervisor.status();
      const duplicateClose = await supervisor.close();
      const afterClose = await store.load();

      expect(tick).toMatchObject({ kind: "held", reason: "adapter_timeout" });
      expect(signal.aborted).toBe(true);
      expect(closeElapsed).toBeLessThan(500);
      expect(closeResult).toEqual({ kind: "drain_incomplete", resourcesClosed: false, ownerReleased: false });
      expect(duplicateClose).toEqual(closeResult);
      expect(statusAfterClose).toMatchObject({ operationalState: "quarantined", resourcesClosed: false, ownerReleased: false });
      expect(statusAfterClose.operationalState).not.toBe("closed");
      expect(canonicalJson(afterClose)).toBe(canonicalJson(beforeClose));
      expect({ executeCalls, reconcileCalls, drainCalls, adapterCloseCalls, releaseCalls, storeCloseCalls })
        .toEqual({ executeCalls: operation === "execute" ? 1 : 0, reconcileCalls: operation === "reconcile" ? 1 : 0, drainCalls: 1, adapterCloseCalls: 0, releaseCalls: 0, storeCloseCalls: 1 });
      expect(await supervisor.tick({ plan: { ...plan, id: `fresh-after-close-${operation}` }, expiresAtMs: Date.now() + 60_000 }))
        .toMatchObject({ kind: "held", reason: "closing" });

      finishLate({ kind: "terminal", evidenceId: `late-close-effect-${operation}`, receipt: {
        receiptId: `late-close-receipt-${operation}`, planId: recoveryPlan.id, asset,
        inputAtoms: recoveryPlan.inputAtoms, returnedAtoms: "120", externalCostAtoms: "5", costsComplete: true, outcome: "completed",
      } satisfies PaperReceipt });
      await late;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(canonicalJson(await store.load())).toBe(canonicalJson(beforeClose));
      expect(supervisor.status()).toMatchObject({
        generation: beforeClose.generation,
        operationalState: "quarantined",
        resourcesClosed: false,
        ownerReleased: false,
        capital: { balanceAtoms: "1000", committedAtoms: "110", recoveryRequired: true },
      });
    }
  });

  test("cooperative close aborts and joins execute before releasing the owner exactly once", async () => {
    const stateDir = join(newTestRoot(), "state");
    const realStore = await SqlitePaperSupervisorStore.create({
      stateDir,
      config,
      adapterId: "cooperative-close-core-v1",
      owner: { token: "2".repeat(32), pid: 907 },
    });
    let closeStoreCalls = 0;
    let releaseCalls = 0;
    const store: PaperSupervisorStore = {
      createdFresh: realStore.createdFresh,
      load: () => realStore.load(),
      publish: (generation, next) => realStore.publish(generation, next),
      assertOwner: (generation) => realStore.assertOwner(generation),
      async release(generation) { releaseCalls++; return realStore.release(generation); },
      async close() { closeStoreCalls++; await realStore.close(); },
    };
    let markStarted!: (signal: AbortSignal) => void;
    let markSettled!: () => void;
    const started = new Promise<AbortSignal>((resolve) => { markStarted = resolve; });
    const settled = new Promise<void>((resolve) => { markSettled = resolve; });
    let drainCalls = 0;
    let adapterCloseCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      execute(_request, signal) {
        markStarted(signal);
        return new Promise<PaperAdapterResult>((_resolve, reject) => {
          signal.addEventListener("abort", () => { markSettled(); reject(new Error("cooperative_abort_acknowledged")); }, { once: true });
        });
      },
      async reconcile() { throw new Error("unexpected_reconcile"); },
      async drain() { drainCalls++; return { drained: true }; },
      async close() { adapterCloseCalls++; },
    };
    const supervisor = await PaperSupervisor.open({ store, adapter, limits: { adapterTimeoutMs: 1_000, drainTimeoutMs: 100 } });
    const tick = supervisor.tick({ plan: { ...plan, id: "cooperative-close" }, expiresAtMs: Date.now() + 60_000 });
    const signal = await started;
    const closeStarted = Date.now();
    const closed = await supervisor.close();
    const elapsed = Date.now() - closeStarted;
    const tickResult = await tick;
    const duplicate = await supervisor.close();

    expect(signal.aborted).toBe(true);
    await settled;
    expect(tickResult).toMatchObject({ kind: "held", reason: "adapter_aborted" });
    expect(elapsed).toBeLessThan(500);
    expect({ releaseCalls, closeStoreCalls, drainCalls, adapterCloseCalls }).toEqual({ releaseCalls: 1, closeStoreCalls: 1, drainCalls: 1, adapterCloseCalls: 1 });
    expect(closed).toEqual({ kind: "closed", resourcesClosed: true, ownerReleased: true });
    expect(duplicate).toEqual(closed);
    expect(supervisor.status()).toMatchObject({ operationalState: "closed", resourcesClosed: true, ownerReleased: true });
    expect({ releaseCalls, closeStoreCalls, drainCalls, adapterCloseCalls }).toEqual({ releaseCalls: 1, closeStoreCalls: 1, drainCalls: 1, adapterCloseCalls: 1 });
  });

  test("coalesces overlapping close calls while drain is pending", async () => {
    const realStore = await SqlitePaperSupervisorStore.create({
      stateDir: join(newTestRoot(), "overlapping-close"),
      config,
      adapterId: "overlapping-close-core-v1",
      owner: { token: "3".repeat(32), pid: 908 },
    });
    let releaseCalls = 0;
    let storeCloseCalls = 0;
    const store: PaperSupervisorStore = {
      createdFresh: realStore.createdFresh,
      load: () => realStore.load(),
      publish: (generation, next) => realStore.publish(generation, next),
      assertOwner: (generation) => realStore.assertOwner(generation),
      async release(generation) { releaseCalls++; return realStore.release(generation); },
      async close() { storeCloseCalls++; await realStore.close(); },
    };
    let markDrainStarted!: () => void;
    let finishDrain!: (result: { drained: boolean }) => void;
    const drainStarted = new Promise<void>((resolve) => { markDrainStarted = resolve; });
    const drainGate = new Promise<{ drained: boolean }>((resolve) => { finishDrain = resolve; });
    let drainCalls = 0;
    let adapterCloseCalls = 0;
    const adapter: PaperSupervisorAdapter = {
      async execute() { throw new Error("unexpected_execute"); },
      async reconcile() { throw new Error("unexpected_reconcile"); },
      drain() { drainCalls++; markDrainStarted(); return drainGate; },
      async close() { adapterCloseCalls++; },
    };
    const supervisor = await PaperSupervisor.open({ store, adapter, limits: { drainTimeoutMs: 500 } });
    const firstClose = supervisor.close();
    await drainStarted;
    const secondClose = supervisor.close();
    finishDrain({ drained: true });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const joined = await Promise.race([
      Promise.all([firstClose, secondClose]),
      new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => reject(new Error("overlapping_close_unbounded")), 1_000); }),
    ]).finally(() => { if (deadline !== undefined) clearTimeout(deadline); });
    const [first, second] = joined;

    expect(second).toEqual(first);
    expect(first).toEqual({ kind: "closed", resourcesClosed: true, ownerReleased: true });
    expect({ drainCalls, adapterCloseCalls, releaseCalls, storeCloseCalls }).toEqual({ drainCalls: 1, adapterCloseCalls: 1, releaseCalls: 1, storeCloseCalls: 1 });
    expect(supervisor.status()).toMatchObject({ operationalState: "closed", resourcesClosed: true, ownerReleased: true });
  });

  test("bounds tracked-operation drain with monotonic time when the system wall clock regresses", async () => {
    let resolveLate!: (result: PaperAdapterResult) => void;
    const lateExecution = new Promise<PaperAdapterResult>((resolve) => { resolveLate = resolve; });
    const adapter: PaperSupervisorAdapter = {
      execute() { return lateExecution; },
      async reconcile() { throw new Error("unexpected_reconcile"); },
      async drain() { return { drained: true }; },
      async close() {},
    };
    setTimeout(() => resolveLate({ kind: "pending", reason: "late completion after bounded close" }), 120);
    const supervisor = await PaperSupervisor.open({
      store: memoryStore(),
      adapter,
      limits: { adapterTimeoutMs: 15, drainTimeoutMs: 40 },
    });

    expect(await supervisor.tick({ plan: { ...plan, id: "wall-regress-close" }, expiresAtMs: Date.now() + 60_000 }))
      .toMatchObject({ kind: "held", reason: "adapter_timeout" });
    const originalDateNow = Date.now;
    let wallReads = 0;
    let result: Awaited<ReturnType<typeof supervisor.close>>;
    try {
      Date.now = () => wallReads++ === 0 ? 1_000_000 : 0;
      result = await supervisor.close();
    } finally {
      Date.now = originalDateNow;
    }
    await lateExecution;

    expect(wallReads).toBe(0);
    expect(result!).toEqual({ kind: "drain_incomplete", resourcesClosed: false, ownerReleased: false });
    expect(supervisor.status()).toMatchObject({ operationalState: "quarantined", resourcesClosed: false, ownerReleased: false });
  });

  test("quarantines each before-save lifecycle failure at the last acknowledged stage", async () => {
    const scenarios = ["reserve", "intent", "observation", "settlement", "stop", "cancellation", "release"] as const;
    for (const target of scenarios) {
      const base = memoryStore();
      let failedWrites = 0;
      let executed = 0;
      let releaseCalls = 0;
      const shouldFail = (candidate: PaperSupervisorEnvelope): boolean => {
        const capital = PaperCapital.restore(candidate.capital).snapshot();
        const attempt = candidate.attempts[0];
        switch (target) {
          case "reserve": return candidate.generation === 1;
          case "intent": return attempt?.phase === "intent";
          case "observation": return attempt?.phase === "observed";
          case "settlement": return attempt?.phase === "settled";
          case "stop": return capital.stopped;
          case "cancellation": return candidate.capital.events.at(-1)?.type === "cancel";
          case "release": return false;
        }
      };
      const store: PaperSupervisorStore = {
        createdFresh: base.createdFresh,
        load: () => base.load(),
        assertOwner: (generation) => base.assertOwner(generation),
        async publish(generation, candidate) {
          if (shouldFail(candidate)) { failedWrites++; throw new Error(`before_save_${target}`); }
          return base.publish(generation, candidate);
        },
        async release(generation) {
          releaseCalls++;
          if (target === "release") throw new Error("before_save_release");
          return base.release(generation);
        },
        close: () => base.close(),
      };
      const controller = new AbortController();
      const adapter: PaperSupervisorAdapter = {
        async execute(request) {
          executed++;
          return {
            kind: "terminal",
            evidenceId: `effect-before-save-${target}`,
            receipt: {
              receiptId: `receipt-before-save-${target}`,
              planId: request.plan.id,
              asset,
              inputAtoms: "100",
              returnedAtoms: target === "stop" ? "101" : "120",
              externalCostAtoms: "0",
              costsComplete: true,
              outcome: target === "stop" ? "reverted" : "completed",
            } satisfies PaperReceipt,
          };
        },
        async reconcile() { throw new Error("unexpected_reconcile"); },
        async drain() { return { drained: true }; },
        async close() {},
      };
      const supervisor = await PaperSupervisor.open({
        store,
        adapter,
        onStage(stage) { if (target === "cancellation" && stage === "reserved_saved") controller.abort(); },
      });

      let result: PaperSupervisorTickResult | undefined;
      if (target !== "release") result = await supervisor.tick({ plan: { ...plan, id: `before-save-${target}` }, expiresAtMs: Date.now() + 60_000 }, controller.signal);
      else await supervisor.close();

      const acknowledged = await base.load();
      expect(failedWrites).toBe(target === "release" ? 0 : 1);
      expect(supervisor.status()).toMatchObject({ operationalState: target === "release" ? "quarantined" : "quarantined", generation: acknowledged.generation });
      if (target === "release") {
        expect(await supervisor.close()).toEqual({ kind: "drain_incomplete", resourcesClosed: true, ownerReleased: false });
        expect(acknowledged.owner).toEqual({ token: "a".repeat(32), pid: 701 });
        expect(releaseCalls).toBe(1);
        continue;
      }

      expect(result).toMatchObject({ kind: "held" });
      expect(supervisor.status().holdReason).toBe("publication_uncertain");
      expect(executed).toBe(["observation", "settlement", "stop"].includes(target) ? 1 : 0);
      type JournalEventType = PaperSupervisorEnvelope["capital"]["events"][number]["type"];
      type AttemptPhase = PaperSupervisorEnvelope["attempts"][number]["phase"];
      const expectedByTarget: Record<typeof target, { generation: number; events: JournalEventType[]; phase: AttemptPhase | undefined }> = {
        reserve: { generation: 0, events: [], phase: undefined },
        intent: { generation: 1, events: ["reserve"], phase: undefined },
        observation: { generation: 2, events: ["reserve", "start"], phase: "intent" },
        settlement: { generation: 3, events: ["reserve", "start"], phase: "observed" },
        stop: { generation: 2, events: ["reserve", "start"], phase: "intent" },
        cancellation: { generation: 1, events: ["reserve"], phase: undefined },
      };
      const expected = expectedByTarget[target];
      expect(acknowledged.generation).toBe(expected.generation);
      expect(acknowledged.capital.events.map((event) => event.type)).toEqual(expected.events);
      expect(acknowledged.attempts[0]?.phase).toBe(expected.phase);
      if (target === "observation" || target === "settlement" || target === "stop") {
        expect(PaperCapital.restore(acknowledged.capital).snapshot()).toMatchObject({ balanceAtoms: "1000", committedAtoms: "110" });
      }
      const repeated = await supervisor.tick({ plan: { ...plan, id: `fresh-after-${target}` }, expiresAtMs: Date.now() + 60_000 });
      expect(repeated).toMatchObject({ kind: "held", reason: "publication_uncertain" });
      expect(canonicalJson(await base.load())).toBe(canonicalJson(acknowledged));
      expect(executed).toBe(["observation", "settlement", "stop"].includes(target) ? 1 : 0);
      await supervisor.close();
    }
  });

  test("durably records an accounting stop and adapter hold without accepting a rejected receipt", async () => {
    const adapter: PaperSupervisorAdapter = {
      async execute(request) {
        return {
          kind: "terminal",
          evidenceId: "effect-invalid-receipt",
          receipt: {
            receiptId: "receipt-invalid-receipt",
            planId: request.plan.id,
            asset,
            inputAtoms: "100",
            returnedAtoms: "101",
            externalCostAtoms: "0",
            costsComplete: true,
            outcome: "reverted",
          } satisfies PaperReceipt,
        };
      },
      async reconcile(request) {
        return {
          kind: "terminal",
          evidenceId: "effect-invalid-receipt",
          receipt: {
            receiptId: "receipt-invalid-receipt",
            planId: request.plan.id,
            asset,
            inputAtoms: "100",
            returnedAtoms: "101",
            externalCostAtoms: "0",
            costsComplete: true,
            outcome: "reverted",
          } satisfies PaperReceipt,
        };
      },
      async drain() { return { drained: true }; },
      async close() {},
    };
    const store = memoryStore();
    const supervisor = await PaperSupervisor.open({ store, adapter });

    const result = await supervisor.tick({ plan, expiresAtMs: Date.now() + 60_000 });
    const status = supervisor.status();
    const saved = await store.load();

    expect(result).toMatchObject({ kind: "held", reason: "adapter_contract" });
    expect(status.capital).toMatchObject({ stopped: true, stopReason: "invalid_receipt", balanceAtoms: "1000", committedAtoms: "110" });
    expect(status.heldAttemptIds).toEqual([expect.any(String)]);
    expect(saved.generation).toBe(4);
    expect(saved.hold).toBe("adapter_contract");
    expect(saved.attempts[0]?.phase).toBe("intent");
    expect(saved.attempts[0]?.observation).toBeNull();
    expect(saved.capital.events.map((event) => event.type)).toEqual(["reserve", "start", "stop"]);
    const repeated = await supervisor.tick();
    const afterRepeat = await store.load();
    expect(repeated).toMatchObject({ kind: "held", reason: "adapter_contract" });
    expect(afterRepeat.generation).toBe(saved.generation);
    expect(afterRepeat.capital.events).toEqual(saved.capital.events);
    expect((await supervisor.close()).ownerReleased).toBe(true);
  });
});
