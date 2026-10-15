import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeFeatures } from "../intel/features/compute";
import { INTERVAL_MS, type Bar, type Interval } from "../intel/features/types";
import { createOutcomeStore, parseDecision, parseLabel, parseSnapshot } from "./store";
import type { DecisionRecord, Label, Snapshot } from "./types";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "inonu-outcomes-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);
const bars = (interval: Interval, count: number): Bar[] => {
  const ms = INTERVAL_MS[interval];
  const end = T0 - (T0 % INTERVAL_MS["4h"]);
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + Math.sin(i / 7) * 3 + i * 0.01;
    return { ts: end - (count - i) * ms, open: close - 0.2, high: close + 0.6, low: close - 0.7, close, volume: 1, confirmed: true };
  });
};
const realFeatures = () => computeFeatures({ instId: "ETH-USDT", asOfMs: T0, price: 101, bars: { "5m": bars("5m", 300), "15m": bars("15m", 200), "1h": bars("1h", 100), "4h": bars("4h", 80) }, spreadBps: 2, feeAndSlippageRoundTripBps: 22 });

const snap = (id: string, asOfMs = T0, over: Partial<Snapshot> = {}): Snapshot => ({
  id, asOfMs, instId: "ETH-USDT", market: "spot", price: 101, costRoundTripBps: 24, atr15m: 0.8,
  zones: { demanda: { baixo: 98, alto: 99, invalidacao: 97.5, nota: 61 }, oferta: null },
  features: { ...realFeatures(), asOfMs }, origem: "relogio", ...over,
});
const label = (snapshotId: string, over: Partial<Label> = {}): Label => ({
  snapshotId, horizonte: "1h", completo: true, motivoIncompleto: null, brutoLongBps: 12, liquidoLongBps: -12, liquidoShortBps: -36, maxAltaBps: 30, maxQuedaBps: 5,
  barreiraLong: "tempo", barreiraShort: "parada", zonaDemanda: { tocou: false, reagiu: null }, zonaOferta: null, ...over,
});
const decision = (id: string, over: Partial<DecisionRecord> = {}): DecisionRecord => ({ id, atMs: T0, instId: "ETH-USDT", modo: "ativo", action: "hold", candidateId: null, briefHash: "ab", snapshotId: null, reutilizado: false, probabilidades: null, veredito: null, ...over });

describe("append and read back (REC-2)", () => {
  test("snapshots, labels and decisions survive a round trip, in files named by UTC day", () => {
    const dir = tmp();
    const store = createOutcomeStore({ dir, now: () => T0 });
    expect(store.appendSnapshot(snap("a"))).toBe(true);
    expect(store.appendSnapshot(snap("b", T0 + 2 * 86_400_000))).toBe(true);
    expect(store.appendLabel(label("a"))).toBe(true);
    expect(store.appendDecision(decision("d1", { snapshotId: "a", probabilidades: { postura: 0.6 }, veredito: { selo: "esperar", forcadoPor: "custo" } }))).toBe(true);
    // decisions have a file per UTC day like the rest (store.ts header); `decisions.jsonl` is only the legacy name that is still read
    expect(readdirSync(dir).sort()).toEqual(["decisions-2026-10-13.jsonl", "labels-2026-10-13.jsonl", "snapshots-2026-10-13.jsonl", "snapshots-2026-10-15.jsonl"]);
    const again = createOutcomeStore({ dir, now: () => T0 });
    expect(again.snapshots().map((s) => s.id)).toEqual(["a", "b"]);
    expect(again.snapshots()[0]).toEqual(snap("a"));
    expect(again.labels()).toEqual([label("a")]);
    expect(again.decisions()[0]!.probabilidades).toEqual({ postura: 0.6 });
    expect(again.stats()).toMatchObject({ snapshots: 2, labels: 1, decisions: 1, corruptLines: 0, writeErrors: 0, lastAppendMs: null });
  });

  test("the zones with their ids survive, and a record from before they existed still reads", () => {
    const dir = tmp();
    const store = createOutcomeStore({ dir, now: () => T0 });
    const withIds = snap("a", T0, { zones: { demanda: null, oferta: null, todas: [{ id: "0123456789ab", lado: "demanda", baixo: 98, alto: 99, invalidacao: 97.5, nota: 61 }] } });
    store.appendSnapshot(withIds);
    store.appendSnapshot(snap("b"));
    const got = createOutcomeStore({ dir, now: () => T0 }).snapshots();
    expect(got[0]!.zones.todas).toEqual([{ id: "0123456789ab", lado: "demanda", baixo: 98, alto: 99, invalidacao: 97.5, nota: 61 }]);
    expect(got[1]!.zones.todas).toBeUndefined();
    expect(parseSnapshot({ ...withIds, zones: { demanda: null, oferta: null, todas: [{ id: 5, baixo: 1, alto: 2, invalidacao: null, nota: 1 }] } })).toBeNull();
    expect(parseSnapshot({ ...withIds, zones: { demanda: null, oferta: null, todas: [null] } })).toBeNull();
  });

  test("a snapshot is small: a full hour of four instruments stays far under 1 MB", () => {
    const bytes = JSON.stringify(snap("a")).length;
    expect(bytes).toBeLessThan(7000);
    expect(bytes * 48).toBeLessThan(1_000_000);
  });

  test("a label is final when it is complete or was given up on a gap, never when the horizon was not over", () => {
    const store = createOutcomeStore({ dir: tmp(), now: () => T0 });
    store.appendLabel(label("a"));
    store.appendLabel(label("b", { completo: false, motivoIncompleto: "lacuna_de_velas", brutoLongBps: null, liquidoLongBps: null, liquidoShortBps: null, maxAltaBps: null, maxQuedaBps: null, barreiraLong: null, barreiraShort: null, zonaDemanda: null }));
    store.appendLabel(label("c", { horizonte: "4h" }));
    store.appendLabel(label("d", { completo: false, motivoIncompleto: "horizonte_alem_dos_dados", brutoLongBps: null, liquidoLongBps: null, liquidoShortBps: null, maxAltaBps: null, maxQuedaBps: null, barreiraLong: null, barreiraShort: null, zonaDemanda: null }));
    expect([...store.doneKeys()].sort()).toEqual(["a|1h", "b|1h", "c|4h"]);
    expect([...store.doneKeys(T0 + 3 * 86_400_000)]).toEqual([]);
  });
});

