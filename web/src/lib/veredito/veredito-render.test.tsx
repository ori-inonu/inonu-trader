// VER-1 to VER-6, UX-2: the Veredito card. The seal is a word; the reasons are in plain words with the technical ones explained; the
// plan is a calculation, never a forecast; a gate that forced "esperar" says which one; nothing is animated; and every line says
// that nothing was sent. Plain ASCII, no dash, no middle dot. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PerfilForm } from "@/components/Veredito/PerfilInline";
import { PlacarText } from "@/components/Veredito/PlacarLine";
import { VereditoBody } from "@/components/Veredito/VereditoBody";
import { COMPRAR, ESPERAR_PELO_CUSTO, SEM_TAMANHO } from "./test-fixtures";
import type { Veredito } from "./types";

const draw = (v: Veredito, instId = "ETH-USDT", extra: Partial<Parameters<typeof VereditoBody>[0]> = {}) => renderToStaticMarkup(<VereditoBody veredito={v} instId={instId} {...extra} />);
/** The visible text: a block ends with a space, an explained word (abbr) does not cut the sentence it is in. */
const text = (html: string): string => html.replace(/<\/(dt|dd|li|p|h4|span|div|section|ul|dl|form|label|button)>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

describe("a buy", () => {
  const html = draw(COMPRAR);
  test("the seal is a word, with the sentence, and the data attributes say what it is", () => {
    expect(html).toContain(">Comprar<");
    expect(html).toContain("Inonu decidiu comprar perto de 99,50.");
    expect(html).toContain('data-selo="comprar"');
    expect(html).toContain('data-gate="nenhum"');
    expect(html).toContain('aria-label="Veredito do Inonu"');
  });
  test("the reasons come under Por que, the risk under what can go wrong, and the technical words are explained", () => {
    expect(html).toContain("Por que");
    expect(html).toContain("O que pode dar errado");
    expect(text(html)).toContain("Contra: a estrutura de 15 minutos virou para baixo ha 2 velas.");
    expect(html).toContain('data-term="zona_demanda"');
    expect(html).toContain('data-term="absorcao"');
    expect(html).toContain('data-term="estrutura"');
    expect(html).toContain("Faixa de preco onde, antes, houve muita compra");
  });
  test("the plan is titled as a calculation and not a forecast, with each row", () => {
    expect(html).toContain("Plano de risco, calculo e nao previsao");
    const t = text(html);
    expect(t).toContain("Entrada 98,500 a 99,500");
    expect(t).toContain("A ideia cai em 98,000");
    expect(t).toContain("Alvo 103,000");
    expect(t).toContain("Ganho sobre risco 1,88 depois dos custos");
    expect(t).toContain("Custo de entrar e sair 0,24%");
    expect(t).toContain("Tamanho US$ 572,23 (5,751 ETH) para perder US$ 10,00 se a ideia cair");
  });
  test("the confidence is about the consistency of the answers, the zone is described, the warnings and the line that nothing was sent are there", () => {
    const t = text(html);
    expect(t).toContain("Consistencia das respostas do modelo: alta.");
    expect(t).toContain("Forca da zona: 62 de 100. Descreve a zona, nao preve o preco.");
    expect(t).toContain("O acerto destas respostas ainda nao foi medido.");
    expect(t).toContain("Nenhuma ordem foi enviada.");
  });
  test("it never promises, never uses a dash or a middle dot, and never animates", () => {
    expect(html).not.toMatch(/[\u2013\u2014\u00b7]/);
    expect(html.toLowerCase()).not.toMatch(/lucro|garant|certeza|vai (subir|cair)|blink|pulse|animation/);
  });
});

describe("a wait forced by a gate", () => {
  const html = draw(ESPERAR_PELO_CUSTO);
  test("says which gate in its own words, and draws no plan, no reasons and no size", () => {
    expect(html).toContain(">Esperar<");
    expect(html).toContain('data-gate="custo"');
    expect(text(html)).toContain("O custo de entrar e sair come mais do que o movimento tipico de 1 hora. Esperar.");
    expect(html).not.toContain("Plano de risco");
    expect(html).not.toContain("Por que");
    expect(text(html)).toContain("Consistencia das respostas do modelo: nao informada.");
  });
  test("a wait the model chose has its reason under Por que esperar", () => {
    const held = draw({ ...ESPERAR_PELO_CUSTO, forcadoPor: null, mensagem: "Inonu decidiu esperar.", motivos: ["Nao ha sinal claro nos numeros de agora."] });
    expect(held).toContain("Por que esperar");
    expect(held).toContain('data-gate="nenhum"');
  });
});

describe("the pieces that are not the body", () => {
  test("without a profile the form for it takes the place under the plan, and with one it does not", () => {
    const slot = <span data-testid="perfil">formulario</span>;
    expect(draw(SEM_TAMANHO, "ETH-USDT", { perfilSlot: slot })).toContain("formulario");
    expect(draw(COMPRAR, "ETH-USDT", { perfilSlot: slot })).not.toContain("formulario");
    expect(draw(ESPERAR_PELO_CUSTO, "ETH-USDT", { perfilSlot: slot })).not.toContain("formulario");
  });
  test("the Placar slot is drawn before the line that nothing was sent", () => {
    const html = draw(COMPRAR, "ETH-USDT", { placarSlot: <PlacarText placar={{ estado: "nao_medido", texto: "Placar: 3 de 30 respostas medidas. Sem numero ate la.", medidas: 3, minimo: 30 }} /> });
    expect(html.indexOf("Placar: 3 de 30")).toBeGreaterThan(0);
    expect(html.indexOf("Placar: 3 de 30")).toBeLessThan(html.indexOf("Nenhuma ordem foi enviada."));
    expect(renderToStaticMarkup(<PlacarText placar={null} />)).toBe("");
  });
  test("the profile form says what it asks for and why, and shows a note when it has one", () => {
    const html = renderToStaticMarkup(<PerfilForm capital="1000" risco="0,5" nota="Salvo. Na proxima resposta o tamanho aparece." ocupado={false} onCapital={() => {}} onRisco={() => {}} onSalvar={() => {}} />);
    expect(html).toContain("Capital em dolares");
    expect(html).toContain("Risco por operacao em %");
    expect(html).toContain("diga com quanto voce opera e quanto aceita perder");
    expect(html).toContain('role="status"');
    expect(html).toContain('value="1000"');
    expect(renderToStaticMarkup(<PerfilForm capital="" risco="" nota={null} ocupado onCapital={() => {}} onRisco={() => {}} onSalvar={() => {}} />)).toContain("disabled");
  });
});
