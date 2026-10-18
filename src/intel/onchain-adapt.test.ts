import { describe, expect, test } from "bun:test";
import { clusterLabelForTrail, concentrationFromGateway, scaleOf, toFraction01, toPct100 } from "./onchain-adapt";

describe("clusterLabelForTrail (F2-DIG-2, A-18)", () => {
  test("the provider's three labels become the three the trail knows", () => {
    expect(clusterLabelForTrail("Low")).toBe("baixa");
    expect(clusterLabelForTrail("Medium")).toBe("media");
    expect(clusterLabelForTrail("High")).toBe("alta");
  });
  test("case does not matter, anything else is unknown", () => {
    expect(clusterLabelForTrail("low")).toBe("baixa");
    for (const bad of ["", "Weird", "Baixa", null, undefined]) expect(clusterLabelForTrail(bad)).toBeUndefined();
  });
});

describe("concentrationFromGateway", () => {
  test("a recognised label decides, even when top10 would say something else", () => {
    // the regression of A-18: without the adapter 'Low' was ignored and 74 percent in the top 10 gave 0.26
    expect(concentrationFromGateway({ cluster: { concentration: "Low" }, risk: { top10HoldPct: 74.0083 } })).toEqual({ value: 1, via: "cluster" });
    expect(concentrationFromGateway({ cluster: { concentration: "Medium" }, risk: { top10HoldPct: 74 } })).toEqual({ value: 0.5, via: "cluster" });
    expect(concentrationFromGateway({ cluster: { concentration: "High" }, risk: { top10HoldPct: 5 } })).toEqual({ value: 0, via: "cluster" });
  });
  test("without a usable label the top 10 share (a percent from 0 to 100) is the fallback", () => {
    const r = concentrationFromGateway({ cluster: { concentration: null }, risk: { top10HoldPct: 74.0083 } });
    expect(r.via).toBe("top10");
    expect(r.value).toBeCloseTo(0.259917, 6);
    expect(concentrationFromGateway({ cluster: null, risk: { top10HoldPct: 20 } })).toEqual({ value: 0.8, via: "top10" });
  });
  test("nothing known is null, not zero", () => {
    expect(concentrationFromGateway({ cluster: null, risk: null })).toEqual({ value: null, via: null });
    expect(concentrationFromGateway({ cluster: { concentration: "Odd" }, risk: { top10HoldPct: null } })).toEqual({ value: null, via: null });
  });
});

describe("field scales (F2-MED-8)", () => {
  test("the measured ones are percent 0 to 100", () => {
    expect(scaleOf("advanced-info.top10HoldPct")).toBe("pct100");
    expect(scaleOf("advanced-info.lpBurnedPct")).toBe("pct100");
    expect(scaleOf("signals.soldRatioPct")).toBe("pct100");
  });
  test("the cluster numbers and the unmeasured risk shares are ambiguous, and so is anything unregistered", () => {
    expect(scaleOf("cluster.top100HoldingsPct")).toBe("ambigua");
    expect(scaleOf("cluster-top-holders.holdingPct")).toBe("ambigua");
    expect(scaleOf("advanced-info.devHoldPct")).toBe("ambigua");
    expect(scaleOf("something.else")).toBe("ambigua");
  });
  test("conversions respect the scale and refuse the ambiguous and the out of range", () => {
    expect(toFraction01(74, "pct100")).toBe(0.74);
    expect(toFraction01(0.44, "fracao")).toBe(0.44);
    expect(toFraction01(0.44, "ambigua")).toBeNull();
    expect(toFraction01(150, "pct100")).toBeNull();
    expect(toFraction01(-1, "fracao")).toBeNull();
    expect(toFraction01(null, "pct100")).toBeNull();
    expect(toPct100(0.44, "fracao")).toBeCloseTo(44, 10);
    expect(toPct100(74, "pct100")).toBe(74);
    expect(toPct100(1, "ambigua")).toBeNull();
    expect(toPct100(Number.NaN, "pct100")).toBeNull();
  });
});
