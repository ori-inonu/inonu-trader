import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { preflightCapture, runCapture, readCapture } from "./index";

test("C08 transport assemblies and queued callbacks share sixteen admission units", async () => {
  const plan = fixturePlan(); const deps = fixtureDependencies([]);
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any, context: any) => {
    const held = Array.from({ length: 16 }, () => context.ingress.open());
    emit({ type: "message", source: "websocket", payload: ACK });
    for (const r of held) context.ingress.release(r);
    return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} };
  };
  const report = await runCapture(plan, deps);
  expect(report.stopReason).toBe("backpressure_limit");
  expect(report.counts).toMatchObject({ completeReceived: 2, rawPrepared: 1, completeRejectedWithoutRaw: 1, rejected: 1, persistedRaw: 1, dropped: 1 });
});

test("C03 invalid later monotonic sample yields an incomplete report instead of throwing", async () => {
  const plan = fixturePlan(); const deps = fixtureDependencies([]); const sample = deps.clock.sample; let invalid = false;
  deps.clock.sample = () => invalid ? { wallMs: 2000, monoNs: "invalid" } : sample();
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => { invalid = true; emit({ type: "message", source: "websocket", payload: ACK }); return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; };
  const report = await runCapture(plan, deps);
  expect(report.outcome).toBe("failed_incomplete");
  expect(report.durationNs).toBeNull();
});

test("C10 a parent-linked new experiment declares its unobserved gap", async () => {
  const plan = fixturePlan(); plan.parentExperimentId = "older";
  const report = await runCapture(plan, fixtureDependencies([ACK, SNAPSHOT]));
  expect(report.outcome).toBe("captured_with_gaps");
  expect(report.restartGap).toBe(true);
});

export function fixturePlan(root = mkdtempSync(join(tmpdir(), "inonu-capture-"))): any {
  return { version: 1, mode: "capture", experimentId: "fixture", parentExperimentId: null, outputRoot: root,
    schema: "okx-public-v5-2026-10-10", region: "global", endpoints: { rest: "https://www.okx.com", websocket: "wss://ws.okx.com:8443/ws/v5/public" },
    instruments: [{ id: "BTC-USDT", kind: "SPOT" }], streams: [{ channel: "books", instrument: "BTC-USDT" }],
    limits: { durationMs: 300000, messages: 10000, payloadBytes: 1048576, persistedBytes: 33554432, controlBytes: 2097152, segments: 32, connections: 3, metadataRequests: 3, attemptMs: 10000, ingressBytes: 8388608, pending: 16 } };
}
export const fixtureAccess: any = { version: 1, id: "fixture-access", evidence: "synthetic", issuedAt: 1000, expiresAt: 1000000,
  schema: "okx-public-v5-2026-10-10", region: "global", endpoints: ["https://www.okx.com", "wss://ws.okx.com:8443/ws/v5/public"],
  terms: "qualified", regionAssessment: "qualified", authority: { status: "explicit", provenance: "offline test fixture; not a live authority" } };
export const fixtureCapabilities: any = { version: 1, runtime: "offline-fixture", evidence: "synthetic", incrementalEncoded: true, incrementalDecoded: true, aggregateHeld: true, interruptible: true, sharedDeadline: true };
export function fixtureDependencies(messages: any[], options: any = {}): any {
  let mono = 0n; let wall = 2000;
  return { access: fixtureAccess, clock: { identity: "fixture-clock", sample: () => ({ wallMs: wall++, monoNs: String(mono += 1000000n) }), wait: async (ms: number, signal: AbortSignal) => { if(signal.aborted) throw Error("cancelled"); mono += BigInt(ms) * 1000000n; }, offsetMs: null, uncertaintyMs: null },
    transport: { capabilities: fixtureCapabilities, requestMetadata: async (instrument: any, signal: AbortSignal, emit: any) => { emit({ type: "message", source: "metadata", instrument: instrument.id, payload: '{"code":"0","data":[{"instId":"BTC-USDT","instType":"SPOT","baseCcy":"BTC","quoteCcy":"USDT","lotSz":"0.00001","tickSz":"0.1","minSz":"0.00001","state":"live"}]}' }); },
      connect: async (_plan: any, _attempt: number, _signal: AbortSignal, emit: any) => { for (const payload of messages) emit({ type: "message", source: "websocket", payload }); return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; } }, ...options };
}
const ACK = '{"event":"subscribe","arg":{"channel":"books","instId":"BTC-USDT"}}';
const SNAPSHOT = '{"arg":{"channel":"books","instId":"BTC-USDT"},"action":"snapshot","data":[{"seqId":9007199254740993,"prevSeqId":-1,"asks":[["12.000000000000000001","1","0","1"]],"bids":[],"ts":"1700000000000","checksum":0}]}';

