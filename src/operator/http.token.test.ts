import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOperatorHandler, tokenMatches } from "./http";

test("tokenMatches is an exact match that never throws, whatever the lengths", () => {
  expect(tokenMatches("Bearer secret", "Bearer secret")).toBe(true);
  // Same length, one byte different at the start, in the middle and at the end.
  for (const wrong of ["Xearer secret", "Bearer sXcret", "Bearer secreX"]) {
    expect(wrong.length).toBe("Bearer secret".length);
    expect(tokenMatches(wrong, "Bearer secret")).toBe(false);
  }
  // Different lengths must be a plain false: timingSafeEqual itself throws on unequal buffers.
  for (const wrong of ["", "B", "Bearer secre", "Bearer secrets", "Bearer secret ", " Bearer secret", "bearer secret", "BEARER SECRET", "secret"]) {
    expect(tokenMatches(wrong, "Bearer secret")).toBe(false);
  }
  expect(tokenMatches(null, "Bearer secret")).toBe(false);
  expect(tokenMatches("Bearer é", "Bearer é")).toBe(true);
  expect(tokenMatches("Bearer è", "Bearer é")).toBe(false);
});

test("the operator handler answers 401 to a token of the same length and to near misses, 200 only to the exact bearer", () => {
  const dir = mkdtempSync(join(tmpdir(), "operator-http-token-"));
  try {
    const statePath = join(dir, "latest.json");
    const journalPath = join(dir, "cycles.jsonl");
    writeFileSync(statePath, JSON.stringify({ cycleId: "s" }));
    const origin = "http://localhost:3001";
    const handler = createOperatorHandler({ origins: [origin], token: "secret", statePath, journalPath });
    const status = (authorization?: string) => handler(new Request("http://127.0.0.1:3000/operator", { headers: authorization === undefined ? { origin } : { origin, authorization } }), "/operator").status;
    expect(status("Bearer secret")).toBe(200);
    expect(status("Bearer secrex")).toBe(401);
    expect(status("Bearer xecret")).toBe(401);
    expect(status("Bearer secre")).toBe(401);
    expect(status("Bearer secrets")).toBe(401);
    expect(status("bearer secret")).toBe(401);
    expect(status("secret")).toBe(401);
    expect(status("")).toBe(401);
    expect(status()).toBe(401);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
