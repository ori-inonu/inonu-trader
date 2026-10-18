import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerRecord, createJournal, createRecorders, priceRowFromBook, priceRowFromEco } from "./recording";
import type { ConsultMeta, ConsultRecord } from "./cycle";
import type { Book, Position } from "./types";
import type { EcoContext } from "../opportunity/ecosystem";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "recording-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const MINT = "BCdwQBAn8dYB5YjTsoB6TdHAWokxv28k2oZUodERpump";
const HOLD = "hold:token:501:5dvXTZ5qwgafnHtwu3Ls3QrWx1U4LQsFeCuJgkk4QEC6@agente";
const BUY = `buy:token:501:${MINT}`;
const NOW = Date.UTC(2026, 9, 15, 15, 0, 0);

const entry = (over: Partial<ConsultRecord> = {}): ConsultRecord =>
  ({
    cycleId: "cy-1", atMs: NOW, mode: "limitado", briefBytes: 11_000,
    candidates: [
      { id: HOLD, kind: "holding", stances: ["hold", "trim_third", "exit_all"], marks: [], families: [], triggers: ["x"] },
      { id: BUY, kind: "buy", stances: ["skip", "buy_tenth"], marks: ["liquidez_baixa"], families: ["fluxo"], triggers: [], cap: { maxUsd: 108, binding: "caixa", sharePct: 0.92 } },
    ],
    brief: {}, briefVersion: 1, physicalRequests: 1, criteria: "rank-v1", legend: "scoped-v1", notes: ["postura_limitou"], valid: true, invalidReason: null, briefHash: "abcd1234abcd1234",
    requested: { [HOLD]: "hold", [BUY]: "skip" }, facets: { [BUY]: { late_in_run: 0.4 } }, historico: null, contexto: null,
    verdicts: { [HOLD]: { hold: 0.94, exit_all: 0.06 }, [BUY]: { skip: 0.77, buy_tenth: 0.23 } }, posture: "neutra", postureProbs: { neutra: 0.8, ofensiva: 0.2 },
    stances: { [HOLD]: "hold", [BUY]: "skip" }, profiles: {}, ...over,
  }) as unknown as ConsultRecord;
const meta: ConsultMeta = { factAvailableAtMs: NOW - 5_000, askedAtMs: NOW + 1_000, answeredAtMs: NOW + 1_400, briefHash: "f".repeat(64), model: "jev-latest" };

const pos = (over: Partial<Position>): Position => ({ id: "x", chainIndex: "501", address: MINT, symbol: "BBB", wallet: "agente", usd: 10, balanceMinor: "1", decimals: 6, isCash: false, priceUsd: 0.0033, ...over }) as Position;
const book = (positions: Position[], observedAtMs = NOW): Book => ({ observedAtMs, positions, cashByChain: {}, totalUsd: 100, agentUsd: 100 });

describe("what the Jev answered is kept for good, with what it was offered and what was done", () => {
  test("the probability of each option of each candidate is in the record", () => {
    expect(answerRecord(entry(), meta, NOW + 2_000).items.find((i) => i.id === BUY)!.probs).toEqual({ skip: 0.77, buy_tenth: 0.23 });
  });

  test("what the Jev asked for and what was carried out are both there", () => {
    const item = answerRecord(entry({ stances: { [HOLD]: "hold", [BUY]: "buy_tenth" } }), meta, NOW).items.find((i) => i.id === BUY)!;
    expect([item.requested, item.applied]).toEqual(["skip", "buy_tenth"]);
  });

  test("the options the code offered, the marks and the facets travel with the answer so it can be paired later", () => {
    const item = answerRecord(entry(), meta, NOW).items.find((i) => i.id === BUY)!;
    expect([item.offered, item.marks, item.facets]).toEqual([["skip", "buy_tenth"], ["liquidez_baixa"], { late_in_run: 0.4 }]);
  });

  test("the clocks are the ones the cycle measured, and the hash ties it to the Brief kept elsewhere", () => {
    const r = answerRecord(entry(), meta, NOW + 2_000);
    expect([r.askedAtMs, r.answeredAtMs, r.briefHash]).toEqual([NOW + 1_000, NOW + 1_400, "abcd1234abcd1234"]);
  });

  test("an answer that carried no probabilities says so with null, not with zero", () => {
    const item = answerRecord(entry({ verdicts: {} }), meta, NOW).items.find((i) => i.id === BUY)!;
    expect(item.probs).toBeNull();
  });

  test("with no meta the clocks are unknown, not invented", () => {
    expect(answerRecord(entry(), undefined, NOW).askedAtMs).toBeNull();
  });
});

