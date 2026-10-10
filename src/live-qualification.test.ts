import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUTHORIZATION_TEMPLATE,
  DEFAULT_QUALIFICATION_POLICY,
  EVIDENCE_TEMPLATE,
  KNOWN_OPEN_RISKS,
  REQUIRED_ARTIFACTS,
  evaluateLiveQualification,
  parseIsoTimestamp,
  type ChecklistItem,
  type ConfigSnapshot,
  type LiveQualificationInput,
  type LiveQualificationReport,
} from "./live-qualification";

// ---------------------------------------------------------------------------
// Fixtures. Everything here is synthetic: no real key, wallet, owner or evidence.
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-10-11T12:00:00Z");
const clock = () => NOW;
const SIGNER = `0x${"ab".repeat(20)}`;
const OTHER_ADDRESS = `0x${"cd".repeat(20)}`;
const MODEL_ID = "jev-1.13.0";
const HASH = (digit: string) => digit.repeat(64);
const BANNED = /[\u00B7\u2013\u2014\u2212\u2022\u2219\u22C5\u2027\u30FB]/;

type Loose = Record<string, any>;
type LooseInput = { config: Loose | null; authorization?: any; authorizationError?: any; evidence?: any; evidenceError?: any; artifactChecks?: Loose; now: () => number; policy?: Loose };

const liveConfig = (over: Loose = {}): ConfigSnapshot => ({
  dryRun: false, model: "jev", jevModelId: MODEL_ID,
  bankrollUsd: 100, maxLossUsd: 2, maxSpendUsd: 1, tradeSizeMon: 200, maxPositionMon: 1000, maxCapitalFraction: 0.25,
  quoteIntervalBlocks: 100, minConfidence: 0.65, economicGate: true,
  walletKeyPresent: true, jevKeyPresent: true, liveAckSet: true, autoDeposit: false, signerAddress: SIGNER,
  ...over,
});

const paperConfig = (over: Loose = {}): ConfigSnapshot => liveConfig({
  dryRun: true, model: "mock", jevModelId: "jev-latest", walletKeyPresent: false, jevKeyPresent: false,
  liveAckSet: false, signerAddress: null, ...over,
});

const validAuthorization = (over: Loose = {}): Loose => ({
  schemaVersion: 1,
  owner: "Dono Ficticio de Teste",
  date: "2026-10-11T11:00:00Z",
  walletAddress: SIGNER,
  maxLossUsd: 2, maxSpendUsd: 1, tradeSizeMon: 200, maxPositionMon: 1000, maxCapitalFraction: 0.25,
  sessionDurationMinutes: 30,
  allowedModelId: MODEL_ID,
  expiry: "2026-10-12T11:00:00Z",
  acknowledgement: "OWN_FUNDS_RISK: texto de teste do dono ficticio, sem valor real e sem autoria humana.",
  ...over,
});

const validEvidence = (over: Loose = {}): Loose => ({
  schemaVersion: 1,
  paperSoakHours: 26.5, paperSoakDataSource: "real-market-paper", paperSoakModelId: MODEL_ID,
  paperSoakLatchedStop: false, paperSoakFillCount: 7,
  decisionSampleCount: 2500, decisionLatencyP50Ms: 280, decisionLatencyP95Ms: 420, decisionLatencyP99Ms: 900, lateBlockRate: 0.02,
  pendingReceiptCadenceMeasured: true, receiptLagBlocksP95: 2, quoteBlockFraction: 0.97,
  replayReconciled: true, noUnknownCosts: true, soakGasUsd: 1.5, soakJevUsd: 0.2, soakMakerFeeUsd: 0,
  rehearsalAt: "2026-10-11T08:00:00Z", rehearsalWalletAddress: SIGNER,
  rehearsalNonceBefore: 12, rehearsalNonceAfter: 12, rehearsalGasLimit: 350000,
  rehearsalMarginMon: 200, rehearsalMarginUsdc: 20, rehearsalVaultStateRead: true, rehearsalWalletDedicated: true,
  existingOrdersReconciled: true, openOrdersAtStart: 0, balancesReconciled: true, restartBaselineReconciled: true,
  killSwitchDrilled: true, emergencyCancelDrilled: true, independentReviewDone: true, authorizationSigned: true,
  acknowledgedRisks: KNOWN_OPEN_RISKS.map((risk) => risk.id),
  artifacts: {
    paperSoakJournal: { path: "soak.jsonl", sha256: HASH("1") },
    replayOutput: { path: "soak.replay.json", sha256: HASH("2") },
    rehearsalOutput: { path: "rehearsal.json", sha256: HASH("3") },
    independentReviewReport: { path: "review.md", sha256: HASH("4") },
  },
  ...over,
});

const validChecks = (): Loose => Object.fromEntries(REQUIRED_ARTIFACTS.map((id) => [id, { status: "match" }]));

const fullInput = (): LooseInput => ({
  config: liveConfig(), authorization: validAuthorization(), evidence: validEvidence(), artifactChecks: validChecks(), now: clock,
});

