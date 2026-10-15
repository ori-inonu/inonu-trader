// The data source of "Pedir ao Inonu" for one OKX instrument: three free public reads at the moment of the click, the flow
// engine, and a Brief. origin: synthetic_fixture (the reads are fakes), tests only.
import { describe, expect, test } from "bun:test";
import type { AnalystCandle } from "../intel/analyst";
import type { InstrumentMeta } from "../intel/footprint";
import type { Trade } from "../intel/ingest";
import type { ThresholdCandle } from "../intel/thresholds";
import { SourceError } from "./ask";
import { OkxPublicError, type OkxPublic } from "./okx-public";
import { createCollector } from "./collector";
import { createOkxSource } from "./source";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const META: InstrumentMeta = { instId: "TEST-USDT", instType: "SPOT", tickSz: "0.5", lotSz: "1" };
const candles: AnalystCandle[] = Array.from({ length: 21 }, (_, i) => ({ ts: T0 - (21 - i) * MIN, open: "100", high: "101", low: "99", close: "100" }));
const trade = (ts: number, px: string, sz: number, side: "buy" | "sell"): Trade => ({ ts, px, sz: String(sz), side });
const trades: Trade[] = [
  trade(T0 + 1_000, "99.0", 60, "buy"), trade(T0 + 1_100, "99.0", 10, "sell"),
  trade(T0 + 2_000, "99.5", 90, "buy"), trade(T0 + 2_100, "99.5", 10, "sell"),
  trade(T0 + 3_000, "100.0", 50, "buy"), trade(T0 + 3_100, "100.0", 8, "sell"),
  trade(T0 + 4_000, "101.0", 5, "buy"), trade(T0 + 4_100, "101.0", 5, "sell"),
];
const history: ThresholdCandle[] = [0, 1, 2].map(() => ({ binTicks: 1, levels: [{ c: 10, v: 10 }, { c: 30, v: 10 }, { c: 20, v: 20 }] }));

function fakeRest(over: Partial<OkxPublic> = {}) {
  const calls: { what: string; signal?: AbortSignal }[] = [];
  const rest: OkxPublic = {
    instrument: async (_id, signal) => (calls.push({ what: "instrument", ...(signal ? { signal } : {}) }), META),
    candles: async (_id, _limit, signal) => (calls.push({ what: "candles", ...(signal ? { signal } : {}) }), candles),
    trades: async (_id, _limit, signal) => (calls.push({ what: "trades", ...(signal ? { signal } : {}) }), { trades, rejected: 0 }),
    ...over,
  };
  return { rest, calls };
}

const context = (signal = new AbortController().signal) => ({ signal, maxOnchainosCalls: 15 });
const request = { modo: "ativo", alvo: { instId: "TEST-USDT" } } as const;

describe("the regime of a perpetual in the Brief (T5.10)", () => {
  const swap: InstrumentMeta = { instId: "TEST-USDT-SWAP", instType: "SWAP", tickSz: "0.5", lotSz: "1", ctVal: "1", ctMult: "1" };
  const swapRequest = { modo: "ativo", alvo: { instId: "TEST-USDT-SWAP" } } as const;
  const reading = { regime: { funding: 1, oiVar: 2.5, btcBeta: null }, nulos: { "regime.btcBeta": "nao coletado" }, atMs: T0 };

  test("a perpetual carries the funding in basis points and the open interest change, and says why the beta is null", async () => {
    const { rest } = fakeRest({ instrument: async () => swap });
    const asked: string[] = [];
    const source = createOkxSource({ rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3, derivatives: { read: async (id) => (asked.push(id), reading) } });
    const built = await source.build(swapRequest, context());
    expect(built.brief.regime).toEqual({ funding: 1, oiVar: 2.5, btcBeta: null });
    expect(built.brief.nulos["regime.btcBeta"]).toBe("nao coletado");
    expect(built.brief.nulos.regime).toBeUndefined();
    expect(asked).toEqual(["TEST-USDT-SWAP"]);
    expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
  });

  test("spot has no such regime: it is null with the reason, and nothing is asked", async () => {
    const { rest } = fakeRest();
    let asked = 0;
    const source = createOkxSource({ rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3, derivatives: { read: async () => (asked += 1, reading) } });
    const built = await source.build(request, context());
    expect(built.brief.regime).toBeNull();
    expect(built.brief.nulos.regime).toBe("so existe para perpetuos");
    expect(asked).toBe(0);
  });

  test("a reader that returns nothing for the instrument keeps the old reason, and one that fails never fails the click", async () => {
    const { rest } = fakeRest({ instrument: async () => swap });
    const none = await createOkxSource({ rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3, derivatives: { read: async () => null } }).build(swapRequest, context());
    expect(none.brief.regime).toBeNull();
    expect(none.brief.nulos.regime).toBe("nao coletado nesta versao");
    const failing = await createOkxSource({ rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3, derivatives: { read: async () => Promise.reject(new Error("SENTINEL")) } }).build(swapRequest, context());
    expect(failing.brief.regime).toBeNull();
    expect(failing.brief.nulos.regime).toBe("indisponivel");
    expect(JSON.stringify(failing.brief)).not.toContain("SENTINEL");
  });

  test("a click that was cancelled is cancelled, not turned into a missing regime", async () => {
    const { rest } = fakeRest({ instrument: async () => swap });
    const controller = new AbortController();
    const source = createOkxSource({
      rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3,
      derivatives: { read: async () => { controller.abort(); throw new OkxPublicError("aborted"); } },
    });
    await expect(source.build(swapRequest, context(controller.signal))).rejects.toMatchObject({ code: "okx_aborted" });
  });
});

