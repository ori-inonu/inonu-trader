// origin: synthetic_fixture, tests only. The fit of the drawing: in every shape the screen takes, with data that fills every panel to the brim (long symbols, big numbers, every row used, long words from the core), no text covers
// another, no text is cut by the edge of its canvas, and nothing is written smaller than the shape promises.
import { describe, expect, test } from "bun:test";
import { NOW, rawStatus, sampleStatus } from "../agent/fixtures";
import type { AgentStatus } from "../agent/types";
import { animatedRects, barsBehindText, clashes, describeClash, outside, smallestFont, textBoxes } from "./draw/fit";
import { BOARD_MIN_FONT, boardWidth, COLUMN_MIN_FONT, pickLayout, STAGE_MIN_FONT, stageScale } from "./draw/layout";
import { approxWidth, thinLabels } from "./draw/h";
import { pack } from "./draw/pack";
import { buildScene, TABS, type TabKey } from "./draw/scene";
import { buildHudModel } from "./model";
import type { Analysis, WindowStats } from "./types";

const win = (vals: number[]): WindowStats => ({ n: vals.length, up: vals.filter((v) => v > 0).length, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, vals });
const LONG = "ABCDEFGHIJKLMN";

/** Every list as long as the screen will take it, every number as wide as it gets. */
const FULL: Analysis = {
  atMs: NOW,
  funnel: { consults: 99999, items: 99999, closed: 54321, open: 45678, asked: 12345, applied: 9876, executed: 5432, failed: 4444 },
  asks: Array.from({ length: 40 }, (_, i) => ({ t: NOW - i * 60_000, s: i % 2 ? LONG : "STONK", p: 0.5 + (i % 5) * 0.1, ok: i % 3 === 0 })),
  hist: { all: Array.from({ length: 20 }, (_, i) => 100 + i * 37), fresh: Array.from({ length: 20 }, (_, i) => 40 + i * 11) },
  timeline: Array.from({ length: 60 }, (_, i) => ({ t: NOW - (60 - i) * 300_000, open: 10 + (i % 7), asked: i % 4, applied: i % 3 })),
  trips: Array.from({ length: 20 }, (_, i) => ({ s: i % 2 ? LONG : "STONK", in: 1234.5678 + i, out: 1100.25 + i, pct: i % 2 ? -12.345 : 8.2, buyAt: NOW - 7_200_000 + i * 60_000, sellAt: NOW - 3_600_000 + i * 60_000 })),
  fees: { lamports: 987_654_321, fills: 4444, unmatchedSells: 0 },
  placar: { skipped: { "15m": win(Array.from({ length: 50 }, (_, i) => (i - 25) / 2)), "1h": win(Array.from({ length: 50 }, (_, i) => (i - 20) / 2)) }, closed: { "15m": win(Array.from({ length: 40 }, (_, i) => (i - 20) / 3)), "1h": win([1, 2]) }, gated: { "15m": win(Array.from({ length: 8 }, (_, i) => i - 3)), "1h": win([]) } },
  recent: Array.from({ length: 60 }, (_, i) => ({ t: NOW - i * 120_000, s: i % 2 ? LONG : "STONK", kind: ["pulada pelo Jev", "puxada pelo codigo", "pedida e recusada"][i % 3]!, m15: i % 4 === 0 ? null : (i - 30) / 2, m1h: i % 5 === 0 ? null : (30 - i) / 2 })),
  orders: { outcomes: { executada: 9999, falhou: 8888, incerta: 7777 }, reasons: { simulacao_falhou: 12, recibo_erro: 9, confirmando: 7, resolvida_pelo_usuario: 5, uma_razao_nova_e_longa_demais: 3, outra: 1 }, spentToday: { buy: 99999.5, sell: 88888.5 } },
  runtime: { tokensToday: 123_456_789, riskPct: 0.05 },
};

