// ICO-2, T3.5: the logo of a NETWORK, fetched by the LOCAL core from the provider's own host (named by the provider's own list of networks) and cached on disk, so
// the browser never talks to a third party. Strict: a number, https on the provider's hosts, no redirect, PNG or WEBP by its bytes and under 64 KB.
// origin: synthetic_fixture, tests only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChainIconService } from "./chain-icons";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50, 1]);
const LOGO = "https://static.coinall.ltd/cdn/wallet/logo/eth.png";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inonu-chain-icons-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const image = (bytes: Uint8Array, headers: Record<string, string> = {}) => new Response(bytes, { status: 200, headers });
const logos = (map: Record<string, string | null>) => async (chain: string) => map[chain] ?? null;

describe("get", () => {
  test("asks the list for the logo of the network, fetches that URL, serves the bytes and keeps them on disk", async () => {
    const { fetchImpl, calls } = fakeFetch(() => image(PNG));
    const icons = createChainIconService({ dir, logoOf: logos({ "1": LOGO }), fetch: fetchImpl });
    expect(await icons.get("1")).toEqual({ ok: true, type: "image/png", bytes: PNG });
    expect(calls.map((c) => c.url)).toEqual([LOGO]);
    expect(readdirSync(dir)).toEqual(["chain-1.png"]);
    expect((await icons.get("1")).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("a redirect is never followed", async () => {
    const { fetchImpl, calls } = fakeFetch(() => image(PNG));
    await createChainIconService({ dir, logoOf: logos({ "1": LOGO }), fetch: fetchImpl }).get("1");
    expect(calls[0]!.init?.redirect).toBe("error");
  });

  test("a new service on the same folder serves the file without the list and without the network", async () => {
    await createChainIconService({ dir, logoOf: logos({ "196": LOGO }), fetch: fakeFetch(() => image(WEBP)).fetchImpl }).get("196");
    const offline = fakeFetch(() => {
      throw new Error("must not be called");
    });
    const asked: string[] = [];
    const result = await createChainIconService({ dir, logoOf: async (c) => (asked.push(c), null), fetch: offline.fetchImpl }).get("196");
    expect(result).toEqual({ ok: true, type: "image/webp", bytes: WEBP });
    expect(offline.calls).toEqual([]);
    expect(asked).toEqual([]);
  });

  test("many requests for one network at once make one call", async () => {
    const { fetchImpl, calls } = fakeFetch(async () => {
      await Bun.sleep(20);
      return image(PNG);
    });
    const icons = createChainIconService({ dir, logoOf: logos({ "1": LOGO }), fetch: fetchImpl });
    const all = await Promise.all([icons.get("1"), icons.get("1"), icons.get("1")]);
    expect(all.every((r) => r.ok)).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("what it refuses", () => {
  test("a network that is not a number never reaches the list or the network", async () => {
    const { fetchImpl, calls } = fakeFetch(() => image(PNG));
    const asked: string[] = [];
    const icons = createChainIconService({ dir, logoOf: async (c) => (asked.push(c), LOGO), fetch: fetchImpl });
    for (const bad of ["", "abc", "1/../2", "1.5", "-1", " 1", "1 ", "1".repeat(13), "0x1"]) expect(await icons.get(bad)).toEqual({ ok: false, reason: "bad_chain" });
    expect(await icons.get(undefined as unknown as string)).toEqual({ ok: false, reason: "bad_chain" });
    expect(asked).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("a URL that is not https on the provider's own hosts is never fetched, even if the list handed it over", async () => {
    const { fetchImpl, calls } = fakeFetch(() => image(PNG));
    const bad = ["http://static.coinall.ltd/a.png", "https://evil.example/a.png", "https://static.coinall.ltd.evil.example/a.png", "https://u:p@static.coinall.ltd/a.png", "https://static.coinall.ltd:8443/a.png", "file:///etc/passwd", "not a url"];
    for (const [i, url] of bad.entries()) {
      const icons = createChainIconService({ dir, logoOf: logos({ [String(i + 1)]: url }), fetch: fetchImpl });
      expect(await icons.get(String(i + 1))).toEqual({ ok: false, reason: "miss" });
    }
    expect(calls).toEqual([]);
  });

  test("a network the list does not know, or knows without a logo, is a miss that is not asked again at once", async () => {
    const asked: string[] = [];
    const icons = createChainIconService({ dir, logoOf: async (c) => (asked.push(c), null), fetch: fakeFetch(() => image(PNG)).fetchImpl });
    expect(await icons.get("999")).toEqual({ ok: false, reason: "miss" });
    expect(await icons.get("999")).toEqual({ ok: false, reason: "miss" });
    expect(asked).toEqual(["999"]);
  });

  test("a list that fails is a miss, and the miss ends: the next ask, a few minutes on, asks again", async () => {
    let t = 1_000;
    let broken = true;
    const icons = createChainIconService({
      dir,
      logoOf: async () => {
        if (broken) throw new Error("list down");
        return LOGO;
      },
      fetch: fakeFetch(() => image(PNG)).fetchImpl,
      now: () => t,
    });
    expect(await icons.get("1")).toEqual({ ok: false, reason: "miss" });
    broken = false;
    expect(await icons.get("1")).toEqual({ ok: false, reason: "miss" });
    t += 6 * 60_000;
    expect((await icons.get("1")).ok).toBe(true);
  });

  test("not an image by its bytes (an SVG, HTML), or too big, or a status that is not 200, is a miss and nothing is kept", async () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    const big = new Uint8Array(70_000);
    big.set(PNG);
    const cases: Array<() => Response> = [() => image(svg, { "content-type": "image/png" }), () => image(big), () => new Response("nope", { status: 404 }), () => new Response("busy", { status: 503 })];
    for (const [i, respond] of cases.entries()) {
      const icons = createChainIconService({ dir, logoOf: logos({ [String(i + 1)]: LOGO }), fetch: fakeFetch(respond).fetchImpl });
      expect(await icons.get(String(i + 1))).toEqual({ ok: false, reason: "miss" });
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  test("a network that fails to connect is a miss, not an error", async () => {
    const icons = createChainIconService({
      dir,
      logoOf: logos({ "1": LOGO }),
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    expect(await icons.get("1")).toEqual({ ok: false, reason: "miss" });
  });

  test("the cache has a limit: past it the logo is still served, just not kept", async () => {
    const icons = createChainIconService({ dir, logoOf: logos({ "1": LOGO, "2": LOGO }), fetch: fakeFetch(() => image(PNG)).fetchImpl, maxFiles: 1 });
    expect((await icons.get("1")).ok).toBe(true);
    expect((await icons.get("2")).ok).toBe(true);
    expect(readdirSync(dir)).toEqual(["chain-1.png"]);
  });
});
