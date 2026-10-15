import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileAgentLedger, type OrderRecord } from "./ledger";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-ledger-tail-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const order = (key: string, stage: OrderRecord["stage"], over: Partial<OrderRecord> = {}): OrderRecord => ({ kind: "order", cycleId: "cy1", atMs: 1_000, orderKey: key, stage, candidateId: "buy:token:1:0x1", side: "buy", stance: "buy_third", chainIndex: "1", symbol: "AAA", address: "0x1111111111111111111111111111111111111111", wallet: "agente", usd: 10, amountMinor: null, ref: null, reason: null, profile: "alvo_10", source: "modelo", ...over });
const line = (r: OrderRecord) => JSON.stringify(r);

describe("a power cut in the middle of the last write must not stop the agent (the independent review, SF-4)", () => {
  test("a torn LAST line (no newline at its end, cut in the middle) is set aside, not read: the ledger is healthy, the earlier records stand, and the torn bytes are kept in a file beside it for the audit", () => {
    const path = join(dir, "ledger.jsonl");
    const torn = line(order("k2", "enviando")).slice(0, 60);
    writeFileSync(path, `${line(order("k1", "preparada"))}\n${torn}`);
    const ledger = createFileAgentLedger(path);
    expect(ledger.health()).toEqual({ ok: true });
    expect(ledger.orderStage("k1")).toBe("preparada");
    expect(ledger.orderStage("k2")).toBeNull();
    const kept = readdirSync(dir).filter((f) => f.startsWith("ledger.jsonl.torn-"));
    expect(kept).toHaveLength(1);
    expect(readFileSync(join(dir, kept[0]!), "utf8")).toBe(torn);
    // the file itself ends on a whole line again, so the next record is not glued onto the torn bytes
    expect(readFileSync(path, "utf8")).toBe(`${line(order("k1", "preparada"))}\n`);
    ledger.append(order("k2", "enviando"));
    const again = createFileAgentLedger(path);
    expect(again.health()).toEqual({ ok: true });
    expect(again.orderStage("k2")).toBe("enviando");
  });

  test("a last line that is a WHOLE record but lost only its newline is kept, and the newline is put back", () => {
    const path = join(dir, "ledger.jsonl");
    writeFileSync(path, `${line(order("k1", "preparada"))}\n${line(order("k2", "enviando"))}`);
    const ledger = createFileAgentLedger(path);
    expect(ledger.health()).toEqual({ ok: true });
    expect(ledger.orderStage("k2")).toBe("enviando");
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
    expect(readdirSync(dir).filter((f) => f.includes(".torn-"))).toEqual([]);
  });

  test("a line that cannot be read in the MIDDLE of the file is still a corrupt ledger: it fails closed and nothing is touched", () => {
    const path = join(dir, "ledger.jsonl");
    const text = `${line(order("k1", "preparada"))}\n{"kind":"order","cyc\n${line(order("k3", "enviando"))}\n`;
    writeFileSync(path, text);
    const ledger = createFileAgentLedger(path);
    expect(ledger.health()).toEqual({ ok: false, reason: "ledger_corrompido" });
    expect(readFileSync(path, "utf8")).toBe(text);
    expect(readdirSync(dir).filter((f) => f.includes(".torn-"))).toEqual([]);
  });

  test("an unreadable last line that DOES end with a newline is a bad record, not a torn write: it fails closed", () => {
    const path = join(dir, "ledger.jsonl");
    writeFileSync(path, `${line(order("k1", "preparada"))}\n{"kind":"order","cyc\n`);
    expect(createFileAgentLedger(path).health()).toEqual({ ok: false, reason: "ledger_corrompido" });
  });

  test("a missing or empty file is a healthy empty ledger and nothing is created until the first record", () => {
    const path = join(dir, "sub", "ledger.jsonl");
    expect(createFileAgentLedger(path).health()).toEqual({ ok: true });
    expect(existsSync(path)).toBe(false);
    writeFileSync(join(dir, "empty.jsonl"), "");
    expect(createFileAgentLedger(join(dir, "empty.jsonl")).health()).toEqual({ ok: true });
  });

  test("every record is written whole and followed by its newline, and a record that was appended can be read back by a new ledger", () => {
    const path = join(dir, "ledger.jsonl");
    const ledger = createFileAgentLedger(path);
    ledger.append(order("k1", "enviando"));
    ledger.append(order("k1", "incerta", { reason: "transmitida", ref: "0xhash" }));
    const text = readFileSync(path, "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n").filter((l) => l.length > 0)).toHaveLength(2);
    expect(createFileAgentLedger(path).orderStage("k1")).toBe("incerta");
  });
});