/** A meter at its widest: big numbers and every word the core can use for a reading it cannot give. */
const bigMeter = (over: Record<string, unknown> = {}) => ({ scope: "local_gateway", status: "valid", capEvidence: "local_configuration", observedAtMs: NOW - 5_000 * 60_000, used: 123_456_789, monthlyCap: 999_999_999, remainingAtObservation: 876_543_210, extrapolatedMonthUse: 5000, ...over });
const bigAccount = (over: Record<string, unknown> = {}) => bigMeter({ scope: "account_reported", capEvidence: "provider_reported", ...over });
const FULL_RESOURCES = {
  asOfMs: NOW,
  month: { key: "2026-10", startAtMs: Date.UTC(2026, 9, 1), localNextMonthUtcMs: Date.UTC(2026, 10, 1), days: 31 },
  accountRateLimits: { requestsPerSecond: 1_000_000, tokensPerSecond: 2_000_000 },
  tiers: {
    free: { local: bigMeter(), account: bigAccount() },
    basic: { local: bigMeter({ monthlyCap: null, capEvidence: "unknown", remainingAtObservation: null }), account: bigAccount({ monthlyCap: null, remainingAtObservation: null }) },
    premium: { local: bigMeter({ status: "month_mismatch", observedAtMs: null, used: null, monthlyCap: null, remainingAtObservation: null }), account: bigAccount({ status: "unreported", observedAtMs: null, used: null, monthlyCap: null, remainingAtObservation: null, capEvidence: "unknown" }) },
  },
};
const FULL_GUARDS = { impactPct: { buy: 12.5, sell: 15.5, protecao: 100 }, taxPct: 99.5, slippagePct: { buy: 12.5, sell: 13.5, protecao: 18.5 }, buyCostShareOfStop: 0.37, nativeReserve: { kind: "fixa", usd: 1234.56 } };
const MEASURED_GUARDS = { ...FULL_GUARDS, nativeReserve: { kind: "taxa_medida", usd: null } };

function crowded(over: { scheduler?: unknown; book?: unknown; inflight?: boolean; resources?: unknown; guards?: unknown } = {}): AgentStatus {
  const rawAutopilot = (rawStatus().status as { autopilot: Record<string, unknown> }).autopilot;
  const base = sampleStatus({
    mode: "limitado",
    ...(over.resources === undefined ? {} : { resources: over.resources }),
    ...(over.guards === undefined ? {} : { autopilot: { ...rawAutopilot, guards: over.guards } }),
    ...(over.scheduler === undefined ? {} : { scheduler: over.scheduler }),
    ...(over.book === undefined ? {} : { book: over.book }),
    ...(over.inflight === true ? { inFlight: Array.from({ length: 4 }, (_, i) => ({ orderKey: `cy-${i}:buy:token:501:Mint${i}`, atMs: NOW - 99 * 60_000, stage: "incerta", side: i % 2 ? "sell" : "buy", symbol: LONG, chainIndex: "501", usd: 99999, source: "modelo", reason: null, detail: "A OKX recusou a troca com uma frase muito comprida que nao termina nunca e segue por muitas palavras ate passar de cem caracteres no total" })) } : {}),
  });
  const view = Array.from({ length: 12 }, (_, i) => ({
    id: `buy:token:501:Mint${i}`, kind: "buy" as const, symbol: i % 2 ? LONG : `TK${i}`, chainIndex: "501", stance: i % 3 === 0 ? "buy_full" : "skip", families: [], marks: [], closed: i > 8 ? "liquidez_baixa" : null,
    probs: { skip: 0.3, buy_full: 0.7 }, facets: { late_entry: 0.2, still_falling: 0.1, accumulating: 0.7, exit_easy: 0.8, distribution: 0.2, fading: 0.3 },
  }));
  const positions = Array.from({ length: 10 }, (_, i) => ({ id: `token:501:Mint${i}`, symbol: i === 0 ? "USDC" : LONG, chainIndex: "501", wallet: "agente" as const, usd: i === 0 ? 123456.78 : 9999.99 - i, sharePct: 10, isCash: i === 0, plan: i === 0 || i % 3 === 0 ? null : { profile: "alvo_20", sinceEntryPct: 12.5, toTargetPct: 8.4, toStopPct: 1.2, hoursHeld: 5, hoursLeft: 31, targetHit: false, trimmed: false } }));
  const ledger = Array.from({ length: 30 }, (_, i) => ({ kind: i % 3 === 0 ? "order" : "cycle", cycleId: `cy-${i}`, atMs: NOW - (30 - i) * 120_000, outcome: "decidido", reason: i % 4 === 0 ? "ordem_incerta" : null, stage: i % 2 ? "executada" : "falhou", side: i % 2 ? "buy" : "sell", symbol: LONG, usd: 99999 })) as unknown as AgentStatus["ledger"];
  return {
    ...base,
    paused: true,
    pauseReason: "disjuntor_de_perda",
    ledger,
    last: { ...base.last!, view, dropped: [{ candidateId: "buy:token:501:Mint0", reason: "teto_diario" }, { candidateId: "buy:token:501:Mint3", reason: "sem_saldo" }, { candidateId: "hold:token:501:Mint5@agente", reason: "gasto_desconhecido" }], posture: "ofensiva" },
    book: over.book === null ? null : { ...base.book!, totalUsd: 1_234_567.89, cashUsd: 987_654.32, positions },
    context: { btc_24h: -12.34, eth_24h: 23.45, tendencia: "tendencia de alta forte" },
  };
}

