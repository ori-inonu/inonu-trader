import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOperatorHandler } from "./http";

const ORIGIN = "http://localhost:3001";

function cycleLine(id: string, startedAtMs: number): string {
  return JSON.stringify({ cycleId: id, startedAtMs, completedAtMs: startedAtMs + 1, inventory: { address: "0x0000...0001", observedAtMs: startedAtMs, source: "synthetic", queriedChains: [], chains: [], knownValueUsd: 1, valueComplete: true, riskTokensExcluded: true }, candidates: [], verdicts: [], eligibleIds: [], decision: null, plan: null, execution: { status: "blocked", reasons: ["no_eligible_candidate"], txHash: null, orderId: null }, inferenceUsd: 0, warnings: [], ledger: null });
}

test("operator handler restricts origins, honors the token, caches the journal and never serves other paths", async () => {
  const dir = mkdtempSync(join(tmpdir(), "operator-http-"));
  try {
    const statePath = join(dir, "latest.json");
    const journalPath = join(dir, "cycles.jsonl");
    const handler = createOperatorHandler({ origins: [ORIGIN], token: "secret", statePath, journalPath });
    const get = (path: string, headers: Record<string, string> = {}) => handler(new Request(`http://127.0.0.1:3000${path}`, { headers }), path.split("?")[0]!);

    expect(get("/operator", { origin: "https://evil.example" }).status).toBe(403);
    expect(get("/operator", { origin: ORIGIN }).status).toBe(401);
    expect(get("/operator", { origin: ORIGIN, authorization: "Bearer wrong" }).status).toBe(401);
    const auth = { origin: ORIGIN, authorization: "Bearer secret" };
    expect(get("/operator", auth).status).toBe(404);
    expect(get("/operator/history", auth).status).toBe(404);
    expect(get("/history", auth).status).toBe(404);
    const preflight = handler(new Request("http://127.0.0.1:3000/operator", { method: "OPTIONS", headers: { origin: ORIGIN } }), "/operator");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(handler(new Request("http://127.0.0.1:3000/operator", { method: "POST", headers: auth }), "/operator").status).toBe(405);

    writeFileSync(statePath, JSON.stringify({ cycleId: "s" }));
    writeFileSync(journalPath, `${cycleLine("a", 1)}\n${cycleLine("b", 2)}\nbroken\n`);
    const state = get("/operator", auth);
    expect(state.status).toBe(200);
    expect(state.headers.get("cache-control")).toBe("no-store");
    expect(await state.json()).toEqual({ cycleId: "s" });
    const history = await get("/operator/history?limit=1", auth).json() as { cycleId: string }[];
    expect(history.map((entry) => entry.cycleId)).toEqual(["b"]);
    const insights = await get("/operator/insights", auth).json() as { cycles: number };
    expect(insights.cycles).toBe(2);

    // Same size and mtime: the cached parse is reused; a changed file is re-read.
    writeFileSync(journalPath, `${cycleLine("a", 1)}\n${cycleLine("b", 2)}\n${cycleLine("c", 3)}\n`);
    const refreshed = await get("/operator/insights", auth).json() as { cycles: number };
    expect(refreshed.cycles).toBe(3);

    const open = createOperatorHandler({ origins: [ORIGIN], token: null, statePath, journalPath, maxJournalBytes: 10 });
    expect(open(new Request("http://127.0.0.1:3000/operator", { headers: {} }), "/operator").status).toBe(200);
    expect(open(new Request("http://127.0.0.1:3000/operator/history", { headers: {} }), "/operator/history").status).toBe(413);
    expect(() => createOperatorHandler({ origins: [], token: null, statePath, journalPath })).toThrow("origins");
    expect(() => createOperatorHandler({ origins: [ORIGIN], token: null, statePath: "data/latest.json", journalPath })).toThrow("absolute");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