const evaluate = (input: LooseInput): LiveQualificationReport => evaluateLiveQualification(input as LiveQualificationInput);
const item = (report: LiveQualificationReport, id: string): ChecklistItem => {
  const found = report.items.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing checklist item ${id}`);
  return found;
};
const clone = <T>(value: T): T => structuredClone(value);
const remove = (record: Loose, key: string) => { delete record[key]; };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const ALL_IDS = evaluate(fullInput()).items.map((entry) => entry.id);

// ---------------------------------------------------------------------------
// Invariants and defaults
// ---------------------------------------------------------------------------

describe("checklist shape and invariants", () => {
  test("a complete, fully evidenced input yields every item met and a complete checklist (not a permission)", () => {
    const report = evaluate(fullInput());
    expect(report.items.filter((entry) => entry.status !== "met").map((entry) => `${entry.id}:${entry.codes.join(",")}`)).toEqual([]);
    expect(report.summary.readyForOwnerReview).toBe(true);
    expect(report.summary.blockers).toEqual([]);
    expect(report.summary.counts).toEqual({ met: ALL_IDS.length, unmet: 0, unknown: 0, total: ALL_IDS.length });
  });

  test("readyForOwnerReview is true if and only if every item is met, and blockers are exactly the non-met ids in order", () => {
    const samples: LooseInput[] = [
      fullInput(),
      { ...fullInput(), config: paperConfig() },
      { config: liveConfig(), now: clock },
      { config: null, now: clock },
      { ...fullInput(), authorization: validAuthorization({ maxLossUsd: -1 }) },
    ];
    for (const sample of samples) {
      const report = evaluate(sample);
      const allMet = report.items.every((entry) => entry.status === "met");
      expect(report.summary.readyForOwnerReview).toBe(allMet);
      expect(report.summary.blockers).toEqual(report.items.filter((entry) => entry.status !== "met").map((entry) => entry.id));
      const counts = { met: 0, unmet: 0, unknown: 0 };
      for (const entry of report.items) counts[entry.status] += 1;
      expect(report.summary.counts).toEqual({ ...counts, total: report.items.length });
    }
  });

  test("with no config at all every item is unknown and nothing is ready", () => {
    const report = evaluate({ config: null, now: clock });
    expect(report.items.length).toBeGreaterThan(40);
    expect(report.items.every((entry) => entry.status === "unknown")).toBe(true);
    expect(report.summary.readyForOwnerReview).toBe(false);
    expect(report.summary.blockers).toEqual(ALL_IDS);
  });

  test("the default paper input (config only) leaves every non-config item unknown and the live items unmet", () => {
    const report = evaluate({ config: paperConfig(), now: clock });
    for (const entry of report.items) {
      if (entry.group === "config") continue;
      expect({ id: entry.id, status: entry.status }).toEqual({ id: entry.id, status: "unknown" });
    }
    expect(item(report, "config.live-requested").status).toBe("unmet");
    expect(item(report, "config.model-jev").status).toBe("unmet");
    expect(item(report, "config.signer-key-present").status).toBe("unmet");
    expect(item(report, "config.jev-key-present").status).toBe("unmet");
    expect(item(report, "config.snapshot-valid").status).toBe("met");
    expect(report.summary.readyForOwnerReview).toBe(false);
  });

  test("dryRun=true keeps the live item unmet and blocks readiness even when everything else is perfect", () => {
    const input = fullInput();
    input.config = liveConfig({ dryRun: true });
    const report = evaluate(input);
    expect(report.items.filter((entry) => entry.status !== "met").map((entry) => entry.id)).toEqual(["config.live-requested"]);
    expect(item(report, "config.live-requested").codes).toContain("dry-run");
    expect(report.summary.readyForOwnerReview).toBe(false);
  });

  test("every item has a unique id, a group, a requirement, a reference and non-empty evidence text", () => {
    const report = evaluate(fullInput());
    expect(new Set(report.items.map((entry) => entry.id)).size).toBe(report.items.length);
    for (const entry of report.items) {
      expect(entry.id).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);
      expect(entry.requirement.length).toBeGreaterThan(10);
      expect(entry.codeOrDocReference.length).toBeGreaterThan(5);
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(["met", "unmet", "unknown"]).toContain(entry.status);
      if (entry.status === "met") { expect(entry.codes).toEqual([]); expect(entry.reason).toBe(""); }
      else { expect(entry.codes.length).toBeGreaterThan(0); expect(entry.reason.length).toBeGreaterThan(0); }
    }
  });

  test("known open risks are listed with their source and acknowledgement state", () => {
    expect(KNOWN_OPEN_RISKS.map((risk) => risk.id)).toEqual([
      "pending-receipt-halts-quotes",
      "no-quote-provenance",
      "unlinked-fill-recorded-journal",
      "soak-24h-never-run",
      "same-block-confirmation-unqualified",
      "profitability-unproven",
    ]);
    const open = evaluate({ config: paperConfig(), now: clock });
    expect(open.knownOpenRisks.map((risk) => risk.id)).toEqual(KNOWN_OPEN_RISKS.map((risk) => risk.id));
    expect(open.knownOpenRisks.every((risk) => risk.status === "open" && risk.acknowledged === false)).toBe(true);
    const full = evaluate(fullInput());
    expect(full.knownOpenRisks.every((risk) => risk.status === "open" && risk.acknowledged === true)).toBe(true);
    for (const risk of KNOWN_OPEN_RISKS) expect(ALL_IDS).toContain(`risk.${risk.id}`);
  });
});

// ---------------------------------------------------------------------------
// Each blocker individually. The table must cover every checklist item.
// ---------------------------------------------------------------------------

interface BlockerCase { id: string; status: "unmet" | "unknown"; label: string; mutate: (input: LooseInput) => void }

const caseOf = (id: string, status: "unmet" | "unknown", label: string, mutate: (input: LooseInput) => void): BlockerCase => ({ id, status, label, mutate });
const evidenceAbsent = (id: string, ...keys: string[]) => caseOf(id, "unknown", `absent ${keys.join("+")}`, (i) => { for (const key of keys) remove(i.evidence, key); });
const evidenceSet = (id: string, label: string, over: Loose) => caseOf(id, "unmet", label, (i) => { Object.assign(i.evidence, over); });

const BLOCKERS: BlockerCase[] = [
  caseOf("config.snapshot-valid", "unknown", "no config", (i) => { i.config = null; }),
  caseOf("config.snapshot-valid", "unmet", "NaN bankroll", (i) => { i.config!.bankrollUsd = Number.NaN; }),
  caseOf("config.live-requested", "unmet", "paper config", (i) => { i.config!.dryRun = true; }),
  caseOf("config.model-jev", "unmet", "mock model", (i) => { i.config!.model = "mock"; }),
  caseOf("config.jev-key-present", "unmet", "no Jev key", (i) => { i.config!.jevKeyPresent = false; }),
  caseOf("config.signer-key-present", "unmet", "no wallet key", (i) => { i.config!.walletKeyPresent = false; }),
  caseOf("config.live-ack", "unmet", "ack not set", (i) => { i.config!.liveAckSet = false; }),
  caseOf("config.live-ack", "unknown", "ack unknown", (i) => { remove(i.config!, "liveAckSet"); }),
  caseOf("config.auto-deposit-off", "unmet", "auto deposit on", (i) => { i.config!.autoDeposit = true; }),
  caseOf("config.auto-deposit-off", "unknown", "auto deposit unknown", (i) => { remove(i.config!, "autoDeposit"); }),
  caseOf("config.model-id-pinned", "unmet", "floating alias", (i) => { i.config!.jevModelId = "jev-latest"; }),
  caseOf("config.model-id-pinned", "unknown", "model id unknown", (i) => { remove(i.config!, "jevModelId"); }),

  caseOf("authorization.record-present", "unknown", "no record", (i) => { i.authorization = undefined; }),
  caseOf("authorization.record-present", "unmet", "malformed JSON", (i) => { i.authorization = undefined; i.authorizationError = "malformed-json"; }),
  caseOf("authorization.fields-valid", "unmet", "missing owner", (i) => { remove(i.authorization, "owner"); }),
  caseOf("authorization.fields-valid", "unknown", "no record", (i) => { i.authorization = undefined; }),
  caseOf("authorization.time-window", "unmet", "expired", (i) => { i.authorization.expiry = "2026-10-11T11:59:59Z"; }),
  caseOf("authorization.time-window", "unknown", "no record", (i) => { i.authorization = undefined; }),
  caseOf("authorization.limits-within-config-caps", "unmet", "loss above config cap", (i) => { i.authorization.maxLossUsd = 3; }),
  caseOf("authorization.limits-within-config-caps", "unknown", "no config", (i) => { i.config = null; }),
  caseOf("authorization.config-within-authorized-limits", "unmet", "config looser than authorization", (i) => { i.authorization.maxLossUsd = 1; }),
  caseOf("authorization.tiny-caps", "unmet", "loss above 5% of bankroll", (i) => { i.config!.maxLossUsd = 6; i.authorization.maxLossUsd = 6; }),
  caseOf("authorization.tiny-caps", "unknown", "no record", (i) => { i.authorization = undefined; }),
  caseOf("authorization.model-matches-config", "unmet", "different model", (i) => { i.authorization.allowedModelId = "jev-1.12.0"; }),
  caseOf("authorization.model-matches-config", "unknown", "config model unknown", (i) => { remove(i.config!, "jevModelId"); }),
  caseOf("authorization.wallet-matches-signer", "unmet", "different wallet", (i) => { i.config!.signerAddress = OTHER_ADDRESS; }),
  caseOf("authorization.wallet-matches-signer", "unknown", "signer address not derived", (i) => { i.config!.signerAddress = null; }),
  caseOf("authorization.signed", "unmet", "not signed", (i) => { i.evidence.authorizationSigned = false; }),
  evidenceAbsent("authorization.signed", "authorizationSigned"),

  caseOf("evidence.manifest-valid", "unknown", "no manifest", (i) => { i.evidence = undefined; }),
  caseOf("evidence.manifest-valid", "unmet", "unknown field", (i) => { i.evidence.unexpectedField = 1; }),
  caseOf("evidence.artifacts-verified", "unmet", "hash mismatch", (i) => { i.artifactChecks!.replayOutput = { status: "mismatch" }; }),
  caseOf("evidence.artifacts-verified", "unknown", "artifact not declared", (i) => { i.evidence.artifacts.rehearsalOutput = null; }),

  evidenceAbsent("stage1.soak-duration", "paperSoakHours"),
  evidenceSet("stage1.soak-duration", "below 24 h", { paperSoakHours: 23.99 }),
  evidenceAbsent("stage1.soak-uninterrupted", "paperSoakLatchedStop"),
  evidenceSet("stage1.soak-uninterrupted", "latched stop", { paperSoakLatchedStop: true }),
  evidenceAbsent("stage1.soak-real-rpc", "paperSoakDataSource"),
  evidenceSet("stage1.soak-real-rpc", "synthetic source", { paperSoakDataSource: "synthetic" }),
  evidenceAbsent("stage1.soak-real-jev", "paperSoakModelId"),
  evidenceSet("stage1.soak-real-jev", "mock soak", { paperSoakModelId: "mock" }),
  evidenceAbsent("stage1.latency-distribution", "decisionLatencyP95Ms"),
  evidenceSet("stage1.latency-distribution", "p95 over the gated limit", { decisionLatencyP95Ms: 1501, decisionLatencyP99Ms: 2000 }),
  evidenceAbsent("stage1.late-block-rate", "lateBlockRate"),
  evidenceSet("stage1.late-block-rate", "too many late blocks", { lateBlockRate: 0.0501 }),
  evidenceAbsent("stage1.pending-receipt-cadence", "pendingReceiptCadenceMeasured"),
  evidenceSet("stage1.pending-receipt-cadence", "not measured", { pendingReceiptCadenceMeasured: false }),
  evidenceAbsent("stage1.replay-reconciled", "replayReconciled"),
  evidenceSet("stage1.replay-reconciled", "replay not reconciled", { replayReconciled: false }),
  evidenceAbsent("stage1.costs-complete", "noUnknownCosts"),
  evidenceSet("stage1.costs-complete", "unknown costs", { noUnknownCosts: false }),

  evidenceAbsent("stage2.rehearsal-wallet", "rehearsalWalletAddress"),
  evidenceSet("stage2.rehearsal-wallet", "different wallet", { rehearsalWalletAddress: OTHER_ADDRESS }),
  evidenceAbsent("stage2.rehearsal-fresh", "rehearsalAt"),
  evidenceSet("stage2.rehearsal-fresh", "stale rehearsal", { rehearsalAt: "2026-10-10T11:59:00Z" }),
  evidenceAbsent("stage2.nonce-unchanged", "rehearsalNonceBefore"),
  evidenceSet("stage2.nonce-unchanged", "nonce moved", { rehearsalNonceAfter: 13 }),
  evidenceAbsent("stage2.gas-estimated", "rehearsalGasLimit"),
  evidenceSet("stage2.gas-estimated", "zero gas limit", { rehearsalGasLimit: 0 }),
  evidenceAbsent("stage2.margin-and-vault-read", "rehearsalMarginUsdc"),
  evidenceSet("stage2.margin-and-vault-read", "vault not read", { rehearsalVaultStateRead: false }),
  evidenceAbsent("stage2.wallet-dedicated", "rehearsalWalletDedicated"),
  evidenceSet("stage2.wallet-dedicated", "not dedicated", { rehearsalWalletDedicated: false }),

  evidenceAbsent("reconciliation.existing-orders", "existingOrdersReconciled"),
  evidenceSet("reconciliation.existing-orders", "orders open at start", { openOrdersAtStart: 2 }),
  evidenceAbsent("reconciliation.balances", "balancesReconciled"),
  evidenceSet("reconciliation.balances", "balances not reconciled", { balancesReconciled: false }),
  evidenceAbsent("reconciliation.restart-baseline", "restartBaselineReconciled"),
  evidenceSet("reconciliation.restart-baseline", "baseline not reconciled", { restartBaselineReconciled: false }),

  evidenceAbsent("stage3.kill-switch-drilled", "killSwitchDrilled"),
  evidenceSet("stage3.kill-switch-drilled", "not drilled", { killSwitchDrilled: false }),
  evidenceAbsent("stage3.emergency-cancel-drilled", "emergencyCancelDrilled"),
  evidenceSet("stage3.emergency-cancel-drilled", "not drilled", { emergencyCancelDrilled: false }),
  evidenceAbsent("stage3.independent-review", "independentReviewDone"),
  evidenceSet("stage3.independent-review", "no review", { independentReviewDone: false }),

  ...KNOWN_OPEN_RISKS.map((risk) => caseOf(`risk.${risk.id}`, "unknown", "not acknowledged", (i) => {
    i.evidence.acknowledgedRisks = i.evidence.acknowledgedRisks.filter((id: string) => id !== risk.id);
  })),
];

describe("each blocker individually", () => {
  test("the blocker table covers every checklist item", () => {
    expect([...new Set(BLOCKERS.map((entry) => entry.id))].sort()).toEqual([...ALL_IDS].sort());
  });

  for (const entry of BLOCKERS) {
    test(`${entry.id} is ${entry.status} when: ${entry.label}`, () => {
      const input = fullInput();
      entry.mutate(input);
      const report = evaluate(input);
      expect(item(report, entry.id).status).toBe(entry.status);
      expect(item(report, entry.id).codes.length).toBeGreaterThan(0);
      expect(report.summary.readyForOwnerReview).toBe(false);
      expect(report.summary.blockers).toContain(entry.id);
    });
  }

  test("a single failing item does not disturb unrelated items", () => {
    const input = fullInput();
    input.evidence.killSwitchDrilled = false;
    const report = evaluate(input);
    expect(report.items.filter((entry) => entry.status !== "met").map((entry) => entry.id)).toEqual(["stage3.kill-switch-drilled"]);
  });
});

// ---------------------------------------------------------------------------
// Authorization validation, strictly
// ---------------------------------------------------------------------------

describe("authorization validation", () => {
  const fieldsOf = (record: Loose) => evaluate({ ...fullInput(), authorization: record });
  const REQUIRED_FIELDS = Object.keys(AUTHORIZATION_TEMPLATE);

  test("the template lists exactly the fields the record must carry", () => {
    expect(REQUIRED_FIELDS).toEqual([
      "schemaVersion", "owner", "date", "walletAddress", "maxLossUsd", "maxSpendUsd", "tradeSizeMon", "maxPositionMon",
      "maxCapitalFraction", "sessionDurationMinutes", "allowedModelId", "expiry", "acknowledgement",
    ]);
  });

  for (const field of REQUIRED_FIELDS) {
    test(`a record missing ${field} is rejected and the field is named`, () => {
      const record = validAuthorization();
      remove(record, field);
      const entry = item(fieldsOf(record), "authorization.fields-valid");
      expect(entry.status).toBe("unmet");
      expect(entry.codes).toContain(`missing:${field}`);
    });
  }

  test("negative, zero, NaN, Infinity, string and null limits are rejected", () => {
    for (const field of ["maxLossUsd", "maxSpendUsd", "tradeSizeMon", "maxPositionMon", "maxCapitalFraction", "sessionDurationMinutes"]) {
      for (const bad of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "2", null, true, [], {}]) {
        const entry = item(fieldsOf(validAuthorization({ [field]: bad })), "authorization.fields-valid");
        expect({ field, bad: String(bad), status: entry.status }).toEqual({ field, bad: String(bad), status: "unmet" });
        expect(entry.codes.some((code) => code.endsWith(`:${field}`))).toBe(true);
      }
    }
  });

  test("maxCapitalFraction above 1 and a trade size above the maximum position are rejected", () => {
    expect(item(fieldsOf(validAuthorization({ maxCapitalFraction: 1.01 })), "authorization.fields-valid").status).toBe("unmet");
    expect(item(fieldsOf(validAuthorization({ maxCapitalFraction: 1 })), "authorization.fields-valid").status).toBe("met");
    expect(item(fieldsOf(validAuthorization({ tradeSizeMon: 500, maxPositionMon: 400 })), "authorization.fields-valid").status).toBe("unmet");
  });

  test("unknown fields, a wrong schema version and non-object records are rejected without echoing values", () => {
    const withExtra = item(fieldsOf(validAuthorization({ maxLoss: 5, "0xSECRET_LOOKING_NAME_THAT_IS_TOO_LONG_TO_ECHO_BACK_VERBATIM": 1 })), "authorization.fields-valid");
    expect(withExtra.status).toBe("unmet");
    expect(withExtra.codes).toContain("unknown-field:maxLoss");
    expect(JSON.stringify(withExtra)).not.toContain("TOO_LONG_TO_ECHO_BACK_VERBATIM");
    expect(item(fieldsOf(validAuthorization({ schemaVersion: 2 })), "authorization.fields-valid").codes).toContain("invalid:schemaVersion");
    for (const bad of [[], "text", 7, null, true]) {
      const report = evaluate({ ...fullInput(), authorization: bad });
      expect(item(report, "authorization.record-present").status).toBe("unmet");
      expect(item(report, "authorization.record-present").codes).toContain("not-object");
      expect(item(report, "authorization.fields-valid").status).toBe("unknown");
    }
  });

  test("malformed or unreadable files are flagged without being interpreted", () => {
    for (const error of ["malformed-json", "unreadable"] as const) {
      const report = evaluate({ ...fullInput(), authorization: undefined, authorizationError: error });
      expect(item(report, "authorization.record-present").status).toBe("unmet");
      expect(item(report, "authorization.record-present").codes).toContain(error);
      expect(report.inputs.authorization).toBe(error);
      for (const id of ["authorization.fields-valid", "authorization.time-window", "authorization.limits-within-config-caps", "authorization.tiny-caps"]) {
        expect(item(report, id).status).toBe("unknown");
      }
    }
  });

  test("wallet addresses must be 20 hex bytes and not the zero address", () => {
    for (const bad of ["", "0x123", `0x${"g".repeat(40)}`, `0x${"0".repeat(40)}`, `${"ab".repeat(20)}`, 12, null]) {
      expect(item(fieldsOf(validAuthorization({ walletAddress: bad })), "authorization.fields-valid").status).toBe("unmet");
    }
  });

  test("owner, model id and acknowledgement must be real text with the OWN_FUNDS_RISK term", () => {
    expect(item(fieldsOf(validAuthorization({ owner: "   " })), "authorization.fields-valid").status).toBe("unmet");
    expect(item(fieldsOf(validAuthorization({ allowedModelId: "" })), "authorization.fields-valid").status).toBe("unmet");
    expect(item(fieldsOf(validAuthorization({ acknowledgement: "" })), "authorization.fields-valid").status).toBe("unmet");
    expect(item(fieldsOf(validAuthorization({ acknowledgement: "OWN_FUNDS_RISK" })), "authorization.fields-valid").codes).toContain("invalid:acknowledgement");
    expect(item(fieldsOf(validAuthorization({ acknowledgement: "x".repeat(60) })), "authorization.fields-valid").codes).toContain("invalid:acknowledgement");
    const exactlyMinimum = `OWN_FUNDS_RISK${"x".repeat(DEFAULT_QUALIFICATION_POLICY.minAcknowledgementLength - "OWN_FUNDS_RISK".length)}`;
    expect(exactlyMinimum.length).toBe(DEFAULT_QUALIFICATION_POLICY.minAcknowledgementLength);
    expect(item(fieldsOf(validAuthorization({ acknowledgement: exactlyMinimum })), "authorization.fields-valid").status).toBe("met");
  });

  test("the unfilled template fails validation and names every field", () => {
    const report = evaluate({ ...fullInput(), authorization: clone(AUTHORIZATION_TEMPLATE) });
    const entry = item(report, "authorization.fields-valid");
    expect(item(report, "authorization.record-present").status).toBe("met");
    expect(entry.status).toBe("unmet");
    for (const field of REQUIRED_FIELDS.filter((name) => name !== "schemaVersion")) {
      expect(entry.codes.some((code) => code.endsWith(`:${field}`))).toBe(true);
    }
    expect(report.summary.readyForOwnerReview).toBe(false);
  });

  test("limits are compared with the config in both directions, per field", () => {
    const limits: [string, string, number, number][] = [
      ["maxLossUsd", "maxLossUsd", 2, 3], ["maxSpendUsd", "maxSpendUsd", 1, 1.5], ["tradeSizeMon", "tradeSizeMon", 200, 300],
      ["maxPositionMon", "maxPositionMon", 1000, 1100], ["maxCapitalFraction", "maxCapitalFraction", 0.25, 0.3],
    ];
    for (const [authField, configField, base, above] of limits) {
      const higherAuthorization = evaluate({ ...fullInput(), authorization: validAuthorization({ [authField]: above }) });
      expect(item(higherAuthorization, "authorization.limits-within-config-caps").codes).toContain(`exceeds-config:${authField}`);
      expect(item(higherAuthorization, "authorization.config-within-authorized-limits").status).toBe("met");
      const input = fullInput();
      input.config![configField] = above;
      input.config!.maxPositionMon = Math.max(input.config!.maxPositionMon, input.config!.tradeSizeMon);
      const higherConfig = evaluate(input);
      expect(item(higherConfig, "authorization.config-within-authorized-limits").codes).toContain(`config-exceeds:${authField}`);
      expect(item(higherConfig, "authorization.limits-within-config-caps").status).toBe("met");
      expect(base).toBeLessThan(above);
    }
  });

  test("tiny-cap sanity is relative to the bankroll and the policy is configurable", () => {
    const input = fullInput();
    input.config!.maxLossUsd = 5; input.authorization.maxLossUsd = 5;
    expect(item(evaluate(input), "authorization.tiny-caps").status).toBe("met");
    input.config!.maxLossUsd = 5.01; input.authorization.maxLossUsd = 5.01;
    expect(item(evaluate(input), "authorization.tiny-caps").codes).toContain("too-large:maxLossUsd");
    expect(item(evaluate({ ...input, policy: { maxLossFractionOfBankroll: 0.06 } }), "authorization.tiny-caps").status).toBe("met");

    const spend = fullInput();
    spend.config!.maxSpendUsd = 5.5; spend.authorization.maxSpendUsd = 5.5;
    expect(item(evaluate(spend), "authorization.tiny-caps").codes).toContain("too-large:maxSpendUsd");

    const duration = fullInput();
    duration.authorization.sessionDurationMinutes = 61;
    expect(item(evaluate(duration), "authorization.tiny-caps").codes).toContain("too-large:sessionDurationMinutes");
    duration.authorization.sessionDurationMinutes = 60;
    expect(item(evaluate(duration), "authorization.tiny-caps").status).toBe("met");
  });

  test("time window: expired, exactly at expiry, future-dated, inverted and over-long validity", () => {
    const window = (over: Loose) => item(evaluate({ ...fullInput(), authorization: validAuthorization(over) }), "authorization.time-window");
    expect(window({}).status).toBe("met");
    expect(window({ expiry: "2026-10-11T11:59:59Z" }).codes).toContain("expired");
    expect(window({ expiry: "2026-10-11T12:00:00Z" }).codes).toContain("expired");
    expect(window({ expiry: "2026-10-11T12:00:01Z" }).status).toBe("met");
    expect(window({ date: "2026-10-12T12:00:00Z", expiry: "2026-10-13T12:00:00Z" }).codes).toContain("date-in-future");
    expect(window({ date: "2026-10-11T12:04:59Z" }).status).toBe("met");
    expect(window({ date: "2026-10-11T12:05:01Z" }).codes).toContain("date-in-future");
    expect(window({ date: "2026-10-11T11:00:00Z", expiry: "2026-10-11T10:00:00Z" }).codes).toContain("expiry-before-date");
    expect(window({ date: "2026-10-04T12:00:01Z", expiry: "2026-10-11T12:00:01Z" }).status).toBe("met");
    expect(window({ date: "2026-10-04T12:00:00Z", expiry: "2026-10-11T12:00:01Z" }).codes).toContain("validity-too-long");
  });

  test("malformed timestamps are rejected as invalid fields", () => {
    for (const bad of ["2026-02-31T00:00:00Z", "2026-10-11", "2026-10-11T12:00:00", "yesterday", "", 1791720000000, null, "2026-13-01T00:00:00Z", "2026-10-11T24:00:00Z"]) {
      const entry = item(fieldsOf(validAuthorization({ expiry: bad })), "authorization.fields-valid");
      expect({ bad: String(bad), status: entry.status }).toEqual({ bad: String(bad), status: "unmet" });
      expect(entry.codes).toContain("invalid:expiry");
    }
  });

  test("the wallet check is case-insensitive and unknown when no signer address was derived", () => {
    const upper = fullInput();
    upper.config!.signerAddress = `0x${"AB".repeat(20)}`;
    expect(item(evaluate(upper), "authorization.wallet-matches-signer").status).toBe("met");
    upper.config!.signerAddress = OTHER_ADDRESS;
    expect(item(evaluate(upper), "authorization.wallet-matches-signer").codes).toContain("wallet-mismatch");
    upper.config!.signerAddress = undefined;
    expect(item(evaluate(upper), "authorization.wallet-matches-signer").status).toBe("unknown");
  });
});

describe("parseIsoTimestamp", () => {
  test("accepts complete ISO 8601 timestamps with a zone and rejects everything lenient parsers accept", () => {
    expect(parseIsoTimestamp("2026-10-11T12:00:00Z")).toBe(Date.parse("2026-10-11T12:00:00Z"));
    expect(parseIsoTimestamp("2026-10-11T12:00:00.250Z")).toBe(Date.parse("2026-10-11T12:00:00.250Z"));
    expect(parseIsoTimestamp("2026-10-11T12:00:00+02:00")).toBe(Date.parse("2026-10-11T10:00:00Z"));
    expect(parseIsoTimestamp("2026-10-11T12:00:00-03:00")).toBe(Date.parse("2026-10-11T15:00:00Z"));
    for (const bad of ["2026-02-31T00:00:00Z", "2026-02-29T00:00:00Z", "2026-10-11 12:00:00Z", "2026-10-11", "2026-10-11T12:00Z", "2026-10-11T12:00:00",
      "2026-10-11T25:00:00Z", "2026-10-11T12:60:00Z", "2026-10-11T12:00:60Z", "2026-00-11T12:00:00Z", "2026-10-00T12:00:00Z", "2026-10-11T12:00:00+25:00", "", "x", null, undefined, 5]) {
      expect(parseIsoTimestamp(bad)).toBeNull();
    }
    expect(parseIsoTimestamp("2028-02-29T00:00:00Z")).toBe(Date.parse("2028-02-29T00:00:00Z"));
  });
});

// ---------------------------------------------------------------------------
// Evidence manifest
// ---------------------------------------------------------------------------

describe("evidence manifest", () => {
  const ev = (over: Loose, id: string, extra: Partial<LooseInput> = {}) => item(evaluate({ ...fullInput(), evidence: validEvidence(over), ...extra }), id);

  test("null counts as no evidence, a wrong type counts as unmet", () => {
    for (const [id, key] of [["stage1.soak-duration", "paperSoakHours"], ["stage3.kill-switch-drilled", "killSwitchDrilled"], ["stage1.late-block-rate", "lateBlockRate"]] as const) {
      expect(ev({ [key]: null }, id).status).toBe("unknown");
      expect(ev({ [key]: "yes" }, id).status).toBe("unmet");
      expect(ev({ [key]: Number.NaN }, id).status).toBe("unmet");
    }
    expect(ev({ paperSoakHours: "26" }, "stage1.soak-duration").status).toBe("unmet");
    expect(ev({ killSwitchDrilled: 1 }, "stage3.kill-switch-drilled").status).toBe("unmet");
    expect(ev({ paperSoakHours: -5 }, "stage1.soak-duration").status).toBe("unmet");
  });

  test("soak duration, late rate and fills sit exactly on their policy boundaries", () => {
    expect(ev({ paperSoakHours: 24 }, "stage1.soak-duration").status).toBe("met");
    expect(ev({ paperSoakHours: 23.999 }, "stage1.soak-duration").codes).toContain("below-minimum");
    expect(ev({ lateBlockRate: 0.05 }, "stage1.late-block-rate").status).toBe("met");
    expect(ev({ lateBlockRate: 0.0500001 }, "stage1.late-block-rate").codes).toContain("late-rate-over-limit");
    expect(ev({ lateBlockRate: 1.2 }, "stage1.late-block-rate").status).toBe("unmet");
    expect(ev({ paperSoakFillCount: 1 }, "stage1.replay-reconciled").status).toBe("met");
    expect(ev({ paperSoakFillCount: 0 }, "stage1.replay-reconciled").codes).toContain("fills-below-minimum");
    expect(ev({ paperSoakFillCount: 1.5 }, "stage1.replay-reconciled").status).toBe("unmet");
    expect(item(evaluate({ ...fullInput(), evidence: validEvidence({ paperSoakHours: 10 }), policy: { minSoakHours: 8 } }), "stage1.soak-duration").status).toBe("met");
  });

  test("latency thresholds follow the cadence profile: 300 ms for every-block, 1500 ms otherwise", () => {
    const everyBlock = (p95: number) => evaluate({
      ...fullInput(),
      config: liveConfig({ quoteIntervalBlocks: 1, economicGate: false, minConfidence: 0 }),
      evidence: validEvidence({ decisionLatencyP50Ms: 100, decisionLatencyP95Ms: p95, decisionLatencyP99Ms: 2000, receiptLagBlocksP95: 0, quoteBlockFraction: 1 }),
    });
    expect(everyBlock(300).cadenceProfile).toBe("every-block");
    expect(item(everyBlock(300), "stage1.latency-distribution").status).toBe("met");
    expect(item(everyBlock(301), "stage1.latency-distribution").codes).toContain("p95-over-limit");
    expect(ev({ decisionLatencyP95Ms: 1500, decisionLatencyP99Ms: 1500 }, "stage1.latency-distribution").status).toBe("met");
    expect(ev({ decisionLatencyP95Ms: 1500.01, decisionLatencyP99Ms: 1600 }, "stage1.latency-distribution").status).toBe("unmet");
    expect(evaluate(fullInput()).cadenceProfile).toBe("gated");
    expect(evaluate({ config: liveConfig({ quoteIntervalBlocks: 1, economicGate: true, minConfidence: 0 }), now: clock }).cadenceProfile).toBe("gated");
    expect(evaluate({ config: null, now: clock }).cadenceProfile).toBe("unknown");
  });

  test("a latency distribution needs enough decisions behind it: 99 is too few, 100 is enough", () => {
    expect(ev({ decisionSampleCount: 100 }, "stage1.latency-distribution").status).toBe("met");
    expect(ev({ decisionSampleCount: 99 }, "stage1.latency-distribution").codes).toContain("too-few-samples");
    expect(ev({ decisionSampleCount: 3 }, "stage1.latency-distribution").status).toBe("unmet");
    expect(ev({ decisionSampleCount: 99.5 }, "stage1.latency-distribution").status).toBe("unmet");
    expect(ev({ decisionSampleCount: -1 }, "stage1.latency-distribution").status).toBe("unmet");
    expect(ev({ decisionSampleCount: null }, "stage1.latency-distribution").status).toBe("unknown");
    expect(item(evaluate({ ...fullInput(), evidence: validEvidence({ decisionSampleCount: 30 }), policy: { minDecisionSamples: 30 } }), "stage1.latency-distribution").status).toBe("met");
  });

  test("latency percentiles must be ordered and finite", () => {
    expect(ev({ decisionLatencyP50Ms: 500, decisionLatencyP95Ms: 400 }, "stage1.latency-distribution").codes).toContain("percentile-order");
    expect(ev({ decisionLatencyP99Ms: 300 }, "stage1.latency-distribution").codes).toContain("percentile-order");
    expect(ev({ decisionLatencyP50Ms: -1 }, "stage1.latency-distribution").status).toBe("unmet");
    expect(ev({ decisionLatencyP50Ms: null, decisionLatencyP99Ms: "slow" }, "stage1.latency-distribution").status).toBe("unmet");
    expect(ev({ decisionLatencyP50Ms: null }, "stage1.latency-distribution").status).toBe("unknown");
  });

  test("pending-receipt cadence: gated needs lag below the interval, every-block needs a high quote fraction", () => {
    expect(ev({ receiptLagBlocksP95: 99 }, "stage1.pending-receipt-cadence").status).toBe("met");
    expect(ev({ receiptLagBlocksP95: 100 }, "stage1.pending-receipt-cadence").codes).toContain("lag-over-interval");
    expect(ev({ quoteBlockFraction: 0 }, "stage1.pending-receipt-cadence").status).toBe("unmet");
    expect(ev({ quoteBlockFraction: 1.1 }, "stage1.pending-receipt-cadence").status).toBe("unmet");
    expect(ev({ receiptLagBlocksP95: null }, "stage1.pending-receipt-cadence").status).toBe("unknown");
    const everyBlock = (fraction: number) => item(evaluate({
      ...fullInput(),
      config: liveConfig({ quoteIntervalBlocks: 1, economicGate: false, minConfidence: 0 }),
      evidence: validEvidence({ decisionLatencyP95Ms: 250, quoteBlockFraction: fraction }),
    }), "stage1.pending-receipt-cadence");
    expect(everyBlock(0.95).status).toBe("met");
    expect(everyBlock(0.949).codes).toContain("fraction-too-low");
  });

  test("the soak must have used the configured, non-mock Jev model and a real-market source", () => {
    expect(ev({ paperSoakModelId: "jev-1.12.0" }, "stage1.soak-real-jev").codes).toContain("model-mismatch");
    expect(ev({ paperSoakModelId: "" }, "stage1.soak-real-jev").status).toBe("unmet");
    expect(ev({ paperSoakModelId: 7 }, "stage1.soak-real-jev").status).toBe("unmet");
    expect(ev({ paperSoakDataSource: "live" }, "stage1.soak-real-rpc").status).toBe("unmet");
    const mockConfig = evaluate({ ...fullInput(), config: liveConfig({ model: "mock", jevModelId: "mock" }), evidence: validEvidence({ paperSoakModelId: "mock" }) });
    expect(item(mockConfig, "stage1.soak-real-jev").codes).toContain("mock-model");
  });

  test("cost totals must be finite and non-negative in addition to the no-unknown-costs flag", () => {
    expect(ev({ soakGasUsd: -0.01 }, "stage1.costs-complete").status).toBe("unmet");
    expect(ev({ soakJevUsd: Number.POSITIVE_INFINITY }, "stage1.costs-complete").status).toBe("unmet");
    expect(ev({ soakMakerFeeUsd: null }, "stage1.costs-complete").status).toBe("unknown");
    expect(ev({ soakGasUsd: 0, soakJevUsd: 0, soakMakerFeeUsd: 0 }, "stage1.costs-complete").status).toBe("met");
  });

  test("rehearsal: freshness boundaries, nonce equality, gas limit and margin balances", () => {
    expect(ev({ rehearsalAt: "2026-10-10T12:00:00Z" }, "stage2.rehearsal-fresh").status).toBe("met");
    expect(ev({ rehearsalAt: "2026-10-10T11:59:59Z" }, "stage2.rehearsal-fresh").codes).toContain("stale");
    expect(ev({ rehearsalAt: "2026-10-11T12:06:00Z" }, "stage2.rehearsal-fresh").codes).toContain("date-in-future");
    expect(ev({ rehearsalAt: "yesterday" }, "stage2.rehearsal-fresh").status).toBe("unmet");
    expect(ev({ rehearsalNonceBefore: 12, rehearsalNonceAfter: 11 }, "stage2.nonce-unchanged").codes).toContain("nonce-changed");
    expect(ev({ rehearsalNonceBefore: 1.5 }, "stage2.nonce-unchanged").status).toBe("unmet");
    expect(ev({ rehearsalNonceBefore: -1, rehearsalNonceAfter: -1 }, "stage2.nonce-unchanged").status).toBe("unmet");
    expect(ev({ rehearsalNonceAfter: null }, "stage2.nonce-unchanged").status).toBe("unknown");
    expect(ev({ rehearsalGasLimit: 350000.5 }, "stage2.gas-estimated").status).toBe("unmet");
    expect(ev({ rehearsalMarginMon: -1 }, "stage2.margin-and-vault-read").status).toBe("unmet");
    expect(ev({ rehearsalMarginMon: 0, rehearsalMarginUsdc: 0 }, "stage2.margin-and-vault-read").status).toBe("met");
  });

  test("the rehearsal wallet must match the authorization and the derived signer, and be a valid address", () => {
    expect(ev({ rehearsalWalletAddress: "0x123" }, "stage2.rehearsal-wallet").status).toBe("unmet");
    expect(ev({ rehearsalWalletAddress: SIGNER.toUpperCase().replace("0X", "0x") }, "stage2.rehearsal-wallet").status).toBe("met");
    const noAuthorization = item(evaluate({ ...fullInput(), authorization: undefined }), "stage2.rehearsal-wallet");
    expect(noAuthorization.status).toBe("unknown");
    const differentSigner = fullInput();
    differentSigner.config!.signerAddress = OTHER_ADDRESS;
    expect(item(evaluate(differentSigner), "stage2.rehearsal-wallet").status).toBe("unmet");
  });

  test("reconciliation needs both the flag and zero open orders at start", () => {
    expect(ev({ existingOrdersReconciled: false }, "reconciliation.existing-orders").codes).toContain("not-reconciled");
    expect(ev({ openOrdersAtStart: 1 }, "reconciliation.existing-orders").codes).toContain("open-orders:1");
    expect(ev({ openOrdersAtStart: -1 }, "reconciliation.existing-orders").status).toBe("unmet");
    expect(ev({ openOrdersAtStart: null }, "reconciliation.existing-orders").status).toBe("unknown");
  });

  test("manifest structure: wrong schema version, unknown fields, bad risk lists and unusable files", () => {
    const manifest = (over: Loose) => evaluate({ ...fullInput(), evidence: validEvidence(over) });
    expect(item(manifest({ schemaVersion: 2 }), "evidence.manifest-valid").codes).toContain("invalid:schemaVersion");
    expect(item(manifest({ schemaVersion: undefined }), "evidence.manifest-valid").status).toBe("unmet");
    expect(item(manifest({ surprise: true }), "evidence.manifest-valid").codes).toContain("unknown-field:surprise");
    expect(item(manifest({ acknowledgedRisks: "all" }), "evidence.manifest-valid").codes).toContain("invalid:acknowledgedRisks");
    expect(item(manifest({ acknowledgedRisks: [...KNOWN_OPEN_RISKS.map((risk) => risk.id), "made-up-risk"] }), "evidence.manifest-valid").codes).toContain("unknown-risk");
    expect(item(manifest({ artifacts: [] }), "evidence.manifest-valid").codes).toContain("invalid:artifacts");
    expect(item(manifest({ artifacts: { paperSoakJournal: null, extra: null } }), "evidence.manifest-valid").codes).toContain("unknown-artifact:extra");
    for (const bad of [[], "text", 5, null]) {
      const report = evaluate({ ...fullInput(), evidence: bad });
      expect(item(report, "evidence.manifest-valid").codes).toContain("not-object");
      expect(item(report, "stage1.soak-duration").status).toBe("unknown");
    }
    for (const error of ["malformed-json", "unreadable"] as const) {
      const report = evaluate({ ...fullInput(), evidence: undefined, evidenceError: error });
      expect(item(report, "evidence.manifest-valid").status).toBe("unmet");
      expect(item(report, "evidence.manifest-valid").codes).toContain(error);
      expect(item(report, "stage1.soak-duration").status).toBe("unknown");
      expect(report.inputs.evidence).toBe(error);
    }
  });

  test("a risk that is not listed stays unknown even when the others are acknowledged", () => {
    const report = evaluate({ ...fullInput(), evidence: validEvidence({ acknowledgedRisks: ["profitability-unproven"] }) });
    expect(item(report, "risk.profitability-unproven").status).toBe("met");
    expect(item(report, "risk.no-quote-provenance").status).toBe("unknown");
    expect(report.knownOpenRisks.find((risk) => risk.id === "profitability-unproven")?.acknowledged).toBe(true);
  });

  test("the unfilled evidence template is structurally valid and gives no evidence at all", () => {
    const report = evaluate({ ...fullInput(), evidence: clone(EVIDENCE_TEMPLATE), artifactChecks: undefined });
    expect(item(report, "evidence.manifest-valid").status).toBe("met");
    for (const entry of report.items.filter((candidate) => ["stage1", "stage2", "reconciliation", "stage3", "open-risks"].includes(candidate.group))) {
      expect({ id: entry.id, status: entry.status }).toEqual({ id: entry.id, status: "unknown" });
    }
    expect(item(report, "evidence.artifacts-verified").status).toBe("unknown");
    expect(item(report, "authorization.signed").status).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Artifacts (hash-bound files; the CLI does the I/O and passes the verdicts in)
// ---------------------------------------------------------------------------

describe("artifact verification", () => {
  const artifacts = (over: Loose, checks?: Loose) => item(evaluate({
    ...fullInput(),
    evidence: validEvidence({ artifacts: { ...validEvidence().artifacts, ...over } }),
    ...(checks ? { artifactChecks: checks } : {}),
  }), "evidence.artifacts-verified");

  test("all four artifacts declared and verified is met; the required list is stable", () => {
    expect([...REQUIRED_ARTIFACTS]).toEqual(["paperSoakJournal", "replayOutput", "rehearsalOutput", "independentReviewReport"]);
    expect(artifacts({}).status).toBe("met");
  });

  test("a verdict other than match is unmet and names the artifact", () => {
    for (const status of ["mismatch", "missing", "not-regular-file", "unreadable", "outside-data-dir"]) {
      const entry = artifacts({}, { ...validChecks(), paperSoakJournal: { status } });
      expect({ status, result: entry.status }).toEqual({ status, result: "unmet" });
      expect(entry.codes).toContain(`${status}:paperSoakJournal`);
    }
  });

  test("declared but never verified by a caller is unknown, not met", () => {
    const entry = item(evaluate({ ...fullInput(), artifactChecks: undefined }), "evidence.artifacts-verified");
    expect(entry.status).toBe("unknown");
    expect(entry.codes).toContain("unverified:paperSoakJournal");
  });

  test("malformed declarations are unmet: partial entries, absolute paths, traversal, drive letters, bad hashes", () => {
    const bad: unknown[] = [
      { path: "soak.jsonl" },
      { sha256: HASH("1") },
      { path: "/etc/passwd", sha256: HASH("1") },
      { path: "C:/Users/x/soak.jsonl", sha256: HASH("1") },
      { path: "C:soak.jsonl", sha256: HASH("1") },
      { path: "..\\outside.jsonl", sha256: HASH("1") },
      { path: "sub/../../outside.jsonl", sha256: HASH("1") },
      { path: "\\\\server\\share\\x", sha256: HASH("1") },
      { path: "soak.jsonl", sha256: "abc" },
      { path: "soak.jsonl", sha256: `${"g".repeat(64)}` },
      { path: "", sha256: HASH("1") },
      { path: 5, sha256: HASH("1") },
      "soak.jsonl",
    ];
    for (const entry of bad) {
      const result = artifacts({ paperSoakJournal: entry });
      expect({ entry: JSON.stringify(entry), status: result.status }).toEqual({ entry: JSON.stringify(entry), status: "unmet" });
      expect(result.codes).toContain("invalid-declaration:paperSoakJournal");
    }
    expect(artifacts({ paperSoakJournal: { path: "nested/dir/soak.jsonl", sha256: HASH("a").toUpperCase() } }).status).toBe("met");
  });

  test("an invalid declaration outranks an unverified one, and an unverified one outranks nothing declared", () => {
    expect(artifacts({ paperSoakJournal: { path: "x" }, rehearsalOutput: null }).status).toBe("unmet");
    expect(artifacts({ rehearsalOutput: null }, validChecks()).status).toBe("unknown");
    expect(artifacts({ rehearsalOutput: null }, validChecks()).codes).toContain("absent:rehearsalOutput");
  });
});

// ---------------------------------------------------------------------------
// Config items
// ---------------------------------------------------------------------------

describe("config snapshot", () => {
  const snapshot = (over: Loose) => item(evaluate({ config: liveConfig(over), now: clock }), "config.snapshot-valid");

  test("invalid numbers and types make the snapshot unusable and the dependent items unknown", () => {
    const bad: Loose[] = [
      { bankrollUsd: 0 }, { bankrollUsd: -1 }, { maxLossUsd: Number.NaN }, { maxSpendUsd: Number.POSITIVE_INFINITY }, { tradeSizeMon: 0 },
      { maxPositionMon: 100, tradeSizeMon: 200 }, { maxCapitalFraction: 0 }, { maxCapitalFraction: 1.5 }, { quoteIntervalBlocks: 0 },
      { quoteIntervalBlocks: 1.5 }, { minConfidence: -0.1 }, { minConfidence: 1.1 }, { dryRun: "false" }, { model: "" }, { economicGate: "true" },
      { walletKeyPresent: "yes" }, { jevKeyPresent: 1 }, { jevModelId: 5 }, { autoDeposit: "no" }, { liveAckSet: "yes" }, { signerAddress: 5 },
    ];
    for (const over of bad) {
      expect({ over: JSON.stringify(over), status: snapshot(over).status }).toEqual({ over: JSON.stringify(over), status: "unmet" });
    }
    const unusable = evaluate({ config: liveConfig({ bankrollUsd: Number.NaN }), now: clock });
    expect(item(unusable, "config.live-requested").status).toBe("unknown");
    expect(item(unusable, "config.model-jev").status).toBe("unknown");
    expect(unusable.cadenceProfile).toBe("unknown");
  });

  test("optional snapshot fields may be absent", () => {
    const minimal = liveConfig() as Loose;
    for (const key of ["jevModelId", "autoDeposit", "liveAckSet", "signerAddress"]) delete minimal[key];
    expect(item(evaluate({ config: minimal as ConfigSnapshot, now: clock }), "config.snapshot-valid").status).toBe("met");
  });

  test("floating model aliases are rejected as not pinned, exact versions pass", () => {
    for (const id of ["jev-latest", "JEV-LATEST", "latest", ""]) {
      expect(item(evaluate({ config: liveConfig({ jevModelId: id }), now: clock }), "config.model-id-pinned").status).toBe("unmet");
    }
    expect(item(evaluate({ config: liveConfig({ jevModelId: "jev-1.13.0" }), now: clock }), "config.model-id-pinned").status).toBe("met");
  });
});

// ---------------------------------------------------------------------------
// Claims, cadence profile and the code-gate notice
// ---------------------------------------------------------------------------

describe("claims and notices", () => {
  const claimOf = (report: LiveQualificationReport, id: string) => report.claims.find((claim) => claim.id === id);

  test("claims are informational and never change readiness", () => {
    const paper = evaluate({ config: paperConfig(), now: clock });
    expect(paper.claims.map((claim) => claim.id)).toEqual(["jev-decides", "real-trades-real-wallet", "order-every-300ms-block", "demo-is-live-dashboard"]);
    expect(claimOf(paper, "jev-decides")?.supportedByConfig).toBe(false);
    expect(claimOf(paper, "real-trades-real-wallet")?.supportedByConfig).toBe(false);
    expect(claimOf(paper, "order-every-300ms-block")?.supportedByConfig).toBe(false);
    expect(claimOf(paper, "demo-is-live-dashboard")?.supportedByConfig).toBeNull();
    const everyBlock = evaluate({ config: liveConfig({ quoteIntervalBlocks: 1, economicGate: false, minConfidence: 0 }), now: clock });
    expect(claimOf(everyBlock, "order-every-300ms-block")?.supportedByConfig).toBe(true);
    expect(claimOf(everyBlock, "order-every-300ms-block")?.note).toContain("não provada");
    expect(claimOf(everyBlock, "jev-decides")?.supportedByConfig).toBe(true);
    expect(claimOf(everyBlock, "real-trades-real-wallet")?.supportedByConfig).toBe(true);
    const none = evaluate({ config: null, now: clock });
    expect(none.claims.slice(0, 3).every((claim) => claim.supportedByConfig === null)).toBe(true);
    const full = evaluate(fullInput());
    expect(full.summary.readyForOwnerReview).toBe(true);
    expect(claimOf(full, "order-every-300ms-block")?.supportedByConfig).toBe(false);
    expect(claimOf(full, "order-every-300ms-block")?.note).toContain("perfil gated");
  });

  test("the output states that the code gate is separate and unchanged and that it grants no permission", () => {
    for (const input of [fullInput(), { config: null, now: clock }, { config: paperConfig(), now: clock }] as LooseInput[]) {
      const result = evaluate(input);
      expect(result.schema).toBe("live-qualification-v1");
      expect(result.summary.grantsPermission).toBe(false);
      expect(result.summary.codeGate.status).toBe("separate-and-unchanged");
      expect(result.summary.codeGate.location).toContain("Market.init()");
      expect(result.summary.codeGate.note).toContain("inalterado");
      expect(result.summary.notice).toContain("Market.init()");
      expect(result.summary.notice).toContain("não autoriza");
      expect(result.summary.notice).toContain("checklist");
    }
  });

  test("nothing in the output implies permission to trade, even when the checklist is complete", () => {
    const text = JSON.stringify(evaluate(fullInput()));
    for (const phrase of [/approved/i, /authorized: true/i, /\bgo[- ]live\b/i, /safe to trade/i, /cleared to trade/i, /ready to trade/i, /ready for live/i, /pronto para operar/i, /liberado/i, /aprovado/i, /permitido operar/i]) {
      expect({ phrase: String(phrase), found: phrase.test(text) }).toEqual({ phrase: String(phrase), found: false });
    }
    expect(/"(financiallyAuthorized|liveExecutionEnabled|permissionToTrade|authorized|grantsPermission)":\s*true/.test(text)).toBe(false);
  });

  test("the report always names the policy it applied", () => {
    const result = evaluate({ ...fullInput(), policy: { minSoakHours: 8 } });
    expect(result.policy.minSoakHours).toBe(8);
    expect(result.policy.maxLateBlockRate).toBe(DEFAULT_QUALIFICATION_POLICY.maxLateBlockRate);
    expect(DEFAULT_QUALIFICATION_POLICY).toMatchObject({ blockTimeMs: 300, maxDecisionMs: 1500, minSoakHours: 24, minDecisionSamples: 100, maxLateBlockRate: 0.05, maxSessionMinutes: 60 });
  });
});

// ---------------------------------------------------------------------------
// Determinism, immutability, secrets and rendered text
// ---------------------------------------------------------------------------

describe("determinism, immutability and secrecy", () => {
  test("the same input gives byte-identical output, and only the injected clock moves evaluatedAt", () => {
    const first = JSON.stringify(evaluate(fullInput()));
    expect(JSON.stringify(evaluate(fullInput()))).toBe(first);
    expect(evaluate(fullInput()).evaluatedAt).toBe("2026-10-11T12:00:00.000Z");
    const later = evaluate({ ...fullInput(), now: () => NOW + 3_600_000 });
    expect(later.evaluatedAt).toBe("2026-10-11T13:00:00.000Z");
  });

  test("the injected clock decides expiry: the same record is valid before and expired after", () => {
    const before = evaluate({ ...fullInput(), now: () => Date.parse("2026-10-12T10:59:59Z") });
    const after = evaluate({ ...fullInput(), now: () => Date.parse("2026-10-12T11:00:00Z") });
    expect(item(before, "authorization.time-window").status).toBe("met");
    expect(item(after, "authorization.time-window").codes).toContain("expired");
  });

  test("the wall clock and randomness are never consulted", () => {
    const realNow = Date.now;
    const realRandom = Math.random;
    Date.now = () => { throw new Error("wall clock used"); };
    Math.random = () => { throw new Error("randomness used"); };
    try {
      expect(() => evaluate(fullInput())).not.toThrow();
      expect(() => evaluate({ config: null, now: clock })).not.toThrow();
    } finally { Date.now = realNow; Math.random = realRandom; }
  });

  test("a clock that returns a non-finite value is a programming error", () => {
    expect(() => evaluate({ ...fullInput(), now: () => Number.NaN })).toThrow(RangeError);
    expect(() => evaluate({ ...fullInput(), now: () => Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => evaluate({ ...fullInput(), now: (() => "2026-10-11") as unknown as () => number })).toThrow(RangeError);
  });

  test("a malformed policy override is rejected instead of silently weakening a threshold", () => {
    for (const bad of [{ minSoakHours: -1 }, { minSoakHours: Number.NaN }, { maxLateBlockRate: Number.POSITIVE_INFINITY }, { maxSessionMinutes: "60" }]) {
      expect(() => evaluate({ ...fullInput(), policy: bad })).toThrow(RangeError);
    }
    expect(() => evaluate({ ...fullInput(), policy: { notAThreshold: 5 } })).not.toThrow();
    expect(evaluate({ ...fullInput(), policy: { notAThreshold: 5 } }).policy).toEqual({ ...DEFAULT_QUALIFICATION_POLICY });
    expect(evaluate({ ...fullInput(), policy: { minSoakHours: undefined } }).policy.minSoakHours).toBe(DEFAULT_QUALIFICATION_POLICY.minSoakHours);
  });

  test("inputs are never mutated: deeply frozen inputs evaluate without error", () => {
    const input = deepFreeze(fullInput());
    const before = JSON.stringify(input);
    expect(() => evaluate(input)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  test("unknown or hostile properties on the snapshot, record and manifest are never echoed", () => {
    const canary = "CANARY_SECRET_VALUE_9f3a";
    const input = fullInput();
    Object.assign(input.config!, { privateKey: canary, jevApiKey: canary, rpcUrl: `https://rpc.example/?key=${canary}` });
    input.authorization = validAuthorization({ owner: canary, acknowledgement: `OWN_FUNDS_RISK ${canary} ${"x".repeat(40)}` });
    expect(JSON.stringify(evaluate(input)).includes(canary)).toBe(false);
    const hostile = fullInput();
    hostile.authorization = { ...validAuthorization(), extraField: canary };
    hostile.evidence = { ...validEvidence(), extraField: canary };
    const hostileReport = evaluate(hostile);
    expect(JSON.stringify(hostileReport).includes(canary)).toBe(false);
    expect(item(hostileReport, "authorization.fields-valid").codes).toContain("unknown-field:extraField");
    expect(item(hostileReport, "evidence.manifest-valid").codes).toContain("unknown-field:extraField");
  });

  test("oversized or odd unknown field names are masked and only a few are reported", () => {
    const odd = "SECRET-LOOKING NAME WITH SPACES AND A VERY LONG TAIL THAT MUST NOT BE ECHOED BACK";
    const record = validAuthorization({ [odd]: 1, [`${"a".repeat(41)}`]: 2, f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 });
    const entry = item(evaluate({ ...fullInput(), authorization: record }), "authorization.fields-valid");
    expect(entry.codes).toContain("unknown-field:<invalid-name>");
    expect(JSON.stringify(entry).includes("MUST NOT BE ECHOED")).toBe(false);
    expect(entry.codes.filter((code) => code.startsWith("unknown-field:")).length).toBeLessThanOrEqual(5);
  });

  test("the authorization owner, wallet and acknowledgement text are not copied into the report", () => {
    const text = JSON.stringify(evaluate(fullInput()));
    expect(text.includes("Dono Ficticio de Teste")).toBe(false);
    expect(text.includes("texto de teste do dono ficticio")).toBe(false);
    expect(text.includes(SIGNER)).toBe(false);
  });

  test("rendered text never contains middle dots, em dashes, en dashes or similar marks, even when operator text is echoed", () => {
    const samples: LooseInput[] = [
      fullInput(), { config: paperConfig(), now: clock }, { config: null, now: clock },
      { ...fullInput(), evidence: validEvidence({ paperSoakDataSource: "real\u2014market\u00B7paper\u2013x", paperSoakModelId: "m\u2212odel\u2022" }) },
      { ...fullInput(), evidence: validEvidence({ paperSoakDataSource: 5 }) },
    ];
    for (const sample of samples) {
      const text = JSON.stringify(evaluate(sample));
      expect(BANNED.test(text)).toBe(false);
    }
  });

  test("echoed operator text is clipped and control characters are removed", () => {
    const long = "x".repeat(500);
    const result = evaluate({ ...fullInput(), evidence: validEvidence({ paperSoakDataSource: `${long}\n\u0007bell` }) });
    const entry = item(result, "stage1.soak-real-rpc");
    expect(entry.status).toBe("unmet");
    expect(entry.evidence.length + entry.reason.length).toBeLessThan(400);
    expect(/[\u0000-\u001F\u007F]/.test(entry.evidence + entry.reason)).toBe(false);
    expect(entry.evidence + entry.reason).not.toContain("x".repeat(100));
  });
});

