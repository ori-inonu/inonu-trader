// T1.4 / SRC-3 / SRC-4: the REAL handlers behind the desktop core. This is the test the old backends were missing: the
// /onchain and /settings routes exist, answer on the same origin, keep their guards, and never return a secret.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, type Core } from "./core";
import { createDesktopHandlers } from "./handlers";
import { createSettingsStore } from "../settings/store";

let root = "";
let core: Core | null = null;
const SENTINEL = "SENTINEL-8f3a91c2d7e45b60";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inonu-handlers-"));
  mkdirSync(join(root, "web"), { recursive: true });
  writeFileSync(join(root, "web", "index.html"), "<html><body>desk</body></html>");
  core = startCore({ port: 0, webDir: join(root, "web"), version: "t", idleMs: 0, handlers: (origin) => createDesktopHandlers({ dataDir: join(root, "data"), origin, store: createSettingsStore(join(root, "data"), { runtimeKey: () => null }) }) });
});

afterEach(() => {
  core?.stop();
  core = null;
  rmSync(root, { recursive: true, force: true });
});

const sameOrigin = { "sec-fetch-site": "same-origin" };
const settings = { ...sameOrigin, "x-inonu-settings": "1" };
const get = (path: string, headers: Record<string, string> = sameOrigin) => fetch(`${core!.origin}${path}`, { headers });

describe("/onchain through the core", () => {
  test("status and budget exist and answer the browser's same-origin GET", async () => {
    for (const path of ["/onchain/status", "/onchain/budget"]) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(typeof (await res.json())).toBe("object");
    }
  });

  test("status reports an absent credential on a clean data dir, with a numeric clock field (not an error)", async () => {
    const body = (await (await get("/onchain/status")).json()) as { credential: string; lastCallMs: number | null };
    expect(body.credential).toBe("absent");
    expect(body.lastCallMs).toBeNull();
  });

  test("an unknown route is the handler's constant not_found, which proves the prefix is wired", async () => {
    const res = await get("/onchain/nao-existe");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
  });

  test("the guard still denies a request that is not same-origin", async () => {
    expect((await get("/onchain/status", {})).status).toBe(403);
    expect((await get("/onchain/status", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await get("/onchain/status", { "sec-fetch-site": "same-origin", origin: "http://evil.example" })).status).toBe(403);
  });
});

describe("/settings through the core", () => {
  test("GET /settings answers with the header the guard needs and lists four unconfigured secrets", async () => {
    const res = await get("/settings", settings);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { secrets: Record<string, { configured: boolean }>; okx: { state: string } };
    expect(Object.keys(body.secrets).sort()).toEqual(["okxWeb3ApiKey", "okxWeb3ApiPassphrase", "okxWeb3ApiSecret", "typesafeAiApiKey"]);
    expect(Object.values(body.secrets).every((s) => !s.configured)).toBe(true);
    expect(body.okx.state).toBe("absent");
  });

  test("a write keeps the guard (origin and header) and no response ever carries the secret value", async () => {
    const put = (headers: Record<string, string>) =>
      fetch(`${core!.origin}/settings/secrets`, { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ id: "okxWeb3ApiKey", value: SENTINEL }) });
    expect((await put({})).status).toBe(403); // no origin, no header
    expect((await put({ origin: core!.origin })).status).toBe(403); // no x-inonu-settings
    const stored = await put({ origin: core!.origin, "x-inonu-settings": "1" });
    expect(stored.status).toBe(200);
    const texts = [await stored.text()];
    for (const path of ["/settings", "/onchain/status", "/onchain/budget"]) texts.push(await (await get(path, settings)).text());
    for (const text of texts) expect(text).not.toContain(SENTINEL);
    expect(texts[1]).toContain('"configured":true'); // the status does show that it is configured
  });
});

describe("read-only state routes", () => {
  test("/jev-read and /system-one say honestly that nothing was produced yet", async () => {
    const jev = await get("/jev-read");
    expect(jev.status).toBe(404);
    expect(((await jev.json()) as { error: string }).error).toContain("not found");
    const one = await get("/system-one");
    expect(one.status).toBe(404);
    expect(((await one.json()) as { error: string }).error).toContain("not found");
  });
});

describe("a store supplied by the caller (the vault in the installed app)", () => {
  test("is the one the settings and the gateway use, so the app starts configured with no .env", async () => {
    core?.stop();
    const fake = {
      status: () => ({ secrets: { typesafeAiApiKey: { configured: false, last4: null, updatedAtMs: null }, okxWeb3ApiKey: { configured: true, last4: "wxyz", updatedAtMs: 1 }, okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiPassphrase: { configured: true, last4: null, updatedAtMs: 1 } }, okx: { state: "complete" as const } }),
      set: () => {}, clear: () => {},
      credentials: () => ({ okx: { apiKey: "k", secret: "s", passphrase: "p" }, typesafeAiApiKey: null }),
      prefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
      setPrefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
    };
    core = startCore({ port: 0, webDir: join(root, "web"), version: "t", idleMs: 0, handlers: (origin) => createDesktopHandlers({ dataDir: join(root, "data"), origin, store: fake }) });
    const status = (await (await get("/onchain/status")).json()) as { credential: string };
    expect(status.credential).toBe("complete");
    const body = (await (await get("/settings", settings)).json()) as { okx: { state: string }; secrets: Record<string, { last4: string | null }> };
    expect(body.okx.state).toBe("complete");
    expect(body.secrets.okxWeb3ApiKey!.last4).toBe("wxyz");
  });
});