describe("damaged input and a folder that cannot be written", () => {
  test("a damaged line, a wrong shape and a stranger are skipped and counted, never fatal", () => {
    const dir = tmp();
    const store = createOutcomeStore({ dir, now: () => T0 });
    store.appendSnapshot(snap("a"));
    const file = join(dir, "snapshots-2026-10-13.jsonl");
    appendFileSync(file, "{not json\n");
    appendFileSync(file, `${JSON.stringify({ ...snap("x"), price: -1 })}\n`);
    appendFileSync(file, `${JSON.stringify({ ...snap("y"), features: { v: 2 } })}\n`);
    appendFileSync(file, `${JSON.stringify(snap("z"))}\n`);
    const got = createOutcomeStore({ dir, now: () => T0 });
    expect(got.snapshots().map((s) => s.id)).toEqual(["a", "z"]);
    expect(got.stats().corruptLines).toBe(3);
  });

  test("a folder that cannot be created makes append return false and never throws", () => {
    const base = tmp();
    const blocker = join(base, "file");
    writeFileSync(blocker, "x");
    const store = createOutcomeStore({ dir: join(blocker, "inside"), now: () => T0 });
    expect(store.appendSnapshot(snap("a"))).toBe(false);
    expect(store.appendDecision(decision("d"))).toBe(false);
    expect(store.stats().writeErrors).toBe(2);
    expect(store.snapshots()).toEqual([]);
  });

  test("parsers refuse a value that is not exactly the documented shape", () => {
    expect(parseSnapshot({ ...snap("a"), origem: "outra" })).toBeNull();
    expect(parseSnapshot({ ...snap("a"), zones: { demanda: { baixo: "x" }, oferta: null } })).toBeNull();
    expect(parseLabel({ ...label("a"), horizonte: "2h" })).toBeNull();
    expect(parseLabel({ ...label("a"), barreiraLong: "ganhou" })).toBeNull();
    expect(parseDecision({ ...decision("d"), action: "long" })).toBeNull();
    expect(parseDecision({ ...decision("d"), probabilidades: { x: 2 } })).toBeNull();
    expect(parseDecision({ ...decision("d"), veredito: { selo: "comprar", forcadoPor: 3 } })).toBeNull();
  });
});

describe("the cap (REC-2)", () => {
  test("over the cap the oldest day files go first, of every kind, until under 90 percent, and the files of the current day stay", () => {
    const dir = tmp();
    const clock = { now: T0 };
    const one = JSON.stringify(snap("a")).length + 1;
    // room for about six snapshots; the days are written one after the other, two snapshots a day, so three days fill it
    const store = createOutcomeStore({ dir, now: () => clock.now, maxBytes: one * 6 });
    store.appendDecision(decision("old")); // decisions-2026-10-13: the oldest day, and a decision is not exempt
    for (let day = 0; day < 5; day += 1) {
      clock.now = T0 + day * 86_400_000;
      if (day === 4) store.appendDecision(decision("keep", { atMs: clock.now }));
      for (let i = 0; i < 2; i += 1) expect(store.appendSnapshot(snap(`s${day}-${i}`, clock.now))).toBe(true);
    }
    const left = readdirSync(dir).sort();
    expect(left).not.toContain("snapshots-2026-10-13.jsonl"); // the oldest day went first
    expect(left).not.toContain("decisions-2026-10-13.jsonl"); // and its decision with it
    expect(left).toContain("snapshots-2026-10-17.jsonl"); // the current day stays
    expect(left).toContain("decisions-2026-10-17.jsonl");
    expect(store.decisions().map((d) => d.id)).toEqual(["keep"]);
    // oldest first, and only until under 90 percent: the snapshot days that are left are the newest ones, with no hole, and not just one
    const days = left.filter((f) => f.startsWith("snapshots-")).map((f) => f.slice(10, 20));
    expect(days.length).toBeGreaterThan(1);
    expect(days).toEqual(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"].slice(-days.length));
    expect(store.stats().bytes).toBeLessThanOrEqual(one * 6);
  });

  test("a file the module does not own is never touched", () => {
    const dir = tmp();
    writeFileSync(join(dir, "notes.txt"), "mine");
    const store = createOutcomeStore({ dir, now: () => T0, maxBytes: 10 });
    for (let i = 0; i < 50; i += 1) store.appendSnapshot(snap(`s${i}`));
    expect(existsSync(join(dir, "notes.txt"))).toBe(true);
  });
});
