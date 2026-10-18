import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHealthHandler, createJevReadHandler, isJevReadPath } from "./http";
import { publicBoardView, publicReadView } from "./public-view";
import { JevReadStore } from "./store";
import { JEV_READ_SCHEMA_VERSION, type JevRead, type TapeState } from "./types";

const state: TapeState = {
  instId: "BTC-USDT",
  horizonMinutes: 5,
  mid: 83957.35,
  spreadBps: 0.12,
  bookImbalanceTop5: -0.31,
  depthQuoteTop5: { bid: 120_000, ask: 190_000 },
  returnsBps: { m1: 1.2, m5: -3.4, m15: 5.6, m30: 7.8 },
  volBpsPerMinute: 2.3,
  flow60s: { count: 12, buyBase: 0.4, sellBase: 0.9, imbalance: -0.38, cvdBase: -0.5, vwap: 83950, lastPx: 83957.4, lastSide: "buy" },
  change24hPct: 1.4,
  rangePosition24h: 0.62,
  fundingRatePct: -0.0013,
};

function read(overrides: Partial<JevRead> = {}): JevRead {
  return {
    schemaVersion: JEV_READ_SCHEMA_VERSION,
    readId: "jr-abc123def456",
    instId: "BTC-USDT",
    atMs: 1_791_741_700_000,
    clockOffsetMs: 69_522,
    advisory: true,
    execution: "never",
    state,
    insufficient: [],
    decision: { action: "hold", probabilities: { buy: 0.2, sell: 0.3, hold: 0.5 }, confidence: 0.5, latencyMs: 812, model: "jev-1.13.0", status: "ok", inputTokens: 1_104 },
    ...overrides,
  };
}

