// T7.3 / ASK-5, ASK-11: the HTTP face of "Pedir ao Inonu". Same guards as /settings (loopback peer and Host, exact Origin, a
// custom header that forces preflight), the status codes of flow-engine.md 5, and nothing echoed back from the request.
import { describe, expect, test } from "bun:test";
import { createAsker, type AskRequest, type AskResponse, type AskStatus, type Asker } from "./ask";
import { createInonuHandler } from "./http";
import type { ChainIconService } from "./chain-icons";
import type { IconService } from "./icons";

const ORIGIN = "http://127.0.0.1:47321";

function fakeAsker(status: AskStatus = "respondido", motivo?: string) {
  const calls: unknown[] = [];
  const cancelled: string[] = [];
  const asker: Asker = {
    ask: async (request: AskRequest) => {
      calls.push(request);
      return { ok: status === "respondido", id: "ask-1", status, custo: { chamadasOnchainos: 0, tokens: 10, usd: 0.001 }, briefHash: "h", advisory: true, execution: "never", ...(motivo ? { motivo } : {}) } as AskResponse;
    },
    cancel: (id) => {
      cancelled.push(id);
      return id === "ask-1";
    },
    running: () => null,
  };
  return { asker, calls, cancelled };
}

const handler = (asker: Asker, over: Partial<Parameters<typeof createInonuHandler>[0]> = {}) => createInonuHandler({ asker, origins: [ORIGIN], modelConfigured: () => true, today: () => ({ calls: 2, usd: 0.0054 }), ...over });

const post = (body: unknown, headers: Record<string, string> = {}, path = "/inonu/ask") =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "content-type": "application/json", "x-inonu-intent": "user", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