// ---------------------------------------------------------------------------
// Documentation stays in sync with the code (spec-first)
// ---------------------------------------------------------------------------

describe("documentation consistency", () => {
  const docPath = resolve(import.meta.dir, "../docs/LIVE-QUALIFICATION.md");
  const doc = Bun.file(docPath).text();

  const jsonBlockAfter = async (heading: string): Promise<unknown> => {
    const text = await doc;
    const start = text.indexOf(heading);
    expect(start).toBeGreaterThan(-1);
    const match = /```json\r?\n([\s\S]*?)\r?\n```/.exec(text.slice(start));
    expect(match).not.toBeNull();
    return JSON.parse(match![1]!);
  };

  test("every checklist item id and every known risk id is documented", async () => {
    const text = await doc;
    for (const id of ALL_IDS) expect({ id, documented: text.includes(`\`${id}\``) }).toEqual({ id, documented: true });
    for (const risk of KNOWN_OPEN_RISKS) expect(text.includes(`\`${risk.id}\``)).toBe(true);
  });

  test("the JSON templates in the document are exactly the exported templates", async () => {
    expect(await jsonBlockAfter("### Modelo do registro (JSON)")).toEqual(AUTHORIZATION_TEMPLATE);
    expect(await jsonBlockAfter("### Modelo do manifesto (JSON)")).toEqual(EVIDENCE_TEMPLATE);
  });

  test("the document states the non-negotiables and keeps the rendered-text rules", async () => {
    const text = await doc;
    expect(text).toContain("nunca preenche o registro de autorização");
    expect(text).toContain("nunca fornece chaves");
    expect(text).toContain("nunca executa uma sessão live");
    expect(text).toContain("Market.init()");
    expect(text).toContain("LIVE_ACK");
    expect(BANNED.test(text)).toBe(false);
  });

  test("documented policy numbers match the defaults", async () => {
    const text = await doc;
    const p = DEFAULT_QUALIFICATION_POLICY;
    expect(text).toContain(`paperSoakHours >= ${p.minSoakHours}`);
    expect(text).toContain(`lateBlockRate <= ${p.maxLateBlockRate}`);
    expect(text).toContain(`decisionSampleCount >= ${p.minDecisionSamples}`);
    expect(text).toContain(`até ${p.maxSessionMinutes}`);
    expect(text).toContain(`${p.maxAuthorizationValidityHours} horas`);
    expect(text).toContain(`${p.blockTimeMs} ms`);
    expect(text).toContain(`${p.maxDecisionMs} ms`);
  });
});

