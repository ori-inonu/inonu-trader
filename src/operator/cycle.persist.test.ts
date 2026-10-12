import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syntheticInventory } from "../okx-wallet/portfolio";
import { persistCycle } from "./cycle";
import type { OperatorCycle } from "./types";

const NOW = 1_760_000_000_000;

function cycleWith(cycleId: string): OperatorCycle {
  return {
    cycleId, startedAtMs: NOW, completedAtMs: NOW + 1, inventory: syntheticInventory(NOW), candidates: [], verdicts: [], eligibleIds: [],
    decision: null, plan: null, execution: { status: "blocked", reasons: ["no_eligible_candidate"], txHash: null, orderId: null },
    inferenceUsd: 0, warnings: [], ledger: null,
  };
}

// Files only in the system temp directory; the dashboard reading latest.json is what holds it open in production.
function withFiles(run: (paths: { dir: string; state: string; journal: string; tmp: string }) => void) {
  const dir = mkdtempSync(join(tmpdir(), "inonu-persist-cycle-"));
  const state = join(dir, "latest.json");
  try {
    run({ dir, state, journal: join(dir, "cycles.jsonl"), tmp: `${state}.${process.pid}.tmp` });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const journalLines = (path: string) => readFileSync(path, "utf8").trim().split("\n");

test("two transient Windows EPERM on the state swap are retried: three attempts, waits 10 and 20, new latest.json, one journal line (R8 N9)", () => {
  withFiles(({ state, journal, tmp }) => {
    writeFileSync(state, JSON.stringify({ cycleId: "old" }));
    const waits: number[] = [];
    const sources: string[] = [];
    persistCycle(cycleWith("new"), state, journal, {
      platform: "win32",
      wait(ms) { waits.push(ms); },
      rename(source, destination) {
        sources.push(String(source));
        if (sources.length <= 2) throw Object.assign(new Error("synthetic retained reader"), { code: "EPERM" });
        renameSync(source, destination);
      },
    });
    expect(sources).toHaveLength(3);
    expect(new Set(sources).size).toBe(1);
    expect(waits).toEqual([10, 20]);
    expect(JSON.parse(readFileSync(state, "utf8")).cycleId).toBe("new");
    expect(journalLines(journal)).toHaveLength(1);
    expect(JSON.parse(journalLines(journal)[0]!).cycleId).toBe("new");
    expect(existsSync(tmp)).toBe(false);
  });
});

for (const code of ["EPERM", "EBUSY", "EACCES"]) {
  test(`a persistent Windows ${code} throws after four attempts, leaves the previous latest.json intact and still journals the cycle`, () => {
    withFiles(({ state, journal }) => {
      writeFileSync(state, JSON.stringify({ cycleId: "old" }));
      const before = readFileSync(state);
      const error = Object.assign(new Error(`synthetic ${code}`), { code });
      const waits: number[] = [];
      let attempts = 0;
      let journalAtFirstAttempt: string[] | null = null;
      let observed: unknown;
      try {
        persistCycle(cycleWith("new"), state, journal, {
          platform: "win32",
          wait(ms) { waits.push(ms); },
          rename() {
            if (attempts++ === 0) journalAtFirstAttempt = existsSync(journal) ? journalLines(journal) : null;
            throw error;
          },
        });
      } catch (caught) { observed = caught; }
      expect(observed).toBe(error);
      expect(attempts).toBe(4);
      expect(waits).toEqual([10, 20, 40]);
      expect(readFileSync(state)).toEqual(before);
      // The history line is written before the state swap is attempted, so the failure cannot lose it.
      expect(journalAtFirstAttempt).not.toBeNull();
      expect(journalAtFirstAttempt).toHaveLength(1);
      expect(journalLines(journal)).toHaveLength(1);
      expect(JSON.parse(journalLines(journal)[0]!).cycleId).toBe("new");
    });
  });
}

for (const [platform, code] of [["linux", "EPERM"], ["darwin", "EACCES"], ["win32", "EIO"], ["win32", undefined]] as const) {
  test(`${platform} ${code ?? "uncoded"} state swap errors propagate on the first attempt without waiting`, () => {
    withFiles(({ state, journal }) => {
      writeFileSync(state, JSON.stringify({ cycleId: "old" }));
      const before = readFileSync(state);
      const error = Object.assign(new Error("synthetic nonretryable"), { code });
      const waits: number[] = [];
      let attempts = 0;
      let observed: unknown;
      try {
        persistCycle(cycleWith("new"), state, journal, { platform, wait(ms) { waits.push(ms); }, rename() { attempts++; throw error; } });
      } catch (caught) { observed = caught; }
      expect(observed).toBe(error);
      expect(attempts).toBe(1);
      expect(waits).toEqual([]);
      expect(readFileSync(state)).toEqual(before);
      expect(journalLines(journal)).toHaveLength(1);
    });
  });
}

test("without options the cycle is persisted as before: nested directories created, state replaced, journal appended, address shortened", () => {
  withFiles(({ dir, tmp }) => {
    const state = join(dir, "nested", "latest.json");
    const journal = join(dir, "other", "cycles.jsonl");
    persistCycle(cycleWith("first"), state, journal);
    persistCycle(cycleWith("second"), state, journal);
    expect(JSON.parse(readFileSync(state, "utf8")).cycleId).toBe("second");
    expect(journalLines(journal).map((line) => JSON.parse(line).cycleId)).toEqual(["first", "second"]);
    expect(JSON.parse(readFileSync(state, "utf8")).inventory.address).toContain("...");
    expect(existsSync(`${state}.${process.pid}.tmp`)).toBe(false);
    expect(existsSync(tmp)).toBe(false);
  });
});