describe("the instrument Brief", () => {
  test("three free reads, then the Brief with the instrument, the zone and the option to keep, in 2 KB", async () => {
    const { rest, calls } = fakeRest();
    const source = createOkxSource({ rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3 });
    const built = await source.build(request, context());
    expect(calls.map((c) => c.what).sort()).toEqual(["candles", "instrument", "trades"]);
    expect(built.onchainosCalls).toBe(0);
    expect(built.candidates.map((c) => c.tipo)).toEqual(["zona", "spot", "manter"]);
    expect(built.brief.candidatos.map((c) => c.id)).toEqual(built.candidates.map((c) => c.id));
    expect(new TextEncoder().encode(JSON.stringify(built.brief)).length).toBeLessThanOrEqual(2048);
    expect(built.brief.familiasHabilitadas).toEqual(["E2", "E3"]);
    expect(built.brief.alvo).toEqual({ instId: "TEST-USDT" });
    expect(built.brief.origens.fluxo).toBe("okx_public_v5");
    expect(built.brief.idades.fluxo).toBe(900); // 5_000 - 4_100
    expect(built.brief.nulos.trilha).toMatch(/OKX/);
  });

  test("the flow carries the share of the delta in the volume of the window, which unlike the delta itself is comparable across instruments (RAS-6)", async () => {
    const { rest } = fakeRest();
    const built = await createOkxSource({ rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3 }).build(request, context());
    // 205 bought and 33 sold of 238 traded: (205 - 33) / 238
    expect(built.brief.fluxo).toMatchObject({ deltaRazao: 0.723 });
    // a window with no trade has no share: null, never zero
    const quiet = await createOkxSource({ rest: fakeRest({ trades: async () => ({ trades: [], rejected: 0 }) }).rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3 }).build(request, context());
    expect(quiet.brief.fluxo).toMatchObject({ deltaRazao: null });
  });

  test("a perpetual is offered as a perp candidate", async () => {
    const swap: InstrumentMeta = { instId: "TEST-USDT-SWAP", instType: "SWAP", tickSz: "0.5", lotSz: "1", ctVal: "1", ctMult: "1" };
    const { rest } = fakeRest({ instrument: async () => swap });
    const built = await createOkxSource({ rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3 }).build({ modo: "ativo", alvo: { instId: "TEST-USDT-SWAP" } }, context());
    expect(built.candidates.some((c) => c.id === "perp:TEST-USDT-SWAP")).toBe(true);
  });

  test("without history the Brief still builds, with the flow factors null and the reason written", async () => {
    const built = await createOkxSource({ rest: fakeRest().rest, now: () => T0 + 5_000 }).build(request, context());
    expect(built.brief.fluxo).toMatchObject({ imb: null, seq: null });
    expect(built.brief.nulos["fluxo.imb"]).toBe("aquecimento");
    expect(built.candidates.map((c) => c.tipo)).toEqual(["spot", "manter"]); // no active zone while warming up
  });

  test("the zones carry over between clicks, so the id of a zone does not change", async () => {
    const source = createOkxSource({ rest: fakeRest().rest, now: () => T0 + 5_000, history: () => history, warmupCandles: 3 });
    const first = await source.build(request, context());
    const second = await source.build(request, context());
    expect(second.candidates[0]!.id).toBe(first.candidates[0]!.id);
    expect(second.brief.hash).toBe(first.brief.hash);
  });

  test("the abort signal of the click reaches every read", async () => {
    const { rest, calls } = fakeRest();
    const controller = new AbortController();
    await createOkxSource({ rest, now: () => T0 }).build(request, context(controller.signal));
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.signal === controller.signal)).toBe(true);
  });
});