for (const initiallyValid of [false, true]) test(`REPAIR01 F03 C04 C05 C11 mutable bytes ${initiallyValid ? "ack to malformed spaces" : "malformed spaces to ack"}`, async () => {
    const plan = fixturePlan(), deps = fixtureDependencies([]), spaces = " ".repeat(Buffer.byteLength(ACK));
    const original = initiallyValid ? ACK : spaces, replacement = initiallyValid ? spaces : ACK;
    const payload = Uint8Array.from(Buffer.from(original));
    deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => {
      const event = { type: "message", source: "websocket", payload }; emit(event);
      payload.set(Buffer.from(replacement));
      emit({ type: "message", source: "websocket", payload: SNAPSHOT });
      return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} };
    };
    const report = await runCapture(plan, deps), recovery = readCapture(join(plan.outputRoot, plan.experimentId)), r = recovery.records[1]!;
    expect(Buffer.from(r.payloadBase64, "base64").toString()).toBe(original);
    expect(r.source).toBe("websocket"); expect(r.accepted).toBe(initiallyValid);
    expect(r.reason).toBe(initiallyValid ? "acknowledgement" : "malformed_json");
    expect(recovery.records[2]!.accepted).toBe(initiallyValid);
    expect(report.outcome).toBe(initiallyValid ? "captured_with_checked_continuity" : "captured_with_gaps");
    expect(report.counts).toMatchObject({ completeReceived: 3, rawPrepared: 3, persistedRaw: 3, unpersistedRaw: 0 });
    expect(recovery.errors).toEqual([]);
});

test("REPAIR01 F03 immutable metadata callback identity is retained before deferred inspection", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([ACK, SNAPSHOT]);
  deps.transport.requestMetadata = async (i: any, _s: any, emit: any) => {
    const event = { type: "message", source: "metadata", instrument: i.id, payload: '{"code":"0","data":[{"instId":"BTC-USDT","instType":"SPOT","baseCcy":"BTC","quoteCcy":"USDT","lotSz":"0.00001","tickSz":"0.1","minSz":"0.00001","state":"live"}]}' };
    emit(event); event.instrument = "OTHER"; event.source = "websocket"; event.payload = "{}";
  };
  const report = await runCapture(plan, deps), recovery = readCapture(join(plan.outputRoot, plan.experimentId));
  expect(recovery.records[0]!.accepted).toBe(true); expect(recovery.records[0]!.source).toBe("metadata");
  expect(recovery.records[0]!.observation.instrument).toBe("BTC-USDT"); expect(report.outcome).toBe("captured_with_checked_continuity");
  expect(report.metadataRequests).toBe(1); expect(report.counts.persistedRaw).toBe(3);
});

test("REPAIR01 F03 C08 owned callback copy is admitted before allocation and all charges release", async () => {
  for (const reserved of [false, true]) {
    const plan = fixturePlan(), deps = fixtureDependencies([]); plan.limits.ingressBytes = 2600; let budget: any;
    deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any, context: any) => {
      budget = context.ingress; const reservation = reserved ? budget.open() : undefined;
      if (reservation) budget.grow(reservation, 1000);
      emit({ type: "message", source: "websocket", payload: Buffer.alloc(1000, 32), reservation });
      return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} };
    };
    const report = await runCapture(plan, deps);
    expect(report.stopReason).toBe("aggregate_ingress_limit");
    expect(report.counts).toMatchObject({ completeReceived: 2, rawPrepared: 1, completeRejectedWithoutRaw: 1, persistedRaw: 1 });
    expect(budget.bytes).toBe(0); expect(budget.units).toBe(0);
  }
});

