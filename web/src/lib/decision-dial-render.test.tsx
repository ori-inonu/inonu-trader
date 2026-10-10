import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionDialView } from "@/components/DecisionDial/DecisionDial";

describe("DecisionDial rendering", () => {
  test("names all three percentages in the accessible label", () => {
    const markup = renderToStaticMarkup(
      <DecisionDialView probabilities={{ buy: 0.6, sell: 0.3, hold: 0.1 }} action="buy" late={false} />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain("Compra 60%");
    expect(markup).toContain("venda 30%");
    expect(markup).toContain("manter 10%");
  });

  test("carries the same three percentages in a visually hidden sibling", () => {
    const markup = renderToStaticMarkup(
      <DecisionDialView probabilities={{ buy: 0.6, sell: 0.3, hold: 0.1 }} action="buy" late={false} />,
    );

    expect(markup).toContain("srOnly");
    expect(markup).toContain("Compra 60%, venda 30%, manter 10%");
  });

  test("rests every arc at zero and says it is waiting without probabilities", () => {
    const markup = renderToStaticMarkup(
      <DecisionDialView probabilities={null} action={null} late={false} />,
    );

    expect(markup.match(/stroke-dasharray="0 100"/g)).toHaveLength(3);
    expect(markup).toContain("Aguardando decisao");
    expect(markup).not.toContain("NaN");
  });

  test("a late decision is announced as late rather than as its action", () => {
    const markup = renderToStaticMarkup(
      <DecisionDialView probabilities={{ buy: 0.7, sell: 0.2, hold: 0.1 }} action="buy" late />,
    );

    expect(markup).toContain("Resposta tardia");
  });

  test("derives its gradient id from useId so two dials in one tree never collide", () => {
    const markup = renderToStaticMarkup(
      <>
        <DecisionDialView probabilities={{ buy: 1, sell: 0, hold: 0 }} action="buy" late={false} />
        <DecisionDialView probabilities={{ buy: 0, sell: 1, hold: 0 }} action="sell" late={false} />
      </>,
    );

    const ids = [...markup.matchAll(/id="(dialArc[^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const references = [...markup.matchAll(/url\(#(dialArc[^)]+)\)/g)].map((match) => match[1]);
    for (const reference of references) expect(ids).toContain(reference);
  });

  test("a full probability draws a visible arc rather than a zero one", () => {
    const markup = renderToStaticMarkup(
      <DecisionDialView probabilities={{ buy: 1, sell: 0, hold: 0 }} action="buy" late={false} />,
    );

    expect(markup).toContain('stroke-dasharray="1 99"');
  });
});