import { expect, test } from "bun:test";
import { createCycleRunner, type ConsultRecord } from "../agent/cycle";
import { createAgentLedger } from "../agent/ledger";
import { createPlanStore } from "../agent/plans";
import { createScoreboard } from "../agent/scoreboard";
import { createBudget, DEFAULT_LIMITS } from "../agent/budget";
import { DEFAULT_CAPS } from "../agent/gate";
import { runState } from "../agent/run-state.test-helper";
import { candidateOf, type EcoFacts } from "../opportunity/ecosystem";
import type { Book } from "../agent/types";
import type { TimingFacts } from "../agent/timing";
import { auditConsult } from "./audit";
import { captureAgentConsult } from "./evolution/agent-episode";

// origin: synthetic_fixture. A shadow cycle with in-memory stores and an injected
// model; no wallet key, provider, quote or network. The executor must never run.
test("the model's posture is recorded while its chosen size survives unchanged into the capture", async () => {
  const now = Date.UTC(2026, 9, 14, 12);
  const address = "5".repeat(44);
  const facts: EcoFacts = { candidateId: `token:501:${address}`, chainIndex: "501", address, symbol: "SYNTH", nota: 70, priceUsd: 1, changePct: 12,
    volumeUsd: 2000000, liquidityUsd: 5000000, marketCapUsd: 50000000, holders: 5000, buyShare: 0.6, txs: 800, top10Pct: 30, devPct: 2, bundlePct: 3, riskLevel: 1, riskFlags: [], wallets: 4, walletsUsd: 9000, soldPct: 10 };
  const calm: TimingFacts = { bars: 48, lastClose: 1, rangePos: 0.5, aboveMeanPct: 0, rsi: 50, ret4hPct: 1, ret24hPct: 5, runUpPct: 10, drawFromHighPct: 5, atrPct: 2, volExpansion: 1, sigmaHourPct: 2 };
  const book: Book = { observedAtMs: now - 1000, positions: [], cashByChain: { "501": 1000 }, totalUsd: 1000, agentUsd: 1000 };
  const lines: string[] = [];
  const consultations: ConsultRecord[] = [];
  const runner = createCycleRunner({
    state: runState("sombra"),
    ledger: createAgentLedger({ read: () => lines, append: line => void lines.push(line) }),
    budget: createBudget({ limits: DEFAULT_LIMITS, now: () => now, load: () => null, persist: () => {} }),
    scoreboard: createScoreboard({ read: () => [], append: () => {} }),
    plans: createPlanStore({ read: () => null, write: () => {} }),
    model: { name: "synthetic_fixture", estimateTokens: () => 1000, async choose({ candidates }) {
      return { raw: { posture: "defensiva", stances: Object.fromEntries(candidates.map(c => [c.id, "buy_full"])),
        profiles: Object.fromEntries(candidates.map(c => [c.id, c.profiles[0]!] )) }, usage: { inputTokens: 900, outputTokens: 60 } };
    } },
    executor: { execute: async () => { throw new Error("synthetic_executor_must_not_run"); } },
    now: () => now, newId: () => "synthetic-posture-trace", stopFilePresent: () => false, clockSkewMs: () => 0,
    readBook: async () => book, holdingFacts: async () => () => null, timingOf: async () => calm,
    ecosystem: async saldo => ({ observedAtMs: now, saldo, candidates: [candidateOf(facts, saldo)], excluded: {} }),
    context: () => null, history: () => null, riskPct: () => 0.02, reserveShare: () => 0.1,
    caps: DEFAULT_CAPS, limitedFacts: async () => null, minBuyUsd: () => 0, refreshMs: 3600000,
    timeouts: { modelMs: 1000, readMs: 1000, orderMs: 1000 }, onConsult: row => consultations.push(row),
  });
  const result = await runner.run();
  const id = `buy:${facts.candidateId}`;
  expect(result.stances[id]).toBe("buy_full");
  expect(consultations).toHaveLength(1);
  expect(consultations[0]!.requested[id]).toBe("buy_full");
  expect(consultations[0]!.stances[id]).toBe(result.stances[id]!);
  expect(auditConsult(consultations[0])!.candidates[0]!.source).toBe("model_choice");
  expect(consultations[0]!.notes).not.toContain("postura_limitou");
  const captured = captureAgentConsult(consultations[0], { firstObservedAtMs: now + 1000 });
  expect(captured.ok).toBe(true);
  if (!captured.ok) return;
  expect(captured.capture.episodes[0]).toMatchObject({ candidateId: id, assetKey: facts.candidateId, requested: "buy_full", applied: "buy_full", experience: null });
  expect(captured.capture.decisionAtMs).toBeNull();
});
