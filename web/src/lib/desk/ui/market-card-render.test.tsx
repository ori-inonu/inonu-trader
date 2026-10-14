// MKT: the Mercado tab of the simple desk. One card that answers "can I move my money here without losing it to the cost?" and leaves the tape, the book and the liquidity one click
// away. Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarketCardView } from "@/components/Desk/Dock/MarketCard";
import { marketRead, type MarketRead } from "../market-read";
import type { DeskBook, DeskBookLevel } from "../types";

const lvl = (px: number, sz: number): DeskBookLevel => ({ px, sz, orders: 0 });
const BOOK: DeskBook = { instId: "BTC-USDT", asks: [lvl(100.1, 5), lvl(100.2, 10), lvl(100.5, 100)], bids: [lvl(100.0, 5), lvl(99.9, 10), lvl(99.5, 100)], tsMs: 1_000_000, seqId: null, checksumOk: null };
const read = (over: Partial<Parameters<typeof marketRead>[0]> = {}): MarketRead => marketRead({ book: BOOK, quoteMultiplier: 1, nowMs: 1_002_000, stale: false, plan: null, ...over });
const noop = () => {};
const draw = (r: MarketRead = read(), over: { source?: string | null } = {}) => renderToStaticMarkup(<MarketCardView instId="BTC-USDT" read={r} source={over.source ?? "OKX tempo real, agora"} onDetails={noop} />);

describe("the card with a reading", () => {
  const html = draw();

  test("the question it answers, the word for the market and the sentence behind it", () => {
    expect(html).toContain('aria-label="Custo para negociar agora"');
    expect(html).toContain("Custo para negociar agora");
    expect(html).toContain("BTC-USDT");
    expect(html).toContain("Mercado normal");
    expect(html).toContain("Mercado normal: ir e voltar com US$ 1.000 custa US$ 2,00 (0,20%).");
  });

  test("the cost of three amounts, on each side and for the round trip, as a table", () => {
    expect(html).toContain('aria-label="Custo por quantia"');
    for (const label of ["Quantia", "Custo da ida e volta", "Em dolares"]) expect(html).toContain(label);
    for (const size of ["US$ 100", "US$ 1.000", "US$ 10.000"]) expect(html).toContain(size);
    expect(html).toContain("0,10%");
    expect(html).toContain("US$ 0,10");
    // the cost of each side is not on this card: a person does not read a spread, the machine does
    expect(html).not.toContain("Pelo lado comprador");
  });

  test("the big queues near the price, and the source with its age", () => {
    expect(html).toContain("Maior fila de compradores: US$ 9.950");
    expect(html).toContain("Maior fila de vendedores: US$ 10.050");
    expect(html).toContain("OKX tempo real, agora");
    expect(html).toContain("sem taxas");
  });

  test("an amount the book does not hold is said as such, not drawn as a number", () => {
    const thin = draw(read({ book: { ...BOOK, asks: [lvl(100.1, 5), lvl(100.2, 10)], bids: [lvl(100.0, 5), lvl(99.9, 10)] } }));
    expect(thin).toContain("alem do livro");
    expect(thin).not.toContain("NaN");
  });

  test("the plan of the Inonu next to the cost of the book, and the tone says when the book costs more", () => {
    const less = draw(read({ plan: { custoBps: 24, notionalUsd: 400 } }));
    expect(less).toContain("O plano do Inonu conta 0,24% de custo no total");
    expect(less).toContain('data-kind="menor"');
    const more = draw(read({ plan: { custoBps: 5, notionalUsd: 400 } }));
    expect(more).toContain("o ganho liquido do plano seria menor");
    expect(more).toContain('data-kind="maior"');
    expect(html).not.toContain("O plano do Inonu");
  });

  test("one button, and it only opens the details", () => {
    const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(buttons).toEqual(["Ver fita, livro e liquidez"]);
  });
});

describe("the card with no reading", () => {
  test("says why, keeps the details button, and shows no number", () => {
    const html = draw(read({ book: null }));
    expect(html).toContain("O livro ainda nao chegou.");
    expect(html).toContain("Ver fita, livro e liquidez");
    expect(html).not.toContain('aria-label="Custo por quantia"');
    expect(html).not.toContain("Mercado fluido");
  });

  test("a connection that is behind, or a swap in contracts, says so", () => {
    expect(draw(read({ stale: true }))).toContain("A conexao com a exchange esta atrasada");
    expect(draw(read({ quoteMultiplier: null }))).toContain("contratos");
  });
});

describe("how it is written", () => {
  test("plain ASCII, no middle dot, dash or accent, and no word of an order: the code describes, the Inonu decides", () => {
    const states = [draw(), draw(read({ plan: { custoBps: 24, notionalUsd: 400 } })), draw(read({ plan: { custoBps: 5, notionalUsd: 400 } })), draw(read({ book: null })), draw(read({ stale: true }))];
    for (const html of states) {
      const visible = html.replace(/<[^>]*>/g, " ");
      expect(visible).not.toMatch(/[^\x20-\x7e]/);
      expect(visible.toLowerCase()).not.toMatch(/\b(comprar|compre|vender|venda|sinal|recomend|aconselh|deve)\b/);
    }
  });
});
