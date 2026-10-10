import { expect, test } from "bun:test";
import { runCapture, readCapture } from "./index";
import { fixturePlan, fixtureDependencies } from "./capture.test";
import { join } from "node:path";

const ack = (channel: string, instId: string) => JSON.stringify({ event: "subscribe", arg: { channel, instId } });
const spot = '{"code":"0","data":[{"instId":"BTC-USDT","instType":"SPOT","baseCcy":"BTC","quoteCcy":"USDT","lotSz":"0.00001","tickSz":"0.1","minSz":"0.00001","state":"live"}]}';
const swap = '{"code":"0","data":[{"instId":"BTC-USDT-SWAP","instType":"SWAP","ctVal":"0.01","ctValCcy":"BTC","ctMult":"1","settleCcy":"USDT","lotSz":"1","tickSz":"0.1","minSz":"1","state":"live"}]}';
function book(instId = "BTC-USDT", extra = {}) { return JSON.stringify({ arg: { channel: "books", instId }, action: "snapshot", data: [{ seqId: "10", prevSeqId: "-1", asks: [], bids: [], ts: "1", checksum: 0, ...extra }] }); }
function funding(nextFundingTime = "4600000", settState = "processing", settFundingRate = "0.0002") { return JSON.stringify({ arg: { channel: "funding-rate", instId: "BTC-USDT-SWAP" }, data: [{ instId: "BTC-USDT-SWAP", fundingRate: "0.000100000000000000001", fundingTime: "1000000", nextFundingTime, settState, settFundingRate, ts: "999999" }] }); }
function swapDependencies(messages: string[]) {
  const deps = fixtureDependencies(messages);
  deps.transport.requestMetadata = async (i: any, _s: any, emit: any) => emit({ type: "message", source: "metadata", instrument: i.id, payload: i.kind === "SPOT" ? spot : swap });
  return deps;
}
function swapPlan() { const plan = fixturePlan(); plan.instruments = [{ id: "BTC-USDT-SWAP", kind: "SWAP" }]; plan.streams = [{ channel: "books", instrument: "BTC-USDT-SWAP" }, { channel: "funding-rate", instrument: "BTC-USDT-SWAP" }]; return plan; }

test("C07 invalid funding interval cannot become an admitted observation", async () => {
  const plan = swapPlan(); const report = await runCapture(plan, swapDependencies([ack("books", "BTC-USDT-SWAP"), book("BTC-USDT-SWAP"), ack("funding-rate", "BTC-USDT-SWAP"), funding("999999")]));
  const last = readCapture(join(plan.outputRoot, plan.experimentId)).records.at(-1)!;
  expect(last.accepted).toBe(false); expect(last.reason).toBe("unknown_funding_schema"); expect(report.outcome).toBe("captured_with_gaps");
});

test("C05 C07 metadata expiration implied by an unknown book field closes qualification", async () => {
  const plan = fixturePlan(); const report = await runCapture(plan, fixtureDependencies([ack("books", "BTC-USDT"), book(), book("BTC-USDT", { metadataExpired: true })]));
  expect(readCapture(join(plan.outputRoot, plan.experimentId)).records.at(-1)!.reason).toBe("unknown_book_schema"); expect(report.outcome).toBe("captured_with_gaps");
});

test("C07 metadata receipts retain retrieval and units; funding prediction, settlement and realized remain distinct", async () => {
  const plan = swapPlan(); const messages = [ack("books", "BTC-USDT-SWAP"), book("BTC-USDT-SWAP"), ack("funding-rate", "BTC-USDT-SWAP"), funding(), funding("8200000", "settled", "0.0003")];
  const report = await runCapture(plan, swapDependencies(messages)); const records = readCapture(join(plan.outputRoot, plan.experimentId)).records;
  expect(report.outcome).toBe("captured_with_checked_continuity"); expect(report.metadataRequests).toBe(1);
  const metadata = records[0]!.observation;
  expect(metadata.fields).toMatchObject({ ctVal: "0.01", settleCcy: "USDT" }); expect(metadata.rawHash).toBe(records[0]!.payloadHash); expect(metadata.historicalEffectiveTime).toBeNull();
  expect(metadata.retrievalInterval.start.monoNs).toMatch(/^\d+$/); expect(metadata.retrievalInterval.end.ordinal).toBe(1);
  expect(records[4]!.observation).toMatchObject({ prediction: { rate: "0.000100000000000000001" }, settlement: { state: "processing", rate: "0.0002" }, realized: null, intervalMs: "3600000", entitlement: null, fees: null, margin: null, liquidation: null });
  expect(records[5]!.observation).toMatchObject({ realized: { rate: "0.0003" }, intervalMs: "7200000", metadataReceipt: records[0]!.payloadHash });
  expect(report.strategyQualified).toBe(false); expect(report.executionQualified).toBe(false); expect(report.profitEvidence).toBe(false);
});

test("C07 missing and changed metadata remain raw evidence with closed qualification and no polling", async () => {
  for (const changed of [null, spot.replace('"BTC","quoteCcy"', '"OTHER","quoteCcy"')]) {
    const plan = fixturePlan(), deps = fixtureDependencies([]); let requests = 0;
    deps.transport.requestMetadata = async (_i: any, _s: any, emit: any) => { requests++; if (changed) { emit({ type: "message", source: "metadata", instrument: "BTC-USDT", payload: spot }); emit({ type: "message", source: "metadata", instrument: "BTC-USDT", payload: changed }); } };
    deps.transport.connect = async (_p: any, _a: any, _s: any, emit: any) => { for (const payload of [ack("books", "BTC-USDT"), book()]) emit({ type: "message", source: "websocket", payload }); return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; };
    const report = await runCapture(plan, deps); expect(requests).toBe(1);
    if (changed) { expect(report.outcome).toBe("captured_with_gaps"); expect(readCapture(join(plan.outputRoot, plan.experimentId)).records.at(-1)!.accepted).toBe(false); }
    else { expect(report.outcome).toBe("failed_incomplete"); expect(report.stopReason).toBe("metadata_missing"); expect(report.counts.persistedRaw).toBe(0); }
  }
});

