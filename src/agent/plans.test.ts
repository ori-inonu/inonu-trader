import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlanStore, offeredProfiles, planFileStore, planKey, planTriggers, PROFILES, protectiveStance, touchProbability, wildProfile, type PositionPlan } from "./plans";

const T0 = Date.UTC(2026, 9, 14, 12);
const HOUR = 3_600_000;
const plan = (over: Partial<PositionPlan> = {}): PositionPlan => ({
  key: planKey("1", "0x1111111111111111111111111111111111111111"),
  chainIndex: "1",
  address: "0x1111111111111111111111111111111111111111",
  symbol: "AAA",
  profile: "alvo_10",
  entryPriceUsd: 100,
  entryAtMs: T0,
  peakPriceUsd: 100,
  targetHit: false,
  trimmed: false,
  cycleId: "c1",
  ...over,
});

describe("how plausible a move is", () => {
  test("a move of one standard deviation of the horizon is touched about 32 percent of the time", () => {
    // sigma 1 percent an hour for 4 hours is 2 percent; the target is chosen so ln(1 + d) = 2 percent
    expect(touchProbability(100 * (Math.exp(0.02) - 1), 1, 4, "up")).toBeCloseTo(0.3173, 3);
  });

  test("the downside is measured in log terms as well", () => {
    expect(touchProbability(100 * (1 - Math.exp(-0.02)), 1, 4, "down")).toBeCloseTo(0.3173, 3);
  });

  test("further away is less likely, longer is more likely", () => {
    const near = touchProbability(5, 1, 12, "up")!;
    expect(touchProbability(10, 1, 12, "up")!).toBeLessThan(near);
    expect(touchProbability(5, 1, 48, "up")!).toBeGreaterThan(near);
  });

  test("garbage in is no probability, not a guess", () => {
    expect(touchProbability(5, 0, 12, "up")).toBeNull();
    expect(touchProbability(5, Number.NaN, 12, "up")).toBeNull();
    expect(touchProbability(-5, 1, 12, "up")).toBeNull();
    expect(touchProbability(5, 1, 0, "up")).toBeNull();
    expect(touchProbability(100, 1, 12, "down")).toBeNull();
  });
});

describe("the profiles offered to the model", () => {
  test("a quiet market can give none of the targets, and an unknown one offers none", () => {
    expect(offeredProfiles(0.1)).toEqual([]);
    expect(offeredProfiles(null)).toEqual([]);
    expect(offeredProfiles(Number.NaN)).toEqual([]);
  });

  test("a lively market offers them all", () => {
    expect(offeredProfiles(2)).toEqual(["alvo_5", "alvo_10", "alvo_20"]);
  });

  test("a calm, liquid token gets the small patient profile, and a lively one does not (its stop would be noise)", () => {
    expect(offeredProfiles(0.5)).toEqual(["alvo_2"]);
    expect(offeredProfiles(0.4)).toEqual(["alvo_2"]);
    expect(offeredProfiles(2)).not.toContain("alvo_2");
  });

  test("a market that moves a little over one percent an hour offers only the nearest target", () => {
    expect(offeredProfiles(1)).toEqual(["alvo_5"]);
  });

  test("a market so wild that any stop is noise offers none", () => {
    expect(offeredProfiles(4)).toEqual([]);
  });

  test("a wild market has one profile to be judged with, the widest, marked as extreme by the caller: a stop that noise may touch is a risk for the model to weigh, not a reason for the code to close the purchase", () => {
    expect(wildProfile(4)).toBe("alvo_20");
    expect(wildProfile(8)).toBe("alvo_20");
    // a market that already has profiles is not wild, a quiet one has no reachable target, and an unknown one has nothing to judge by
    expect(wildProfile(2)).toBeNull();
    expect(wildProfile(0.1)).toBeNull();
    expect(wildProfile(null)).toBeNull();
    expect(wildProfile(Number.NaN)).toBeNull();
    // and it is only given where the others are not
    for (const sigma of [0.3, 0.5, 1, 2, 3, 4, 6, 10, 20]) expect(offeredProfiles(sigma).length === 0 || wildProfile(sigma) === null).toBe(true);
  });

  test("the profiles are what the SPEC says: a target, a stop tighter than it, a trail and a horizon", () => {
    for (const p of Object.values(PROFILES)) {
      expect(p.stopPct).toBeLessThan(p.targetPct);
      expect(p.trailPct).toBeLessThan(p.targetPct);
      expect(p.horizonH).toBeGreaterThan(0);
    }
    expect(PROFILES.alvo_10.targetPct).toBe(10);
  });
});

