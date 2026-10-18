import { expect, test } from "bun:test";
import { createScheduler } from "../agent/scheduler";
import type { AgentConfig } from "../agent/config";
import type { CycleReport } from "../agent/cycle";

test("an event cycle replaces the scheduled timer rather than creating a second permanent timer chain", async () => {
  let now = 0, nextId = 0;
  const pending = new Map<number, { due: number; fn: () => void }>();
  const report: CycleReport = { cycleId: "synthetic-event", atMs: 0, durationMs: 0, mode: "sombra", outcome: "mantido", reason: null, consulted: true, modelo: "synthetic", usage: null, posture: "neutra", stances: {}, profiles: {}, orders: [], dropped: [], considered: { holdings: 0, buys: 0, protected: 0 }, notes: [] };
  const scheduler = createScheduler({
    state: { get: () => ({ mode: "sombra", stopped: false }) }, config: () => ({ intervalMin: 5 } as AgentConfig), now: () => now,
    schedule: (ms, fn) => { const id = ++nextId; pending.set(id, { due: now + ms, fn }); return () => { pending.delete(id); }; },
    runner: { run: async () => report, last: () => null, running: () => false },
  });
  scheduler.start();
  expect([...pending.values()].map(t => t.due)).toEqual([300_000]);
  now = 60_000;
  expect(await scheduler.requestCycle()).toBe(true);
  expect([...pending.values()].map(t => t.due)).toEqual([360_000]);
  scheduler.stop();
  expect(pending.size).toBe(0);
});
