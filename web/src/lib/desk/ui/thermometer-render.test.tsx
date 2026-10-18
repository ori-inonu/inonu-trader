// The thermometer panel (INF, ASK): who is in charge, the nearest zone, and the Inonu's last answer with the button that asks again. The code describes; the only
// words of an order are the Inonu's own answer. Pure drawing, no network. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThermometerView } from "@/components/Desk/panels/Thermometer";
import { COMPRAR, ESPERAR_PELO_CUSTO } from "../../veredito/test-fixtures";
import { thermometer, type ThermoInput } from "../thermometer";

const NOW = 10_000_000;
const input = (over: Partial<ThermoInput> = {}): ThermoInput => ({
  imbalance: 0.6, trades: 120, price: 100.3, zones: [{ lado: "demanda", baixo: 99, alto: 100, estado: "ativa" }], answer: { action: "hold", atMs: NOW - 7 * 60_000 }, nowMs: NOW, ...over,
});
const noop = () => {};
const draw = (over: Partial<ThermoInput> = {}, warming: { closed: number; closed2?: never; needed: number } | null = null) =>
  renderToStaticMarkup(<ThermometerView instId="BTC-USDT" model={thermometer(input(over))} warming={warming} onAsk={noop} />);

describe("the thermometer", () => {
  test("one panel with the three readings in plain words", () => {
    const html = draw();
    expect(html).toContain("Termometro");
    expect(html).toContain("BTC-USDT");
    expect(html).toContain("Quem manda agora");
    expect(html).toContain("Compradores no comando (+60%)");
    expect(html).toContain("Zona de compradores a 0,3% abaixo do preco");
    expect(html).toContain("Esperar");
    expect(html).toContain("Inonu respondeu ha 7 min");
    expect(html).toContain("Perguntar de novo");
  });

  test("the bar is readable without the picture: a label that says who is in charge and by how much", () => {
    expect(draw()).toContain('aria-label="Quem manda no mercado: Compradores no comando, +60%."');
    expect(draw({ imbalance: -0.3 })).toContain("Vendedores um pouco a frente (-30%)");
    expect(draw({ imbalance: null })).toContain('aria-label="Quem manda no mercado: ainda lendo."');
  });

  test("a minute with too few trades says so instead of a number", () => {
    const html = draw({ imbalance: -1, trades: 4 });
    expect(html).toContain("Pouca negociacao agora");
    expect(html).not.toContain("-100%");
  });

  test("no answer yet: it says so and offers the first ask", () => {
    const html = draw({ answer: null });
    expect(html).toContain("O Inonu ainda nao respondeu para este ativo.");
    expect(html).toContain("Pedir ao Inonu");
    expect(html).not.toContain("Perguntar de novo");
  });

  test("an old answer is called old, with its age", () => {
    const html = draw({ answer: { action: "buy", atMs: NOW - 3 * 3_600_000 } });
    expect(html).toContain("Resposta antiga do Inonu, ha 3 h");
    expect(html).not.toContain('data-fresh="true"');
  });

  test("no zone near, no zone line; the engine still warming says how far it is", () => {
    expect(draw({ zones: [] })).not.toContain("Zona de");
    const html = draw({ imbalance: null }, { closed: 12, needed: 50 });
    expect(html).toContain("Aquecendo: 12 de 50 minutos lidos.");
  });

  test("the panel asks nothing by itself: one button, and it is the one that asks", () => {
    const html = draw();
    expect([...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])).toEqual(["Perguntar de novo"]);
  });

  test("the text has no accent, middle dot or dash, and no word of an order outside the Inonu's answer", () => {
    for (const html of [draw(), draw({ answer: null }), draw({ imbalance: -1 }), draw({ imbalance: null, zones: [], answer: null })]) {
      const visible = html.replace(/<[^>]*>/g, " ");
      expect(visible).not.toMatch(/[^\x20-\x7e]/);
    }
    const described = draw({ answer: null }).replace(/<[^>]*>/g, " ").toLowerCase();
    expect(described).not.toMatch(/comprar|vender|\bsinal\b|recomend/);
  });
});

