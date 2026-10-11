import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import GrowthDeck, { PhaseLimitCell } from "@/components/GrowthDeck/GrowthDeck";
import { buildPhaseTable } from "./central/phases";

const renderLimits = (capital: number) => renderToStaticMarkup(
  <table><tbody>{buildPhaseTable(capital, 0.0667).map(row => (
    <tr key={row.id}>{row.cells.map((cell, index) => <PhaseLimitCell key={index} cell={cell} />)}</tr>
  ))}</tbody></table>,
);

test("phase limits expose the Kelly condition alongside leverage", () => {
  expect(renderLimits(100)).toContain("e no máximo 0,25 do limite inferior do Kelly estimado");
});

test("order caps preserve the stricter architecture qualification as capital changes", () => {
  expect(renderLimits(100)).toContain("a arquitetura (seção 5) é mais estrita: até US$ 1,00 (1%)");
  expect(renderLimits(500)).toContain("a arquitetura (seção 5) é mais estrita: até US$ 10,00 (2%)");
});

test("exposure identifies the operational wallet and venue scope", () => {
  expect(renderLimits(100)).toContain("da carteira operacional, por venue");
});

test("risk chart exposes each plotted leverage result in its accessible description", () => {
  const markup = renderToStaticMarkup(<GrowthDeck reducedMotion />);
  const description = markup.match(/role="img" aria-label="([^"]+)"/)?.[1];
  expect(description).toContain("Alavancagem 2x: mediana");
  expect(description).toContain("chance de tocar a liquidacao");
  expect(description).toContain("Alavancagem 10x: mediana");
});

test("the risk verdict identifies its reference leverage", () => {
  expect(renderToStaticMarkup(<GrowthDeck reducedMotion />)).toContain("Cenario de referencia: 2x.");
});
