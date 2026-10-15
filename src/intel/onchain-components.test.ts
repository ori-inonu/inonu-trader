import { describe, expect, test } from "bun:test";
import { buySellUsd, flowComponent, liquidityComponent, sentimentComponent, signalsInputs } from "./onchain-components";

describe("liquidityComponent: min(1, liquidity / P75 of the set) (V-F2-LIQ-1)", () => {
  const set = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // P75 is the 8th value: 8
  test("scales against the P75 and caps at 1", () => {
    expect(liquidityComponent(4, set)).toBe(0.5);
    expect(liquidityComponent(8, set)).toBe(1);
    expect(liquidityComponent(20, set)).toBe(1);
    expect(liquidityComponent(0, set)).toBe(0);
  });
  test("no number, no set or a useless reference is absent, never zero", () => {
    expect(liquidityComponent(null, set)).toBeNull();
    expect(liquidityComponent(5, [])).toBeNull();
    expect(liquidityComponent(5, [0, 0, 0])).toBeNull();
    expect(liquidityComponent(-1, set)).toBeNull();
  });
});

describe("flow: buy share by volume in USD (V-F2-FLUXO-1)", () => {
  test("sums by side and divides", () => {
    const { buyUsd, sellUsd } = buySellUsd([
      { side: "buy", volumeUsd: 100 },
      { side: "sell", volumeUsd: 50 },
      { side: "buy", volumeUsd: 200 },
      { side: "sell", volumeUsd: 150 },
    ]);
    expect(buyUsd).toBe(300);
    expect(sellUsd).toBe(200);
    expect(flowComponent({ buyUsd, sellUsd })).toBe(0.6);
  });
  test("no trades or no volume is absent", () => {
    expect(flowComponent(null)).toBeNull();
    expect(flowComponent({ buyUsd: 0, sellUsd: 0 })).toBeNull();
    expect(flowComponent(buySellUsd([]))).toBeNull();
  });
  test("a negative or non finite volume is ignored, not summed", () => {
    expect(buySellUsd([{ side: "buy", volumeUsd: -5 }, { side: "buy", volumeUsd: Number.NaN }, { side: "sell", volumeUsd: 10 }])).toEqual({ buyUsd: 0, sellUsd: 10 });
  });
});

describe("sentimentComponent: only for an unambiguous symbol (F2-DIG-6)", () => {
  const okx = { origin: "okx_instrument" } as const;
  test("an OKX instrument is unambiguous and the bullish ratio (a fraction from 0 to 1) is the component", () => {
    expect(sentimentComponent({ kind: okx, coverage: "coberto", bullishRatio: 0.4 })).toEqual({ value: 0.4, nulo: null });
  });
  test("a community recognised token with a single match is unambiguous", () => {
    expect(sentimentComponent({ kind: { origin: "onchain_token", communityRecognized: true, sameSymbolMatches: 1 }, coverage: "coberto", bullishRatio: 0.7 }).value).toBe(0.7);
  });
  test("an unrecognised token, an unknown mark or several tokens with the same symbol are ambiguous", () => {
    for (const kind of [
      { origin: "onchain_token", communityRecognized: false, sameSymbolMatches: 1 },
      { origin: "onchain_token", communityRecognized: null, sameSymbolMatches: 1 },
      { origin: "onchain_token", communityRecognized: true, sameSymbolMatches: 3 },
    ] as const) {
      expect(sentimentComponent({ kind, coverage: "coberto", bullishRatio: 0.9 })).toEqual({ value: null, nulo: "simbolo_ambiguo" });
    }
  });
  test("a symbol without coverage is a valid empty answer, a skipped call is not consulted", () => {
    expect(sentimentComponent({ kind: okx, coverage: "vazio", bullishRatio: null })).toEqual({ value: null, nulo: "vazio_valido" });
    expect(sentimentComponent({ kind: okx, coverage: "nao_consultado", bullishRatio: null })).toEqual({ value: null, nulo: "nao_consultado" });
  });
  test("a ratio outside 0 to 1 is out of scale, not clamped", () => {
    expect(sentimentComponent({ kind: okx, coverage: "coberto", bullishRatio: 1.5 })).toEqual({ value: null, nulo: "fora_da_escala" });
    expect(sentimentComponent({ kind: okx, coverage: "coberto", bullishRatio: null })).toEqual({ value: null, nulo: "sem_dado" });
  });
});

describe("signalsInputs: what the trail needs from the gateway's signal rows", () => {
  const row = (amountUsd: number, soldRatioPct: number | null, walletCount: number) => ({ amountUsd, soldRatioPct, walletCount, priceUsd: 2 });
  test("net unsold value, sold percents and the wallet count", () => {
    const r = signalsInputs([row(1000, 10, 3), row(3000, 50, 4)]);
    expect(r.netUnsoldUsd).toBe(900 + 1500);
    expect(r.soldPercents).toEqual([10, 50]);
    expect(r.walletCount).toBe(7);
    expect(r.used).toBe(2);
    expect(r.dropped).toBe(0);
  });
  test("rows with a missing or out of range sold ratio, or no value, are dropped and counted", () => {
    const r = signalsInputs([row(1000, 10, 3), row(500, null, 2), row(500, 120, 2), row(0, 10, 2)]);
    expect(r.used).toBe(1);
    expect(r.dropped).toBe(3);
    expect(r.netUnsoldUsd).toBe(900);
  });
  test("no usable row means no number at all", () => {
    expect(signalsInputs([])).toMatchObject({ netUnsoldUsd: null, soldPercents: [], walletCount: 0 });
    expect(signalsInputs([row(500, null, 2)]).netUnsoldUsd).toBeNull();
  });
});
