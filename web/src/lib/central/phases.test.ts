import { describe, expect, test } from "bun:test";
import {
  PHASE_IDS,
  PHASE_PARAMETERS,
  PHASE_PROMOTION_CRITERIA,
  PHASE_REFERENCE_SIGMAS,
  buildPhaseTable,
  computePhaseProfile,
  computePhaseProfiles,
  type PhaseProfile,
  type PhaseTableRow,
} from "./phases";

// Source: docs/research/R3-estrategias-e-alavancagem.md section 6 (envelope de politica recomendado) and
// docs/ARQUITETURA-CENTRAL-DE-OPERACOES.md section 5. The values are computed for a capital the user types.

const absClose = (actual: number, expected: number, tolerance = 1e-9) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

function profile(capital: number, sigma: number, phase: 0 | 1 | 2): PhaseProfile {
  return computePhaseProfile(capital, sigma, phase);
}

describe("phase parameters (R3 section 6)", () => {
  test("lists exactly the phases 0, 1 and 2", () => {
    expect([...PHASE_IDS]).toEqual([0, 1, 2]);
    expect(computePhaseProfiles(100, 0.04).map((entry) => entry.phase)).toEqual([0, 1, 2]);
  });

  test("keeps the stop and cap parameters named and verifiable", () => {
    expect(PHASE_PARAMETERS.dailyStopFraction).toBe(0.02);
    expect(PHASE_PARAMETERS.weeklyStopFraction).toBe(0.05);
    expect(PHASE_PARAMETERS.drawdownStopFraction).toBe(0.1);
    expect(PHASE_PARAMETERS.maxExposureCap).toBe(0.25);
    expect(PHASE_PARAMETERS.sessionCostCapFraction).toBe(0.01);
    expect(PHASE_PARAMETERS.orderCapFraction).toEqual({ 1: 0.1, 2: 0.05 });
    expect(PHASE_PARAMETERS.architectureOrderCapFraction).toEqual({ 1: 0.01, 2: 0.02 });
    expect(PHASE_PARAMETERS.phase2LeverageCap).toBe(2);
    expect(PHASE_PARAMETERS.kellyFractionCap).toBe(0.25);
    expect(PHASE_PARAMETERS.totalNotionalMultiple).toBe(2);
    expect(PHASE_PARAMETERS.operationalCapitalShareCap).toBe(0.25);
    expect(PHASE_PARAMETERS.liquidationFloorMin).toBe(0.35);
  });

  test("reference sigmas are the R3 section 6 values", () => {
    expect(PHASE_REFERENCE_SIGMAS).toEqual([
      { id: "BTC", label: "BTC", sigma: 0.0196 },
      { id: "ETH", label: "ETH", sigma: 0.0246 },
      { id: "SOL", label: "SOL", sigma: 0.0325 },
      { id: "MON", label: "MON", sigma: 0.0667 },
    ]);
  });
});

describe("phase 0: paper and read only", () => {
  test("no leverage, no exposed capital and nothing else applies", () => {
    const p = profile(100, 0.0667, 0);
    expect(p.maxLeverage).toBe(0);
    expect(p.exposedCapitalUsd).toBe(0);
    expect(p.orderCapUsd).toBeNull();
    expect(p.architectureOrderCapUsd).toBeNull();
    expect(p.assetPosition).toBeNull();
    expect(p.dailyStopUsd).toBeNull();
    expect(p.weeklyStopUsd).toBeNull();
    expect(p.drawdownStopUsd).toBeNull();
    expect(p.sessionCostCapUsd).toBeNull();
    expect(p.liquidationFloor).toBeNull();
    expect(p.totalNotionalCapUsd).toBeNull();
  });
});

