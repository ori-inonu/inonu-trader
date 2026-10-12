import { describe, expect, test } from "bun:test";
import type { DeskFeedStatus } from "../desk/types";
import type { JevReadBoardView, JevReadView } from "../jev-read";
import type { SystemOneCycleView } from "../system-one";
import { capabilityRows, feedChips, journalRows, jevStageModel, newestReadAgeMs, reasonLabel, systemOneLine, FORBIDDEN_TEXT } from "./mesa-model";

const NOW = 1_791_742_100_000;

function read(overrides: Partial<JevReadView> = {}): JevReadView {
  return {
    readId: "jr-1",
    instId: "BTC-USDT",
    atMs: NOW - 20_000,
    clockOffsetMs: null,
    state: {
      instId: "BTC-USDT", horizonMinutes: 5, mid: 83957.35, spreadBps: 0.12, bookImbalanceTop5: -0.31, volBpsPerMinute: 2.3,
      depthQuoteTop5: { bid: 120000, ask: 190000 }, returnsBps: { m1: 1.2, m5: -3.4, m15: 5.6, m30: 7.8 },
      flow60s: { count: 12, buyBase: 0.4, sellBase: 0.9, cvdBase: -0.5, imbalance: -0.38, vwap: 83950, lastPx: 83957.4, lastSide: "buy" },
      change24hPct: 1.4, rangePosition24h: 0.62, fundingRatePct: null,
    },
    insufficient: [],
    decision: { action: "sell", probabilities: { buy: 0.1, sell: 0.63, hold: 0.27 }, confidence: 0.63, latencyMs: 291, model: "jev-1.13.0", status: "ok", inputTokens: 894 },
    ...overrides,
  };
}

const board = (reads: JevReadView[]): JevReadBoardView => ({ updatedAtMs: NOW, reads: Object.fromEntries(reads.map((r) => [r.instId, r])), recent: reads });

