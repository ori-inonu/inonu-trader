import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DepthLadderView } from "@/components/DepthLadder/DepthLadder";
import { eventFixture } from "./test-fixtures";

function render(latest: ReturnType<typeof eventFixture> | null): string {
  return renderToStaticMarkup(<DepthLadderView latest={latest} reducedMotion />);
}

describe("DepthLadder rendering", () => {
  test("draws the three planes the book actually reports", () => {
    const markup = render(eventFixture({ bestBid: 1.2, bestAsk: 1.3, mid: 1.25 }));

    expect(markup).toContain("Compra");
    expect(markup).toContain("Venda");
    expect(markup).toContain("Meio");
  });

  test("says so plainly when no resting size was reported, never inventing one", () => {
    const markup = render(eventFixture({ bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 0, askMon: 0 } }));

    expect(markup).toContain("Nenhum tamanho resting informado neste bloco.");
    expect(markup).toContain("sem tamanho informado");
  });

  test("never renders a resting size the event did not carry", () => {
    const withSize = render(eventFixture({ bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 4.5, askMon: 0 } }));
    const withoutSize = render(eventFixture({ bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 0, askMon: 0 } }));

    expect(withSize).toContain("4.5 MON");
    expect(withoutSize).not.toContain("4.5 MON");
  });

  test("labels its own staleness by naming the block it came from", () => {
    const markup = render(eventFixture({ block: 810_012, bestBid: 1.2, bestAsk: 1.3, mid: 1.25 }));
    expect(markup).toContain("Ladder do bloco 810012.");
  });

  test("waits for data instead of drawing a book that does not exist", () => {
    const markup = render(null);

    expect(markup).toContain("Aguardando dados do feed");
    expect(markup).toContain("Indisponivel");
    expect(markup).not.toContain("NaN");
  });

  test("describes the same levels in its accessible label as it draws", () => {
    const markup = render(eventFixture({ bestBid: 1.2, bestAsk: 1.3, mid: 1.25, resting: { bidMon: 3, askMon: 2 } }));

    expect(markup).toContain('role="img"');
    expect(markup).toContain("3 niveis, dos quais 2 com tamanho informado");
  });
});