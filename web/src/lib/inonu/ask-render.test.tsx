// ASK-7, ASK-9, ASK-10, AC-ASK-4, AC-ASK-5: the "Pedir ao Inonu" panel. The button is the only way to ask; the state line
// replaces the old System One sentence; a decision is a card with Aceitar, Ignorar and Silenciar tipo, shows the model as
// provenance ("modelo: Jev"), and says that no order is sent. Plain ASCII, nothing animated.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InonuAskPanel, type InonuAskPanelProps } from "@/components/Desk/InonuAsk";
import type { AskAnswer, InonuStatus } from "./client";

const answer = (over: Partial<AskAnswer> = {}): AskAnswer => ({
  ok: true, id: "a", status: "respondido", briefHash: "h", advisory: true, execution: "never",
  decisao: { action: "buy", candidateId: "spot:BTC-USDT", pesos: null, razao: "modelo escolheu spot:BTC-USDT entre 3 candidatos", modelo: "jev-latest" },
  custo: { chamadasOnchainos: 0, tokens: 610, usd: null }, ...over,
});

const status = (over: Partial<InonuStatus> = {}): InonuStatus => ({
  modelConfigured: true, running: null, today: { calls: 0, usd: 0 },
  engine: { feedState: "live", messagesPerSecond: 40, instruments: [{ instId: "BTC-USDT", closedCandles: 3, needed: 50, lastTradeAgeMs: 300 }] }, ...over,
});

const noop = () => {};
const props = (over: Partial<InonuAskPanelProps> = {}): InonuAskPanelProps => ({
  state: { phase: "idle" }, nowMs: 2_000_000, instId: "BTC-USDT", status: status(), mutedKinds: new Set(), note: null,
  onAsk: noop, onCancel: noop, onAccept: noop, onIgnore: noop, onMute: noop, onUnmute: noop, ...over,
});
const draw = (over: Partial<InonuAskPanelProps> = {}) => renderToStaticMarkup(<InonuAskPanel {...props(over)} />);

describe("idle", () => {
  test("a button that says Pedir ao Inonu, and the line Sem pedido instead of the System One sentence", () => {
    const html = draw();
    expect(html).toContain("Pedir ao Inonu");
    expect(html).toContain("Sem pedido");
    expect(html).not.toContain("System One");
    expect(html).not.toContain("Jev nao consultado");
    expect(html).not.toContain("Pedir ao Jev");
  });

  test("the warm-up of the flow is told in minutes, and a ready engine says so", () => {
    expect(draw()).toContain("Aquecendo o fluxo: 3 de 50 min");
    const ready = draw({ status: status({ engine: { feedState: "live", messagesPerSecond: 40, instruments: [{ instId: "BTC-USDT", closedCandles: 50, needed: 50, lastTradeAgeMs: 100 }] } }) });
    expect(ready).toContain("Fluxo pronto");
  });

  test("for an on-chain token the panel says what the question is about and tells no flow line of the exchange engine", () => {
    const html = draw({ instId: "token:501:So11111111111111111111111111111111111111112", targetLabel: "SOL na rede 501" });
    expect(html).toContain("Pergunta sobre SOL na rede 501");
    expect(html).not.toContain("Aquecendo o fluxo");
    expect(html).not.toContain("Fluxo pronto");
    expect(html).toContain("Pedir ao Inonu");
    expect(html).not.toMatch(/[·—–]/);
    // for an OKX instrument there is no such line
    expect(draw()).not.toContain("Pergunta sobre");
  });

  test("with no model key the way to fix it is a link, and the button is still the only way in", () => {
    const html = draw({ status: status({ modelConfigured: false }) });
    expect(html).toContain("Configure a chave do modelo em Configuracoes");
    expect(html).toContain('href="/configuracoes"');
  });

  test("a feed that is not live is said, and an unknown status says nothing it does not know", () => {
    expect(draw({ status: status({ engine: { feedState: "reconnecting", messagesPerSecond: 0, instruments: [] } }) })).toContain("Fluxo ao vivo: reconectando");
    expect(draw({ status: null })).not.toContain("Aquecendo");
  });
});

describe("the missing key is said once", () => {
  test("when the request itself failed for lack of a key, the state line says it and the hint does not repeat it", () => {
    const failed = draw({ state: { phase: "failed", answer: answer({ ok: false, status: "sem_chave", motivo: "sem_chave", decisao: undefined }) }, status: status({ modelConfigured: false }) });
    expect(failed.match(/Configure a chave do modelo em Configuracoes/g)).toHaveLength(1);
    expect(failed).toContain('href="/configuracoes"'); // the link stays, on the state line itself
  });
});

describe("asking", () => {
  test("shows Perguntando ao Inonu, the button is busy, and there is a way to cancel", () => {
    const html = draw({ state: { phase: "asking" } });
    expect(html).toContain("Perguntando ao Inonu");
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Pedir ao Inonu/);
    expect(html).toContain("Cancelar");
  });
});

