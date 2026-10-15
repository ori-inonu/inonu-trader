import { expect, test } from "bun:test";
import { createOnchainClient } from "./onchain/client";
import { backendSession } from "./backend-session";

test("authenticated cookies are allowed only for explicitly relative app APIs", () => {
  for (const base of ["", "/api", "/api/"]) expect(backendSession(base)).toBe("same-origin");
  for (const base of ["https://another.example", "http://127.0.0.1:3000", "//another.example", "api", "/\t/another.example", "/\r\n/another.example", "/api\u0000", "/\\another.example"]) expect(backendSession(base)).toBe("omit");
});

test("OnchainOS app reads can use the authenticated same-origin session without provider credentials", async () => {
  let init: RequestInit | undefined;
  const client = createOnchainClient("", async (_url, options) => {
    init = options;
    return Response.json({ ok: true, data: [{ chainIndex: "1", name: "Ethereum", symbol: "ETH" }], meta: { tier: "basic", cachedAtMs: 1, ageMs: 0, stale: false, budget: { tier: "basic", used: 1, cap: null } } });
  });
  await client.chains("user");
  expect(init?.credentials).toBe("same-origin");
  expect(new Headers(init?.headers).has("authorization")).toBe(false);
});
