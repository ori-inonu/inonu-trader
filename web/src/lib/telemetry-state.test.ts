import { describe, expect, test } from "bun:test";
import { telemetryEmptyMessage, telemetryStaggerDelay } from "./telemetry-state";

describe("telemetryEmptyMessage", () => {
  test("says the feed is empty only before anything arrives with no filters", () => {
    expect(telemetryEmptyMessage(0, "all", "all")).toBe("Aguardando dados do feed");
  });

  test("says the filters excluded everything once any filter is active", () => {
    expect(telemetryEmptyMessage(12, "buy", "all")).toBe("Nenhum evento para estes filtros");
    expect(telemetryEmptyMessage(12, "all", "fills")).toBe("Nenhum evento para estes filtros");
    expect(telemetryEmptyMessage(0, "sell", "orders")).toBe("Nenhum evento para estes filtros");
  });

  test("never reports no-events-yet while a filter is active", () => {
    expect(telemetryEmptyMessage(0, "hold", "all")).not.toBe("Aguardando dados do feed");
  });
});

describe("telemetryStaggerDelay", () => {
  test("grows with the row index and caps at the eighth row", () => {
    expect(telemetryStaggerDelay(0)).toBe(0);
    expect(telemetryStaggerDelay(3)).toBe(78);
    expect(telemetryStaggerDelay(8)).toBe(208);
    expect(telemetryStaggerDelay(9)).toBe(208);
    expect(telemetryStaggerDelay(400)).toBe(208);
  });

  test("never goes negative for a negative index", () => {
    expect(telemetryStaggerDelay(-5)).toBe(0);
  });
});