const REQUEST_TOKEN = "b58d5192-d258-49fd-a43b-c84b2424e0df";
const cancelOwned = (token = REQUEST_TOKEN, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/inonu/request/${token}`, { method: "DELETE", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "x-inonu-intent": "user", ...headers } });

test("HTTP forwards client request ownership and cancels that token instead of a global running id", async () => {
  const options: unknown[] = [];
  const tokens: string[] = [];
  const fake = fakeAsker();
  const asker: Asker = { ...fake.asker, ask: async (request, option) => { options.push(option); return fake.asker.ask(request); }, cancelRequest: (token) => { tokens.push(token); return true; } };
  const h = handler(asker);
  expect((await h(cancelOwned(), "127.0.0.1")).status).toBe(200);
  expect((await h(post({ modo: "diario" }, { "x-inonu-request-id": REQUEST_TOKEN }), "127.0.0.1")).status).toBe(200);
  expect(tokens).toEqual([REQUEST_TOKEN]);
  expect(options).toEqual([{ requestId: REQUEST_TOKEN }]);
  expect(fake.cancelled).toHaveLength(0);
});

test("owned request HTTP route retains origin, peer, intent and method guards without echoing invalid tokens", async () => {
  const tokens: string[] = [];
  const fake = fakeAsker();
  const h = handler({ ...fake.asker, cancelRequest: (token) => { tokens.push(token); return true; } });
  expect((await h(cancelOwned(REQUEST_TOKEN, { origin: "http://evil.example" }), "127.0.0.1")).status).toBe(403);
  expect((await h(cancelOwned(), "203.0.113.10")).status).toBe(403);
  expect((await h(cancelOwned(REQUEST_TOKEN, { "x-inonu-intent": "" }), "127.0.0.1")).status).toBe(403);
  expect((await h(post({}, {}, `/inonu/request/${REQUEST_TOKEN}`), "127.0.0.1")).status).toBe(405);
  const invalid = await h(cancelOwned("private-value"), "127.0.0.1");
  expect(invalid.status).toBe(400);
  expect(await invalid.text()).not.toContain("private-value");
  expect((await h(post({ modo: "diario" }, { "x-inonu-request-id": "private-value" }), "127.0.0.1")).status).toBe(400);
  expect(tokens).toHaveLength(0);
  expect(fake.calls).toHaveLength(0);
});

test("owned request CORS preflight permits the UUID header and capacity failures stay explicit", async () => {
  const h = handler({ ...fakeAsker().asker, cancelRequest: () => false });
  const preflight = await h(new Request(`${ORIGIN}/inonu/ask`, { method: "OPTIONS", headers: { host: "127.0.0.1:47321", origin: ORIGIN } }), "127.0.0.1");
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-headers")).toContain("x-inonu-request-id");
  const full = await h(cancelOwned(), "127.0.0.1");
  expect(full.status).toBe(429);
  expect(await full.json()).toMatchObject({ ok: false, code: "teto_de_pedidos", advisory: true, execution: "never" });
  expect((await handler(fakeAsker().asker)(cancelOwned(), "127.0.0.1")).status).toBe(404);
});

test("HTTP early owned cancellation reaches the real asker and prevents portfolio egress", async () => {
  let collected = 0;
  let evaluated = 0;
  let recorded = 0;
  const asker = createAsker({
    source: { build: async () => { collected++; throw new Error("unexpected collection"); } },
    model: { name: "synthetic_fixture", choose: async () => { evaluated++; throw new Error("unexpected model call"); } },
    ledger: { record: () => { recorded++; }, spentTodayUsd: () => null, callsToday: () => 0 },
    now: () => 1_800_000_000_000,
    newId: () => "synthetic-request",
    limits: { cooldownMs: 15_000, reuseTtlMs: 300_000, maxUsdPerRequest: 0.1, maxUsdPerDay: 1, maxCallsPerDay: 5, timeoutMs: 5_000, usdPerMtok: { input: null, output: null } },
  });
  const h = handler(asker);
  expect((await h(cancelOwned(), "127.0.0.1")).status).toBe(200);
  const response = await h(post({ modo: "carteira", carteira: { chainIndex: "143", observedAtMs: 1_800_000_000_000, coverage: "partial", profile: "conservative_no_leverage", assets: [{ contract: "native", symbol: "MON", balance: "0" }, { contract: "0x1111111111111111111111111111111111111111", symbol: "USDC", balance: "0" }] } }, { "x-inonu-request-id": REQUEST_TOKEN }), "127.0.0.1");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "cancelado", advisory: true, execution: "never" });
  expect(collected).toBe(0);
  expect(evaluated).toBe(0);
  expect(recorded).toBe(0);
});

describe("the usage ledger and the price per token (T7.4)", () => {
  const usage = () => ({
    today: { calls: 2, usd: null, tokens: 1500, onchainosCalls: 0, avgLatencyMs: 900 },
    month: { calls: 9, usd: null, tokens: 7000, onchainosCalls: 3, avgLatencyMs: 1100 },
    recent: [{ atMs: 1_800_000_000_000, modo: "ativo", modelo: "jev-latest", resultado: "respondido", tokens: 740, usd: null, latenciaMs: 800, chamadasOnchainos: 0 }],
    prices: { input: null, output: null },
  });
  const get = (path: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}${path}`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN, ...headers } });
  const put = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${ORIGIN}/inonu/prices`, { method: "PUT", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "content-type": "application/json", "x-inonu-intent": "user", ...headers }, body: JSON.stringify(body) });

  test("GET /inonu/ledger returns what the ledger measured, with the cost null where it is unknown, and the envelope fixed", async () => {
    const h = handler(fakeAsker().asker, { usage });
    const res = await h(get("/inonu/ledger"), "127.0.0.1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, today: { calls: 2, usd: null, tokens: 1500 }, month: { calls: 9 }, prices: { input: null, output: null }, advisory: true, execution: "never" });
    expect((body.recent as unknown[]).length).toBe(1);
    expect(Object.keys((body.recent as Record<string, unknown>[])[0]!).sort()).toEqual(["atMs", "chamadasOnchainos", "latenciaMs", "modelo", "modo", "resultado", "tokens", "usd"]);
  });

  test("without the dependency the route does not exist, and a write to the ledger is refused", async () => {
    const h = handler(fakeAsker().asker);
    expect((await h(get("/inonu/ledger"), "127.0.0.1")).status).toBe(404);
    const h2 = handler(fakeAsker().asker, { usage });
    expect((await h2(new Request(`${ORIGIN}/inonu/ledger`, { method: "POST", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "content-type": "application/json", "x-inonu-intent": "user" }, body: "{}" }), "127.0.0.1")).status).toBe(405);
  });

  test("PUT /inonu/prices sets both prices, only with the intent header, and answers what is now in force", async () => {
    const saved: unknown[] = [];
    const h = handler(fakeAsker().asker, { usage, setPrices: (p) => (saved.push(p), true) });
    const ok = await h(put({ input: 3, output: 15 }), "127.0.0.1");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, prices: { input: 3, output: 15 } });
    expect(saved).toEqual([{ input: 3, output: 15 }]);
    const noIntent = put({ input: 3, output: 15 });
    const headers = new Headers(noIntent.headers);
    headers.delete("x-inonu-intent");
    const refused = await h(new Request(noIntent, { headers }), "127.0.0.1");
    expect(refused.status).toBe(403);
    expect(saved).toHaveLength(1);
  });

  test("both null clears the prices; one side only, a text, zero, a negative, a huge number or an extra key is refused", async () => {
    const saved: unknown[] = [];
    const h = handler(fakeAsker().asker, { usage, setPrices: (p) => (saved.push(p), true) });
    expect((await h(put({ input: null, output: null }), "127.0.0.1")).status).toBe(200);
    expect(saved).toEqual([{ input: null, output: null }]);
    for (const bad of [{ input: 3, output: null }, { input: null, output: 3 }, { input: "3", output: 15 }, { input: 0, output: 15 }, { input: -1, output: 15 }, { input: 1e9, output: 15 }, { input: 3, output: 15, extra: 1 }, { input: 3 }, {}]) {
      const res = await h(put(bad), "127.0.0.1");
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, code: "precos_invalidos" });
    }
    expect(saved).toHaveLength(1);
  });

  test("a store that cannot be written is a named failure, not a silent success", async () => {
    const h = handler(fakeAsker().asker, { usage, setPrices: () => false });
    const res = await h(put({ input: 3, output: 15 }), "127.0.0.1");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, code: "nao_foi_possivel_salvar" });
  });

  test("GET /inonu/providers lists the addresses the app talks to, read only", async () => {
    const providers = [{ id: "okx-rest", label: "OKX mercado, REST publico", url: "https://www.okx.com", uso: "precos", custo: "gratuito", quemFala: "o nucleo" }];
    const h = handler(fakeAsker().asker, { providers: () => providers });
    const res = await h(get("/inonu/providers"), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, providers, advisory: true, execution: "never" });
    expect((await h(put({}), "127.0.0.1")).status).toBe(404); // not a write route
    expect((await handler(fakeAsker().asker)(get("/inonu/providers"), "127.0.0.1")).status).toBe(404);
  });

  test("the preflight allows PUT", async () => {
    const h = handler(fakeAsker().asker, { usage });
    const res = await h(new Request(`${ORIGIN}/inonu/prices`, { method: "OPTIONS", headers: { host: "127.0.0.1:47321", origin: ORIGIN } }), "127.0.0.1");
    expect(res.headers.get("access-control-allow-methods")).toContain("PUT");
  });
});

describe("guards", () => {
  test("a non-loopback peer or Host is refused before anything runs", async () => {
    const { asker, calls } = fakeAsker();
    const h = handler(asker);
    expect((await h(post({ modo: "descoberta" }), "203.0.113.5")).status).toBe(403);
    expect((await h(post({ modo: "descoberta" }, { host: "evil.example" }), "127.0.0.1")).status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("the Origin must be exactly the core's, and the intent header must say it is a user click", async () => {
    const { asker, calls } = fakeAsker();
    const h = handler(asker);
    expect((await h(post({ modo: "descoberta" }, { origin: "http://evil.example" }), "127.0.0.1")).status).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/inonu/ask`, { method: "POST", headers: { host: "127.0.0.1:47321", "content-type": "application/json", "x-inonu-intent": "user" }, body: "{}" });
    expect((await h(noOrigin, "127.0.0.1")).status).toBe(403);
    const noIntent = new Request(`${ORIGIN}/inonu/ask`, { method: "POST", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ modo: "descoberta" }) });
    expect((await h(noIntent, "127.0.0.1")).status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("the preflight answers only for the allowed origin", async () => {
    const h = handler(fakeAsker().asker);
    const ok = await h(new Request(`${ORIGIN}/inonu/ask`, { method: "OPTIONS", headers: { host: "127.0.0.1:47321", origin: ORIGIN } }), "127.0.0.1");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(ok.headers.get("access-control-allow-headers")).toContain("x-inonu-intent");
    const bad = await h(new Request(`${ORIGIN}/inonu/ask`, { method: "OPTIONS", headers: { host: "127.0.0.1:47321", origin: "http://evil.example" } }), "127.0.0.1");
    expect(bad.status).toBe(403);
  });
});

