import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRef } from "react";
import { JevCoreView } from "@/components/JevCore/JevCore";
import { eventFixture, fillFixture, quoteFixture } from "./test-fixtures";
import type { BlockEvent } from "@/lib/types";

const DISCLAIMER = "Uma decisao nao comprova preenchimento; ordens pendentes, registradas, revertidas ou sem confirmacao mantem seus estados proprios";

function render(latest: BlockEvent | null, connection: "live" | "reconnecting" | "connecting" = "live"): string {
  return renderToStaticMarkup(
    <JevCoreView
      latest={latest}
      connection={connection}
      model="jev-test"
      reducedMotion
      still={false}
      actionKey="test"
      tone="hold"
      orbRef={createRef<HTMLDivElement>()}
    />,
  );
}

describe("JevCoreView rendering", () => {
  test("keeps the decision is not a fill disclaimer verbatim", () => {
    expect(render(eventFixture())).toContain(DISCLAIMER);
  });

  test("renders every placeholder and reserves the grid with no latest block", () => {
    const markup = render(null);

    expect(markup).toContain("Aguardando decisao");
    expect(markup).toContain("Indisponivel");
    expect(markup).toContain("Sem ordem ou execucao informada");
    expect(markup).toContain('data-block="none"');
    // The reserved 220px orb and dial are what keep the grid from shifting before data arrives.
    expect(markup).toContain('style="width:220px;height:220px"');
    expect(markup).toContain('width="220" height="220"');
  });

  test("shows a late decision as late rather than as its action", () => {
    const late = eventFixture({
      decision: { action: "buy", probabilities: { buy: 0.8, sell: 0.1, hold: 0.1 }, upIn10: 0, latencyMs: 900, late: true },
    });

    expect(render(late)).toContain("Resposta tardia");
    expect(render(late)).not.toContain(">Compra<");
  });

  test("reports a simulated order or fill as simulated, never as a real execution", () => {
    const simQuote = render(eventFixture({ quote: quoteFixture({ status: "sim" }) }));
    expect(simQuote).toContain("Ordem simulada");

    const simFill = render(eventFixture({ fill: fillFixture({ simulated: true }) }));
    expect(simFill).toContain("Execucao simulada");
    expect(simFill).not.toContain("Execucao real");
  });

  test("reports a real fill as real", () => {
    const markup = render(eventFixture({ fill: fillFixture({ simulated: false }) }));
    expect(markup).toContain("Execucao real");
  });

  test("keeps its last action word while reconnecting instead of reverting to waiting", () => {
    const latest = eventFixture({
      decision: { action: "sell", probabilities: { buy: 0.1, sell: 0.8, hold: 0.1 }, upIn10: 0, latencyMs: 30, late: false },
    });
    const markup = render(latest, "reconnecting");

    expect(markup).toContain("Venda");
    expect(markup).toContain("Reconectando ao feed");
    expect(markup).not.toContain("Aguardando decisao");
  });

  test("shows no reconnect notice once the feed is live", () => {
    expect(render(eventFixture())).not.toContain("Reconectando ao feed");
  });
});