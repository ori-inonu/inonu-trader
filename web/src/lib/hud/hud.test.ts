// origin: synthetic_fixture, tests only. The command centre: the model it draws from, the scene of every tab at every shape, what it must never write, its live arithmetic and the reading of the Inonu.
import { describe, expect, test } from "bun:test";
import { NOW, rawStatus, sampleStatus } from "../agent/fixtures";
import type { AgentStatus } from "../agent/types";
import { COMPACT_H } from "./draw/compact";
import { pickLayout } from "./draw/layout";
import { buildScene, isTab, stageSize, TABS, TALL_BELOW, type TabKey } from "./draw/scene";
import { insights, INSIGHT_MAX } from "./insights";
import { countdownAt, easeOut, formatCount, nextLook } from "./live";
import { blockText, buildHudModel } from "./model";
import { EMPTY_ANALYSIS, parseAnalysis } from "./parse-analysis";
import { IDLE_UI, type Analysis, type HudUi, type WindowStats } from "./types";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import HudGate from "../../components/Hud/HudGate";

const win = (vals: number[]): WindowStats => ({ n: vals.length, up: vals.filter((v) => v > 0).length, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, vals });
const ANALYSIS: Analysis = {
  atMs: NOW,
  funnel: { consults: 20, items: 140, closed: 70, open: 70, asked: 9, applied: 3, executed: 2, failed: 1 },
  asks: [{ t: NOW - 600_000, s: "STONK", p: 0.91, ok: true }, { t: NOW - 300_000, s: "HOTBOT", p: 0.55, ok: false }],
  hist: { all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], fresh: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0] },
  timeline: [{ t: NOW - 900_000, open: 5, asked: 1, applied: 0 }, { t: NOW - 600_000, open: 6, asked: 2, applied: 1 }, { t: NOW - 300_000, open: 4, asked: 0, applied: 0 }],
  trips: [{ s: "STONK", in: 11, out: 10.97, pct: -0.28, buyAt: NOW - 1_800_000, sellAt: NOW - 1_680_000 }, { s: "HOTBOT", in: 11, out: 10.85, pct: -1.38, buyAt: NOW - 3_600_000, sellAt: NOW - 3_000_000 }],
  fees: { lamports: 421_530, fills: 4, unmatchedSells: 0 },
  placar: { skipped: { "15m": win([1.2, -0.4, 3, 0.8, -2, 5]), "1h": win([2, 4, -1, 6, -3, 1]) }, closed: { "15m": win([-1, 0.5]), "1h": win([]) }, gated: { "15m": win([0.3]), "1h": win([0.9]) } },
  recent: [{ t: NOW - 120_000, s: "AAA", kind: "pulada pelo Jev", m15: 1.1, m1h: null }, { t: NOW - 240_000, s: "BBB", kind: "puxada pelo codigo", m15: null, m1h: null }, { t: NOW - 360_000, s: "CCC", kind: "pedida e recusada", m15: -0.8, m1h: 2.2 }],
  orders: { outcomes: { executada: 2, falhou: 1, incerta: 0 }, reasons: { simulacao_falhou: 1 }, spentToday: { buy: 22, sell: 11 } },
  runtime: { tokensToday: 142_472, riskPct: 0.01 },
};

function withCandidates(symbols: readonly string[] = ["BBB", "CCC", "DDD"]): AgentStatus {
  const base = sampleStatus();
  const last = base.last!;
  return {
    ...base,
    last: {
      ...last,
      view: symbols.map((s, i) => ({
        id: `buy:token:1:0x${i}`, kind: "buy" as const, symbol: s, chainIndex: "1", stance: i === 0 ? "buy_third" : "skip", families: [], marks: i === 1 ? ["entrada_esticada"] : [],
        closed: i === 2 ? "liquidez_baixa" : null, probs: i === 2 ? null : { skip: 0.4 - i * 0.1, buy_third: 0.6 + i * 0.1 }, facets: i === 2 ? null : { late_entry: 0.3, still_falling: 0.1, accumulating: 0.7, exit_easy: 0.8, distribution: 0.2, fading: 0.4 },
      })),
    },
  };
}

const textOf = (html: string): string => Array.from(html.matchAll(/>([^<>]+)</g)).map((m) => m[1]!).join("\n");

describe("the model: what comes from outside is cleaned once and what the core did not say stays null", () => {
  test("a hostile symbol never reaches the markup, in any panel of any tab", () => {
    const evil = withCandidates(["<script>alert(1)</script>", "A&B\"C'D", "OK"]);
    const analysis: Analysis = { ...ANALYSIS, trips: [{ ...ANALYSIS.trips[0]!, s: "ZZ" }], asks: [{ t: NOW, s: "X", p: 0.9, ok: true }] };
    for (const tab of TABS.map((t) => t[0])) {
      for (const aspect of [16 / 9, 0.5]) {
        const { html } = buildScene(buildHudModel(evil, analysis, NOW), tab, aspect);
        expect(html).not.toContain("<script");
        expect(html).not.toContain("alert(1)</");
        expect(html).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#)/);
      }
    }
    const model = buildHudModel(evil, ANALYSIS, NOW);
    expect(model.candidates.map((c) => c.s)).toEqual(["scriptalert1sc", "ABCD", "OK"]);
  });

  test("with no analysis the model says so and carries empty numbers, not invented ones", () => {
    const model = buildHudModel(withCandidates(), null, NOW);
    expect(model.analysisOk).toBe(false);
    expect(model.a).toBe(EMPTY_ANALYSIS);
    expect(model.budget.tokens).toBeNull();
    expect(model.agent.riskPct).toBeNull();
  });

  test("the candidate keeps its preference for buying, what the model asked and what the cycle did", () => {
    const model = buildHudModel(withCandidates(), ANALYSIS, NOW);
    const [a, b, c] = model.candidates;
    expect(a).toMatchObject({ s: "BBB", closed: false, requested: "buy_third", applied: "buy_third" });
    expect(a!.pbuy).toBeCloseTo(0.6);
    expect(b).toMatchObject({ s: "CCC", requested: "buy_third", applied: "skip" });
    expect(c).toMatchObject({ s: "DDD", closed: true, pbuy: null, requested: null });
  });

  test("the age of the wallet reading is the core's own moment, kept for the screen to word carefully", () => {
    const model = buildHudModel(sampleStatus(), ANALYSIS, NOW);
    expect(model.wallet.readAtMs).toBe(NOW - 4 * 60_000);
  });
});

