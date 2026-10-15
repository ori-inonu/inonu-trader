// T7.4 / ASK-6, AC-ASK-3: the ledger of "Pedir ao Inonu" records calls, tokens, dollars and latency as MEASURED, with null
// where the provider reported nothing, survives a restart, and counts days in UTC. origin: synthetic_fixture, tests only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LedgerEntry } from "./ask";
import { createFileLedger } from "./ledger";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inonu-ledger-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: "ask-1",
  atMs: T0,
  modo: "ativo",
  razao: "clique:ativo",
  briefHash: "h".repeat(64),
  modelo: "fake-jev",
  chamadasModelo: 1,
  chamadasOnchainos: 3,
  tokensEntrada: 700,
  tokensSaida: 40,
  usd: 0.0027,
  latenciaMs: 850,
  resultado: "respondido",
  ...over,
});

describe("today's numbers", () => {
  test("sums the measured dollars and counts the calls that reached the model", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ id: "a" }));
    ledger.record(entry({ id: "b", usd: 0.003 }));
    ledger.record(entry({ id: "c", chamadasModelo: 0, modelo: null, usd: null, tokensEntrada: null, tokensSaida: null, resultado: "teto_diario" })); // refused: no model call
    expect(ledger.callsToday(T0)).toBe(2);
    expect(ledger.spentTodayUsd(T0)).toBeCloseTo(0.0057, 10);
  });

  test("one model call whose cost is unknown makes the day's spending unknown: null, never a partial sum presented as total", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ id: "a" }));
    ledger.record(entry({ id: "b", usd: null, tokensEntrada: null, tokensSaida: null }));
    expect(ledger.spentTodayUsd(T0)).toBeNull();
    expect(ledger.callsToday(T0)).toBe(2);
  });

  test("an empty day is zero dollars and zero calls", () => {
    const ledger = createFileLedger({ dir });
    expect(ledger.spentTodayUsd(T0)).toBe(0);
    expect(ledger.callsToday(T0)).toBe(0);
  });

  test("days are UTC days: yesterday's calls do not count today", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ id: "old", atMs: T0 - DAY }));
    ledger.record(entry({ id: "new", atMs: T0 }));
    expect(ledger.callsToday(T0)).toBe(1);
    expect(ledger.callsToday(T0 - DAY)).toBe(1);
    expect(ledger.callsToday(T0 + DAY)).toBe(0);
  });
});

describe("what counts against the daily cap", () => {
  test("a call whose cost was not measured counts for the estimate made before it, while the honest total stays unknown", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ id: "a", usd: 0.04, usdEstimado: 0.05 }));
    ledger.record(entry({ id: "b", usd: null, usdEstimado: 0.03, tokensEntrada: null, tokensSaida: null, resultado: "erro:tempo_esgotado" }));
    expect(ledger.spentTodayUsd(T0)).toBeNull(); // measured spending: one call is unknown, so it is not presented as a total
    expect(ledger.committedTodayUsd(T0)).toBeCloseTo(0.07, 10); // 0.04 measured + 0.03 estimated
    expect(ledger.summary(T0).today.usd).toBeNull();
  });

  test("when every call was measured the two agree, and an empty day commits nothing", () => {
    const ledger = createFileLedger({ dir });
    expect(ledger.committedTodayUsd(T0)).toBe(0);
    ledger.record(entry({ id: "a", usd: 0.0027, usdEstimado: 0.01 }));
    expect(ledger.committedTodayUsd(T0)).toBeCloseTo(0.0027, 10);
    expect(ledger.spentTodayUsd(T0)).toBeCloseTo(0.0027, 10);
  });

  test("a call with no cost and no estimate (the price was not known) leaves the commitment unknown too: the dollar caps were off then", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ id: "a", usd: null, usdEstimado: null }));
    expect(ledger.committedTodayUsd(T0)).toBeNull();
  });

  test("the estimate is a documented field that survives a restart, and an old line without it still loads", () => {
    createFileLedger({ dir }).record(entry({ id: "a", usd: null, usdEstimado: 0.012 }));
    expect(createFileLedger({ dir }).entries()[0]!.usdEstimado).toBe(0.012);
    writeFileSync(join(dir, "ledger.jsonl"), JSON.stringify({ id: "old", atMs: T0, modo: "ativo", razao: "clique:ativo", briefHash: null, modelo: "m", chamadasModelo: 1, chamadasOnchainos: 0, tokensEntrada: 1, tokensSaida: 1, usd: 0.001, latenciaMs: 5, resultado: "respondido" }) + "\n");
    const reloaded = createFileLedger({ dir });
    expect(reloaded.entries()).toHaveLength(1);
    expect(reloaded.entries()[0]!.usdEstimado ?? null).toBeNull();
  });
});