describe("POST /inonu/ask", () => {
  test("hands the parsed request to the asker and maps each status to its HTTP code", async () => {
    const expected: [AskStatus, number][] = [["respondido", 200], ["em_andamento", 202], ["teto_atingido", 429], ["cooldown", 429], ["sem_chave", 503], ["cancelado", 200], ["erro", 502]];
    for (const [status, code] of expected) {
      const { asker, calls } = fakeAsker(status);
      const res = await handler(asker)(post({ modo: "ativo", alvo: { instId: "BTC-USDT" } }), "127.0.0.1");
      expect(res.status).toBe(code);
      expect(calls).toEqual([{ modo: "ativo", alvo: { instId: "BTC-USDT" } }]);
      const body = (await res.json()) as AskResponse;
      expect(body).toMatchObject({ status, advisory: true, execution: "never" });
    }
  });

  test("an invalid request is a 400, not a 502", async () => {
    const { asker } = fakeAsker("erro", "pedido_invalido");
    expect((await handler(asker)(post({ modo: "tudo" }), "127.0.0.1")).status).toBe(400);
  });

  test("the body is bounded, JSON only, and an object", async () => {
    const h = handler(fakeAsker().asker);
    expect((await h(post({ modo: "ativo" }, { "content-type": "text/plain" }), "127.0.0.1")).status).toBe(415);
    expect((await h(post("x".repeat(3000)), "127.0.0.1")).status).toBe(413);
    expect((await h(post("{not json"), "127.0.0.1")).status).toBe(400);
    expect((await h(post("[1,2]"), "127.0.0.1")).status).toBe(400);
    expect((await h(post("null"), "127.0.0.1")).status).toBe(400);
  });

  test("the response never echoes what was sent", async () => {
    const { asker } = fakeAsker("erro", "pedido_invalido");
    const res = await handler(asker)(post({ modo: "filtro", textoLivre: "SENTINEL-echo-77aa" }), "127.0.0.1");
    expect(await res.text()).not.toContain("SENTINEL-echo-77aa");
  });
});