describe("the plan of a position", () => {
  test("a quiet position raises no trigger", () => {
    expect(planTriggers(plan(), 101, T0 + 5 * HOUR)).toEqual([]);
  });

  test("the stop", () => {
    expect(planTriggers(plan(), 94, T0 + HOUR)).toEqual(["stop_atingido"]);
    expect(planTriggers(plan(), 94.01, T0 + HOUR)).toEqual([]);
  });

  test("the target", () => {
    expect(planTriggers(plan(), 110, T0 + HOUR)).toEqual(["alvo_atingido"]);
    expect(planTriggers(plan(), 109.99, T0 + HOUR)).toEqual([]);
  });

  test("the trailing stop only exists after the target was reached", () => {
    expect(planTriggers(plan({ peakPriceUsd: 120 }), 110, T0 + HOUR)).toEqual(["alvo_atingido"]);
    // half already taken: only the trailing stop is left to say anything
    const trimmed = plan({ peakPriceUsd: 120, targetHit: true, trimmed: true });
    expect(planTriggers(trimmed, 113.9, T0 + HOUR)).toEqual(["trailing_atingido"]);
    expect(planTriggers(trimmed, 114.1, T0 + HOUR)).toEqual([]);
    // half not taken yet: the target is still owed, and a retrace past the trail asks to leave entirely
    expect(planTriggers(plan({ peakPriceUsd: 120, targetHit: true }), 113.9, T0 + HOUR)).toEqual(["alvo_atingido", "trailing_atingido"]);
  });

  test("the time stop: out of time without having reached the target", () => {
    expect(planTriggers(plan(), 103, T0 + 36 * HOUR)).toEqual(["tempo_esgotado"]);
    expect(planTriggers(plan(), 103, T0 + 36 * HOUR - 1)).toEqual([]);
    expect(planTriggers(plan({ targetHit: true, trimmed: true, peakPriceUsd: 112 }), 111, T0 + 40 * HOUR)).toEqual([]);
    // but nothing is held forever: twice the horizon is the end
    expect(planTriggers(plan({ targetHit: true, trimmed: true, peakPriceUsd: 112 }), 111, T0 + 72 * HOUR)).toEqual(["tempo_esgotado"]);
  });

  test("an unknown price raises nothing about the price, but time does not need one", () => {
    expect(planTriggers(plan(), null, T0 + HOUR)).toEqual([]);
    expect(planTriggers(plan(), null, T0 + 100 * HOUR)).toEqual(["tempo_esgotado"]);
    expect(planTriggers(plan({ targetHit: true, trimmed: true }), null, T0 + 40 * HOUR)).toEqual([]);
  });

  test("the fill price replaces the estimated entry, until the target has been reached", () => {
    const store = createPlanStore({ read: () => null, write: () => {} });
    store.open(plan());
    store.reprice(plan().key, 104);
    expect(store.get(plan().key)).toMatchObject({ entryPriceUsd: 104, peakPriceUsd: 104 });
    store.reprice(plan().key, Number.NaN);
    store.reprice(plan().key, -3);
    expect(store.get(plan().key)?.entryPriceUsd).toBe(104);
    store.observe(plan().key, 200, T0);
    store.reprice(plan().key, 50);
    expect(store.get(plan().key)?.entryPriceUsd).toBe(104);
  });

  test("protection: losses and expired time leave entirely, the target takes half once", () => {
    expect(protectiveStance(["stop_atingido"], false)).toBe("exit_all");
    expect(protectiveStance(["trailing_atingido"], false)).toBe("exit_all");
    expect(protectiveStance(["tempo_esgotado"], false)).toBe("exit_all");
    expect(protectiveStance(["alvo_atingido"], false)).toBe("trim_half");
    expect(protectiveStance(["alvo_atingido"], true)).toBeNull();
    expect(protectiveStance(["alvo_atingido", "stop_atingido"], false)).toBe("exit_all");
    expect(protectiveStance([], false)).toBeNull();
  });
});

describe("the store of plans", () => {
  const memory = (initial: unknown = null) => {
    let saved: unknown = initial;
    return { saved: () => saved, io: { read: () => saved, write: (v: unknown) => void (saved = v) } };
  };

  test("a plan is opened once, observed, and closed", () => {
    const m = memory();
    const store = createPlanStore(m.io);
    expect(store.health()).toEqual({ ok: true });
    expect(store.open(plan())).toBe(true);
    expect(store.open(plan({ entryPriceUsd: 50 }))).toBe(false);
    expect(store.get(plan().key)?.entryPriceUsd).toBe(100);
    store.observe(plan().key, 120, T0 + HOUR);
    expect(store.get(plan().key)).toMatchObject({ peakPriceUsd: 120, targetHit: true });
    store.observe(plan().key, 111, T0 + 2 * HOUR);
    expect(store.get(plan().key)).toMatchObject({ peakPriceUsd: 120, targetHit: true });
    store.markTrimmed(plan().key);
    expect(store.get(plan().key)!.trimmed).toBe(true);
    store.close(plan().key);
    expect(store.get(plan().key)).toBeUndefined();
  });

  test("a new process sees the plans of the old one", () => {
    const m = memory();
    createPlanStore(m.io).open(plan());
    expect(createPlanStore(m.io).get(plan().key)?.profile).toBe("alvo_10");
  });

  test("a plan that cannot be saved is refused, so no position exists without its stop", () => {
    const store = createPlanStore({
      read: () => null,
      write: () => {
        throw new Error("disk");
      },
    });
    expect(store.open(plan())).toBe(false);
    expect(store.get(plan().key)).toBeUndefined();
  });

  test("a file that cannot be trusted makes the store unhealthy", () => {
    expect(createPlanStore(memory({ junk: true }).io).health()).toEqual({ ok: false, reason: "planos_ilegiveis" });
    expect(createPlanStore(memory({ version: 1, plans: { x: { nope: 1 } } }).io).health().ok).toBe(false);
    expect(createPlanStore({ read: () => { throw new Error("io"); }, write: () => {} }).health().ok).toBe(false);
  });

  test("the file store round-trips and an unreadable file is unhealthy", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-plans-"));
    try {
      const path = join(dir, "x", "plans.json");
      expect(createPlanStore(planFileStore(path)).open(plan())).toBe(true);
      expect(createPlanStore(planFileStore(path)).get(plan().key)?.symbol).toBe("AAA");
      writeFileSync(path, "{broken");
      expect(createPlanStore(planFileStore(path)).health().ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the key is the network and the lower-cased address, except on Solana", () => {
    expect(planKey("1", "0xABCDEFabcdef0123456789ABCDEFabcdef012345")).toBe("1:0xabcdefabcdef0123456789abcdefabcdef012345");
    expect(planKey("501", "So11111111111111111111111111111111111111112")).toBe("501:So11111111111111111111111111111111111111112");
  });
});
