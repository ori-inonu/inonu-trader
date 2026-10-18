import { describe, expect, test } from "bun:test";
import {
  defaultOnchainView,
  loadOnchainView,
  ONCHAIN_VIEW_KEY,
  parseOnchainView,
  patchOnchainView,
  resolveChainIndex,
  saveOnchainView,
} from "./onchain-view";

const mem = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
};

describe("onchain view model", () => {
  test("defaults: chain unset, all three wallet kinds, 7D and PnL", () => {
    expect(defaultOnchainView()).toEqual({ chainIndex: null, walletTypes: ["1", "2", "3"], timeFrame: 3, sortBy: 1 });
    expect(resolveChainIndex(defaultOnchainView(), "196")).toBe("196");
    expect(resolveChainIndex(defaultOnchainView(), null)).toBe("501");
    expect(resolveChainIndex({ ...defaultOnchainView(), chainIndex: "8453" }, "196")).toBe("8453");
  });

  test("parse is defensive field by field", () => {
    expect(parseOnchainView(null)).toEqual(defaultOnchainView());
    expect(parseOnchainView("x")).toEqual(defaultOnchainView());
    expect(parseOnchainView({ chainIndex: "196", walletTypes: ["1"], timeFrame: 5, sortBy: 4 }))
      .toEqual({ chainIndex: "196", walletTypes: ["1"], timeFrame: 5, sortBy: 4 });
    // Each bad field falls back alone.
    expect(parseOnchainView({ chainIndex: "abc", walletTypes: [], timeFrame: 9, sortBy: 0 }))
      .toEqual({ chainIndex: null, walletTypes: ["1", "2", "3"], timeFrame: 3, sortBy: 1 });
    expect(parseOnchainView({ chainIndex: "1" }).chainIndex).toBe("1");
  });

  test("wallet kinds keep only 1-3 and never end up empty", () => {
    expect(parseOnchainView({ walletTypes: ["1", "9", "2"] }).walletTypes).toEqual(["1", "2"]);
    expect(parseOnchainView({ walletTypes: ["9"] }).walletTypes).toEqual(["1", "2", "3"]);
    expect(patchOnchainView(defaultOnchainView(), { walletTypes: [] }).walletTypes).toEqual(["1", "2", "3"]);
    expect(patchOnchainView(defaultOnchainView(), { walletTypes: ["3"] }).walletTypes).toEqual(["3"]);
  });

  test("patch refuses out-of-range values without writing them", () => {
    const s = { ...defaultOnchainView(), timeFrame: 2 };
    expect(patchOnchainView(s, { timeFrame: 0 }).timeFrame).toBe(2);
    expect(patchOnchainView(s, { sortBy: 6 }).sortBy).toBe(1);
    expect(patchOnchainView(s, { chainIndex: "x" }).chainIndex).toBeNull();
  });

  test("load and save roundtrip; corrupted JSON returns defaults", () => {
    const storage = mem();
    saveOnchainView({ chainIndex: "1", walletTypes: ["2"], timeFrame: 4, sortBy: 3 }, storage);
    expect(loadOnchainView(storage)).toEqual({ chainIndex: "1", walletTypes: ["2"], timeFrame: 4, sortBy: 3 });
    expect(loadOnchainView(mem({ [ONCHAIN_VIEW_KEY]: "{bad" }))).toEqual(defaultOnchainView());
    expect(loadOnchainView(null)).toEqual(defaultOnchainView());
  });
});