describe("GET /inonu/icon/<symbol>", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
  const icons: IconService = {
    get: async (symbol) => (symbol === "btc" ? { ok: true, type: "image/png", bytes: PNG } : symbol === "BAD!" ? { ok: false, reason: "bad_symbol" } : { ok: false, reason: "miss" }),
  };
  const withIcons = () => handler(fakeAsker().asker, { icons });
  const get = (symbol: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/inonu/icon/${symbol}`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN, ...headers } });

  test("serves the image with a day of browser cache, no sniffing, and nothing executable", async () => {
    const res = await withIcons()(get("btc"), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  test("a symbol the host does not have is a 404 the page answers with its letters, and a malformed one is a 400", async () => {
    expect((await withIcons()(get("zzz"), "127.0.0.1")).status).toBe(404);
    expect((await withIcons()(get("BAD!"), "127.0.0.1")).status).toBe(400);
  });

  test("without an icon service the route does not exist", async () => {
    expect((await handler(fakeAsker().asker)(get("btc"), "127.0.0.1")).status).toBe(404);
  });

  test("the same guards apply: a foreign origin or a non-loopback peer gets nothing", async () => {
    expect((await withIcons()(get("btc", { origin: "http://evil.example" }), "127.0.0.1")).status).toBe(403);
    expect((await withIcons()(get("btc"), "203.0.113.5")).status).toBe(403);
  });

  test("only GET", async () => {
    const post = new Request(`${ORIGIN}/inonu/icon/btc`, { method: "POST", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "x-inonu-intent": "user" } });
    expect((await withIcons()(post, "127.0.0.1")).status).toBe(405);
  });
});

describe("GET /inonu/chain-icon/<chain>", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 3, 4]);
  const asked: string[] = [];
  const chainIcons: ChainIconService = {
    get: async (chain) => {
      asked.push(chain);
      return chain === "196" ? { ok: true, type: "image/png", bytes: PNG } : /^\d{1,12}$/.test(chain) ? { ok: false, reason: "miss" } : { ok: false, reason: "bad_chain" };
    },
  };
  const withLogos = () => handler(fakeAsker().asker, { chainIcons });
  const get = (chain: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/inonu/chain-icon/${chain}`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN, ...headers } });

  test("serves the logo of a network from this origin, with a day of cache, no sniffing, and nothing executable", async () => {
    const res = await withLogos()(get("196"), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  test("a network with no logo is a 404 the page answers with its letters, a malformed one is a 400, and a broken percent escape is a 400 and not a crash", async () => {
    expect((await withLogos()(get("999"), "127.0.0.1")).status).toBe(404);
    expect((await withLogos()(get("abc"), "127.0.0.1")).status).toBe(400);
    expect((await withLogos()(get("%zz"), "127.0.0.1")).status).toBe(400);
  });

  test("without the service the route does not exist; the same guards apply; only GET", async () => {
    expect((await handler(fakeAsker().asker)(get("196"), "127.0.0.1")).status).toBe(404);
    expect((await withLogos()(get("196", { origin: "http://evil.example" }), "127.0.0.1")).status).toBe(403);
    expect((await withLogos()(get("196"), "203.0.113.5")).status).toBe(403);
    const post = new Request(`${ORIGIN}/inonu/chain-icon/196`, { method: "POST", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "x-inonu-intent": "user" } });
    expect((await withLogos()(post, "127.0.0.1")).status).toBe(405);
  });
});

