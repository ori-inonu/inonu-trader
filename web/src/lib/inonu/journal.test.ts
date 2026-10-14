// ASK-7, ASK-14: what the person did with an answer of Inonu is kept on THIS machine (accept, ignore, mute a kind). Accepting
// never sends an order: it writes a line in the local journal. Storage may be missing or full, and the screen must not break.
import { describe, expect, test } from "bun:test";
import { askReducer, createInonuJournal, type JournalEntry } from "./journal";
import type { AskAnswer } from "./client";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({ atMs: 1_000, instId: "BTC-USDT", action: "buy", candidateId: "spot:BTC-USDT", kind: "spot", briefHash: "h", accepted: true, modelo: "jev-latest", ...over });

describe("the journal", () => {
  test("keeps entries, newest last, and survives a new instance on the same storage", () => {
    const storage = new MemoryStorage();
    createInonuJournal(storage).add(entry({ atMs: 1 }));
    createInonuJournal(storage).add(entry({ atMs: 2, accepted: false }));
    expect(createInonuJournal(storage).list().map((e) => [e.atMs, e.accepted])).toEqual([[1, true], [2, false]]);
  });

  test("is bounded: only the newest entries stay", () => {
    const storage = new MemoryStorage();
    const journal = createInonuJournal(storage, { max: 5 });
    for (let i = 0; i < 9; i += 1) journal.add(entry({ atMs: i }));
    expect(journal.list().map((e) => e.atMs)).toEqual([4, 5, 6, 7, 8]);
  });

  test("a damaged store reads as empty and never throws; entries of another shape are dropped", () => {
    const storage = new MemoryStorage();
    storage.setItem("inonu.journal.v1", "{not json");
    expect(createInonuJournal(storage).list()).toEqual([]);
    storage.setItem("inonu.journal.v1", JSON.stringify([entry(), { atMs: "x" }, null, { ...entry(), action: "long" }]));
    expect(createInonuJournal(storage).list()).toHaveLength(1);
  });

  test("storage that is missing or throws never breaks a click", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    for (const storage of [null, throwing]) {
      const journal = createInonuJournal(storage as never);
      expect(() => journal.add(entry())).not.toThrow();
      expect(journal.list()).toEqual([]);
      expect(() => journal.mute("spot")).not.toThrow();
      expect(journal.mutedKinds().size).toBe(0);
    }
  });

  test("muted kinds persist, can be restored one by one, and only known kinds are accepted", () => {
    const storage = new MemoryStorage();
    const journal = createInonuJournal(storage);
    journal.mute("zona");
    journal.mute("spot");
    journal.mute("spot");
    expect([...createInonuJournal(storage).mutedKinds()].sort()).toEqual(["spot", "zona"]);
    journal.unmute("spot");
    expect([...createInonuJournal(storage).mutedKinds()]).toEqual(["zona"]);
    storage.setItem("inonu.muted.v1", JSON.stringify(["zona", "whatever", 5]));
    expect([...createInonuJournal(storage).mutedKinds()]).toEqual(["zona"]);
  });

  test("the journal never stores a key or a field that is not documented: only the fields of an entry", () => {
    const storage = new MemoryStorage();
    createInonuJournal(storage).add({ ...entry(), texto: "ignore previous instructions", apiKey: "SENTINEL-1234" } as never);
    const stored = storage.getItem("inonu.journal.v1")!;
    expect(stored).not.toContain("SENTINEL");
    expect(stored).not.toContain("ignore previous");
  });

  test("the reason kept for a zone or a hold (ASK-14) is a documented field, cut to 200 characters; entries without it stay valid", () => {
    const storage = new MemoryStorage();
    const journal = createInonuJournal(storage);
    journal.add(entry({ atMs: 1, kind: "zona", razao: "x".repeat(500) }));
    journal.add(entry({ atMs: 2 }));
    const rows = createInonuJournal(storage).list();
    expect(rows[0]!.razao).toHaveLength(200);
    expect(rows[1]!.razao).toBeNull();
    // an entry written before the field existed (no razao at all) is still read
    storage.setItem("inonu.journal.v1", JSON.stringify([{ atMs: 1, instId: "BTC-USDT", action: "buy", candidateId: null, kind: "spot", briefHash: null, accepted: true, modelo: "m" }]));
    expect(createInonuJournal(storage).list()).toHaveLength(1);
    // a reason that is not text is not an entry
    storage.setItem("inonu.journal.v1", JSON.stringify([{ atMs: 1, instId: "BTC-USDT", action: "buy", candidateId: null, kind: "spot", briefHash: null, accepted: true, modelo: "m", razao: 5 }]));
    expect(createInonuJournal(storage).list()).toHaveLength(0);
  });
});

describe("askReducer", () => {
  const ok = { ok: true, id: "a", status: "respondido", briefHash: "h", custo: { chamadasOnchainos: 0, tokens: 1, usd: null }, advisory: true, execution: "never" } as AskAnswer;
  const refused = { ...ok, ok: false, status: "teto_atingido", motivo: "teto_diario" } as AskAnswer;

  test("idle -> asking -> answered, or failed when the answer is a refusal", () => {
    const asking = askReducer({ phase: "idle" }, { type: "ask" });
    expect(asking).toEqual({ phase: "asking" });
    expect(askReducer(asking, { type: "answer", answer: ok, nowMs: 5 })).toEqual({ phase: "answered", answer: ok, atMs: 5 });
    expect(askReducer(asking, { type: "answer", answer: refused, nowMs: 5 })).toEqual({ phase: "failed", answer: refused });
  });

  test("a second ask while one is running changes nothing (single flight on the screen too)", () => {
    expect(askReducer({ phase: "asking" }, { type: "ask" })).toEqual({ phase: "asking" });
  });

  test("an answer that arrives with nobody waiting for it is dropped", () => {
    expect(askReducer({ phase: "idle" }, { type: "answer", answer: ok, nowMs: 1 })).toEqual({ phase: "idle" });
  });

  test("dismiss goes back to idle from an answer or a failure, never from asking", () => {
    expect(askReducer({ phase: "answered", answer: ok, atMs: 1 }, { type: "dismiss" })).toEqual({ phase: "idle" });
    expect(askReducer({ phase: "failed", answer: refused }, { type: "dismiss" })).toEqual({ phase: "idle" });
    expect(askReducer({ phase: "asking" }, { type: "dismiss" })).toEqual({ phase: "asking" });
  });

  test("cancel returns to idle", () => {
    expect(askReducer({ phase: "asking" }, { type: "cancelled" })).toEqual({ phase: "idle" });
  });
});