describe("the answer with its verdict", () => {
  const withVerdict = (over: Partial<ThermoInput> = {}) =>
    draw({ base: "BTC", measured: "Acerto do Inonu: ainda nao medido (0 de 30 respostas medidas).", answer: { action: "buy", atMs: NOW - 5 * 60_000, veredito: COMPRAR }, ...over });

  test("the reasons, the plan in the order a person acts, and the account of the profit with the costs", () => {
    const html = withVerdict();
    expect(html).toContain("Comprar");
    expect(html).toContain('aria-label="Por que"');
    expect(html).toContain("A tendencia de 1 hora e de 4 horas e de alta.");
    expect(html).toContain('aria-label="Plano"');
    expect(html.indexOf(">Entrada<")).toBeLessThan(html.indexOf(">Alvo<"));
    expect(html.indexOf(">Alvo<")).toBeLessThan(html.indexOf(">A ideia cai em<"));
    expect(html).toContain('aria-label="Conta do lucro"');
    expect(html).toContain("Conta do lucro, depois dos custos");
    expect(html).toContain("Se der certo: +3,28% (alvo 3,52% menos 0,24% de custo).");
    expect(html).toContain("Se der errado: -1,75%");
    expect(html).toContain("Para empatar, o plano precisa dar certo em 35% das vezes. Acerto do Inonu: ainda nao medido (0 de 30 respostas medidas).");
    expect(html).toContain("Com o seu risco: ganha ate US$ 18,76 ou perde US$ 10,00, em US$ 572,23.");
  });

  test("a wait with no plan says why there is none, and shows no account", () => {
    const html = draw({ answer: { action: "hold", atMs: NOW - 60_000, veredito: ESPERAR_PELO_CUSTO } });
    expect(html).toContain("Sem plano com alvo e stop agora");
    expect(html).toContain(ESPERAR_PELO_CUSTO.mensagem);
    expect(html).not.toContain('aria-label="Conta do lucro"');
    expect(html).not.toContain('aria-label="Plano"');
  });

  test("an old plan is not shown, only its word and its age, and the button asks again", () => {
    const html = withVerdict({ answer: { action: "buy", atMs: NOW - 3 * 3_600_000, veredito: COMPRAR } });
    expect(html).toContain("Resposta antiga do Inonu, ha 3 h");
    expect(html).not.toContain('aria-label="Plano"');
    expect(html).not.toContain('aria-label="Conta do lucro"');
    expect(html).not.toContain("Sem plano com alvo e stop agora");
    expect(html).toContain("Perguntar de novo");
  });

  test("the account makes no promise and the text is plain ASCII", () => {
    const visible = withVerdict().replace(/<[^>]*>/g, " ");
    expect(visible).not.toMatch(/[^\x20-\x7e]/);
    expect(visible.toLowerCase()).not.toMatch(/garant|certeza|previs|chance de ganhar|lucro certo|sem risco/);
  });
});

describe("the scenario", () => {
  const NOW_MS = 50_000_000;
  const scenarioInput = (over: Partial<ThermoInput> = {}): ThermoInput => ({
    imbalance: 0.6, trades: 120, price: 100.3, zones: [{ lado: "demanda", baixo: 99, alto: 100, estado: "ativa" }], answer: null, nowMs: NOW_MS,
    stable: { band: "buy1", pct: 40, sinceMs: NOW_MS - 4 * 60_000 },
    market: { thickness: "fluido", text: "Mercado fluido: ir e voltar com US$ 1.000 custa US$ 0,10 (0,01%)." },
    ...over,
  });
  const drawScenario = (over: Partial<ThermoInput> = {}) => renderToStaticMarkup(<ThermometerView instId="BTC-USDT" model={thermometer(scenarioInput(over))} warming={null} onAsk={noop} />);

  test("the headline and the four conditions, each with the words a screen reader needs (yes, no or no reading)", () => {
    const html = drawScenario();
    expect(html).toContain('aria-label="Cenario"');
    expect(html).toContain("Vale perguntar ao Inonu agora: 4 de 4 condicoes alinhadas e sem resposta recente.");
    expect(html).toContain('data-worth="true"');
    expect(html.match(/<li/g)?.length).toBe(4);
    expect(html).toContain("Sim: ");
    expect(html).toContain("Zona de compradores a 0,3% abaixo do preco");
    expect(html).toContain("Compradores um pouco a frente ha 4 min");
    expect(html).toContain("Fluxo e zona estao do mesmo lado");
    expect(html).toContain("Mercado fluido");
  });

  test("a scenario that does not line up is told as it is, with no stress on it, and what holds is marked apart from what does not", () => {
    const html = drawScenario({ zones: [], stable: { band: "flat", pct: 0, sinceMs: NOW_MS - 600_000 } });
    expect(html).toContain("Cenario ainda nao alinhado: 1 de 3 condicoes.");
    expect(html).not.toContain('data-worth="true"');
    expect(html).toContain('data-ok="false"');
    expect(html).toContain('data-ok="true"');
    expect(html).toContain("Nao: ");
    expect(html).toContain("Sem leitura: ");
  });

  test("with a recent answer the headline says the Inonu already answered, and the button keeps asking again", () => {
    const html = drawScenario({ answer: { action: "hold", atMs: NOW_MS - 7 * 60_000 } });
    expect(html).toContain("Cenario alinhado (4 de 4) e o Inonu ja respondeu ha 7 min.");
    expect(html).not.toContain('data-worth="true"');
    expect(html).toContain("Perguntar de novo");
  });

  test("while the market is still being read there are no conditions to list, only the sentence", () => {
    const html = drawScenario({ imbalance: null, trades: null, price: null, stable: null, zones: [], market: null });
    expect(html).toContain("Ainda lendo o mercado: 0 de 4 condicoes puderam ser lidas.");
    expect(html).not.toContain("<li");
  });

  test("plain ASCII with no word of an order, and nothing that animates", () => {
    for (const html of [drawScenario(), drawScenario({ zones: [] }), drawScenario({ market: null }), drawScenario({ answer: { action: "buy", atMs: NOW_MS - 60_000 } })]) {
      const visible = html.replace(/<[^>]*>/g, " ");
      expect(visible).not.toMatch(/[^ -~]/);
      const described = visible.toLowerCase();
      const withoutAnswer = described.replace(/comprar/g, "");
      expect(withoutAnswer).not.toMatch(/(vender|venda|sinal|recomend|aconselh)/);
    }
  });
});
