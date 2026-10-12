import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import CommandCenter from "@/components/CommandCenter/CommandCenter";
import { eventFixture, fillFixture, quoteFixture } from "./test-fixtures";
import type { BlockEvent } from "./types";

test.each([
  [eventFixture({ quote: quoteFixture({ status: "sent" }) }), "Ordem enviada"],
  [eventFixture({ quote: quoteFixture({ status: "placed" }) }), "Ordem no livro"],
  [eventFixture({ quote: quoteFixture({ status: "reverted" }) }), "Ordem revertida"],
  [eventFixture({ quote: quoteFixture({ status: "lost" }) }), "Ordem perdida"],
  [eventFixture({ quote: quoteFixture({ status: "sim" }) }), "Ordem simulada"],
  [eventFixture({ fill: fillFixture({ simulated: true }) }), "Execucao simulada"],
  [eventFixture({ quote: quoteFixture({ status: "sent" }), fill: fillFixture() }), "Execucao real"],
  [eventFixture(), "Sem ordem"],
] as const)("preserves individual observed order and fill states (%#)", (event: BlockEvent, label: string) => {
  const markup = renderToStaticMarkup(
    <CommandCenter meta={null} latest={event} events={[event]} connection="live" operatorCycle={null} reducedMotion />,
  );
  expect(markup).toContain(label);
  expect(markup).toContain('data-block="1"');
  expect(markup).toContain("Cadência não verificada");
  if (label !== "Execucao real") expect(markup).not.toContain("Execucao real");
});

test("describes observed activity without promising an order or measured cadence", () => {
  const markup = renderToStaticMarkup(
    <CommandCenter meta={null} latest={null} events={[]} connection="connecting" operatorCycle={null} reducedMotion />,
  );
  expect(markup).toContain("Acompanha os dados informados pelo feed e apresenta as decisoes do Jev, com o estado observado de cada ordem.");
  expect(markup).toContain("Cadência não verificada");
  expect(markup).not.toContain("Um bloco a cada 300 ms");
  expect(markup).not.toContain("coloca a ordem no livro on-chain");
  expect(markup).toContain("Sem ordem");
});
