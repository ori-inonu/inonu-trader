import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createConsultCaptureStore } from "./capture-store";
import { sourceConsultDigest } from "./agent-episode";

const row = (cycleId = "fixture-cycle", atMs = 1000) => ({ cycleId, atMs, mode: "limitado", facts: { one: 1, two: 2 } });
function setup() {
  const db = new Database(":memory:");
  const opened = createConsultCaptureStore(db);
  if (!opened.ok) throw new Error(opened.code);
  return { db, store: opened.store };
}

test("identical rereads and reopening preserve the first observation, without refreshing time", () => {
  const { db, store } = setup();
  const first = store.capture("agent_briefs", row(), 2000);
  expect(first).toMatchObject({ ok: true, inserted: true, record: { firstObservedAtMs: 2000, cycleStartedAtMs: 1000, cycleConflict: false } });
  const again = createConsultCaptureStore(db);
  if (!again.ok) throw new Error(again.code);
  const reread = again.store.capture("agent_briefs", row(), 9000);
  expect(reread).toMatchObject({ ok: true, inserted: false, record: { firstObservedAtMs: 2000 } });
  expect(again.store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [{ firstObservedAtMs: 2000 }], nextSequence: 1 });
});

test("conflicting variants remain immutable and quarantine every variant of that source cycle", () => {
  const { store } = setup();
  store.capture("agent_briefs", row(), 2000);
  expect(store.capture("agent_briefs", { ...row(), facts: { one: 3, two: 2 } }, 3000)).toMatchObject({ ok: true, inserted: true, record: { cycleConflict: true } });
  const listed = store.list("agent_briefs", { afterSequence: 0, limit: 10 });
  if (!listed.ok) throw new Error(listed.code);
  expect(listed.records).toHaveLength(2);
  expect(listed.records.map(r => r.cycleConflict)).toEqual([true, true]);
  expect(listed.records.map(r => r.firstObservedAtMs)).toEqual([2000, 3000]);
  expect(store.capture("agent_briefs", row(), 9000)).toMatchObject({ ok: true, inserted: false, record: { cycleConflict: true, firstObservedAtMs: 2000 } });
});

test("source identity isolates equal cycle ids and pagination follows immutable sequence", () => {
  const { store } = setup();
  store.capture("agent_briefs", row(), 2000);
  store.capture("shadow_briefs", row(), 2100);
  store.capture("agent_briefs", row("second"), 2200);
  expect(store.list("agent_briefs", { afterSequence: 1, limit: 1 })).toMatchObject({ ok: true, records: [{ cycleId: "second", cycleConflict: false }], nextSequence: 3 });
  expect(store.list("shadow_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [{ cycleConflict: false }], nextSequence: 2 });
});

test("serialized key order stays evidence and cannot silently deduplicate a changed Brief fingerprint", () => {
  const { store } = setup();
  store.capture("agent_briefs", row(), 2000);
  expect(store.capture("agent_briefs", { ...row(), facts: { two: 2, one: 1 } }, 3000)).toMatchObject({ ok: true, inserted: true, record: { cycleConflict: true } });
});

test("invalid records, future cycle times and non JSON values fail without a write", () => {
  const { store } = setup();
  for (const raw of [null, {}, row("bad\ncycle"), row("future", 3000), { ...row(), x: NaN }, { ...row(), x: undefined }]) {
    expect(store.capture("agent_briefs", raw, 2000)).toEqual({ ok: false, code: "capture_invalid" });
  }
  expect(store.capture("../../home", row(), 2000)).toEqual({ ok: false, code: "request_invalid" });
  expect(store.capture("agent_briefs", row(), NaN)).toEqual({ ok: false, code: "request_invalid" });
  expect(store.list("agent_briefs", { afterSequence: -1, limit: 1 })).toEqual({ ok: false, code: "request_invalid" });
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 0 })).toEqual({ ok: false, code: "request_invalid" });
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [] });
});

test("corrupted stored bytes are exposed as a closed error and never repaired by rereading", () => {
  const { db, store } = setup();
  store.capture("agent_briefs", row(), 2000);
  db.query("UPDATE evolution_consult_captures SET raw_payload=?").run(JSON.stringify({ ...row(), facts: { one: 999 } }));
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toEqual({ ok: false, code: "stored_capture_invalid" });
  expect(store.capture("agent_briefs", row(), 9000)).toEqual({ ok: false, code: "stored_capture_invalid" });
});

test("failed insert reports no private SQLite detail and does not partially record an observation", () => {
  const { db, store } = setup();
  db.exec("CREATE TRIGGER capture_failure BEFORE INSERT ON evolution_consult_captures BEGIN SELECT RAISE(ABORT, 'private fixture'); END");
  expect(store.capture("agent_briefs", row(), 2000)).toEqual({ ok: false, code: "storage_unavailable" });
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toMatchObject({ ok: true, records: [] });
});

