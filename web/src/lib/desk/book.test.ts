import { describe, expect, test } from "bun:test";
import {
  BOOK_DEPTH_CAP,
  applyBooks5Message,
  applyBooksMessage,
  bookChecksum,
  bookLevelCap,
  checksumInput,
  crc32,
  type BookEntry,
  type BookState,
} from "./book";

/** Independent bit by bit CRC32 (no table), returned as a signed 32 bit integer like OKX. */
function slowCrc32(text: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i);
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) | 0;
}

type Lvl = [string, string, string, string];
const lvl = (px: string, sz: string, orders = "1"): Lvl => [px, sz, "0", orders];

function row(bids: Lvl[], asks: Lvl[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { bids, asks, ts: "1791741601408", seqId: 100, prevSeqId: -1, checksum: 0, ...extra };
}

function entries(pairs: [string, string][]): { pxText: string; szText: string }[] {
  return pairs.map(([pxText, szText]) => ({ pxText, szText }));
}

function snapshotOf(bids: Lvl[], asks: Lvl[], extra: Record<string, unknown> = {}): BookState {
  const step = applyBooksMessage(null, "T-USDT", "snapshot", row(bids, asks, extra));
  if (!step.ok) throw new Error(`snapshot failed: ${step.detail}`);
  return step.book;
}

describe("crc32", () => {
  test("matches the standard check value and an independent implementation", () => {
    expect(crc32("123456789")).toBe(-873187034); // 0xCBF43926
    expect(crc32("")).toBe(0);
    for (const text of ["a", "3366.1:7:3366.8:9", "0.0270:1200:0.02701:64388", "x".repeat(500)]) {
      expect(crc32(text)).toBe(slowCrc32(text));
      expect(crc32(text)).toBe(Bun.hash.crc32(text) | 0);
    }
  });
});

describe("OKX checksum string", () => {
  test("interleaves bid and ask levels and cross checks against zlib vectors", () => {
    const bids = entries([["3366.1", "7"], ["3366", "6"]]);
    const asks = entries([["3366.8", "9"], ["3368", "8"]]);
    expect(checksumInput(bids, asks)).toBe("3366.1:7:3366.8:9:3366:6:3368:8");
    // Vector computed with Python zlib.crc32 on the string above, converted to signed 32 bit.
    expect(bookChecksum(bids, asks)).toBe(-1881014294);
    expect(bookChecksum(bids, asks)).toBe(slowCrc32("3366.1:7:3366.8:9:3366:6:3368:8"));
  });

  test("when one side is shorter the other side simply continues", () => {
    const bids = entries([["100", "1"], ["99.5", "3"], ["99", "5"]]);
    const asks = entries([["101", "2"]]);
    expect(checksumInput(bids, asks)).toBe("100:1:101:2:99.5:3:99:5");
    expect(bookChecksum(bids, asks)).toBe(328326950);
  });

  test("uses only the first 25 levels of each side", () => {
    const bids = Array.from({ length: 30 }, (_, i) => ({ pxText: String(1000 - i), szText: String(i + 1) }));
    const asks = Array.from({ length: 30 }, (_, i) => ({ pxText: String(1001 + i), szText: `${i + 1}.5` }));
    const text = checksumInput(bids, asks);
    expect(text.split(":")).toHaveLength(100);
    expect(text.startsWith("1000:1:1001:1.5:999:2:1002:2.5")).toBe(true);
    expect(bookChecksum(bids, asks)).toBe(-1777120193);
  });

  test("keeps the strings exactly as received, trailing zeros included", () => {
    expect(bookChecksum(entries([["0.50", "1"]]), entries([["0.51", "2"]]))).toBe(1124187035);
    expect(bookChecksum(entries([["0.5", "1"]]), entries([["0.51", "2"]]))).toBe(-1106354064);
  });

  test("an empty book hashes the empty string", () => {
    expect(bookChecksum([], [])).toBe(0);
  });
});

describe("books snapshot and updates", () => {
  test("a snapshot is sorted, parsed and keeps the raw text", () => {
    const book = snapshotOf(
      [lvl("0.0269", "5"), lvl("0.02700", "1200", "3"), lvl("0.0268", "7")],
      [lvl("0.0272", "9"), lvl("0.02710", "4")],
    );
    expect(book.bids.map((l) => l.px)).toEqual([0.027, 0.0269, 0.0268]);
    expect(book.asks.map((l) => l.px)).toEqual([0.0271, 0.0272]);
    expect(book.bids[0]).toEqual({ px: 0.027, sz: 1200, orders: 3, pxText: "0.02700", szText: "1200" });
    expect(book.seqId).toBe(100);
    expect(book.tsMs).toBe(1791741601408);
    expect(book.channel).toBe("books");
  });

  test("an update replaces a size, adds a level and a size of 0 deletes the level", () => {
    const snap = snapshotOf([lvl("10", "1"), lvl("9", "2"), lvl("8", "3")], [lvl("11", "1"), lvl("12", "2")]);
    const step = applyBooksMessage(
      snap,
      "T-USDT",
      "update",
      row([lvl("10", "0"), lvl("9", "5"), lvl("9.5", "4")], [lvl("11", "6"), lvl("13", "1"), lvl("12", "0")], { seqId: 101, prevSeqId: 100 }),
    );
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    expect(step.book.bids.map((l) => [l.px, l.sz])).toEqual([[9.5, 4], [9, 5], [8, 3]]);
    expect(step.book.asks.map((l) => [l.px, l.sz])).toEqual([[11, 6], [13, 1]]);
    expect(step.book.seqId).toBe(101);
    // The previous book is untouched.
    expect(snap.bids.map((l) => l.px)).toEqual([10, 9, 8]);
  });

  test("deleting a level that is not there is harmless", () => {
    const snap = snapshotOf([lvl("10", "1")], [lvl("11", "1")]);
    const step = applyBooksMessage(snap, "T-USDT", "update", row([lvl("9", "0")], [], { seqId: 101, prevSeqId: 100 }));
    expect(step.ok).toBe(true);
    if (step.ok) expect(step.book.bids).toHaveLength(1);
  });

  test("keeps the best 400 levels per side", () => {
    const bids = Array.from({ length: 450 }, (_, i) => lvl(String(1000 - i), "1"));
    const asks = Array.from({ length: 450 }, (_, i) => lvl(String(1001 + i), "1"));
    const book = snapshotOf(bids, asks);
    expect(book.bids).toHaveLength(BOOK_DEPTH_CAP);
    expect(book.asks).toHaveLength(BOOK_DEPTH_CAP);
    expect(book.bids[0]?.px).toBe(1000);
    expect(book.bids[BOOK_DEPTH_CAP - 1]?.px).toBe(601);
    const step = applyBooksMessage(book, "T-USDT", "update", row([lvl("1000.5", "2")], [], { seqId: 101, prevSeqId: 100 }));
    expect(step.ok && step.book.bids).toHaveLength(BOOK_DEPTH_CAP);
    expect(step.ok && step.book.bids[BOOK_DEPTH_CAP - 1]?.px).toBe(602);
  });

  test("level cap by channel", () => {
    expect(bookLevelCap(snapshotOf([lvl("1", "1")], [lvl("2", "1")]))).toBe(400);
    const five = applyBooks5Message("T-USDT", row([lvl("1", "1")], [lvl("2", "1")]));
    expect(five.ok && bookLevelCap(five.book)).toBe(5);
  });
});

describe("sequence integrity", () => {
  test("an update must chain to the previous seqId", () => {
    const snap = snapshotOf([lvl("10", "1")], [lvl("11", "1")]);
    const ok = applyBooksMessage(snap, "T-USDT", "update", row([], [], { seqId: 105, prevSeqId: 100 }));
    expect(ok.ok).toBe(true);
    const gap = applyBooksMessage(snap, "T-USDT", "update", row([], [], { seqId: 120, prevSeqId: 110 }));
    expect(gap).toMatchObject({ ok: false, reason: "sequence" });
  });

  test("a heartbeat update with an unchanged seqId chains", () => {
    const snap = snapshotOf([lvl("10", "1")], [lvl("11", "1")]);
    const beat = applyBooksMessage(snap, "T-USDT", "update", row([], [], { seqId: 100, prevSeqId: 100 }));
    expect(beat.ok).toBe(true);
  });

  test("a sequence reset (seqId below prevSeqId) and an update without a snapshot both ask for a resync", () => {
    const snap = snapshotOf([lvl("10", "1")], [lvl("11", "1")]);
    expect(applyBooksMessage(snap, "T-USDT", "update", row([], [], { seqId: 5, prevSeqId: 100 }))).toMatchObject({ ok: false, reason: "sequence" });
    expect(applyBooksMessage(null, "T-USDT", "update", row([], [], { seqId: 101, prevSeqId: 100 }))).toMatchObject({ ok: false, reason: "sequence" });
  });

  test("a zero checksum (keyless connections) is unverified and the book says so", () => {
    const snap = snapshotOf([lvl("10", "1")], [lvl("11", "1")], { checksum: 0 });
    expect(snap.checksumOk).toBeNull();
    expect(snap.integrity).toBe("sequence");
    const step = applyBooksMessage(snap, "T-USDT", "update", row([lvl("10", "2")], [], { seqId: 101, prevSeqId: 100, checksum: 0 }));
    expect(step.ok && step.verified).toBe("sequence");
    expect(step.ok && step.book.checksumOk).toBeNull();
  });
});

describe("checksum integrity", () => {
  const bids: Lvl[] = [lvl("3366.1", "7"), lvl("3366", "6")];
  const asks: Lvl[] = [lvl("3366.8", "9"), lvl("3368", "8")];

  test("a correct checksum on a snapshot verifies it", () => {
    const snap = snapshotOf(bids, asks, { checksum: -1881014294 });
    expect(snap.checksumOk).toBe(true);
    expect(snap.integrity).toBe("checksum");
    expect(snap.checksumSeen).toBe(true);
  });

  test("an unsigned value of the same 32 bits is accepted", () => {
    const snap = snapshotOf(bids, asks, { checksum: -1881014294 + 2 ** 32 });
    expect(snap.checksumOk).toBe(true);
  });

  test("a wrong checksum fails with a suspect book flagged false", () => {
    const step = applyBooksMessage(null, "T-USDT", "snapshot", row(bids, asks, { checksum: 123456 }));
    expect(step.ok).toBe(false);
    if (step.ok) return;
    expect(step.reason).toBe("checksum");
    expect(step.suspect?.checksumOk).toBe(false);
  });

  test("an update is verified against the merged book", () => {
    const snap = snapshotOf(bids, asks, { checksum: -1881014294 });
    // After the update the book is 3366.1:7 / 3366.8:9 / 3366:6 / 3368:8 -> 3366:9 on the bid side.
    const merged = bookChecksum(entries([["3366.1", "7"], ["3366", "9"]]), entries([["3366.8", "9"], ["3368", "8"]]));
    const good = applyBooksMessage(snap, "T-USDT", "update", row([lvl("3366", "9")], [], { seqId: 101, prevSeqId: 100, checksum: merged }));
    expect(good.ok && good.book.checksumOk).toBe(true);
    const bad = applyBooksMessage(snap, "T-USDT", "update", row([lvl("3366", "9")], [], { seqId: 101, prevSeqId: 100, checksum: merged + 1 }));
    expect(bad).toMatchObject({ ok: false, reason: "checksum" });
  });

  test("once a real checksum was seen, a later zero is a value to verify, not a missing checksum", () => {
    const snap = snapshotOf(bids, asks, { checksum: -1881014294 });
    const step = applyBooksMessage(snap, "T-USDT", "update", row([], [], { seqId: 101, prevSeqId: 100, checksum: 0 }));
    expect(step).toMatchObject({ ok: false, reason: "checksum" });
  });
});

describe("malformed input", () => {
  test("rejects rows that are not strict", () => {
    const bad: unknown[] = [
      null,
      "x",
      row([["abc", "1", "0", "1"]], []),
      row([["10", "-1", "0", "1"]], []),
      row([["10", "", "0", "1"]], []),
      row([["10", "1", "0", "x"]], []),
      row([["10"]] as unknown as Lvl[], []),
      row([], [], { ts: "soon" }),
      row([], [], { checksum: "7" }),
      row([], [], { seqId: "100" }),
      { asks: [], ts: "1" },
    ];
    for (const value of bad) {
      expect(applyBooksMessage(null, "T-USDT", "snapshot", value)).toMatchObject({ ok: false, reason: "malformed" });
    }
  });

  test("a message without seqId cannot be chained", () => {
    const { seqId: _omit, ...withoutSeq } = row([], []);
    expect(applyBooksMessage(null, "T-USDT", "snapshot", withoutSeq)).toMatchObject({ ok: false, reason: "malformed" });
  });
});

describe("books5", () => {
  test("a full snapshot of five levels with nothing to verify", () => {
    const step = applyBooks5Message(
      "MON-USDT",
      { asks: [lvl("0.02706", "9"), lvl("0.02705", "8"), lvl("0.02704", "7")], bids: [lvl("0.02702", "1"), lvl("0.02701", "2")], ts: "1791742106108", seqId: 487280685 },
    );
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    const book = step.book;
    expect(book.channel).toBe("books5");
    expect(book.checksumOk).toBeNull();
    expect(book.integrity).toBe("snapshot");
    expect(book.asks.map((l) => l.px)).toEqual([0.02704, 0.02705, 0.02706]);
    expect(book.seqId).toBe(487280685);
    expect(applyBooks5Message("X", { bids: [["1", "x"]], asks: [], ts: "1" })).toMatchObject({ ok: false, reason: "malformed" });
  });

  test("types are consistent with DeskBook", () => {
    const entry: BookEntry = { px: 1, sz: 1, orders: 0, pxText: "1", szText: "1" };
    expect(entry.pxText).toBe("1");
  });
});
