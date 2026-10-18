// The result deck and the decision center, drawn: what the person sees of the curve, the meters, the funnel and the cards. The bars are forced to their final width (the first paint starts them empty). origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DecisionCenter, PerformanceDeck } from "@/components/Agent/Deck";
import { NOW, rawStatus, sampleStatus } from "./fixtures";

const HOUR = 3_600_000;
const withParts = (extra: Record<string, unknown> = {}) => {
  const raw = rawStatus();
  const last = raw.status.last as { view: Record<string, unknown>[]; orders: unknown[]; opened?: unknown };
  last.view = [
    { id: "hold:token:501:P@agente", kind: "holding", symbol: "Pedro", chainIndex: "501", stance: "trim_half", families: [], marks: [], closed: null, probs: { hold: 0.36, trim_half: 0.21, exit_all: 0.43 }, facets: { fading: 0.83, risk_rising: 0.68, distribution: 0.34 } },
    { id: "buy:token:501:N", kind: "buy", symbol: "NEAR", chainIndex: "501", stance: "skip", families: ["liquidez"], marks: [], closed: "abaixo_do_minimo", probs: { skip: 1 }, facets: { late_entry: 0.82, accumulating: 0.25 } },
    { id: "buy:token:501:O", kind: "buy", symbol: "OMNI", chainIndex: "501", stance: "skip", families: [], marks: ["entrada_esticada"], closed: "entrada_esticada", probs: null, facets: null },
    { id: "buy:token:501:Z", kind: "buy", symbol: "ZED", chainIndex: "501", stance: "buy_third", families: ["fluxo"], marks: [], closed: null, probs: { skip: 0.3, buy_third: 0.7 }, facets: null },
  ];
  last.opened = { cauteloso: 0, moderado: 2, agressivo: 0 };
  const status = raw.status as Record<string, unknown>;
  status.performance = { series: [{ t: NOW - 4 * HOUR, v: 113.5 }, { t: NOW - 3 * HOUR, v: 120 }, { t: NOW - 2 * HOUR, v: 118 }, { t: NOW - HOUR, v: 130 }, { t: NOW, v: 124.2 }], record: { vender: { n: 5, acerto: 0 }, manter: { n: 3, acerto: null }, fluxo: { n: 8, acerto: 62 } } };
  status.ledger = [{ kind: "order", cycleId: "c", atMs: NOW - 2.5 * HOUR, reason: null, stage: "executada", side: "sell", symbol: "Chonk", usd: 12 }, { kind: "order", cycleId: "c", atMs: NOW - 90 * 60_000, reason: null, stage: "executada", side: "buy", symbol: "Abdul", usd: 10 }];
  Object.assign(status, extra);
  return sampleStatus(status);
};