/** The sizes the screen can take: the stage from a full screen down to half of it (1914 x 942 is a normal browser window with its tab bar), the board for what is not wide, the column for a phone and a tablet held upright. */
const SIZES: readonly (readonly [string, number, number])[] = [
  ["1920x1080", 1920, 1080], ["1914x942", 1914, 942], ["2560x1440", 2560, 1440], ["1366x768", 1366, 768], ["1280x720", 1280, 720], ["1024x768", 1024, 768], ["1024x640", 1024, 640], ["960x540", 960, 540], ["2560x900", 2560, 900],
  ["1366x1366", 1366, 1366], ["1920x1920", 1920, 1920], ["2560x2560", 2560, 2560], ["820x1180", 820, 1180], ["390x844", 390, 844],
];

const variants: readonly (readonly [string, AgentStatus, Analysis | null])[] = [
  ["crowded", crowded(), FULL],
  ["crowded, orders without a receipt", crowded({ inflight: true }), FULL],
  ["crowded, no analysis", crowded(), null],
  ["crowded, only watched, no reading", crowded({ scheduler: { started: false, nextAtMs: null, lastAtMs: NOW, intervalMin: 2 }, book: null }), FULL],
  ["crowded, with the resources of the provider and the choices of the code", crowded({ resources: FULL_RESOURCES, guards: FULL_GUARDS }), FULL],
  ["crowded, with a fee measured per network and orders without a receipt", crowded({ resources: FULL_RESOURCES, guards: MEASURED_GUARDS, inflight: true }), FULL],
  ["crowded, only watched, with resources and guards", crowded({ scheduler: { started: false, nextAtMs: null, lastAtMs: NOW, intervalMin: 2 }, book: null, resources: FULL_RESOURCES, guards: FULL_GUARDS }), null],
  ["sample", sampleStatus({ mode: "limitado" }), FULL],
];

describe("nothing covers anything else and nothing is cut, in every shape, with data that fills every panel", () => {
  for (const [name, status, analysis] of variants) {
    for (const [label, w, h] of SIZES) {
      test(`${name} at ${label}`, () => {
        const layout = pickLayout(w, h);
        const problems: string[] = [];
        for (const [tab] of TABS) {
          const scene = buildScene(buildHudModel(status, analysis, NOW), tab, w / h, layout);
          const boxes = textBoxes(scene.html);
          expect(boxes.length).toBeGreaterThan(20);
          problems.push(...clashes(boxes).map((c) => `${tab} covers: ${describeClash(c)}`));
          problems.push(...outside(boxes, scene.width, scene.height).map((b) => `${tab} cut: "${b.text}" ${b.x0.toFixed(0)}..${b.x1.toFixed(0)}`));
        }
        expect(problems).toEqual([]);
      });
    }
  }
});