describe("GET /inonu/brief (what the model would receive)", () => {
  const preview = async (instId: string) => (instId === "BTC-USDT" ? { ok: true as const, brief: { schemaVersion: 1, hash: "h".repeat(64) }, bytes: 812, candidates: ["spot:BTC-USDT", "manter"] } : { ok: false as const, code: "alvo_invalido" });
  const get = (query: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/inonu/brief${query}`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN, ...headers } });

  test("shows the Brief, its size and the ids, without any model call", async () => {
    const { asker, calls } = fakeAsker();
    const res = await handler(asker, { preview })(get("?instId=BTC-USDT"), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, brief: { schemaVersion: 1, hash: "h".repeat(64) }, bytes: 812, candidates: ["spot:BTC-USDT", "manter"], advisory: true, execution: "never" });
    expect(calls).toEqual([]); // the asker, and so the model, was not touched
  });

  test("a bad or refused target is a 400 with a constant code; a missing instId too", async () => {
    const h = handler(fakeAsker().asker, { preview });
    const refused = await h(get("?instId=DOGE-USDT"), "127.0.0.1");
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ ok: false, code: "alvo_invalido" });
    expect((await h(get(""), "127.0.0.1")).status).toBe(400);
    expect((await h(get("?instId=" + "X".repeat(200)), "127.0.0.1")).status).toBe(400);
  });

  test("without a preview function the route does not exist, and the guards apply", async () => {
    expect((await handler(fakeAsker().asker)(get("?instId=BTC-USDT"), "127.0.0.1")).status).toBe(404);
    expect((await handler(fakeAsker().asker, { preview })(get("?instId=BTC-USDT", { origin: "http://evil.example" }), "127.0.0.1")).status).toBe(403);
  });
});

describe("GET /inonu/engine (what the chart layer draws)", () => {
  const overlay = async (instId: string) => (instId === "BTC-USDT" ? { ok: true as const, instId, niveis: [], zonas: [] } : { ok: false as const, code: "instrumento_nao_suportado" });
  const get = (query: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/inonu/engine${query}`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN, ...headers } });

  test("returns the overlay as it is, never cached, with no model call", async () => {
    const { asker, calls } = fakeAsker();
    const res = await handler(asker, { overlay })(get("?instId=BTC-USDT"), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: true, instId: "BTC-USDT" });
    expect(calls).toEqual([]);
  });

  test("a refused target is a 400 with a constant code, and a malformed instId never reaches the source", async () => {
    let asked = 0;
    const h = handler(fakeAsker().asker, { overlay: async (id: string) => (asked += 1, overlay(id)) });
    const refused = await h(get("?instId=BTC-USDT-250627"), "127.0.0.1");
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ ok: false, code: "instrumento_nao_suportado" });
    expect((await h(get("?instId=bad%20id"), "127.0.0.1")).status).toBe(400);
    expect((await h(get(""), "127.0.0.1")).status).toBe(400);
    expect(asked).toBe(1);
  });

  test("without the dependency the route does not exist, and the guards apply", async () => {
    expect((await handler(fakeAsker().asker)(get("?instId=BTC-USDT"), "127.0.0.1")).status).toBe(404);
    expect((await handler(fakeAsker().asker, { overlay })(get("?instId=BTC-USDT", { origin: "http://evil.example" }), "127.0.0.1")).status).toBe(403);
  });
});

