import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startReportsServer } from "./reports-server";
import { runSystemOneCycle } from "../system-one/cycle";
import { MockSystemOneModel } from "../system-one/decide";
import { syntheticReadings } from "../system-one/readings";

const ORIGIN = "http://127.0.0.1:3007";
const ROUTES = ["/", "/health", "/operator", "/operator/history", "/operator/insights", "/system-one"];

function cycle(cycleId: string, startedAtMs = 1000) {
  return {
    cycleId, startedAtMs, completedAtMs: startedAtMs + 1,
    inventory: { address: "0x0000000000000000000000000000000000000001", observedAtMs: startedAtMs, source: "synthetic", queriedChains: [], chains: [], knownValueUsd: 1, valueComplete: true, riskTokensExcluded: true },
    candidates: [], verdicts: [], eligibleIds: [], decision: null, plan: null,
    execution: { status: "blocked", reasons: ["no_eligible_candidate"], txHash: null, orderId: null },
    inferenceUsd: 0, warnings: [], ledger: null,
  };
}

/** A System One cycle the public projection accepts; the server never serves the raw file. */
async function systemOneState(cycleId: string, nowMs: number) {
  return runSystemOneCycle({ ...syntheticReadings({ nowMs }), phase: "fase-0" }, { model: new MockSystemOneModel(), now: () => nowMs, cycleId: () => cycleId });
}

async function withReports(run: (base: string, dataDir: string) => Promise<void>) {
  const dataDir = mkdtempSync(join(tmpdir(), "inonu-reports-"));
  mkdirSync(join(dataDir, "operator"));
  mkdirSync(join(dataDir, "system-one"));
  writeFileSync(join(dataDir, "operator/latest.json"), JSON.stringify(cycle("old-a")));
  writeFileSync(join(dataDir, "operator/cycles.jsonl"), [cycle("old-a"), cycle("old-b", 2000)].map(value => JSON.stringify(value)).join("\n"));
  writeFileSync(join(dataDir, "system-one/latest.json"), JSON.stringify(await systemOneState("so-dash-1", 1_700_000_000_000)));
  const server = startReportsServer({ dataDir, port: 0, origins: [ORIGIN] });
  try { await run(`http://127.0.0.1:${server.port}`, dataDir); }
  finally { await server.stop(true); rmSync(dataDir, { recursive: true }); }
}

test("health identifies a loopback read-only server without creating reports", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "inonu-reports-"));
  const server = startReportsServer({ dataDir, port: 0, origins: [ORIGIN] });
  try {
    expect(server.hostname).toBe("127.0.0.1");
    expect(server.port).toBeGreaterThan(0);
    const response = await fetch(`http://127.0.0.1:${server.port}/health`, { headers: { origin: ORIGIN } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "inonu-reports", mode: "read-only", executionEnabled: false, liveFeedEnabled: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("vary")).toBe("Origin");
    expect(readdirSync(dataDir)).toEqual([]);
  } finally {
    await server.stop(true);
    rmSync(dataDir, { recursive: true });
  }
});

test("serves stored operator, history, insights and System One reports without changing their timestamps", async () => {
  await withReports(async base => {
    const state = await fetch(`${base}/operator`);
    expect(state.status).toBe(200);
    expect(await state.json()).toEqual(cycle("old-a"));
    const history = await fetch(`${base}/operator/history?limit=1`);
    expect(history.status).toBe(200);
    expect(await history.json()).toEqual([cycle("old-b", 2000)]);
    const insights = await fetch(`${base}/operator/insights`);
    expect(insights.status).toBe(200);
    expect(await insights.json()).toMatchObject({ cycles: 2, firstCycleAtMs: 1000, lastCycleAtMs: 2000, realized: { plans: 0, totalUsd: 0 } });
    const systemOne = await fetch(`${base}/system-one`, { headers: { origin: ORIGIN } });
    expect(systemOne.status).toBe(200);
    expect(await systemOne.json()).toMatchObject({ schemaVersion: 1, cycleId: "so-dash-1", startedAtMs: 1_700_000_000_000, chosen: null, execution: { status: "blocked" } });
    expect(systemOne.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const sameOrigin = await fetch(`${base}/system-one`);
    expect(sameOrigin.status).toBe(200);
    expect(await sameOrigin.json()).toMatchObject({ cycleId: "so-dash-1" });
    expect(sameOrigin.headers.get("access-control-allow-origin")).toBeNull();
  });
});

test("refuses other Hosts and Origins on every path, including unknown paths", async () => {
  await withReports(async base => {
    for (const path of [...ROUTES, "/events", "/unknown"]) {
      const refusedHeaders: Record<string, string>[] = [
        { host: "attacker.example", origin: ORIGIN },
        { host: "127.0.0.1:1", origin: ORIGIN },
        { origin: "http://127.0.0.1:3007.attacker.example" },
        { origin: `${ORIGIN}/` }, { origin: "null" }, { origin: "" },
      ];
      for (const headers of refusedHeaders) {
        const response = await fetch(`${base}${path}`, { headers });
        expect(response.status).toBe(403);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("vary")).toBe("Origin");
      }
    }
    const localhost = await fetch(`${base}/health`, { headers: { host: `localhost:${new URL(base).port}` } });
    expect(localhost.status).toBe(200);
    expect(localhost.headers.get("access-control-allow-origin")).toBeNull();
  });
});