test("the local first-availability clock is bound to the stored observation checksum", () => {
  const { db, store } = setup();
  store.capture("agent_briefs", row(), 2000);
  db.exec("UPDATE evolution_consult_captures SET first_observed_ms=1500");
  expect(store.list("agent_briefs", { afterSequence: 0, limit: 10 })).toEqual({ ok: false, code: "stored_capture_invalid" });
});

test("returned records are fresh copies and cannot mutate persisted source evidence", () => {
  const { store } = setup();
  const r = store.capture("agent_briefs", row(), 2000);
  if (!r.ok) throw new Error(r.code);
  (r.record.rawRecord as ReturnType<typeof row>).facts.one = 999;
  expect(store.capture("agent_briefs", row(), 3000)).toMatchObject({ ok: true, inserted: false, record: { rawRecord: { facts: { one: 1 } } } });
});

test("rejected accessor objects are never evaluated as source identities", () => {
  const { store } = setup();
  let reads = 0;
  const raw = { get cycleId() { reads++; throw new Error("private getter"); }, atMs: 1000 };
  expect(store.capture("agent_briefs", raw, 2000)).toEqual({ ok: false, code: "capture_invalid" });
  expect(reads).toBe(0);
});

test("exact lookup preserves the immutable captured record and never substitutes a nearby hash", () => {
  const { db, store } = setup(), original = row(), digest = sourceConsultDigest(original)!;
  const saved = store.capture("agent_briefs", original, 2000);
  if (!saved.ok) throw new Error(saved.code);
  expect(typeof store.lookup).toBe("function");
  expect(store.lookup!("agent_briefs", original.cycleId, digest)).toEqual({ ok: true, record: saved.record });
  const otherHash = digest.slice(0, -1) + (digest.endsWith("0") ? "1" : "0");
  expect(store.lookup!("agent_briefs", original.cycleId, otherHash)).toEqual({ ok: true, record: null });
  expect(store.lookup!("agent_briefs", "missing-cycle", digest)).toEqual({ ok: true, record: null });
  expect(store.lookup!("shadow_briefs", original.cycleId, digest)).toEqual({ ok: true, record: null });
  db.close();
});

test("lookup marks an older matching variant conflicted without replacing its first observation", () => {
  const { db, store } = setup(), first = row(), second = { ...row(), facts: { one: 3, two: 2 } };
  store.capture("agent_briefs", first, 2000); store.capture("agent_briefs", second, 4000);
  expect(store.lookup!("agent_briefs", first.cycleId, sourceConsultDigest(first)!)).toMatchObject({ ok: true, record: { firstObservedAtMs: 2000, sequence: 1, cycleConflict: true, rawRecord: first } });
  expect(store.lookup!("agent_briefs", second.cycleId, sourceConsultDigest(second)!)).toMatchObject({ ok: true, record: { firstObservedAtMs: 4000, sequence: 2, cycleConflict: true, rawRecord: second } });
  expect(store.lookup!("agent_briefs", first.cycleId, "f".repeat(64))).toEqual({ ok: true, record: null });
  db.close();
});

test("lookup validates every same-cycle variant even when the requested matching row is intact", () => {
  const { db, store } = setup(), first = row(), second = { ...row(), facts: { one: 3, two: 2 } };
  store.capture("agent_briefs", first, 2000); store.capture("agent_briefs", second, 4000);
  db.query("UPDATE evolution_consult_captures SET raw_payload=? WHERE source_hash=?").run("{private damaged variant}", sourceConsultDigest(second)!);
  expect(store.lookup!("agent_briefs", first.cycleId, sourceConsultDigest(first)!)).toEqual({ ok: false, code: "stored_capture_invalid" });
  expect(store.lookup!("agent_briefs", first.cycleId, "f".repeat(64))).toEqual({ ok: false, code: "stored_capture_invalid" });
  expect(db.query("SELECT raw_payload FROM evolution_consult_captures WHERE source_hash=?").get(sourceConsultDigest(second)!)).toEqual({ raw_payload: "{private damaged variant}" });
  db.close();
});

test("lookup reads only the requested source cycle and ignores unrelated damaged records", () => {
  const { db, store } = setup(), target = row("target"), other = row("unrelated");
  store.capture("agent_briefs", target, 2000); store.capture("agent_briefs", other, 2100); store.capture("shadow_briefs", target, 2200);
  db.query("UPDATE evolution_consult_captures SET raw_payload=? WHERE cycle_id=? OR source_id=?").run("{private unrelated damage}", "unrelated", "shadow_briefs");
  expect(store.lookup!("agent_briefs", target.cycleId, sourceConsultDigest(target)!)).toMatchObject({ ok: true, record: { firstObservedAtMs: 2000, cycleConflict: false, rawRecord: target } });
  expect(store.lookup!("agent_briefs", other.cycleId, sourceConsultDigest(other)!)).toEqual({ ok: false, code: "stored_capture_invalid" });
  db.close();
});

