import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGGRESSIVE_MANDATE, OWNER_AUTHORIZATIONS, deriveSettings, effectiveIntervalMin, HOT_INTERVAL_MIN, hotWithinQuota, INTERVAL_MIN, OWNER_PROFILE, RESERVE_SHARE, RISK_PCT, type AutopilotFacts } from "./autopilot";
import type { AgentConfig } from "./config";
import { DEFAULT_CONFIG } from "./config";
import { DEFAULT_CAPS, validateCaps } from "./gate";
import { createMandateStore, DEFAULT_MANDATE, mandateFileStore, parseMandate, stepToward, type Mandate } from "./mandate";

/** The settings with the mandate the MODEL chose and no profile of the owner over it. */
const derive = (config: AgentConfig, f: AutopilotFacts, m: Mandate) => deriveSettings(config, f, m, "livre");
const facts = (over: Partial<AutopilotFacts> = {}): AutopilotFacts => ({ capitalUsd: 1000, policy: null, evidenceOk: false, ...over });
const mandate = (over: Partial<Mandate> = {}): Mandate => ({ ...DEFAULT_MANDATE, ...over });

describe("the settings are worked out, never typed", () => {
  test("from what the wallet is worth and the mandate in force", () => {
    const s = derive(DEFAULT_CONFIG, facts({ capitalUsd: 1000 }), mandate());
    // no ceiling: the owner's decision of 2026-10-14
    expect(s.caps).toEqual({ maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null });
    expect(s.riskPct).toBe(RISK_PCT.moderado);
    expect(s.reserveShare).toBe(RESERVE_SHARE.media);
    expect(s.intervalMin).toBe(INTERVAL_MIN.normal);
    expect(s.chains).toEqual(DEFAULT_CONFIG.chains);
    expect(s.source).toEqual({ caps: "sem_teto", riskPct: "automatico", reserveShare: "automatico", rhythm: "automatico", chains: "automatico" });
  });

  test("a bigger wallet does not get a ceiling and a smaller one does not get a floor: the caps are the same whatever the wallet is worth", () => {
    for (const capital of [null, 0, -5, Number.NaN, 12, 80, 200, 1000, 5_000_000]) {
      const s = derive(DEFAULT_CONFIG, facts({ capitalUsd: capital, evidenceOk: true }), mandate({ concentration: "grande", risk: "agressivo" }));
      expect(s.caps).toEqual(DEFAULT_CAPS);
      expect(s.source.caps).toBe("sem_teto");
      expect(() => validateCaps(s.caps)).not.toThrow();
    }
  });

  test("the caps are null whatever the mandate asks, and they survive JSON as no ceiling", () => {
    for (const risk of ["cauteloso", "moderado", "agressivo"] as const) {
      for (const concentration of ["pequena", "media", "grande"] as const) {
        const s = derive(DEFAULT_CONFIG, facts({ capitalUsd: 1000, evidenceOk: true }), mandate({ risk, concentration }));
        expect(JSON.parse(JSON.stringify(s.caps))).toEqual({ maxBuyUsd: null, maxDailyBuyUsd: null, maxDailySellUsd: null });
      }
    }
  });
});

describe("the aggressive stance has to be earned by the measurement", () => {
  test("asked for without the measured edge, the moderate one is taken, and the reason is shown", () => {
    const s = derive(DEFAULT_CONFIG, facts({ evidenceOk: false }), mandate({ risk: "agressivo" }));
    expect(s.riskTaken).toBe("moderado");
    expect(s.riskPct).toBe(RISK_PCT.moderado);
    expect(s.source.riskPct).toBe("limitado_pela_evidencia");
  });

  test("with the measured edge it is honoured", () => {
    const s = derive(DEFAULT_CONFIG, facts({ evidenceOk: true }), mandate({ risk: "agressivo" }));
    expect(s.riskTaken).toBe("agressivo");
    expect(s.riskPct).toBe(RISK_PCT.agressivo);
    expect(s.source.riskPct).toBe("automatico");
  });

  test("a careful stance never needs the evidence", () => {
    expect(derive(DEFAULT_CONFIG, facts(), mandate({ risk: "cauteloso" })).riskPct).toBe(RISK_PCT.cauteloso);
  });
});

