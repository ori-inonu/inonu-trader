import { describe, expect, test } from "bun:test";
import { positionsFromEvidence, returnsKeysBySymbol, type EvidenceBalancesLike, type EvidencePositionLike } from "./evidence";
import { analyzePortfolio } from "./portfolio";
import { runDemo } from "../portfolio-evidence/demo";

const ok = { kind: "ok", code: "ok" };
function position(key: string, symbol: string | null, valueText: string | null, extra: Partial<EvidencePositionLike> = {}): EvidencePositionLike {
  return { identity: { key }, display: { symbol }, valuation: { currency: "USD", valueText, state: ok }, included: true, state: ok, ...extra };
}
const section = (positions: EvidencePositionLike[], status = "valid"): EvidenceBalancesLike => ({ status, positions });

describe("positionsFromEvidence", () => {
  test("an included USD valued position becomes a valued position keyed by its identity, never by its symbol", () => {
    const r = positionsFromEvidence(section([position("1:contract:0xaa", "FIXA", "6"), position("1:native", "ETH", "30")]));
    expect(r.positions).toEqual([{ key: "1:contract:0xaa", valueUsd: 6 }, { key: "1:native", valueUsd: 30 }]);
    expect(r.symbols).toEqual({ "1:contract:0xaa": "FIXA", "1:native": "ETH" });
    expect(r.evidenceStatus).toBe("valid");
    expect(r.unvalued).toEqual([]);
  });

  test("a position the evidence layer left out of the net worth is unknown here, with the reason", () => {
    const r = positionsFromEvidence(section([position("1:contract:0xbad", "SCAM", "999", { included: false })]));
    expect(r.positions).toEqual([{ key: "1:contract:0xbad", valueUsd: null }]);
    expect(r.unvalued).toEqual([{ key: "1:contract:0xbad", reason: "not_included" }]);
  });

  test("a value that is missing, not in USD or not ok is unknown, never zero", () => {
    const r = positionsFromEvidence(section([
      position("1:a", "A", null),
      position("1:b", "B", "5", { valuation: { currency: null, valueText: "5", state: ok } }),
      position("1:c", "C", "7", { valuation: { currency: "USD", valueText: "7", state: { kind: "stale", code: "price_old" } } }),
    ]));
    expect(r.positions.map((p) => p.valueUsd)).toEqual([null, null, null]);
    expect(r.unvalued.map((u) => u.reason)).toEqual(["no_usd_value", "no_usd_value", "no_usd_value"]);
  });

  test("an unreadable or negative decimal is unknown with its own reason", () => {
    const r = positionsFromEvidence(section([position("1:a", "A", "12abc"), position("1:b", "B", "-3"), position("1:c", "C", "1e999")]));
    expect(r.positions.map((p) => p.valueUsd)).toEqual([null, null, null]);
    expect(r.unvalued.map((u) => u.reason)).toEqual(["value_unreadable", "value_unreadable", "value_unreadable"]);
  });

  test("a legitimate zero stays zero", () => {
    expect(positionsFromEvidence(section([position("1:a", "A", "0")])).positions).toEqual([{ key: "1:a", valueUsd: 0 }]);
  });

  test("an evidence status other than valid is carried through, so the report can be labelled", () => {
    expect(positionsFromEvidence(section([position("1:a", "A", "1")], "incomplete")).evidenceStatus).toBe("incomplete");
    expect(positionsFromEvidence({ positions: [] }).evidenceStatus).toBeNull();
  });

  test("works on the offline synthetic demo of the evidence layer and reports what it is", () => {
    const scenarios = runDemo();
    const balances = scenarios.map((s) => s.evidence.balances).find((b) => b !== null && b.positions.length > 0);
    expect(balances).toBeDefined();
    const r = positionsFromEvidence(balances as unknown as EvidenceBalancesLike);
    expect(r.positions.length).toBe(balances!.positions.length);
    for (const p of r.positions) expect(p.valueUsd === null || (Number.isFinite(p.valueUsd) && p.valueUsd >= 0)).toBe(true);
  });
});

describe("returnsKeysBySymbol", () => {
  const symbols = { "1:native": "ETH", "1:contract:0xaa": "USDC", "56:contract:0xbb": "USDC", "1:contract:0xcc": null, "1:contract:0xdd": "OBSCURE" };
  const available = new Set(["ETH", "USDC", "BTC"]);

  test("maps a symbol to a capture only when exactly one position carries it", () => {
    const m = returnsKeysBySymbol(symbols, available);
    expect(m["1:native"]).toBe("ETH");
    expect(m["1:contract:0xaa"]).toBeNull();
    expect(m["56:contract:0xbb"]).toBeNull();
  });

  test("unknown symbols and symbols without a capture map to null", () => {
    const m = returnsKeysBySymbol(symbols, available);
    expect(m["1:contract:0xcc"]).toBeNull();
    expect(m["1:contract:0xdd"]).toBeNull();
  });

  test("matches case-insensitively", () => {
    expect(returnsKeysBySymbol({ "1:native": "eth" }, available)["1:native"]).toBe("ETH");
  });

  test("an eligibility rule keeps a contract that merely shares a ticker from borrowing the real asset's risk", () => {
    const sym = { "1:native": "ETH", "1:contract:0xfake": "BTC" };
    const nativeOnly = returnsKeysBySymbol(sym, available, { eligible: (key) => key.endsWith(":native") });
    expect(nativeOnly["1:native"]).toBe("ETH");
    expect(nativeOnly["1:contract:0xfake"]).toBeNull();
    // without the rule the unique ticker would have matched
    expect(returnsKeysBySymbol(sym, available)["1:contract:0xfake"]).toBe("BTC");
  });

  test("an explicit mapping from the user wins over uniqueness and eligibility, but only to a capture that exists", () => {
    const sym = { "1:contract:0xaa": "USDC", "56:contract:0xbb": "USDC", "1:contract:0xcc": "WRAPPED" };
    const m = returnsKeysBySymbol(sym, available, { eligible: () => false, explicit: { "1:contract:0xaa": "eth", "1:contract:0xcc": "NOCAPTURE" } });
    expect(m["1:contract:0xaa"]).toBe("ETH");
    expect(m["56:contract:0xbb"]).toBeNull();
    expect(m["1:contract:0xcc"]).toBeNull();
  });
});

describe("feeding the portfolio analysis", () => {
  test("positions from evidence flow into the risk, and what has no returns is named", () => {
    const r = positionsFromEvidence(section([position("1:native", "ETH", "6000"), position("1:contract:0xaa", "FIXA", "4000")]));
    const returns = Array.from({ length: 200 }, (_, t) => 0.001 * Math.sin(t / 3));
    const analysis = analyzePortfolio({ positions: r.positions, returns: [{ key: "1:native", returns }], barMs: 900_000 });
    if (analysis.risk.status !== "ok") throw new Error("expected risk");
    expect(analysis.risk.excluded).toEqual([{ key: "1:contract:0xaa", reason: "no_returns" }]);
    expect(analysis.risk.riskedShare).toBeCloseTo(0.6, 12);
  });
});