describe("/inonu through the core (Pedir ao Inonu)", () => {
  const T0 = 1_800_000_000_000;
  const body = (code: string, data: unknown) => new Response(JSON.stringify({ code, msg: "", data }), { status: 200 });
  /** The three free public reads, answered locally: this suite never touches the network or the real model. */
  const okxFetch = (async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/api/v5/public/instruments") return body("0", [{ instId: "BTC-USDT", instType: "SPOT", tickSz: "0.1", lotSz: "0.00000001", ctVal: "", ctMult: "", state: "live" }]);
    if (path === "/api/v5/market/candles") return body("0", Array.from({ length: 30 }, (_, i) => [String(T0 - (i + 1) * 60_000), "100", "101", "99", "100", "1", "1", "1", "1"]));
    if (path === "/api/v5/market/trades") return body("0", [{ instId: "BTC-USDT", tradeId: "1", px: "100.0", sz: "0.5", side: "buy", ts: String(T0) }, { instId: "BTC-USDT", tradeId: "2", px: "100.1", sz: "0.25", side: "sell", ts: String(T0 + 500) }]);
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  const storeWith = (modelKey: string | null) => ({
    status: () => ({ secrets: { typesafeAiApiKey: { configured: modelKey !== null, last4: null, updatedAtMs: null }, okxWeb3ApiKey: { configured: false, last4: null, updatedAtMs: null }, okxWeb3ApiSecret: { configured: false, last4: null, updatedAtMs: null }, okxWeb3ApiPassphrase: { configured: false, last4: null, updatedAtMs: null } }, okx: { state: "absent" as const } }),
    set: () => {}, clear: () => {},
    credentials: () => ({ okx: null, typesafeAiApiKey: modelKey }),
    prefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
    setPrefs: () => ({ version: 1 as const, onchain: { capBasic: 10, capPremium: 10, background: false, defaultChainIndex: null } }),
  });
  const restart = (modelKey: string | null, extra: Record<string, unknown> = {}) => {
    core?.stop();
    core = startCore({ port: 0, webDir: join(root, "web"), version: "t", idleMs: 0, handlers: (origin) => createDesktopHandlers({ dataDir: join(root, "data"), origin, fetch: okxFetch, now: () => T0 + 5_000, store: storeWith(modelKey), ...extra }) });
  };
  const ask = (payload: unknown) => fetch(`${core!.origin}/inonu/ask`, { method: "POST", headers: { "content-type": "application/json", origin: core!.origin, "x-inonu-intent": "user" }, body: JSON.stringify(payload) });

  test("status says there is no model key on a clean install, and asking answers sem_chave without reading anything", async () => {
    restart(null);
    const status = await fetch(`${core!.origin}/inonu/status`, { headers: sameOrigin });
    expect(await status.json()).toMatchObject({ ok: true, modelConfigured: false, running: null, today: { calls: 0, usd: 0 }, advisory: true, execution: "never" });
    const res = await ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "sem_chave", advisory: true, execution: "never" });
  });

  test("with a key, one click reads the public market, asks the (fake) model once, writes the ledger, and leaks no secret", async () => {
    const KEY = "SENTINEL-model-key-91ab";
    const seen: { keys: string[]; briefs: number } = { keys: [], briefs: 0 };
    restart(KEY, {
      inonuModel: (apiKey: string) => ({
        name: "fake-jev",
        choose: async () => {
          seen.keys.push(apiKey);
          seen.briefs += 1;
          return { raw: { action: "hold", candidateId: null }, usage: { inputTokens: 600, outputTokens: 10 } };
        },
      }),
    });
    const res = await ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ ok: true, status: "respondido", decisao: { action: "hold", candidateId: null, modelo: "fake-jev" }, custo: { chamadasOnchainos: 0, tokens: 610, usd: null } });
    expect(text).not.toContain(KEY);
    expect(seen).toEqual({ keys: [KEY], briefs: 1 });
    const ledger = readFileSync(join(root, "data", "inonu", "ledger.jsonl"), "utf8");
    expect(ledger).not.toContain(KEY);
    expect(JSON.parse(ledger.trim().split(/\r?\n/)[0]!)).toMatchObject({ modo: "ativo", chamadasModelo: 1, tokensEntrada: 600, tokensSaida: 10, usd: null, resultado: "respondido" });
    const status = (await (await fetch(`${core!.origin}/inonu/status`, { headers: sameOrigin })).json()) as { today: { calls: number; usd: number | null } };
    expect(status.today).toEqual({ calls: 1, usd: null }); // the dollar cost is not measured until a price per token is known
  });

  test("a ranking click reads each chosen instrument from the exchange, offers them to the (fake) model as ONE Brief, spends no OnchainOS call, and the ledger names the mode (RAS-6)", async () => {
    const KEY = "SENTINEL-model-key-91ab";
    let providerCalls = 0;
    // the public reads answer for whichever instrument is asked
    const exchange = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.hostname === "web3.okx.com") {
        providerCalls += 1;
        return body("0", []);
      }
      const instId = u.searchParams.get("instId") ?? "";
      if (u.pathname === "/api/v5/public/instruments") return body("0", [{ instId, instType: "SPOT", tickSz: "0.1", lotSz: "0.00000001", ctVal: "", ctMult: "", state: "live" }]);
      if (u.pathname === "/api/v5/market/trades") return body("0", [{ instId, tradeId: "1", px: "100.0", sz: "0.5", side: "buy", ts: String(T0) }, { instId, tradeId: "2", px: "100.1", sz: "0.25", side: "sell", ts: String(T0 + 500) }]);
      return okxFetch(url, init);
    }) as unknown as typeof fetch;
    const seen: { ids: string[][]; alvo: unknown[]; bytes: number[] } = { ids: [], alvo: [], bytes: [] };
    restart(KEY, {
      fetch: exchange,
      inonuModel: () => ({
        name: "fake-jev",
        choose: async ({ ids, brief }: { ids: readonly string[]; brief: { alvo: unknown } }) => {
          seen.ids.push([...ids]);
          seen.alvo.push(brief.alvo);
          seen.bytes.push(JSON.stringify(brief).length);
          return { raw: { action: "buy", candidateId: "spot:ETH-USDT" }, usage: { inputTokens: 640, outputTokens: 12 } };
        },
      }),
    });
    const res = await ask({ modo: "ranking", alvos: [{ instId: "ETH-USDT" }, { instId: "BTC-USDT" }, { instId: "SOL-USDT" }] });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ ok: true, status: "respondido", decisao: { action: "buy", candidateId: "spot:ETH-USDT", modelo: "fake-jev" }, custo: { chamadasOnchainos: 0, tokens: 652 } });
    expect(seen.ids).toHaveLength(1);
    expect([...seen.ids[0]!].sort()).toEqual(["manter", "spot:BTC-USDT", "spot:ETH-USDT", "spot:SOL-USDT"]);
    expect(seen.alvo).toEqual([{ escopo: "ranking", instIds: ["BTC-USDT", "ETH-USDT", "SOL-USDT"] }]);
    expect(seen.bytes[0]!).toBeLessThanOrEqual(2048);
    expect(providerCalls).toBe(0);
    expect(text).not.toContain(KEY);
    const ledger = readFileSync(join(root, "data", "inonu", "ledger.jsonl"), "utf8");
    expect(JSON.parse(ledger.trim().split(/\r?\n/)[0]!)).toMatchObject({ modo: "ranking", chamadasModelo: 1, chamadasOnchainos: 0, resultado: "respondido" });
    expect(ledger).not.toContain(KEY);
  });

  test("a ranking click with fewer than two rows is refused before anything is read, and with one unreadable row of two the model is never asked (RAS-6)", async () => {
    let modelCalls = 0;
    restart("SENTINEL-model-key-91ab", { inonuModel: () => ({ name: "fake", choose: async () => { modelCalls += 1; throw new Error("no"); } }) });
    expect(await (await ask({ modo: "ranking", alvos: [{ instId: "BTC-USDT" }] })).json()).toMatchObject({ status: "erro", motivo: "pedido_invalido" });
    // the exchange only knows BTC-USDT here: asking for it with a made up instrument leaves one readable row
    const answer = await (await ask({ modo: "ranking", alvos: [{ instId: "BTC-USDT" }, { instId: "NOPE-USDT" }] })).json();
    expect(answer).toMatchObject({ status: "erro", motivo: "sem_candidatos", custo: { chamadasOnchainos: 0 } });
    expect(modelCalls).toBe(0);
  });

  test("a click on an on-chain token goes to the gateway, not to the exchange: one plan of at most 15 calls, the (fake) model asked once, the ledger names the mode and the calls, no secret leaks", async () => {
    const KEY = "SENTINEL-model-key-91ab";
    const OKX_KEY = "SENTINEL-okx-access-key-77cd";
    const TOKEN = "So11111111111111111111111111111111111111112";
    const providerPaths: string[] = [];
    const providerHeaders: string[] = [];
    // the OnchainOS provider answers every read with an empty list: the Brief must say what is unknown, not invent it
    const providerFetch = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.hostname === "web3.okx.com") {
        providerPaths.push(u.pathname);
        providerHeaders.push(JSON.stringify(init?.headers ?? {}));
        return body("0", []);
      }
      return okxFetch(url, init);
    }) as unknown as typeof fetch;
    const store = {
      ...storeWith(KEY),
      status: () => ({ secrets: { typesafeAiApiKey: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiKey: { configured: true, last4: "77cd", updatedAtMs: 1 }, okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiPassphrase: { configured: true, last4: null, updatedAtMs: 1 } }, okx: { state: "complete" as const } }),
      credentials: () => ({ okx: { apiKey: OKX_KEY, secret: "s-secret", passphrase: "p-pass" }, typesafeAiApiKey: KEY }),
    };
    const seen: { ids: string[][]; targets: unknown[] } = { ids: [], targets: [] };
    restart(KEY, {
      fetch: providerFetch,
      store,
      inonuModel: () => ({
        name: "fake-jev",
        choose: async ({ ids, brief, mode }: { ids: readonly string[]; brief: { alvo: unknown }; mode: string }) => {
          seen.ids.push([...ids]);
          seen.targets.push({ mode, alvo: brief.alvo });
          return { raw: { action: "hold", candidateId: null }, usage: { inputTokens: 700, outputTokens: 12 } };
        },
      }),
    });
    const res = await ask({ modo: "token", alvo: { chainIndex: "501", address: TOKEN } });
    const text = await res.text();
    expect(res.status).toBe(200);
    const answer = JSON.parse(text) as { status: string; custo: { chamadasOnchainos: number; tokens: number }; briefHash: string };
    expect(answer.status).toBe("respondido");
    expect(answer.custo.chamadasOnchainos).toBeGreaterThan(0);
    expect(answer.custo.chamadasOnchainos).toBeLessThanOrEqual(15);
    expect(answer.custo.chamadasOnchainos).toBe(providerPaths.length); // counted by what really left, not by what was planned
    expect(providerPaths.every((p) => p.startsWith("/api/v6/dex/"))).toBe(true);
    expect(seen.ids).toHaveLength(1);
    expect(seen.ids[0]).toEqual([`token:501:${TOKEN}`, "manter"]);
    expect(seen.targets[0]).toEqual({ mode: "token", alvo: { chainIndex: "501", address: TOKEN } });
    // nothing was read from the exchange for a token, and nothing of the secrets reached the answer or the ledger
    const ledger = readFileSync(join(root, "data", "inonu", "ledger.jsonl"), "utf8");
    expect(JSON.parse(ledger.trim().split(/\r?\n/)[0]!)).toMatchObject({ modo: "token", chamadasModelo: 1, chamadasOnchainos: providerPaths.length, resultado: "respondido" });
    for (const secret of [KEY, OKX_KEY, "s-secret", "p-pass"]) {
      expect(text).not.toContain(secret);
      expect(ledger).not.toContain(secret);
    }
  });

  test("a discovery click reads one network through the gateway, offers the best tokens to the (fake) model, and ends in a decision among ids the code produced", async () => {
    const KEY = "SENTINEL-model-key-91ab";
    const OKX_KEY = "SENTINEL-okx-access-key-77cd";
    const providerPaths: string[] = [];
    const provider = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (u.hostname !== "web3.okx.com") return okxFetch(url, init);
      providerPaths.push(u.pathname);
      if (u.pathname === "/api/v6/dex/market/token/hot-token") {
        return body("0", [{ chainIndex: "501", tokenSymbol: "AAA", tokenContractAddress: "AAA1111111111111111111111111111111111111111", price: "1", marketCap: "2000000", volume: "400000", change: "12", liquidity: "900000", holders: "900" }]);
      }
      if (u.pathname === "/api/v6/dex/market/signal/list") {
        return body("0", [{ timestamp: String(T0 - 60_000), chainIndex: "501", walletType: "1", triggerWalletCount: "4", amountUsd: "12000", price: "1", soldRatioPercent: "10", triggerWalletAddress: "w1,w2,w3,w4", token: { tokenAddress: "AAA1111111111111111111111111111111111111111", symbol: "AAA", marketCapUsd: "2000000", holders: "900", top10HolderPercent: "30" } }]);
      }
      if (u.pathname === "/api/v6/dex/market/token/advanced-info") return body("0", [{ riskControlLevel: "2", tokenTags: [], top10HoldPercent: "20", lpBurnedPercent: "90" }]);
      return body("0", []);
    }) as unknown as typeof fetch;
    const store = {
      ...storeWith(KEY),
      status: () => ({ secrets: { typesafeAiApiKey: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiKey: { configured: true, last4: "77cd", updatedAtMs: 1 }, okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiPassphrase: { configured: true, last4: null, updatedAtMs: 1 } }, okx: { state: "complete" as const } }),
      credentials: () => ({ okx: { apiKey: OKX_KEY, secret: "s-secret", passphrase: "p-pass" }, typesafeAiApiKey: KEY }),
    };
    const seen: { ids: string[][]; alvo: unknown[] } = { ids: [], alvo: [] };
    restart(KEY, {
      fetch: provider,
      store,
      inonuModel: () => ({
        name: "fake-jev",
        choose: async ({ ids, brief }: { ids: readonly string[]; brief: { alvo: unknown } }) => {
          seen.ids.push([...ids]);
          seen.alvo.push(brief.alvo);
          return { raw: { action: "buy", candidateId: "token:501:AAA1111111111111111111111111111111111111111" }, usage: { inputTokens: 650, outputTokens: 14 } };
        },
      }),
    });
    const res = await ask({ modo: "descoberta", alvo: { chainIndex: "501" } });
    const text = await res.text();
    expect(res.status).toBe(200);
    const answer = JSON.parse(text) as { status: string; custo: { chamadasOnchainos: number }; decisao?: { candidateId: string | null; action: string } };
    expect(answer.status).toBe("respondido");
    expect(answer.decisao).toMatchObject({ action: "buy", candidateId: "token:501:AAA1111111111111111111111111111111111111111" });
    expect(seen.ids).toEqual([["token:501:AAA1111111111111111111111111111111111111111", "manter"]]);
    expect(seen.alvo).toEqual([{ chainIndex: "501", escopo: "descoberta" }]);
    expect(providerPaths.slice(0, 2)).toEqual(["/api/v6/dex/market/token/hot-token", "/api/v6/dex/market/signal/list"]);
    expect(providerPaths.length).toBeLessThanOrEqual(15);
    expect(answer.custo.chamadasOnchainos).toBe(providerPaths.length);
    const ledger = readFileSync(join(root, "data", "inonu", "ledger.jsonl"), "utf8");
    expect(JSON.parse(ledger.trim().split(/\r?\n/)[0]!)).toMatchObject({ modo: "descoberta", chamadasModelo: 1, chamadasOnchainos: providerPaths.length, resultado: "respondido" });
    for (const secret of [KEY, OKX_KEY, "s-secret", "p-pass", "w1,w2"]) {
      expect(text).not.toContain(secret);
      expect(ledger).not.toContain(secret);
    }
  });

  test("a discovery on a network with no signals is refused before the model, and the model is never asked", async () => {
    let modelCalls = 0;
    let providerCalls = 0;
    const provider = (async (url: string, init?: RequestInit) => {
      if (new URL(url).hostname !== "web3.okx.com") return okxFetch(url, init);
      providerCalls += 1;
      return body("0", []);
    }) as unknown as typeof fetch;
    const store = {
      ...storeWith("SENTINEL-model-key-91ab"),
      status: () => ({ secrets: { typesafeAiApiKey: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiKey: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 1 }, okxWeb3ApiPassphrase: { configured: true, last4: null, updatedAtMs: 1 } }, okx: { state: "complete" as const } }),
      credentials: () => ({ okx: { apiKey: "k", secret: "s", passphrase: "p" }, typesafeAiApiKey: "SENTINEL-model-key-91ab" }),
    };
    restart("SENTINEL-model-key-91ab", { fetch: provider, store, inonuModel: () => ({ name: "fake", choose: async () => { modelCalls += 1; throw new Error("no"); } }) });
    const answer = (await (await ask({ modo: "descoberta", alvo: { chainIndex: "501" } })).json()) as { status: string; motivo?: string; custo: { chamadasOnchainos: number | null } };
    expect(answer).toMatchObject({ status: "erro", motivo: "sem_sinais" });
    expect(modelCalls).toBe(0);
    // the two reads that went out before the refusal are counted, in the answer and in the ledger (the usage panel sums the ledger)
    expect(providerCalls).toBe(2);
    expect(answer.custo.chamadasOnchainos).toBe(2);
    const ledger = readFileSync(join(root, "data", "inonu", "ledger.jsonl"), "utf8");
    const first = ledger.trim().split(/\r?\n/)[0]!;
    expect(JSON.parse(first)).toMatchObject({ modo: "descoberta", chamadasModelo: 0, chamadasOnchainos: 2, resultado: "erro:sem_sinais" });
  });

  test("a click on a token with no OnchainOS credential is refused before the model, with a constant code and no model call", async () => {
    let modelCalls = 0;
    restart("SENTINEL-model-key-91ab", { inonuModel: () => ({ name: "fake", choose: async () => { modelCalls += 1; throw new Error("no"); } }) });
    const res = await ask({ modo: "token", alvo: { chainIndex: "501", address: "So11111111111111111111111111111111111111112" } });
    const answer = (await res.json()) as { status: string; motivo?: string; custo: { chamadasOnchainos: number | null } };
    expect(answer.status).toBe("erro");
    expect(answer.motivo).toBe("sem_credencial_onchainos");
    expect(modelCalls).toBe(0);
  });

  test("a ranking asked with ONE target (the shape of the single-instrument mode) is refused as an invalid request, never silently routed to the exchange", async () => {
    let modelCalls = 0;
    restart("SENTINEL-model-key-91ab", { inonuModel: () => ({ name: "fake", choose: async () => { modelCalls += 1; throw new Error("no"); } }) });
    const res = await ask({ modo: "ranking", alvo: { instId: "BTC-USDT" } });
    expect((await res.json()) as { motivo?: string }).toMatchObject({ status: "erro", motivo: "pedido_invalido" });
    expect(modelCalls).toBe(0);
  });

  test("the price per token, the usage panel and the measured cost: a price given while the app runs is used by the next click and survives a restart", async () => {
    const KEY = "SENTINEL-model-key-91ab";
    // an exchange that answers for whichever spot instrument is asked, so two different clicks can both be answered
    const echoFetch = (async (url: string) => {
      const u = new URL(url);
      const instId = u.searchParams.get("instId") ?? "BTC-USDT";
      if (u.pathname === "/api/v5/public/instruments") return body("0", [{ instId, instType: "SPOT", tickSz: "0.1", lotSz: "0.00000001", ctVal: "", ctMult: "", state: "live" }]);
      if (u.pathname === "/api/v5/market/candles") return body("0", Array.from({ length: 30 }, (_, i) => [String(T0 - (i + 1) * 60_000), "100", "101", "99", "100", "1", "1", "1", "1"]));
      if (u.pathname === "/api/v5/market/trades") return body("0", [{ instId, tradeId: "1", px: "100.0", sz: "0.5", side: "buy", ts: String(T0) }, { instId, tradeId: "2", px: "100.1", sz: "0.25", side: "sell", ts: String(T0 + 500) }]);
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const model = { fetch: echoFetch, inonuModel: () => ({ name: "fake-jev", choose: async () => ({ raw: { action: "hold", candidateId: null }, usage: { inputTokens: 1000, outputTokens: 100 } }) }) };
    restart(KEY, model);
    const putPrices = (payload: unknown) => fetch(`${core!.origin}/inonu/prices`, { method: "PUT", headers: { "content-type": "application/json", origin: core!.origin, "x-inonu-intent": "user" }, body: JSON.stringify(payload) });
    const ledger = async () => (await (await fetch(`${core!.origin}/inonu/ledger`, { headers: sameOrigin })).json()) as { today: { calls: number; usd: number | null; tokens: number | null }; recent: { usd: number | null; tokens: number | null; modo: string }[]; prices: { input: number | null; output: number | null } };

    expect((await ledger()).prices).toEqual({ input: null, output: null });
    const first = await (await ask({ modo: "ativo", alvo: { instId: "BTC-USDT" } })).json();
    expect(first).toMatchObject({ status: "respondido", custo: { tokens: 1100, usd: null } }); // no price: the dollars are not guessed
    expect((await ledger()).today).toMatchObject({ calls: 1, usd: null, tokens: 1100 });

    expect((await putPrices({ input: 3, output: 15 })).status).toBe(200);
    expect((await putPrices({ input: 3 })).status).toBe(400);
    const priced = (await (await ask({ modo: "ativo", alvo: { instId: "ETH-USDT" } })).json()) as { custo: { usd: number | null } };
    expect(priced.custo.usd).toBeCloseTo((1000 * 3 + 100 * 15) / 1_000_000, 12);
    const after = await ledger();
    expect(after.prices).toEqual({ input: 3, output: 15 });
    expect(after.recent[0]).toMatchObject({ modo: "ativo", tokens: 1100 });
    expect(JSON.stringify(after)).not.toContain(KEY);

    restart(KEY, model); // a new process of the same data folder
    expect((await ledger()).prices).toEqual({ input: 3, output: 15 });
    expect((await putPrices({ input: null, output: null })).status).toBe(200);
    expect((await ledger()).prices).toEqual({ input: null, output: null });
  });

  test("the usage routes keep the guards of the others: a read needs the allowed origin, a write needs the intent header", async () => {
    restart(null);
    expect((await fetch(`${core!.origin}/inonu/ledger`)).status).toBe(403);
    const noIntent = await fetch(`${core!.origin}/inonu/prices`, { method: "PUT", headers: { "content-type": "application/json", origin: core!.origin }, body: JSON.stringify({ input: 3, output: 15 }) });
    expect(noIntent.status).toBe(403);
  });

  test("the Rastreador filter: a sentence goes to the (fake) screener alone, comes back as a filter, and no market is read", async () => {
    const KEY = "SENTINEL-model-key-91ab";
    const seen: { states: unknown[]; keys: string[] } = { states: [], keys: [] };
    restart(KEY, {
      screenerModel: (apiKey: string) => ({
        name: "fake-jev",
        choose: async ({ state }: { state: unknown }) => {
          seen.keys.push(apiKey);
          seen.states.push(state);
          return { raw: { mercado: "perp", volume: "100M", variacao: "alta", posicao: "qualquer", ordem: "alta", fixados: "nao" }, usage: { inputTokens: 900, outputTokens: 30 } };
        },
      }),
    });
    const res = await ask({ modo: "filtro", textoLivre: "perpetuos grandes que subiram hoje" });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ ok: true, status: "respondido", filtro: { mercado: "perp", volUsdMin: 100_000_000, varMin: 3, ordenar: { chave: "var24hPct", direcao: "desc" } }, custo: { tokens: 930 } });
    expect(JSON.parse(text).decisao).toBeUndefined();
    expect(text).not.toContain(KEY);
    expect(seen).toEqual({ keys: [KEY], states: [{ tipo: "filtro_do_rastreador", pergunta: "perpetuos grandes que subiram hoje" }] });
    const ledger = readFileSync(join(root, "data", "inonu", "ledger.jsonl"), "utf8");
    expect(JSON.parse(ledger.trim().split(/\r?\n/)[0]!)).toMatchObject({ modo: "filtro", chamadasModelo: 1, tokensEntrada: 900, resultado: "respondido" });
    expect(ledger).not.toContain("perpetuos grandes"); // the sentence is the person's: the ledger keeps counts, not text
  });

  test("the filter mode without a key is refused like every other click", async () => {
    restart(null, { screenerModel: () => ({ name: "fake", choose: async () => { throw new Error("must not be called"); } }) });
    const res = await ask({ modo: "filtro", textoLivre: "qualquer coisa" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "sem_chave" });
  });

  test("the Brief preview shows what the model would receive for an instrument, from public data only, with no key and no model call", async () => {
    let modelCalls = 0;
    restart(null, { inonuModel: () => ({ name: "fake", choose: async () => { modelCalls += 1; throw new Error("no"); } }) });
    const res = await fetch(`${core!.origin}/inonu/brief?instId=BTC-USDT`, { headers: sameOrigin });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; bytes: number; candidates: string[]; brief: { alvo: { instId: string }; origens: Record<string, string>; nulos: Record<string, string>; familiasHabilitadas: string[] } };
    expect(body.ok).toBe(true);
    expect(body.bytes).toBeLessThanOrEqual(2048);
    expect(body.candidates).toEqual(["spot:BTC-USDT", "manter"]);
    expect(body.brief.alvo).toEqual({ instId: "BTC-USDT" });
    expect(body.brief.origens.fluxo).toBe("okx_public_v5");
    expect(body.brief.nulos["fluxo.imb"]).toBe("aquecimento"); // nothing learned yet: said, not invented
    expect(body.brief.familiasHabilitadas).toEqual(["E2", "E3"]);
    expect(modelCalls).toBe(0);
    expect((await fetch(`${core!.origin}/inonu/brief?instId=BTC-USD-250627-60000-C`, { headers: sameOrigin })).status).toBe(400);
  });

  test("the Brief of a perpetual carries the regime from the public funding rate and open interest, and a spot Brief says there is none", async () => {
    const swapFetch = (async (url: string) => {
      const path = new URL(url).pathname;
      if (path === "/api/v5/public/instruments") return body("0", [{ instId: "BTC-USDT-SWAP", instType: "SWAP", tickSz: "0.1", lotSz: "1", ctVal: "0.01", ctMult: "1", state: "live" }]);
      if (path === "/api/v5/market/candles") return body("0", Array.from({ length: 30 }, (_, i) => [String(T0 - (i + 1) * 60_000), "100", "101", "99", "100", "1", "1", "1", "1"]));
      if (path === "/api/v5/market/trades") return body("0", [{ instId: "BTC-USDT-SWAP", tradeId: "1", px: "100.0", sz: "5", side: "buy", ts: String(T0) }]);
      if (path === "/api/v5/public/funding-rate") return body("0", [{ instId: "BTC-USDT-SWAP", fundingRate: "0.0002", nextFundingRate: "", fundingTime: String(T0) }]);
      if (path === "/api/v5/public/open-interest") return body("0", [{ instId: "BTC-USDT-SWAP", oi: "1", oiCcy: "1", oiUsd: "5000000", ts: String(T0) }]);
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    core?.stop();
    core = startCore({ port: 0, webDir: join(root, "web"), version: "t", idleMs: 0, handlers: (origin) => createDesktopHandlers({ dataDir: join(root, "data"), origin, fetch: swapFetch, now: () => T0 + 5_000, store: storeWith(null) }) });
    const res = await fetch(`${core!.origin}/inonu/brief?instId=BTC-USDT-SWAP`, { headers: sameOrigin });
    const out = (await res.json()) as { ok: boolean; brief: { regime: { funding: number | null; oiVar: number | null; btcBeta: number | null } | null; nulos: Record<string, string> } };
    expect(out.ok).toBe(true);
    expect(out.brief.regime).toEqual({ funding: 2, oiVar: null, btcBeta: null });
    expect(out.brief.nulos["regime.oiVar"]).toBe("aquecimento");
    expect(out.brief.nulos["regime.btcBeta"]).toBe("nao coletado");
    restart(null);
    const spot = (await (await fetch(`${core!.origin}/inonu/brief?instId=BTC-USDT`, { headers: sameOrigin })).json()) as { brief: { regime: unknown; nulos: Record<string, string> } };
    expect(spot.brief.regime).toBeNull();
    expect(spot.brief.nulos.regime).toBe("so existe para perpetuos");
  });

  test("the chart overlay is built from public data only, with no key and no model call, in price", async () => {
    let modelCalls = 0;
    restart(null, { inonuModel: () => ({ name: "fake", choose: async () => { modelCalls += 1; throw new Error("no"); } }) });
    const res = await fetch(`${core!.origin}/inonu/engine?instId=BTC-USDT`, { headers: sameOrigin });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; fonte: string; price: number; niveis: { baixo: number; alto: number; c: number; v: number }[]; aquecimento: { pronto: boolean }; perfil: { poc: { baixo: number } | null }; zonas: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.fonte).toBe("okx_public_v5");
    expect(body.price).toBeCloseTo(100.1, 5);
    expect(body.niveis.length).toBeGreaterThan(0);
    expect(body.niveis.every((n) => n.alto > n.baixo)).toBe(true);
    expect(body.aquecimento.pronto).toBe(false); // nothing learned yet: said, not invented
    expect(body.perfil.poc).not.toBeNull();
    expect(body.zonas).toEqual([]);
    expect(modelCalls).toBe(0);
    expect((await fetch(`${core!.origin}/inonu/engine?instId=BTC-USDT-250627`, { headers: sameOrigin })).status).toBe(400);
  });

  test("the guards of the other handlers apply here too: no intent header, no call", async () => {
    restart("SENTINEL-model-key-91ab", { inonuModel: () => ({ name: "fake", choose: async () => { throw new Error("must not be called"); } }) });
    const res = await fetch(`${core!.origin}/inonu/ask`, { method: "POST", headers: { "content-type": "application/json", origin: core!.origin }, body: JSON.stringify({ modo: "ativo", alvo: { instId: "BTC-USDT" } }) });
    expect(res.status).toBe(403);
  });
});

