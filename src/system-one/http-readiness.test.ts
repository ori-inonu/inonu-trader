import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSystemOneHandler } from "./http";
import { runSystemOneCycle } from "./cycle";
import { syntheticReadings } from "./readings";
import { MockSystemOneModel } from "./decide";

const dir = mkdtempSync(join(tmpdir(), "system-one-boundary-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const headers = { origin: "http://localhost:3001" };

test("configured read token is enforced even with an allowed origin", () => {
  const handler = createSystemOneHandler(join(dir, "missing"), [headers.origin], "fixture-token");
  expect(handler(new Request("http://localhost/system-one", { headers })).status).toBe(401);
  expect(handler(new Request("http://localhost/system-one", { headers: { ...headers, authorization: "Bearer wrong" } })).status).toBe(401);
  expect(handler(new Request("http://localhost/system-one", { headers: { ...headers, authorization: "Bearer fixture-token" } })).status).toBe(404);
});

test("only configured dashboard origins can read or preflight the cycle", () => {
  const handler = createSystemOneHandler(join(dir, "missing"));
  for (const origin of [null, "null", "https://attacker.example", "http://localhost:3001.evil"]) {
    for (const method of ["GET", "OPTIONS"]) {
      const response = handler(new Request("http://localhost:3000/system-one", { method, headers: origin ? { origin } : {} }));
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
  }
  expect(handler(new Request("http://localhost:3000/system-one", { headers })).status).toBe(404);
});

test("public projection excludes arbitrary provider text and additional private fields", async () => {
  const nowMs = Date.now();
  const cycle = await runSystemOneCycle({ ...syntheticReadings({ nowMs }), phase: "fase-2" }, { model: new MockSystemOneModel(), now: () => nowMs });
  const sentinel = "https://secret.example?key=PRIVATE_SENTINEL";
  const data = { ...cycle, privateField: sentinel, warnings: [sentinel], brief: { ...cycle.brief, notes: [sentinel], wallet: { ...cycle.brief.wallet, address: sentinel } } };
  const path = join(dir, "latest.json");
  writeFileSync(path, JSON.stringify(data));
  const response = createSystemOneHandler(path)(new Request("http://localhost:3000/system-one", { headers }));
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe(headers.origin);
  const text = await response.text();
  expect(text).not.toContain("PRIVATE_SENTINEL");
  expect(JSON.parse(text).execution.status).toBe(cycle.execution.status);
  expect(JSON.parse(text).brief.wallet.source).toBe("synthetic");
});

test("oversized and unsupported cycles are rejected", () => {
  const path = join(dir, "large.json");
  const handler = createSystemOneHandler(path);
  const request = () => new Request("http://localhost:3000/system-one", { headers });
  writeFileSync(path, " ".repeat(2_000_001));
  expect(handler(request()).status).toBe(500);
  writeFileSync(path, JSON.stringify({ schemaVersion: 99 }));
  expect(handler(request()).status).toBe(500);
});

test("public GET rejects invalid required financial values instead of publishing null", async () => {
  const nowMs = Date.now();
  const cycle = await runSystemOneCycle({ ...syntheticReadings({ nowMs, capitalUsd: 1000 }), phase: "fase-2", kellyLowerBound: 12 }, { model: new MockSystemOneModel(), now: () => nowMs });
  const path = join(dir, "financial.json");
  const handler = createSystemOneHandler(path);
  const read = () => handler(new Request("http://localhost/system-one", { headers }));
  writeFileSync(path, JSON.stringify(cycle));
  expect(read().status).toBe(200);
  const locations = [
    ["wallet", "capitalUsd"], ["wallet", "knownValueUsd"], ["wallet", "openNotionalUsd"],
    ["limits", "leverageCeiling"], ["limits", "orderCapUsd"], ["limits", "exposureCapUsd"],
    ["candidate", "leverage"], ["candidate", "marginUsd"], ["candidate", "notionalUsd"], ["candidate", "liquidationDistance"],
  ];
  for (const [section, field] of locations) {
    for (const invalid of [null, undefined, NaN, Infinity, -Infinity, -1, "10"]) {
      const changed = structuredClone(cycle);
      const target = section === "candidate" ? changed.brief.candidates[0]! : section === "wallet" ? changed.brief.wallet : changed.brief.limits;
      (target as unknown as Record<string, unknown>)[field!] = invalid;
      writeFileSync(path, JSON.stringify(changed));
      expect(read().status).toBe(500);
    }
  }
  const unknown = structuredClone(cycle);
  unknown.brief.market.realizedSigmaDaily = null;
  unknown.brief.candidates.forEach(candidate => { candidate.touchProbability = null; });
  writeFileSync(path, JSON.stringify(unknown));
  expect(read().status).toBe(200);
});
