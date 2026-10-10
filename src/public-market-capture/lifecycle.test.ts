import { expect, test } from "bun:test";
import { runCapture, readCapture, localClock } from "./index";
import { fixturePlan, fixtureDependencies } from "./capture.test";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
const ack = '{"event":"subscribe","arg":{"channel":"books","instId":"BTC-USDT"}}';
const snapshot = '{"arg":{"channel":"books","instId":"BTC-USDT"},"action":"snapshot","data":[{"seqId":10,"prevSeqId":-1,"asks":[],"bids":[],"ts":"1","checksum":0}]}';
function conserved(c: any) {
  expect(c.completeReceived).toBe(c.accepted + c.rejected); expect(c.completeReceived).toBe(c.rawPrepared + c.completeRejectedWithoutRaw);
  expect(c.rawPrepared).toBe(c.persistedRaw + c.unpersistedRaw); expect(c.dropped).toBe(c.unpersistedRaw + c.completeRejectedWithoutRaw + c.incompleteTransportAssemblies);
  expect(c.completeReceived + c.incompleteTransportAssemblies).toBe(c.persistedRaw + c.dropped);
}
test("C08 completed connect attempt keeps its active stream signal alive until shutdown", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); let wasAborted = true;
  deps.transport.connect = async (_p: any, _a: any, signal: AbortSignal, emit: any) => ({ closed: Promise.resolve().then(() => { wasAborted = signal.aborted; emit({ type: "message", source: "websocket", payload: ack }); emit({ type: "message", source: "websocket", payload: snapshot }); return { reason: "completed", retryable: false }; }), abort() {} });
  const report = await runCapture(plan, deps); expect(wasAborted).toBe(false); expect(report.outcome).toBe("captured_with_checked_continuity");
});
test("C08 operation completion checks its own monotonic attempt deadline", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); plan.limits.connections = 1;
  let mono = 0n; deps.clock.sample = () => ({ wallMs: 2000, monoNs: String(mono) });
  deps.transport.connect = async () => { mono = 11000000000n; return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; };
  const report = await runCapture(plan, deps); expect(report.outcome).toBe("failed_incomplete"); expect(report.stopReason).toBe("attempt_timeout");
});
test("C10 cancellation at 299 seconds permits no write when the queue reaches 300 seconds", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]), cancel = new AbortController(); let mono = 0n;
  deps.signal = cancel.signal; deps.clock.sample = () => ({ wallMs: 2000, monoNs: String(mono) });
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => { mono = 299000000000n; emit({ type: "message", source: "websocket", payload: ack }); cancel.abort(); mono = 300000000000n; emit({ type: "message", source: "websocket", payload: snapshot }); return { closed: new Promise(() => {}), abort() {} }; };
  const report = await runCapture(plan, deps); const recovery = readCapture(join(plan.outputRoot, plan.experimentId));
  expect(report.outcome).toBe("failed_incomplete"); expect(report.durationNs).toBe("300000000000");
  expect(report.counts.completeReceived).toBe(2); expect(report.counts.persistedRaw).toBe(0); expect(report.counts.unpersistedRaw).toBe(2); expect(recovery.manifest).toBeNull(); conserved(report.counts);
});
test("C10 cancellation aborts a pending request and finalizes only within shared time", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]), cancel = new AbortController(); let aborted = false;
  deps.signal = cancel.signal; deps.transport.requestMetadata = async (_i: any, signal: AbortSignal) => { signal.addEventListener("abort", () => { aborted = true; }, { once: true }); cancel.abort(); await new Promise(() => {}); };
  const report = await runCapture(plan, deps); expect(aborted).toBe(true); expect(report.outcome).toBe("failed_incomplete"); expect(report.attempts).toBe(0); conserved(report.counts);
});
test("C08 C11 over-limit callbacks conserve rejected counts overlapping persisted malformed raw", async () => {
  const plan = fixturePlan(); plan.limits.messages = 2;
  const report = await runCapture(plan, fixtureDependencies(["{malformed", ack]));
  expect(report.counts).toMatchObject({ completeReceived: 3, accepted: 1, rejected: 2, rawPrepared: 2, persistedRaw: 2, completeRejectedWithoutRaw: 1, dropped: 1 }); conserved(report.counts);
  expect(report.outcome).toBe("captured_with_gaps"); for (const key of ["strategyQualified", "executionQualified", "profitEvidence"]) expect(report[key]).toBe(false);
});
test("C08 C11 incomplete assemblies have no fabricated complete hash or callback timestamp", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]);
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => { emit({ type: "incomplete", reason: "encoded_frame_limit", size: 1048577, provenance: "source_declared", units: 1 }); return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; };
  const report = await runCapture(plan, deps); conserved(report.counts);
  const controls = readFileSync(join(plan.outputRoot, plan.experimentId, "control.jsonl"), "utf8").split("\n").filter(Boolean).map(v => JSON.parse(v));
  expect(controls.find(v => v.kind === "transport_rejection")).toMatchObject({ completeHash: null, callbackTime: null, provenance: "source_declared" }); expect(report.outcome).toBe("captured_with_gaps");
});
test("C08 provider refusal/throttling and schema/control errors never retry", async () => {
  for (const reason of ["provider_refusal", "provider_throttled", "invalid_websocket_handshake", "storage_failure"]) {
    const plan = fixturePlan(), deps = fixtureDependencies([]); let calls = 0, waits = 0;
    deps.transport.connect = async () => { calls++; throw Error(reason); }; deps.clock.wait = async () => { waits++; };
    const report = await runCapture(plan, deps); expect(calls).toBe(1); expect(waits).toBe(0); expect(report.outcome).toBe("failed_incomplete");
  }
});
test("C03 C10 fresh local clocks have distinct identity and interrupted wait", async () => {
  const a = localClock(), b = localClock(), cancel = new AbortController(); expect(a.identity).not.toBe(b.identity);
  const waiting = a.wait(1000, cancel.signal); cancel.abort(); await expect(waiting).rejects.toThrow("cancelled");
});
test("C08 C09 final disk timing stays provisional; observed final-write overshoot cannot recover as checked", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([ack, snapshot]); const manifestPath = join(plan.outputRoot, plan.experimentId, "manifest.json");
  deps.clock.sample = () => ({ wallMs: 2000, monoNs: existsSync(manifestPath) ? "301000000000" : "0" });
  const report = await runCapture(plan, deps), recovery = readCapture(join(plan.outputRoot, plan.experimentId));
  expect(report.outcome).toBe("failed_incomplete"); expect(report.stopReason).toBe("deadline_overshoot");
  expect(report.durationNs).toBe("301000000000"); expect(recovery.outcome).toBe("failed_incomplete");
  expect(recovery.manifest.finalTiming).toEqual({ state: "unobserved", completedAt: null, durationNs: null });
});

