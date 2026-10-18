import { describe, expect, test } from "bun:test";
import { smcChips, SMC_CHIPS_TITLE } from "./smc-chips";
import type { SmcContext } from "./smc";

const empty: SmcContext = {
  demandBlockBps: null,
  supplyBlockBps: null,
  gapsUp: 0,
  gapsDown: 0,
  gapNearestBps: null,
  lastBreak: null,
  rangePos: null,
  rangeState: null,
  poolAboveBps: null,
  poolBelowBps: null,
  lastSweep: null,
};

const ctx = (patch: Partial<SmcContext>): SmcContext => ({ ...empty, ...patch });
const chip = (c: SmcContext, id: string) => smcChips(c, "15m").find((x) => x.id === id);

describe("smcChips", () => {
  test("an empty context produces no chips", () => {
    expect(smcChips(empty, "1m")).toEqual([]);
  });

  test("every chip title carries the fixed group prefix", () => {
    const full = ctx({
      rangePos: 0.5, rangeState: "inside", demandBlockBps: 8, supplyBlockBps: 12,
      gapsUp: 2, gapsDown: 1,
      lastBreak: { kind: "BOS", dir: "up", ageBars: 4 },
      lastSweep: { kind: "highs", ageBars: 3 },
      poolAboveBps: 21, poolBelowBps: 40,
    });
    for (const c of smcChips(full, "1m")) expect(c.title.startsWith(SMC_CHIPS_TITLE)).toBe(true);
    expect(smcChips(full, "1m").map((c) => c.id)).toEqual([
      "position", "demand", "supply", "gapsUp", "gapsDown", "lastBreak", "lastSweep", "poolAbove", "poolBelow",
    ]);
  });

  test("position: discount, premium, equilibrium and out of range", () => {
    expect(chip(ctx({ rangePos: 0.34, rangeState: "inside" }), "position")?.text).toBe("Desconto 34%");
    expect(chip(ctx({ rangePos: 0.71, rangeState: "inside" }), "position")?.text).toBe("Premium 71%");
    expect(chip(ctx({ rangePos: 0.5, rangeState: "inside" }), "position")?.text).toBe("Equilibrio 50%");
    expect(chip(ctx({ rangePos: 1, rangeState: "above" }), "position")?.text).toBe("Fora da faixa, acima");
    expect(chip(ctx({ rangePos: 0, rangeState: "below" }), "position")?.text).toBe("Fora da faixa, abaixo");
    expect(chip(ctx({ rangePos: null, rangeState: null }), "position")).toBeUndefined();
  });

  test("position boundaries: 0.45 and 0.55 are equilibrium", () => {
    expect(chip(ctx({ rangePos: 0.45, rangeState: "inside" }), "position")?.text).toBe("Equilibrio 45%");
    expect(chip(ctx({ rangePos: 0.55, rangeState: "inside" }), "position")?.text).toBe("Equilibrio 55%");
  });

  test("demand and supply chips", () => {
    expect(chip(ctx({ demandBlockBps: 0 }), "demand")?.text).toBe("Dentro da demanda");
    expect(chip(ctx({ demandBlockBps: 8.4 }), "demand")?.text).toBe("Demanda a 8 bps abaixo");
    expect(chip(ctx({ supplyBlockBps: 0 }), "supply")?.text).toBe("Dentro da oferta");
    expect(chip(ctx({ supplyBlockBps: 12.2 }), "supply")?.text).toBe("Oferta a 12 bps acima");
    expect(chip(empty, "demand")).toBeUndefined();
    expect(chip(empty, "supply")).toBeUndefined();
  });

  test("gap chips singular and counted", () => {
    expect(chip(ctx({ gapsUp: 1 }), "gapsUp")?.text).toBe("FVG de alta aberto");
    expect(chip(ctx({ gapsUp: 3 }), "gapsUp")?.text).toBe("FVG de alta aberto (3)");
    expect(chip(ctx({ gapsDown: 1 }), "gapsDown")?.text).toBe("FVG de baixa aberto");
    expect(chip(ctx({ gapsDown: 2 }), "gapsDown")?.text).toBe("FVG de baixa aberto (2)");
  });

  test("last break: plural, singular and now", () => {
    expect(chip(ctx({ lastBreak: { kind: "BOS", dir: "up", ageBars: 4 } }), "lastBreak")?.text).toBe("BOS de alta ha 4 barras");
    expect(chip(ctx({ lastBreak: { kind: "CHoCH", dir: "down", ageBars: 1 } }), "lastBreak")?.text).toBe("CHoCH de baixa ha 1 barra");
    expect(chip(ctx({ lastBreak: { kind: "CHoCH", dir: "down", ageBars: 0 } }), "lastBreak")?.text).toBe("CHoCH de baixa agora");
    expect(chip(empty, "lastBreak")).toBeUndefined();
  });

  test("last sweep: tops and bottoms, singular and now", () => {
    expect(chip(ctx({ lastSweep: { kind: "highs", ageBars: 3 } }), "lastSweep")?.text).toBe("Varredura de topos ha 3 barras");
    expect(chip(ctx({ lastSweep: { kind: "lows", ageBars: 2 } }), "lastSweep")?.text).toBe("Varredura de fundos ha 2 barras");
    expect(chip(ctx({ lastSweep: { kind: "lows", ageBars: 1 } }), "lastSweep")?.text).toBe("Varredura de fundos ha 1 barra");
    expect(chip(ctx({ lastSweep: { kind: "highs", ageBars: 0 } }), "lastSweep")?.text).toBe("Varredura de topos agora");
    expect(chip(empty, "lastSweep")).toBeUndefined();
  });

  test("liquidity chips", () => {
    expect(chip(ctx({ poolAboveBps: 21.4 }), "poolAbove")?.text).toBe("Liquidez acima a 21 bps");
    expect(chip(ctx({ poolBelowBps: 40.2 }), "poolBelow")?.text).toBe("Liquidez abaixo a 40 bps");
    expect(chip(empty, "poolAbove")).toBeUndefined();
  });

  test("tones are only neutral, buy or sell and follow direction", () => {
    const full = ctx({
      rangePos: 0.3, rangeState: "inside", demandBlockBps: 8, supplyBlockBps: 12,
      gapsUp: 2, gapsDown: 1,
      lastBreak: { kind: "BOS", dir: "down", ageBars: 4 },
      lastSweep: { kind: "lows", ageBars: 3 },
      poolAboveBps: 21, poolBelowBps: 40,
    });
    for (const c of smcChips(full, "1m")) expect(["neutral", "buy", "sell"]).toContain(c.tone);
    expect(chip(full, "lastBreak")?.tone).toBe("sell");
    expect(chip(full, "demand")?.tone).toBe("buy");
    expect(chip(ctx({ lastSweep: { kind: "highs", ageBars: 2 } }), "lastSweep")?.tone).toBe("sell");
    expect(chip(ctx({ lastSweep: { kind: "lows", ageBars: 2 } }), "lastSweep")?.tone).toBe("buy");
    expect(chip(ctx({ rangePos: 0.5, rangeState: "inside" }), "position")?.tone).toBe("neutral");
  });
});
