import { expect, test } from "bun:test";
import { quiescePausedAgent } from "./maintenance";
import { createAgentHandler } from "../agent/http";
import type { AgentService } from "../agent/service";

const initial = () => ({
  ok: true, status: {
    lock: true, mode: "limitado", paused: true, plans: [], inFlight: [],
    health: { ledger: { ok: true }, plans: { ok: true }, config: { ok: true } },
    state: { connected: true, connectedAtMs: 1000, disclosure: "2026-10-14.1", pausedUntilMs: 90000 },
    config: { managed: { kind: "agentica", solana: "A".repeat(44), evm: null } }, budget: { day: "2026-10-14", consults: 84 }
  }
});

test("maintenance disconnects through the app and waits for its single flight, never sends or settles an order", async () => {
  const first = initial(), off = { ...first, status: { ...first.status, mode: "desligado", state: { ...first.status.state, connected: false } } };
  const calls: string[] = []; let reads = 0;
  const f = Object.assign(async (url: unknown, init?: RequestInit) => {
    const path = new URL(String(url)).pathname; calls.push((init?.method ?? "GET") + " " + path);
    return Response.json(path === "/agent/status" ? reads++ === 0 ? first : off : path === "/agent/run" ? { ok: true, report: { mode: "desligado", orders: [], consulted: false } } : { ok: true });
  }, { preconnect: () => { } }) as typeof fetch;
  expect(await quiescePausedAgent(f)).toMatchObject({ quiescent: true, originalConsults: 84, disclosure: "2026-10-14.1" });
  expect(calls).toEqual(["GET /agent/status", "POST /agent/disconnect", "POST /agent/run", "GET /agent/status"]);
});

test("the real agent HTTP guard accepts the maintenance client only with the established origin and intent header", async () => {
  const p = initial(); let disconnected = false;
  const service = {
    status: () => disconnected ? { ...p.status, mode: "desligado", state: { ...p.status.state, connected: false } } : p.status,
    devStatus: () => ({ atMs: 0, connected: !disconnected, book: null }),
    disconnect: () => { disconnected = true; }, runNow: async () => ({ mode: "desligado", orders: [], consulted: false })
  } as unknown as AgentService;
  const handler = createAgentHandler({ service, origins: ["http://127.0.0.1:3000"] });
  const f = Object.assign(async (url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers); headers.set("host", "127.0.0.1:3000");
    return handler(new Request(String(url), { ...init, headers }), "127.0.0.1");
  }, { preconnect: () => { } }) as typeof fetch;
  expect((await quiescePausedAgent(f)).quiescent).toBe(true);
});

test("unknown state, an open plan, an order in flight or an active unpaused strategy is refused before any mutation", async () => {
  for (const change of [{ plans: [{}] }, { inFlight: [{}] }, { paused: false }, { lock: false }, { mode: "sombra" }]) {
    const p = initial(); let posts = 0;
    const f = Object.assign(async (_url: unknown, init?: RequestInit) => { if (init?.method === "POST") posts++; return Response.json({ ...p, status: { ...p.status, ...change } }); }, { preconnect: () => { } }) as typeof fetch;
    await expect(quiescePausedAgent(f)).rejects.toThrow(); expect(posts).toBe(0);
  }
});

test("a pending shared cycle must finish and a second disconnected pass proves that it cannot choose more trades", async () => {
  const p = initial(); let reads = 0, passes = 0;
  const f = Object.assign(async (url: unknown) => {
    const path = new URL(String(url)).pathname;
    return Response.json(path === "/agent/status" ? reads++ === 0 ? p : { ...p, status: { ...p.status, mode: "desligado", state: { ...p.status.state, connected: false } } } :
      path === "/agent/run" ? { ok: true, report: { mode: ++passes === 1 ? "limitado" : "desligado", orders: [], consulted: false } } : { ok: true });
  }, { preconnect: () => { } }) as typeof fetch;
  expect((await quiescePausedAgent(f)).quiescent).toBe(true); expect(passes).toBe(2);
});

test("a nonpersistent disconnect, changed wallet, changed budget or order that appeared during drain permits no process stop", async () => {
  const p = initial();
  for (const change of [{ state: p.status.state }, { config: { managed: { kind: "agentica", solana: "B".repeat(44), evm: null } } }, { budget: { ...p.status.budget, consults: 0 } }, { inFlight: [{}] }]) {
    let reads = 0;
    const f = Object.assign(async (url: unknown) => {
      const path = new URL(String(url)).pathname;
      return Response.json(path === "/agent/status" ? reads++ === 0 ? p : { ...p, status: { ...p.status, mode: "desligado", state: { ...p.status.state, connected: false }, ...change } } : path === "/agent/run" ? { ok: true, report: { mode: "desligado", orders: [], consulted: false } } : { ok: true });
    }, { preconnect: () => { } }) as typeof fetch;
    await expect(quiescePausedAgent(f)).rejects.toThrow();
  }
});
