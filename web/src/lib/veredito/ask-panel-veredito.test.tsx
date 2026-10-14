// VER-1: the answer card of "Pedir ao Inonu" draws the Veredito when the core sent one, and the answer the way it was when it did not.
// The actions (Aceitar, Ignorar, Silenciar) and the provenance of the model stay where they were. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InonuAskPanel, type InonuAskPanelProps } from "@/components/Desk/InonuAsk";
import { parseAnswer, type AskAnswer } from "@/lib/inonu/client";
import { COMPRAR, ESPERAR_PELO_CUSTO } from "./test-fixtures";

const answer = (over: Partial<AskAnswer> = {}): AskAnswer => ({
  ok: true, id: "a", status: "respondido", briefHash: "h", advisory: true, execution: "never",
  decisao: { action: "buy", candidateId: "zona:abc123", pesos: null, razao: "modelo escolheu zona:abc123 entre 3 candidatos", modelo: "jev-latest" },
  custo: { chamadasOnchainos: 0, tokens: 610, usd: null }, ...over,
});
const noop = () => {};
const draw = (a: AskAnswer, over: Partial<InonuAskPanelProps> = {}) =>
  renderToStaticMarkup(
    <InonuAskPanel state={{ phase: "answered", answer: a, atMs: 1_000_000 }} nowMs={1_010_000} instId="ETH-USDT" status={null} mutedKinds={new Set()} note={null} onAsk={noop} onCancel={noop} onAccept={noop} onIgnore={noop} onMute={noop} onUnmute={noop} {...over} />,
  );

describe("the card with a Veredito", () => {
  const html = draw(answer({ veredito: COMPRAR }));
  test("draws the seal, the sentence and the plan instead of the fixed sentence about the zone", () => {
    expect(html).toContain(">Comprar<");
    expect(html).toContain("Inonu decidiu comprar perto de 99,50.");
    expect(html).toContain("Plano de risco, calculo e nao previsao");
    expect(html).not.toContain("modelo escolheu zona:abc123 entre 3 candidatos");
    expect(html).not.toContain("Inonu decidiu comprar a zona");
  });
  test("keeps the provenance of the model, the cost and the three actions, and says once that nothing was sent", () => {
    expect(html).toContain("modelo: Jev (jev-latest)");
    expect(html).toContain("610 tokens");
    for (const word of [">Aceitar<", ">Ignorar<", "Silenciar zona"]) expect(html).toContain(word);
    expect(html.split("Nenhuma ordem foi enviada").length - 1).toBe(1);
    expect(html).not.toContain("Consultivo: nenhuma ordem e enviada.");
  });
  test("a wait forced by a gate is drawn as a wait, with its own words", () => {
    const wait = draw(answer({ veredito: ESPERAR_PELO_CUSTO }));
    expect(wait).toContain(">Esperar<");
    expect(wait).toContain("O custo de entrar e sair come mais do que o movimento tipico de 1 hora. Esperar.");
    expect(wait).not.toContain("Plano de risco");
  });
  test("the profile form and the Placar are mounted under the plan when the plan has no size", () => {
    const noSize = draw(answer({ veredito: { ...COMPRAR, plano: { ...COMPRAR.plano!, tamanho: null } } }));
    expect(noSize).toContain("Capital em dolares");
    expect(html).not.toContain("Capital em dolares");
  });
});

describe("the card without one", () => {
  test("is what it was: the headline, the model's sentence and the consultive line", () => {
    const html = draw(answer());
    expect(html).toContain("Inonu decidiu comprar a zona abc123");
    expect(html).toContain("modelo escolheu zona:abc123 entre 3 candidatos");
    expect(html).toContain("Consultivo: nenhuma ordem e enviada.");
    expect(html).not.toContain("Plano de risco");
  });
});

describe("the answer on the wire", () => {
  const wire = (extra: Record<string, unknown> = {}) => ({ ok: true, id: "a", status: "respondido", briefHash: "h", advisory: true, execution: "never", custo: { chamadasOnchainos: 0, tokens: 1, usd: null }, decisao: { action: "buy", candidateId: "zona:abc", razao: "x", modelo: "m", pesos: null }, ...extra });
  test("a readable Veredito travels with the answer", () => {
    expect(parseAnswer(JSON.parse(JSON.stringify(wire({ veredito: COMPRAR }))))?.veredito).toEqual(COMPRAR);
  });
  test("an unreadable one is dropped and the answer still comes, as before", () => {
    const parsed = parseAnswer(wire({ veredito: { ...COMPRAR, selo: "long" } }));
    expect(parsed).not.toBeNull();
    expect(parsed?.veredito).toBeUndefined();
    expect(parsed?.decisao?.action).toBe("buy");
  });
  test("no Veredito, no field", () => {
    expect("veredito" in (parseAnswer(wire()) ?? {})).toBe(false);
  });
});
