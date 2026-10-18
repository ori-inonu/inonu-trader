import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACKNOWLEDGEMENT_TERM,
  AUTHORIZATION_FIELD_ORDER,
  AUTHORIZATION_POLICY,
  buildAuthorizationRecord,
  defaultConfigCapsDraft,
  emptyAuthorizationDraft,
  evaluateAuthorization,
  localDateTimeToIso,
  parseAuthorizationDraft,
  parseConfigCapsDraft,
  parseIsoTimestamp,
  type AuthorizationInput,
  type ConfigCaps,
  type RuleResult,
} from "./authorization-record";

// Mirrors the rules of src/live-qualification.ts (items authorization.*) and docs/LIVE-QUALIFICATION.md section 7.
// The page is local only: generating a record authorizes nothing and the acknowledgement is never prefilled.

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0); // 2026-10-11T12:00:00Z
const HOUR = 3_600_000;

const CAPS: ConfigCaps = {
  bankrollUsd: 100,
  maxLossUsd: 2,
  maxSpendUsd: 1,
  tradeSizeMon: 200,
  maxPositionMon: 1000,
  maxCapitalFraction: 0.25,
  jevModelId: "jev-1.13.0",
};

const FIXTURE_ACK = "OWN_FUNDS_RISK: texto escrito para o teste, com mais de quarenta caracteres no total.";

const VALID: AuthorizationInput = {
  owner: "Pessoa de Teste",
  date: "2026-10-11T11:00:00Z",
  walletAddress: `0x${"ab".repeat(20)}`,
  maxLossUsd: 2,
  maxSpendUsd: 1,
  tradeSizeMon: 200,
  maxPositionMon: 1000,
  maxCapitalFraction: 0.25,
  sessionDurationMinutes: 30,
  allowedModelId: "jev-1.13.0",
  expiry: "2026-10-12T11:00:00Z",
  acknowledgement: FIXTURE_ACK,
};

const rule = (rules: RuleResult[], id: string): RuleResult => {
  const found = rules.find((entry) => entry.id === id);
  if (!found) throw new Error(`rule not found: ${id}`);
  return found;
};

const evaluate = (overrides: Partial<AuthorizationInput> = {}, caps: ConfigCaps = CAPS, nowMs = NOW) =>
  evaluateAuthorization({ ...VALID, ...overrides }, caps, nowMs);

describe("schema compatibility with the verifier", () => {
  test("field order and placeholders match the template in docs/LIVE-QUALIFICATION.md section 7", () => {
    const doc = readFileSync(resolve(import.meta.dir, "../../../../docs/LIVE-QUALIFICATION.md"), "utf8");
    const heading = doc.indexOf("### Modelo do registro (JSON)");
    expect(heading).toBeGreaterThan(-1);
    const fenceStart = doc.indexOf("```json", heading);
    const fenceEnd = doc.indexOf("```", fenceStart + 7);
    const template = JSON.parse(doc.slice(fenceStart + 7, fenceEnd)) as Record<string, unknown>;
    expect(Object.keys(template)).toEqual([...AUTHORIZATION_FIELD_ORDER]);

    const blank = evaluateAuthorization(parseAuthorizationDraft(emptyAuthorizationDraft()), parseConfigCapsDraft(defaultConfigCapsDraft()), NOW);
    expect(JSON.parse(blank.json)).toEqual(template);
    expect(Object.keys(JSON.parse(blank.json))).toEqual(Object.keys(template));
  });

  test("policy constants are the ones of DEFAULT_QUALIFICATION_POLICY", () => {
    expect(ACKNOWLEDGEMENT_TERM).toBe("OWN_FUNDS_RISK");
    expect(AUTHORIZATION_POLICY.maxAuthorizationValidityHours).toBe(168);
    expect(AUTHORIZATION_POLICY.maxSessionMinutes).toBe(60);
    expect(AUTHORIZATION_POLICY.maxLossFractionOfBankroll).toBe(0.05);
    expect(AUTHORIZATION_POLICY.maxSpendFractionOfBankroll).toBe(0.05);
    expect(AUTHORIZATION_POLICY.clockSkewToleranceMs).toBe(300_000);
    expect(AUTHORIZATION_POLICY.minAcknowledgementLength).toBe(40);
  });
});