test("lookup rejects malformed source, cycle and hash arguments without touching the database", () => {
  const { db, store } = setup(), digest = sourceConsultDigest(row())!;
  for (const id of ["", "Bad Source", "../home", "a".repeat(65), null, 3]) {
    expect(store.lookup!(id as string, "fixture-cycle", digest)).toEqual({ ok: false, code: "request_invalid" });
  }
  for (const cycleId of ["", "bad\ncycle", "bad' OR 1=1", "a".repeat(161), null, 3]) {
    expect(store.lookup!("agent_briefs", cycleId as string, digest)).toEqual({ ok: false, code: "request_invalid" });
  }
  for (const hash of ["", "a".repeat(63), "a".repeat(65), "A".repeat(64), "z".repeat(64), null, 3]) {
    expect(store.lookup!("agent_briefs", "fixture-cycle", hash as string)).toEqual({ ok: false, code: "request_invalid" });
  }
  expect(db.query("SELECT count(*) AS n FROM evolution_consult_captures").get()).toEqual({ n: 0 });
  db.close();
});

test("lookup leaves rows, counters, sequences and first-observed clocks unchanged under SQLite query-only", () => {
  const { db, store } = setup(), raw = row(), digest = sourceConsultDigest(raw)!;
  store.capture("agent_briefs", raw, 2000);
  const snapshot = () => ({ rows: db.query("SELECT * FROM evolution_consult_captures ORDER BY sequence").all(), sequence: db.query("SELECT * FROM sqlite_sequence").all(), changes: db.query("SELECT total_changes() AS n").get() });
  const before = snapshot();
  db.exec("PRAGMA query_only=ON");
  for (let i = 0; i < 3; i++) {
    expect(store.lookup!("agent_briefs", raw.cycleId, digest)).toMatchObject({ ok: true, record: { firstObservedAtMs: 2000 } });
    expect(store.lookup!("agent_briefs", "missing", digest)).toEqual({ ok: true, record: null });
  }
  expect(snapshot()).toEqual(before);
  db.close();
});

test("lookup returns detached source data and validates the observation checksum without repairing it", () => {
  const { db, store } = setup(), raw = row(), digest = sourceConsultDigest(raw)!;
  store.capture("agent_briefs", raw, 2000);
  const found = store.lookup!("agent_briefs", raw.cycleId, digest);
  if (!found.ok || found.record === null) throw new Error("missing fixture capture");
  (found.record.rawRecord as ReturnType<typeof row>).facts.one = 999;
  expect(store.lookup!("agent_briefs", raw.cycleId, digest)).toMatchObject({ ok: true, record: { rawRecord: raw } });
  db.exec("UPDATE evolution_consult_captures SET first_observed_ms=1500");
  expect(store.lookup!("agent_briefs", raw.cycleId, digest)).toEqual({ ok: false, code: "stored_capture_invalid" });
  expect(db.query("SELECT first_observed_ms FROM evolution_consult_captures").get()).toEqual({ first_observed_ms: 1500 });
  db.close();
});

test("lookup on a closed database fails with a constant code and no private database detail", () => {
  const { db, store } = setup(), digest = sourceConsultDigest(row())!;
  db.close();
  expect(store.lookup!("agent_briefs", "fixture-cycle", digest)).toEqual({ ok: false, code: "storage_unavailable" });
  expect(store.lookup!("bad source", "fixture-cycle", digest)).toEqual({ ok: false, code: "request_invalid" });
});

test("cycle reads return only the exact namespace and cycle, with honest empty misses", () => {
  const { db, store } = setup(), target = row("target");
  store.capture("agent_briefs", target, 2000); store.capture("agent_briefs", row("other"), 2100); store.capture("shadow_briefs", target, 2200);
  expect(typeof store.readCycle).toBe("function");
  expect(store.readCycle!("agent_briefs", "target")).toMatchObject({ ok: true, records: [{ sequence: 1, sourceId: "agent_briefs", cycleId: "target", firstObservedAtMs: 2000, cycleConflict: false, rawRecord: target }] });
  const found = store.readCycle!("agent_briefs", "target");
  if (!found.ok) throw new Error(found.code);
  expect(found.records).toHaveLength(1);
  expect(store.readCycle!("agent_briefs", "missing")).toEqual({ ok: true, records: [] });
  expect(store.readCycle!("other_namespace", "target")).toEqual({ ok: true, records: [] });
  db.close();
});