describe("the scene: every tab at every shape", () => {
  const shapes: readonly (readonly [string, number])[] = [["wide 16:9", 16 / 9], ["ultrawide", 2.6], ["laptop 4:3", 1.33], ["tablet", 1.25], ["phone", 0.46], ["square-ish", 1.0]];

  test("each tab draws at each shape, with the analysis and without it, and never throws", () => {
    for (const analysis of [ANALYSIS, null]) {
      for (const [, aspect] of shapes) {
        for (const [tab] of TABS) {
          const scene = buildScene(buildHudModel(withCandidates(), analysis, NOW), tab, aspect);
          expect(scene.html.length).toBeGreaterThan(2_000);
          expect(Number.isFinite(scene.width) && Number.isFinite(scene.height) && scene.height > 0).toBe(true);
          expect(scene.tall).toBe(aspect < TALL_BELOW);
          expect(scene.html).not.toMatch(/NaN|undefined|Infinity|\[object/);
        }
      }
    }
  });

  test("the wide stage grows to the shape of the screen and stays 1920 by 1080 at 16:9", () => {
    expect(stageSize(16 / 9)).toEqual({ w: 1920, h: 1080 });
    expect(stageSize(2.6).w).toBeGreaterThan(1920);
    expect(stageSize(1.33).h).toBeGreaterThan(1080);
    expect(stageSize(5).w).toBe(2600);
  });

  test("the narrow column stacks the panels at a readable width: the canvas is 720 wide and as tall as its panels", () => {
    const scene = buildScene(buildHudModel(withCandidates(), ANALYSIS, NOW), "decisoes", 0.46);
    expect(scene.width).toBe(720);
    const stacked = Object.values(COMPACT_H);
    expect(stacked.every((h) => h > 0)).toBe(true);
    expect(scene.height).toBeGreaterThan(214 + 400);
  });

  test("a tab is a tab: six of them, reachable by role, each marked selected only when it is the current one", () => {
    const html = buildScene(buildHudModel(withCandidates(), ANALYSIS, NOW), "carteira", 16 / 9).html;
    expect(Array.from(html.matchAll(/data-tab="(\w+)" role="tab" tabindex="0" aria-selected="(true|false)"/g)).map((m) => `${m[1]}:${m[2]}`)).toEqual(["comando:false", "decisoes:false", "carteira:true", "resultado:false", "pulados:false", "sistema:false"]);
    expect(TABS.every(([k]) => isTab(k))).toBe(true);
    expect(isTab("controles")).toBe(false);
  });

  test("without the analysis every panel that needs it says so where its data would be, and none draws empty charts", () => {
    for (const tab of ["decisoes", "carteira", "resultado", "pulados"] as TabKey[]) {
      const { html } = buildScene(buildHudModel(withCandidates(), null, NOW), tab, 16 / 9);
      expect(textOf(html)).toMatch(/SEM DADOS DO NUCLEO|A VERSAO DO NUCLEO NAO ENVIA A ANALISE/);
    }
  });

  test("the text on the screen has no accent, no middle dot, no em dash and no en dash", () => {
    for (const analysis of [ANALYSIS, null]) {
      for (const [, aspect] of shapes) {
        for (const [tab] of TABS) {
          const text = textOf(buildScene(buildHudModel(withCandidates(), analysis, NOW), tab, aspect).html);
          expect(text).not.toMatch(/[·—–]/);
          expect(text).not.toMatch(/[À-ÖØ-öø-ÿ]/);
        }
      }
    }
  });

  test("nothing in the drawing blinks or pulses: no opacity animation, no blink or pulse word, no fast loop, on any tab at any shape", () => {
    for (const [, aspect] of shapes) {
      for (const [tab] of TABS) {
        const html = buildScene(buildHudModel(withCandidates(), ANALYSIS, NOW), tab, aspect).html;
        expect(html).not.toMatch(/blink|pulse|pulsar|piscar/i);
        expect(html).not.toMatch(/<animate\s[^>]*attributeName="(opacity|visibility|display|fill|stroke)"/);
        for (const m of html.matchAll(/<animateMotion dur="([\d.]+)s"/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(2);
        for (const m of html.matchAll(/animation:hud-[a-z-]+ ([\d.]+)s linear infinite/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(1.4);
        expect(html).not.toMatch(/animation:(?!hud-)/);
      }
    }
  });

  test("the same data always draws the same markup, whatever was drawn in between: nothing in the string depends on how many times it was built, so a new answer of the core with the same facts changes nothing on screen", () => {
    const model = buildHudModel(withCandidates(), ANALYSIS, NOW);
    for (const [tab] of TABS) {
      for (const aspect of [16 / 9, 0.46]) {
        const first = buildScene(model, tab, aspect).html;
        buildScene(buildHudModel(withCandidates(), null, NOW), "comando", 1.4);
        buildScene(model, "decisoes", 0.46);
        expect(buildScene(model, tab, aspect).html).toBe(first);
      }
    }
  });

  test("the numbers that count up already hold their final text, so a screen without script shows the value", () => {
    const html = buildScene(buildHudModel(withCandidates(), ANALYSIS, NOW), "comando", 16 / 9).html;
    const counted = Array.from(html.matchAll(/data-count="([\d.]+)" data-dec="(\d)" data-pre="([^"]*)" data-suf="([^"]*)">([^<]+)</g));
    expect(counted.length).toBeGreaterThanOrEqual(2);
    for (const [, value, dec, pre, suf, shown] of counted) expect(shown).toBe(formatCount(Number(value), Number(dec), pre!, suf!));
  });
});

describe("the live parts follow the clock and not the data", () => {
  const model = buildHudModel(sampleStatus(), ANALYSIS, NOW);

  test("the countdown to the next look, in minutes and seconds, with its share of the interval", () => {
    // next look in 7 minutes, interval 10 minutes
    const c = countdownAt(model, NOW);
    expect(c.label).toBe("07:00");
    expect(c.frac).toBeCloseTo(0.3, 3);
    expect(c.state).toBe("AGUARDANDO O PROXIMO OLHAR");
    expect(countdownAt(model, NOW + 7 * 60_000 - 3_000).state).toBe("MONTANDO O BRIEF");
  });

  test("a screen that outlived the next look moves it forward by whole intervals, never backwards", () => {
    const target = nextLook(model, NOW + 25 * 60_000)!;
    expect(target).toBe(NOW + 7 * 60_000 + 20 * 60_000);
    expect(target).toBeGreaterThanOrEqual(NOW + 25 * 60_000);
    expect(countdownAt(model, NOW + 25 * 60_000).leftMs).toBeGreaterThan(0);
  });

  test("when the core did not say when the next look is, the screen says so instead of counting", () => {
    const none = { ...model, rhythm: { ...model.rhythm, nextAtMs: null } };
    expect(nextLook(none, NOW)).toBeNull();
    expect(countdownAt(none, NOW)).toMatchObject({ leftMs: null, label: "--:--", state: "SEM HORA DO PROXIMO OLHAR" });
  });

  test("the count-up eases from zero to exactly the written value", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(formatCount(1234.5, 2, "US$ ", "")).toBe("US$ 1.234,50");
    expect(formatCount(0.00421, 5, "", " SOL")).toBe("0,00421 SOL");
  });
});

describe("the reading of the Inonu: derived from the numbers, with their sample sizes, promising nothing", () => {
  test("with a purchase the Jev asked for, the reading says so, with no bar to pass; attention comes first", () => {
    const lines = insights(buildHudModel(withCandidates(), ANALYSIS, NOW));
    expect(lines.length).toBeGreaterThan(3);
    expect(lines[0]!.tone).toBe("warn");
    expect(lines.some((l) => l.text === "O JEV PEDIU COMPRAR NA ULTIMA CONSULTA: BBB")).toBe(true);
    expect(lines.some((l) => /BARRA|PASSOU|CORTOU/.test(l.text))).toBe(false);
    expect(lines.every((l) => l.text.length <= INSIGHT_MAX)).toBe(true);
  });

  test("when he asked for nothing the reading says the strongest preference, without a bar to compare it with", () => {
    const base = withCandidates();
    const none: AgentStatus = { ...base, last: { ...base.last!, view: base.last!.view.map((v) => ({ ...v, stance: "skip" })), dropped: [] } };
    const lines = insights(buildHudModel(none, ANALYSIS, NOW)).map((l) => l.text);
    expect(lines).toContain("O JEV NAO PEDIU COMPRA NA ULTIMA CONSULTA, MAIOR PREFERENCIA: CCC 70%");
    expect(lines.some((l) => /BARRA|EXIGE/.test(l))).toBe(false);
  });

  test("the skipped purchases are reported with their count and as a counterfactual, never as advice", () => {
    const lines = insights(buildHudModel(withCandidates(), ANALYSIS, NOW)).map((l) => l.text);
    const skipped = lines.find((l) => l.startsWith("DAS PULADAS"));
    expect(skipped).toBe("DAS PULADAS: 4 DE 6 SUBIRAM EM 1 H, MEDIA +1,5%, ANTES DE CUSTO");
    expect(lines.some((l) => /LUCRO|GANHAR|VAI SUBIR|COMPRE|VENDA AGORA/.test(l))).toBe(false);
  });

  test("a small sample says it is small and an idle wallet says it earns nothing", () => {
    const small: Analysis = { ...ANALYSIS, placar: { ...ANALYSIS.placar, skipped: { "15m": win([1]), "1h": win([2, 3]) } } };
    expect(insights(buildHudModel(withCandidates(), small, NOW)).map((l) => l.text)).toContain("SO 2 PULADA(S) JA MEDIDA(S) EM 1 H: POUCAS PARA CONCLUIR");
    expect(insights(buildHudModel(sampleStatus(), ANALYSIS, NOW)).map((l) => l.text).some((l) => l.startsWith("CAIXA LIVRE 79%") && l.includes("SEM RENDIMENTO"))).toBe(true);
  });

  test("a position near its stop is a warning with the distance to the target and to the stop", () => {
    const base = sampleStatus();
    const pos = base.book!.positions.map((p) => (p.plan === null ? p : { ...p, plan: { ...p.plan, toTargetPct: 8.4, toStopPct: 1.2 } }));
    const status: AgentStatus = { ...base, book: { ...base.book!, positions: pos } };
    const line = insights(buildHudModel(status, ANALYSIS, NOW)).find((l) => l.text.startsWith("AAA:"))!;
    expect(line.tone).toBe("warn");
    expect(line.text).toBe("AAA: FALTAM 8,4% AO ALVO E 1,2% AO STOP, 31 H DE PRAZO");
  });

  test("without the analysis the lines that need it are simply absent", () => {
    const lines = insights(buildHudModel(withCandidates(), null, NOW)).map((l) => l.text);
    expect(lines.some((l) => l.startsWith("DAS PULADAS") || l.includes("VOLTA(S)") || l.includes("FALHARAM NA CADEIA"))).toBe(false);
  });
});

describe("the analysis from the core is checked before it is drawn", () => {
  test("a body that is not the contract is no analysis at all, never a half-filled one", () => {
    expect(parseAnalysis(null)).toBeNull();
    expect(parseAnalysis({ ok: true, analysis: { funnel: {} } })).toBeNull();
    expect(parseAnalysis({ ok: false })).toBeNull();
  });

  test("a symbol from the core is cleaned on the way in", () => {
    const body = { ok: true, analysis: { ...ANALYSIS, asks: [{ t: 1, s: "<b>X</b>", p: 0.7, ok: true }] } };
    expect(parseAnalysis(body)!.asks[0]!.s).toBe("bXb");
  });
});

describe("the Sistema tab: what the person owns of the machine, in the same drawing as the rest", () => {
  const inFlightStatus = (over: Record<string, unknown> = {}): AgentStatus =>
    sampleStatus({ inFlight: [{ orderKey: "cy-9:buy:token:1:0xabc", atMs: NOW - 12 * 60_000, stage: "incerta", side: "buy", symbol: "<b>STONK</b>", chainIndex: "1", usd: 12, source: "modelo", reason: null, detail: "<script>x</script> sem saldo", ...over }] });
  const html = (status: AgentStatus, ui: HudUi = IDLE_UI, aspect = 16 / 9): string => buildScene(buildHudModel(status, ANALYSIS, NOW, ui), "sistema", aspect).html;

  test("an order that never showed a transaction asks for the person's word with two buttons that carry the order and the outcome; its text is cleaned", () => {
    const out = html(inFlightStatus());
    expect(out).toContain('data-action="resolve" data-key="cy-9:buy:token:1:0xabc" data-outcome="executada"');
    expect(out).toContain('data-action="resolve" data-key="cy-9:buy:token:1:0xabc" data-outcome="falhou"');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<b>");
    expect(textOf(out)).toContain("COMPRA bSTONKb US$ 12");
  });

  test("an order that was seen on the network needs no click: the core confirms it, and the screen says so", () => {
    const out = html(inFlightStatus({ ref: "0xhash" }));
    expect(out).not.toContain('data-action="resolve"');
    expect(textOf(out)).toContain("O AGENTE CONFIRMA SOZINHO, SEM CLIQUE");
  });

  test("with nothing in flight the panel says so and offers nothing to resolve", () => {
    const out = html(sampleStatus());
    expect(textOf(out)).toContain("NENHUMA ORDEM AGUARDANDO RECIBO");
    expect(out).not.toContain('data-action="resolve"');
  });

  test("stopping asks twice: the first button only opens the confirmation, the second and a way back appear, and neither is on screen at once with the first", () => {
    const first = html(sampleStatus());
    expect(first).toContain('data-action="stop"');
    expect(first).not.toContain("stop-confirm");
    const second = html(sampleStatus(), { ...IDLE_UI, confirmStop: true });
    expect(second).toContain('data-action="stop-confirm"');
    expect(second).toContain('data-action="stop-cancel"');
    expect(second).not.toContain('data-action="stop"');
    expect(textOf(second)).toContain("AS POSICOES ABERTAS CONTINUAM NA CARTEIRA");
  });

  test("while a request is in flight the buttons that would start another are off, and the screen says what is being done", () => {
    const out = html(inFlightStatus(), { ...IDLE_UI, busy: "resolve" });
    expect(out).not.toContain('data-action="stop"');
    expect(out).not.toContain('data-action="resolve"');
    expect(out).toContain('aria-disabled="true"');
    expect(textOf(out)).toContain("ANOTANDO A SUA PALAVRA");
  });

  test("the agent decides when to look: there is no button that forces a cycle, and the panel says so", () => {
    const out = html(sampleStatus());
    expect(out).not.toContain('data-action="run"');
    expect(textOf(out)).not.toContain("OLHAR AGORA");
    expect(textOf(out).replace(/\n/g, " ")).toContain("NAO HA BOTAO PARA FORCAR UM CICLO");
  });

  test("the last answer is shown in its colour, wrapped, with no accent", () => {
    const out = html(sampleStatus(), { ...IDLE_UI, notice: { tone: "ok", text: "Olhar feito: decidido, sem mudanca." } });
    expect(textOf(out)).toContain("OLHAR FEITO: DECIDIDO, SEM MUDANCA.");
  });

  test("a page to open is offered only when it is https: the core's address for the sign-in is checked, anything else opens nothing", () => {
    const base = sampleStatus();
    const make = (url: string | null): AgentStatus => ({ ...base, wallet: { ...base.wallet, next: "entrar", login: "aguardando", loginUrl: url } });
    expect(html(make("https://web3.okx.com/login?x=1"))).toContain(`data-action="open" data-url="${encodeURIComponent("https://web3.okx.com/login?x=1")}"`);
    for (const bad of ["http://web3.okx.com/login", "javascript:alert(1)", "https://user:pw@web3.okx.com/", "not a url"]) expect(html(make(bad))).not.toContain('data-action="open"');
  });

  test("an order that waits for the person is said on every tab, in the top bar, with the way to it", () => {
    for (const [tab] of TABS) {
      const out = buildScene(buildHudModel(inFlightStatus(), ANALYSIS, NOW), tab, 16 / 9).html;
      expect(textOf(out)).toContain("1 ORDEM(NS) ESPERAM A SUA PALAVRA: ABA SISTEMA");
    }
    expect(textOf(buildScene(buildHudModel(sampleStatus(), ANALYSIS, NOW), "comando", 16 / 9).html)).not.toContain("ESPERAM A SUA PALAVRA");
  });

  test("there is no way back to an old screen: the word controls is nowhere in the drawing, on any tab or shape", () => {
    for (const [tab] of TABS) for (const aspect of [16 / 9, 0.46]) expect(textOf(buildScene(buildHudModel(sampleStatus(), ANALYSIS, NOW), tab, aspect).html)).not.toMatch(/CONTROLES/);
  });

  test("the panel draws at both shapes with the analysis missing too, and its text has no accent or forbidden dash", () => {
    for (const analysis of [ANALYSIS, null]) for (const aspect of [16 / 9, 0.46]) {
      const text = textOf(buildScene(buildHudModel(inFlightStatus(), analysis, NOW, { ...IDLE_UI, notice: { tone: "bad", text: "Falhou: nao foi possivel." } }), "sistema", aspect).html);
      expect(text).not.toMatch(/[·—–]/);
      expect(text).not.toMatch(/[À-ÖØ-öø-ÿ]/);
    }
  });
});

describe("the standby screen: the same design before there is a centre to show", () => {
  const gate = (props: Partial<Parameters<typeof HudGate>[0]> = {}): string =>
    renderToStaticMarkup(createElement(HudGate, { kind: "disconnected", error: null, busy: false, notice: null, noticeOpen: false, onConnect: () => {}, onAccept: () => {}, onCancel: () => {}, ...props }));

  test("not connected: one thing to do, connect, and nothing from the old screen", () => {
    const out = gate();
    expect(out).toContain("CONECTE A CARTEIRA. O RESTO E COM O INONU.");
    expect(out).toContain("CONECTAR CARTEIRA");
    expect(out).not.toContain("dialog");
    expect(out).not.toMatch(/Controles|CONTROLES/);
  });

  test("the notice is a dialog with the version-proof wording, two buttons, and says nobody guarantees profit", () => {
    const out = gate({ noticeOpen: true });
    expect(out).toContain('role="dialog"');
    expect(out).toContain("ENTENDO E CONECTO A CARTEIRA");
    expect(out).toContain("CANCELAR");
    expect(out).toContain("Ninguem garante lucro");
  });

  test("loading and an unreachable core each say what they are, and the second says how to recover", () => {
    expect(gate({ kind: "loading" })).toContain("LENDO O ESTADO DO AGENTE");
    const err = gate({ kind: "error", error: "sem_conexao" });
    expect(err).toContain("Confira se o servidor do agente esta no ar");
    expect(err).not.toContain("CONECTAR CARTEIRA");
  });

  test("a notice from the last attempt shows in its tone", () => {
    expect(gate({ notice: { tone: "bad", text: "A carteira nao pode ser conectada." } })).toContain('class="hud-gate-notice bad"');
  });
});

describe("the quiet rain behind the screen", () => {
  test("every column is made from its own index with a fixed seed: the same index is the same column, whatever else was asked", async () => {
    const { rainColumn, rainColumnCount, RAIN_DURATION_S, RAIN_OPACITY_MAX, RAIN_MAX_COLUMNS } = await import("./rain");
    expect(rainColumn(7)).toEqual(rainColumn(7));
    rainColumn(300);
    expect(rainColumn(7)).toEqual(rainColumn(7));
    expect(rainColumn(7)).not.toEqual(rainColumn(8));
    expect(rainColumnCount(0)).toBe(0);
    expect(rainColumnCount(Number.NaN)).toBe(0);
    expect(rainColumnCount(1920)).toBeLessThanOrEqual(RAIN_MAX_COLUMNS);
    expect(rainColumnCount(5000)).toBe(RAIN_MAX_COLUMNS);
    for (let i = 0; i < RAIN_MAX_COLUMNS; i++) {
      const c = rainColumn(i);
      // slow, faint and made of digits only: it moves, it never blinks, and it says nothing
      expect(c.durationS).toBeGreaterThanOrEqual(RAIN_DURATION_S.min);
      expect(c.durationS).toBeLessThanOrEqual(RAIN_DURATION_S.max);
      expect(c.opacity).toBeLessThanOrEqual(RAIN_OPACITY_MAX);
      expect(c.delayS).toBeLessThanOrEqual(0);
      expect(c.glyphs).toMatch(/^[0-9A-F]{14,31}$/);
    }
  });
});

describe("no ceilings: the owner's decision of 2026-10-14 reaches the screen as it is", () => {
  const withCaps = (caps: unknown): AgentStatus => {
    const raw = rawStatus().status as { autopilot: { settings: Record<string, unknown> } };
    return sampleStatus({ autopilot: { ...raw.autopilot, settings: { ...raw.autopilot.settings, caps } } });
  };

  test("a core that says null for every ceiling is read as no ceiling, and a core with a missing field is not understood at all", () => {
    expect(withCaps({ maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null }).autopilot?.caps).toEqual({ maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null });
    expect(withCaps({ maxBuyUsd: 25, maxDailyBuyUsd: null, maxDailySellUsd: 500 }).autopilot?.caps).toEqual({ maxBuyUsd: 25, maxDailyBuyUsd: null, maxDailySellUsd: 500 });
    expect(() => withCaps({ maxBuyUsd: null, maxDailyBuyUsd: null })).toThrow();
    expect(() => withCaps({ maxBuyUsd: "25", maxDailyBuyUsd: null, maxDailySellUsd: null })).toThrow();
  });

  test("every place that wrote a ceiling now says there is none, and none draws a ring or a share of a ceiling that does not exist", () => {
    const status = withCaps({ maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null });
    for (const [tab] of TABS) {
      for (const aspect of [16 / 9, 0.46]) {
        const text = textOf(buildScene(buildHudModel(status, ANALYSIS, NOW), tab, aspect).html);
        expect(text.split("\n").filter((l) => /DE US\$ 0\b|LIMITE US\$ 0\b/.test(l))).toEqual([]);
        expect(text).not.toMatch(/NaN|Infinity/);
      }
    }
    const carteira = textOf(buildScene(buildHudModel(status, ANALYSIS, NOW), "carteira", 16 / 9).html);
    expect(carteira).toContain("SEM TETO");
    expect(carteira.split("\n")).toContain("LIVRE");
    expect(textOf(buildScene(buildHudModel(status, ANALYSIS, NOW), "sistema", 16 / 9).html)).toContain("COMPRAS DO DIA");
    expect(textOf(buildScene(buildHudModel(status, ANALYSIS, NOW), "sistema", 16 / 9).html)).toContain("LIMITE SEM TETO");
  });

  test("a ceiling somebody wrote is still shown as a number and as a share used", () => {
    const text = textOf(buildScene(buildHudModel(withCaps({ maxBuyUsd: 25, maxDailyBuyUsd: 100, maxDailySellUsd: 500 }), ANALYSIS, NOW), "carteira", 16 / 9).html);
    expect(text).toContain("US$ 22 DE US$ 100");
    expect(text.split("\n")).not.toContain("LIVRE");
  });
});

describe("leverage: what the owner authorized and what exists, never the agent's own wording passed off as the owner's", () => {
  const withLeverage = (authorizations: unknown): AgentStatus => {
    const raw = rawStatus().status as { autopilot: Record<string, unknown> };
    return sampleStatus({ autopilot: { ...raw.autopilot, authorizations } });
  };
  const lines = (status: AgentStatus, tab: TabKey, aspect = 16 / 9): string[] => textOf(buildScene(buildHudModel(status, ANALYSIS, NOW), tab, aspect).html).split("\n");

  test("the core says the owner authorized it and no instrument exists: the screen says exactly that, in every place it speaks of leverage", () => {
    const status = withLeverage({ leverage: { granted: true, since: "2026-10-14", instruments: [] } });
    expect(status.autopilot?.leverage).toEqual({ granted: true, instruments: 0 });
    expect(lines(status, "comando")).toContain("AUTORIZADA, SEM INSTRUMENTO");
    expect(lines(status, "sistema")).toContain("AUTORIZADA POR VOCE, SEM INSTRUMENTO LIGADO");
    expect(lines(status, "carteira")).toContain("AUTORIZADA POR VOCE, SEM INSTRUMENTO LIGADO");
    expect(lines(status, "sistema", 0.46)).toContain("AUTORIZADA, SEM INSTRUMENTO");
  });

  test("an instrument that exists is counted, a refusal is said as a refusal, and a core that does not say is not guessed", () => {
    expect(lines(withLeverage({ leverage: { granted: true, since: "2026-10-14", instruments: ["emprestimo"] } }), "sistema")).toContain("AUTORIZADA, 1 INSTRUMENTO(S) LIGADO(S)");
    expect(lines(withLeverage({ leverage: { granted: false, since: "2026-10-14", instruments: [] } }), "sistema")).toContain("NAO AUTORIZADA");
    expect(sampleStatus().autopilot?.leverage).toBeNull();
    expect(lines(sampleStatus(), "sistema")).toContain("SEM DADO DO NUCLEO");
  });

  test("nowhere does the screen say the owner decided to turn leverage off: it was never the owner's decision", () => {
    for (const status of [sampleStatus(), withLeverage({ leverage: { granted: true, since: "2026-10-14", instruments: [] } })]) {
      for (const [tab] of TABS) for (const aspect of [16 / 9, 0.46]) expect(lines(status, tab, aspect).join(" ")).not.toMatch(/DECISAO DO DONO|DESLIGAD/);
    }
  });
});

describe("what the Jev chose and the code dropped: said where it is seen, never drawn as carried out", () => {
  type Entry = AgentStatus["ledger"][number];
  const buy = (n: number, symbol: string, stance: string, closed: string | null = null) => ({
    id: `buy:token:501:Mint${n}`, kind: "buy" as const, symbol, chainIndex: "501", stance, families: [], marks: [], closed,
    probs: stance === "skip" ? { skip: 0.9, buy_full: 0.1 } : { skip: 0.2, buy_full: 0.8 }, facets: { late_entry: 0.2, still_falling: 0.1, accumulating: 0.7, exit_easy: 0.8, distribution: 0.2, fading: 0.3 },
  });
  const cycle = (n: number, dropped?: readonly { candidateId: string; reason: string }[]): Entry => ({ kind: "cycle", cycleId: `cy-${n}`, atMs: NOW - (10 - n) * 120_000, outcome: "decidido", reason: null, ...(dropped === undefined ? {} : { dropped }) }) as unknown as Entry;
  const order = (n: number): Entry => ({ kind: "order", cycleId: `cy-${n}`, atMs: NOW - (10 - n) * 120_000, stage: "executada", side: "buy", symbol: "OLD", usd: 10, reason: null }) as unknown as Entry;
  const STONK = { candidateId: "buy:token:501:Mint1", reason: "teto_diario" };

  function status(opts: { mode?: "sombra" | "limitado"; dropped?: readonly { candidateId: string; reason: string }[]; ledger?: readonly Entry[] } = {}): AgentStatus {
    const base = sampleStatus({ mode: opts.mode ?? "limitado" });
    return {
      ...base,
      ledger: opts.ledger ?? [],
      last: { ...base.last!, cycleId: "cy-9", view: [buy(1, "STONK", "buy_full"), buy(2, "HOTBOT", "skip"), buy(3, "DEAD", "skip", "liquidez_baixa")], dropped: opts.dropped ?? [STONK] },
    };
  }
  const flat = (html: string): string => textOf(html).replace(/\n/g, " ");

  test("the candidate and the list of the last cycle carry what was dropped, with the symbol, the side and the code's own reason in plain capitals", () => {
    const model = buildHudModel(status(), ANALYSIS, NOW);
    expect(model.candidates.map((c) => c.blocked)).toEqual([{ code: "teto_diario", text: "PASSOU DO TETO DO DIA" }, null, null]);
    expect(model.last.dropped).toEqual([{ s: "STONK", side: "buy", code: "teto_diario", text: "PASSOU DO TETO DO DIA" }]);
    expect(buildHudModel(status({ dropped: [] }), ANALYSIS, NOW).last).toMatchObject({ dropped: [], streak: null });
  });

  test("a dropped id that is not written the same way is found by the address of its token; one the cycle never listed shows a shortened address, never markup", () => {
    const sell = { candidateId: "hold:token:501:Mint2@agente", reason: "limite_de_ordens" };
    const unknown = { candidateId: "buy:token:501:Zz9Zz9Zz9Zz9Zz9Zz9<script>", reason: "sem_saldo" };
    const model = buildHudModel(status({ dropped: [sell, unknown] }), ANALYSIS, NOW);
    expect(model.last.dropped[0]).toMatchObject({ s: "HOTBOT", side: "sell", text: "PASSOU DO MAXIMO DE ORDENS POR CICLO" });
    expect(model.last.dropped[1]!.s).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(JSON.stringify(model.last)).not.toContain("<script");
  });

  test("every reason the core gives has a wording in capitals without accents, and one it does not know is said as its code, cleaned", () => {
    for (const code of ["teto_diario", "caixa_insuficiente", "abaixo_do_minimo_da_rede", "limite_de_ordens", "sem_saldo", "sem_ordem", "valor_invalido", "gasto_desconhecido", "ordem_em_voo"]) {
      expect(blockText(code)).toMatch(/^[A-Z0-9 ,]{6,48}$/);
      expect(blockText(code)).not.toContain("NAO RECONHECIDO");
    }
    expect(blockText("teto_diario")).toBe("PASSOU DO TETO DO DIA");
    expect(blockText("caixa_insuficiente")).toBe("O CAIXA NAO COBRIA A COMPRA");
    expect(blockText("abaixo_do_minimo_da_rede")).toBe("ABAIXO DO MINIMO DA REDE");
    expect(blockText("uma_razao_nova")).toBe("UMA RAZAO NOVA");
  });

  test("the first line of the reading says what the Jev asked for and that the code blocked it, with the count of consecutive cycles when the record of each cycle proves it", () => {
    const exact = status({ ledger: [cycle(5, [STONK]), cycle(6, []), cycle(7, [STONK]), cycle(8, [{ candidateId: "buy:token:501:MINT1", reason: "caixa_insuficiente" }]), cycle(9, [STONK])] });
    const lines = insights(buildHudModel(exact, ANALYSIS, NOW));
    expect(lines[0]).toEqual({ tone: "warn", text: "O JEV PEDIU COMPRAR STONK E O CODIGO BLOQUEOU: PASSOU DO TETO DO DIA, 3 CICLOS SEGUIDOS" });
    expect(lines.every((l) => l.text.length <= INSIGHT_MAX)).toBe(true);
    // one cycle only: no count
    expect(insights(buildHudModel(status({ ledger: [cycle(9, [STONK])] }), ANALYSIS, NOW))[0]!.text).toBe("O JEV PEDIU COMPRAR STONK E O CODIGO BLOQUEOU: PASSOU DO TETO DO DIA");
  });

  test("when the record of past cycles does not say what they dropped, the count is of cycles without an order and is worded as that, never as blocked requests; a watching agent has no such count", () => {
    const ledger = [cycle(4), order(4), cycle(5), cycle(6), cycle(7), cycle(8), cycle(9)];
    const lines = insights(buildHudModel(status({ ledger }), ANALYSIS, NOW)).map((l) => l.text);
    expect(lines[0]).toBe("O JEV PEDIU COMPRAR STONK E O CODIGO BLOQUEOU: PASSOU DO TETO DO DIA");
    expect(lines).toContain("NENHUMA ORDEM SAIU NOS ULTIMOS 5 CICLOS SEGUIDOS");
    expect(lines.some((l) => l.includes("CICLOS SEGUIDOS") && l.includes("BLOQUEOU"))).toBe(false);
    expect(buildHudModel(status({ ledger, mode: "sombra" }), ANALYSIS, NOW).last.streak).toBeNull();
  });

  test("what was dropped is not listed among the requests that passed", () => {
    const text = insights(buildHudModel(status(), ANALYSIS, NOW)).map((l) => l.text).join("\n");
    expect(text).not.toMatch(/O JEV PEDIU COMPRAR NA ULTIMA CONSULTA: .*STONK/);
  });

  test("the Comando tab says it without a click: the row, the line under the list, the reading, on the stage and in the narrow column", () => {
    const model = buildHudModel(status({ ledger: [cycle(7, [STONK]), cycle(8, [STONK]), cycle(9, [STONK])] }), ANALYSIS, NOW);
    for (const aspect of [16 / 9, 0.46]) {
      const out = flat(buildScene(model, "comando", aspect).html);
      expect(out).toContain("BLOQUEADO");
      expect(out).toContain("PEDIU COMPRAR STONK, O CODIGO BLOQUEOU: PASSOU DO TETO DO DIA, 3 CICLOS SEGUIDOS");
      expect(out).toContain("1 BLOQUEADO(S) PELO CODIGO");
    }
    expect(flat(buildScene(model, "comando", 0.46).html)).toContain("O JEV PEDIU COMPRAR STONK E O CODIGO BLOQUEOU: PASSOU DO TETO DO DIA, 3 CICLOS SEGUIDOS");
  });

  test("a request the code did not carry out is never drawn as passed, in the table of judgments of either shape", () => {
    const model = buildHudModel(status(), ANALYSIS, NOW);
    const wide = flat(buildScene(model, "decisoes", 16 / 9).html);
    expect(wide).toContain("PEDIU E O CODIGO BLOQUEOU");
    expect(wide).toContain("PASSOU DO TETO DO DIA");
    expect(wide).not.toContain("PEDIU E PASSOU");
    const narrow = flat(buildScene(model, "decisoes", 0.46).html);
    expect(narrow).toContain("PEDIU, CODIGO BLOQUEOU");
    expect(narrow).not.toContain("PEDIU E PASSOU");
  });

  test("the funnel does not call what the code dropped a failure of the chain: the step after the bar is words for what was not executed", () => {
    for (const aspect of [16 / 9, 0.46]) {
      const out = flat(buildScene(buildHudModel(status(), ANALYSIS, NOW), "decisoes", aspect).html);
      expect(out).toContain("NAO EXECUTADOS");
      expect(out).not.toContain("FALHARAM NA CADEIA");
    }
  });

  test("in the list of the Jev's requests, the one of the last cycle that the code dropped is BLOQUEADA, not a request carried out; the older ones keep their word and the old ones that never became an order say so", () => {
    const at = NOW - 3 * 60_000;
    const asks = [{ t: NOW - 600_000, s: "STONK", p: 0.91, ok: true }, { t: at, s: "STONK", p: 0.88, ok: true }, { t: at, s: "HOTBOT", p: 0.55, ok: false }];
    const model = buildHudModel(status(), { ...ANALYSIS, asks }, NOW);
    expect(model.last.atMs).toBe(at);
    for (const aspect of [16 / 9, 0.46]) {
      const lines = textOf(buildScene(model, "decisoes", aspect).html).split("\n");
      expect(lines.filter((l) => l === "BLOQUEADA")).toHaveLength(1);
      expect(lines.filter((l) => l === "PEDIDA")).toHaveLength(1);
      expect(lines.filter((l) => l === "SEM ORDEM")).toHaveLength(1);
    }
    // nothing dropped: the same asks are all what the bar said
    const plain = textOf(buildScene(buildHudModel(status({ dropped: [] }), { ...ANALYSIS, asks }, NOW), "decisoes", 16 / 9).html).split("\n");
    expect(plain).not.toContain("BLOQUEADA");
    expect(plain.filter((l) => l === "PEDIDA")).toHaveLength(2);
  });

  test("with nothing dropped nothing about a block is drawn", () => {
    const model = buildHudModel(status({ dropped: [] }), ANALYSIS, NOW);
    // the funnel always names what the code blocks ("BLOQUEADOS PELO CODIGO"); what must not be there is a request that was blocked
    for (const tab of ["comando", "decisoes"] as TabKey[]) for (const aspect of [16 / 9, 0.46]) expect(textOf(buildScene(model, tab, aspect).html)).not.toMatch(/BLOQUEOU|(^|\n)BLOQUEAD[OA](\n|$)|ULTIMO: /);
  });
});

describe("an agent that is not running cycles is said plainly, on every tab, and one that is running is not touched", () => {
  const WATCH = { started: false, nextAtMs: null, lastAtMs: NOW - 3 * 60_000, intervalMin: 2 };
  const RUN = { started: true, nextAtMs: NOW + 60_000, lastAtMs: NOW - 60_000, intervalMin: 2 };
  const stopped = (over: Record<string, unknown> = {}): AgentStatus => sampleStatus({ mode: "limitado", scheduler: WATCH, ...over });
  const running = (over: Record<string, unknown> = {}): AgentStatus => sampleStatus({ mode: "limitado", scheduler: RUN, ...over });
  const flat = (status: AgentStatus, tab: TabKey, aspect: number, analysis: Analysis | null = ANALYSIS): string => textOf(buildScene(buildHudModel(status, analysis, NOW), tab, aspect).html).replace(/\n/g, " ");
  const SHAPES = [16 / 9, 1.4, 0.46] as const;

  test("the model carries whether the core is cycling, read from the scheduler and from nothing else", () => {
    expect(buildHudModel(stopped(), ANALYSIS, NOW).agent.cycling).toBe(false);
    expect(buildHudModel(running(), ANALYSIS, NOW).agent.cycling).toBe(true);
  });

  test("the chip in the top bar says ACOMPANHAMENTO, AGENTE PARADO instead of the connected one, on every tab and every shape; a running agent keeps its own chip", () => {
    for (const tab of TABS.map((t) => t[0])) {
      for (const aspect of SHAPES) {
        const off = flat(stopped(), tab, aspect);
        expect(off).toContain("ACOMPANHAMENTO, AGENTE PARADO");
        expect(off).not.toContain("CONECTADO");
        const on = flat(running(), tab, aspect);
        expect(on).toContain("CONECTADO");
        expect(on).not.toContain("ACOMPANHAMENTO, AGENTE PARADO");
      }
    }
  });

  test("the next look says PARADO and not a clock that counts to nothing, in the arithmetic and in the first drawing; a running agent counts as before", () => {
    const off = buildHudModel(stopped(), ANALYSIS, NOW);
    expect(countdownAt(off, NOW)).toMatchObject({ leftMs: null, label: "PARADO", state: "ACOMPANHAMENTO: NENHUMA ORDEM SAI" });
    expect(countdownAt(buildHudModel(running(), ANALYSIS, NOW), NOW).label).toBe("01:00");
    expect(flat(stopped(), "comando", 16 / 9)).toContain("PARADO");
    expect(flat(stopped(), "comando", 16 / 9)).not.toContain("AGUARDANDO O PROXIMO OLHAR");
    expect(flat(running(), "comando", 16 / 9)).toContain("AGUARDANDO O PROXIMO OLHAR");
  });

  test("the health of the system never says nothing asks for attention while the agent is stopped: its first item is that it is stopped", () => {
    for (const aspect of [16 / 9, 0.46]) {
      const off = flat(stopped(), "comando", aspect);
      expect(off).not.toContain("NADA PEDE ATENCAO AGORA");
      expect(off).toContain("HA ITENS QUE PEDEM ATENCAO");
      expect(off).toContain("AGENTE PARADO, SO ACOMPANHAMENTO, NENHUMA ORDEM SAI");
    }
    // first in the list: its label is the first row of the panel
    const lines = textOf(buildScene(buildHudModel(stopped(), ANALYSIS, NOW), "comando", 16 / 9).html).split("\n");
    expect(lines.indexOf("ATENCAO")).toBeGreaterThan(-1);
    expect(lines[lines.indexOf("ATENCAO") + 1]).toBe("AGENTE PARADO, SO ACOMPANHAMENTO, NENHUMA ORDEM SAI");
    expect(lines.indexOf("ATENCAO")).toBeLessThan(lines.indexOf("CONEXAO COM A CARTEIRA"));
  });

  test("the Sistema tab says it at the top, on the stage and in the column", () => {
    for (const aspect of [16 / 9, 0.46]) {
      // in the column the line is wrapped in two, so the words are read joined
      const text = flat(stopped(), "sistema", aspect);
      const at = text.indexOf("AGENTE PARADO, SO ACOMPANHAMENTO, NENHUMA ORDEM SAI");
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(text.indexOf("CARTEIRA DO AGENTE"));
      expect(flat(running(), "sistema", aspect)).not.toContain("AGENTE PARADO");
    }
  });

  test("the reading says first that the agent is stopped, and says nothing of the last consult as if it were now", () => {
    const off = insights(buildHudModel(stopped(), ANALYSIS, NOW));
    expect(off[0]).toEqual({ tone: "warn", text: "AGENTE PARADO, SO ACOMPANHAMENTO, NENHUMA ORDEM SAI" });
    expect(off.some((l) => /^O JEV PEDIU|PASSOU PELA BARRA|MAIOR PREFERENCIA|NENHUMA ORDEM SAIU/.test(l.text))).toBe(false);
    expect(insights(buildHudModel(running(), ANALYSIS, NOW)).some((l) => l.text.startsWith("AGENTE PARADO"))).toBe(false);
    expect(off.every((l) => l.text.length <= INSIGHT_MAX)).toBe(true);
  });

  test("a panel that spoke of now says it is the last one: the decision panel and the rhythm", () => {
    const off = flat(stopped(), "comando", 16 / 9);
    expect(off).toContain("ULTIMA DECISAO");
    expect(off).not.toContain("DECISAO AGORA");
    expect(flat(running(), "comando", 16 / 9)).toContain("DECISAO AGORA");
    expect(flat(stopped(), "sistema", 16 / 9)).toMatch(/RITMO DOS OLHARES PARADO/);
  });

  test("with no reading of the wallet the screen says so, with the hour of the last reading when there was one, and shows no cash of US$ 0,00 as a fact", () => {
    const series = [{ t: NOW - 3_600_000, v: 118.5 }, { t: NOW - 1_800_000, v: 119 }];
    const never = flat(running({ book: null }), "comando", 16 / 9);
    expect(never).toContain("SEM LEITURA");
    expect(never).not.toMatch(/CAIXA US\$ 0,00/);
    expect(never).not.toContain("ULTIMA LEITURA");
    const hh = new Date(NOW - 1_800_000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    for (const aspect of SHAPES) {
      const some = flat(running({ book: null, performance: { series, record: {} } }), "comando", aspect);
      expect(some).toContain(`SEM LEITURA DA CARTEIRA, ULTIMA LEITURA ${hh}`);
      expect(some).not.toMatch(/CAIXA US\$ 0,00/);
      expect(some).not.toMatch(/US\$ 0,00/);
    }
    expect(buildHudModel(running({ book: null }), ANALYSIS, NOW).wallet).toMatchObject({ total: null, cash: null, lastReadMs: null });
    expect(buildHudModel(running({ book: null, performance: { series, record: {} } }), ANALYSIS, NOW).wallet.lastReadMs).toBe(NOW - 1_800_000);
    // a wallet that was read keeps its own numbers
    expect(buildHudModel(running(), ANALYSIS, NOW).wallet).toMatchObject({ total: 1010, cash: 800 });
  });

  test("the limits do not call a wallet that was never read a cash share of zero", () => {
    for (const aspect of [16 / 9, 0.46]) {
      const out = flat(running({ book: null }), "carteira", aspect);
      expect(out).not.toContain("0% DA CARTEIRA");
      expect(out).toContain("SEM LEITURA");
    }
  });

  test("the new words follow the rules of the screen: capitals, no accent, no dot, dash or blinking, at every shape and tab", () => {
    for (const status of [stopped(), stopped({ book: null }), running({ book: null })]) {
      for (const tab of TABS.map((t) => t[0])) {
        for (const aspect of SHAPES) {
          const text = flat(status, tab, aspect);
          expect(text).not.toMatch(/[·—–]/);
          expect(text).not.toMatch(/[À-ÖØ-öø-ÿ]/);
          expect(text).not.toMatch(/NaN|undefined|Infinity/);
          expect(buildScene(buildHudModel(status, ANALYSIS, NOW), tab, aspect).html).not.toMatch(/blink|pulse/i);
        }
      }
    }
  });
});

const ALLOWED_BAR_WORDS = ["O CODIGO NAO TEM BARRA DE CONVICCAO", "ATE 14/10 HAVIA UMA BARRA DE 20", "CADA BARRA E UM OLHAR DO AGENTE"];
const everyLayout: readonly (readonly [string, number, number])[] = [["stage", 1920, 1080], ["board", 1366, 1366], ["column", 390, 844]];
const textIn = (status: AgentStatus, tab: TabKey, w: number, h: number, analysis: Analysis | null = ANALYSIS, nowMs = NOW): string[] => textOf(buildScene(buildHudModel(status, analysis, nowMs), tab, w / h, pickLayout(w, h)).html).split("\n").map((l) => l.trim()).filter((l) => l !== "");

describe("the code has no bar of conviction and no minimum order: the screen no longer says it has", () => {
  const status = sampleStatus({ mode: "limitado" });

  test("no tab, in no shape, writes a bar, a conviction formula, a minimum order, a risk per operation, a step that passed or was cut; the few words that remain are the footnote that says there is no bar, the dated history and the chart of the cycles", () => {
    for (const [, w, h] of everyLayout) {
      for (const [tab] of TABS) {
        for (const analysis of [ANALYSIS, null]) {
          const lines = textIn(status, tab, w, h, analysis);
          const all = lines.join("\n");
          expect(all).not.toMatch(/ANEL TRACEJADO|PASSARAM|PASSOU|CORTAD|PEDIDO MINIMO|RISCO POR OPERACAO|CONVICCAO =|BARRA EXIGE|BARRA 20|BARRA 60|US\$ 10 \(CODIGO\)/);
          expect(lines).not.toContain("BARRA");
          for (const l of lines.filter((x) => /BARRA/.test(x))) expect(ALLOWED_BAR_WORDS.some((a) => l.includes(a))).toBe(true);
        }
      }
    }
  });

  test("the panel that was the bar is the Jev's preference for each request: his own probability, a footnote that the code has no bar, and the dated history only when an old request never became an order", () => {
    for (const [, w, h] of everyLayout) {
      const joined = textIn(status, "decisoes", w, h).join(" ");
      expect(joined).toContain("PREFERENCIA DO JEV POR PEDIDO");
      expect(joined).toContain("O CODIGO NAO TEM BARRA DE CONVICCAO: A ESCOLHA DO JEV E A DECISAO");
      expect(joined).toMatch(/P 91%/);
      expect(joined).toContain("ATE 14/10 HAVIA UMA BARRA DE 20 (P 60%), JA RETIRADA: SO HISTORICO, NAO REGRA");
      const recent = { ...ANALYSIS, asks: ANALYSIS.asks.map((a) => ({ ...a, ok: true })) };
      expect(textIn(status, "decisoes", w, h, recent).join(" ")).not.toContain("ATE 14/10");
    }
  });

  test("the funnel is ITENS DE COMPRA, ABERTOS AO JEV, PEDIDOS PELO JEV, ORDENS ENVIADAS, EXECUTADAS, with the drops FECHADOS PELO CODIGO, PULADOS PELO JEV, BLOQUEADOS PELO CODIGO and NAO EXECUTADOS", () => {
    const wide = textIn(status, "decisoes", 1920, 1080);
    for (const w of ["ITENS DE COMPRA", "ABERTOS AO JEV", "PEDIDOS PELO JEV", "ORDENS ENVIADAS", "EXECUTADAS", "FECHADOS PELO CODIGO", "PULADOS PELO JEV", "BLOQUEADOS PELO CODIGO", "NAO EXECUTADOS"]) expect(wide).toContain(w);
    expect(wide.join(" ")).toContain("FECHADOS PELO CODIGO: SEM CAIXA OU ABAIXO DO MINIMO DA REDE");
    const narrow = textIn(status, "decisoes", 390, 844);
    for (const w of ["ITENS", "ABERTOS", "PEDIDOS", "ENVIADAS", "EXECUT.", "FECHADOS PELO CODIGO", "PULADOS PELO JEV", "BLOQUEADOS PELO CODIGO", "NAO EXECUTADOS"]) expect(narrow).toContain(w);
    // the fixture: 140 items, 70 open, 9 asked, 3 sent, 2 executed
    expect(wide).toEqual(expect.arrayContaining(["140", "70", "9", "3", "2"]));
  });

  test("the blocked count of the funnel names what the code gave as the reason in the last cycle, under the count", () => {
    const withDrop: AgentStatus = { ...status, last: { ...status.last!, view: [{ id: "buy:token:501:Mint1", kind: "buy", symbol: "STONK", chainIndex: "501", stance: "buy_full", families: [], marks: [], closed: null, probs: { skip: 0.2, buy_full: 0.8 } }], dropped: [{ candidateId: "buy:token:501:Mint1", reason: "teto_diario" }] } };
    for (const [, w, h] of [everyLayout[0]!, everyLayout[2]!]) expect(textIn(withDrop, "decisoes", w, h).join(" ")).toContain("ULTIMO: STONK, PASSOU DO TETO DO DIA");
  });

  test("the limits say what the core says and no more: the ceilings as they are, SEM TETO when there is none, no risk per operation and no minimum order", () => {
    for (const [, w, h] of everyLayout) {
      const carteira = textIn(status, "carteira", w, h).join(" ");
      expect(carteira).toMatch(/TETO DE (UMA )?COMPRA/);
      expect(carteira).not.toMatch(/RISCO POR OPERACAO|PEDIDO MINIMO/);
    }
  });
});

describe("the choices of the code after the quote: every number is the core's, and the heading says they are the code's and under review", () => {
  const withGuards = (g: unknown): AgentStatus => {
    const raw = rawStatus().status as { autopilot: Record<string, unknown> };
    return sampleStatus({ autopilot: { ...raw.autopilot, guards: g } });
  };
  const GUARDS = { impactPct: { buy: 3, sell: 5, protecao: 10 }, taxPct: 5, slippagePct: { buy: 2, sell: 3, protecao: 8 }, buyCostShareOfStop: 1 / 3, nativeReserve: { kind: "fixa", usd: 5 } };
  const OTHER = { impactPct: { buy: 4, sell: 6, protecao: 12 }, taxPct: 7, slippagePct: { buy: 1.5, sell: 2.5, protecao: 9 }, buyCostShareOfStop: 0.5, nativeReserve: { kind: "taxa_medida", usd: null } };

  test("in the limits of the Sistema tab, on the stage, the board and the column: the heading and one row for each check, with the numbers the core gave", () => {
    for (const [, w, h] of everyLayout) {
      const lines = textIn(withGuards(GUARDS), "sistema", w, h);
      const joined = lines.join(" ");
      expect(lines).toContain("ESCOLHAS DO CODIGO, EM REVISAO");
      for (const t of ["VETO DE IMPACTO NA COTACAO", "COMPRA 3%, VENDA 5%, PROTECAO 10%", "A COMPRA ACEITA NO MAXIMO UM TERCO DO STOP DO PERFIL", "VETO DE IMPOSTO DO TOKEN", "5%", "DERRAPAGEM ACEITA", "COMPRA 2%, VENDA 3%, PROTECAO 8%", "RESERVA DE TAXA EM MOEDA NATIVA", "US$ 5 FIXO"]) expect(joined).toContain(t);
      expect(joined).not.toContain("TAXA MEDIDA POR REDE");
    }
  });

  test("nothing is hardcoded: other numbers from the core are the numbers on the screen, a half is said as a half and a fee measured per network says it has no measure yet", () => {
    for (const [, w, h] of everyLayout) {
      const lines = textIn(withGuards(OTHER), "sistema", w, h);
      const joined = lines.join(" ");
      for (const t of ["COMPRA 4%, VENDA 6%, PROTECAO 12%", "A COMPRA ACEITA NO MAXIMO METADE DO STOP DO PERFIL", "COMPRA 1,5%, VENDA 2,5%, PROTECAO 9%", "TAXA MEDIDA POR REDE", "SEM TAXA MEDIDA AINDA"]) expect(joined).toContain(t);
      expect(lines).toContain("7%");
      expect(joined).not.toMatch(/UM TERCO|US\$ 5 FIXO|COMPRA 3%/);
    }
    const measured = textIn(withGuards({ ...OTHER, nativeReserve: { kind: "taxa_medida", usd: 0.02 } }), "sistema", 1920, 1080).join(" ");
    expect(measured).toContain("ULTIMA TAXA MEDIDA: US$ 0,02");
    expect(measured).not.toContain("SEM TAXA MEDIDA AINDA");
  });

  test("a core that does not send them is missing a word, not a zero: the heading stays and says SEM DADO DO NUCLEO under it", () => {
    for (const [, w, h] of everyLayout) {
      const lines = textIn(sampleStatus(), "sistema", w, h);
      const at = lines.indexOf("ESCOLHAS DO CODIGO, EM REVISAO");
      expect(at).toBeGreaterThan(-1);
      expect(lines[at + 1]).toBe("SEM DADO DO NUCLEO");
      expect(lines.join(" ")).not.toMatch(/VETO DE IMPACTO|DERRAPAGEM/);
    }
  });
});

describe("resources and consumption in the Sistema tab: the quota by tier, the age of each reading from the screen's own clock, unknown is a dash", () => {
  const meter = (over: Record<string, unknown> = {}) => ({ scope: "local_gateway", status: "valid", capEvidence: "local_configuration", observedAtMs: NOW - 12 * 60_000, used: 1234, monthlyCap: 10_000, remainingAtObservation: 8766, extrapolatedMonthUse: 5000, ...over });
  const account = (over: Record<string, unknown> = {}) => meter({ scope: "account_reported", status: "unreported", capEvidence: "unknown", observedAtMs: null, used: null, monthlyCap: null, remainingAtObservation: null, extrapolatedMonthUse: null, ...over });
  const RES = {
    asOfMs: NOW,
    month: { key: "2026-10", startAtMs: Date.UTC(2026, 9, 1), localNextMonthUtcMs: Date.UTC(2026, 10, 1), days: 31 },
    accountRateLimits: { requestsPerSecond: null, tokensPerSecond: null },
    tiers: {
      free: { local: meter(), account: account() },
      basic: { local: meter({ used: 50, monthlyCap: null, capEvidence: "unknown", remainingAtObservation: null }), account: account({ status: "valid", capEvidence: "provider_reported", observedAtMs: NOW - 5 * 60_000, used: 700, monthlyCap: 2000, remainingAtObservation: 1300 }) },
      premium: { local: meter({ status: "corrupt", observedAtMs: null, used: null, monthlyCap: null, remainingAtObservation: null, capEvidence: "unknown" }), account: account({ status: "unreadable" }) },
    },
  };
  const withRes = (r: unknown): AgentStatus => sampleStatus({ resources: r });

  test("the panel is in the Sistema tab of every layout, with the month, what each counter says and how old each reading is", () => {
    for (const [, w, h] of everyLayout) {
      const lines = textIn(withRes(RES), "sistema", w, h);
      const joined = lines.join(" ");
      for (const t of ["RECURSOS E CONSUMO", "COTA MENSAL DO PROVEDOR DE DADOS, MES 2026-10 (31 DIAS)", "LOCAL = CONTADOR LOCAL: O QUE ESTA MAQUINA ENVIOU", "FREE", "BASIC", "PREMIUM", "1.234 DE 10.000", "RESTAM 8.766", "LIDO HA 12 MIN", "50 DE SEM TETO LOCAL", "700 DE 2.000", "RESTAM 1.300", "LIDO HA 5 MIN", "TETO CONFIGURADO LOCALMENTE", "TETO INFORMADO PELO PROVEDOR", "LEITURA CORROMPIDA", "LEITURA ILEGIVEL"]) expect(joined).toContain(t);
    }
  });

  test("an account that was never read says CONTA NAO LIDA and shows a dash, never a zero; a counter without a ceiling says so; neither is drawn as zero", () => {
    for (const [, w, h] of everyLayout) {
      const lines = textIn(withRes(RES), "sistema", w, h);
      expect(lines.filter((l) => l === "CONTA NAO LIDA").length).toBe(1);
      expect(lines.filter((l) => l === "RESTAM -").length).toBeGreaterThanOrEqual(4);
      expect(lines.join(" ")).not.toMatch(/RESTAM 0\b|\b0 DE 0\b|CONTA NAO LIDA 0/);
    }
  });

  test("the age advances with the screen's clock and not with a new reading: three minutes later the same observation is three minutes older", () => {
    const status = withRes(RES);
    const later = textIn(status, "sistema", 1920, 1080, ANALYSIS, NOW + 3 * 60_000).join(" ");
    expect(later).toContain("LIDO HA 15 MIN");
    expect(later).toContain("LIDO HA 8 MIN");
    expect(later).not.toContain("LIDO HA 12 MIN");
    expect(textIn(status, "sistema", 1920, 1080, ANALYSIS, NOW + 3 * 3_600_000).join(" ")).toContain("LIDO HA 3 H");
    expect(buildHudModel(status, ANALYSIS, NOW + 60_000).resources!.tiers.free.local.ageMs).toBe(13 * 60_000);
    expect(buildHudModel(status, ANALYSIS, NOW).resources!.tiers.free.account.ageMs).toBeNull();
  });

  test("the model side is there too: the consults of the day, the tokens when measured (SEM MEDIDA when not) and the word that tokens and cost per attempt are not measured apart yet", () => {
    for (const [, w, h] of everyLayout) {
      const measured = textIn(withRes(RES), "sistema", w, h).join(" ");
      expect(measured).toContain("CONSULTAS DO DIA");
      expect(measured).toContain("12 DE 144");
      expect(measured).toContain("0,14M");
      expect(measured).toContain("TOKENS E CUSTO POR TENTATIVA AINDA NAO SAO MEDIDOS SEPARADAMENTE");
      expect(textIn(withRes(RES), "sistema", w, h, null).join(" ")).toContain("SEM MEDIDA");
    }
  });

  test("a core that does not send the resources says so, and the model side stays", () => {
    for (const [, w, h] of everyLayout) {
      const lines = textIn(sampleStatus(), "sistema", w, h);
      expect(lines).toContain("RECURSOS E CONSUMO");
      expect(lines).toContain("NUCLEO NAO ENVIA OS RECURSOS");
      expect(lines.join(" ")).toContain("TOKENS E CUSTO POR TENTATIVA AINDA NAO SAO MEDIDOS SEPARADAMENTE");
    }
    expect(buildHudModel(sampleStatus(), ANALYSIS, NOW).resources).toBeNull();
    expect(buildHudModel(sampleStatus(), ANALYSIS, NOW).guards).toBeNull();
  });

  test("a reading of another month, an invalid one and a corrupt one each say their own word", () => {
    const odd = { ...RES, tiers: { ...RES.tiers, free: { local: meter({ status: "month_mismatch", observedAtMs: null, used: null }), account: account({ status: "invalid" }) } } };
    const joined = textIn(withRes(odd), "sistema", 390, 844).join(" ");
    expect(joined).toContain("LEITURA DE OUTRO MES");
    expect(joined).toContain("LEITURA INVALIDA");
  });
});