describe("a valid record", () => {
  test("passes every rule and serializes with the template key order", () => {
    const result = buildAuthorizationRecord(VALID, CAPS, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.record)).toEqual([...AUTHORIZATION_FIELD_ORDER]);
    expect(result.record.schemaVersion).toBe(1);
    expect(result.record.owner).toBe("Pessoa de Teste");
    expect(result.record.acknowledgement).toBe(FIXTURE_ACK);
    expect(JSON.parse(result.json)).toEqual(result.record);
    expect(result.json).toBe(`${JSON.stringify(result.record, null, 2)}\n`);
    expect(result.rules.every((entry) => entry.status === "pass")).toBe(true);
  });

  test("evaluation reports the same verdict and counts", () => {
    const evaluation = evaluate();
    expect(evaluation.valid).toBe(true);
    expect(evaluation.counts.fail).toBe(0);
    expect(evaluation.counts.pending).toBe(0);
    expect(evaluation.counts.pass).toBe(evaluation.rules.length);
  });
});

describe("limits larger than the supplied caps are rejected", () => {
  const cases: Array<[keyof ConfigCaps & keyof AuthorizationInput, number]> = [
    ["maxLossUsd", 3],
    ["maxSpendUsd", 2],
    ["tradeSizeMon", 300],
    ["maxPositionMon", 1500],
    ["maxCapitalFraction", 0.5],
  ];
  for (const [field, value] of cases) {
    test(`${field} above the cap fails with exceeds-config:${field}`, () => {
      const result = buildAuthorizationRecord({ ...VALID, [field]: value }, CAPS, NOW);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const failing = rule(result.rules, "limits-within-config-caps");
      expect(failing.status).toBe("fail");
      expect(failing.codes).toContain(`exceeds-config:${field}`);
      expect(result.failures.map((entry) => entry.id)).toContain("limits-within-config-caps");
    });
  }

  test("several limits above the caps are all reported", () => {
    const evaluation = evaluate({ maxLossUsd: 3, maxPositionMon: 2000 });
    const failing = rule(evaluation.rules, "limits-within-config-caps");
    expect(failing.codes).toEqual(["exceeds-config:maxLossUsd", "exceeds-config:maxPositionMon"]);
  });

  test("limits equal to the caps pass", () => {
    expect(rule(evaluate().rules, "limits-within-config-caps").status).toBe("pass");
  });

  test("the configuration may not allow more than the record authorizes", () => {
    const evaluation = evaluate({ maxLossUsd: 1 });
    const failing = rule(evaluation.rules, "config-within-authorized-limits");
    expect(failing.status).toBe("fail");
    expect(failing.codes).toEqual(["config-exceeds:maxLossUsd"]);
    expect(evaluation.valid).toBe(false);
  });
});

