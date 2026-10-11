import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import CommandCenter from "@/components/CommandCenter/CommandCenter";
import Rail from "@/components/Rail/Rail";
import type { BlockEvent, ConnectionState, Meta } from "./types";
import { eventFixture, fillFixture, quoteFixture } from "./test-fixtures";

const meta: Meta = {
  model: "jev-test",
  wallet: null,
  dryRun: false,
  market: "MON/USDC",
  startedAt: 1_700_000_000_000,
};

const cases: {
  name: string;
  meta: Meta | null;
  latest: BlockEvent | null;
  connection: ConnectionState;
}[] = [
  { name: "absent feed", meta: null, latest: null, connection: "connecting" },
  {
    name: "simulation",
    meta: { ...meta, dryRun: true },
    latest: eventFixture({ quote: quoteFixture({ status: "sim" }) }),
    connection: "live",
  },
  {
    name: "hold without an order",
    meta,
    latest: eventFixture({
      decision: {
        action: "hold",
        probabilities: { buy: 0.1, sell: 0.1, hold: 0.8 },
        upIn10: 0,
        latencyMs: 30,
        late: false,
      },
    }),
    connection: "live",
  },
  {
    name: "observed real fill",
    meta,
    latest: eventFixture({ fill: fillFixture({ simulated: false }) }),
    connection: "live",
  },
];

describe("execution descriptions", () => {
  for (const state of cases) {
    test(`Rail describes observation without promising execution with ${state.name}`, () => {
      const rail = renderToStaticMarkup(
        <Rail {...state} uptimeText="00:00:00" reducedMotion />,
      );
      const railDescription = rail.match(/<h1>INONU TRADER<\/h1><p>([^<]+)<\/p>/)?.[1];
      expect(railDescription).toBeDefined();
      expect(railDescription!).not.toMatch(/execu[cç][aã]o real|coloca a ordem/i);
      expect(railDescription!).toMatch(/observad|acompanha/i);
      if (state.name === "simulation") {
        expect(rail).toContain("Simulação");
      } else {
        expect(rail).toContain("Execução não verificada");
      }
    });

    test(`CommandCenter describes observation without promising execution with ${state.name}`, () => {
      const center = renderToStaticMarkup(
        <CommandCenter {...state} events={state.latest ? [state.latest] : []} operatorCycle={null} reducedMotion />,
      );
      // Inspect the introduction, not evidence-backed order labels elsewhere.
      const centerDescription = center.match(/id="command-center-title"[^>]*>[^<]+<\/h2><p[^>]*>([^<]+)<\/p>/)?.[1];
      expect(centerDescription).toBeDefined();
      expect(centerDescription!).not.toMatch(/execu[cç][aã]o real|coloca a ordem/i);
      expect(centerDescription!).toMatch(/observad|acompanha/i);
      if (state.name === "simulation") {
        expect(center).toContain("Ordem simulada");
      }
      if (state.name === "observed real fill") {
        expect(center).toContain("Execucao real");
      } else if (state.name === "hold without an order") {
        expect(center).toContain("Sem ordem");
        expect(center).toContain("Manter");
      }
    });
  }
});
