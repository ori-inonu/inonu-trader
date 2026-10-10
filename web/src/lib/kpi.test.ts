import { describe, expect, test } from "bun:test";
import type { KpiCell } from "./kpi";
import { buildKpiCells } from "./kpi";
import { eventFixture, totalsFixture } from "./test-fixtures";

const UNAVAILABLE = "Indisponivel";

function byId(cells: KpiCell[], id: string): KpiCell {
  const cell = cells.find((item) => item.id === id);
  if (!cell) throw new Error(`missing kpi cell ${id}`);
  return cell;
}

describe("buildKpiCells", () => {
  test("orders hero first and always exposes exactly one hero", () => {
    for (const cells of [
      buildKpiCells(null, 0, null),
      buildKpiCells(eventFixture(), 0, null),
      buildKpiCells(eventFixture({ decision: { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, upIn10: 0, latencyMs: 1, late: true } }), 120, "00:01:02"),
    ]) {
      expect(cells[0].id).toBe("mid");
      expect(cells.filter((cell) => cell.hero === true)).toHaveLength(1);
      expect(cells.map((cell) => cell.id)).toEqual([
        "mid",
        "decisoes",
        "ordens",
        "execucoes",
        "latencia",
        "observado",
      ]);
    }
  });

  test("labels the hero cell Mid / MON and pre-formats the mid price", () => {
    expect(byId(buildKpiCells(eventFixture({ mid: 1.234567 }), 0, null), "mid")).toEqual({
      id: "mid",
      label: "Mid / MON",
      value: "1,234,567",
      meta: undefined,
      tone: "neutral",
      hero: true,
    });
  });

  test("renders unavailable for every absent input instead of a fake zero", () => {
    const cells = buildKpiCells(null, 0, null);

    for (const cell of cells) {
      expect(cell.value).toBe(UNAVAILABLE);
    }
    expect(byId(cells, "mid").tone).toBe("unknown");
  });

  test("treats a zero average latency as no sample, not as 0 ms", () => {
    expect(byId(buildKpiCells(eventFixture(), 0, null), "latencia").value).toBe(UNAVAILABLE);
    expect(byId(buildKpiCells(eventFixture(), 0, null), "latencia").value).not.toContain("ms");
    expect(byId(buildKpiCells(eventFixture(), 0.4, null), "latencia").value).toBe(UNAVAILABLE);
    expect(byId(buildKpiCells(eventFixture(), Number.NaN, null), "latencia").value).toBe(UNAVAILABLE);
    expect(byId(buildKpiCells(eventFixture(), 118.6, null), "latencia").value).toBe("119 ms");
  });

  test("renders unavailable for a non-finite or null mid", () => {
    expect(byId(buildKpiCells(eventFixture({ mid: Number.NaN }), 0, null), "mid").value).toBe(UNAVAILABLE);
    expect(byId(buildKpiCells(eventFixture({ mid: Number.POSITIVE_INFINITY }), 0, null), "mid").value).toBe(UNAVAILABLE);
    expect(byId(buildKpiCells(eventFixture({ mid: null as unknown as number }), 0, null), "mid").value).toBe(UNAVAILABLE);
  });

  test("counts decisions, orders and executions from totals", () => {
    const cells = buildKpiCells(
      eventFixture({ totals: totalsFixture({ decisions: 1204, quotes: 987, fills: 654 }) }),
      0,
      null,
    );

    expect(byId(cells, "decisoes").value).toBe("1,204");
    expect(byId(cells, "ordens").value).toBe("987");
    expect(byId(cells, "execucoes").value).toBe("654");
  });

  test("marks a hero tone of unknown before any execution and late for a late decision", () => {
    expect(byId(buildKpiCells(eventFixture(), 0, null), "execucoes").tone).toBe("unknown");
    expect(byId(buildKpiCells(eventFixture({ totals: totalsFixture({ fills: 1 }) }), 0, null), "execucoes").tone).toBe("neutral");

    const late = buildKpiCells(
      eventFixture({
        decision: { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, upIn10: 0, latencyMs: 900, late: true },
      }),
      0,
      null,
    );
    expect(byId(late, "mid").tone).toBe("late");
    expect(byId(late, "mid").meta).toBe("Resposta tardia");
  });

  test("carries the observed time through and rejects a blank one", () => {
    expect(byId(buildKpiCells(eventFixture(), 0, "01:02:03"), "observado").value).toBe("01:02:03");
    expect(byId(buildKpiCells(eventFixture(), 0, "   "), "observado").value).toBe(UNAVAILABLE);
    expect(byId(buildKpiCells(eventFixture(), 0, null), "observado").value).toBe(UNAVAILABLE);
  });
});