describe("phase 1: micro-live spot, only with explicit authorization", () => {
  test("values for a capital of US$ 100 and sigma of MON (6.67%)", () => {
    const p = profile(100, 0.0667, 1);
    expect(p.maxLeverage).toBe(1);
    expect(p.exposedCapitalUsd).toBe(100);
    absClose(p.orderCapUsd as number, 10);
    absClose(p.architectureOrderCapUsd as number, 1);
    absClose(p.dailyStopUsd as number, 2);
    absClose(p.weeklyStopUsd as number, 5);
    absClose(p.drawdownStopUsd as number, 10);
    absClose(p.sessionCostCapUsd as number, 1);
    expect(p.liquidationFloor).toBeNull();
    expect(p.totalNotionalCapUsd).toBeNull();
    const position = p.assetPosition!;
    absClose(position.fraction, 0.02 / (2 * 0.0667), 1e-12);
    expect(position.limitedBy).toBe("volatility");
    absClose(position.uncappedFraction, 0.02 / (2 * 0.0667), 1e-12);
    absClose(position.usd, 100 * position.fraction, 1e-9);
    // R3: MON 15%.
    absClose(position.fraction, 0.15, 0.001);
  });

  test("BTC, ETH and SOL are limited by the 25% cap, as in R3", () => {
    for (const sigma of [0.0196, 0.0246, 0.0325]) {
      const position = profile(100, sigma, 1).assetPosition!;
      expect(position.fraction).toBe(0.25);
      expect(position.limitedBy).toBe("cap");
      expect(position.uncappedFraction).toBeGreaterThan(0.25);
      absClose(position.usd, 25);
    }
  });

  test("everything that is a fraction of capital scales linearly with the capital", () => {
    const small = profile(100, 0.0667, 1);
    const large = profile(2500, 0.0667, 1);
    for (const key of ["orderCapUsd", "architectureOrderCapUsd", "dailyStopUsd", "weeklyStopUsd", "drawdownStopUsd", "sessionCostCapUsd", "exposedCapitalUsd"] as const) {
      absClose(large[key] as number, (small[key] as number) * 25, 1e-9);
    }
    absClose(large.assetPosition!.usd, small.assetPosition!.usd * 25, 1e-9);
    expect(large.assetPosition!.fraction).toBe(small.assetPosition!.fraction);
  });
});

describe("phase 2: edge validated out of sample", () => {
  test("leverage is capped at 2x and at a quarter of the estimated Kelly lower bound", () => {
    const p = profile(100, 0.0667, 2);
    expect(p.maxLeverage).toBe(2);
    expect(p.kellyFractionCap).toBe(0.25);
  });

  test("capital, order cap, total notional and liquidation floor for US$ 1000 and MON", () => {
    const p = profile(1000, 0.0667, 2);
    absClose(p.exposedCapitalUsd as number, 250);
    absClose(p.orderCapUsd as number, 50);
    absClose(p.architectureOrderCapUsd as number, 20);
    absClose(p.totalNotionalCapUsd as number, 2000);
    absClose(p.dailyStopUsd as number, 20);
    absClose(p.weeklyStopUsd as number, 50);
    absClose(p.drawdownStopUsd as number, 100);
    absClose(p.sessionCostCapUsd as number, 10);
    // R3: MON 44%.
    absClose(p.liquidationFloor as number, 0.441, 0.001);
    expect(p.assetPosition!.limitedBy).toBe("volatility");
  });

  test("the liquidation floor never drops below 35%", () => {
    expect(profile(100, 0.0196, 2).liquidationFloor).toBe(0.35);
    expect(profile(100, 0.04, 2).liquidationFloor).toBe(0.35);
  });
});

