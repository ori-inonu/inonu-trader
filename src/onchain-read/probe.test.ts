import { describe, expect, test } from "bun:test";
import { createProbeOnchainos } from "./probe";
import type { OkxCredentials } from "./client";

const CREDS: OkxCredentials = { apiKey: "TEST-KEY-a77z", secret: "TEST-SECRET-s3cr", passphrase: "TEST PASS 1" };

function fakeFetch(handler: (path: string) => Response) {
  const paths: string[] = [];
  const f = (async (url: string | URL | Request) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    paths.push(path);
    return handler(path);
  }) as typeof fetch;
  return { paths, f };
}

const ok = () => new Response(JSON.stringify({ code: "0", data: [], msg: "" }), { status: 200 });
const fail = (code: string, status = 200) => new Response(JSON.stringify({ code, data: [], msg: "x" }), { status });

describe("onchainos connection probe", () => {
  test("ok only after one free call in each of two families", async () => {
    const { paths, f } = fakeFetch(() => ok());
    const probe = createProbeOnchainos({ fetch: f, now: () => 1_700_000_000_000 });
    const r = await probe(CREDS);
    expect(r).toEqual({ ok: true, code: "ok" });
    expect(paths).toEqual(["/api/v6/dex/market/supported/chain", "/api/v6/dex/balance/supported/chain"]);
  });

  test("a failure in the balance family reports its code after two calls", async () => {
    const { paths, f } = fakeFetch((p) => (p.includes("balance") ? fail("50111") : ok()));
    const probe = createProbeOnchainos({ fetch: f, now: () => 1_700_000_000_000 });
    const r = await probe(CREDS);
    expect(r).toEqual({ ok: false, code: "provider_unauthorized" });
    expect(paths).toHaveLength(2);
  });

  test("a failure in the market family short-circuits the balance call", async () => {
    const { paths, f } = fakeFetch(() => fail("50102", 401));
    const probe = createProbeOnchainos({ fetch: f, now: () => 1_700_000_000_000 });
    const r = await probe(CREDS);
    expect(r).toEqual({ ok: false, code: "clock_skew" });
    expect(paths).toEqual(["/api/v6/dex/market/supported/chain"]);
  });
});
