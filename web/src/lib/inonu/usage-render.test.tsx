// T7.4, CFG-5, CFG-8, AC-CFG-2: the Settings section about the Inonu: what it used, the price that makes the dollars measurable, and the
// addresses the app talks to. Plain ASCII, nothing animated, every state in words. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InonuUsagePanel, type InonuUsagePanelProps } from "@/components/Settings/InonuUsage";
import type { ProviderRow, Usage } from "./usage";

const T = (over: Partial<Usage["today"]> = {}): Usage["today"] => ({ calls: 2, usd: null, tokens: 1500, onchainosCalls: 0, avgLatencyMs: 900, ...over });
const usage = (over: Partial<Usage> = {}): Usage => ({
  today: T(), month: T({ calls: 9, tokens: 7000 }),
  recent: [{ atMs: 1_800_000_000_000, modo: "ativo", modelo: "jev-latest", resultado: "respondido", tokens: 740, usd: null, latenciaMs: 800, chamadasOnchainos: 0 }],
  prices: { input: null, output: null }, ...over,
});
const providers: ProviderRow[] = [
  { id: "okx-rest", label: "OKX mercado, REST publico", url: "https://www.okx.com", uso: "precos e velas", custo: "gratuito, sem chave", quemFala: "o nucleo e o navegador" },
  { id: "modelo", label: "Modelo Jev, pela TypeSafe AI", url: "https://api.typesafe.ai/v1", uso: "responder quando a pessoa clica", custo: "por token, no preco que a pessoa informar", quemFala: "so o nucleo, so depois de um clique" },
];
const noop = () => {};
const props = (over: Partial<InonuUsagePanelProps> = {}): InonuUsagePanelProps => ({
  usage: usage(), providers, nowMs: 1_800_000_090_000, saved: null, onSavePrices: noop, onClearPrices: noop, onRefresh: noop, ...over,
});
const draw = (over: Partial<InonuUsagePanelProps> = {}) => renderToStaticMarkup(<InonuUsagePanel {...props(over)} />);

describe("the usage", () => {
  test("today and the month in words, the dollars said to be unmeasured while there is no price", () => {
    const html = draw();
    expect(html).toContain("Uso do Inonu");
    expect(html).toContain("Hoje: 2 consultas ao modelo, 1.500 tokens, custo em dolar nao medido");
    expect(html).toContain("No mes: 9 consultas ao modelo, 7.000 tokens, custo em dolar nao medido");
    expect(html).toContain("Preco por milhao de tokens: nao informado");
  });

  test("with a price the dollars are shown, and the price in force is written", () => {
    const html = draw({ usage: usage({ today: T({ usd: 0.0045 }), prices: { input: 3, output: 15 } }) });
    expect(html).toContain("US$ 0,0045");
    expect(html).toContain("Preco por milhao de tokens: US$ 3 de entrada e US$ 15 de saida");
  });

  test("the latest calls are listed, newest first, without any text of the model or of the question", () => {
    const html = draw();
    expect(html).toContain("ha 1 min, ativo, jev-latest, respondido, 740 tokens, 0,8 s");
    expect(html).not.toMatch(/pergunta|prompt|resposta do modelo/i);
  });

  test("no calls yet says so, and a missing answer of the core says so too", () => {
    expect(draw({ usage: usage({ today: T({ calls: 0, tokens: 0, usd: 0 }), month: T({ calls: 0, tokens: 0, usd: 0 }), recent: [] }) })).toContain("Nenhum pedido ao modelo ainda");
    expect(draw({ usage: null })).toContain("Leitura do uso indisponivel: o nucleo local nao respondeu");
  });
});

describe("the price form", () => {
  test("two fields for the dollars per million tokens and a button to keep them, and one to clear when there is a price", () => {
    const empty = draw();
    expect(empty).toContain('aria-label="Dolares por milhao de tokens de entrada"');
    expect(empty).toContain('aria-label="Dolares por milhao de tokens de saida"');
    expect(empty).toContain(">Salvar precos<");
    expect(empty).not.toContain(">Limpar precos<");
    expect(draw({ usage: usage({ prices: { input: 3, output: 15 } }) })).toContain(">Limpar precos<");
  });

  test("the fields start with the price in force, and the result of the last save is said", () => {
    const html = draw({ usage: usage({ prices: { input: 3, output: 15 } }), saved: "Precos salvos" });
    expect(html).toContain('value="3"');
    expect(html).toContain('value="15"');
    expect(html).toContain("Precos salvos");
  });
});

describe("the addresses", () => {
  test("every provider with what it is for, what it costs and who speaks to it", () => {
    const html = draw();
    expect(html).toContain("Enderecos que o app usa");
    for (const p of providers) for (const text of [p.label, p.url, p.uso, p.custo, p.quemFala]) expect(html).toContain(text);
  });

  test("with no manifest it says so instead of an empty table", () => {
    expect(draw({ providers: null })).toContain("Lista de enderecos indisponivel");
  });
});

describe("rules of the interface", () => {
  test("plain ASCII, no middle dot, em dash or en dash, nothing that blinks or pulses", () => {
    for (const html of [draw(), draw({ usage: null, providers: null }), draw({ usage: usage({ prices: { input: 3, output: 15 } }), saved: "Precos salvos" })]) {
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(html).not.toMatch(/animation|blink|pulse/i);
    }
  });
});