test("C08 retry waits cannot outlive the shared deadline even when a synthetic wait stalls", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]), cancel = new AbortController(); plan.limits.durationMs = 25; deps.signal = cancel.signal;
  deps.clock.sample = () => ({ wallMs: 2000, monoNs: "0" }); let calls = 0, aborted = false;
  deps.clock.wait = async (_ms: number, signal: AbortSignal) => { signal.addEventListener("abort", () => { aborted = true; }); await new Promise(() => {}); };
  deps.transport.connect = async () => { calls++; return { closed: Promise.resolve({ reason: "connection_io", retryable: true }), abort() {} }; };
  const result = await Promise.race([runCapture(plan, deps), new Promise<string>(resolve => setTimeout(() => resolve("unbounded_retry_wait"), 150))]);
  cancel.abort(); expect(result).not.toBe("unbounded_retry_wait"); expect(calls).toBe(1); expect(aborted).toBe(true);
  expect((result as any).outcome).toBe("failed_incomplete"); expect((result as any).stopReason).toBe("deadline_exhausted");
});

test("C10 active stream cancellation aborts the stream and preserves a clean observed interval", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]), cancel = new AbortController(); plan.limits.durationMs = 100; deps.signal = cancel.signal;
  let streamAborted = false, signalAborted = false;
  deps.transport.connect = async (_p: any, _a: any, signal: AbortSignal, emit: any) => {
    signal.addEventListener("abort", () => { signalAborted = true; }); emit({ type: "message", source: "websocket", payload: ack }); emit({ type: "message", source: "websocket", payload: snapshot });
    setTimeout(() => cancel.abort(), 5);
    return { closed: new Promise(() => {}), abort() { streamAborted = true; } };
  };
  const report = await runCapture(plan, deps); expect(streamAborted).toBe(true); expect(signalAborted).toBe(true);
  expect(report.outcome).toBe("captured_with_checked_continuity"); expect(report.stopReason).toBe("cancelled"); conserved(report.counts);
});

test("C08 encoded JSON/base64 storage limit preserves the raw partition and terminal reserve", async () => {
  const plan = fixturePlan(); plan.limits.persistedBytes = 20000; plan.limits.controlBytes = 18000; plan.limits.messages = 5; plan.limits.segments = 2;
  const report = await runCapture(plan, fixtureDependencies([ack, snapshot]));
  expect(report.outcome).toBe("failed_incomplete"); expect(report.stopReason).toBe("persisted_byte_limit");
  expect(report.counts.unpersistedRaw).toBeGreaterThan(0); expect(report.encodedBytes).toBeLessThanOrEqual(plan.limits.persistedBytes); conserved(report.counts);
});

