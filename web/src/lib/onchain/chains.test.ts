import { describe, expect, test } from "bun:test";
import { chainChips, CHAIN_ORDER, type ApiChainLike } from "./chains";

const api = (ids: string[]): ApiChainLike[] => ids.map((chainIndex, i) => ({ chainIndex, name: `Rede ${i} ${chainIndex}` }));

describe("chainChips", () => {
  test("the ten known networks come first in the requested order", () => {
    const chips = chainChips({ apiChains: null, resourceChains: null, resourceLabel: "sinais" });
    expect(chips.slice(0, 7).map((c) => c.name)).toEqual(["X Layer", "Robinhood", "Arc", "Bitcoin", "Ethereum", "Solana", "Tron"]);
    expect(chips.slice(7, 10).map((c) => c.name)).toEqual(["Base", "BNB Chain", "SUI"]);
    expect(chips.map((c) => c.short)).toEqual(CHAIN_ORDER.map((c) => c.short));
  });

  test("API extras come after the ten known, in the API order and name", () => {
    const chips = chainChips({ apiChains: api(["1", "501", "998877"]), resourceChains: null, resourceLabel: "sinais" });
    const last = chips.at(-1)!;
    expect(last.chainIndex).toBe("998877");
    expect(last.name).toBe("Rede 2 998877");
    expect(last.short.length).toBeGreaterThanOrEqual(2);
    expect(last.short.length).toBeLessThanOrEqual(4);
    // Known networks are not duplicated.
    expect(chips.filter((c) => c.chainIndex === "1").length).toBe(1);
  });

  test("nothing is disabled before the lists answer", () => {
    const chips = chainChips({ apiChains: null, resourceChains: null, resourceLabel: "sinais" });
    expect(chips.every((c) => c.enabled && c.reason === null)).toBe(true);
  });

  test("a chain missing from the API list is disabled with the API reason", () => {
    const chips = chainChips({ apiChains: api(["1", "501"]), resourceChains: api(["1", "501"]), resourceLabel: "sinais" });
    const arc = chips.find((c) => c.chainIndex === "5042")!;
    expect(arc.enabled).toBe(false);
    expect(arc.reason).toBe("Nao listada pela API do OnchainOS");
    expect(chips.find((c) => c.chainIndex === "1")!.enabled).toBe(true);
  });

  test("a chain in the API but outside the resource list is disabled with the resource reason", () => {
    const chips = chainChips({ apiChains: api(["1", "501", "196"]), resourceChains: api(["1"]), resourceLabel: "sinais" });
    expect(chips.find((c) => c.chainIndex === "501")!.reason).toBe("Sem suporte a sinais nesta rede");
    expect(chips.find((c) => c.chainIndex === "196")!.reason).toBe("Sem suporte a sinais nesta rede");
    expect(chips.find((c) => c.chainIndex === "1")!.enabled).toBe(true);
  });

  test("an API extra outside the resource list is disabled too", () => {
    const chips = chainChips({ apiChains: api(["1", "55"]), resourceChains: api(["1"]), resourceLabel: "leaderboard" });
    const extra = chips.find((c) => c.chainIndex === "55")!;
    expect(extra.enabled).toBe(false);
    expect(extra.reason).toBe("Sem suporte a leaderboard nesta rede");
  });
});
