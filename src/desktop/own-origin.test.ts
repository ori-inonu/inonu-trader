// The origin the API guards see for a request that carries none: the core's own for a same-origin GET, and, in development only, the hot reload page that a
// picture names in its Referer. The installed app lists no development origin, so a same-site picture there stays without an origin and is refused.
// origin: synthetic_fixture, tests only.
import { describe, expect, test } from "bun:test";
import { withOwnOrigin } from "./core";

const OWN = "http://127.0.0.1:47321";
const DEV = ["http://127.0.0.1:3001", "http://localhost:3001"];
const req = (headers: Record<string, string>) => new Request(`${OWN}/inonu/icon/btc`, { headers });
const originOf = (r: Request) => r.headers.get("origin");

describe("withOwnOrigin", () => {
  test("a same-origin request gets the core's own origin; one that already has an origin keeps it", () => {
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "same-origin" }), OWN, []))).toBe(OWN);
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "same-origin", origin: "http://x.example" }), OWN, []))).toBe("http://x.example");
  });

  test("a request that says nothing about where it comes from stays without an origin", () => {
    expect(originOf(withOwnOrigin(req({}), OWN, DEV))).toBeNull();
    expect(originOf(withOwnOrigin(req({ referer: "http://127.0.0.1:3001/" }), OWN, DEV))).toBeNull();
  });

  test("in development, a same-site picture takes the development page named in its Referer", () => {
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "same-site", referer: "http://127.0.0.1:3001/mesa?x=1" }), OWN, DEV))).toBe("http://127.0.0.1:3001");
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "same-site", referer: "http://localhost:3001/" }), OWN, DEV))).toBe("http://localhost:3001");
  });

  test("a Referer that is not a development origin, is missing or is not a URL gives nothing", () => {
    for (const referer of ["http://evil.example:3001/", "http://127.0.0.1:3002/", "not a url", ""]) {
      expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "same-site", referer }), OWN, DEV))).toBeNull();
    }
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "same-site" }), OWN, DEV))).toBeNull();
  });

  test("a cross-site request never takes an origin from its Referer, in development or not", () => {
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "cross-site", referer: "http://127.0.0.1:3001/" }), OWN, DEV))).toBeNull();
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "none", referer: "http://127.0.0.1:3001/" }), OWN, DEV))).toBeNull();
  });

  test("without development origins (the installed app) a same-site picture stays without an origin", () => {
    expect(originOf(withOwnOrigin(req({ "sec-fetch-site": "same-site", referer: "http://127.0.0.1:3001/" }), OWN, []))).toBeNull();
  });
});