test("C08 metadata attempts time out and transport errors exhaust at most three attempts", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); plan.limits.attemptMs = 5; let aborted = false;
  deps.transport.requestMetadata = async (_i: any, signal: AbortSignal) => { signal.addEventListener("abort", () => { aborted = true; }); await new Promise(() => {}); };
  const report = await runCapture(plan, deps); expect(aborted).toBe(true); expect(report.stopReason).toBe("attempt_timeout"); expect(report.outcome).toBe("failed_incomplete");
  const other = fixturePlan(), retry = fixtureDependencies([]); let calls = 0; const waits: number[] = [];
  retry.transport.connect = async () => { calls++; throw Error("connection_io"); }; const wait = retry.clock.wait; retry.clock.wait = async (ms: number, signal: AbortSignal) => { waits.push(ms); await wait(ms, signal); };
  const exhausted = await runCapture(other, retry); expect(calls).toBe(3); expect(waits).toEqual([1000, 2000]); expect(exhausted.outcome).toBe("failed_incomplete");
});

test("C09 C11 appended records remain unpersisted when finalization crosses its deadline", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([ack, snapshot]); const path = join(plan.outputRoot, plan.experimentId, "manifest.json");
  deps.clock.sample = () => ({ wallMs: 2000, monoNs: existsSync(path) ? "301000000000" : "0" });
  const report = await runCapture(plan, deps);
  expect(report.counts.persistedRaw).toBe(0); expect(report.counts.unpersistedRaw).toBe(3); expect(report.counts.dropped).toBe(3);
  expect(report.outcome).toBe("failed_incomplete"); expect(report.stopReason).toBe("deadline_overshoot"); conserved(report.counts);
});

test("C05 C11 websocket protocol controls retain bytes and clocks outside application counts", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]);
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => { emit({ type: "control", opcode: 9, payload: Buffer.from([0, 255]) }); for (const payload of [ack, snapshot]) emit({ type: "message", source: "websocket", payload }); return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; };
  const report = await runCapture(plan, deps);
  expect(report.outcome).toBe("captured_with_checked_continuity"); expect(report.counts.completeReceived).toBe(3); expect(report.counts.persistedRaw).toBe(3); conserved(report.counts);
  const controls = readFileSync(join(plan.outputRoot, plan.experimentId, "control.jsonl"), "utf8").split("\n").filter(Boolean).map(v => JSON.parse(v));
  expect(controls.find(v => v.kind === "websocket_control")).toMatchObject({ opcode: 9, payloadBytes: 2, payloadBase64: "AP8=", encoding: "websocket_control_binary", reception: { clockId: "fixture-clock" } });
  expect(controls.find(v => v.kind === "subscription_attempt").streams).toEqual(plan.streams);
});

test("C10 pending connects and retry waits abort promptly on cancellation", async () => {
  for (const state of ["connect", "retry"]) {
    const plan = fixturePlan(), deps = fixtureDependencies([]), cancel = new AbortController();
    deps.signal = cancel.signal; let aborted = false, calls = 0;
    if (state === "connect") deps.transport.connect = async (_p: any, _a: any, signal: AbortSignal) => {
      calls++; signal.addEventListener("abort", () => { aborted = true; }); cancel.abort(); await new Promise(() => {});
    };
    else {
      deps.transport.connect = async () => { calls++; throw Error("connection_io"); };
      deps.clock.wait = async (_ms: number, signal: AbortSignal) => {
        signal.addEventListener("abort", () => { aborted = true; }); cancel.abort(); await new Promise(() => {});
      };
    }
    const result = await Promise.race([runCapture(plan, deps), new Promise<string>(resolve => setTimeout(() => resolve("unbounded_cancellation"), 150))]);
    expect(result).not.toBe("unbounded_cancellation"); expect(aborted).toBe(true); expect(calls).toBe(1);
    expect((result as any).stopReason).toBe("cancelled"); conserved((result as any).counts);
  }
});

test("C03 backward monotonic reception stops capture without reordering prior raw", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); let mono = 1000000000n;
  deps.clock.sample = () => ({ wallMs: 2000, monoNs: String(mono) });
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => {
    emit({ type: "message", source: "websocket", payload: ack }); mono = 999999999n;
    emit({ type: "message", source: "websocket", payload: snapshot });
    return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} };
  };
  const report = await runCapture(plan, deps);
  expect(report.outcome).toBe("failed_incomplete"); expect(report.stopReason).toBe("invalid_monotonic_clock");
  expect(report.durationNs).toBeNull(); conserved(report.counts);
});

