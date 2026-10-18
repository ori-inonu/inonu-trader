// REC-1, REC-2, REC-5 (found by the independent audit of 2026-10-13): a snapshot is read back only if its FeatureVector is exactly the
// documented one and says what moment and instrument it is about; and the folder cap holds for decisions too. origin: synthetic_fixture,
// tests only.
import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFeatures } from "../intel/features/compute";
import { FEATURE_NAMES, INTERVAL_MS, type Bar } from "../intel/features/types";
import { createOutcomeStore, parseSnapshot } from "./store";
import type { DecisionRecord, Snapshot } from "./types";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "inonu-strict-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T0 = 1_800_000_000_000;
const bars = (count: number, interval: "5m" | "15m" | "1h" | "4h"): Bar[] => {
  const ms = INTERVAL_MS[interval];
  const end = T0 - (T0 % INTERVAL_MS["4h"]);
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + Math.sin(i / 7) * 3;
    return { ts: end - (count - i) * ms, open: close - 0.2, high: close + 0.6, low: close - 0.7, close, volume: 1, confirmed: true };
  });
};
const real = (instId = "ETH-USDT", asOfMs = T0) => computeFeatures({ instId, asOfMs, price: 100, bars: { "5m": bars(300, "5m"), "15m": bars(200, "15m"), "1h": bars(100, "1h"), "4h": bars(80, "4h") }, spreadBps: 2, feeAndSlippageRoundTripBps: 22 });
const snap = (id = "s", over: Partial<Snapshot> = {}): Snapshot => ({ id, asOfMs: T0, instId: "ETH-USDT", market: "spot", price: 100, costRoundTripBps: 24, atr15m: 1, zones: { demanda: null, oferta: null }, features: real(), origem: "relogio", ...over });