describe("the owner's own policy in the portal is the provider's restriction, not a cap of this app", () => {
  test("a policy with limits does not turn into a ceiling of the app: the caps stay null, and the wallet enforces the policy by itself", () => {
    const s = derive(DEFAULT_CONFIG, facts({ capitalUsd: 5000, policy: { perTxUsd: 30, dailyTradeUsd: 120, dailyTransferUsd: 0, transferGuarded: true } }), mandate({ concentration: "grande" }));
    expect(s.caps).toEqual(DEFAULT_CAPS);
    expect(s.source.caps).toBe("sem_teto");
  });

  test("a policy with a number that is not a number changes nothing", () => {
    const s = derive(DEFAULT_CONFIG, facts({ policy: { perTxUsd: Number.NaN, dailyTradeUsd: null, dailyTransferUsd: 0, transferGuarded: true } }), mandate());
    expect(s.caps).toEqual(DEFAULT_CAPS);
  });
});

describe("the rhythm follows how soon the model wants to look again", () => {
  test("rapido, normal and calmo", () => {
    expect(derive(DEFAULT_CONFIG, facts(), mandate({ look: "rapido" })).intervalMin).toBe(5);
    expect(derive(DEFAULT_CONFIG, facts(), mandate({ look: "normal" })).intervalMin).toBe(10);
    expect(derive(DEFAULT_CONFIG, facts(), mandate({ look: "calmo" })).intervalMin).toBe(20);
    expect(derive(DEFAULT_CONFIG, facts(), mandate({ look: "calmo" })).refreshMin).toBeGreaterThan(derive(DEFAULT_CONFIG, facts(), mandate({ look: "rapido" })).refreshMin);
  });
});

describe("a configuration that was set to manual through the API keeps its own values", () => {
  test("nothing is derived", () => {
    const config = { ...DEFAULT_CONFIG, auto: false, caps: { maxBuyUsd: 17, maxDailyBuyUsd: 40, maxDailySellUsd: null }, riskPct: 0.03, intervalMin: 30 };
    const s = derive(config, facts(), mandate({ risk: "agressivo" }));
    expect(s.caps).toEqual(config.caps);
    expect(s.riskPct).toBe(0.03);
    expect(s.intervalMin).toBe(30);
    expect(s.source.caps).toBe("manual");
  });
});