describe("answered", () => {
  const html = draw({ state: { phase: "answered", answer: answer(), atMs: 2_000_000 - 120_000 } });

  test("the decision, how long ago, the reason the code wrote, the model as provenance, the cost, and the advisory notice", () => {
    expect(html).toContain("Inonu respondeu ha 2 min");
    expect(html).toContain("Inonu decidiu comprar spot BTC-USDT");
    expect(html).toContain("modelo escolheu spot:BTC-USDT entre 3 candidatos");
    expect(html).toContain("modelo: Jev");
    expect(html).toContain("jev-latest");
    expect(html).toContain("610 tokens, custo em dolar nao medido");
    expect(html).toContain("Consultivo: nenhuma ordem e enviada");
  });

  test("the three actions are there, and Silenciar names the kind", () => {
    expect(html).toContain(">Aceitar<");
    expect(html).toContain(">Ignorar<");
    expect(html).toContain("Silenciar spot");
  });

  test("hold has no kind to mute beyond hold itself and says so plainly", () => {
    const hold = draw({ state: { phase: "answered", atMs: 2_000_000, answer: answer({ decisao: { action: "hold", candidateId: null, pesos: null, razao: "x", modelo: "jev-latest" } }) } });
    expect(hold).toContain("Inonu decidiu esperar");
  });

  test("after Aceitar the panel says it was written to the local journal and that nothing was sent", () => {
    const accepted = draw({ state: { phase: "answered", answer: answer(), atMs: 2_000_000 }, note: "aceita" });
    expect(accepted).toContain("Registrado no diario local. Nenhuma ordem foi enviada.");
    const ignored = draw({ state: { phase: "answered", answer: answer(), atMs: 2_000_000 }, note: "ignorada" });
    expect(ignored).toContain("Ignorada. Registrado no diario local.");
  });

  test("after Aceitar the sentence depends on the family of the candidate, and in none of them was an order sent (ASK-14)", () => {
    const withCandidate = (candidateId: string | null) =>
      draw({ state: { phase: "answered", atMs: 2_000_000, answer: answer({ decisao: { action: candidateId === null ? "hold" : "buy", candidateId, pesos: null, razao: "x", modelo: "jev-latest" } }) }, note: "aceita" });
    expect(withCandidate("spot:BTC-USDT")).toContain("Registrado no diario local. Nenhuma ordem foi enviada.");
    expect(withCandidate("zona:a1b2c3d4e5f6")).toContain("Registrado no diario local, com a razao. Nenhuma ordem foi enviada.");
    expect(withCandidate(null)).toContain("Registrado no diario local, com a razao. Nenhuma ordem foi enviada.");
    const token = withCandidate("token:501:abc");
    expect(token).toContain("o ticket da aba Carteira foi preenchido. Nenhuma ordem foi enviada.");
    for (const html of [withCandidate("spot:BTC-USDT"), withCandidate("zona:a1b2c3d4e5f6"), withCandidate(null), token]) expect(html).not.toMatch(/[·—–]/);
  });

  test("a muted kind hides the card, says so, and offers to turn it back on", () => {
    const muted = draw({ state: { phase: "answered", answer: answer(), atMs: 2_000_000 }, mutedKinds: new Set(["spot"]) });
    expect(muted).not.toContain("Inonu decidiu");
    expect(muted).toContain("Respostas de spot silenciadas");
    expect(muted).toContain("Reativar spot");
  });
});

describe("failed", () => {
  test("a refusal is a sentence about what to do, and there is no card", () => {
    const html = draw({ state: { phase: "failed", answer: answer({ ok: false, status: "teto_atingido", motivo: "teto_diario", decisao: undefined }) } });
    expect(html).toContain("Limite de custo do dia atingido. Nada foi enviado ao modelo");
    expect(html).not.toContain("Aceitar");
  });
});

describe("rules of the interface", () => {
  test("plain ASCII in every state, no dash or middle dot, and Jev only as the model", () => {
    const states: InonuAskPanelProps["state"][] = [
      { phase: "idle" }, { phase: "asking" },
      { phase: "answered", answer: answer(), atMs: 2_000_000 },
      { phase: "failed", answer: answer({ ok: false, status: "erro", motivo: "servidor_sem_rota", decisao: undefined }) },
    ];
    for (const state of states) {
      const html = draw({ state });
      const text = html.replace(/<[^>]*>/g, " ");
      expect(/^[\x20-\x7e\s]*$/.test(text)).toBe(true);
      expect(text).not.toMatch(/[·—–]/);
      for (const match of text.matchAll(/Jev/g)) expect(text.slice(Math.max(0, match.index - 8), match.index + 3)).toMatch(/modelo: Jev|\(Jev\)/);
    }
  });

  test("the stylesheet has no animation and nothing blinks or pulses", async () => {
    const css = await Bun.file(new URL("../../components/Desk/InonuAsk.module.css", import.meta.url)).text();
    expect(css).not.toMatch(/@keyframes|animation\s*:|animation-name|transition\s*:|blink|pulse/i);
  });
});
