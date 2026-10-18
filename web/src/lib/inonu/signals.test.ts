// ASK-8, AC-ASK-4: the person chooses which signals the chart shows (the Inonu answer, the zones, the flow, the tracked wallets)
// and, for the wallets, the parameters the provider offers (type, minimum value, minimum addresses). It persists on this
// machine, and anything that is not exactly the expected shape falls back to the defaults field by field.
import { describe, expect, test } from "bun:test";
import { DEFAULT_SIGNALS, SIGNALS_KEY, filterWalletMarks, loadSignals, parseSignals, saveSignals, type SignalFilters } from "./signals";

const mark = (walletType: "smart_money" | "kol" | "whale", count: number, amountUsd: number) => ({ tsMs: 1, walletType, count, amountUsd, soldPct: null });

class Store {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("defaults", () => {
  test("every signal is on, every wallet type is on, and there is no minimum", () => {
    expect(DEFAULT_SIGNALS).toEqual({ inonu: true, zonas: true, fluxo: true, carteiras: true, tipos: ["smart_money", "kol", "whale"], minUsd: 0, minEnderecos: 1 });
  });
});

describe("parseSignals", () => {
  test("a good payload is read as it is", () => {
    const good: SignalFilters = { inonu: false, zonas: true, fluxo: false, carteiras: true, tipos: ["whale"], minUsd: 10_000, minEnderecos: 3 };
    expect(parseSignals(good)).toEqual(good);
  });

  test("anything else falls back to the defaults, field by field", () => {
    expect(parseSignals(null)).toEqual(DEFAULT_SIGNALS);
    expect(parseSignals("x")).toEqual(DEFAULT_SIGNALS);
    expect(parseSignals([])).toEqual(DEFAULT_SIGNALS);
    const mixed = parseSignals({ inonu: "yes", zonas: false, fluxo: 1, carteiras: false, tipos: ["whale", "dragon", 4], minUsd: -5, minEnderecos: 2.5 });
    expect(mixed).toEqual({ ...DEFAULT_SIGNALS, zonas: false, carteiras: false, tipos: ["whale"] });
  });

  test("a type list without any known type falls back to all of them, and duplicates collapse", () => {
    expect(parseSignals({ tipos: ["x"] }).tipos).toEqual(["smart_money", "kol", "whale"]);
    expect(parseSignals({ tipos: ["kol", "kol", "whale"] }).tipos).toEqual(["kol", "whale"]);
  });

  test("an empty type list is a choice (no wallet type), not a missing field", () => {
    expect(parseSignals({ tipos: [] }).tipos).toEqual([]);
  });

  test("minimums are whole, finite and bounded", () => {
    expect(parseSignals({ minUsd: Number.POSITIVE_INFINITY }).minUsd).toBe(0);
    expect(parseSignals({ minUsd: 1e15 }).minUsd).toBe(0);
    expect(parseSignals({ minEnderecos: 0 }).minEnderecos).toBe(1);
    expect(parseSignals({ minEnderecos: 500 }).minEnderecos).toBe(1);
  });
});

describe("storage", () => {
  test("saves under its own key and reads back", () => {
    const store = new Store();
    const next: SignalFilters = { ...DEFAULT_SIGNALS, zonas: false, minUsd: 1_000 };
    saveSignals(store, next);
    expect(store.data.has(SIGNALS_KEY)).toBe(true);
    expect(loadSignals(store)).toEqual(next);
  });

  test("no storage, a throwing storage or broken JSON never breaks the screen", () => {
    expect(loadSignals(null)).toEqual(DEFAULT_SIGNALS);
    const broken = new Store();
    broken.data.set(SIGNALS_KEY, "{not json");
    expect(loadSignals(broken)).toEqual(DEFAULT_SIGNALS);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadSignals(throwing)).toEqual(DEFAULT_SIGNALS);
    expect(() => saveSignals(throwing, DEFAULT_SIGNALS)).not.toThrow();
    expect(() => saveSignals(null, DEFAULT_SIGNALS)).not.toThrow();
  });
});

describe("filterWalletMarks", () => {
  const marks = new Map<number, ReturnType<typeof mark>[]>([
    [3, [mark("smart_money", 4, 25_000), mark("kol", 1, 800)]],
    [7, [mark("whale", 2, 150_000)]],
    [9, [mark("kol", 1, 90_000)]],
  ]);

  test("with the defaults every mark passes and the map is the same content", () => {
    const out = filterWalletMarks(marks, DEFAULT_SIGNALS);
    expect([...out.keys()]).toEqual([3, 7, 9]);
    expect(out.get(3)).toHaveLength(2);
  });

  test("the wallet switch off removes everything", () => {
    expect(filterWalletMarks(marks, { ...DEFAULT_SIGNALS, carteiras: false }).size).toBe(0);
  });

  test("type, minimum value and minimum addresses each narrow the marks, and an emptied candle is dropped", () => {
    expect([...filterWalletMarks(marks, { ...DEFAULT_SIGNALS, tipos: ["whale"] }).keys()]).toEqual([7]);
    expect([...filterWalletMarks(marks, { ...DEFAULT_SIGNALS, minUsd: 100_000 }).keys()]).toEqual([7]);
    expect([...filterWalletMarks(marks, { ...DEFAULT_SIGNALS, minEnderecos: 2 }).keys()]).toEqual([3, 7]);
    const both = filterWalletMarks(marks, { ...DEFAULT_SIGNALS, minUsd: 20_000, minEnderecos: 2 });
    expect(both.get(3)).toEqual([mark("smart_money", 4, 25_000)]);
    expect(both.has(9)).toBe(false);
  });

  test("a value the provider did not give is not invented: a mark with a null amount fails a minimum value", () => {
    const unknown = new Map([[1, [{ tsMs: 1, walletType: "kol" as const, count: 1, amountUsd: Number.NaN, soldPct: null }]]]);
    expect(filterWalletMarks(unknown, { ...DEFAULT_SIGNALS, minUsd: 1_000 }).size).toBe(0);
    expect(filterWalletMarks(unknown, DEFAULT_SIGNALS).size).toBe(1);
  });
});