describe("expiry rules", () => {
  test("an expiry in the past is rejected", () => {
    const result = buildAuthorizationRecord({ ...VALID, date: "2026-10-09T11:00:00Z", expiry: "2026-10-10T11:00:00Z" }, CAPS, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const failing = rule(result.rules, "expiry-not-expired");
    expect(failing.status).toBe("fail");
    expect(failing.codes).toEqual(["expired"]);
  });

  test("an expiry equal to now is already expired, one second later is accepted", () => {
    const atNow = evaluate({ date: "2026-10-11T11:00:00Z", expiry: "2026-10-11T12:00:00Z" });
    expect(rule(atNow.rules, "expiry-not-expired").status).toBe("fail");
    const later = evaluate({ date: "2026-10-11T11:00:00Z", expiry: "2026-10-11T12:00:01Z" });
    expect(rule(later.rules, "expiry-not-expired").status).toBe("pass");
  });

  test("an expiry before the date is rejected", () => {
    const evaluation = evaluate({ date: "2026-10-11T11:00:00Z", expiry: "2026-10-11T10:00:00Z" });
    expect(rule(evaluation.rules, "expiry-after-date").status).toBe("fail");
    expect(rule(evaluation.rules, "expiry-after-date").codes).toEqual(["expiry-before-date"]);
    expect(evaluation.valid).toBe(false);
  });

  test("validity is limited to 168 hours after the date", () => {
    const exactly = evaluate({ date: "2026-10-11T11:00:00Z", expiry: new Date(Date.UTC(2026, 9, 11, 11) + 168 * HOUR).toISOString() });
    expect(rule(exactly.rules, "validity-max-hours").status).toBe("pass");
    const over = evaluate({ date: "2026-10-11T11:00:00Z", expiry: new Date(Date.UTC(2026, 9, 11, 11) + 169 * HOUR).toISOString() });
    expect(rule(over.rules, "validity-max-hours").status).toBe("fail");
    expect(rule(over.rules, "validity-max-hours").codes).toEqual(["validity-too-long"]);
  });

  test("the date may be at most five minutes in the future", () => {
    const within = evaluate({ date: new Date(NOW + 300_000).toISOString(), expiry: "2026-10-12T11:00:00Z" });
    expect(rule(within.rules, "date-not-in-future").status).toBe("pass");
    const beyond = evaluate({ date: new Date(NOW + 300_001).toISOString(), expiry: "2026-10-12T11:00:00Z" });
    expect(rule(beyond.rules, "date-not-in-future").status).toBe("fail");
    expect(rule(beyond.rules, "date-not-in-future").codes).toEqual(["date-in-future"]);
  });
});

describe("field rules", () => {
  test("wallet must be 0x plus 40 hexadecimal characters and not the zero address", () => {
    const bad = [
      "",
      "0x",
      `0x${"ab".repeat(19)}`,
      `0x${"ab".repeat(21)}`,
      `0x${"zz".repeat(20)}`,
      `ab${"ab".repeat(20)}`,
      `0x${"0".repeat(40)}`,
      ` 0x${"ab".repeat(20)}x`,
    ];
    for (const wallet of bad) {
      const status = rule(evaluate({ walletAddress: wallet }).rules, "walletAddress").status;
      expect(status === "pass").toBe(false);
    }
    expect(rule(evaluate({ walletAddress: "" }).rules, "walletAddress").status).toBe("pending");
    expect(rule(evaluate({ walletAddress: `0x${"0".repeat(40)}` }).rules, "walletAddress").status).toBe("fail");
    expect(rule(evaluate({ walletAddress: `0x${"AB".repeat(20)}` }).rules, "walletAddress").status).toBe("pass");
  });

  test("numbers must be finite and positive, the fraction at most 1", () => {
    for (const field of ["maxLossUsd", "maxSpendUsd", "tradeSizeMon", "maxPositionMon", "sessionDurationMinutes"] as const) {
      for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(rule(evaluate({ [field]: value }).rules, field).status).toBe("fail");
      }
      expect(rule(evaluate({ [field]: null }).rules, field).status).toBe("pending");
    }
    for (const value of [0, -0.1, 1.01, Number.NaN]) {
      expect(rule(evaluate({ maxCapitalFraction: value }).rules, "maxCapitalFraction").status).toBe("fail");
    }
    expect(rule(evaluate({ maxCapitalFraction: 1 }, { ...CAPS, maxCapitalFraction: 1 }).rules, "maxCapitalFraction").status).toBe("pass");
  });

  test("trade size may not exceed the maximum position", () => {
    const evaluation = evaluate({ tradeSizeMon: 1001 }, { ...CAPS, tradeSizeMon: 1001 });
    const failing = rule(evaluation.rules, "trade-size-within-position");
    expect(failing.status).toBe("fail");
    expect(failing.codes).toEqual(["invalid:tradeSizeMon"]);
    expect(rule(evaluate({ tradeSizeMon: 1000 }, { ...CAPS, tradeSizeMon: 1000 }).rules, "trade-size-within-position").status).toBe("pass");
  });

  test("owner must be non empty text", () => {
    expect(rule(evaluate({ owner: "" }).rules, "owner").status).toBe("pending");
    expect(rule(evaluate({ owner: "   " }).rules, "owner").status).toBe("fail");
    expect(rule(evaluate({ owner: "  Pessoa  " }).rules, "owner").status).toBe("pass");
    const built = buildAuthorizationRecord({ ...VALID, owner: "  Pessoa  " }, CAPS, NOW);
    expect(built.ok && built.record.owner).toBe("Pessoa");
  });

  test("session duration is capped at 60 minutes by the sanity rule", () => {
    expect(rule(evaluate({ sessionDurationMinutes: 60 }).rules, "tiny-caps").status).toBe("pass");
    const evaluation = evaluate({ sessionDurationMinutes: 61 });
    expect(rule(evaluation.rules, "tiny-caps").codes).toEqual(["too-large:sessionDurationMinutes"]);
    expect(evaluation.valid).toBe(false);
  });

  test("loss and spend are capped at 5% of the bankroll by the sanity rule", () => {
    const wide: ConfigCaps = { ...CAPS, maxLossUsd: 6, maxSpendUsd: 6 };
    const evaluation = evaluate({ maxLossUsd: 6, maxSpendUsd: 6 }, wide);
    expect(rule(evaluation.rules, "tiny-caps").codes).toEqual(["too-large:maxLossUsd", "too-large:maxSpendUsd"]);
    const atLimit: ConfigCaps = { ...CAPS, maxLossUsd: 5, maxSpendUsd: 5 };
    expect(rule(evaluate({ maxLossUsd: 5, maxSpendUsd: 5 }, atLimit).rules, "tiny-caps").status).toBe("pass");
  });
});

