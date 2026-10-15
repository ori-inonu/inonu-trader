import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInonuHandler } from "../inonu/http";
import type { Asker } from "../inonu/ask";
import { COST_TABLE } from "../lab/outcomes";
import { createOutcomes, feeAndSlippageRoundTripBps } from "./wire";
import type { Scheduler } from "./recorder";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "inonu-wire-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const never = (): never => {
  throw new Error("must not be called");
};
const asker: Asker = { ask: async () => never(), cancel: () => false, running: () => null };
const NOW = 1_800_000_000_000;

function build(over: Partial<Parameters<typeof createOutcomes>[0]> = {}) {
  const scheduled: string[] = [];
  const schedule: Scheduler = { after: (ms) => (scheduled.push(`after:${ms}`), () => scheduled.push("stop-after")), every: (ms) => (scheduled.push(`every:${ms}`), () => scheduled.push("stop-every")) };
  const outcomes = createOutcomes({
    dataDir: tmp(), fetch: (() => never()) as never, now: () => NOW,
    source: { analysis: async () => never() }, derivatives: { read: async () => null }, instruments: () => ["ETH-USDT"], live: true, schedule, env: {}, ...over,
  });
  return { outcomes, scheduled };
}

describe("the wiring", () => {
  test("the costs come from the lab table: two legs of a fee and of slippage", () => {
    expect(feeAndSlippageRoundTripBps("spot")).toBe(2 * COST_TABLE.feeTakerBps.spot + 2 * COST_TABLE.slippageBpsPerSide);
    expect(feeAndSlippageRoundTripBps("spot")).toBe(22);
    expect(feeAndSlippageRoundTripBps("perp")).toBe(12);
  });

  test("not live: nothing is scheduled, the asker is returned untouched and the recorder is off", () => {
    const { outcomes, scheduled } = build({ live: false });
    expect(scheduled).toEqual([]);
    expect(outcomes.wrapAsker(asker)).toBe(asker);
    expect(outcomes.recorder.status().enabled).toBe(false);
  });

  test("live: the clock is aligned to the five minute boundary, the asker is wrapped, and close stops the clock", () => {
    const { outcomes, scheduled } = build();
    expect(scheduled).toEqual([`after:${300_000 - (NOW % 300_000) + 2_000}`]);
    expect(outcomes.wrapAsker(asker)).not.toBe(asker);
    expect(outcomes.recorder.status().enabled).toBe(true);
    outcomes.close();
    expect(scheduled).toContain("stop-after");
  });

  test("INONU_RECORDER=off switches it off at the moment it is read, with no restart", () => {
    const env: Record<string, string | undefined> = {};
    const { outcomes } = build({ env });
    expect(outcomes.recorder.status().enabled).toBe(true);
    env.INONU_RECORDER = "off";
    expect(outcomes.recorder.status().enabled).toBe(false);
  });

  test("the Placar of an empty store is not measured, and it is reused for a few seconds", () => {
    let now = NOW;
    const { outcomes } = build({ now: () => now });
    const first = outcomes.placar();
    expect(first.placar.estado).toBe("nao_medido");
    expect(first.gravador).toMatchObject({ snapshots: 0, labels: 0, decisions: 0, writeErrors: 0, enabled: true });
    expect(outcomes.placar()).toBe(first);
    now += 11_000;
    expect(outcomes.placar()).not.toBe(first);
  });
});

describe("GET /inonu/placar", () => {
  const origin = "http://127.0.0.1:47321";
  const call = async (handler: ReturnType<typeof createInonuHandler>, path: string, method = "GET", headers: Record<string, string> = {}) =>
    handler(new Request(`${origin}${path}`, { method, headers: { host: "127.0.0.1:47321", origin, ...headers } }), "127.0.0.1");

  test("serves the Placar and the recorder's health, with the same guards as the other routes", async () => {
    const { outcomes } = build();
    const handler = createInonuHandler({ asker, origins: [origin], modelConfigured: () => false, today: () => ({ calls: 0, usd: 0 }), placar: outcomes.placar });
    const ok = await call(handler, "/inonu/placar");
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok: boolean; placar: { estado: string }; gravador: { enabled: boolean }; advisory: boolean; execution: string };
    expect([body.ok, body.placar.estado, body.gravador.enabled, body.advisory, body.execution]).toEqual([true, "nao_medido", true, true, "never"]);
    expect((await call(handler, "/inonu/placar", "POST", { "x-inonu-intent": "user" })).status).toBe(405);
    expect((await handler(new Request(`${origin}/inonu/placar`, { headers: { host: "127.0.0.1:47321", origin: "http://evil.example" } }), "127.0.0.1")).status).toBe(403);
    expect((await handler(new Request(`${origin}/inonu/placar`, { headers: { host: "127.0.0.1:47321", origin } }), "10.0.0.5")).status).toBe(403);
  });

  test("without the dependency the route does not exist", async () => {
    const handler = createInonuHandler({ asker, origins: [origin], modelConfigured: () => false, today: () => ({ calls: 0, usd: 0 }) });
    expect((await call(handler, "/inonu/placar")).status).toBe(404);
  });
});

describe("/inonu/perfil", () => {
  const origin = "http://127.0.0.1:47321";
  const handlerFor = (outcomes: ReturnType<typeof createOutcomes>) =>
    createInonuHandler({ asker, origins: [origin], modelConfigured: () => false, today: () => ({ calls: 0, usd: 0 }), perfil: { read: () => outcomes.perfil.read(), write: (v) => outcomes.perfil.write(v as never) } });
  const call = (h: ReturnType<typeof createInonuHandler>, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    h(new Request(`${origin}/inonu/perfil`, { method, headers: { host: "127.0.0.1:47321", origin, "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), "127.0.0.1");

  test("nothing chosen yet, then a profile is saved with the intent header and read back, and cleared with two nulls", async () => {
    const h = handlerFor(build({ live: false }).outcomes);
    expect(await (await call(h, "GET")).json()).toMatchObject({ ok: true, perfil: { capitalUsd: null, riskPct: null } });
    const saved = await call(h, "PUT", { capitalUsd: 2500, riskPct: 0.5 }, { "x-inonu-intent": "user" });
    expect(saved.status).toBe(200);
    expect(await (await call(h, "GET")).json()).toMatchObject({ perfil: { capitalUsd: 2500, riskPct: 0.5 } });
    await call(h, "PUT", { capitalUsd: null, riskPct: null }, { "x-inonu-intent": "user" });
    expect(await (await call(h, "GET")).json()).toMatchObject({ perfil: { capitalUsd: null, riskPct: null } });
  });

  test("a write needs the intent header, and a nonsense profile is a 400 that changes nothing", async () => {
    const outcomes = build({ live: false }).outcomes;
    const h = handlerFor(outcomes);
    expect((await call(h, "PUT", { capitalUsd: 100, riskPct: 1 })).status).toBe(403);
    for (const bad of [{ capitalUsd: 100, riskPct: 50 }, { capitalUsd: -1, riskPct: 1 }, { capitalUsd: 100 }, { capitalUsd: 100, riskPct: 1, extra: 1 }]) {
      const r = await call(h, "PUT", bad, { "x-inonu-intent": "user" });
      expect([r.status, ((await r.json()) as { code: string }).code], JSON.stringify(bad)).toEqual([400, "perfil_invalido"]);
    }
    expect(outcomes.perfil.read()).toEqual({ capitalUsd: null, riskPct: null });
    expect((await call(h, "DELETE", undefined, { "x-inonu-intent": "user" })).status).toBe(405);
  });
});
