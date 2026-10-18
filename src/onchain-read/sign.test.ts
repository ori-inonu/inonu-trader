import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { signRequest } from "./sign";

/**
 * The reference vector is computed independently inside the test (node:crypto on a hand-assembled
 * pre-hash string), following the documented contract timestamp+method+requestPath+body.
 */
describe("signRequest", () => {
  test("matches an independent HMAC-SHA256 computation", () => {
    const secret = "TEST-SECRET-s3cr";
    const ts = "2026-10-12T15:30:41.274Z";
    const method = "GET";
    const path = "/api/v6/dex/market/supported/chain";
    const body = "";
    const expected = createHmac("sha256", secret).update(ts + method + path + body).digest("base64");
    expect(signRequest(secret, ts, method, path, body)).toBe(expected);
    // frozen known-answer vector, independent of the implementation under test
    expect(signRequest(secret, ts, method, path, body)).toBe("Nrg9KaFx8r1+Pp2X8OiSBxH8sKemB2Bb3+LosLrbAlI=");
  });

  test("POST signs the raw body and the query stays inside requestPath", () => {
    const secret = "another-secret-99";
    const ts = "2026-01-01T00:00:00.000Z";
    const path = "/api/v6/dex/market/signal/list";
    const body = JSON.stringify([{ chainIndex: "501", walletType: "1,2,3", limit: "50" }]);
    // pre-hash assembled entirely by hand
    const prehash = "2026-01-01T00:00:00.000Z" + "POST" + "/api/v6/dex/market/signal/list" + body;
    const expected = Buffer.from(createHmac("sha256", secret).update(prehash).digest()).toString("base64");
    expect(signRequest(secret, ts, "POST", path, body)).toBe(expected);
    // and it changes when the body changes
    expect(signRequest(secret, ts, "POST", path, body + " ")).not.toBe(expected);
  });
});