describe("with the live collector", () => {
  const live = async () => {
    const { rest, calls } = fakeRest();
    const collector = createCollector({ rest, now: () => T0 + 5_000 });
    return { rest, calls, collector };
  };

  test("the trades of the live window replace the REST ones, the history comes from the collector, and the Brief names the source", async () => {
    const { rest, calls, collector } = await live();
    const watched: string[] = [];
    const source = createOkxSource({ rest, now: () => T0 + 5_000, collector, onWatch: (id) => void watched.push(id), warmupCandles: 3 });
    await collector.watch("TEST-USDT");
    // three past minutes, each with a footprint, then the minute in progress with the window of the scenario
    for (let m = 3; m >= 1; m -= 1) {
      collector.ingest("TEST-USDT", Array.from({ length: 6 }, (_, k) => trade(-m * MIN + 1_000 + k * 100, k % 2 === 0 ? "99.0" : "99.5", k % 2 === 0 ? 30 : 20, k % 2 === 0 ? "buy" : "sell")));
    }
    collector.ingest("TEST-USDT", trades);
    calls.length = 0;
    const built = await source.build(request, context());
    expect(watched).toEqual(["TEST-USDT"]);
    expect(calls.map((c) => c.what)).toEqual(["candles"]); // the trades and the instrument come from the collector now
    expect(built.brief.origens.fluxo).toBe("okx_ws_trades");
    expect(built.brief.fluxo).toMatchObject({ imb: expect.anything() });
    expect(built.brief.nulos["fluxo.imb"]).toBeUndefined();
  });

  test("a collector that has not seen enough live trades yet falls back to the REST window, and says so", async () => {
    const { rest, calls, collector } = await live();
    const source = createOkxSource({ rest, now: () => T0 + 5_000, collector });
    await collector.watch("TEST-USDT");
    calls.length = 0;
    const built = await source.build(request, context());
    expect(calls.map((c) => c.what).sort()).toEqual(["candles", "instrument", "trades"]);
    expect(built.brief.origens.fluxo).toBe("okx_public_v5");
  });

  test("an instrument the collector could not load still works from REST", async () => {
    const { rest } = fakeRest();
    const failing = createCollector({ rest: { ...rest, instrument: async () => Promise.reject(new Error("down")) }, now: () => T0 });
    const built = await createOkxSource({ rest, now: () => T0 + 5_000, collector: failing }).build(request, context());
    expect(built.brief.origens.fluxo).toBe("okx_public_v5");
  });
});

