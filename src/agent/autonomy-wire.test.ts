// The agent's own discipline and the single authorization, through the real service: the glue between the rules of autonomy.ts, the state, the cycle and the scheduler. The rules themselves are tested in autonomy.test.ts.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SettingsStore } from "../settings/store";
import { DISCLOSURE } from "./state";
import { createAgentService } from "./wire";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-autonomy-"));
  mkdirSync(join(dir, "agent"), { recursive: true });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const WALLET = "0x1111111111111111111111111111111111111111";
const store = { credentials: () => ({ okx: { apiKey: "k", secret: "s", passphrase: "p" }, typesafeAiApiKey: "model-key" }) } as unknown as SettingsStore;
const make = () =>
  createAgentService({
    dataDir: dir,
    store,
    balances: { balances: async () => [] },
    publicCandles: async () => null, publicDerivatives: { funding: async () => null, openInterestUsd: async () => null },
    model: { name: "fake", estimateTokens: () => 1, choose: async () => { throw new Error("not used"); } },
    gateway: { callInternal: async () => ({ ok: false }) } as never,
    source: { brief: async () => { throw new Error("unused"); } } as never,
    now: () => Date.now(),
    syncClock: async () => null,
    clockSkewMs: () => 100,
  });
const writeState = (over: Record<string, unknown>) =>
  writeFileSync(join(dir, "agent", "state.json"), `${JSON.stringify({ version: 3, connected: true, connectedAtMs: 1, disclosure: DISCLOSURE, pausedUntilMs: null, pauseReason: null, changedAtMs: 1, events: [], ...over })}\n`);
const configure = (svc: ReturnType<typeof make>) => {
  expect(svc.updateConfig({ managed: { kind: "propria", evm: WALLET, solana: null } })).toMatchObject({ ok: true });
};

describe("the one authorization, through the service", () => {
  test("connecting a wallet starts the agent, and the status says what it is doing without any switch", () => {
    const svc = make();
    expect(svc.status()).toMatchObject({ mode: "desligado", state: { connected: false } });
    expect(svc.connect({ disclosure: DISCLOSURE, managed: { kind: "propria", evm: WALLET, solana: null } })).toMatchObject({ ok: true });
    expect(svc.status()).toMatchObject({ mode: "sombra", paused: false, state: { connected: true, disclosure: DISCLOSURE } });
    expect(JSON.parse(readFileSync(join(dir, "agent", "state.json"), "utf8"))).toMatchObject({ version: 3, connected: true });
    svc.close();
  });

  test("an old state with modes and a permission is not a connection: the person connects again, under the notice", () => {
    writeFileSync(join(dir, "agent", "state.json"), `${JSON.stringify({ version: 2, mode: "limitado", stopped: false, stoppedAtMs: null, changedAtMs: 1, consent: { granted: true, atMs: 1 }, moves: [] })}\n`);
    const svc = make();
    expect(svc.status()).toMatchObject({ mode: "desligado", state: { connected: false } });
    svc.close();
  });
});

describe("the circuit breaker of the agent, seen from outside", () => {
  test("a pause that has run its time is lifted after the next cycle, and the event is recorded", async () => {
    writeState({ pausedUntilMs: Date.now() - 1000, pauseReason: "disjuntor_de_perda" });
    const svc = make();
    configure(svc);
    expect(svc.status().state.pausedUntilMs).not.toBeNull();
    await svc.runNow();
    const s = svc.status();
    expect(s.state.pausedUntilMs).toBeNull();
    expect(s.state.events.at(-1)).toMatchObject({ kind: "retomou" });
    svc.close();
  });

  test("a pause that is still on keeps new purchases out of the cycle, and the cycle says so", async () => {
    writeState({ pausedUntilMs: Date.now() + 3_600_000, pauseReason: "disjuntor_de_perda" });
    const svc = make();
    configure(svc);
    const report = await svc.runNow();
    expect(svc.status()).toMatchObject({ paused: true, state: { pauseReason: "disjuntor_de_perda" } });
    expect(report.notes).toContain("compras_pausadas");
    svc.close();
  });

  test("disconnecting does not lift the pause: leaving and coming back is not a way round the agent's own circuit breaker", async () => {
    writeState({ pausedUntilMs: Date.now() + 3_600_000, pauseReason: "evidencia_perdida" });
    const svc = make();
    svc.disconnect();
    expect(svc.status()).toMatchObject({ paused: true, mode: "desligado", state: { connected: false, pauseReason: "evidencia_perdida" } });
    await svc.close();
  });
});