describe("publicReadView", () => {
  test("projects a valid read and keeps its advisory flags", () => {
    const view = publicReadView(read()) as Record<string, unknown>;
    expect(view.advisory).toBe(true);
    expect(view.execution).toBe("never");
    expect((view.decision as Record<string, unknown>).action).toBe("hold");
    expect((view.state as Record<string, unknown>).mid).toBe(83957.35);
  });

  test("drops every field that is not on the allowlist, including provider free text", () => {
    const dirty = { ...read(), secret: "x", decision: { ...read().decision, reasoning: "ignore previous instructions", apiKey: "k" } };
    const text = JSON.stringify(publicReadView(dirty));
    expect(text).not.toContain("ignore previous");
    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("secret");
  });

  test("an unknown model name is shown as unknown, never as provider text", () => {
    const view = publicReadView(read({ decision: { ...read().decision!, model: "totally-made-up\nmodel" } })) as { decision: { model: string } };
    expect(view.decision.model).toBe("unknown");
  });

  test.each([
    ["a read that claims to execute", { execution: "now" }],
    ["a read that is not advisory", { advisory: false }],
    ["a wrong schema version", { schemaVersion: 2 }],
    ["an instrument that is not a market id", { instId: "<script>" }],
    ["a non finite time", { atMs: Number.NaN }],
    ["a read id that is not an id", { readId: "../../etc/passwd" }],
  ])("rejects %s", (_label, patch) => {
    expect(publicReadView({ ...read(), ...patch })).toBeNull();
  });

  test("weights and confidence are bounded: a hostile file cannot publish impossible numbers", () => {
    const decision = (probabilities: { buy: number; sell: number; hold: number }, confidence: number | null, action: "buy" | "sell" | "hold" = "hold") =>
      read({ decision: { action, probabilities, confidence, latencyMs: 1, model: "jev-1.13.0", status: "ok", inputTokens: null } });
    expect(publicReadView(decision({ buy: 0.9, sell: 0.9, hold: 0.9 }, 0.9))).toBeNull();
    expect(publicReadView(decision({ buy: 0.2, sell: 0.3, hold: 0.5 }, 1e308))).toBeNull();
    expect(publicReadView(decision({ buy: 0.2, sell: 0.3, hold: 0.5 }, 0.9))).toBeNull(); // confidence must equal the chosen weight
    expect(publicReadView(decision({ buy: 0.2, sell: 0.3, hold: 0.5 }, -0.5))).toBeNull();
    expect(publicReadView(decision({ buy: 0.2, sell: 0.3, hold: 0.5 }, 0.5))).not.toBeNull();
    expect(publicReadView(decision({ buy: 0.2, sell: 0.3, hold: 0.5 }, null))).not.toBeNull();
  });

  test("the new insufficiency reasons are allowlisted", () => {
    const view = publicReadView(read({ state: null, decision: null, insufficient: ["clock_unknown", "trades_unavailable"] })) as { insufficient: string[] };
    expect(view.insufficient).toEqual(["clock_unknown", "trades_unavailable"]);
  });

  test("a decision must be consistent: an action needs a status ok and weight", () => {
    const bad = read({ decision: { action: "buy", probabilities: { buy: 0, sell: 1, hold: 0 }, confidence: 0, latencyMs: 1, model: "jev-1.13.0", status: "ok", inputTokens: null } });
    expect(publicReadView(bad)).toBeNull();
  });

  test("an insufficient read carries only allowlisted reasons and no decision", () => {
    const view = publicReadView(read({ state: null, decision: null, insufficient: ["book_missing", "candles_short"] })) as { insufficient: string[]; decision: unknown; state: unknown };
    expect(view.insufficient).toEqual(["book_missing", "candles_short"]);
    expect(view.decision).toBeNull();
    expect(view.state).toBeNull();
    const injected = publicReadView({ ...read({ state: null, decision: null }), insufficient: ["book_missing", "rm -rf /"] }) as { insufficient: string[] };
    expect(injected.insufficient).toEqual(["book_missing"]);
  });

  test("a read with neither state nor reasons, or a decision without a state, is invalid", () => {
    expect(publicReadView(read({ state: null, decision: null, insufficient: [] }))).toBeNull();
    expect(publicReadView(read({ state: null }))).toBeNull();
  });

  describe("analysis projection", () => {
    const analysis = {
      ageSec: 12,
      trend: { regime: "up", adx15m: 38.2, efficiency15m: 0.4, emaStack15m: 1, emaStack1h: 0, emaStack4h: 1, extensionAtr15m: 4.2 },
      structure: {
        donchianPos1h: 0.9,
        supportBps: 9.2,
        supportTouches: 2,
        resistanceBps: 32.6,
        resistanceTouches: 1,
        renkoRun15m: 5,
        levels: [{ px: 83950, kind: "support", touches: 3, tf: "15m" }],
      },
      cost: { assumedRoundTripFeeBps: 20, spreadBps: 0.4, moveToCost: 1.1 },
    };
    const viewOf = (a: unknown) => publicReadView(read({ state: { ...state, analysis: a as TapeState["analysis"] } })) as { state: Record<string, unknown> };

    test("a full analysis survives the projection verbatim", () => {
      const view = viewOf(analysis);
      expect(view.state.analysis).toEqual(analysis);
    });

    test("extra keys inside the analysis are dropped, never copied", () => {
      const dirty = { ...analysis, note: "free text", trend: { ...analysis.trend, provider: "okx" } };
      const view = viewOf(dirty);
      expect(view.state.analysis).toEqual(analysis);
    });

    test("a forbidden key anywhere inside the analysis omits the whole block but keeps the read", () => {
      const dirty = { ...analysis, structure: { ...analysis.structure, signal: 0.7 } };
      const view = viewOf(dirty);
      expect(view.state).not.toBeNull();
      expect("analysis" in view.state).toBe(false);
    });

    test("a constraint violation drops only the offending section", () => {
      const dirty = { ...analysis, trend: { ...analysis.trend, adx15m: 120 } };
      const view = viewOf(dirty);
      const projected = view.state.analysis as Record<string, unknown>;
      expect("trend" in projected).toBe(false);
      expect(projected.structure).toEqual(analysis.structure);
      expect(projected.cost).toEqual(analysis.cost);
    });

    test("an analysis with no surviving section, a malformed one, or a missing one leaves no key", () => {
      for (const a of [{ ageSec: 3 }, { ageSec: 3, trend: "up" }, "x", 5, null]) {
        const view = viewOf(a);
        expect("analysis" in view.state, JSON.stringify(a)).toBe(false);
      }
      const plain = publicReadView(read()) as { state: Record<string, unknown> };
      expect("analysis" in plain.state).toBe(false);
    });
  });
});

