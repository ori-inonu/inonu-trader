import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "./config";
import { createAgentHandler } from "./http";
import type { AgentService, AgentStatus } from "./service";
import type { CycleReport } from "./cycle";
import { DISCLOSURE } from "./state";

const ORIGIN = "http://127.0.0.1:3000";
const report: CycleReport = { cycleId: "c1", atMs: 1, durationMs: 1, mode: "sombra", outcome: "mantido", reason: "sem_mudanca", consulted: false, modelo: null, usage: null, posture: null, stances: {}, profiles: {}, orders: [], dropped: [], considered: { holdings: 0, buys: 0, protected: 0 }, notes: [] };

function fakeService(): AgentService {
  return fake().service;
}

function fake() {
  const calls: unknown[][] = [];
  const service: AgentService = {
    status: () => ({ state: { version: 3, connected: true, connectedAtMs: 1, disclosure: "x", pausedUntilMs: null, pauseReason: null, changedAtMs: 1, events: [] }, stopFile: false, config: DEFAULT_CONFIG } as unknown as AgentStatus),
    connect: (input) => {
      calls.push(["connect", input]);
      if (input.disclosure !== DISCLOSURE) return { ok: false, reason: "aviso_desatualizado" };
      if (input.managed?.evm === "0xbad") return { ok: false, reason: "carteira_invalida" };
      return { ok: true, state: { version: 3, connected: true, connectedAtMs: 2, disclosure: DISCLOSURE, pausedUntilMs: null, pauseReason: null, changedAtMs: 2, events: [] } };
    },
    disconnect: () => void calls.push(["disconnect"]),
    wallet: async (action) => {
      calls.push(["wallet", action]);
      return action === "poll" ? { ok: false, reason: "cli_ausente" } : { ok: true, wallet: { cli: "instalado", login: "aguardando", loginUrl: "https://web3.okx.com/account/sociallogin?x=1", agentic: false, address: null, solanaAddress: null, policy: "desconhecida", fundsUsd: null, sessionLeftMs: null, next: "entrar" } };
    },
    updateConfig: (patch) => {
      calls.push(["updateConfig", patch]);
      return "intervalMin" in patch && patch.intervalMin === 1 ? { ok: false, reason: "configuracao_invalida" } : { ok: true, config: DEFAULT_CONFIG };
    },
    runNow: async () => {
      calls.push(["runNow"]);
      return report;
    },
    ledgerTail: (n) => {
      calls.push(["ledgerTail", n]);
      return [];
    },
    resolve: (orderKey, outcome) => {
      calls.push(["resolve", orderKey, outcome]);
      return orderKey === "c1:hold:x@agente" ? { ok: true } : { ok: false, reason: "nao_esta_em_voo" };
    },
    close: async () => {},
  };
  const handler = createAgentHandler({ service, origins: [ORIGIN] });
  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    handler(new Request(`http://127.0.0.1:3000${path}`, { method, headers: { host: "127.0.0.1:3000", origin: ORIGIN, "content-type": "application/json", "x-inonu-intent": "user", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), "127.0.0.1");
  return { calls, call, handler, service };
}

describe("the defences are the same as the rest of the local API", () => {
  test("a peer that is not loopback, a host that is not loopback, an origin not on the list: refused", async () => {
    const { handler } = fake();
    const req = (host: string, origin: string | null) => new Request("http://127.0.0.1:3000/agent/status", { headers: { host, ...(origin === null ? {} : { origin }) } });
    expect((await handler(req("127.0.0.1:3000", ORIGIN), "10.0.0.5")).status).toBe(403);
    expect((await handler(req("evil.com", ORIGIN), "127.0.0.1")).status).toBe(403);
    expect((await handler(req("127.0.0.1:3000", "http://evil.com"), "127.0.0.1")).status).toBe(403);
    expect((await handler(req("127.0.0.1:3000", null), "127.0.0.1")).status).toBe(403);
  });

  test("a write without the intent header is refused before it reaches the service", async () => {
    const { call, calls } = fake();
    for (const [method, path] of [["POST", "/agent/connect"], ["POST", "/agent/disconnect"], ["PUT", "/agent/config"], ["POST", "/agent/run"]] as const) {
      const res = await call(method, path, {}, { "x-inonu-intent": "" });
      expect(res.status).toBe(403);
    }
    expect(calls).toHaveLength(0);
  });

  test("preflight answers for the allowed origin only", async () => {
    const { handler } = fake();
    const ok = await handler(new Request("http://127.0.0.1:3000/agent/connect", { method: "OPTIONS", headers: { host: "127.0.0.1:3000", origin: ORIGIN } }), "127.0.0.1");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });
});

describe("status and ledger", () => {
  test("status is a GET and carries the whole picture", async () => {
    const { call } = fake();
    const res = await call("GET", "/agent/status");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, status: { state: { connected: true } } });
    expect((await call("POST", "/agent/status", {})).status).toBe(405);
  });

  test("the ledger tail is bounded", async () => {
    const { call, calls } = fake();
    expect((await call("GET", "/agent/ledger?n=5")).status).toBe(200);
    await call("GET", "/agent/ledger?n=999999");
    await call("GET", "/agent/ledger?n=abc");
    expect(calls.filter((c) => c[0] === "ledgerTail").map((c) => c[1])).toEqual([5, 200, 50]);
  });
});