describe("model rules", () => {
  test("a moving alias is not an exact version", () => {
    const evaluation = evaluate({ allowedModelId: "jev-latest" }, { ...CAPS, jevModelId: "jev-latest" });
    expect(rule(evaluation.rules, "model-pinned").status).toBe("fail");
    expect(rule(evaluation.rules, "model-pinned").codes).toEqual(["alias"]);
    expect(evaluation.valid).toBe(false);
  });

  test("the allowed model must equal the configured JEV_MODEL_ID", () => {
    const mismatch = evaluate({ allowedModelId: "jev-1.12.0" });
    expect(rule(mismatch.rules, "model-matches-config").status).toBe("fail");
    expect(rule(mismatch.rules, "model-matches-config").codes).toEqual(["model-mismatch"]);
    expect(rule(evaluate().rules, "model-matches-config").status).toBe("pass");
  });

  test("without the configured model the comparison stays pending and the record is not valid", () => {
    const evaluation = evaluate({}, { ...CAPS, jevModelId: null });
    expect(rule(evaluation.rules, "model-matches-config").status).toBe("pending");
    expect(evaluation.valid).toBe(false);
  });
});

describe("acknowledgement is typed by the owner, never prefilled", () => {
  test("the default draft and the blank evaluation carry an empty acknowledgement", () => {
    expect(emptyAuthorizationDraft().acknowledgement).toBe("");
    const blank = evaluateAuthorization(parseAuthorizationDraft(emptyAuthorizationDraft()), CAPS, NOW);
    expect(JSON.parse(blank.json).acknowledgement).toBe("");
    expect(rule(blank.rules, "acknowledgement").status).toBe("pending");
    expect(blank.valid).toBe(false);
  });

  test("the builder refuses a record without an acknowledgement", () => {
    for (const acknowledgement of ["", "   ", undefined, null]) {
      const result = buildAuthorizationRecord({ ...VALID, acknowledgement: acknowledgement as string | undefined | null }, CAPS, NOW);
      expect(result.ok).toBe(false);
    }
  });

  test("it needs the term and at least 40 characters after trimming", () => {
    const withTerm = (text: string) => rule(evaluate({ acknowledgement: text }).rules, "acknowledgement");
    // The term has 14 characters; term, one space and 24 more characters make 39, which is one short.
    expect(ACKNOWLEDGEMENT_TERM.length).toBe(14);
    expect(withTerm("OWN_FUNDS_RISK").status).toBe("fail");
    expect(withTerm("sem o termo obrigatorio mas com bem mais de quarenta caracteres").status).toBe("fail");
    expect(withTerm(`${ACKNOWLEDGEMENT_TERM} ${"x".repeat(24)}`).status).toBe("fail");
    expect(withTerm(`${ACKNOWLEDGEMENT_TERM} ${"x".repeat(25)}`).status).toBe("pass");
    // Padding with spaces does not count toward the length.
    expect(withTerm(`   ${ACKNOWLEDGEMENT_TERM} ${"x".repeat(24)}   `).status).toBe("fail");
    expect(withTerm(`   ${ACKNOWLEDGEMENT_TERM} ${"x".repeat(25)}   `).status).toBe("pass");
    expect(withTerm(`${ACKNOWLEDGEMENT_TERM} ${"x".repeat(24)}`).codes).toEqual(["invalid:acknowledgement"]);
  });

  test("the module never exports a ready made acknowledgement sentence", async () => {
    const exported = (await import("./authorization-record")) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (typeof value === "string") expect(value.length < AUTHORIZATION_POLICY.minAcknowledgementLength || !value.includes(ACKNOWLEDGEMENT_TERM)).toBe(true);
    }
  });
});