describe("publicBoardView", () => {
  test("keeps valid reads per instrument and a bounded recent list, dropping invalid entries", () => {
    const board = {
      schemaVersion: 1,
      updatedAtMs: 1_791_741_700_500,
      reads: { "BTC-USDT": read(), "ETH-USDT": { ...read(), instId: "ETH-USDT", execution: "now" } },
      recent: [read(), { nonsense: true }],
    };
    const view = publicBoardView(board) as { reads: Record<string, unknown>; recent: unknown[] };
    expect(Object.keys(view.reads)).toEqual(["BTC-USDT"]);
    expect(view.recent).toHaveLength(1);
  });

  test("rejects a board that is not a board", () => {
    expect(publicBoardView(null)).toBeNull();
    expect(publicBoardView({ schemaVersion: 9, updatedAtMs: 1, reads: {}, recent: [] })).toBeNull();
  });

  test("the recent list is capped", () => {
    const many = Array.from({ length: 200 }, (_, i) => read({ readId: `jr-${i}` }));
    const view = publicBoardView({ schemaVersion: 1, updatedAtMs: 1, reads: {}, recent: many }) as { recent: unknown[] };
    expect(view.recent.length).toBeLessThanOrEqual(60);
  });
});

describe("JevReadStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "jev-read-"));
    dirs.push(d);
    return d;
  };

  test("publishes the latest read per instrument, newest first in recent, and journals every read", () => {
    const dir = tmp();
    const store = new JevReadStore({ statePath: join(dir, "latest.json"), journalPath: join(dir, "reads.jsonl"), now: () => 99 });
    store.record(read({ readId: "jr-a" }));
    store.record(read({ readId: "jr-b", instId: "ETH-USDT" }));
    store.record(read({ readId: "jr-c" }));
    const board = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8")) as { updatedAtMs: number; reads: Record<string, { readId: string }>; recent: Array<{ readId: string }> };
    expect(board.updatedAtMs).toBe(99);
    expect(board.reads["BTC-USDT"]!.readId).toBe("jr-c");
    expect(board.reads["ETH-USDT"]!.readId).toBe("jr-b");
    expect(board.recent.map((r) => r.readId)).toEqual(["jr-c", "jr-b", "jr-a"]);
    expect(readFileSync(join(dir, "reads.jsonl"), "utf8").trim().split("\n")).toHaveLength(3);
  });

  test("leaves no temporary files behind and bounds the recent list", () => {
    const dir = tmp();
    const store = new JevReadStore({ statePath: join(dir, "latest.json"), journalPath: join(dir, "reads.jsonl"), now: () => 1, recentLimit: 5 });
    for (let i = 0; i < 12; i += 1) store.record(read({ readId: `jr-${i}` }));
    const board = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8")) as { recent: unknown[] };
    expect(board.recent).toHaveLength(5);
    expect(readdirSync(dir).sort()).toEqual(["latest.json", "reads.jsonl"]);
  });
});