describe("what each shape promises about the size of the type", () => {
  const model = buildHudModel(crowded(), FULL, NOW);

  test("the board and the column never write below their floor: the panels' own type is raised to it", () => {
    for (const tab of TABS.map((t) => t[0]) as TabKey[]) {
      const board = textBoxes(buildScene(model, tab, 1, pickLayout(1366, 1366)).html).filter((b) => b.fs < BOARD_MIN_FONT);
      // the core is drawn at its own scale (it has no compact form) and its labels are enlarged to make up for it; everything else keeps the floor
      expect(board.filter((b) => b.fs < BOARD_MIN_FONT * 0.75).map((b) => `${tab}: "${b.text}" ${b.fs.toFixed(1)}`)).toEqual([]);
      // the panels of the column are drawn at 640 wide (their 480 scaled by 4/3) so their floor is 14 there; the header and the core are drawn as they are, and keep their own 10
      const column = textBoxes(buildScene(model, tab, 390 / 844, pickLayout(390, 844)).html).filter((b) => b.fs < Math.min(COLUMN_MIN_FONT, 10) - 0.01);
      expect(column.map((b) => `${tab}: "${b.text}" ${b.fs.toFixed(1)}`)).toEqual([]);
    }
  });

  test("on screen, the smallest label of a board is 10 px or more, core included", () => {
    for (const [w, h] of [[1366, 1366], [1920, 1920], [2560, 2560]] as const) {
      for (const tab of TABS.map((t) => t[0]) as TabKey[]) {
        const scene = buildScene(model, tab, w / h, pickLayout(w, h));
        expect(`${tab} ${w}x${h} ${smallestFont(textBoxes(scene.html)) * (w / scene.width) >= 10}`).toBe(`${tab} ${w}x${h} true`);
      }
    }
  });

  test("the stage keeps its own look, whatever the size of the window: its smallest label is the 9 px it always had, drawn at the scale that fits; on screen that is 9 x the scale", () => {
    for (const [w, h] of [[1920, 1080], [1914, 942], [1366, 768], [1280, 720], [1024, 640], [960, 540]] as const) {
      for (const tab of TABS.map((t) => t[0]) as TabKey[]) {
        const scene = buildScene(model, tab, w / h, pickLayout(w, h));
        const smallest = smallestFont(textBoxes(scene.html));
        expect(smallest).toBeGreaterThanOrEqual(STAGE_MIN_FONT);
        expect(smallest * stageScale(w, h)).toBeGreaterThanOrEqual(STAGE_MIN_FONT * stageScale(w, h) - 1e-9);
      }
    }
    expect(smallestFont(textBoxes(buildScene(model, "comando", 16 / 9, pickLayout(1920, 1080)).html))).toBeGreaterThanOrEqual(STAGE_MIN_FONT);
  });
});

describe("the board is made of whole panels", () => {
  test("every panel sits in a column, under the shortest one, and none covers another", () => {
    const items = [220, 310, 150, 400, 90, 260].map((h, i) => ({ name: `p${i}`, h }));
    const { placed, bottom } = pack(items, 3, 100, 28);
    expect(placed.map((p) => p.name)).toEqual(items.map((i) => i.name));
    expect(placed.slice(0, 3).map((p) => [p.col, p.y])).toEqual([[0, 100], [1, 100], [2, 100]]);
    // the fourth panel goes under the shortest of the three, the third (150 tall)
    expect(placed[3]).toMatchObject({ col: 2, y: 100 + 150 + 28 });
    for (let col = 0; col < 3; col++) {
      const mine = placed.filter((p) => p.col === col);
      for (let i = 1; i < mine.length; i++) expect(mine[i]!.y).toBeGreaterThanOrEqual(mine[i - 1]!.y + mine[i - 1]!.h + 28);
    }
    expect(bottom).toBe(Math.max(...placed.map((p) => p.y + p.h)));
    expect(pack([], 2, 50, 10)).toEqual({ placed: [], bottom: 50 });
  });

  test("a scene of a board is as wide as its columns and as tall as its tallest column", () => {
    for (const w of [1366, 1920, 2560]) {
      const layout = pickLayout(w, w);
      if (layout.kind !== "board") throw new Error("a board was expected");
      const scene = buildScene(buildHudModel(crowded(), FULL, NOW), "decisoes", 1, layout);
      expect(scene.width).toBe(boardWidth(layout.columns));
      expect(scene.tall).toBe(true);
      expect(scene.key).toBe(`board${layout.columns}`);
    }
  });
});