describe("persistence", () => {
  test("a new ledger on the same folder sees what the previous one wrote", () => {
    createFileLedger({ dir }).record(entry({ id: "a" }));
    const again = createFileLedger({ dir });
    expect(again.callsToday(T0)).toBe(1);
    expect(again.entries().map((e) => e.id)).toEqual(["a"]);
  });

  test("one JSON object per line, appended, with only the documented fields: no prompt, no answer text, no key", () => {
    createFileLedger({ dir }).record(entry());
    const lines = readFileSync(join(dir, "ledger.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(Object.keys(JSON.parse(lines[0]!)).sort()).toEqual(["atMs", "briefHash", "chamadasModelo", "chamadasOnchainos", "id", "latenciaMs", "modelo", "modo", "razao", "resultado", "tokensEntrada", "tokensSaida", "usd", "usdEstimado"]);
  });

  test("a damaged or foreign line is skipped and counted, and the rest still loads", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ id: "a" }));
    appendFileSync(join(dir, "ledger.jsonl"), "{not json\n{\"id\":5}\n\n");
    ledger.record(entry({ id: "b" }));
    const again = createFileLedger({ dir });
    expect(again.entries().map((e) => e.id)).toEqual(["a", "b"]);
    expect(again.corruptLines()).toBe(2);
  });

  test("the file stays bounded: past the limit only the newest entries are kept", () => {
    const ledger = createFileLedger({ dir, maxEntries: 5 });
    for (let i = 0; i < 12; i += 1) ledger.record(entry({ id: `e${i}`, atMs: T0 + i }));
    expect(ledger.entries().map((e) => e.id)).toEqual(["e7", "e8", "e9", "e10", "e11"]);
    const again = createFileLedger({ dir, maxEntries: 5 });
    expect(again.entries().map((e) => e.id)).toEqual(["e7", "e8", "e9", "e10", "e11"]);
    expect(readFileSync(join(dir, "ledger.jsonl"), "utf8").trim().split("\n").length).toBeLessThanOrEqual(5 * 2);
  });

  test("a folder that cannot be written does not throw into the click: the entry stays in memory", () => {
    writeFileSync(join(dir, "blocker"), "x");
    const ledger = createFileLedger({ dir: join(dir, "blocker", "sub") });
    expect(() => ledger.record(entry())).not.toThrow();
    expect(ledger.callsToday(T0)).toBe(1);
  });
});

describe("summary for the Settings panel", () => {
  test("rehydrates ecosystem two-stage and portfolio clicks and counts evaluations rather than rows", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ modo: "ecossistema", chamadasModelo: 2, usd: null, tokensEntrada: null, tokensSaida: null, avaliacoes: [
      { indice: 1, tokensEntrada: 100, tokensSaida: 10, usd: 0.001, usdEstimado: 0.002 },
      { indice: 2, tokensEntrada: null, tokensSaida: null, usd: null, usdEstimado: 0.003 },
    ] } as never));
    ledger.record(entry({ id: "portfolio", modo: "carteira" }));
    ledger.record(entry({ id: "refused", modo: "ecossistema", chamadasModelo: 0, usd: null }));
    const again = createFileLedger({ dir });
    expect(again.entries()).toHaveLength(3);
    expect(again.corruptLines()).toBe(0);
    expect(again.callsToday(T0)).toBe(3);
    expect(again.summary(T0).today).toMatchObject({ calls: 3, usd: null, tokens: null });
    expect(again.committedTodayUsd(T0)).toBeCloseTo(0.0067, 10);
    expect((again.entries()[0] as any).avaliacoes[0]).toMatchObject({ tokensEntrada: 100, tokensSaida: 10, usd: 0.001 });
  });

  test("persists only whitelisted stage measurements, never request or answer fields", () => {
    createFileLedger({ dir }).record(entry({ modo: "ecossistema", chamadasModelo: 2, avaliacoes: [
      { indice: 1, tokensEntrada: 100, tokensSaida: 10, usd: 0.001, usdEstimado: 0.002, prompt: "PRIVATE_SENTINEL", answer: "PRIVATE_SENTINEL" },
      { indice: 2, tokensEntrada: null, tokensSaida: null, usd: null, usdEstimado: 0.003, address: "PRIVATE_SENTINEL" },
    ] } as never));
    const persisted = readFileSync(join(dir, "ledger.jsonl"), "utf8");
    expect(persisted).not.toContain("PRIVATE_SENTINEL");
    expect(JSON.parse(persisted).avaliacoes).toEqual([
      { indice: 1, tokensEntrada: 100, tokensSaida: 10, usd: 0.001, usdEstimado: 0.002 },
      { indice: 2, tokensEntrada: null, tokensSaida: null, usd: null, usdEstimado: 0.003 },
    ]);
  });

  test("today and the month, measured, with the unknown kept as null", () => {
    const ledger = createFileLedger({ dir });
    ledger.record(entry({ id: "a" }));
    ledger.record(entry({ id: "b", atMs: T0 - 3 * DAY, usd: 0.01, tokensEntrada: 1000, tokensSaida: 100 }));
    ledger.record(entry({ id: "c", atMs: T0 - 40 * DAY }));
    const s = ledger.summary(T0);
    expect(s.today).toEqual({ calls: 1, usd: 0.0027, tokens: 740, onchainosCalls: 3, avgLatencyMs: 850 });
    expect(s.month.calls).toBe(2);
    expect(s.month.usd).toBeCloseTo(0.0127, 10);
    expect(s.month.tokens).toBe(1840);
    ledger.record(entry({ id: "d", usd: null, tokensEntrada: null, tokensSaida: null }));
    expect(ledger.summary(T0).today).toMatchObject({ calls: 2, usd: null, tokens: null });
  });
});