describe("the vector of a snapshot is the documented one (the case of the audit)", () => {
  test("the vector the producer makes reads back, whole", () => {
    expect(parseSnapshot(JSON.parse(JSON.stringify(snap())))).toEqual(snap());
  });
  test("an empty vector of another instrument and instant is refused", () => {
    const bad = { ...snap(), features: { v: 1, instId: "BTC-USDT", asOfMs: 999_999, values: {}, nulos: {}, idades: {} } };
    expect(parseSnapshot(bad)).toBeNull();
  });
  test("one name left out, or a name that is not in the list, is refused", () => {
    const f = real();
    const { [FEATURE_NAMES[3]!]: _gone, ...fewer } = f.values;
    expect(parseSnapshot({ ...snap(), features: { ...f, values: fewer } })).toBeNull();
    expect(parseSnapshot({ ...snap(), features: { ...f, values: { ...f.values, "x.invented": 1 } } })).toBeNull();
  });
  test("the instrument and the instant of the vector must be those of the snapshot", () => {
    const f = real();
    expect(parseSnapshot({ ...snap(), features: { ...f, instId: "BTC-USDT" } })).toBeNull();
    expect(parseSnapshot({ ...snap(), features: { ...f, asOfMs: T0 + 1 } })).toBeNull();
  });
  test("a null needs its reason, and a reason needs a null", () => {
    const f = real();
    const nullName = FEATURE_NAMES.find((n) => f.values[n] === null)!;
    const { [nullName]: _reason, ...noReason } = f.nulos;
    expect(parseSnapshot({ ...snap(), features: { ...f, nulos: noReason } })).toBeNull();
    const valued = FEATURE_NAMES.find((n) => f.values[n] !== null)!;
    expect(parseSnapshot({ ...snap(), features: { ...f, nulos: { ...f.nulos, [valued]: "sem_motivo_real" } } })).toBeNull();
    expect(parseSnapshot({ ...snap(), features: { ...f, nulos: { ...f.nulos, [nullName]: "" } } })).toBeNull();
  });
  test("a row refused on reading is counted, and the good rows around it are kept", () => {
    const dir = tmp();
    const store = createOutcomeStore({ dir, now: () => T0 });
    store.appendSnapshot(snap("a"));
    const file = join(dir, "snapshots-2027-01-15.jsonl");
    appendFileSync(file, `${JSON.stringify({ ...snap("empty"), features: { v: 1, instId: "ETH-USDT", asOfMs: T0, values: {}, nulos: {}, idades: {} } })}\n`);
    appendFileSync(file, `${JSON.stringify(snap("b"))}\n`);
    const got = createOutcomeStore({ dir, now: () => T0 });
    expect(got.snapshots().map((s) => s.id)).toEqual(["a", "b"]);
    expect(got.stats().corruptLines).toBe(1);
  });
  test("the vectors the recorder and the backfill make are accepted: a null without a reason never leaves the producer", () => {
    for (const asOf of [T0 - 3_600_000, T0, T0 + 86_400_000]) {
      for (const inst of ["ETH-USDT", "BTC-USDT-SWAP"]) {
        const s = snap("x", { instId: inst, asOfMs: asOf, features: real(inst, asOf) });
        expect(parseSnapshot(JSON.parse(JSON.stringify(s))), `${inst} ${asOf}`).not.toBeNull();
      }
    }
  });
  // computeFeatures writes, next to the names, why the bars of an interval were not used (`bars<interval>`): `velas_velhas` with the age it
  // kept, or `sem_velas` with no age. The verdict reads `bars15m` as its stale data gate, so the vector carries them by design.
  const asOfLate = T0 + 86_400_000;
  const noBars = (): Snapshot["features"] => computeFeatures({ instId: "ETH-USDT", asOfMs: T0, price: 100, bars: {}, spreadBps: 2, feeAndSlippageRoundTripBps: 22 });
  test("the reasons for bars that were too old or never read are part of the vector: they read back, whole", () => {
    const old = snap("old", { asOfMs: asOfLate, features: real("ETH-USDT", asOfLate) });
    expect(old.features.nulos.bars1h).toBe("velas_velhas");
    expect(old.features.idades.bars1h).toBeGreaterThan(0);
    expect(parseSnapshot(JSON.parse(JSON.stringify(old)))).toEqual(old);
    const none = snap("none", { features: noBars() });
    expect(none.features.nulos.bars1h).toBe("sem_velas");
    expect(none.features.idades.bars1h).toBeUndefined();
    expect(parseSnapshot(JSON.parse(JSON.stringify(none)))).toEqual(none);
  });
  test("a reason about bars that is not the producer's is refused: another interval, another code, an age that contradicts it", () => {
    const old = real("ETH-USDT", asOfLate);
    const none = noBars();
    const { bars1h: _age, ...withoutAge } = old.idades;
    const refused = (features: object, asOfMs: number): unknown => parseSnapshot({ ...snap(), asOfMs, features });
    expect(refused({ ...old, nulos: { ...old.nulos, bars2h: "velas_velhas" } }, asOfLate)).toBeNull(); // an interval that does not exist
    expect(refused({ ...old, nulos: { ...old.nulos, bars1h: "inventada" } }, asOfLate)).toBeNull(); // a code that is not documented
    expect(refused({ ...old, idades: withoutAge }, asOfLate)).toBeNull(); // too old, but with no age to be old by
    expect(refused({ ...none, idades: { ...none.idades, bars1h: 5 } }, T0)).toBeNull(); // never read, but with an age
  });
});

const decision = (id: number, over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id: `d${id}`, atMs: T0, instId: "ETH-USDT", modo: "ativo", action: "hold", candidateId: null, briefHash: null, snapshotId: null, reutilizado: false, probabilidades: null, veredito: null, ...over,
});
const total = (dir: string): number => readdirSync(dir).reduce((s, f) => s + statSync(join(dir, f)).size, 0);