describe("phase table", () => {
  const rows = buildPhaseTable(100, 0.0667);
  const row = (id: string): PhaseTableRow => {
    const found = rows.find((entry) => entry.id === id);
    if (!found) throw new Error(`row not found: ${id}`);
    return found;
  };

  test("has the parameters of R3 section 6 in a stable order, each with three cells and a basis", () => {
    expect(rows.map((entry) => entry.id)).toEqual([
      "leverage", "exposed-capital", "asset-position", "order-cap", "daily-stop", "session-cost-cap", "weekly-stop",
      "drawdown-stop", "liquidation-floor", "cooldowns", "pace", "kill-switches", "reinvestment",
    ]);
    for (const entry of rows) {
      expect(entry.cells).toHaveLength(3);
      expect(entry.label.length).toBeGreaterThan(3);
      expect(entry.basis.length).toBeGreaterThan(5);
    }
  });

  test("phase 0 applies almost nothing", () => {
    for (const id of ["order-cap", "asset-position", "daily-stop", "weekly-stop", "drawdown-stop", "session-cost-cap", "liquidation-floor", "cooldowns"]) {
      expect(row(id).cells[0]).toEqual({ kind: "none" });
    }
    expect(row("leverage").cells[0]).toEqual({ kind: "leverage", max: 0, note: "sem perpétuos e sem empréstimo" });
    expect(row("exposed-capital").cells[0]).toEqual({ kind: "usd", usd: 0 });
  });

  test("monetary cells carry the dollar value and the fraction it comes from", () => {
    expect(row("daily-stop").cells[1]).toEqual({ kind: "usd", usd: 2, fraction: 0.02, note: "sem novas ordens até o dia seguinte (UTC)" });
    expect(row("weekly-stop").cells[2]).toMatchObject({ kind: "usd", usd: 5, fraction: 0.05 });
    expect(row("drawdown-stop").cells[1]).toMatchObject({ kind: "usd", usd: 10, fraction: 0.1 });
    expect(row("session-cost-cap").cells[1]).toMatchObject({ kind: "usd", usd: 1, fraction: 0.01 });
  });

  test("the per order cap shows the R3 value and the stricter architecture value", () => {
    const phase1 = row("order-cap").cells[1];
    expect(phase1).toMatchObject({ kind: "usd", usd: 10, fraction: 0.1 });
    expect((phase1 as { note: string }).note).toContain("US$ 1,00");
    expect((phase1 as { note: string }).note).toContain("arquitetura");
    const phase2 = row("order-cap").cells[2];
    expect(phase2).toMatchObject({ kind: "usd", usd: 5, fraction: 0.05 });
    expect((phase2 as { note: string }).note).toContain("US$ 2,00");
  });

  test("the asset position cell carries the exposure fraction", () => {
    const cell = row("asset-position").cells[1];
    expect(cell.kind).toBe("position");
    if (cell.kind === "position") {
      expect(cell.position.limitedBy).toBe("volatility");
      expect(cell.position.fraction).toBeCloseTo(0.1499, 3);
    }
  });

  test("leverage in phase 2 states the Kelly condition", () => {
    const cell = row("leverage").cells[2];
    expect(cell).toMatchObject({ kind: "leverage", max: 2 });
    expect((cell as { note: string }).note).toContain("0,25");
    expect((cell as { note: string }).note).toContain("Kelly");
  });

  test("the liquidation floor only exists in phase 2", () => {
    expect(row("liquidation-floor").cells[1]).toEqual({ kind: "none" });
    const cell = row("liquidation-floor").cells[2];
    expect(cell.kind).toBe("floor");
    if (cell.kind === "floor") expect(cell.fraction).toBeCloseTo(0.441, 3);
  });

  test("text rows keep the cooldowns, kill switches and reinvestment rule of R3", () => {
    expect(row("cooldowns").cells[1]).toMatchObject({ kind: "text" });
    const cooldowns = (row("cooldowns").cells[1] as { text: string }).text;
    for (const part of ["15 min", "24 h", "72 h", "manual"]) expect(cooldowns).toContain(part);
    const kill = (row("kill-switches").cells[1] as { text: string }).text;
    expect(kill).toContain("dado velho");
    expect(kill).toContain("divergência de reconciliação");
    expect((row("reinvestment").cells[2] as { text: string }).text).toContain("realizado e conciliado");
    expect((row("pace").cells[1] as { text: string }).text).toContain("sem Jev disponível, manter");
  });

  test("scales with the capital", () => {
    const large = buildPhaseTable(1000, 0.0667);
    expect(large.find((entry) => entry.id === "daily-stop")!.cells[1]).toMatchObject({ kind: "usd", usd: 20 });
  });

  test("lists the promotion criteria", () => {
    expect(PHASE_PROMOTION_CRITERIA.length).toBeGreaterThanOrEqual(4);
    expect(PHASE_PROMOTION_CRITERIA.join(" ")).toContain("Sharpe 2");
    expect(PHASE_PROMOTION_CRITERIA.join(" ")).toContain("365");
  });
});

describe("input validation", () => {
  test("rejects non positive or non finite capital and sigma", () => {
    for (const capital of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computePhaseProfiles(capital, 0.04)).toThrow(RangeError);
    }
    for (const sigma of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => computePhaseProfiles(100, sigma)).toThrow(RangeError);
    }
  });
});