describe("/inonu/icon through the core", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7, 7]);
  const iconFetch = (async (url: string) => (url.endsWith("/btc.png") ? new Response(PNG, { status: 200, headers: { "content-type": "image/png" } }) : new Response("nope", { status: 404 }))) as unknown as typeof fetch;

  test("the desk loads a currency icon from its own origin; the local core fetched it once and cached it under the data folder", async () => {
    core?.stop();
    core = startCore({ port: 0, webDir: join(root, "web"), version: "t", idleMs: 0, handlers: (origin) => createDesktopHandlers({ dataDir: join(root, "data"), origin, fetch: iconFetch, store: createSettingsStore(join(root, "data"), { runtimeKey: () => null }) }) });
    const ok = await fetch(`${core.origin}/inonu/icon/BTC`, { headers: sameOrigin });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(PNG);
    expect(readdirSync(join(root, "data", "icons"))).toEqual(["btc.png"]);
    expect((await fetch(`${core.origin}/inonu/icon/doge`, { headers: sameOrigin })).status).toBe(404);
    expect((await fetch(`${core.origin}/inonu/icon/btc`)).status).toBe(403); // not a same-origin request
  });
});

describe("the live engine through the core", () => {
  const T0 = 1_800_000_000_000;
  class FakeSocket {
    static all: FakeSocket[] = [];
    sent: string[] = [];
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly url: string) {
      FakeSocket.all.push(this);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
  }
  const okx = (async (url: string) => {
    const u = new URL(url);
    const instId = u.searchParams.get("instId") ?? "";
    const swap = instId.endsWith("-SWAP");
    const body = (data: unknown) => new Response(JSON.stringify({ code: "0", msg: "", data }), { status: 200 });
    if (u.pathname === "/api/v5/public/instruments") return body([{ instId, instType: swap ? "SWAP" : "SPOT", tickSz: "0.1", lotSz: swap ? "0.01" : "0.00000001", ctVal: swap ? "0.01" : "", ctMult: swap ? "1" : "", state: "live" }]);
    if (u.pathname === "/api/v5/market/candles") return body(Array.from({ length: 30 }, (_, i) => [String(T0 - (i + 1) * 60_000), "100", "101", "99", "100", "1", "1", "1", "1"]));
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  const start = (extra: Record<string, unknown> = {}) => {
    FakeSocket.all = [];
    core?.stop();
    const handlers = { current: null as null | ReturnType<typeof createDesktopHandlers> };
    core = startCore({
      port: 0, webDir: join(root, "web"), version: "t", idleMs: 0,
      handlers: (origin) => (handlers.current = createDesktopHandlers({ dataDir: join(root, "data"), origin, fetch: okx, now: () => T0 + 70_000, webSocket: (url: string) => new FakeSocket(url) as never, store: createSettingsStore(join(root, "data"), { runtimeKey: () => null }), ...extra })),
    });
    return handlers;
  };
  const status = async () => (await (await fetch(`${core!.origin}/inonu/status`, { headers: sameOrigin })).json()) as { engine: { feed: { state: string } | null; messagesPerSecond: number; instruments: { instId: string; closedCandles: number; needed: number; lastTradeAgeMs: number | null }[] } };
  const settle = () => Bun.sleep(30);

  test("by default no socket is opened: the engine only runs when the launcher turns the live feed on", async () => {
    start();
    await settle();
    expect(FakeSocket.all).toEqual([]);
    expect((await status()).engine).toEqual({ feed: null, messagesPerSecond: 0, instruments: [] });
  });

  test("with the feed on, the default instruments are loaded and followed on ONE connection that subscribes to the trades channel", async () => {
    const handlers = start({ liveFeed: true });
    await settle();
    expect(FakeSocket.all).toHaveLength(1);
    FakeSocket.all[0]!.onopen?.();
    const subscribe = JSON.parse(FakeSocket.all[0]!.sent[0]!) as { op: string; args: { channel: string; instId: string }[] };
    expect(subscribe.op).toBe("subscribe");
    expect(subscribe.args.every((a) => a.channel === "trades")).toBe(true);
    expect(subscribe.args.map((a) => a.instId).sort()).toEqual(["BTC-USDT", "BTC-USDT-SWAP", "ETH-USDT", "ETH-USDT-SWAP"]);
    handlers.current!.close();
    expect(FakeSocket.all[0]!.closed).toBe(true);
  });

  test("trades that arrive on the socket reach the collector, and the status shows the progress of the warm-up and the rate", async () => {
    const handlers = start({ liveFeed: true });
    await settle();
    const socket = FakeSocket.all[0]!;
    socket.onopen?.();
    const row = (ts: number, side: string) => ({ instId: "BTC-USDT", tradeId: String(ts), px: "82950.1", sz: "0.01", side, ts: String(ts) });
    socket.onmessage?.({ data: JSON.stringify({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [row(T0 + 1_000, "buy"), row(T0 + 1_500, "sell")] }) });
    socket.onmessage?.({ data: JSON.stringify({ arg: { channel: "trades", instId: "BTC-USDT" }, data: [row(T0 + 61_000, "buy")] }) }); // the next minute: the first one closes
    const { engine } = await status();
    const btc = engine.instruments.find((i) => i.instId === "BTC-USDT")!;
    expect(btc).toMatchObject({ closedCandles: 1, needed: 50 });
    expect(btc.lastTradeAgeMs).toBe(9_000); // now is T0 + 70 s and the last print was at T0 + 61 s
    expect(engine.feed?.state).toBe("live");
    expect(engine.messagesPerSecond).toBeGreaterThan(0);
    handlers.current!.close();
  });

  test("the pulse of the market is a SECOND connection of its own, only when asked for, and it follows BTC and SOL", async () => {
    const handlers = start({ liveFeed: true, pulse: true });
    await settle();
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all.every(socket => socket.url === "wss://ws.okx.com/ws/v5/public")).toBe(true);
    for (const socket of FakeSocket.all) socket.onopen?.();
    const subscribed = FakeSocket.all.map((s) => (JSON.parse(s.sent[0]!) as { args: { instId: string }[] }).args.map((a) => a.instId).sort());
    expect(subscribed).toContainEqual(["BTC-USDT", "SOL-USDT"]);
    handlers.current!.close();
    expect(FakeSocket.all.every((s) => s.closed)).toBe(true);
  });

  test("explicit pulse false overrides an ambient flag and opens only the existing trade feed", async () => {
    const previous = process.env.INONU_AGENT_PULSE;
    process.env.INONU_AGENT_PULSE = "1";
    let handlers: ReturnType<typeof start> | null = null;
    try {
      handlers = start({ liveFeed: true, pulse: false });
      await settle();
      expect(FakeSocket.all).toHaveLength(1);
      expect(FakeSocket.all[0]!.url).toBe("wss://ws.okx.com/ws/v5/public");
    } finally {
      handlers?.current?.close();
      if (previous === undefined) delete process.env.INONU_AGENT_PULSE;
      else process.env.INONU_AGENT_PULSE = previous;
    }
  });

  test("the pulse is off by default and never exists without the live feed", async () => {
    start({ liveFeed: true });
    await settle();
    expect(FakeSocket.all).toHaveLength(1);
    start({ pulse: true });
    await settle();
    expect(FakeSocket.all).toEqual([]);
  });
});

describe("data root", () => {
  test("everything the handlers write lands under the given dataDir", async () => {
    await fetch(`${core!.origin}/settings/secrets`, { method: "PUT", headers: { "content-type": "application/json", origin: core!.origin, "x-inonu-settings": "1" }, body: JSON.stringify({ id: "okxWeb3ApiKey", value: SENTINEL }) });
    const written = readdirSync(join(root, "data"), { recursive: true }).map(String);
    expect(written.length).toBeGreaterThan(0);
  });
});

describe("closing the app while the agent still has work in flight", () => {
  test("an agent that cannot close in time (close_timeout) is not an unhandled rejection of the shutdown: the rest of the services still close", async () => {
    const own = createDesktopHandlers({ dataDir: join(root, "data2"), origin: "http://127.0.0.1:1", store: createSettingsStore(join(root, "data2"), { runtimeKey: () => null }) });
    let called = 0;
    (own.agentService as { close: () => Promise<void> }).close = () => (called++, Promise.reject(new Error("close_timeout")));
    own.close();
    expect(called).toBe(1);
    // an unhandled rejection would surface on a later turn of the event loop, and the test runner fails the test on it
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