test("C05 C07 invalid, absent or changed initial metadata prevents any websocket attempt", async () => {
  for (const payloads of [[], [spot.replace('"SPOT"', '"SWAP"')], ["{invalid"], [spot, spot.replace('"lotSz":"0.00001"', '"lotSz":"0.00002"')]]) {
    const plan = fixturePlan(), deps = fixtureDependencies([]); let connects = 0;
    deps.transport.requestMetadata = async (_i: any, _s: any, emit: any) => { for (const payload of payloads) emit({ type: "message", source: "metadata", instrument: "BTC-USDT", payload }); };
    deps.transport.connect = async () => { connects++; return { closed: Promise.resolve({ reason: "completed", retryable: false }), abort() {} }; };
    const report = await runCapture(plan, deps);
    expect(connects).toBe(0); expect(report.attempts).toBe(0); expect(report.outcome).not.toBe("captured_with_checked_continuity");
    expect(report.metadataRequests).toBe(1);
  }
});

test("REPAIR01 F02 C05 C07 C11 unknown funding fields cannot retain metadata qualification", async () => {
  for (const extra of [{ metadataExpired: true }, { unexpectedExtension: "unknown" }]) {
    const plan = swapPlan(), invalid = JSON.parse(funding()); Object.assign(invalid.data[0], extra);
    const payload = JSON.stringify(invalid);
    const delta = book("BTC-USDT-SWAP").replace('"snapshot"', '"update"').replace('"seqId":"10","prevSeqId":"-1"', '"seqId":"11","prevSeqId":"10"');
    const report = await runCapture(plan, swapDependencies([ack("books", "BTC-USDT-SWAP"), book("BTC-USDT-SWAP"), ack("funding-rate", "BTC-USDT-SWAP"), funding(), payload, delta, funding()]));
    const recovered = readCapture(join(plan.outputRoot, plan.experimentId)), records = recovered.records;
    expect(records[5]!.accepted).toBe(false); expect(records[5]!.reason).toBe("unknown_funding_schema");
    expect(records[5]!.metadataQualification).toBe("unknown");
    expect(Buffer.from(records[5]!.payloadBase64, "base64").toString()).toBe(payload);
    expect(records[6]!.accepted).toBe(false); expect(records[7]!.accepted).toBe(false);
    expect(report.streams.every((s: any) => s.phase === "quarantined")).toBe(true);
    expect(report.outcome).toBe("captured_with_gaps"); expect(report.metadataRequests).toBe(1);
    expect(records[4]!.observation).toMatchObject({ prediction: { rate: "0.000100000000000000001" }, settlement: { state: "processing", rate: "0.0002" }, realized: null, metadataReceipt: records[0]!.payloadHash });
    expect(records[0]!.observation.historicalEffectiveTime).toBeNull(); expect(recovered.errors).toEqual([]);
    expect(recovered.manifest.segments[0].terminationReason).toBe("unknown_funding_schema"); expect(report.segments).toBe(2);
    expect(report.counts).toMatchObject({ completeReceived: 8, accepted: 5, rejected: 3, rawPrepared: 8, persistedRaw: 8, unpersistedRaw: 0, dropped: 0 });
    for (const key of ["strategyQualified", "executionQualified", "profitEvidence"]) expect(report[key]).toBe(false);
  }
});

test("REPAIR01 F02 pinned funding data requires exact nonnegative event time and complete fields", async () => {
  for (const change of [(d: any) => { delete d.ts; }, (d: any) => { d.ts = "bad"; }, (d: any) => { d.ts = "-1"; }, (d: any) => { delete d.settFundingRate; }]) {
    const plan = swapPlan(), invalid = JSON.parse(funding()); change(invalid.data[0]);
    const report = await runCapture(plan, swapDependencies([ack("books", "BTC-USDT-SWAP"), book("BTC-USDT-SWAP"), ack("funding-rate", "BTC-USDT-SWAP"), JSON.stringify(invalid)]));
    expect(readCapture(join(plan.outputRoot, plan.experimentId)).records.at(-1)!.accepted).toBe(false);
    expect(report.outcome).toBe("captured_with_gaps"); expect(report.metadataRequests).toBe(1);
  }
});

test("REPAIR01 F02 funding envelopes cannot borrow book action fields", async () => {
  const plan = swapPlan(), invalid = JSON.parse(funding()); invalid.action = "snapshot";
  const report = await runCapture(plan, swapDependencies([ack("books", "BTC-USDT-SWAP"), book("BTC-USDT-SWAP"), ack("funding-rate", "BTC-USDT-SWAP"), JSON.stringify(invalid)]));
  const last = readCapture(join(plan.outputRoot, plan.experimentId)).records.at(-1)!;
  expect(last.accepted).toBe(false); expect(last.reason).toBe("unknown_funding_schema");
  expect(report.outcome).toBe("captured_with_gaps"); expect(report.metadataRequests).toBe(1);
});