test("REPAIR01 F01 C03 C11 regressing ping pong and close preserve causal raw order", async () => {
  for (const opcode of [9, 10, 8]) for (const delayedDrain of [true, false]) {
    const plan = fixturePlan(), deps = fixtureDependencies([]); let wall = 2000, mono = 0n;
    deps.clock.sample = () => ({ wallMs: wall, monoNs: String(mono += 1000000n) });
    const delta = snapshot.replace('"snapshot"', '"update"').replace('"seqId":10,"prevSeqId":-1', '"seqId":11,"prevSeqId":10');
    deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => {
      for (const payload of [ack, snapshot]) emit({ type: "message", source: "websocket", payload });
      if (!delayedDrain) await new Promise(resolve => setImmediate(resolve));
      wall = 1900; emit({ type: "control", opcode, payload: Buffer.from([0, 255]) });
      wall = 2001; emit({ type: "message", source: "websocket", payload: delta });
      return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} };
    };
    const report = await runCapture(plan, deps), recovery = readCapture(join(plan.outputRoot, plan.experimentId));
    expect(report.outcome).toBe("captured_with_gaps"); expect(report.clock.ambiguous).toBe(true);
    expect(report.diagnostics.gaps).toContain("clock_ambiguous"); expect(report.segments).toBe(2);
    expect(recovery.errors).toEqual([]); expect(recovery.records.map(r => r.accepted)).toEqual([true, true, true, false]);
    expect(recovery.records.map(r => r.reception.ordinal)).toEqual([1, 2, 3, 5]);
    expect(recovery.records.map(r => r.reception.wallMs)).toEqual([2000, 2000, 2000, 2001]);
    expect(recovery.manifest.segments[0]).toMatchObject({ lastOrdinal: 3, terminationReason: "wall_regression", clockStatus: "clock_ambiguous" });
    const controls = readFileSync(join(plan.outputRoot, plan.experimentId, "control.jsonl"), "utf8").trim().split("\n").map(v => JSON.parse(v));
    expect(controls.find(v => v.kind === "websocket_control")).toMatchObject({ opcode, payloadBase64: "AP8=", reception: { ordinal: 4, wallMs: 1900 } });
    expect(report.counts.persistedRaw).toBe(4); conserved(report.counts);
  }
});

test("REPAIR01 F01 a terminal control regression closes the earlier verified segment", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); let wall = 2000;
  deps.clock.sample = () => ({ wallMs: wall, monoNs: "0" });
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => {
    for (const payload of [ack, snapshot]) emit({ type: "message", source: "websocket", payload });
    wall = 1900; emit({ type: "control", opcode: 8, payload: Buffer.alloc(0) });
    return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} };
  };
  const report = await runCapture(plan, deps), recovery = readCapture(join(plan.outputRoot, plan.experimentId));
  expect(report.outcome).toBe("captured_with_gaps"); expect(report.clock.ambiguous).toBe(true);
  expect(recovery.records.map(r => r.accepted)).toEqual([true, true, true]);
  expect(recovery.manifest.segments[0]).toMatchObject({ terminationReason: "wall_regression", clockStatus: "clock_ambiguous" });
  conserved(report.counts);
});

test("REPAIR01 F01 a rejected next callback cannot consume a pending control boundary", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); let wall = 2000;
  deps.clock.sample = () => ({ wallMs: wall, monoNs: "0" });
  deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => {
    for (const payload of [ack, snapshot]) emit({ type: "message", source: "websocket", payload });
    wall = 1900; emit({ type: "control", opcode: 9, payload: Buffer.alloc(0) });
    wall = 2001; emit({ type: "message", source: "websocket", payload: Buffer.alloc(plan.limits.payloadBytes + 1) });
    return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} };
  };
  const report = await runCapture(plan, deps), recovery = readCapture(join(plan.outputRoot, plan.experimentId));
  expect(report.outcome).toBe("captured_with_gaps"); expect(report.clock.ambiguous).toBe(true);
  expect(recovery.records.map(r => r.accepted)).toEqual([true, true, true]);
  expect(recovery.manifest.segments[0]).toMatchObject({ terminationReason: "wall_regression", clockStatus: "clock_ambiguous" });
  expect(report.counts.completeRejectedWithoutRaw).toBe(1); conserved(report.counts);
});