describe("GET /inonu/opportunities (the board of the opportunity engine)", () => {
  const get = (headers: Record<string, string> = {}, method = "GET") => new Request(`${ORIGIN}/inonu/opportunities`, { method, headers: { host: "127.0.0.1:47321", origin: ORIGIN, ...headers } });

  test("returns what the scan has now, fixed as advisory and never an order, never cached, with no model call", async () => {
    const { asker, calls } = fakeAsker();
    const opportunities = () => ({ state: "lendo" as const, done: 3, of: 90, startedAtMs: 1, board: null });
    const res = await handler(asker, { opportunities })(get(), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, advisory: true, execution: "never", state: "lendo", done: 3, of: 90, startedAtMs: 1, board: null });
    expect(calls).toEqual([]);
  });

  test("each look is handed to the scanner, which is the one that decides whether to start a scan", async () => {
    let looks = 0;
    const h = handler(fakeAsker().asker, { opportunities: () => (looks += 1, { state: "idle" as const }) });
    await h(get(), "127.0.0.1");
    await h(get(), "127.0.0.1");
    expect(looks).toBe(2);
  });

  test("it is a read only route, it does not exist without the dependency, and the guards apply", async () => {
    const opportunities = () => ({ state: "idle" as const });
    expect((await handler(fakeAsker().asker, { opportunities })(get({}, "POST"), "127.0.0.1")).status).toBe(403);
    expect((await handler(fakeAsker().asker, { opportunities })(new Request(`${ORIGIN}/inonu/opportunities`, { method: "PUT", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "x-inonu-intent": "user", "content-type": "application/json" }, body: "{}" }), "127.0.0.1")).status).toBe(405);
    expect((await handler(fakeAsker().asker)(get(), "127.0.0.1")).status).toBe(404);
    expect((await handler(fakeAsker().asker, { opportunities })(get({ origin: "http://evil.example" }), "127.0.0.1")).status).toBe(403);
  });
});

describe("DELETE /inonu/ask/<id> and GET /inonu/status", () => {
  test("cancel returns ok for a running id and 404 for an unknown one; the id is validated", async () => {
    const { asker, cancelled } = fakeAsker();
    const h = handler(asker);
    const del = (id: string) => new Request(`${ORIGIN}/inonu/ask/${id}`, { method: "DELETE", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "x-inonu-intent": "user" } });
    expect((await h(del("ask-1"), "127.0.0.1")).status).toBe(200);
    expect((await h(del("ask-9"), "127.0.0.1")).status).toBe(404);
    expect((await h(del("bad%20id"), "127.0.0.1")).status).toBe(400); // the URL parser already folds ../ away, so the id is checked as it arrives
    expect(cancelled).toEqual(["ask-1", "ask-9"]);
  });

  test("status says whether a model key exists and what today's calls cost, measured or null", async () => {
    const h = handler(fakeAsker().asker);
    const res = await h(new Request(`${ORIGIN}/inonu/status`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN } }), "127.0.0.1");
    expect(await res.json()).toEqual({ ok: true, modelConfigured: true, running: null, today: { calls: 2, usd: 0.0054 }, engine: { feed: null, messagesPerSecond: 0, instruments: [] }, advisory: true, execution: "never" });
    const noKey = await handler(fakeAsker().asker, { modelConfigured: () => false, today: () => ({ calls: 0, usd: null }) })(new Request(`${ORIGIN}/inonu/status`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN } }), "127.0.0.1");
    expect(await noKey.json()).toMatchObject({ modelConfigured: false, today: { calls: 0, usd: null } });
  });

  test("an unknown route or method is a constant 404 or 405", async () => {
    const h = handler(fakeAsker().asker);
    expect((await h(new Request(`${ORIGIN}/inonu/nada`, { headers: { host: "127.0.0.1:47321", origin: ORIGIN } }), "127.0.0.1")).status).toBe(404);
    expect((await h(new Request(`${ORIGIN}/inonu/ask`, { method: "GET", headers: { host: "127.0.0.1:47321", origin: ORIGIN } }), "127.0.0.1")).status).toBe(405);
    expect((await h(new Request(`${ORIGIN}/inonu/status`, { method: "POST", headers: { host: "127.0.0.1:47321", origin: ORIGIN, "x-inonu-intent": "user" } }), "127.0.0.1")).status).toBe(405);
  });
});
