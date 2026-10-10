import { expect, test } from "bun:test";
import { appendFileSync, existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync, symlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCapture, readCapture } from "./index";
import { fixturePlan, fixtureDependencies } from "./capture.test";
const ack = '{"event":"subscribe","arg":{"channel":"books","instId":"BTC-USDT"}}';
const snapshot = '{"arg":{"channel":"books","instId":"BTC-USDT"},"action":"snapshot","data":[{"seqId":10,"prevSeqId":-1,"asks":[],"bids":[],"ts":"1","checksum":0}]}';
async function saved() { const plan = fixturePlan(); const report = await runCapture(plan, fixtureDependencies([ack, snapshot])); return { plan, report, directory: join(plan.outputRoot, plan.experimentId) }; }
function editManifest(directory: string, edit: (m: any) => void) { const path = join(directory, "manifest.json"), m = JSON.parse(readFileSync(path, "utf8")); edit(m); writeFileSync(path, JSON.stringify(m) + "\n"); }

test("C09 recovery verifies declared ordinal ranges, identities and conservation", async () => {
  for (const edit of [
    (m: any) => { m.segments[0].firstOrdinal = 999; },
    (m: any) => { m.segments[0].identities = ["invented"]; },
    (m: any) => { m.report.counts.accepted += 1; },
    (m: any) => { m.report.encodedBytes += 1; },
  ]) {
    const { directory } = await saved(); editManifest(directory, edit);
    const recovery = readCapture(directory); expect(recovery.errors.length).toBeGreaterThan(0); expect(recovery.outcome).toBe("failed_incomplete");
  }
});

test("C09 finalized recovery rejects unlisted segment files and never repairs", async () => {
  const { directory } = await saved(); writeFileSync(join(directory, "segment-031.jsonl"), "{}\n");
  const before = readdirSync(directory).map(n => [n, readFileSync(join(directory, n)).toString("base64")]);
  const recovery = readCapture(directory); expect(recovery.errors).toContain("segment_inventory");
  expect(readdirSync(directory).map(n => [n, readFileSync(join(directory, n)).toString("base64")])).toEqual(before);
});

test("C09 missing manifest salvages complete records and leaves truncated tails untrusted", async () => {
  const { directory } = await saved(); unlinkSync(join(directory, "manifest.json"));
  appendFileSync(join(directory, "segment-000.jsonl"), '{"kind":"raw"');
  const recovery = readCapture(directory); expect(recovery.records).toHaveLength(3); expect(recovery.untrustedTail).toBe(true);
  expect(recovery.manifest).toBeNull(); expect(recovery.missingCounts).toBeNull(); expect(recovery.outcome).toBe("failed_incomplete"); expect(existsSync(join(directory, "manifest.json"))).toBe(false);
});

test("C09 recovery detects segment bytes, record offsets, hashes and counts", async () => {
  for (const edit of [
    (m: any) => { m.segments[0].hash = "0".repeat(64); },
    (m: any) => { m.segments[0].records[0].offset = 1; },
    (m: any) => { m.segments[0].records[0].hash = "0".repeat(64); },
    (m: any) => { m.segments[0].count += 1; },
    (m: any) => { m.control.count += 1; },
  ]) { const { directory } = await saved(); editManifest(directory, edit); expect(readCapture(directory).errors.length).toBeGreaterThan(0); }
});

test("C01 C09 existing target, escaping identity and junction roots refuse before transport", async () => {
  const { plan, directory } = await saved(); let calls = 0; const deps = fixtureDependencies([]); deps.transport.requestMetadata = async () => { calls++; };
  expect((await runCapture(plan, deps)).stopReason).toBe("experiment_exists"); expect(calls).toBe(0);
  expect((await runCapture({ ...plan, experimentId: "../escape" }, deps)).outcome).toBe("not_started"); expect(calls).toBe(0);
  const parent = mkdtempSync(join(tmpdir(), "inonu-junction-")), link = join(parent, "linked"); symlinkSync(plan.outputRoot, link, "junction");
  expect((await runCapture({ ...plan, outputRoot: link, experimentId: "new" }, deps)).stopReason).toBe("path_symlink_or_reparse"); expect(calls).toBe(0);
  expect(readCapture(directory).records).toHaveLength(3);
});

test("C08 C09 recovery checks plan and declared record counts before payload decoding", async () => {
  const { directory } = await saved(); editManifest(directory, m => { m.plan.limits.messages = 2; });
  const recovery = readCapture(directory);
  expect(recovery.records).toHaveLength(0); expect(recovery.errors).toContain("segment_count_bounds");
  expect(recovery.outcome).toBe("failed_incomplete");
});

test("C09 finalized segments expose conservative local continuity counts verified against bytes", async () => {
  for (const rejected of [false, true]) {
    const plan = fixturePlan();
    await runCapture(plan, fixtureDependencies([ack, snapshot, ...(rejected ? ["{malformed"] : [])]));
    const directory = join(plan.outputRoot, plan.experimentId), recovered = readCapture(directory);
    expect(recovered.errors).toEqual([]);
    expect(recovered.manifest.segments[0]).toMatchObject({ checkedObservations: 1, rejectedObservations: rejected ? 1 : 0,
      continuityStatus: rejected ? "contains_rejected_observations" : "contains_checked_observations" });
    editManifest(directory, m => { m.segments[0].checkedObservations = 99; });
    expect(readCapture(directory).errors).toContain("segment_continuity_integrity");
  }
  const plan = fixturePlan(); await runCapture(plan, fixtureDependencies([]));
  expect(readCapture(join(plan.outputRoot, plan.experimentId)).manifest.segments[0]).toMatchObject({ checkedObservations: 0,
    rejectedObservations: 0, continuityStatus: "no_continuity_observation" });
});

test("C09 finalized source identities are checked against recovered raw records", async () => {
  const { directory } = await saved(), recovery = readCapture(directory);
  expect(recovery.manifest.segments[0].sources).toEqual(["metadata", "websocket"]);
  editManifest(directory, m => { m.segments[0].sources = ["invented-source"]; });
  expect(readCapture(directory).errors).toContain("segment_source_integrity");
});