describe("the chart overlay", () => {
  const sourceWith = (restOver: Partial<OkxPublic> = {}, now = () => T0 + 5_000) => {
    const { rest, calls } = fakeRest(restOver);
    return { source: createOkxSource({ rest, now, history: () => history, warmupCandles: 3 }), calls };
  };

  test("is the same analysis as the Brief, drawn in price: levels, the stacked imbalance and one active zone", async () => {
    const { source } = sourceWith();
    const o = await source.overlay("TEST-USDT", new AbortController().signal);
    expect(o).toMatchObject({ ok: true, instId: "TEST-USDT", fonte: "okx_public_v5", price: 101, step: 0.5 });
    expect(o.corridas.sequencial).toEqual([{ lado: "c", baixo: 99, alto: 100.5, n: 3 }]);
    expect(o.zonas).toHaveLength(1);
  });

  test("the footprint covers the last minute only, as the thresholds do: a thin pair's old trades do not inflate the imbalances", async () => {
    // the 500 latest trades of a thin pair can be hours old; the thresholds learned from one-minute candles would read them as one candle
    const old = [trade(T0 - 3 * 3_600_000, "95.0", 400, "buy"), trade(T0 - 3 * 3_600_000 + 100, "95.0", 1, "sell"), trade(T0 - 2 * 3_600_000, "96.0", 300, "buy"), trade(T0 - 61_000, "97.0", 500, "buy")];
    const { source } = sourceWith({ trades: async () => ({ trades: [...old, ...trades], rejected: 0 }) });
    const o = await source.overlay("TEST-USDT", new AbortController().signal);
    const lows = o.niveis.map((n) => n.baixo);
    expect(lows).toEqual([99, 99.5, 100, 101]); // only the trades of the last minute: none of 95, 96 or 97
    expect(o.totais).toEqual({ c: 205, v: 33 });
  });

  test("a minute with no trade is an empty reading that says so, never an old one drawn as current", async () => {
    const stale = [trade(T0 - 10 * MIN, "95.0", 400, "buy"), trade(T0 - 9 * MIN, "96.0", 300, "sell")];
    const { source } = sourceWith({ trades: async () => ({ trades: stale, rejected: 0 }) });
    const o = await source.overlay("TEST-USDT", new AbortController().signal);
    expect(o.niveis).toEqual([]);
    expect(o.totais).toEqual({ c: 0, v: 0 });
  });

  test("a zone keeps one identity between the overlay and the Brief", async () => {
    const { source } = sourceWith();
    const o = await source.overlay("TEST-USDT", new AbortController().signal);
    const built = await source.build(request, context());
    expect(built.candidates[0]!.id).toBe(`zona:${o.zonas[0]!.id}`);
  });

  test("polling it does not hammer the exchange: the candles (and, without the live feed, the trades) are reused for a few seconds", async () => {
    let now = T0 + 5_000;
    const { source, calls } = sourceWith({}, () => now);
    await source.overlay("TEST-USDT", new AbortController().signal);
    await source.overlay("TEST-USDT", new AbortController().signal);
    now += 5_000;
    await source.overlay("TEST-USDT", new AbortController().signal);
    expect(calls.filter((c) => c.what === "candles")).toHaveLength(1);
    expect(calls.filter((c) => c.what === "trades")).toHaveLength(1);
    expect(calls.filter((c) => c.what === "instrument")).toHaveLength(1);
    now += 60_000;
    await source.overlay("TEST-USDT", new AbortController().signal);
    expect(calls.filter((c) => c.what === "candles")).toHaveLength(2);
  });

  test("with the live collector the overlay is built from its window and says so", async () => {
    const { rest, calls } = fakeRest();
    const collector = createCollector({ rest, now: () => T0 + 5_000 });
    const source = createOkxSource({ rest, now: () => T0 + 5_000, collector, warmupCandles: 3 });
    await collector.watch("TEST-USDT");
    for (let m = 3; m >= 1; m -= 1) {
      collector.ingest("TEST-USDT", Array.from({ length: 6 }, (_, k) => trade(-m * MIN + 1_000 + k * 100, k % 2 === 0 ? "99.0" : "99.5", k % 2 === 0 ? 30 : 20, k % 2 === 0 ? "buy" : "sell")));
    }
    collector.ingest("TEST-USDT", trades);
    calls.length = 0;
    const o = await source.overlay("TEST-USDT", new AbortController().signal);
    expect(o.fonte).toBe("okx_ws_trades");
    expect(o.aquecimento).toEqual({ fechadas: 3, necessarias: 3, pronto: true, restaurado: 0 });
    expect(calls.map((c) => c.what)).toEqual(["candles"]);
  });

  test("a collector that remembers the previous run starts with the thresholds ready, and the overlay says so", async () => {
    const { rest } = fakeRest();
    const memory = {
      read: () => ({ binTicks: 1, history: [0, 1, 2].map(() => ({ binTicks: 1, levels: [{ c: 10, v: 10 }, { c: 30, v: 10 }, { c: 20, v: 20 }] })), tradeUnits: [1, 2, 3], savedAtMs: T0 }),
      write: () => {},
    };
    const collector = createCollector({ rest, now: () => T0 + 5_000, memory });
    const source = createOkxSource({ rest, now: () => T0 + 5_000, collector, warmupCandles: 3 });
    await collector.watch("TEST-USDT");
    collector.ingest("TEST-USDT", trades);
    const o = await source.overlay("TEST-USDT", new AbortController().signal);
    expect(o.aquecimento).toEqual({ fechadas: 3, necessarias: 3, pronto: true, restaurado: 3 });
  });

  test("an unsupported or malformed target is refused with a constant code before any read", async () => {
    const { source, calls } = sourceWith();
    for (const bad of ["BTC-USD-250627-60000-C", "BTC-USDT-250627", "btc usdt", ""]) {
      const failure = await source.overlay(bad, new AbortController().signal).catch((e) => e);
      expect(failure).toBeInstanceOf(SourceError);
      expect(["alvo_invalido", "instrumento_nao_suportado"]).toContain(failure.code);
    }
    expect(calls).toEqual([]);
  });

  test("an inverse contract is told as an unsupported instrument, the words the desk already has for it", async () => {
    const { source } = sourceWith({ instrument: async () => { throw new OkxPublicError("instrument_unsupported"); } });
    await expect(source.overlay("TEST-USDT", new AbortController().signal)).rejects.toMatchObject({ code: "instrumento_nao_suportado" });
  });

  test("an exchange failure becomes a constant code of ours", async () => {
    const { source } = sourceWith({ candles: async () => { throw new OkxPublicError("timeout"); } });
    const failure = await source.overlay("TEST-USDT", new AbortController().signal).catch((e) => e);
    expect(failure).toMatchObject({ code: "okx_timeout" });
  });
});

