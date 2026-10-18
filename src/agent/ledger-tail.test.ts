import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, writeSync as realWriteSync } from "node:fs";
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

describe("a write that is only partly done must never count as written (RED 2 of the independent review of the v2 package)", () => {
  const half = (fd: number, buffer: Uint8Array, offset: number, length: number): number => realWriteSync(fd, buffer, offset, Math.max(1, Math.floor(length / 2)));

  test("a write that returns FEWER bytes than asked is completed until every byte is in the file, and the disk is told to flush only after the last one", () => {
    const path = join(dir, "ledger.jsonl");
    const calls: string[] = [];
    let first = true;
    const ledger = createFileAgentLedger(path, {
      writeSync: (fd, buffer, offset, length) => {
        calls.push("write");
        if (first) { first = false; return half(fd, buffer, offset, length); }
        return realWriteSync(fd, buffer, offset, length);
      },
      fsyncSync: () => void calls.push("fsync"),
    });
    ledger.append(order("k1", "enviando"));
    expect(calls).toEqual(["write", "write", "fsync"]);
    const again = createFileAgentLedger(path);
    expect(again.health()).toEqual({ ok: true });
    expect(again.orderStage("k1")).toBe("enviando");
    expect(readFileSync(path, "utf8")).toBe(`${line(order("k1", "enviando"))}
`);
  });

  test("a write that writes half and then FAILS throws, takes the half line back out of the file, and the order is not in the ledger: nothing may go out on the strength of it", () => {
    const path = join(dir, "ledger.jsonl");
    writeFileSync(path, `${line(order("k0", "preparada"))}
`);
    const before = readFileSync(path, "utf8");
    let n = 0;
    const ledger = createFileAgentLedger(path, {
      writeSync: (fd, buffer, offset, length) => {
        if (++n === 1) { half(fd, buffer, offset, length); throw new Error("disk went away"); }
        return realWriteSync(fd, buffer, offset, length);
      },
    });
    expect(() => ledger.append(order("k1", "enviando"))).toThrow("ledger_nao_gravou");
    expect(ledger.orderStage("k1")).toBeNull();
    expect(readFileSync(path, "utf8")).toBe(before);
    // the next write works and the whole file reads back
    ledger.append(order("k1", "enviando"));
    const again = createFileAgentLedger(path);
    expect(again.health()).toEqual({ ok: true });
    expect(again.orderStage("k1")).toBe("enviando");
  });

  test("a write that reports ZERO bytes is a failure, not a loop and not a success", () => {
    const path = join(dir, "ledger.jsonl");
    const ledger = createFileAgentLedger(path, { writeSync: () => 0 });
    expect(() => ledger.append(order("k1", "enviando"))).toThrow("ledger_nao_gravou");
    expect(ledger.orderStage("k1")).toBeNull();
    expect(createFileAgentLedger(path).health()).toEqual({ ok: true });
  });

  test("if the file was left with a torn tail while the process was running (a failed take-back), the next append sets that tail aside first instead of gluing a record onto it", () => {
    const path = join(dir, "ledger.jsonl");
    const ledger = createFileAgentLedger(path);
    ledger.append(order("k0", "preparada"));
    appendFileSync(path, line(order("kx", "enviando")).slice(0, 40));
    ledger.append(order("k1", "enviando"));
    const again = createFileAgentLedger(path);
    expect(again.health()).toEqual({ ok: true });
    expect(again.orderStage("k1")).toBe("enviando");
    expect(again.orderStage("kx")).toBeNull();
    expect(readdirSync(dir).filter((f) => f.includes(".torn-")).length).toBe(1);
  });

  test("the repair that puts a missing newline back is written whole too", () => {
    const path = join(dir, "ledger.jsonl");
    writeFileSync(path, `${line(order("k1", "enviando"))}`);
    let n = 0;
    const ledger = createFileAgentLedger(path, { writeSync: (fd, buffer, offset, length) => (++n === 1 ? half(fd, buffer, offset, length) : realWriteSync(fd, buffer, offset, length)) });
    expect(ledger.health()).toEqual({ ok: true });
    expect(readFileSync(path, "utf8")).toBe(`${line(order("k1", "enviando"))}
`);
  });
});