describe("the result deck", () => {
  test("the curve says what the wallet is worth, how it moved in the period, and marks the executed orders on it", () => {
    const html = renderToStaticMarkup(<PerformanceDeck status={withParts()} revealed />);
    expect(html).toContain("Patrimonio gerido");
    expect(html).toContain("US$ 1.010,00");
    expect(html).toContain("+US$ 10,70");
    expect(html).toContain("Curva do valor da carteira do agente");
    expect(html).toContain("Venda de Chonk");
    expect(html).toContain("Compra de Abdul");
    expect(html).toContain("2 ordens executadas neste periodo");
    expect(html).toContain("inclui depositos e saques");
  });

  test("the headline uses only the managed amount and leaves an unknown value unknown", () => {
    const book = rawStatus().status.book as Record<string, unknown>;
    const managed = renderToStaticMarkup(<PerformanceDeck status={withParts({ book: { ...book, totalUsd: 1510, agentUsd: 510, cashUsd: 300 } })} revealed />);
    expect(managed).toContain("US$ 510,00");
    expect(managed).not.toContain("US$ 1.510,00");

    const unknown = renderToStaticMarkup(<PerformanceDeck status={withParts({ book: { ...book, agentUsd: null } })} revealed />);
    expect(unknown).toContain("sem valor");
    expect(unknown).not.toContain("US$ 124,20");
  });

  test("a stale managed read displays the retained book value with a freshness cue", () => {
    const book = rawStatus().status.book as Record<string, unknown>;
    const html = renderToStaticMarkup(<PerformanceDeck status={withParts({ book: { ...book, observedAtMs: book.atMs, quality: "stale", managedOk: false } })} revealed />);
    expect(html).toContain("US$ 1.010,00");
    expect(html).toMatch(/observad[oa]/i);
  });

  test("an unavailable managed book does not reuse an amount or imply zero", () => {
    const book = rawStatus().status.book as Record<string, unknown>;
    const html = renderToStaticMarkup(<PerformanceDeck status={withParts({
      book: { ...book, observedAtMs: null, quality: "unavailable", managedOk: false, totalUsd: null, agentUsd: null, cashUsd: null, positions: [] },
    })} revealed />);
    expect(html).toContain("sem valor");
    expect(html).toMatch(/sem leitura bem-sucedida/i);
    expect(html).not.toContain("US$ 1.010,00");
  });

  test("the curve is not a profit and does not say so", () => {
    const html = renderToStaticMarkup(<PerformanceDeck status={withParts()} revealed />);
    expect(html).toContain("Nao e lucro");
    expect(html).not.toMatch(/lucro de|ganhou/i);
  });

  test("without two readings there is no curve", () => {
    const html = renderToStaticMarkup(<PerformanceDeck status={sampleStatus()} revealed />);
    expect(html).not.toContain("<svg");
  });

  test("the meters: the result by window against keeping dollars, and the model's own record with a small sample dimmed", () => {
    const html = renderToStaticMarkup(<PerformanceDeck status={withParts()} revealed />);
    expect(html).toContain("Resultado das decisoes");
    expect(html).toContain("15 minutos");
    expect(html).toContain("1 hora");
    expect(html).toContain("Menos de 30 medidas nao prova nada");
    expect(html).toContain("Historico do Jev");
    expect(html).toContain("Quando vende");
    expect(html).toContain("0%");
    expect(html).toContain("sem dado");
    expect(html).toContain("62%");
  });

  test("a bar is empty at the first paint and at its final width once the page has settled: it grows, it is not drawn there", () => {
    const first = renderToStaticMarkup(<PerformanceDeck status={withParts()} />);
    const settled = renderToStaticMarkup(<PerformanceDeck status={withParts()} revealed />);
    expect(first).toContain("width:0%");
    expect(settled).toContain("width:62%");
    expect(first).not.toContain("width:62%");
  });
});