describe("blank and partial drafts stay honest", () => {
  test("a blank draft has every field rule pending and is never valid", () => {
    const blank = evaluateAuthorization(parseAuthorizationDraft(emptyAuthorizationDraft()), parseConfigCapsDraft(defaultConfigCapsDraft()), NOW);
    expect(blank.valid).toBe(false);
    for (const id of ["owner", "date", "walletAddress", "maxLossUsd", "maxSpendUsd", "tradeSizeMon", "maxPositionMon", "maxCapitalFraction", "sessionDurationMinutes", "allowedModelId", "expiry", "acknowledgement"]) {
      expect(rule(blank.rules, id).status).toBe("pending");
      expect(rule(blank.rules, id).codes).toEqual([`absent:${id}`]);
    }
    expect(blank.counts.fail).toBe(0);
    expect(blank.counts.pending).toBeGreaterThan(0);
  });

  test("buildAuthorizationRecord returns the failures instead of a record", () => {
    const result = buildAuthorizationRecord({ ...VALID, owner: "", maxLossUsd: 99 }, CAPS, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.length).toBeGreaterThan(0);
    expect("record" in result).toBe(false);
    expect("json" in result).toBe(false);
  });

  test("every rule names the verifier item it mirrors", () => {
    for (const entry of evaluate().rules) {
      expect(entry.verifierItem).toMatch(/^(authorization|config)\.[a-z0-9-]+/);
      expect(entry.label.length).toBeGreaterThan(3);
      expect(entry.message.length).toBeGreaterThan(3);
    }
  });
});

describe("draft parsing", () => {
  test("accepts decimal comma and dot, reports invalid text as NaN and empty text as null", () => {
    const draft = { ...emptyAuthorizationDraft(), maxLossUsd: "2,5", maxSpendUsd: "1.25", tradeSizeMon: "abc", maxPositionMon: "", maxCapitalFraction: " 0,25 ", sessionDurationMinutes: "1e2" };
    const input = parseAuthorizationDraft(draft);
    expect(input.maxLossUsd).toBe(2.5);
    expect(input.maxSpendUsd).toBe(1.25);
    expect(Number.isNaN(input.tradeSizeMon)).toBe(true);
    expect(input.maxPositionMon).toBeNull();
    expect(input.maxCapitalFraction).toBe(0.25);
    expect(Number.isNaN(input.sessionDurationMinutes)).toBe(true);
  });

  test("caps defaults mirror the repository configuration defaults", () => {
    const caps = parseConfigCapsDraft(defaultConfigCapsDraft());
    expect(caps).toEqual({ bankrollUsd: 100, maxLossUsd: 2, maxSpendUsd: 1, tradeSizeMon: 200, maxPositionMon: 1000, maxCapitalFraction: 0.25, jevModelId: null });
  });

  test("the authorization draft starts completely empty", () => {
    for (const value of Object.values(emptyAuthorizationDraft())) expect(value).toBe("");
  });
});

describe("timestamps", () => {
  test("parseIsoTimestamp is as strict as the verifier", () => {
    expect(parseIsoTimestamp("2026-10-11T14:30:00Z")).toBe(Date.UTC(2026, 9, 11, 14, 30, 0));
    expect(parseIsoTimestamp("2026-10-11T14:30:00.250Z")).toBe(Date.UTC(2026, 9, 11, 14, 30, 0, 250));
    expect(parseIsoTimestamp("2026-10-11T11:30:00-03:00")).toBe(Date.UTC(2026, 9, 11, 14, 30, 0));
    for (const bad of ["2026-10-11", "2026-10-11T14:30:00", "2026-02-30T00:00:00Z", "2026-10-11T24:00:00Z", "2026-13-01T00:00:00Z", "2026-10-11T14:30:60Z", "", "not a date", "1969-12-31T23:59:59Z"]) {
      expect(parseIsoTimestamp(bad)).toBeNull();
    }
    expect(parseIsoTimestamp(undefined)).toBeNull();
    expect(parseIsoTimestamp(1)).toBeNull();
  });

  test("a date only value is not accepted as date or expiry", () => {
    expect(rule(evaluate({ date: "2026-10-11" }).rules, "date").status).toBe("fail");
    expect(rule(evaluate({ expiry: "2026-10-12" }).rules, "expiry").status).toBe("fail");
  });

  test("localDateTimeToIso turns a datetime-local value into a UTC ISO string with seconds", () => {
    expect(localDateTimeToIso("2026-10-11T14:30")).toBe(new Date(2026, 9, 11, 14, 30, 0).toISOString().replace(/\.\d{3}Z$/, "Z"));
    expect(localDateTimeToIso("2026-10-11T14:30:15")).toBe(new Date(2026, 9, 11, 14, 30, 15).toISOString().replace(/\.\d{3}Z$/, "Z"));
    expect(parseIsoTimestamp(localDateTimeToIso("2026-10-11T14:30"))).not.toBeNull();
    for (const bad of ["", "2026-10-11", "2026-10-11T25:00", "abc", "2026-02-30T10:00"]) expect(localDateTimeToIso(bad)).toBe("");
  });
});