describe("the folder cap holds for decisions too (the case of the audit)", () => {
  test("a hundred decisions over a 1 KB cap: at the check, every file of the module is within the cap, and the refusals are counted", () => {
    const dir = tmp();
    const store = createOutcomeStore({ dir, now: () => T0, maxBytes: 1024 });
    let refused = 0;
    for (let i = 0; i < 100; i += 1) if (!store.appendDecision(decision(i))) refused += 1;
    expect(total(dir)).toBeLessThanOrEqual(1024);
    expect(store.stats().bytes).toBeLessThanOrEqual(1024);
    expect(refused).toBeGreaterThan(0);
    expect(store.stats().writeErrors).toBe(refused);
  });
  test("the oldest days of decisions go first, and a day with only decisions rotates like any other", () => {
    const dir = tmp();
    const clock = { now: T0 };
    const one = JSON.stringify(decision(0)).length + 1;
    const store = createOutcomeStore({ dir, now: () => clock.now, maxBytes: one * 60 });
    for (let day = 0; day < 4; day += 1) {
      clock.now = T0 + day * 86_400_000;
      for (let i = 0; i < 25; i += 1) store.appendDecision(decision(day * 100 + i, { atMs: clock.now }));
    }
    expect(total(dir)).toBeLessThanOrEqual(one * 60);
    const files = readdirSync(dir).sort();
    expect(files.some((f) => f.startsWith("decisions-"))).toBe(true);
    expect(files.length).toBeLessThan(4);
    const ids = store.decisions().map((d) => d.id);
    // the files of the current day are never removed to make room: the newest day is whole (ids d300 to d324, the loop writes 25 a day)
    for (let i = 0; i < 25; i += 1) expect(ids).toContain(`d${300 + i}`);
    expect(ids).not.toContain("d0"); // the oldest went first
  });
  test("a legacy decisions.jsonl is read, counted in the quota, and is the first thing to go", () => {
    const dir = tmp();
    writeFileSync(join(dir, "decisions.jsonl"), `${JSON.stringify(decision(1))}\n${JSON.stringify(decision(2))}\n`);
    const store = createOutcomeStore({ dir, now: () => T0 });
    expect(store.decisions().map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(store.stats().decisions).toBe(2);
    expect(store.stats().bytes).toBe(statSync(join(dir, "decisions.jsonl")).size);
    const tight = createOutcomeStore({ dir, now: () => T0, maxBytes: 600 });
    for (let i = 0; i < 50; i += 1) tight.appendDecision(decision(10 + i));
    expect(existsSync(join(dir, "decisions.jsonl"))).toBe(false);
    expect(total(dir)).toBeLessThanOrEqual(600);
  });
  test("a write is refused only when the old days cannot make it fit: under 90 percent is not a reason to refuse a write that crosses the cap", () => {
    const dir = tmp();
    const clock = { now: T0 };
    const big = decision(1, { modo: "x".repeat(650) });
    const bigSize = JSON.stringify(big).length + 1;
    const smallSize = JSON.stringify(decision(2)).length + 1;
    const cap = 1000;
    expect(bigSize).toBeLessThanOrEqual(cap * 0.9); // the folder is already under 90 percent of the cap...
    expect(bigSize + smallSize).toBeGreaterThan(cap); // ...and the next line still crosses it
    const store = createOutcomeStore({ dir, now: () => clock.now, maxBytes: cap });
    expect(store.appendDecision(big)).toBe(true);
    clock.now = T0 + 86_400_000;
    expect(store.appendDecision(decision(2))).toBe(true); // the day before is what makes the room
    expect(readdirSync(dir)).toEqual(["decisions-2027-01-16.jsonl"]);
    expect(store.stats()).toMatchObject({ decisions: 1, writeErrors: 0 });
    expect(total(dir)).toBeLessThanOrEqual(cap);
    // and when the files of the current day alone are over the cap, the write is still refused, not forced
    expect(store.appendDecision(decision(3, { modo: "y".repeat(900) }))).toBe(false);
    expect(store.stats().writeErrors).toBe(1);
    expect(store.decisions().map((d) => d.id)).toEqual(["d2"]);
  });
  test("a file the module does not own is never touched, and does not count", () => {
    const dir = tmp();
    writeFileSync(join(dir, "notes.txt"), "x".repeat(5000));
    const store = createOutcomeStore({ dir, now: () => T0, maxBytes: 1024 });
    for (let i = 0; i < 60; i += 1) store.appendDecision(decision(i));
    expect(readFileOk(join(dir, "notes.txt"))).toBe(5000);
    expect(store.stats().bytes).toBeLessThanOrEqual(1024);
  });
  test("snapshots, labels and decisions share one cap, oldest day first", () => {
    const dir = tmp();
    const clock = { now: T0 };
    const store = createOutcomeStore({ dir, now: () => clock.now, maxBytes: 40_000 });
    for (let day = 0; day < 3; day += 1) {
      clock.now = T0 + day * 86_400_000;
      for (let i = 0; i < 6; i += 1) store.appendSnapshot(snap(`s${day}-${i}`, { asOfMs: clock.now, features: real("ETH-USDT", clock.now) }));
      for (let i = 0; i < 50; i += 1) store.appendDecision(decision(day * 100 + i, { atMs: clock.now }));
    }
    expect(total(dir)).toBeLessThanOrEqual(40_000);
    expect(store.snapshots().some((s) => s.id === "s2-5")).toBe(true);
  });
});

const readFileOk = (path: string): number => statSync(path).size;
