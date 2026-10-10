import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { preflightCapture, runCapture, readCapture } from "./index";
import { CEILINGS } from "./plan";
import { fixturePlan, fixtureAccess, fixtureCapabilities, fixtureDependencies } from "./capture.test";
const ack = '{"event":"subscribe","arg":{"channel":"books","instId":"BTC-USDT"}}';
const snapshot = '{"arg":{"channel":"books","instId":"BTC-USDT"},"action":"snapshot","data":[{"seqId":10,"prevSeqId":-1,"asks":[],"bids":[],"ts":"1","checksum":0}]}';

test("C01 C02 C08 every immutable ceiling and gate rejects before filesystem and transport", async () => {
  const base = fixturePlan();
  const invalid: any[] = Object.entries(CEILINGS).flatMap(([key, max]) => [max + 1, 0, -1, 0.5, NaN, Infinity].map(value => ({ ...base, limits: { ...base.limits, [key]: value } })));
  invalid.push({ ...base, schema: "old" }, { ...base, region: "restricted" }, { ...base, limits: { ...base.limits, extra: 1 } }, { ...base, instruments: [{ ...base.instruments[0], account: true }] }, { ...base, streams: [{ channel: "funding-rate", instrument: "BTC-USDT" }] }, { ...base, instruments: [...base.instruments, { id: "ETH-USDT", kind: "SPOT" }] });
  let calls = 0; const deps = fixtureDependencies([]); deps.transport.requestMetadata = async () => { calls++; }; deps.transport.connect = async () => { calls++; };
  for (const plan of invalid) { expect(preflightCapture(plan, fixtureAccess, fixtureCapabilities, 2000).ok).toBe(false); expect((await runCapture(plan, deps)).outcome).toBe("not_started"); }
  expect(calls).toBe(0); expect(existsSync(join(base.outputRoot, base.experimentId))).toBe(false);
  for (const change of [{ terms: "unknown" }, { regionAssessment: "unknown" }, { authority: { status: "unknown", provenance: "unknown" } }, { issuedAt: 3000 }, { expiresAt: 2000 }, { endpoints: [base.endpoints.rest] }, { evidence: "unknown" }, { extra: true }]) expect(preflightCapture(base, { ...fixtureAccess, ...change }, fixtureCapabilities, 2000).ok).toBe(false);
  for (const field of ["incrementalEncoded", "incrementalDecoded", "aggregateHeld", "interruptible", "sharedDeadline"]) expect(preflightCapture(base, fixtureAccess, { ...fixtureCapabilities, [field]: false }, 2000).ok).toBe(false);
  expect(preflightCapture(base, fixtureAccess, { ...fixtureCapabilities, evidence: "qualified" }, 2000).ok).toBe(false);
});

test("C08 metadata request and segment ceilings stop local work with conserved records", async () => {
  const plan = fixturePlan(); plan.instruments.push({ id: "BTC-USDT-SWAP", kind: "SWAP" }); plan.streams.push({ channel: "books", instrument: "BTC-USDT-SWAP" }); plan.limits.metadataRequests = 1;
  const deps = fixtureDependencies([]); let calls = 0; deps.transport.requestMetadata = async () => { calls++; };
  expect((await runCapture(plan, deps)).outcome).toBe("not_started"); expect(calls).toBe(0);
  const bounded = fixturePlan(), retry = fixtureDependencies([]); bounded.limits.segments = 1; let attempts = 0;
  retry.transport.connect = async (_p: any, attempt: number, _s: any, emit: any) => { attempts++; emit({ type: "message", source: "websocket", payload: ack }); return { closed: Promise.resolve({ reason: attempt === 1 ? "connection_io" : "completed", retryable: attempt === 1 }), abort() {} }; };
  const report = await runCapture(bounded, retry); expect(report.stopReason).toBe("segment_limit"); expect(report.outcome).toBe("failed_incomplete"); expect(attempts).toBe(2);
  expect(readdirSync(join(bounded.outputRoot, bounded.experimentId)).filter(n => n.startsWith("segment-"))).toHaveLength(1);
  expect(report.counts.rawPrepared).toBe(report.counts.persistedRaw + report.counts.unpersistedRaw);
});

test("C10 cancelled drain is limited to five seconds even with a longer global deadline", async () => {
  for (const after of [4999000000n, 5000000000n]) {
    const plan = fixturePlan(), deps = fixtureDependencies([]), cancel = new AbortController(); let mono = 0n; deps.signal = cancel.signal;
    deps.clock.sample = () => ({ wallMs: 2000, monoNs: String(mono) });
    deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => { for (const payload of [ack, snapshot]) emit({ type: "message", source: "websocket", payload }); cancel.abort(); mono = after; return { closed: new Promise(() => {}), abort() {} }; };
    const report = await runCapture(plan, deps); expect(report.durationNs).toBe(String(after));
    if (after < 5000000000n) { expect(report.outcome).toBe("captured_with_checked_continuity"); expect(report.stopReason).toBe("cancelled"); }
    else { expect(report.outcome).toBe("failed_incomplete"); expect(report.counts.persistedRaw).toBe(0); expect(report.counts.unpersistedRaw).toBe(3); expect(existsSync(join(plan.outputRoot, plan.experimentId, "manifest.json"))).toBe(false); }
    expect(report.counts.completeReceived + report.counts.incompleteTransportAssemblies).toBe(report.counts.persistedRaw + report.counts.dropped);
  }
});

test("C04 binary raw and complete oversize callbacks retain exact evidence or a bounded rejection", async () => {
  const plan = fixturePlan(); const report = await runCapture(plan, fixtureDependencies([Buffer.from([255, 0, 128])]));
  const last = readCapture(join(plan.outputRoot, plan.experimentId)).records.at(-1)!;
  expect(last.encoding).toBe("application_binary"); expect(last.payloadBase64).toBe("/wCA"); expect(last.reason).toBe("malformed_json"); expect(report.outcome).toBe("captured_with_gaps");
  const other = fixturePlan(); const over = await runCapture(other, fixtureDependencies([Buffer.alloc(1048577)]));
  expect(over.stopReason).toBe("payload_limit"); expect(over.counts.completeRejectedWithoutRaw).toBe(1); expect(over.counts.persistedRaw).toBe(1);
  expect(readCapture(join(other.outputRoot, other.experimentId)).records).toHaveLength(1);
});

test("C10 C11 empty initial metadata has a precise no-data failure and restart identities differ", async () => {
  const empty = fixturePlan(), deps = fixtureDependencies([]); deps.transport.requestMetadata = async () => {};
  const noData = await runCapture(empty, deps); expect(noData.outcome).toBe("failed_incomplete"); expect(noData.stopReason).toBe("metadata_missing"); expect(noData.counts.completeReceived).toBe(0);
  const a = fixturePlan(), b = fixturePlan(); b.parentExperimentId = a.experimentId; b.experimentId = "restart";
  const first = await runCapture(a, fixtureDependencies([ack, snapshot])), second = await runCapture(b, fixtureDependencies([ack, snapshot]));
  const ra = readCapture(join(a.outputRoot, a.experimentId)).records[0]!, rb = readCapture(join(b.outputRoot, b.experimentId)).records[0]!;
  expect(ra.reception.processId).not.toBe(rb.reception.processId); expect(ra.reception.sessionId).not.toBe(rb.reception.sessionId); expect(first.connections[0].connectionId).not.toBe(second.connections[0].connectionId);
  expect(second.restartGap).toBe(true); expect(second.outcome).toBe("captured_with_gaps");
});
