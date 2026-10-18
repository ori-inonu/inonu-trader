import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBudget } from "./budget";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "jev-onchain-budget-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const T0 = Date.UTC(2026, 9, 12, 12, 0, 0); // 2026-10-12T12:00Z

describe("onchain budget", () => {
  test("records per tier and persists across instances on flush", () => {
    const dir = tempDir();
    let t = T0;
    const caps = () => ({ basic: 50_000, premium: 50_000 });
    const b1 = createBudget({ dir, now: () => t, caps });
    b1.record("basic");
    b1.record("basic");
    b1.record("free");
    b1.record("premium");
    b1.flush();
    expect(existsSync(join(dir, "onchain", "usage-2026-10.json"))).toBe(true);
    const file = JSON.parse(readFileSync(join(dir, "onchain", "usage-2026-10.json"), "utf8"));
    expect(file.days["12"]).toEqual({ free: 1, basic: 2, premium: 1 });

    // a second instance over the same directory sees the persisted month
    const b2 = createBudget({ dir, now: () => t, caps });
    const snap = b2.snapshot();
    expect(snap.month).toBe("2026-10");
    expect(snap.tiers.basic.used).toBe(2);
    expect(snap.tiers.free.used).toBe(1);
    expect(snap.tiers.premium.today).toBe(1);
  });
  test("keeps recorded usage in memory when the persistence directory is a file", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "onchain"), "not a directory");
    const budget = createBudget({ dir, now: () => T0, caps: () => ({ basic: 50_000, premium: 50_000 }) });

    expect(() => budget.record("basic")).not.toThrow();
    expect(() => budget.flush()).not.toThrow();

    const snapshot = budget.snapshot();
    expect(snapshot.tiers.basic.used).toBe(1);
    expect(snapshot.tiers.basic.today).toBe(1);
  });


  test("month rollover restarts the counter and writes a new file", () => {
    const dir = tempDir();
    let t = T0;
    const b = createBudget({ dir, now: () => t, caps: () => ({ basic: 10, premium: 10 }) });
    b.record("basic");
    b.flush();
    t = Date.UTC(2026, 10, 1, 0, 30, 0); // November 1st UTC
    expect(b.snapshot().month).toBe("2026-11");
    expect(b.snapshot().tiers.basic.used).toBe(0);
    b.record("basic");
    b.flush();
    expect(existsSync(join(dir, "onchain", "usage-2026-10.json"))).toBe(true);
    expect(existsSync(join(dir, "onchain", "usage-2026-11.json"))).toBe(true);
    expect(b.snapshot().tiers.basic.used).toBe(1);
  });

  test("reserve blocks above the cap, paces background at 1.5x daily share, free never blocks", () => {
    const dir = tempDir();
    const t = T0;
    let cap = { basic: 10, premium: 10 };
    const b = createBudget({ dir, now: () => t, caps: () => cap });
    expect(b.reserve("free", "background").ok).toBe(true);
    // October has 31 days: pace limit = 1.5 * 10/31 = 0.48 -> first background call passes (today=0), then blocks
    expect(b.reserve("basic", "background").ok).toBe(true);
    b.record("basic");
    const paced = b.reserve("basic", "background");
    expect(paced).toEqual({ ok: false, reason: "pace_limited" });
    // but a user-initiated call still goes through
    expect(b.reserve("basic", "user").ok).toBe(true);
    // spend the rest of the month cap
    for (let i = 0; i < 9; i += 1) b.record("basic");
    expect(b.reserve("basic", "user")).toEqual({ ok: false, reason: "budget_exhausted" });
    // premium untouched, free still free
    expect(b.reserve("premium", "user").ok).toBe(true);
    expect(b.reserve("free", "background").ok).toBe(true);
  });

  test("cap follows the prefs getter live", () => {
    const dir = tempDir();
    const t = T0;
    let cap = 5;
    const b = createBudget({ dir, now: () => t, caps: () => ({ basic: cap, premium: 10 }) });
    for (let i = 0; i < 5; i += 1) b.record("basic");
    expect(b.reserve("basic", "user")).toEqual({ ok: false, reason: "budget_exhausted" });
    cap = 50;
    expect(b.reserve("basic", "user").ok).toBe(true);
  });

  test("a corrupt usage file restarts from zero and reports it", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "onchain"), { recursive: true });
    writeFileSync(join(dir, "onchain", "usage-2026-10.json"), "{ not json");
    const b = createBudget({ dir, now: () => T0, caps: () => ({ basic: 10, premium: 10 }) });
    const snap = b.snapshot();
    expect(snap.restartedFromCorruptFile).toBe(true);
    expect(snap.tiers.basic.used).toBe(0);
    expect(b.reserve("basic", "user").ok).toBe(true); // never throws
  });

  test("snapshot projects the month from elapsed days", () => {
    const dir = tempDir();
    const b = createBudget({ dir, now: () => T0, caps: () => ({ basic: 50_000, premium: 50_000 }) });
    for (let i = 0; i < 24; i += 1) b.record("basic");
    const snap = b.snapshot();
    // day 12 of a 31-day month: 24/12*31 = 62
    expect(snap.tiers.basic.projection).toBe(62);
    expect(snap.tiers.basic.cap).toBe(50_000);
    expect(snap.tiers.free.cap).toBeNull();
  });
});
