import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentLedger, createFileAgentLedger, orderKey, type CycleRecord, type OrderRecord } from "./ledger";
import { quoteFactsOf } from "./quote-facts";

const cycle = (over: Partial<CycleRecord> = {}): CycleRecord => ({ kind: "cycle", cycleId: "c1", atMs: 1000, mode: "sombra", outcome: "decidido", reason: null, posture: "neutra", stances: { "hold:x@agente": "hold" }, planned: 0, dropped: [], modelo: "jev-latest", ...over });
const order = (over: Partial<OrderRecord> = {}): OrderRecord => ({
  kind: "order",
  cycleId: "c1",
  atMs: 1001,
  orderKey: orderKey("c1", "hold:x@agente"),
  stage: "preparada",
  candidateId: "hold:x@agente",
  side: "sell",
  stance: "trim_half",
  chainIndex: "1",
  symbol: "AAA",
  address: "0x1111111111111111111111111111111111111111",
  wallet: "agente",
  usd: 45,
  amountMinor: "500000000000000000",
  ref: null,
  reason: null,
  profile: null,
  source: "modelo",
  ...over,
});

const memory = (lines: string[] = []) => {
  const store = [...lines];
  return { store, ledger: createAgentLedger({ read: () => store, append: (line) => void store.push(line) }) };
};

describe("the ledger is written before the agent acts and read back after a restart", () => {
  test("records come back in order, and the last stage of an order wins", () => {
    const { ledger } = memory();
    ledger.append(cycle());
    ledger.append(order());
    ledger.append(order({ stage: "enviando", atMs: 1002 }));
    expect(ledger.orderStage(order().orderKey)).toBe("enviando");
    ledger.append(order({ stage: "executada", atMs: 1003, ref: "0xabc" }));
    expect(ledger.orderStage(order().orderKey)).toBe("executada");
    expect(ledger.tail(10).map((r) => r.kind)).toEqual(["cycle", "order", "order", "order"]);
  });

  test("an order sent and never settled is in flight, and it stays in flight after a restart", () => {
    const first = memory();
    first.ledger.append(order({ stage: "enviando" }));
    const second = createAgentLedger({ read: () => first.store, append: () => {} });
    expect(second.inFlight()).toEqual([order().orderKey]);
    expect(second.health()).toEqual({ ok: true });
  });

  test("settled orders are not in flight", () => {
    const { ledger } = memory();
    ledger.append(order({ stage: "enviando" }));
    ledger.append(order({ stage: "executada", ref: "0xabc" }));
    ledger.append(order({ orderKey: "c1:other", candidateId: "o", stage: "falhou", reason: "token_scan_block" }));
    expect(ledger.inFlight()).toEqual([]);
  });

  test("an uncertain order (timeout) stays in flight until reconciled, and is never sent again", () => {
    const { ledger } = memory();
    ledger.append(order({ stage: "enviando" }));
    ledger.append(order({ stage: "incerta", reason: "tempo_esgotado" }));
    expect(ledger.inFlight()).toEqual([order().orderKey]);
    expect(ledger.mayStart(order().orderKey)).toBe(false);
    ledger.append(order({ stage: "executada", ref: "0xabc" }));
    expect(ledger.inFlight()).toEqual([]);
  });

  test("an order key that went out, failed or is uncertain may not start again; only a prepared one may", () => {
    const { ledger } = memory();
    expect(ledger.mayStart("c1:a")).toBe(true);
    ledger.append(order({ orderKey: "c1:a", stage: "preparada" }));
    expect(ledger.mayStart("c1:a")).toBe(true);
    ledger.append(order({ orderKey: "c1:a", stage: "enviando" }));
    expect(ledger.mayStart("c1:a")).toBe(false);
    ledger.append(order({ orderKey: "c1:b", stage: "falhou", reason: "token_scan_block" }));
    expect(ledger.mayStart("c1:b")).toBe(false);
  });

  test("a write that fails throws: the agent does not act on a decision it could not record", () => {
    const ledger = createAgentLedger({
      read: () => [],
      append: () => {
        throw new Error("disk");
      },
    });
    expect(() => ledger.append(cycle())).toThrow("ledger_nao_gravou");
  });

  test("a corrupt line makes the ledger unhealthy, and the agent holds", () => {
    const { ledger } = memory(["{not json"]);
    expect(ledger.health()).toEqual({ ok: false, reason: "ledger_corrompido" });
    expect(() => ledger.append(cycle())).toThrow("ledger_corrompido");
  });

  test("a record written before profiles and sources existed is still read, as the model's, with no profile", () => {
    const { profile: _p, source: _s, ...old } = order();
    const { ledger } = memory([JSON.stringify(old)]);
    expect(ledger.health()).toEqual({ ok: true });
    expect(ledger.tail(1)[0]).toMatchObject({ profile: null, source: "modelo" });
  });

  test("a source that is neither is corrupt", () => {
    const { ledger } = memory([JSON.stringify({ ...order(), source: "alguem" })]);
    expect(ledger.health().ok).toBe(false);
  });

  test("a record with the wrong shape is corrupt too", () => {
    const { ledger } = memory([JSON.stringify({ kind: "order", cycleId: "c1" })]);
    expect(ledger.health().ok).toBe(false);
  });

  test("what the sales and purchases of today add up to, for the daily cap", () => {
    const day = Date.UTC(2026, 9, 14, 12);
    const { ledger } = memory();
    ledger.append(order({ orderKey: "a", atMs: day, stage: "enviando", side: "sell", usd: 40 }));
    ledger.append(order({ orderKey: "a", atMs: day + 1, stage: "executada", side: "sell", usd: 40 }));
    ledger.append(order({ orderKey: "b", atMs: day, stage: "enviando", side: "buy", usd: 25, amountMinor: null }));
    ledger.append(order({ orderKey: "c", atMs: day, stage: "falhou", side: "buy", usd: 99, amountMinor: null }));
    ledger.append(order({ orderKey: "d", atMs: day, stage: "preparada", side: "buy", usd: 77, amountMinor: null }));
    ledger.append(order({ orderKey: "e", atMs: day - 86_400_000, stage: "executada", side: "buy", usd: 500, amountMinor: null }));
    // only orders that went out count (sent or settled), once each, and only today
    expect(ledger.spentTodayUsd(day + 5000)).toEqual({ buy: 25, sell: 40 });
  });

  test("the last records a person can read, newest last, and bounded", () => {
    const { ledger } = memory();
    for (let i = 0; i < 30; i++) ledger.append(cycle({ cycleId: `c${i}`, atMs: i }));
    expect(ledger.tail(5).map((r) => r.cycleId)).toEqual(["c25", "c26", "c27", "c28", "c29"]);
    expect(ledger.tail(1000)).toHaveLength(30);
  });
});

