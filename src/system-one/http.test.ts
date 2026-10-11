import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSystemOneHandler, isSystemOnePath } from "./http";
import { runSystemOneCycle } from "./cycle";
import { syntheticReadings } from "./readings";
import { MockSystemOneModel } from "./decide";

const headers = { origin: "http://localhost:3001" };

let directory = "";

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "system-one-http-"));
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("GET /system-one", () => {
  test("only the exact path is served", () => {
    expect(isSystemOnePath("/system-one")).toBe(true);
    expect(isSystemOnePath("/system-one/")).toBe(false);
    expect(isSystemOnePath("/operator")).toBe(false);
  });

  test("404 with a hint when no cycle was written, 405 for other methods, OPTIONS for CORS", async () => {
    const handler = createSystemOneHandler(join(directory, "missing.json"));
    const missing = handler(new Request("http://x/system-one", { headers }));
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { hint: string }).hint).toContain("bun run system-one");
    expect(handler(new Request("http://x/system-one", { method: "POST", headers })).status).toBe(405);
    const options = handler(new Request("http://x/system-one", { method: "OPTIONS", headers }));
    expect(options.status).toBe(200);
    expect(options.headers.get("access-control-allow-origin")).toBe(headers.origin);
  });

  test("serves the file as JSON and reports an unreadable file", async () => {
    const path = join(directory, "latest.json");
    const nowMs = Date.now();
    const cycle = await runSystemOneCycle({ ...syntheticReadings({ nowMs }), phase: "fase-0" }, { model: new MockSystemOneModel(), now: () => nowMs, cycleId: () => "so-1" });
    writeFileSync(path, JSON.stringify(cycle));
    const handler = createSystemOneHandler(path);
    const response = handler(new Request("http://x/system-one", { headers }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(((await response.json()) as { cycleId: string }).cycleId).toBe("so-1");
    writeFileSync(path, "{not json");
    expect(handler(new Request("http://x/system-one", { headers })).status).toBe(500);
  });
});