test("only known read routes accept GET and OPTIONS; block feed stays unavailable", async () => {
  await withReports(async base => {
    for (const path of ROUTES) {
      const preflight = await fetch(`${base}${path}`, { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "GET" } });
      expect(preflight.status).toBe(204);
      expect(await preflight.text()).toBe("");
      expect(preflight.headers.get("access-control-allow-origin")).toBe(ORIGIN);
      expect(preflight.headers.get("access-control-allow-methods")).toBe("GET");
      expect(preflight.headers.get("access-control-allow-headers")).toBe("Content-Type");
      for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
        const response = await fetch(`${base}${path}`, { method, headers: { origin: ORIGIN } });
        expect(response.status).toBe(405);
        expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    }
    for (const path of ["/events", "/history", "/unknown", "/operator/", "/system-one/extra"]) {
      for (const method of ["GET", "OPTIONS", "POST"]) {
        const response = await fetch(`${base}${path}`, { method });
        expect(response.status).toBe(404);
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
        expect(response.headers.get("content-type")).not.toBe("text/event-stream");
      }
    }
  });
});

test("rejects invalid configuration before binding, without accepting remote or noncanonical origins", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "inonu-reports-"));
  try {
    const valid = { dataDir, port: 0, origins: [ORIGIN] };
    const invalid = [
      { ...valid, dataDir: "relative/data" },
      ...[-1, 65536, 1.5, NaN, Infinity].map(port => ({ ...valid, port })),
      ...[[], ["*"], ["https://example.com"], ["http://localhost.evil:3007"], [`${ORIGIN}/`], [`${ORIGIN}?x=1`], [`${ORIGIN}#x`], ["http://user@localhost:3007"], ["ftp://localhost:3007"], [" http://localhost:3007"]].map(origins => ({ ...valid, origins })),
    ];
    for (const options of invalid) {
      expect(() => {
        const server = startReportsServer(options);
        server.stop(true);
      }).toThrow();
    }
  } finally { rmSync(dataDir, { recursive: true }); }
});

test("reads the next producer update even if journal length and mtime are preserved", async () => {
  await withReports(async (base, dataDir) => {
    const journal = join(dataDir, "operator/cycles.jsonl");
    const fixedTime = new Date(200_000);
    utimesSync(journal, fixedTime, fixedTime);
    const before = statSync(journal);
    expect(await (await fetch(`${base}/operator/history`)).json()).toEqual([cycle("old-a"), cycle("old-b", 2000)]);
    writeFileSync(journal, [cycle("new-a"), cycle("new-b", 2000)].map(value => JSON.stringify(value)).join("\n"));
    utimesSync(journal, fixedTime, fixedTime);
    expect(statSync(journal).size).toBe(before.size);
    expect(statSync(journal).mtimeMs).toBe(before.mtimeMs);
    expect(await (await fetch(`${base}/operator/history`)).json()).toEqual([cycle("new-a"), cycle("new-b", 2000)]);
    writeFileSync(join(dataDir, "operator/latest.json"), JSON.stringify(cycle("new-a", 3000)));
    expect(await (await fetch(`${base}/operator`)).json()).toEqual(cycle("new-a", 3000));
    writeFileSync(join(dataDir, "system-one/latest.json"), JSON.stringify(await systemOneState("so-dash-2", 1_700_000_003_500)));
    expect(await (await fetch(`${base}/system-one`)).json()).toMatchObject({ cycleId: "so-dash-2", startedAtMs: 1_700_000_003_500 });
  });
});

test("keeps report bytes and modification times unchanged for reads, preflights and refused methods", async () => {
  await withReports(async (base, dataDir) => {
    const paths = ["operator/latest.json", "operator/cycles.jsonl", "system-one/latest.json"].map(path => join(dataDir, path));
    const before = paths.map(path => ({ bytes: readFileSync(path), mtimeMs: statSync(path).mtimeMs }));
    for (const path of ROUTES) {
      for (const method of ["GET", "OPTIONS", "POST"]) await (await fetch(`${base}${path}`, { method, headers: { origin: ORIGIN } })).text();
    }
    expect(paths.map(path => ({ bytes: readFileSync(path), mtimeMs: statSync(path).mtimeMs }))).toEqual(before);
  });
});

test("report failures preserve handler errors and headers while health stays available", async () => {
  await withReports(async (base, dataDir) => {
    const check = async (path: string, status: number, error: string) => {
      const response = await fetch(`${base}${path}`, { headers: { origin: ORIGIN } });
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error });
      expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("vary")).toBe("Origin");
      expect((await fetch(`${base}/health`)).status).toBe(200);
    };
    rmSync(join(dataDir, "operator/latest.json"));
    rmSync(join(dataDir, "operator/cycles.jsonl"));
    rmSync(join(dataDir, "system-one/latest.json"));
    await check("/operator", 404, "operator state not found");
    await check("/operator/history", 404, "operator journal not found");
    await check("/operator/insights", 404, "operator journal not found");
    await check("/system-one", 404, "system-one state not found");
    writeFileSync(join(dataDir, "operator/latest.json"), "invalid");
    writeFileSync(join(dataDir, "system-one/latest.json"), "invalid");
    await check("/operator", 500, "operator state unreadable");
    await check("/system-one", 500, "system-one state unreadable");
    writeFileSync(join(dataDir, "system-one/latest.json"), " ".repeat(2_000_001));
    await check("/system-one", 500, "system-one state too large");
    writeFileSync(join(dataDir, "operator/cycles.jsonl"), "\n".repeat(8 * 1024 * 1024 + 1));
    await check("/operator/history", 413, "operator journal too large; rotate it");
    await check("/operator/insights", 413, "operator journal too large; rotate it");
    // Preserve the legacy parser: malformed JSONL lines are skipped.
    writeFileSync(join(dataDir, "operator/cycles.jsonl"), `invalid\n${JSON.stringify(cycle("only-valid"))}\n`);
    expect(await (await fetch(`${base}/operator/history`)).json()).toEqual([cycle("only-valid")]);
  });
});
