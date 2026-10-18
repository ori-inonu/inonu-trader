import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TelemetryStreamView } from "@/components/TelemetryStream/TelemetryStream";
import { eventFixture, fillFixture, quoteFixture } from "./test-fixtures";

function render(props: Parameters<typeof TelemetryStreamView>[0]): string {
  return renderToStaticMarkup(<TelemetryStreamView {...props} />);
}

describe("TelemetryStream rendering", () => {
  test("offers every side and type option the filter contract defines", () => {
    const markup = render({ events: [], connection: "live" });

    for (const option of ["all", "buy", "sell", "hold", "orders", "fills"]) {
      expect(markup).toContain(`value="${option}"`);
    }
  });

  test("keeps the counted range line when the list is truncated", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      eventFixture({ block: index + 1, quote: quoteFixture({ side: "buy" }) }),
    );
    const markup = render({ events, connection: "live", capacity: 2 });

    expect(markup).toContain("Exibindo os 2 eventos mais recentes de 6 correspondências.");
  });

  test("renders a two line entry with the block, action and latency", () => {
    const markup = render({
      events: [
        eventFixture({
          block: 810_012,
          decision: { action: "buy", probabilities: { buy: 1, sell: 0, hold: 0 }, upIn10: 0, latencyMs: 42.4, late: false },
        }),
      ],
      connection: "live",
      capacity: 5,
    });

    expect(markup).toContain("[810,012]");
    expect(markup).toContain("Compra");
    expect(markup).toContain("42 ms");
  });

  test("never reports a simulated order or fill as a real one", () => {
    const simulated = render({
      events: [eventFixture({ block: 1, quote: quoteFixture({ status: "sim" }) })],
      connection: "live",
      capacity: 5,
    });
    expect(simulated).toContain("Simulado");

    const simulatedFill = render({
      events: [eventFixture({ block: 1, fill: fillFixture({ simulated: true }) })],
      connection: "live",
      capacity: 5,
    });
    expect(simulatedFill).toContain("Simulado");
  });

  test("caps the stagger so a long list has no one second tail", () => {
    const events = Array.from({ length: 30 }, (_, index) => eventFixture({ block: index + 1 }));
    const markup = render({ events, connection: "live", capacity: 30 });
    const delays = [...markup.matchAll(/animation-delay:(\d+)ms/g)].map((match) => Number(match[1]));

    expect(delays.length).toBe(30);
    expect(Math.max(...delays)).toBe(208);
  });

  test("shows the static reconnect notice while reconnecting", () => {
    const markup = render({ events: [eventFixture()], connection: "reconnecting", capacity: 5 });
    expect(markup).toContain("Reconectando ao feed");
  });
});