describe("the decision center", () => {
  const draw = (status = withParts(), revealed = true) => renderToStaticMarkup(<DecisionCenter status={status} nowMs={NOW} orders={<p>detalhes do ciclo</p>} revealed={revealed} />);

  test("the funnel counts what the agent saw, what the code closed and why, what was left to the model and what was done", () => {
    const html = draw();
    expect(html).toContain("Central de decisao do Jev");
    expect(html).toContain("Avaliadas");
    expect(html).toContain("Fechadas pelo codigo");
    expect(html).toContain("Abertas ao Jev");
    expect(html).toContain("Escolhidas para agir");
    expect(html).toContain("Abaixo do minimo");
    expect(html).toContain("Preco esticado");
    expect(html).toContain("detalhes do ciclo");
  });

  test("what each level of risk would open is shown, the one in use is marked, and the one the measurement has not earned is said to be locked", () => {
    const html = draw();
    expect(html).toContain("O que cada nivel de risco abriria");
    expect(html).toContain("Cauteloso");
    expect(html).toContain("Moderado");
    expect(html).toContain("em uso");
    expect(html).toContain("bloqueado");
    expect(html).toContain("compras abertas");
    // the premise is said to be a hypothesis, not a guarantee
    expect(html).toContain("uma hipotese e nao um pior caso garantido");
  });

  test("a card shows how sure the model was, option by option, with the chosen one marked, and what its narrow judgments said", () => {
    const html = draw();
    expect(html).toContain("Pedro");
    expect(html).toContain("Manter 36%");
    expect(html).toContain("Vender metade 21%");
    expect(html).toContain("Vender tudo 43%");
    expect(html).toContain("Forca acabando");
    expect(html).toContain("Risco subindo");
    expect(html).toContain("Entrada esticada");
    expect(html).toContain("Carteiras ainda comprando");
  });

  test("a purchase the code closed says the model had nothing to choose, and is not shown as the model's judgment", () => {
    const html = draw();
    expect(html).toContain("Fechada pelo codigo");
    expect(html).toContain("o Jev nao teve o que escolher");
  });

  test("cards come in order: what is held, then what the model could choose, then what the code closed", () => {
    const html = draw();
    const at = (s: string) => html.indexOf(s);
    expect(at("Pedro")).toBeLessThan(at("ZED"));
    expect(at("ZED")).toBeLessThan(at("NEAR"));
  });

  test("the map puts the Jev in the middle and every candidate around it, colored by what became of it, with the probability of the option taken in the tooltip", () => {
    const html = draw();
    expect(html).toContain("Mapa do ciclo");
    expect(html).toContain("Pedro, Venda decidida");
    expect(html).toContain("ZED, Compra decidida (Comprar um terco do maximo, o Jev deu 70%)");
    // the number is the probability of the option that was taken: Pedro was moved to half, which had 21
    expect(html).toContain("Pedro, Venda decidida (Vender metade, o Jev deu 21%)");
    expect(html).toContain("NEAR, Fechada pelo codigo");
    expect(html).toContain("Avaliada e recusada pelo Jev");
    // the Jev is the center
    expect(html).toContain(">Jev<");
  });

  test("the nodes are at the center at the first paint and move out to their places once the page has settled", () => {
    const first = draw(withParts(), false);
    const settled = draw(withParts(), true);
    expect(first).toContain("translate(320px, 150px)");
    expect(settled).not.toContain("translate(320px, 150px)");
    expect(settled).toContain("px)");
  });

  test("the strip of the last cycles is drawn when the ledger has cycles, and says what each did", () => {
    const cycles = Array.from({ length: 5 }, (_, i) => ({ kind: "cycle", cycleId: `c${i}`, atMs: NOW - (5 - i) * 300_000, reason: i === 3 ? "carteira_antiga" : null, outcome: i === 1 ? "decidido" : i === 3 ? "bloqueado" : "mantido" }));
    const orders = [{ kind: "order", cycleId: "c1", atMs: NOW - 4 * 300_000, reason: null, stage: "executada", side: "sell", symbol: "Chonk", usd: 12 }];
    const html = draw(withParts({ ledger: [...cycles, ...orders] }));
    expect(html).toContain("Ultimos ciclos");
    expect(html).toContain("enviou ordens, 1 ordem");
    expect(html).toContain("esperou, carteira antiga");
    expect(html).toContain("olhou e manteve");
    expect(draw(withParts({ ledger: [] }))).not.toContain("Ultimos ciclos");
  });

  test("before the first cycle it says what to expect, and nothing about the market around is drawn", () => {
    const html = draw(sampleStatus({ last: null }));
    expect(html).toContain("O agente ainda nao completou um ciclo");
    expect(html).not.toContain("Mercado ao redor");
  });

  test("the text of the center has no middle dot, em dash or en dash, and no accent", () => {
    const html = draw() + renderToStaticMarkup(<PerformanceDeck status={withParts()} revealed />);
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/[·—–]/);
    expect(text).not.toMatch(/[À-ÿ]/);
  });
});