describe("the one authorization: connecting a wallet", () => {
  test("a connection under the current notice starts the agent", async () => {
    const { call } = fake();
    const res = await call("POST", "/agent/connect", { disclosure: DISCLOSURE });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, state: { connected: true } });
  });

  test("the wallet can come in the same step, and the service decides whether it is one", async () => {
    const { call, calls } = fake();
    const ok = await call("POST", "/agent/connect", { disclosure: DISCLOSURE, managed: { kind: "propria", evm: "0x1111111111111111111111111111111111111111", solana: null } });
    expect(ok.status).toBe(200);
    expect(calls[0]).toEqual(["connect", { disclosure: DISCLOSURE, managed: { kind: "propria", evm: "0x1111111111111111111111111111111111111111", solana: null } }]);
    const bad = await call("POST", "/agent/connect", { disclosure: DISCLOSURE, managed: { kind: "propria", evm: "0xbad", solana: null } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, code: "carteira_invalida" });
  });

  test("a notice that is not the current one is refused with its constant reason", async () => {
    const { call } = fake();
    const res = await call("POST", "/agent/connect", { disclosure: "1999-01-01" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, code: "aviso_desatualizado" });
  });

  test("the body is checked and a write without the intent header never reaches the service", async () => {
    const { call, calls } = fake();
    expect((await call("POST", "/agent/connect", {})).status).toBe(400);
    expect((await call("POST", "/agent/connect", { disclosure: 5 })).status).toBe(400);
    expect((await call("POST", "/agent/connect", { disclosure: DISCLOSURE, extra: 1 })).status).toBe(400);
    expect((await call("POST", "/agent/connect", { disclosure: DISCLOSURE, managed: { kind: "propria", evm: 5, solana: null } })).status).toBe(400);
    expect((await call("POST", "/agent/connect", { disclosure: DISCLOSURE, managed: { kind: "outra", evm: null, solana: null } })).status).toBe(400);
    expect((await call("POST", "/agent/connect", { disclosure: DISCLOSURE }, { "x-inonu-intent": "" })).status).toBe(403);
    expect((await call("GET", "/agent/connect")).status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  test("the old switches are gone: there is no route for a mode, a permission or a stop", async () => {
    const { call, calls } = fake();
    for (const path of ["/agent/mode", "/agent/consent", "/agent/stop"]) expect((await call("POST", path, {})).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});

describe("connecting the wallet the agent trades from", () => {
  test("the three steps go to the service, and the answer carries the view or the constant reason", async () => {
    const { call, calls } = fake();
    const install = await call("POST", "/agent/wallet", { action: "install" });
    expect(install.status).toBe(200);
    expect(await install.json()).toMatchObject({ ok: true, wallet: { cli: "instalado", next: "entrar" } });
    expect((await call("POST", "/agent/wallet", { action: "login" })).status).toBe(200);
    const poll = await call("POST", "/agent/wallet", { action: "poll" });
    expect(poll.status).toBe(409);
    expect(await poll.json()).toMatchObject({ ok: false, code: "cli_ausente" });
    expect(calls).toEqual([["wallet", "install"], ["wallet", "login"], ["wallet", "poll"]]);
  });

  test("an action that is not one of the three, an extra field or a write without the intent never reaches the service", async () => {
    const { call, calls } = fake();
    expect((await call("POST", "/agent/wallet", { action: "logout" })).status).toBe(400);
    expect((await call("POST", "/agent/wallet", { action: "install", extra: 1 })).status).toBe(400);
    expect((await call("POST", "/agent/wallet", {})).status).toBe(400);
    expect((await call("POST", "/agent/wallet", { action: "install" }, { "x-inonu-intent": "" })).status).toBe(403);
    expect((await call("GET", "/agent/wallet")).status).toBe(405);
    expect(calls).toHaveLength(0);
  });
});

describe("stop, run and config", () => {
  test("disconnecting always answers ok", async () => {
    const { call, calls } = fake();
    const res = await call("POST", "/agent/disconnect", {});
    expect(res.status).toBe(200);
    expect(calls).toEqual([["disconnect"]]);
  });

  test("run now returns the report of the cycle", async () => {
    const { call } = fake();
    const res = await call("POST", "/agent/run", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, report: { cycleId: "c1", outcome: "mantido" } });
  });

  test("config is a PUT of the fields to change, refused whole when invalid", async () => {
    const { call, calls } = fake();
    expect((await call("PUT", "/agent/config", { intervalMin: 15 })).status).toBe(200);
    const bad = await call("PUT", "/agent/config", { intervalMin: 1 });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, code: "configuracao_invalida" });
    expect(calls.filter((c) => c[0] === "updateConfig")).toHaveLength(2);
  });

  test("a body that is not an object, or is too large, never reaches the service", async () => {
    const { call, handler, calls } = fake();
    expect((await call("PUT", "/agent/config", [1, 2])).status).toBe(400);
    const big = await handler(new Request("http://127.0.0.1:3000/agent/config", { method: "PUT", headers: { host: "127.0.0.1:3000", origin: ORIGIN, "content-type": "application/json", "x-inonu-intent": "user" }, body: JSON.stringify({ chains: "x".repeat(10_000) }) }), "127.0.0.1");
    expect(big.status).toBe(413);
    const wrongType = await handler(new Request("http://127.0.0.1:3000/agent/config", { method: "PUT", headers: { host: "127.0.0.1:3000", origin: ORIGIN, "content-type": "text/plain", "x-inonu-intent": "user" }, body: "x" }), "127.0.0.1");
    expect(wrongType.status).toBe(415);
    expect(calls).toHaveLength(0);
  });

  test("the person's word on an order in flight goes to the service, validated", async () => {
    const { call, calls } = fake();
    const ok = await call("POST", "/agent/resolve", { orderKey: "c1:hold:x@agente", outcome: "executada" });
    expect(ok.status).toBe(200);
    const unknown = await call("POST", "/agent/resolve", { orderKey: "c9:nothing", outcome: "falhou" });
    expect(unknown.status).toBe(409);
    expect(await unknown.json()).toMatchObject({ ok: false, code: "nao_esta_em_voo" });
    expect(calls.filter((c) => c[0] === "resolve")).toHaveLength(2);
    // the body is checked: a key that looks like anything else, an outcome that is not one of the two, an extra field
    for (const body of [{ orderKey: "a b", outcome: "falhou" }, { orderKey: "c1:x", outcome: "sim" }, { orderKey: "c1:x", outcome: "falhou", extra: 1 }, { orderKey: 5, outcome: "falhou" }]) {
      expect((await call("POST", "/agent/resolve", body)).status).toBe(400);
    }
    expect((await call("GET", "/agent/resolve")).status).toBe(405);
    expect(calls.filter((c) => c[0] === "resolve")).toHaveLength(2);
  });

  test("an unknown route is a 404, and the wrong method a 405", async () => {
    const { call } = fake();
    expect((await call("GET", "/agent/nothing")).status).toBe(404);
    expect((await call("GET", "/agent/connect")).status).toBe(405);
    expect((await call("DELETE", "/agent/disconnect")).status).toBe(405);
  });
});

describe("the analysis of the decisions", () => {
  test("it is a GET of the same local API: refused for a write, a named failure when the service has none, the study as the service gives it when it has one", async () => {
    const { call } = fake();
    const none = await call("GET", "/agent/analysis");
    expect(none.status).toBe(404);
    expect(await none.json()).toEqual({ ok: false, code: "sem_analise" });
    expect((await call("POST", "/agent/analysis", {})).status).toBe(405);

    const study = { atMs: 5, funnel: { items: 1 } };
    const handler = createAgentHandler({ service: { ...fakeService(), analysis: () => study as never }, origins: [ORIGIN] });
    const res = await handler(new Request("http://127.0.0.1:3000/agent/analysis", { headers: { host: "127.0.0.1:3000", origin: ORIGIN } }), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, analysis: study });
  });
});