describe("the prices the cycle already reads become a path, with no new read", () => {
  test("a book gives the price of each token the agent holds, by plan key", () => {
    expect(priceRowFromBook(book([pos({})]), NOW, "look")!.prices).toEqual({ [`501:${MINT}`]: 0.0033 });
  });

  test("cash, the other wallet and a token with no price are left out", () => {
    const row = priceRowFromBook(book([pos({ isCash: true }), pos({ wallet: "principal" }), pos({ priceUsd: null }), pos({ address: "OKTOKEN" })]), NOW, "look")!;
    expect(Object.keys(row.prices)).toEqual(["501:OKTOKEN"]);
  });

  test("a book with nothing priced gives no row", () => {
    expect(priceRowFromBook(book([pos({ priceUsd: null })]), NOW, "guard")).toBeNull();
  });

  test("the observation time is null, because no source gives one: only the time of the read is kept", () => {
    const row = priceRowFromBook(book([pos({})], NOW - 90_000), NOW, "look")!;
    expect([row.obsAtMs, row.atMs]).toEqual([null, NOW]);
  });

  test("the candidates of the ecosystem give their prices, and one with no price is left out", () => {
    const eco = { observedAtMs: NOW - 30_000, saldo: null, excluded: {}, candidates: [{ facts: { chainIndex: "501", address: MINT, priceUsd: 0.0033 } }, { facts: { chainIndex: "501", address: "NOPRICE", priceUsd: null } }] } as unknown as EcoContext;
    expect(priceRowFromEco(eco, NOW)!.prices).toEqual({ [`501:${MINT}`]: 0.0033 });
  });

  test("stale and unavailable ecosystem scans produce no price row or current-time recording", () => {
    const eco = { observedAtMs: NOW - 30_000, saldo: null, excluded: {}, candidates: [{ facts: { chainIndex: "501", address: MINT, priceUsd: 0.0033 } }] } as unknown as EcoContext;
    const fresh = { ...eco, sourceQuality: { state: "fresh" as const, ageMs: 30_000 } };
    const stale = { ...eco, sourceQuality: { state: "stale" as const, ageMs: 31 * 60_000 } };
    const unavailable = { ...eco, sourceQuality: { state: "unavailable" as const, ageMs: null } };
    expect(priceRowFromEco(fresh, NOW)!.prices).toEqual({ [`501:${MINT}`]: 0.0033 });
    const freshDir = tmp();
    createRecorders({ dir: freshDir, now: () => NOW }).recordEco(fresh);
    expect(JSON.parse(readFileSync(join(freshDir, "prices.jsonl"), "utf8")).atMs).toBe(NOW);
    expect(priceRowFromEco(stale, NOW)).toBeNull();
    expect(priceRowFromEco(unavailable, NOW)).toBeNull();
    const dir = tmp();
    const recorders = createRecorders({ dir, now: () => NOW });
    recorders.recordEco(stale);
    recorders.recordEco(unavailable);
    expect(existsSync(join(dir, "prices.jsonl"))).toBe(false);
  });
});

