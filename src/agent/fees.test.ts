import { describe, expect, test } from "bun:test";
import { createFeeMemory, type FeeIo } from "./fees";
import type { QuoteFacts } from "./quote-facts";

const quote = (over: Partial<QuoteFacts> = {}): QuoteFacts => ({
  atMs: 1_000,
  action: "ok",
  impactPct: 0.1,
  tradeFee: 0.02,
  gasEstimate: 5000,
  slot: null,
  taxFromPct: null,
  taxToPct: null,
  fromAmountMinor: "1000000",
  toAmountMinor: "2000000",
  feeUnit: "usd",
  gasUnit: "native_minor",
  present: ["tradeFee", "gas"],
  ...over,
});

const memoryIo = (initial: unknown = null): { io: FeeIo; saved: unknown[] } => {
  const saved: unknown[] = [];
  let current = initial;
  return { saved, io: { read: () => current, write: (v) => { current = v; saved.push(v); } } };
};

describe("the last network fee quoted on each network (FEE-1)", () => {
  test("a quote with a fee gives that network an entry with the fee, the gas estimate, the hour it was read and where it came from", () => {
    const { io } = memoryIo();
    const mem = createFeeMemory(io);
    expect(mem.observe("501", quote({ atMs: 5_000, tradeFee: 0.013, gasEstimate: 5000 }), "cotacao_de_venda")).toBe(true);
    expect(mem.get("501")).toEqual({ chainIndex: "501", tradeFeeUsd: 0.013, gasEstimate: 5000, observedAtMs: 5_000, source: "cotacao_de_venda" });
    expect(mem.get("1")).toBeUndefined();
  });

  test("two networks keep two entries, and the newer quote of the same network replaces the older one while an older quote never replaces a newer one", () => {
    const { io } = memoryIo();
    const mem = createFeeMemory(io);
    mem.observe("501", quote({ atMs: 1_000, tradeFee: 0.01 }), "cotacao_de_compra");
    mem.observe("1", quote({ atMs: 2_000, tradeFee: 3.5 }), "cotacao_de_venda");
    mem.observe("501", quote({ atMs: 3_000, tradeFee: 0.02 }), "cotacao_de_fechamento");
    expect(mem.get("501")).toMatchObject({ tradeFeeUsd: 0.02, observedAtMs: 3_000, source: "cotacao_de_fechamento" });
    expect(mem.observe("501", quote({ atMs: 2_500, tradeFee: 99 }), "cotacao_de_compra")).toBe(false);
    expect(mem.get("501")).toMatchObject({ tradeFeeUsd: 0.02 });
    expect(mem.all().map((f) => f.chainIndex).sort()).toEqual(["1", "501"]);
  });

  test("a quote that carries no fee, an unreadable one, a negative one or one with no hour is not a measurement and leaves the memory as it was", () => {
    const { io, saved } = memoryIo();
    const mem = createFeeMemory(io);
    expect(mem.observe("501", quote({ tradeFee: null }), "cotacao_de_venda")).toBe(false);
    expect(mem.observe("501", quote({ tradeFee: -1 }), "cotacao_de_venda")).toBe(false);
    expect(mem.observe("501", quote({ tradeFee: Number.NaN }), "cotacao_de_venda")).toBe(false);
    expect(mem.observe("501", quote({ atMs: 0 }), "cotacao_de_venda")).toBe(false);
    expect(mem.observe("", quote(), "cotacao_de_venda")).toBe(false);
    expect(mem.all()).toEqual([]);
    expect(saved).toEqual([]);
  });

  test("the gas estimate is kept only when it is a whole non-negative number: null otherwise, never invented, and a fee of zero is a real measurement", () => {
    const { io } = memoryIo();
    const mem = createFeeMemory(io);
    mem.observe("501", quote({ gasEstimate: null, tradeFee: 0 }), "cotacao_de_compra");
    expect(mem.get("501")).toMatchObject({ tradeFeeUsd: 0, gasEstimate: null });
    mem.observe("1", quote({ atMs: 2_000, gasEstimate: 1.5 }), "cotacao_de_compra");
    expect(mem.get("1")).toMatchObject({ gasEstimate: null });
  });

  test("what was measured survives a restart: a new memory over the same storage reads it back", () => {
    const { io } = memoryIo();
    createFeeMemory(io).observe("501", quote({ atMs: 7_000, tradeFee: 0.011 }), "cotacao_de_venda");
    const again = createFeeMemory(io);
    expect(again.health()).toEqual({ ok: true });
    expect(again.get("501")).toEqual({ chainIndex: "501", tradeFeeUsd: 0.011, gasEstimate: 5000, observedAtMs: 7_000, source: "cotacao_de_venda" });
  });

  test("storage that cannot be read as the memory it should be (wrong version, a key that does not match its entry, an entry with no hour) starts empty and says so, and the next measurement still works", () => {
    for (const bad of [{ version: 2, fees: {} }, { version: 1, fees: { "501": { chainIndex: "1", tradeFeeUsd: 1, gasEstimate: null, observedAtMs: 1, source: "cotacao_de_venda" } } }, { version: 1, fees: { "501": { chainIndex: "501", tradeFeeUsd: 1, gasEstimate: null, source: "cotacao_de_venda" } } }, "text", []]) {
      const { io } = memoryIo(bad);
      const mem = createFeeMemory(io);
      expect(mem.health()).toEqual({ ok: false, reason: "taxas_ilegiveis" });
      expect(mem.all()).toEqual([]);
      expect(mem.observe("501", quote(), "cotacao_de_compra")).toBe(true);
    }
  });

  test("a write that fails costs the measurement its durability, never the answer: the entry stays in memory for this run", () => {
    const mem = createFeeMemory({ read: () => null, write: () => { throw new Error("disk"); } });
    expect(mem.observe("501", quote({ atMs: 9_000 }), "cotacao_de_venda")).toBe(true);
    expect(mem.get("501")).toMatchObject({ observedAtMs: 9_000 });
  });

  test("the age of an entry is the caller's to read from its hour: the memory never rejuvenates a measurement", () => {
    const { io } = memoryIo();
    const mem = createFeeMemory(io);
    mem.observe("501", quote({ atMs: 1_000 }), "cotacao_de_venda");
    expect(mem.ageMinutes("501", 1_000 + 5 * 60_000)).toBe(5);
    expect(mem.ageMinutes("1", 10_000)).toBeNull();
    // a clock earlier than the measurement is an unknown age, not a negative one
    expect(mem.ageMinutes("501", 500)).toBeNull();
  });
});