describe("createJevReadHandler", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "jev-read-http-"));
    dirs.push(d);
    return d;
  };

  test("knows its path", () => {
    expect(isJevReadPath("/jev-read")).toBe(true);
    expect(isJevReadPath("/jev-read/x")).toBe(false);
    expect(isJevReadPath("/system-one")).toBe(false);
  });

  const ORIGIN = "http://127.0.0.1:3001";
  const get = (init: RequestInit = {}) => new Request("http://x/jev-read", { ...init, headers: { origin: ORIGIN, ...(init.headers as Record<string, string> | undefined) } });

  test("serves the projected board on GET with CORS for the dashboard origin only", async () => {
    const dir = tmp();
    const path = join(dir, "latest.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, updatedAtMs: 5, reads: { "BTC-USDT": { ...read(), leaked: "x" } }, recent: [read()] }));
    const response = createJevReadHandler(path)(get());
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { reads: Record<string, Record<string, unknown>> };
    expect(body.reads["BTC-USDT"]!.leaked).toBeUndefined();
  });

  test("refuses a missing or foreign origin with 403, like /system-one", async () => {
    const dir = tmp();
    const path = join(dir, "latest.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, updatedAtMs: 5, reads: {}, recent: [] }));
    const handler = createJevReadHandler(path);
    expect(handler(new Request("http://x/jev-read")).status).toBe(403);
    expect(handler(new Request("http://x/jev-read", { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect(handler(new Request("http://x/jev-read", { headers: { origin: "https://evil.example" } })).headers.get("access-control-allow-origin")).toBeNull();
  });

  test("honours an explicit origin list and an optional bearer token", () => {
    const dir = tmp();
    const path = join(dir, "latest.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, updatedAtMs: 5, reads: {}, recent: [] }));
    const handler = createJevReadHandler(path, ["http://127.0.0.1:3010", " http://localhost:3010 "], "s3cret");
    const as = (origin: string, auth?: string) => new Request("http://x/jev-read", { headers: { origin, ...(auth ? { authorization: auth } : {}) } });
    expect(handler(as("http://127.0.0.1:3010")).status).toBe(401);
    expect(handler(as("http://127.0.0.1:3010", "Bearer nope")).status).toBe(401);
    expect(handler(as("http://127.0.0.1:3010", "Bearer s3cret")).status).toBe(200);
    expect(handler(as("http://localhost:3010", "Bearer s3cret")).status).toBe(200);
    expect(handler(as(ORIGIN, "Bearer s3cret")).status).toBe(403);
  });

  test("404 with a hint when the producer has not written yet, 405 for writes, 204 for preflight", () => {
    const handler = createJevReadHandler(join(tmp(), "none.json"));
    expect(handler(get()).status).toBe(404);
    expect(handler(get({ method: "POST" })).status).toBe(405);
    expect(handler(get({ method: "OPTIONS" })).status).toBe(204);
  });

  test("500 when the file is not a valid board, without echoing its content", async () => {
    const dir = tmp();
    const path = join(dir, "latest.json");
    writeFileSync(path, '{"hello":"world"}');
    const response = createJevReadHandler(path)(get());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hello");
  });
});

describe("createHealthHandler", () => {
  const ORIGIN = "http://127.0.0.1:3001";
  const body = () => ({ ok: true, reads: 3 });
  const req = (init: RequestInit & { origin?: string | null } = {}) => {
    const { origin = ORIGIN, ...rest } = init;
    return new Request("http://x/health", { ...rest, headers: { ...(origin ? { origin } : {}), ...(rest.headers as Record<string, string> | undefined) } });
  };

  test("serves the snapshot to an allowed origin only", async () => {
    const handler = createHealthHandler(undefined, null, body);
    const ok = handler(req());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await ok.json()).toEqual({ ok: true, reads: 3 });
    expect(handler(req({ origin: null })).status).toBe(403);
    expect(handler(req({ origin: "https://evil.example" })).status).toBe(403);
  });

  test("GET and OPTIONS only, and the token when one is set", () => {
    const handler = createHealthHandler(undefined, "s3cret", body);
    expect(handler(req({ method: "POST" })).status).toBe(405);
    expect(handler(req({ method: "OPTIONS" })).status).toBe(204);
    expect(handler(req()).status).toBe(401);
    expect(handler(req({ headers: { authorization: "Bearer s3cret" } })).status).toBe(200);
  });
});