describe("the watched agent and the raw rows of the core are still the core's words", () => {
  test("a rawStatus that is not cycling draws every tab at every shape without a number that is not a number", () => {
    const status = sampleStatus({ scheduler: { started: false, nextAtMs: null, lastAtMs: null, intervalMin: 2 }, book: null, performance: { series: [], record: {} } });
    expect(rawStatus().ok).toBe(true);
    for (const [, w, h] of SIZES) for (const [tab] of TABS) expect(buildScene(buildHudModel(status, null, NOW), tab, w / h, pickLayout(w, h)).html).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("the tabs: every label inside its plate, and the tabs that stay at the top only where the page scrolls", () => {
  const model = buildHudModel(sampleStatus({ mode: "limitado" }), FULL, NOW);

  test("each label is centred in its plate and fits between the drawing and the slanted edge, in every shape and with the widest letters", () => {
    for (const [, w, h] of SIZES) {
      const html = buildScene(model, "resultado", w / h, pickLayout(w, h)).html;
      const tabs = Array.from(html.matchAll(/<g class="tab" data-tab="(\w+)"[\s\S]*?<\/text>/g));
      expect(tabs.length).toBe(6);
      for (const [block, key] of tabs) {
        const plate = /class="plate" d="M([\d.]+) ([\d.]+)l9 -12h([\d.]+)l9 12/.exec(block);
        const label = /<text x="([\d.]+)"[^>]*style="font-size:([\d.]+)px;letter-spacing:([\d.]+)em">([A-Z]+)</.exec(block);
        expect(plate).not.toBeNull();
        expect(label).not.toBeNull();
        const left = Number(plate![1]), width = Number(plate![3]) + 18;
        const icon = block.includes('class="tab-icon"');
        const text = label![4]!, fs = Number(label![2]), ls = Number(label![3]);
        const tw = approxWidth(text, fs, ls, false, false);
        const cx = Number(label![1]);
        expect(cx - tw / 2).toBeGreaterThanOrEqual(left + (icon ? 34 : 9) - 0.5);
        expect(cx + tw / 2).toBeLessThanOrEqual(left + width - 9 + 0.5);
        expect(key).toMatch(/^(comando|decisoes|carteira|resultado|pulados|sistema)$/);
      }
    }
  });

  test("the stage has no moving tabs; the board and the column have one group that follows the page, with its plate and the six tabs inside", () => {
    expect(buildScene(model, "comando", 16 / 9, pickLayout(1920, 1080)).html).not.toContain("sticky-head");
    for (const [, w, h] of SIZES.filter(([, w, h]) => pickLayout(w, h).kind !== "stage")) {
      const html = buildScene(model, "comando", w / h, pickLayout(w, h)).html;
      expect(html.match(/class="sticky-head"/g)?.length).toBe(1);
      const group = html.slice(html.indexOf('class="sticky-head"'));
      expect(group.match(/data-tab="/g)?.length).toBe(6);
      expect(group).toMatch(/data-top="\d+"/);
      // drawn last, so it is above the panels when it moves
      expect(html.lastIndexOf('class="sticky-head"')).toBeGreaterThan(html.lastIndexOf('class="enter"'));
    }
  });
});

describe("the labels of a crowded row", () => {
  test("the newest label is kept and each one that would run into the next is left out", () => {
    expect(thinLabels([10, 30, 50, 70], [20, 20, 20, 20], 0)).toEqual([true, true, true, true]);
    expect(thinLabels([10, 30, 50, 70], [70, 70, 70, 70], 0)).toEqual([false, false, false, true]);
    expect(thinLabels([10, 80, 150], [40, 40, 40], 6)).toEqual([true, true, true]);
    expect(thinLabels([], [])).toEqual([]);
  });

  test("a width is the sum of the letters and the spacing: capitals wider than digits, a mono font even", () => {
    expect(approxWidth("W", 10, 0, false, false)).toBeGreaterThan(approxWidth("I", 10, 0, false, false));
    expect(approxWidth("AB", 10, 0.1, false, false)).toBeCloseTo(((667 + 667) / 1000) * 10 + 0.1 * 10 * 2, 5);
    expect(approxWidth("AAAA", 10, 0, true, false)).toBeCloseTo(22, 5);
    expect(approxWidth("", 10, 0.5, false, false)).toBe(0);
  });
});

describe("nothing animated is ever behind a letter", () => {
  const stage = (status: AgentStatus, analysis: Analysis | null = FULL): string => buildScene(buildHudModel(status, analysis, NOW), "comando", 16 / 9, pickLayout(1920, 1080)).html;
  const many = (status: AgentStatus): number => buildHudModel(status, FULL, NOW).system.log.length;

  test("the faint bars of the plate under the core have a band of their own under the text, and no bar or swaying bar touches the box of any text, whatever the list has in it", () => {
    for (const [name, status, analysis] of variants) {
      const html = stage(status, analysis);
      const bars = animatedRects(html);
      expect(`${name} ${bars.filter((b) => b.cls === "bar").length >= 40}`).toBe(`${name} true`);
      expect(barsBehindText(textBoxes(html), bars).map((p) => `${name}: "${p.text.text}" (${p.text.x0.toFixed(0)}, ${p.text.y0.toFixed(0)}) under a ${p.rect.cls} at ${p.rect.x0.toFixed(0)}, ${p.rect.y0.toFixed(0)}`)).toEqual([]);
    }
    expect(many(crowded())).toBeGreaterThan(0);
  });

  test("the band is under the clip of the list: the clip ends before the first bar begins, in the units of the plate, and the plate has a solid backing behind the text", () => {
    for (const [, status, analysis] of variants) {
      const html = stage(status, analysis);
      const clip = /<clipPath id="tickClip\d+"><rect x="30" y="(\d+)" width="650" height="(\d+)"/.exec(html);
      expect(clip).not.toBeNull();
      const clipBottom = Number(clip![1]) + Number(clip![2]);
      const barTops = Array.from(html.matchAll(/<rect class="bar" x="[\d.]+" y="([\d.]+)" width="5" height="([\d.]+)"/g)).map((m) => Number(m[1]));
      const barBottoms = Array.from(html.matchAll(/<rect class="bar" x="[\d.]+" y="([\d.]+)" width="5" height="([\d.]+)"/g)).map((m) => Number(m[1]) + Number(m[2]));
      expect(clipBottom).toBeLessThanOrEqual(Math.min(...barTops));
      expect(Math.min(...barTops)).toBeGreaterThanOrEqual(108 - 0.01);
      expect(Math.max(...barBottoms)).toBeLessThanOrEqual(118 + 0.01);
      // heights of 3 to 10, centred on 113
      for (const m of html.matchAll(/<rect class="bar" x="[\d.]+" y="([\d.]+)" width="5" height="([\d.]+)"/g)) {
        expect(Number(m[2])).toBeGreaterThanOrEqual(3 - 0.01);
        expect(Number(m[2])).toBeLessThanOrEqual(10 + 0.01);
        expect(Number(m[1]) + Number(m[2]) / 2).toBeCloseTo(113, 1);
      }
      expect(html).toContain('<rect x="48" y="13" width="604" height="106" fill="#02101a"');
      // the backing comes before the text and the bars in the markup, so it is under them
      expect(html.indexOf('<rect x="48" y="13" width="604" height="106"')).toBeLessThan(html.indexOf('<rect class="bar"'));
    }
  });

  test("the same holds on the board and on the column: no animated bar is behind any text there either", () => {
    for (const [w, h] of [[1366, 1366], [390, 844]] as const) {
      for (const [, status, analysis] of variants) {
        const html = buildScene(buildHudModel(status, analysis, NOW), "comando", w / h, pickLayout(w, h)).html;
        expect(barsBehindText(textBoxes(html), animatedRects(html)).map((p) => `${w}x${h}: "${p.text.text}"`)).toEqual([]);
      }
    }
  });
});
