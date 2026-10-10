import { expect, test } from "bun:test";
import { runCapture, readCapture } from "./index";
import { fixturePlan, fixtureDependencies } from "./capture.test";
import { join } from "node:path";
const ack = '{"event":"subscribe","arg":{"channel":"books","instId":"BTC-USDT"}}';
function book(seq: string, prev: string, action = "update", amount = "1"): string {
  return `{"arg":{"channel":"books","instId":"BTC-USDT"},"action":"${action}","data":[{"seqId":${seq},"prevSeqId":${prev},"asks":${amount ? `[["1.000000000000000001","${amount}","0","1"]]` : "[]"},"bids":[],"ts":"1700000000000","checksum":0}]}`;
}
async function capture(messages: string[]) { const plan = fixturePlan(); const report = await runCapture(plan, fixtureDependencies(messages)); return { report, records: readCapture(join(plan.outputRoot, plan.experimentId)).records.slice(1) }; }

test("C06 immediate exact duplicates, heartbeat and linked reset preserve checked continuity and exact epochs", async () => {
  const snapshot = book("10", "-1", "snapshot"), delta = book("11", "10"), heartbeat = book("11", "11", "update", ""), reset = book("3", "11"), next = book("4", "3");
  const { report, records } = await capture([ack, snapshot, snapshot, delta, delta, heartbeat, reset, reset, next]);
  expect(report.outcome).toBe("captured_with_checked_continuity");
  expect(report.diagnostics).toMatchObject({ duplicates: 3, heartbeats: 1, resets: 1 });
  expect(records.map(r => r.reason)).toEqual(["acknowledgement", "snapshot", "duplicate", "linked_delta", "duplicate", "heartbeat", "linked_reset", "duplicate", "linked_delta"]);
  expect(records[6]!.observation.epoch).toBe(1); expect(records[8]!.observation.epoch).toBe(1);
  expect(records[1]!.observation.checksumIntegrity).toBe(false);
});

test("C06 reset clears old fingerprints; nonadjacent replay never receives a duplicate exemption", async () => {
  const delta = book("11", "10");
  const { report, records } = await capture([ack, book("10", "-1", "snapshot"), delta, book("3", "11"), delta]);
  expect(records.at(-1)!.reason).toBe("wrong_predecessor"); expect(report.outcome).toBe("captured_with_gaps"); expect(report.diagnostics.duplicates).toBe(0);
});

test("C05 C06 quarantine cannot recover within a connection, including late fresh-looking snapshot", async () => {
  for (const offending of [book("2", "1"), book("10", "-1", "snapshot", "2"), book("10", "10", "update", "2"), book("11", "8"), book("1.5", "10")]) {
    const prefix = offending === book("2", "1") ? [ack] : [ack, book("10", "-1", "snapshot")];
    const { report, records } = await capture([...prefix, offending, book("20", "-1", "snapshot")]);
    expect(records.at(-2)!.accepted).toBe(false); expect(records.at(-1)!.reason).toBe("quarantined"); expect(report.outcome).toBe("captured_with_gaps");
  }
});

test("C05 unknown stream envelope extension closes qualification", async () => {
  const extended = book("11", "10").replace('"instId":"BTC-USDT"}', '"instId":"BTC-USDT","rpi":true}');
  const { records, report } = await capture([ack, book("10", "-1", "snapshot"), extended]);
  expect(records.at(-1)!.reason).toBe("unknown_schema"); expect(report.outcome).toBe("captured_with_gaps");
});

test("C05 reconnect accepts identical snapshot freshly, requires new acknowledgement and never stitches", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); const snapshot = book("10", "-1", "snapshot"); let waits: number[] = [];
  const wait = deps.clock.wait; deps.clock.wait = async (ms: number, signal: AbortSignal) => { waits.push(ms); await wait(ms, signal); };
  deps.transport.connect = async (_p: any, attempt: number, _s: any, emit: any) => { for (const payload of [ack, snapshot]) emit({ type: "message", source: "websocket", payload }); return { closed: Promise.resolve({ reason: attempt < 3 ? "connection_io" : "completed", retryable: attempt < 3 }), abort() {} }; };
  const report = await runCapture(plan, deps); const records = readCapture(join(plan.outputRoot, plan.experimentId)).records;
  expect(waits).toEqual([1000, 2000]); expect(report.attempts).toBe(3); expect(report.outcome).toBe("captured_with_gaps");
  expect(records.filter(r => r.reason === "snapshot")).toHaveLength(3); expect(new Set(records.filter(r => r.reason === "snapshot").map(r => r.segmentId)).size).toBe(3);
});

test("C05 C06 malformed envelopes quarantine subsequent data until a fresh connection", async () => {
  for (const malformed of ["{malformed", "null", "[]"]) {
    const { report, records } = await capture([ack, book("10", "-1", "snapshot"), malformed, book("11", "10")]);
    expect(records.at(-2)!.accepted).toBe(false); expect(records.at(-1)!.reason).toBe("quarantined"); expect(report.outcome).toBe("captured_with_gaps");
  }
});

test("C05 C11 every attempt retains its stream acknowledgement and observation summary", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]);
  deps.transport.connect = async (_p: any, attempt: number, _s: any, emit: any) => {
    if (attempt > 1) { emit({ type: "message", source: "websocket", payload: ack }); emit({ type: "message", source: "websocket", payload: book("10", "-1", "snapshot") }); }
    return { closed: Promise.resolve({ reason: attempt === 1 ? "connection_io" : "completed", retryable: attempt === 1 }), abort() {} };
  };
  const report = await runCapture(plan, deps);
  expect(report.connections).toHaveLength(2); expect(report.connections[0].streams[0]).toMatchObject({ acknowledged: false, observed: false });
  expect(report.connections[1].streams[0]).toMatchObject({ acknowledged: true, observed: true }); expect(report.connections[0].connectionId).not.toBe(report.connections[1].connectionId);
});

test("C05 old connection callbacks cannot become data in a fresh connection", async () => {
  const plan = fixturePlan(), deps = fixtureDependencies([]); let oldEmit: any;
  deps.transport.connect = async (_p: any, attempt: number, _s: any, emit: any) => {
    if (attempt === 1) oldEmit = emit;
    else oldEmit({ type: "message", source: "websocket", payload: ack });
    emit({ type: "message", source: "websocket", payload: book("10", "-1", "snapshot") });
    return { closed: Promise.resolve({ reason: attempt === 1 ? "connection_io" : "completed", retryable: attempt === 1 }), abort() {} };
  };
  const report = await runCapture(plan, deps), records = readCapture(join(plan.outputRoot, plan.experimentId)).records;
  expect(records.find(r => r.reason === "obsolete_connection")?.accepted).toBe(false);
  expect(records.at(-1)!.reason).toBe("missing_acknowledgement"); expect(report.outcome).toBe("captured_with_gaps");
});