// ---------------------------------------------------------------------------
// Purity of the module (static guard)
// ---------------------------------------------------------------------------

/** Executable code only: comments are dropped by the transpiler and whitespace is collapsed. */
function liveCode(path: string): string {
  const source = readFileSync(path, "utf8");
  return new Bun.Transpiler({ loader: "ts" }).transformSync(source).replace(/\s+/g, " ");
}

/** A syntactically valid but throwaway key: never funded, never reused, only needed so config parsing accepts a live-shaped environment. */
const randomKey = () => `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;

describe("purity guard", () => {
  test("src/live-qualification.ts reads no environment, files, network or clock and imports nothing that could", () => {
    const code = liveCode(resolve(import.meta.dir, "live-qualification.ts"));
    const forbidden = [
      "process.env", "Bun.env", "import.meta.env", "Bun.file", "Bun.write", "Bun.spawn", "Bun.serve", "fetch(", "WebSocket", "XMLHttpRequest",
      "node:fs", "node:net", "node:http", "node:https", "node:child_process", "node:os", "Date.now", "new Date()", "Math.random", "randomUUID",
      "signTransaction", "sendTransaction", "eth_sendRawTransaction", "ethers", "require(",
    ];
    for (const token of forbidden) expect({ token, found: code.includes(token) }).toEqual({ token, found: false });
    expect(/\bimport\b\s*(?:[{*\w"']|\()/.test(code)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guard: a future edit must not silently drop the execution gate
// ---------------------------------------------------------------------------

describe("execution gate guard", () => {
  const marketPath = resolve(import.meta.dir, "market.ts");
  const configPath = resolve(import.meta.dir, "config.ts");

  test("Market.init() still starts with the unconditional wallet refusal, in executable code and not in a comment", () => {
    const code = liveCode(marketPath);
    expect(code).toContain('async init() { if (this.wallet) throw new Error("Live execution is not qualified: reconcile existing orders, wallet/margin balances and restart capital baseline first. Use DRY_RUN=true.");');
    expect(readFileSync(marketPath, "utf8")).toContain("Live execution is not qualified");
  });

  test("the wallet only exists outside dry runs, so the refusal covers every live construction", () => {
    const code = liveCode(marketPath);
    expect(code).toContain("wallet = config.dryRun ? null : new ethers.Wallet(config.privateKey, this.provider);");
  });

  test("config.ts still requires PRIVATE_KEY, MODEL=jev and LIVE_ACK=OWN_FUNDS_RISK for live, in executable code", () => {
    const code = liveCode(configPath);
    expect(code).toContain('if (!dryRun && (!privateKey || model !== "jev" || env("LIVE_ACK") !== "OWN_FUNDS_RISK")) throw new Error("Live requires PRIVATE_KEY, MODEL=jev, TYPESAFE_AI_API_KEY and LIVE_ACK=OWN_FUNDS_RISK");');
    expect(code).toContain('if (model === "jev" && !env("TYPESAFE_AI_API_KEY")) throw new Error("MODEL=jev requires TYPESAFE_AI_API_KEY");');
  });

  test("loadConfig refuses live mode unless every requirement is present", async () => {
    const { loadConfig } = await import("./config");
    const key = randomKey();
    const live = { DRY_RUN: "false", PRIVATE_KEY: key, MODEL: "jev", TYPESAFE_AI_API_KEY: "synthetic-test-value", LIVE_ACK: "OWN_FUNDS_RISK" };
    expect(loadConfig(live).dryRun).toBe(false);
    for (const missing of ["PRIVATE_KEY", "MODEL", "TYPESAFE_AI_API_KEY", "LIVE_ACK"]) {
      const partial: Record<string, string | undefined> = { ...live };
      delete partial[missing];
      expect(() => loadConfig(partial)).toThrow();
    }
    expect(() => loadConfig({ ...live, LIVE_ACK: "yes" })).toThrow();
    expect(() => loadConfig({ ...live, LIVE_ACK: "own_funds_risk" })).toThrow();
    expect(() => loadConfig({ ...live, MODEL: "mock" })).toThrow();
    expect(loadConfig({ PRIVATE_KEY: key }).dryRun).toBe(true);
  });

  test("Market.init() really refuses when a wallet exists (isolated child process, no reachable RPC)", async () => {
    const script = [
      'const { Market } = await import("./src/market");',
      "try { await new Market().init(); console.log('NO_THROW'); }",
      "catch (error) { console.log('REFUSED:' + (error && error.message)); }",
    ].join("\n");
    const privateKey = randomKey();
    // Async spawn on purpose: a Bun.spawnSync with a timeout here made an unrelated spawnSync in a later file fail at once.
    const child = Bun.spawn([process.execPath, "--no-env-file", "-e", script], {
      cwd: resolve(import.meta.dir, ".."),
      env: {
        SystemRoot: process.env.SystemRoot ?? "C:/Windows", PATH: process.env.PATH ?? "",
        DRY_RUN: "false", PRIVATE_KEY: privateKey, MODEL: "jev", TYPESAFE_AI_API_KEY: "synthetic-test-value", LIVE_ACK: "OWN_FUNDS_RISK",
        RPC_URL: "http://127.0.0.1:9", READ_RPC_URL: "http://127.0.0.1:9",
      },
      stdout: "pipe", stderr: "pipe",
    });
    const killer = setTimeout(() => child.kill(), 30_000);
    try {
      const [output, errors] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(output).toContain("REFUSED:Live execution is not qualified");
      expect(output).not.toContain("NO_THROW");
      expect((output + errors).includes(privateKey)).toBe(false);
    } finally { clearTimeout(killer); }
  }, { timeout: 40_000 });
});
