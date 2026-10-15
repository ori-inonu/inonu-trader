import { describe, expect, test } from "bun:test";
import { createSettingsClient, SettingsRequestError, type SettingsSnapshot } from "./client";

const SNAPSHOT: SettingsSnapshot = {
  secrets: {
    typesafeAiApiKey: { configured: true, last4: "a77z", updatedAtMs: 1 },
    okxWeb3ApiKey: { configured: true, last4: "9k2m", updatedAtMs: 1 },
    okxWeb3ApiSecret: { configured: true, last4: null, updatedAtMs: 1 },
    okxWeb3ApiPassphrase: { configured: false, last4: null, updatedAtMs: null },
  },
  okx: { state: "incomplete" },
  prefs: { version: 1, onchain: { capBasic: 50_000, capPremium: 50_000, background: false, defaultChainIndex: null } },
};

function fakeFetch(handler: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; credentials?: string }) => Response | Promise<Response>) {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string; credentials?: string } }[] = [];
  const impl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; credentials?: "omit" | "same-origin" }) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { impl, calls };
}

const BASE = "http://127.0.0.1:3042";

describe("settings client", () => {
  test("same-origin hosted settings preserve login cookies and the read-only capability", async () => {
    const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ ...SNAPSHOT, readOnly: true })));
    expect((await createSettingsClient("", impl).get()).readOnly).toBe(true);
    expect(calls[0]!.init?.credentials).toBe("same-origin");
    const malformed = fakeFetch(() => new Response(JSON.stringify({ ...SNAPSHOT, readOnly: "true" })));
    await expect(createSettingsClient("", malformed.impl).get()).rejects.toMatchObject({ code: "bad_response" });
  });
  test("hosted test actions carry intent while external desktop settings keep their existing preflight contract", async () => {
    const same = fakeFetch(() => new Response(JSON.stringify({ ok: true, code: "format_ok" })));
    await createSettingsClient("", same.impl).testJev();
    expect(same.calls[0]!.init?.headers?.["x-inonu-intent"]).toBe("user");
    const external = fakeFetch(() => new Response(JSON.stringify({ ok: true, code: "format_ok" })));
    await createSettingsClient(BASE, external.impl).testJev();
    expect(external.calls[0]!.init?.credentials).toBe("omit");
    expect(external.calls[0]!.init?.headers?.["x-inonu-intent"]).toBeUndefined();
  });
  test("preserves verified key origins while dropping secret fragments and unknown fields", async () => {
    const fake = fakeFetch(() => new Response(JSON.stringify({ ...SNAPSHOT, secrets: {
      ...SNAPSHOT.secrets, typesafeAiApiKey: { configured: true, last4: "leak", updatedAtMs: null, origin: "windows_user", value: "never-display" },
    } })));
    const status = (await createSettingsClient(BASE, fake.impl).get()).secrets.typesafeAiApiKey;
    expect(status).toEqual({ configured: true, last4: null, updatedAtMs: null, origin: "windows_user" });
    expect(JSON.stringify(status)).not.toContain("never-display");
  });
  test("get calls /settings with the guard header and no credentials", async () => {
    const { impl, calls } = fakeFetch(() => new Response(JSON.stringify(SNAPSHOT)));
    const client = createSettingsClient(BASE, impl);
    const snapshot = await client.get();
    expect(snapshot).toEqual({ ...SNAPSHOT, secrets: { ...SNAPSHOT.secrets, typesafeAiApiKey: { ...SNAPSHOT.secrets.typesafeAiApiKey, last4: null } } });
    expect(calls[0]!.url).toBe(`${BASE}/settings`);
    expect(calls[0]!.init?.headers?.["x-inonu-settings"]).toBe("1");
    expect(calls[0]!.init?.credentials).toBe("omit");
    expect(calls[0]!.init?.method).toBe("GET");
  });

  test("a vault that did not answer is carried to the screen, and a healthy answer has no such field", async () => {
    const down = fakeFetch(() => new Response(JSON.stringify({ ...SNAPSHOT, vault: "indisponivel" })));
    expect((await createSettingsClient(BASE, down.impl).get()).vault).toBe("indisponivel");
    const healthy = fakeFetch(() => new Response(JSON.stringify(SNAPSHOT)));
    expect((await createSettingsClient(BASE, healthy.impl).get()).vault).toBeUndefined();
    // any other value of the field is not a state of ours and is dropped, never shown
    const odd = fakeFetch(() => new Response(JSON.stringify({ ...SNAPSHOT, vault: "<script>" })));
    expect((await createSettingsClient(BASE, odd.impl).get()).vault).toBeUndefined();
  });

  test("setSecret PUTs only id and value as json", async () => {
    const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ secrets: SNAPSHOT.secrets, okx: SNAPSHOT.okx })));
    const client = createSettingsClient(BASE, impl);
    await client.setSecret("okxWeb3ApiPassphrase", "the passphrase 123");
    expect(calls[0]!.init?.method).toBe("PUT");
    expect(calls[0]!.init?.headers?.["content-type"]).toBe("application/json");
    expect(JSON.parse(calls[0]!.init?.body ?? "{}")).toEqual({ id: "okxWeb3ApiPassphrase", value: "the passphrase 123" });
  });

  test("clearSecret issues DELETE on the id path", async () => {
    const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ secrets: SNAPSHOT.secrets, okx: SNAPSHOT.okx })));
    const client = createSettingsClient(BASE, impl);
    await client.clearSecret("okxWeb3ApiKey");
    expect(calls[0]!.url).toBe(`${BASE}/settings/secrets/okxWeb3ApiKey`);
    expect(calls[0]!.init?.method).toBe("DELETE");
  });

  test("setPrefs PUTs the patch and returns prefs", async () => {
    const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ prefs: SNAPSHOT.prefs })));
    const client = createSettingsClient(BASE, impl);
    const prefs = await client.setPrefs({ onchain: { capBasic: 1000 } });
    expect(prefs.onchain.capBasic).toBe(50_000);
    expect(JSON.parse(calls[0]!.init?.body ?? "{}")).toEqual({ onchain: { capBasic: 1000 } });
  });

  test("test endpoints use POST and return ok plus code", async () => {
    const { impl, calls } = fakeFetch(() => new Response(JSON.stringify({ ok: true, code: "format_ok", tested: false })));
    const client = createSettingsClient(BASE, impl);
    expect(await client.testJev()).toEqual({ ok: true, code: "format_ok", tested: false });
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.url).toBe(`${BASE}/settings/test/jev`);
    await client.testOnchainos();
    expect(calls[1]!.url).toBe(`${BASE}/settings/test/onchainos`);
  });

  test("a network failure maps to the constant network error", async () => {
    const client = createSettingsClient(BASE, async () => {
      throw new TypeError("fetch failed");
    });
    await expect(client.get()).rejects.toMatchObject({ code: "network" });
  });

  test("an http error carries status and the constant server code", async () => {
    const client = createSettingsClient(BASE, async () => new Response(JSON.stringify({ ok: false, code: "rate_limited" }), { status: 429 }));
    const error = await client.get().catch((e) => e);
    expect(error).toBeInstanceOf(SettingsRequestError);
    expect(error.code).toBe("http");
    expect(error.status).toBe(429);
    expect(error.serverCode).toBe("rate_limited");
  });

  test("a malformed snapshot is rejected instead of shown as real", async () => {
    const client = createSettingsClient(BASE, async () => new Response(JSON.stringify({ secrets: {}, okx: { state: "weird" }, prefs: null })));
    await expect(client.get()).rejects.toMatchObject({ code: "bad_response" });
  });
});
