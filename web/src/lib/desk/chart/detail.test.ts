// The chart opens simple: candles, volume, zones and the answer of the Inonu. The expert layers are behind "Detalhes" and the stored choice of the person is
// never rewritten by the simple view. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { CHART_DETAIL_KEY, DEFAULT_DETAIL, loadDetail, parseDetail, saveDetail, SIMPLE_INDICATORS, SIMPLE_LAYERS } from "./detail";

describe("the detail choice", () => {
  test("a new person gets the simple chart", () => {
    expect(DEFAULT_DETAIL).toBe("simples");
    expect(parseDetail(null)).toBe("simples");
    expect(loadDetail(null)).toBe("simples");
  });

  test("only the exact word completo opens the full chart; anything else is the default", () => {
    expect(parseDetail("completo")).toBe("completo");
    for (const raw of ["simples", "", "Completo", "full", "1", "completo ", "null", "{}"]) expect(parseDetail(raw)).toBe("simples");
  });

  test("it is saved and read back, and a storage that throws never breaks the chart", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    saveDetail(store, "completo");
    expect(data.get(CHART_DETAIL_KEY)).toBe("completo");
    expect(loadDetail(store)).toBe("completo");
    saveDetail(store, "simples");
    expect(loadDetail(store)).toBe("simples");
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(loadDetail(broken)).toBe("simples");
    expect(() => saveDetail(broken, "completo")).not.toThrow();
    expect(() => saveDetail(null, "completo")).not.toThrow();
  });

  test("the simple chart draws the volume and no indicator of the specialist, and the zones and the answer but not the flow factors", () => {
    expect(SIMPLE_INDICATORS).toEqual(["volume"]);
    expect(SIMPLE_LAYERS).toEqual({ zones: true, flow: false, decision: true });
  });
});
