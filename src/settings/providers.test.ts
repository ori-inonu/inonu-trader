// CFG-5, AC-CFG-3, T2.3: the non secret defaults (the addresses the app talks to) live in one versioned manifest, so the person only reviews.
// The manifest is validated strictly, holds no secret, and cannot drift from the code: every address the core and the browser really
// use must be in it, and the other way round. origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROVIDERS, RPCS, parseProviders, providerUrl } from "./providers";

const ROOT = join(import.meta.dir, "..", "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("the manifest that ships", () => {
  test("is valid, and has the OKX REST, the WebSocket, OnchainOS, the icons and the model", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(["okx-rest", "okx-ws", "onchainos", "okx-icons", "modelo"]);
    for (const p of PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(3);
      expect(p.uso.length).toBeGreaterThan(3);
      expect(p.custo.length).toBeGreaterThan(3);
      expect(p.quemFala.length).toBeGreaterThan(3);
    }
  });

  test("every address is https or wss with no credential, no query and nothing after the host that is a secret", () => {
    for (const p of PROVIDERS) {
      const url = new URL(p.url);
      expect(["https:", "wss:"]).toContain(url.protocol);
      expect(url.username + url.password + url.search + url.hash).toBe("");
    }
    for (const list of Object.values(RPCS)) for (const rpc of list) expect(new URL(rpc).protocol).toBe("https:");
  });

  test("a secret never appears in the manifest, not even a name of one", () => {
    const text = readFileSync(join(import.meta.dir, "providers.json"), "utf8");
    expect(text).not.toMatch(/apikey|api_key|secret|passphrase|password|token=|private/i);
  });

  test("every text shown on screen is plain ASCII with no middle dot, dash or accent", () => {
    for (const p of PROVIDERS) for (const text of [p.label, p.uso, p.custo, p.quemFala]) expect(/^[\x20-\x7e]*$/.test(text)).toBe(true);
  });
});

describe("it cannot drift from the code", () => {
  test("the addresses the core and the browser use are the ones in the manifest", () => {
    expect(source("src/inonu/okx-public.ts")).toContain(`"${providerUrl("okx-rest")}"`);
    expect(source("src/inonu/okx-ws.ts")).toContain(`"${providerUrl("okx-ws")}"`);
    expect(source("src/onchain-read/client.ts")).toContain(`"${providerUrl("onchainos")}"`);
    expect(source("src/inonu/icons.ts")).toContain(providerUrl("okx-icons"));
    expect(source("web/src/lib/desk/okx-rest.ts")).toContain(`"${providerUrl("okx-rest")}"`);
    expect(source("web/src/lib/rastreador/flow.ts")).toContain(providerUrl("okx-rest"));
  });

  test("the model's base is the one the SDK uses by default", () => {
    expect(readFileSync(join(ROOT, "node_modules/@ai-sdk/typesafe-ai/dist/index.js"), "utf8")).toContain(providerUrl("modelo"));
  });
});

describe("parseProviders", () => {
  const good = { version: 1, providers: [{ id: "a-b", label: "Rotulo", url: "https://x.example", uso: "algo", custo: "gratis", quemFala: "o nucleo" }], rpcs: { "196": ["https://rpc.example"] } };

  test("reads a good manifest", () => {
    expect(parseProviders(good)).toEqual({ providers: good.providers, rpcs: good.rpcs });
  });

  test("anything off the shape is refused whole: wrong version, a plain http address, a credential in the address, an extra field, a duplicate id", () => {
    const bad: unknown[] = [
      null, [], "x", {}, { ...good, version: 2 }, { ...good, providers: [] }, { ...good, extra: 1 },
      { ...good, providers: [{ ...good.providers[0], url: "http://x.example" }] },
      { ...good, providers: [{ ...good.providers[0], url: "https://user:pw@x.example" }] },
      { ...good, providers: [{ ...good.providers[0], url: "https://x.example?key=1" }] },
      { ...good, providers: [{ ...good.providers[0], extra: 1 }] },
      { ...good, providers: [{ ...good.providers[0], id: "A B" }] },
      { ...good, providers: [good.providers[0], good.providers[0]] },
      { ...good, rpcs: { "196": ["http://rpc.example"] } },
      { ...good, rpcs: { x: ["https://rpc.example"] } },
    ];
    for (const raw of bad) expect(() => parseProviders(raw)).toThrow();
  });
});