describe("the mandate", () => {
  test("is made of the options offered and nothing else", () => {
    expect(parseMandate({ risk: "moderado", reserve: "media", concentration: "media", look: "normal" })).toEqual(DEFAULT_MANDATE);
    expect(parseMandate({ risk: "louco", reserve: "media", concentration: "media", look: "normal" })).toBeNull();
    expect(parseMandate({ risk: "moderado", reserve: "media", concentration: "media" })).toBeNull();
    expect(parseMandate({ risk: "moderado", reserve: "media", concentration: "media", look: "normal", amount: 5 })).toBeNull();
    expect(parseMandate(null)).toBeNull();
    expect(parseMandate([])).toBeNull();
  });

  test("moves one step per choice toward what the model wants", () => {
    const wanted = mandate({ risk: "agressivo", reserve: "baixa", concentration: "grande", look: "rapido" });
    expect(stepToward(DEFAULT_MANDATE, wanted)).toEqual({ risk: "agressivo", reserve: "baixa", concentration: "grande", look: "rapido" });
    const careful = mandate({ risk: "cauteloso", reserve: "baixa", concentration: "pequena", look: "calmo" });
    const from = mandate({ risk: "agressivo", reserve: "alta", concentration: "grande", look: "rapido" });
    const first = stepToward(from, careful);
    expect(first).toEqual({ risk: "moderado", reserve: "media", concentration: "media", look: "normal" });
    expect(stepToward(first, careful)).toEqual(careful);
    // already there, or asking for what it has: nothing moves
    expect(stepToward(DEFAULT_MANDATE, DEFAULT_MANDATE)).toEqual(DEFAULT_MANDATE);
  });

  test("a swing from careful to aggressive takes two answers, not one", () => {
    const store = createMandateStore({ read: () => null, write: () => {} });
    store.apply(mandate({ risk: "cauteloso" }), 1);
    expect(store.get().mandate.risk).toBe("cauteloso");
    store.apply(mandate({ risk: "agressivo" }), 2);
    expect(store.get().mandate.risk).toBe("moderado");
    store.apply(mandate({ risk: "agressivo" }), 3);
    expect(store.get().mandate.risk).toBe("agressivo");
    expect(store.get().changedAtMs).toBe(3);
  });

  test("an answer that changes nothing writes nothing; one that cannot be saved changes nothing", () => {
    const writes: unknown[] = [];
    const store = createMandateStore({ read: () => null, write: (v) => void writes.push(v) });
    store.apply(DEFAULT_MANDATE, 5);
    expect(writes).toHaveLength(0);
    expect(store.get().changedAtMs).toBeNull();
    const broken = createMandateStore({ read: () => null, write: () => { throw new Error("disk"); } });
    broken.apply(mandate({ risk: "cauteloso" }), 5);
    expect(broken.get().mandate).toEqual(DEFAULT_MANDATE);
  });

  test("a file that cannot be read is the starting mandate, said as unhealthy, never a guess", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-mandate-"));
    try {
      const path = join(dir, "mandate.json");
      writeFileSync(path, JSON.stringify({ version: 1, mandate: { risk: "louco" }, changedAtMs: 1 }));
      const bad = createMandateStore(mandateFileStore(path));
      expect(bad.get().mandate).toEqual(DEFAULT_MANDATE);
      expect(bad.health().ok).toBe(false);
      const good = createMandateStore(mandateFileStore(join(dir, "sub", "m.json")));
      good.apply(mandate({ look: "calmo" }), 9);
      expect(JSON.parse(readFileSync(join(dir, "sub", "m.json"), "utf8"))).toEqual({ version: 1, mandate: { ...DEFAULT_MANDATE, look: "calmo" }, changedAtMs: 9 });
      expect(createMandateStore(mandateFileStore(join(dir, "sub", "m.json"))).get().mandate.look).toBe("calmo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the owner's profile is arrojado: the agent does not wait to be measured to take the risk, and the model's caution does not lower it", () => {
  const cautious = mandate({ risk: "cauteloso", reserve: "alta", concentration: "pequena", look: "calmo" });

  test("the profile is the owner's, recorded: arrojado, with the mandate it means", () => {
    expect(OWNER_PROFILE).toBe("arrojado");
    expect(AGGRESSIVE_MANDATE).toEqual({ risk: "agressivo", reserve: "baixa", concentration: "grande", look: "rapido" });
  });

  test("whatever mandate the model chose, the one in force is the aggressive one, with the risk taken and its numbers", () => {
    const s = deriveSettings(DEFAULT_CONFIG, facts({ capitalUsd: 1000, evidenceOk: false }), cautious);
    expect(s.mandate).toEqual(AGGRESSIVE_MANDATE);
    expect(s.riskTaken).toBe("agressivo");
    expect(s.riskPct).toBe(RISK_PCT.agressivo);
    expect(s.reserveShare).toBe(RESERVE_SHARE.baixa);
    expect(s.intervalMin).toBe(INTERVAL_MIN.rapido);
    expect(s.caps).toEqual(DEFAULT_CAPS);
    expect(s.source.riskPct).toBe("perfil_do_dono");
  });

  test("the owner's decision of 2026-10-14 holds for every profile, wallet and policy: there are no ceilings, and the portal's policy is not turned into one", () => {
    for (const profile of ["arrojado", "livre"] as const) {
      for (const capital of [121, 5000, 5_000_000]) {
        const limited = deriveSettings(DEFAULT_CONFIG, facts({ capitalUsd: capital, policy: { perTxUsd: 30, dailyTradeUsd: 150, dailyTransferUsd: 0, transferGuarded: true } }), cautious, profile);
        expect(limited.caps).toEqual(DEFAULT_CAPS);
        expect(limited.source.caps).toBe("sem_teto");
      }
    }
  });

  test("with the profile free, the mandate of the model is what counts, as before", () => {
    const s = deriveSettings(DEFAULT_CONFIG, facts({ capitalUsd: 1000 }), cautious, "livre");
    expect(s.mandate).toEqual(cautious);
    expect(s.riskTaken).toBe("cauteloso");
    expect(s.source.riskPct).toBe("automatico");
  });

  test("a configuration marked as manual keeps its own values, whatever the profile", () => {
    const manual = { ...DEFAULT_CONFIG, auto: false, riskPct: 0.03 };
    const s = deriveSettings(manual, facts(), cautious);
    expect(s.riskPct).toBe(0.03);
    expect(s.source.riskPct).toBe("manual");
  });
});

describe("the agent looks more often while the market has something to offer", () => {
  test("hot, the interval is the shorter of the rhythm and two minutes; not hot, the rhythm", () => {
    expect(HOT_INTERVAL_MIN).toBe(2);
    expect(effectiveIntervalMin(5, true)).toBe(2);
    expect(effectiveIntervalMin(10, true)).toBe(2);
    expect(effectiveIntervalMin(5, false)).toBe(5);
    expect(effectiveIntervalMin(1, true)).toBe(1);
    // an interval that is not a number is not made one by the heat
    expect(Number.isNaN(effectiveIntervalMin(Number.NaN, true))).toBe(true);
  });
});

describe("the quick rhythm lasts only while the day's quota of the data provider can pay for it", () => {
  const DAY = 24 * 3_600_000;
  /** Noon on a 31-day month (UTC): half of the day has passed. */
  const NOON = Date.UTC(2026, 9, 14, 12, 0, 0);
  const tier = (today: number, cap: number | null = 100_000) => ({ today, cap });
  const hot = (basic: number, premium = 0, nowMs = NOON) => hotWithinQuota({ basic: tier(basic), premium: tier(premium) }, nowMs);

  test("under the fair burn of the day the market may be looked at often", () => {
    // the pace limit of the provider is one and a half times the monthly average: 4838 a day, and half of the day gives 2419; a quarter more of head start
    expect(hot(0)).toBe(true);
    expect(hot(2400)).toBe(true);
    expect(hot(3000)).toBe(true);
  });

  test("past the fair burn of the day, or near the pace limit, the quick rhythm gives way to the normal one: the quota must last until midnight", () => {
    expect(hot(3200)).toBe(false);
    expect(hot(4500)).toBe(false);
    // the busiest tier decides
    expect(hot(100, 3200)).toBe(false);
    // early in the day the same use is already too much, and late in the day there is more room
    expect(hotWithinQuota({ basic: tier(1500), premium: tier(0) }, Date.UTC(2026, 9, 14, 3, 0, 0))).toBe(false);
    expect(hotWithinQuota({ basic: tier(3500), premium: tier(0) }, Date.UTC(2026, 9, 14, 20, 0, 0))).toBe(true);
    // the whole allowance spent is never hot, at any hour
    expect(hotWithinQuota({ basic: tier(4839), premium: tier(0) }, Date.UTC(2026, 9, 14, 23, 59, 0))).toBe(false);
  });

  test("no cap known is no limit to respect, and a use that is not a number is not trusted", () => {
    expect(hotWithinQuota({ basic: tier(900_000, null), premium: tier(900_000, null) }, NOON)).toBe(true);
    expect(hotWithinQuota({ basic: tier(Number.NaN), premium: tier(0) }, NOON)).toBe(false);
    expect(DAY).toBe(86_400_000);
  });
});

describe("what the owner authorized", () => {
  test("financial leverage is authorized by the owner (the chat of 2026-10-14), and there is no instrument to use it yet: an authorization is not a capability, and the record says both", () => {
    expect(OWNER_AUTHORIZATIONS.leverage).toEqual({ granted: true, since: "2026-10-14", instruments: [] });
    expect(JSON.parse(JSON.stringify(OWNER_AUTHORIZATIONS))).toEqual(OWNER_AUTHORIZATIONS);
  });
});