describe("jevStageModel", () => {
  test("a fresh sell read shows the call, its weights and what Jev saw", () => {
    const m = jevStageModel({ status: "ready", board: board([read()]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.headline).toBe("VENDER");
    expect(m.tone).toBe("sell");
    expect(m.freshness).toBe("fresh");
    expect(m.probabilities.map((p) => [p.key, p.label])).toEqual([["buy", "Comprar"], ["sell", "Vender"], ["hold", "Manter"]]);
    expect(m.probabilities.find((p) => p.key === "sell")!.p).toBeCloseTo(0.63, 10);
    expect(m.confidenceText).toBe("63%");
    expect(m.model).toBe("jev-1.13.0");
    expect(m.seen.map((s) => s.label)).toContain("Fluxo agressor 60 s");
    expect(m.advisoryNote).toContain("nao executa");
  });

  test("a late read turns the tone to late and says so", () => {
    const m = jevStageModel({ status: "ready", board: board([read({ atMs: NOW - 120_000 })]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.freshness).toBe("late");
    expect(m.tone).toBe("late");
    expect(m.headline).toBe("VENDER");
    expect(m.statusLine).toContain("atrasada");
  });

  test("a stale read keeps the last call but labels it old", () => {
    const m = jevStageModel({ status: "ready", board: board([read({ atMs: NOW - 400_000 })]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.freshness).toBe("stale");
    expect(m.statusLine).toContain("velha");
    expect(m.dimmed).toBe(true);
  });

  test("a read on the exchange clock without a measured skew has an unknown age, never a guess", () => {
    const m = jevStageModel({ status: "ready", board: board([read({ clockOffsetMs: 69_500 })]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.freshness).toBe("unknown");
    expect(m.statusLine).toContain("Idade da leitura desconhecida");
  });

  test("the exchange clock plus the browser skew gives the real age", () => {
    const stamped = read({ clockOffsetMs: 69_500, atMs: NOW + 69_500 - 20_000 });
    const m = jevStageModel({ status: "ready", board: board([stamped]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: 69_500 });
    expect(m.freshness).toBe("fresh");
    expect(m.ageMs).toBe(20_000);
  });

  test("an insufficient read says why Jev was not asked and has no call", () => {
    const m = jevStageModel({ status: "ready", board: board([read({ state: null, decision: null, insufficient: ["book_missing", "candles_short"] })]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.headline).toBe("SEM LEITURA");
    expect(m.statusLine).toContain("livro de ofertas ausente");
    expect(m.statusLine).toContain("velas insuficientes");
    expect(m.probabilities.every((p) => p.p === null)).toBe(true);
  });

  test("a failed model answer is a hold with its status, not a call", () => {
    const failed = read({ decision: { action: "hold", probabilities: { buy: 0, sell: 0, hold: 1 }, confidence: null, latencyMs: 15000, model: "jev-1.13.0", status: "timeout", inputTokens: null } });
    const m = jevStageModel({ status: "ready", board: board([failed]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.headline).toBe("MANTER");
    expect(m.statusLine).toContain("tempo esgotado");
    expect(m.confidenceText).toBe("Indisponivel");
  });

  test("observe mode records the state but there is no decision", () => {
    const m = jevStageModel({ status: "ready", board: board([read({ decision: null })]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.headline).toBe("SEM DECISAO");
    expect(m.statusLine).toContain("modo observacao");
  });

  test("a market Jev has not read yet is not shown with another market's call", () => {
    const m = jevStageModel({ status: "ready", board: board([read()]), focus: "SOL-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.headline).toBe("AGUARDANDO");
    expect(m.statusLine).toContain("SOL-USDT");
  });

  test.each([
    ["idle", "Consultando o Jev"],
    ["loading", "Consultando o Jev"],
    ["absent", "produtor"],
    ["error", "backend"],
  ] as const)("when the board is %s the stage says what to do, with no number", (status: "idle" | "loading" | "absent" | "error", text: string) => {
    const m = jevStageModel({ status, board: null, focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null });
    expect(m.statusLine).toContain(text);
    expect(m.probabilities.every((p) => p.p === null)).toBe(true);
    expect(m.tone).toBe("neutral");
  });

  test("nothing it renders carries a middle dot, an em dash or an en dash", () => {
    const models = [
      jevStageModel({ status: "ready", board: board([read()]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null }),
      jevStageModel({ status: "absent", board: null, focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null }),
      jevStageModel({ status: "ready", board: board([read({ state: null, decision: null, insufficient: ["book_stale", "ticker_missing"] })]), focus: "BTC-USDT", nowMs: NOW, browserSkewMs: null }),
    ];
    for (const m of models) expect(JSON.stringify(m)).not.toMatch(FORBIDDEN_TEXT);
  });
});

describe("reasonLabel", () => {
  test("every producer reason has a Portuguese label and an unknown one is generic", () => {
    for (const r of ["book_missing", "book_stale", "book_crossed", "ticker_missing", "ticker_stale", "candles_short", "candles_stale", "clock_unknown", "trades_unavailable"]) {
      expect(reasonLabel(r)).not.toBe(r);
    }
    expect(reasonLabel("surprise")).toBe("dado insuficiente");
  });
});

describe("feedChips", () => {
  const feed = (id: DeskFeedStatus["id"], state: DeskFeedStatus["state"], detail: string | null = null): DeskFeedStatus => ({ id, state, lastMessageAtMs: NOW - 100, freshnessMs: 5_000, reconnects: 0, detail });

  test("live feeds are live, stale and reconnecting are late, failed is down", () => {
    const chips = feedChips({
      desk: [feed("okx-public-ws", "live"), feed("okx-business-ws", "reconnecting", "reconectando"), feed("okx-public-rest", "failed", "HTTP 503")],
      jev: { status: "ready", ageMs: 10_000 },
      wallet: { status: "disconnected", available: true },
      operator: { status: "absent" },
    });
    const by = Object.fromEntries(chips.map((c) => [c.id, c]));
    expect(by["okx-public-ws"]!.tone).toBe("live");
    expect(by["okx-business-ws"]!.tone).toBe("late");
    expect(by["okx-public-rest"]!.tone).toBe("down");
    expect(by["okx-public-rest"]!.detail).toBe("HTTP 503");
  });

  test("jev: ready and fresh is live, ready but old is late, absent or error is down", () => {
    const base = { desk: [], wallet: { status: "disconnected", available: false } as const, operator: { status: "absent" } as const };
    const tone = (jev: { status: "idle" | "loading" | "ready" | "absent" | "error"; ageMs: number | null }) => feedChips({ ...base, jev }).find((c) => c.id === "jev-backend")!.tone;
    expect(tone({ status: "ready", ageMs: 20_000 })).toBe("live");
    expect(tone({ status: "ready", ageMs: 200_000 })).toBe("late");
    expect(tone({ status: "ready", ageMs: 900_000 })).toBe("down");
    expect(tone({ status: "absent", ageMs: null })).toBe("down");
    expect(tone({ status: "error", ageMs: null })).toBe("down");
    expect(tone({ status: "loading", ageMs: null })).toBe("off");
  });

  test("the wallet chip says what is true: not installed, not connected, connected", () => {
    const base = { desk: [], jev: { status: "absent", ageMs: null } as const, operator: { status: "absent" } as const };
    const chip = (wallet: { status: string; available: boolean }) => feedChips({ ...base, wallet }).find((c) => c.id === "okx-wallet")!;
    expect(chip({ status: "disconnected", available: false }).detail).toBe("extensao nao encontrada");
    expect(chip({ status: "disconnected", available: true }).detail).toBe("nao conectada");
    expect(chip({ status: "connected", available: true }).tone).toBe("live");
  });

  test("onchainos is never shown live without an operator cycle", () => {
    const chips = feedChips({ desk: [], jev: { status: "absent", ageMs: null }, wallet: { status: "disconnected", available: false }, operator: { status: "absent" } });
    const onchain = chips.find((c) => c.id === "onchainos")!;
    expect(onchain.tone).toBe("down");
    expect(onchain.detail).toContain("operador");
  });
});

describe("capabilityRows", () => {
  test("lists the OKX ecosystem modules with an honest state and the next requirement when blocked", () => {
    const rows = capabilityRows({
      desk: [{ id: "okx-public-ws", state: "live", lastMessageAtMs: NOW, freshnessMs: 5000, reconnects: 0, detail: null }],
      jev: { status: "ready", ageMs: 10_000 },
      systemOne: { status: "ready", execution: "blocked", reasons: ["inventory_value_incomplete"] },
      wallet: { status: "disconnected", available: true },
      operator: { status: "absent" },
      hasDerivatives: true,
    });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by["market-v5"]!.state).toBe("live");
    expect(by["jev-tape"]!.state).toBe("live");
    expect(by["derivatives"]!.state).toBe("live");
    expect(by["wallet"]!.state).toBe("blocked");
    expect(by["wallet"]!.next).toContain("Conectar");
    expect(by["onchainos-dex"]!.state).toBe("blocked");
    expect(by["onchainos-dex"]!.next).toContain("chave");
    expect(by["system-one"]!.state).toBe("held");
  });

  test("a System One cycle from synthetic data, the mock model or an undeclared origin is never shown as live", () => {
    const base = { desk: [], jev: { status: "absent" as const, ageMs: null }, wallet: { status: "disconnected", available: false }, operator: { status: "absent" as const }, hasDerivatives: false };
    const row = (origin: { marketSource?: string | null; walletSource?: string | null; model?: string | null }) =>
      capabilityRows({ ...base, systemOne: { status: "ready", execution: "dry_run", reasons: [], ...origin } }).find((r) => r.id === "system-one")!;

    const real = row({ marketSource: "okx_public_v5", walletSource: "okx_balance_api", model: "jev-latest" });
    expect(real.state).toBe("live");
    expect(row({ marketSource: "okx_public_v5", walletSource: "configured", model: "jev-1.13.0" }).state).toBe("live");

    const syntheticMarket = row({ marketSource: "synthetic", walletSource: "okx_balance_api", model: "jev-latest" });
    expect(syntheticMarket.state).toBe("held");
    expect(syntheticMarket.detail).toContain("sintetico");

    const syntheticWallet = row({ marketSource: "okx_public_v5", walletSource: "synthetic", model: "jev-latest" });
    expect(syntheticWallet.state).toBe("held");
    expect(syntheticWallet.detail).toContain("sintetica");

    const mock = row({ marketSource: "okx_public_v5", walletSource: "okx_balance_api", model: "mock" });
    expect(mock.state).toBe("held");
    expect(mock.detail).toContain("mock");

    for (const unknown of [{}, { marketSource: null, walletSource: null, model: null }, { marketSource: "unknown", walletSource: "okx_balance_api", model: "jev-latest" }, { marketSource: "okx_public_v5", walletSource: "okx_balance_api", model: "desconhecido" }]) {
      const held = row(unknown);
      expect(held.state).toBe("held");
      expect(held.detail).toContain("origem");
    }
    expect(JSON.stringify([syntheticMarket, syntheticWallet, mock])).not.toMatch(FORBIDDEN_TEXT);
  });

  test("no row is ever live from a fixture: with nothing observed every row is blocked or off", () => {
    const rows = capabilityRows({ desk: [], jev: { status: "absent", ageMs: null }, systemOne: { status: "absent", execution: null, reasons: [] }, wallet: { status: "disconnected", available: false }, operator: { status: "absent" }, hasDerivatives: false });
    expect(rows.some((r) => r.state === "live")).toBe(false);
  });

  test("text carries no forbidden characters", () => {
    const rows = capabilityRows({ desk: [], jev: { status: "error", ageMs: null }, systemOne: { status: "error", execution: null, reasons: [] }, wallet: { status: "connected", available: true }, operator: { status: "error" }, hasDerivatives: false });
    expect(JSON.stringify(rows)).not.toMatch(FORBIDDEN_TEXT);
  });
});

describe("journalRows", () => {
  test("newest first, one row per read, with a readable time and weight", () => {
    const b = board([read({ readId: "jr-a", atMs: NOW - 60_000 }), read({ readId: "jr-b", atMs: NOW - 5_000, instId: "ETH-USDT", decision: { action: "hold", probabilities: { buy: 0.2, sell: 0.2, hold: 0.6 }, confidence: 0.6, latencyMs: 300, model: "jev-1.13.0", status: "ok", inputTokens: 900 } })]);
    b.recent = [b.recent[1]!, b.recent[0]!];
    const rows = journalRows(b.recent, 5);
    expect(rows.map((r) => r.id)).toEqual(["jr-b", "jr-a"]);
    expect(rows[0]!.inst).toBe("ETH");
    expect(rows[0]!.action).toBe("Manter");
    expect(rows[0]!.weight).toBe("60%");
    expect(rows[1]!.action).toBe("Vender");
  });

  test("insufficient reads are listed as such and the list is capped", () => {
    const many = Array.from({ length: 9 }, (_, i) => read({ readId: `jr-${i}`, state: null, decision: null, insufficient: ["book_missing"] }));
    const rows = journalRows(many, 4);
    expect(rows).toHaveLength(4);
    expect(rows[0]!.action).toBe("Sem leitura");
    expect(rows[0]!.weight).toBe("Indisponivel");
  });
});

describe("newestReadAgeMs", () => {
  test("is the age of the freshest read", () => {
    const b = board([read({ instId: "BTC-USDT", atMs: NOW - 50_000 }), read({ instId: "ETH-USDT", atMs: NOW - 8_000 })]);
    expect(newestReadAgeMs(b, NOW, null)).toBe(8_000);
  });

  test("is null with no board, no reads, or no honest age", () => {
    expect(newestReadAgeMs(null, NOW, null)).toBeNull();
    expect(newestReadAgeMs(board([]), NOW, null)).toBeNull();
    expect(newestReadAgeMs(board([read({ clockOffsetMs: 69_500 })]), NOW, null)).toBeNull();
  });
});

describe("systemOneLine", () => {
  const cycle = (choice: string | null, reasons: string[]): SystemOneCycleView => ({
    cycleId: "so-1", startedAtMs: 1, completedAtMs: 2,
    brief: { phase: "fase-2", horizonDays: 7, market: { instId: "MON-USDT-SWAP", indexPrice: null, markPrice: 0.027, fundingRate: 0, fundingIntervalMs: null, realizedSigmaDaily: 0.05, candlesUsed: 95, source: "okx_public_v5", observedAtMs: 1 }, wallet: { capitalUsd: 500, knownValueUsd: 0, valueComplete: false, openNotionalUsd: 0, openSide: null, source: "configured" }, limits: { leverageCeiling: 2, leverageCap: 2, orderCapUsd: 10, exposureCapUsd: 98, liquidationDistanceFloor: 0.35, dailyStopUsd: 10 }, candidates: [], eligibleIds: [], notes: [] },
    decision: choice === null ? null : { choice, probabilities: { hold: 1 }, confidence: null, latencyMs: 1, model: "jev-1.13.0", status: "ok" },
    chosen: null, execution: { status: "blocked", reasons }, warnings: [],
  });

  test("says what the leverage layer decided and why it is held", () => {
    expect(systemOneLine({ status: "ready", cycle: cycle(null, ["system_one_never_executes", "no_eligible_candidate", "jev_not_asked", "inventory_value_incomplete"]) }))
      .toBe("System One, alavancagem em MON-USDT-SWAP: Jev nao consultado, nenhum candidato elegivel, Jev nao consultado, inventario nao observado.");
    expect(systemOneLine({ status: "ready", cycle: cycle("hold", ["hold"]) })).toBe("System One, alavancagem em MON-USDT-SWAP: manter.");
  });

  test("is null when nothing is recorded and never carries forbidden characters", () => {
    expect(systemOneLine({ status: "absent", cycle: null })).toBeNull();
    expect(systemOneLine({ status: "error", cycle: null })).toBeNull();
    expect(systemOneLine({ status: "ready", cycle: cycle("long-2x", []) })).not.toMatch(FORBIDDEN_TEXT);
  });
});
