import { describe, expect, test } from "bun:test";
import { orderStateFor } from "./order-state";
import { eventFixture, fillFixture, quoteFixture } from "./test-fixtures";
import type { Quote } from "./types";

describe("orderStateFor", () => {
  test("has nothing to say without a quote or a fill", () => {
    expect(orderStateFor(null)).toBeNull();
    expect(orderStateFor(eventFixture())).toBeNull();
  });

  test("covers every quote status", () => {
    const states: Record<Quote["status"], { label: string; tone: string }> = {
      sent: { label: "Orden enviada", tone: "neutral" },
      placed: { label: "Ordem no livro", tone: "buy" },
      reverted: { label: "Ordem revertida", tone: "sell" },
      lost: { label: "Ordem perdida", tone: "sell" },
      sim: { label: "Ordem simulada", tone: "late" },
    };

    for (const [status, expected] of Object.entries(states)) {
      const result = orderStateFor(eventFixture({ quote: quoteFixture({ status: status as Quote["status"] }) }));
      expect(result).toEqual(expected);
    }
  });

  test("a real fill beats its own quote", () => {
    expect(orderStateFor(eventFixture({
      quote: quoteFixture({ status: "sent" }),
      fill: fillFixture({ simulated: false }),
    }))).toEqual({ label: "Execucao real", tone: "buy" });

    expect(orderStateFor(eventFixture({
      quote: quoteFixture({ status: "reverted" }),
      fill: fillFixture({ simulated: false }),
    }))).toEqual({ label: "Execucao real", tone: "buy" });
  });

  test("a simulated fill overrides a real quote so it never reads as a real execution", () => {
    expect(orderStateFor(eventFixture({
      quote: quoteFixture({ status: "placed" }),
      fill: fillFixture({ simulated: true }),
    }))).toEqual({ label: "Execucao simulada", tone: "late" });
  });

  test("a sim quote overrides everything else", () => {
    expect(orderStateFor(eventFixture({ quote: quoteFixture({ status: "sim" }) }))).toEqual({
      label: "Ordem simulada",
      tone: "late",
    });
    expect(orderStateFor(eventFixture({
      quote: quoteFixture({ status: "sim" }),
      fill: fillFixture({ simulated: false }),
    }))).toEqual({ label: "Ordem simulada", tone: "late" });
  });

  test("a simulated fill alone never claims a real fill", () => {
    const result = orderStateFor(eventFixture({ fill: fillFixture({ simulated: true }) }));
    expect(result?.tone).toBe("late");
    expect(result?.label).not.toContain("real");
  });

  test("no tone it returns is ever buy for simulated work", () => {
    const simulated = [
      orderStateFor(eventFixture({ quote: quoteFixture({ status: "sim" }) })),
      orderStateFor(eventFixture({ fill: fillFixture({ simulated: true }) })),
      orderStateFor(eventFixture({ quote: quoteFixture({ status: "sim" }), fill: fillFixture({ simulated: true }) })),
    ];
    for (const state of simulated) {
      expect(state?.tone).toBe("late");
    }
  });
});