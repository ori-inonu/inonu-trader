// T3.5 / ICO-1 to ICO-3: the icon of a currency, fetched by the LOCAL core from OKX's public icon host and cached on disk, so
// the browser never talks to a third party. Only a PNG or WEBP of a sane size is served; anything else is a miss.
// origin: synthetic_fixture, tests only.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ICON_HOST_PREFIX, createIconService } from "./icons";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50, 1]);

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "inonu-icons-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeFetch(handler: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    return handler(url);
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}
const image = (bytes: Uint8Array, type = "image/png") => new Response(bytes, { status: 200, headers: { "content-type": type } });

describe("get", () => {
  test("fetches from the fixed OKX icon host by lowercase symbol, returns the bytes, and caches them on disk", async () => {
    const { fetchImpl, urls } = fakeFetch(() => image(PNG));
    const icons = createIconService({ dir, fetch: fetchImpl });
    const first = await icons.get("BTC");
    expect(first).toEqual({ ok: true, type: "image/png", bytes: PNG });
    expect(urls).toEqual([`${ICON_HOST_PREFIX}btc.png`]);
    expect(readdirSync(dir)).toEqual(["btc.png"]);
    const second = await icons.get("btc");
    expect(second.ok).toBe(true);
    expect(urls).toHaveLength(1); // served from memory or disk, no second call
  });

  test("a new service on the same folder serves the cached file without the network", async () => {
    await createIconService({ dir, fetch: fakeFetch(() => image(PNG)).fetchImpl }).get("eth");
    const offline = fakeFetch(() => {
      throw new Error("must not be called");
    });
    const result = await createIconService({ dir, fetch: offline.fetchImpl }).get("eth");
    expect(result).toEqual({ ok: true, type: "image/png", bytes: PNG });
    expect(offline.urls).toEqual([]);
  });

  test("webp is accepted too, and the type comes from the bytes, not from the header", async () => {
    const { fetchImpl } = fakeFetch(() => image(WEBP, "application/octet-stream"));
    expect(await createIconService({ dir, fetch: fetchImpl }).get("okb")).toEqual({ ok: true, type: "image/webp", bytes: WEBP });
  });

  test("many requests for the same symbol at once make one network call", async () => {
    const { fetchImpl, urls } = fakeFetch(async () => {
      await Bun.sleep(20);
      return image(PNG);
    });
    const icons = createIconService({ dir, fetch: fetchImpl });
    const results = await Promise.all(Array.from({ length: 8 }, () => icons.get("sol")));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(urls).toHaveLength(1);
  });
});

describe("misses", () => {
  test("a symbol the host does not have is a miss, remembered for a day so it is not asked again", async () => {
    let now = 1_000;
    const { fetchImpl, urls } = fakeFetch(() => new Response("not found", { status: 404 }));
    const icons = createIconService({ dir, fetch: fetchImpl, now: () => now });
    expect(await icons.get("zzzz")).toEqual({ ok: false, reason: "miss" });
    now += 3_600_000;
    expect(await icons.get("zzzz")).toEqual({ ok: false, reason: "miss" });
    expect(urls).toHaveLength(1);
    now += 24 * 3_600_000;
    await icons.get("zzzz");
    expect(urls).toHaveLength(2);
    expect(existsSync(join(dir, "zzzz.png"))).toBe(false);
  });

  test("something that is not an image, an oversized file, an SVG and a network failure are all misses and are not stored", async () => {
    const cases: Response[] = [
      new Response("<html>nope</html>", { status: 200, headers: { "content-type": "text/html" } }),
      new Response(Uint8Array.from([...PNG, ...new Uint8Array(70_000)]), { status: 200, headers: { "content-type": "image/png" } }), // a real PNG header, but too big
      new Response('<svg onload="alert(1)"/>', { status: 200, headers: { "content-type": "image/svg+xml" } }),
    ];
    for (const [index, response] of cases.entries()) {
      const { fetchImpl } = fakeFetch(() => response);
      expect(await createIconService({ dir, fetch: fetchImpl }).get(`x${index}`)).toMatchObject({ ok: false });
    }
    const failing = fakeFetch(() => {
      throw new Error("ECONNREFUSED SENTINEL-x");
    });
    expect(await createIconService({ dir, fetch: failing.fetchImpl }).get("down")).toEqual({ ok: false, reason: "miss" });
    expect(readdirSync(dir)).toEqual([]);
  });

  test("a PNG header is checked on the bytes: a body of a different type with an image header is still refused", async () => {
    const { fetchImpl } = fakeFetch(() => image(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])));
    expect(await createIconService({ dir, fetch: fetchImpl }).get("junk")).toMatchObject({ ok: false });
  });

  test("a call that never answers is cut at the timeout", async () => {
    const fetchImpl = ((_url: string, init?: { signal?: AbortSignal }) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await createIconService({ dir, fetch: fetchImpl, timeoutMs: 30 }).get("slow")).toEqual({ ok: false, reason: "miss" });
  });
});

describe("concurrency", () => {
  test("a screen full of symbols asks the host for at most four at a time", async () => {
    let active = 0;
    let peak = 0;
    const { fetchImpl } = fakeFetch(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep(15);
      active -= 1;
      return image(PNG);
    });
    const icons = createIconService({ dir, fetch: fetchImpl });
    const symbols = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const results = await Promise.all(symbols.map((s) => icons.get(s)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });
});

describe("the symbol is validated before anything is built from it", () => {
  test("only 1 to 15 lowercase letters and digits reach the host; paths, dots and slashes never do", async () => {
    const { fetchImpl, urls } = fakeFetch(() => image(PNG));
    const icons = createIconService({ dir, fetch: fetchImpl });
    for (const bad of ["", "../etc/passwd", "a/b", "btc.png", "BTC-USDT", "a".repeat(16), "bt c", "btc?x=1", "%2e%2e", "\u0000"]) expect(await icons.get(bad)).toEqual({ ok: false, reason: "bad_symbol" });
    expect(urls).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });

  test("the cache stays bounded: past the limit a new icon is served but not stored", async () => {
    const { fetchImpl } = fakeFetch(() => image(PNG));
    const icons = createIconService({ dir, fetch: fetchImpl, maxFiles: 2 });
    for (const symbol of ["aa", "bb", "cc"]) expect((await icons.get(symbol)).ok).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(["aa.png", "bb.png"]);
  });
});