describe("refusals", () => {
  test("the other modes are not available yet, with a constant code, before any read", async () => {
    const { rest, calls } = fakeRest();
    const source = createOkxSource({ rest, now: () => T0 });
    for (const modo of ["token", "descoberta", "filtro", "ranking"] as const) {
      const failure = await source.build({ modo, ...(modo === "filtro" ? { textoLivre: "x" } : {}) } as never, context()).catch((e) => e);
      expect(failure).toBeInstanceOf(SourceError);
      expect(failure.code).toBe("modo_nao_disponivel");
    }
    expect(calls).toEqual([]);
  });

  test("a missing or unsupported target is refused before any read", async () => {
    const { rest, calls } = fakeRest();
    const source = createOkxSource({ rest, now: () => T0 });
    for (const bad of [{ modo: "ativo" }, { modo: "ativo", alvo: { chainIndex: "1", address: "0xabc" } }, { modo: "ativo", alvo: { instId: "BTC-USD-250627-60000-C" } }, { modo: "ativo", alvo: { instId: "BTC-USDT-250627" } }]) {
      const failure = await source.build(bad as never, context()).catch((e) => e);
      expect(failure).toBeInstanceOf(SourceError);
      expect(["alvo_invalido", "instrumento_nao_suportado"]).toContain(failure.code);
    }
    expect(calls).toEqual([]);
  });

  test("a read that fails becomes a constant code of ours, never the provider's text", async () => {
    const { rest } = fakeRest({ trades: async () => { throw new OkxPublicError("timeout"); } });
    const failure = await createOkxSource({ rest, now: () => T0 }).build(request, context()).catch((e) => e);
    expect(failure).toBeInstanceOf(SourceError);
    expect(failure.code).toBe("okx_timeout");
  });

  test("a cancelled click is not reported as a data failure", async () => {
    const { rest } = fakeRest({ trades: async () => { throw new OkxPublicError("aborted"); } });
    const failure = await createOkxSource({ rest, now: () => T0 }).build(request, context()).catch((e) => e);
    expect(failure).toMatchObject({ code: "okx_aborted" });
  });

  test("a failure that is not ours is not wrapped into something that looks safe", async () => {
    const { rest } = fakeRest({ instrument: async () => { throw new Error("SENTINEL-secret"); } });
    const failure = await createOkxSource({ rest, now: () => T0 }).build(request, context()).catch((e) => e);
    expect(failure).not.toBeInstanceOf(SourceError); // the asker turns any other error into a constant code
  });
});