test("C03 wall regression closes only later evidence; prior admitted snapshot remains admitted", async () => {
  const plan = fixturePlan(); const deps = fixtureDependencies([]); let wall = 2000, mono = 0n;
  deps.clock.sample = () => ({ wallMs: wall, monoNs: String(mono += 1000000n) });
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => { emit({ type: "message", source: "websocket", payload: ACK }); emit({ type: "message", source: "websocket", payload: SNAPSHOT }); wall = 1900; emit({ type: "message", source: "websocket", payload: SNAPSHOT }); return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; };
  const report = await runCapture(plan, deps);
  const recovered = readCapture(join(plan.outputRoot, plan.experimentId));
  expect(recovered.records[2]!.accepted).toBe(true);
  expect(recovered.records[3]!.accepted).toBe(false);
  expect(report.clock.ambiguous).toBe(true);
  expect(report.segments).toBe(2);
});

test("C03 C04 exact raw payload and reception survive malformed data without event-time substitution", async () => {
  const plan = fixturePlan();
  const report: any = await runCapture(plan, fixtureDependencies([ACK, SNAPSHOT, "{malformed"]));
  const recovered: any = readCapture(join(plan.outputRoot, plan.experimentId));
  expect(report.outcome).toBe("captured_with_gaps");
  expect(recovered.records.length).toBe(4);
  const raw = recovered.records[2];
  expect(Buffer.from(raw.payloadBase64, "base64").toString()).toBe(SNAPSHOT);
  expect(raw.encoding).toBe("runtime_text_utf8");
  expect(raw.reception.ordinal).toBe(3);
  expect(raw.reception.monoNs).toMatch(/^\d+$/);
  expect(raw.observation.seqId).toBe("9007199254740993");
  expect(raw.observation.eventTime).toBe("1700000000000");
  expect(recovered.records[3].reason).toBe("malformed_json");
  expect(report.clock.uncertaintyMs).toBeNull();
  expect(report.globalAvailableAt).toBeNull();
});

test("C02 valid pinned finite plan admits but unknown, duplicate, nonfinite and private inputs refuse", () => {
  const plan = fixturePlan();
  expect(preflightCapture(plan, fixtureAccess, fixtureCapabilities, 2000).ok).toBe(true);
  for (const changed of [ { ...plan, surprise: true }, { ...plan, streams: [...plan.streams, ...plan.streams] }, { ...plan, limits: { ...plan.limits, durationMs: Infinity } }, { ...plan, streams: [{ channel: "orders", instrument: "BTC-USDT" }] }, { ...plan, endpoints: { ...plan.endpoints, rest: "https://evil.invalid" } } ]) {
    expect(preflightCapture(changed, fixtureAccess, fixtureCapabilities, 2000).ok).toBe(false);
  }
  expect(preflightCapture(plan, { ...fixtureAccess, expiresAt: 1 }, fixtureCapabilities, 2000).ok).toBe(false);
  expect(preflightCapture(plan, fixtureAccess, { ...fixtureCapabilities, incrementalEncoded: null }, 2000).ok).toBe(false);
});

test("C01 offline and unknown authority refuse before directory or transport", async () => {
  const root = mkdtempSync(join(tmpdir(), "inonu-capture-"));
  let calls = 0;
  const report = await runCapture({ mode: "offline" }, { transport: { capabilities: {}, requestMetadata: () => { calls++; }, connect: () => { calls++; } } } as any);
  expect(report.outcome).toBe("not_started");
  expect(report.start).toBeNull();
  expect(calls).toBe(0);
  expect(existsSync(join(root, "capture"))).toBe(false);
  expect(preflightCapture({ mode: "capture" }, null, null).ok).toBe(false);
});