test("cycle reads retain all ordered conflicting variants and detach returned payloads", () => {
  const { db, store } = setup(), first = row(), second = { ...row(), facts: { one: 3, two: 2 } };
  store.capture("agent_briefs", first, 2000); store.capture("shadow_briefs", row(), 2500); store.capture("agent_briefs", second, 3000);
  const found = store.readCycle!("agent_briefs", first.cycleId);
  if (!found.ok) throw new Error(found.code);
  expect(found.records.map(r => r.sequence)).toEqual([1, 3]);
  expect(found.records.map(r => [r.firstObservedAtMs, r.cycleConflict])).toEqual([[2000, true], [3000, true]]);
  (found.records[0]!.rawRecord as ReturnType<typeof row>).facts.one = 999;
  expect(store.readCycle!("agent_briefs", first.cycleId)).toMatchObject({ ok: true, records: [{ rawRecord: first }, { rawRecord: second }] });
  db.close();
});

test("cycle reads fail closed for any damaged variant without returning partial records or repairing bytes", () => {
  const { db, store } = setup(), first = row(), second = { ...row(), facts: { one: 3, two: 2 } };
  store.capture("agent_briefs", first, 2000); store.capture("agent_briefs", second, 3000);
  db.query("UPDATE evolution_consult_captures SET first_observed_ms=? WHERE source_hash=?").run(1500, sourceConsultDigest(second)!);
  expect(store.readCycle!("agent_briefs", first.cycleId)).toEqual({ ok: false, code: "stored_capture_invalid" });
  expect(store.lookup!("agent_briefs", first.cycleId, sourceConsultDigest(first)!)).toEqual({ ok: false, code: "stored_capture_invalid" });
  expect(db.query("SELECT first_observed_ms FROM evolution_consult_captures ORDER BY sequence").all()).toEqual([{ first_observed_ms: 2000 }, { first_observed_ms: 1500 }]);
  db.close();
});

test("cycle reads do not decode unrelated corrupt cycles or namespaces", () => {
  const { db, store } = setup(), target = row("target");
  store.capture("agent_briefs", target, 2000); store.capture("agent_briefs", row("other"), 2100); store.capture("shadow_briefs", target, 2200);
  db.query("UPDATE evolution_consult_captures SET raw_payload=? WHERE cycle_id=? OR source_id=?").run("{private unrelated corruption}", "other", "shadow_briefs");
  expect(store.readCycle!("agent_briefs", "target")).toMatchObject({ ok: true, records: [{ rawRecord: target, cycleConflict: false }] });
  expect(store.readCycle!("agent_briefs", "other")).toEqual({ ok: false, code: "stored_capture_invalid" });
  expect(store.readCycle!("shadow_briefs", "target")).toEqual({ ok: false, code: "stored_capture_invalid" });
  db.close();
});

test("cycle reads remain read-only and never refresh first observations or SQLite counters", () => {
  const { db, store } = setup(), raw = row();
  store.capture("agent_briefs", raw, 2000);
  const snapshot = () => ({ rows: db.query("SELECT * FROM evolution_consult_captures").all(), sequence: db.query("SELECT * FROM sqlite_sequence").all(), changes: db.query("SELECT total_changes() AS n").get() });
  const before = snapshot(); db.exec("PRAGMA query_only=ON");
  for (let i = 0; i < 3; i++) {
    expect(store.readCycle!("agent_briefs", raw.cycleId)).toMatchObject({ ok: true, records: [{ firstObservedAtMs: 2000 }] });
    expect(store.readCycle!("agent_briefs", "missing")).toEqual({ ok: true, records: [] });
  }
  expect(snapshot()).toEqual(before);
  db.close();
});

test("cycle reads reject invalid arguments and close database failures with constant codes", () => {
  const { db, store } = setup();
  for (const id of ["", "Bad Source", "../home", "a".repeat(65), null, 3]) {
    expect(store.readCycle!(id as string, "fixture-cycle")).toEqual({ ok: false, code: "request_invalid" });
  }
  for (const cycleId of ["", "bad\ncycle", "bad' OR 1=1", "a".repeat(161), null, 3]) {
    expect(store.readCycle!("agent_briefs", cycleId as string)).toEqual({ ok: false, code: "request_invalid" });
  }
  expect(db.query("SELECT count(*) AS n FROM evolution_consult_captures").get()).toEqual({ n: 0 });
  db.close();
  expect(store.readCycle!("agent_briefs", "fixture-cycle")).toEqual({ ok: false, code: "storage_unavailable" });
  expect(store.readCycle!("bad source", "fixture-cycle")).toEqual({ ok: false, code: "request_invalid" });
});
