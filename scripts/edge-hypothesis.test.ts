import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessHypothesis } from "../src/decision/hypothesis";
import { runAudit } from "./baseline-audit";
import { inputsFrom } from "./edge-hypothesis";

const T0 = Date.UTC(2026, 9, 15, 12);
const dir = mkdtempSync(join(tmpdir(), "edge-hypothesis-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const jsonl = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const quote = (ms: number, impact: number) => ({ startedAtMs: T0, receivedAtMs: T0 + ms, ageMs: ms, expiresAtMs: T0 + ms + 14_000, disposition: "ok", facts: { impactPct: impact, tradeFee: 0.0005 } });

function baseline() {
  const agent = join(dir, "InonuTrader", "data", "agent");
  mkdirSync(agent, { recursive: true });
  // Impactos absolutos 0,10 / 0,20 / 0,20 / 0,40: mediana 0,2 e um quarto das cotações até 0,15.
  const closings = [0.1, -0.2, 0.2, 0.4].map((impact, i) => ({ quote: quote(1000 + i, impact), wouldReason: "resposta_do_jev", askedAtMs: T0, answeredAtMs: T0 + 300 }));
  writeFileSync(join(agent, "closings.jsonl"), jsonl(closings));
  writeFileSync(join(agent, "decisions-meta.jsonl"), jsonl([{ metadata: { askedAtMs: T0, answeredAtMs: T0 + 400, recordedAtMs: T0 + 410, factAvailableAtMs: T0 } }]));
  writeFileSync(
    join(agent, "fills.jsonl"),
    jsonl([
      { kind: "fill", side: "buy", atMs: T0, mint: "M", symbol: "A", tokenMinor: "100", cashUnits: 10 },
      { kind: "fill", side: "sell", atMs: T0 + 1, mint: "M", symbol: "A", tokenMinor: "100", cashUnits: 10.05 },
    ]),
  );
  return runAudit(agent, null, T0 + 1000);
}

describe("inputsFrom", () => {
  test("mapeia o baseline para as entradas da análise", () => {
    const i = inputsFrom(baseline(), { latencyMs: { p95: 0.004 } }, 30, 90);
    expect(i).toMatchObject({ targetNetBps: 30, targetIntervalMs: 90, tradeRps: 1, requiredPerSecond: 11.11, basicPerDay: 3226, quoteP50Ms: 1001, modelP50Ms: 400, localP95Ms: 0.004 });
    expect(i.entryImpactP50Pct).toBe(0.2);
    // O que cabe por perna no alvo de 30 bps em duas pernas é 0,15%: só a cotação de 0,10 está dentro.
    expect(i.entryShareWithinTarget).toBe(0.25);
    expect(i.realized).toEqual({ n: 1, wins: 1, atLeastTarget: 1, returnPct: 0.5 });
    expect(i.forwardBuys).toBeNull();
  });

  test("sem benchmark local a latência da decisão fica de fora do texto", () => {
    const i = inputsFrom(baseline(), null, 30, 90);
    expect(i.localP95Ms).toBeNull();
    expect(assessHypothesis(i).findings.find((f) => f.id === "latencia")!.evidence).not.toContain("decisão local pura");
  });
});