describe("settling an order in flight can bring the reference it never had", () => {
  test("a reference found afterwards is kept on the order; one it already carried is never replaced", () => {
    const m = memory();
    m.ledger.append(order({ stage: "enviando" }));
    m.ledger.append(order({ stage: "incerta", reason: "recusa_sem_prova" }));
    const key = order().orderKey;
    expect(m.ledger.resolve(key, "executada", 2000, "recibo_recuperado", "5".repeat(88))).toBe(true);
    const settled = m.ledger.orderRecords().find((r) => r.orderKey === key)!;
    expect(settled).toMatchObject({ stage: "executada", reason: "recibo_recuperado", ref: "5".repeat(88) });
    // and it survives a restart
    const reopened = createAgentLedger({ read: () => m.store, append: () => {} });
    expect(reopened.orderRecords().find((r) => r.orderKey === key)).toMatchObject({ ref: "5".repeat(88), stage: "executada" });
    const kept = memory();
    kept.ledger.append(order({ stage: "incerta", ref: "6".repeat(88) }));
    expect(kept.ledger.resolve(key, "executada", 2000, "recibo_sucesso", "7".repeat(88))).toBe(true);
    expect(kept.ledger.orderRecords()[0]!.ref).toBe("6".repeat(88));
  });
});

describe("the file ledger", () => {
  test("appends lines, creates its folder, and a new process sees what the old one wrote", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-ledger-"));
    try {
      const path = join(dir, "deep", "ledger.jsonl");
      const a = createFileAgentLedger(path);
      expect(a.health()).toEqual({ ok: true });
      a.append(cycle());
      a.append(order({ stage: "enviando" }));
      expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2);
      const b = createFileAgentLedger(path);
      expect(b.inFlight()).toEqual([order().orderKey]);
      expect(b.mayStart(order().orderKey)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a file with a corrupt line is unhealthy and nothing more is appended to it", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-ledger-"));
    try {
      const path = join(dir, "ledger.jsonl");
      writeFileSync(path, `${JSON.stringify(cycle())}\n{broken\n`);
      const ledger = createFileAgentLedger(path);
      expect(ledger.health().ok).toBe(false);
      expect(() => ledger.append(cycle())).toThrow("ledger_corrompido");
      expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(cycle())}\n{broken\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the facts of the quote on an order record", () => {
  const facts = quoteFactsOf({ action: "ok", priceImpactPercent: "0.4", tradeFee: "0.0005" }, 1500);

  test("an old record without them reads as it always did, and a record with them keeps them through every later stage", () => {
    const { ledger, store } = memory([JSON.stringify(order({ stage: "enviando" }))]);
    expect(ledger.orderRecords()[0]).not.toHaveProperty("quote");
    ledger.append(order({ stage: "incerta", ref: "0x" + "a".repeat(64), reason: "transmitida", quote: facts }));
    expect(ledger.resolve(orderKey("c1", "hold:x@agente"), "executada", 2000, "recibo_sucesso")).toBe(true);
    const last = JSON.parse(store.at(-1)!) as OrderRecord;
    expect(last.stage).toBe("executada");
    expect(last.quote).toEqual(facts);
    // and it is read back from the file the same way
    const again = memory(store).ledger.orderRecords()[0]!;
    expect(again.quote).toEqual(facts);
  });

  test("facts that are not exactly the shape written are dropped from the record, never a reason to refuse the ledger", () => {
    const lines = [
      JSON.stringify({ ...order({ stage: "enviando" }), quote: { atMs: 1, impactPct: "0.4", rubbish: true } }),
      JSON.stringify(order({ stage: "executada", orderKey: orderKey("c2", "hold:y@agente"), candidateId: "hold:y@agente", cycleId: "c2", quote: { ...facts, feeUnit: "desconhecida" } as never })),
    ];
    const { ledger } = memory(lines);
    expect(ledger.health()).toEqual({ ok: true });
    for (const r of ledger.orderRecords()) expect(r).not.toHaveProperty("quote");
  });
});