describe("the journal is append only, rotates by size, and never throws into the cycle", () => {
  test("each record is one line, in order", () => {
    const dir = tmp();
    const j = createJournal({ dir, name: "x", maxBytes: 10_000, keep: 3, now: () => NOW });
    j.append({ n: 1 });
    j.append({ n: 2 });
    expect(readFileSync(join(dir, "x.jsonl"), "utf8")).toBe('{"n":1}\n{"n":2}\n');
  });

  test("past the size limit the file moves to the next segment and nothing is lost", () => {
    const dir = tmp();
    const j = createJournal({ dir, name: "x", maxBytes: 20, keep: 3, now: () => NOW });
    for (let n = 0; n < 6; n++) j.append({ n });
    const all = readdirSync(dir).filter((f) => f.startsWith("x")).flatMap((f) => readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean)).map((l) => JSON.parse(l).n).sort();
    expect(all).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("only the newest segments are kept", () => {
    const dir = tmp();
    const j = createJournal({ dir, name: "x", maxBytes: 12, keep: 2, now: () => NOW });
    for (let n = 0; n < 20; n++) j.append({ n });
    expect(readdirSync(dir).filter((f) => f.startsWith("x")).length).toBeLessThanOrEqual(3);
  });

  test("a folder that cannot be written costs the record, is counted, and does not throw", () => {
    const dir = tmp();
    const file = join(dir, "not-a-folder");
    writeFileSync(file, "x");
    const j = createJournal({ dir: file, name: "x", maxBytes: 1000, keep: 2, now: () => NOW });
    expect([j.append({ n: 1 }), j.status().dropped]).toEqual([false, 1]);
  });

  test("a failure is visible in the status, with its time", () => {
    const dir = tmp();
    const file = join(dir, "not-a-folder");
    writeFileSync(file, "x");
    const j = createJournal({ dir: file, name: "x", maxBytes: 1000, keep: 2, now: () => NOW });
    j.append({ n: 1 });
    expect(j.status().lastError).not.toBeNull();
  });
});

describe("the recorders: every read is kept, a repeated value says it did not change, and the status file says what happened", () => {
  const lines = (dir: string) => readFileSync(join(dir, "prices.jsonl"), "utf8").split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));

  test("the first read of a source counts every price as changed", () => {
    const dir = tmp();
    createRecorders({ dir, now: () => NOW }).price(priceRowFromBook(book([pos({})]), NOW, "look"));
    expect(lines(dir)[0].changed).toBe(1);
  });

  test("a price read again with the same value is recorded as unchanged, never as a fresh price", () => {
    const dir = tmp();
    const r = createRecorders({ dir, now: () => NOW });
    r.price(priceRowFromBook(book([pos({})]), NOW, "look"));
    r.price(priceRowFromBook(book([pos({})]), NOW + 120_000, "look"));
    expect(lines(dir).map((l) => l.changed)).toEqual([1, 0]);
  });

  test("a different value is counted as changed", () => {
    const dir = tmp();
    const r = createRecorders({ dir, now: () => NOW });
    r.price(priceRowFromBook(book([pos({})]), NOW, "look"));
    r.price(priceRowFromBook(book([pos({ priceUsd: 0.0034 })]), NOW + 120_000, "look"));
    expect(lines(dir).map((l) => l.changed)).toEqual([1, 1]);
  });

  test("each source is compared with its own previous row", () => {
    const dir = tmp();
    const r = createRecorders({ dir, now: () => NOW });
    r.price(priceRowFromBook(book([pos({})]), NOW, "guard"));
    r.price(priceRowFromBook(book([pos({})]), NOW + 1_000, "look"));
    expect(lines(dir).map((l) => l.changed)).toEqual([1, 1]);
  });

  test("a null row is a no-op", () => {
    const dir = tmp();
    createRecorders({ dir, now: () => NOW }).price(null);
    expect(existsSync(join(dir, "prices.jsonl"))).toBe(false);
  });

  test("the status file counts what was written", () => {
    const dir = tmp();
    const r = createRecorders({ dir, now: () => NOW });
    r.answers(answerRecord(entry(), meta, NOW));
    r.flushStatus();
    expect(JSON.parse(readFileSync(join(dir, "recording-status.json"), "utf8")).answers.written).toBe(1);
  });
});
