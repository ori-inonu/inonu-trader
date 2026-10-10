/**
 * Live-execution qualification checklist.
 *
 * PURE and DETERMINISTIC: no environment, file, network, RPC, wallet or wall-clock access. The caller (see
 * scripts/qualify-live.ts) does all I/O and injects the clock. The specification is docs/LIVE-QUALIFICATION.md.
 *
 * What the result means:
 * - "met" only with explicit, valid evidence. "unknown" when evidence is absent. "unmet" when evidence exists but is
 *   invalid or does not satisfy the criterion.
 * - `summary.readyForOwnerReview` only says that every checklist item is met. It is NOT permission to trade. The
 *   execution gate in Market.init() (src/market.ts) and the LIVE_ACK requirement in src/config.ts are separate and
 *   unchanged; nothing here lifts, weakens or bypasses them.
 */

export type ItemStatus = "met" | "unmet" | "unknown";
export type ItemGroup = "config" | "authorization" | "evidence" | "stage1" | "stage2" | "reconciliation" | "stage3" | "open-risks";
export type InputError = "unreadable" | "malformed-json";
export type InputState = "absent" | "present" | InputError;
export type ArtifactStatus = "match" | "mismatch" | "missing" | "not-regular-file" | "unreadable" | "outside-data-dir";
export type CadenceProfile = "every-block" | "gated" | "unknown";

/** Sanitized view of the configuration. Secrets appear only as booleans (plus the public address derived from the key). */
export interface ConfigSnapshot {
  dryRun: boolean;
  /** MODEL: "mock" or "jev". */
  model: string;
  /** JEV_MODEL_ID. */
  jevModelId?: string;
  bankrollUsd: number;
  maxLossUsd: number;
  maxSpendUsd: number;
  tradeSizeMon: number;
  maxPositionMon: number;
  maxCapitalFraction: number;
  quoteIntervalBlocks: number;
  minConfidence: number;
  economicGate: boolean;
  walletKeyPresent: boolean;
  jevKeyPresent: boolean;
  /** LIVE_ACK === "OWN_FUNDS_RISK". */
  liveAckSet?: boolean;
  autoDeposit?: boolean;
  /** Public address derived from PRIVATE_KEY by the caller; null/undefined when no key is available. */
  signerAddress?: string | null;
}

/** Verification thresholds. Proposals for the owner to review; changing them is a reviewed commit. */
export interface QualificationPolicy {
  blockTimeMs: number;
  maxDecisionMs: number;
  minSoakHours: number;
  minSoakFills: number;
  /** Decisions behind the latency percentiles; fewer than this and p95 or p99 describe nothing. */
  minDecisionSamples: number;
  maxLateBlockRate: number;
  maxLossFractionOfBankroll: number;
  maxSpendFractionOfBankroll: number;
  maxSessionMinutes: number;
  maxAuthorizationValidityHours: number;
  clockSkewToleranceMs: number;
  maxRehearsalAgeHours: number;
  minAcknowledgementLength: number;
}

export const DEFAULT_QUALIFICATION_POLICY: Readonly<QualificationPolicy> = Object.freeze({
  blockTimeMs: 300,
  maxDecisionMs: 1500,
  minSoakHours: 24,
  minSoakFills: 1,
  minDecisionSamples: 100,
  maxLateBlockRate: 0.05,
  maxLossFractionOfBankroll: 0.05,
  maxSpendFractionOfBankroll: 0.05,
  maxSessionMinutes: 60,
  maxAuthorizationValidityHours: 168,
  clockSkewToleranceMs: 300_000,
  maxRehearsalAgeHours: 24,
  minAcknowledgementLength: 40,
});

/** The term the owner must type inside the acknowledgement; it is the same term LIVE_ACK requires. */
export const ACKNOWLEDGEMENT_TERM = "OWN_FUNDS_RISK";

/** Hash-bound local files the manifest must declare. The CLI verifies them and passes the verdicts in `artifactChecks`. */
export const REQUIRED_ARTIFACTS = ["paperSoakJournal", "replayOutput", "rehearsalOutput", "independentReviewReport"] as const;

export interface ArtifactCheck { status: ArtifactStatus }

export interface LiveQualificationInput {
  /** null/undefined: the configuration could not be loaded. */
  config: ConfigSnapshot | null | undefined;
  /** Parsed JSON of data/live-authorization.json; undefined when the file is absent. Validated strictly here. */
  authorization?: unknown;
  authorizationError?: InputError;
  /** Parsed JSON of data/live-evidence.json; undefined when the file is absent. */
  evidence?: unknown;
  evidenceError?: InputError;
  /** Verdicts about the manifest's artifacts, produced by the caller's file I/O. */
  artifactChecks?: Readonly<Record<string, ArtifactCheck | undefined>>;
  /** Injected clock (epoch milliseconds). Required so the result is deterministic. */
  now: () => number;
  policy?: Partial<QualificationPolicy>;
}

export interface ChecklistItem {
  id: string;
  group: ItemGroup;
  requirement: string;
  codeOrDocReference: string;
  status: ItemStatus;
  /** What was observed, or "no evidence". Never copies secrets, names or free text without clipping. */
  evidence: string;
  /** Why the item is not met; empty when met. */
  reason: string;
  /** Stable machine-readable tokens; empty when met. */
  codes: string[];
}

export interface KnownOpenRisk {
  id: string;
  risk: string;
  source: string;
  coveredBy: readonly string[];
}

export interface ClaimAssessment {
  id: string;
  claim: string;
  /** true/false from the configuration alone; null when the configuration cannot say. */
  supportedByConfig: boolean | null;
  note: string;
}

export interface CodeGateNotice {
  status: "separate-and-unchanged";
  location: string;
  note: string;
}

export interface LiveQualificationReport {
  schema: "live-qualification-v1";
  evaluatedAt: string;
  inputs: { config: "present" | "absent"; authorization: InputState; evidence: InputState };
  cadenceProfile: CadenceProfile;
  policy: QualificationPolicy;
  items: ChecklistItem[];
  summary: {
    readyForOwnerReview: boolean;
    blockers: string[];
    counts: { met: number; unmet: number; unknown: number; total: number };
    /** Always false: this report never grants permission to trade. */
    grantsPermission: false;
    codeGate: CodeGateNotice;
    notice: string;
  };
  claims: ClaimAssessment[];
  knownOpenRisks: (KnownOpenRisk & { status: "open"; acknowledged: boolean })[];
}

const DOC = "docs/LIVE-QUALIFICATION.md";
const RELEASE = "docs/RELEASE-v0.0.2.md";

export const KNOWN_OPEN_RISKS: readonly KnownOpenRisk[] = deepFreeze([
  {
    id: "pending-receipt-halts-quotes",
    risk: "Uma cotação enviada com recibo pendente bloqueia novas cotações até o recibo ser observado; o efeito na cadência nunca foi medido em RPC real.",
    source: `${RELEASE} (limitações conhecidas)`,
    coveredBy: ["stage1.pending-receipt-cadence"],
  },
  {
    id: "no-quote-provenance",
    risk: "O tipo Quote de produção não carrega proveniência; as fixtures de recibo só exercitam passagem direta.",
    source: `${RELEASE} (limitações conhecidas)`,
    coveredBy: [],
  },
  {
    id: "unlinked-fill-recorded-journal",
    risk: "O diário readiness gravado tem um fill sem vínculo, preservado e não reparado; o replay dele não é considerado passando.",
    source: `${RELEASE} (limitações conhecidas)`,
    coveredBy: ["stage1.replay-reconciled"],
  },
  {
    id: "soak-24h-never-run",
    risk: "A operação de 24 horas nunca foi executada; um soak em paper não qualifica operação live prolongada.",
    source: `${RELEASE} (capacidades)`,
    coveredBy: ["stage1.soak-duration"],
  },
  {
    id: "same-block-confirmation-unqualified",
    risk: "A confirmação estrita no mesmo bloco depende da semântica de cabeça de bloco da Monad e do tempo real de recibo, nunca observados.",
    source: `${RELEASE} (contrato em aberto)`,
    coveredBy: ["stage1.latency-distribution", "stage1.late-block-rate"],
  },
  {
    id: "profitability-unproven",
    risk: "A lucratividade não está estabelecida: não há evidência fora da amostra, e a sessão limitada é qualificação técnica.",
    source: `${RELEASE} (capacidades)`,
    coveredBy: [],
  },
]);

/** Placeholders only: every field fails validation until the owner fills it. Mirrors the template in the doc. */
export const AUTHORIZATION_TEMPLATE: Readonly<Record<string, unknown>> = deepFreeze({
  schemaVersion: 1,
  owner: "",
  date: "",
  walletAddress: "",
  maxLossUsd: null,
  maxSpendUsd: null,
  tradeSizeMon: null,
  maxPositionMon: null,
  maxCapitalFraction: null,
  sessionDurationMinutes: null,
  allowedModelId: "",
  expiry: "",
  acknowledgement: "",
});

/** Placeholders only: null means "no evidence". Mirrors the template in the doc. */
export const EVIDENCE_TEMPLATE: Readonly<Record<string, unknown>> = deepFreeze({
  schemaVersion: 1,
  paperSoakHours: null,
  paperSoakDataSource: null,
  paperSoakModelId: null,
  paperSoakLatchedStop: null,
  paperSoakFillCount: null,
  decisionSampleCount: null,
  decisionLatencyP50Ms: null,
  decisionLatencyP95Ms: null,
  decisionLatencyP99Ms: null,
  lateBlockRate: null,
  pendingReceiptCadenceMeasured: null,
  receiptLagBlocksP95: null,
  quoteBlockFraction: null,
  replayReconciled: null,
  noUnknownCosts: null,
  soakGasUsd: null,
  soakJevUsd: null,
  soakMakerFeeUsd: null,
  rehearsalAt: null,
  rehearsalWalletAddress: null,
  rehearsalNonceBefore: null,
  rehearsalNonceAfter: null,
  rehearsalGasLimit: null,
  rehearsalMarginMon: null,
  rehearsalMarginUsdc: null,
  rehearsalVaultStateRead: null,
  rehearsalWalletDedicated: null,
  existingOrdersReconciled: null,
  openOrdersAtStart: null,
  balancesReconciled: null,
  restartBaselineReconciled: null,
  killSwitchDrilled: null,
  emergencyCancelDrilled: null,
  independentReviewDone: null,
  authorizationSigned: null,
  acknowledgedRisks: [],
  artifacts: { paperSoakJournal: null, replayOutput: null, rehearsalOutput: null, independentReviewReport: null },
});

export const CODE_GATE_NOTICE: Readonly<CodeGateNotice> = Object.freeze({
  status: "separate-and-unchanged",
  location: "src/market.ts Market.init() e src/config.ts (LIVE_ACK)",
  note: "O bloqueio de execução em Market.init() está inalterado e é separado deste relatório: nada aqui o levanta, enfraquece ou contorna. Só um commit revisado do dono pode levantá-lo.",
});

const NOTICE =
  "A checklist completa significa apenas que há evidência registrada para cada item; isso não autoriza operar. " +
  "O bloqueio em Market.init() permanece inalterado. Nenhuma transação foi enviada, assinada ou depositada, e nenhum approve de token foi feito. " +
  "Só o dono decide, fora de qualquer sessão do assistente.";

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const own = (record: Raw, key: string): unknown => (Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined);
const BANNED_MARKS = new RegExp(`[${[0xb7, 0x2013, 0x2014, 0x2212, 0x2022, 0x2219, 0x22c5, 0x2027, 0x30fb].map((code) => String.fromCharCode(code)).join("")}]`, "g");
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;
const SAFE_NAME = /^[A-Za-z0-9_.-]{1,40}$/;
const EPSILON = 1e-9;

/** Echo of operator-supplied text: no banned punctuation, no control characters, clipped. */
function clip(value: unknown, max = 60): string {
  const text = typeof value === "string" ? value
    : typeof value === "number" || typeof value === "boolean" ? String(value)
    : value === null ? "null" : value === undefined ? "undefined" : Array.isArray(value) ? "array" : typeof value;
  const clean = text.replace(BANNED_MARKS, "-").replace(CONTROL_CHARS, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

const safeName = (name: string): string => (SAFE_NAME.test(name) ? name : "<invalid-name>");
/** 0.05 -> "5" without floating point noise. */
const pct = (fraction: number): string => String(Math.round(fraction * 10_000) / 100);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
const lte = (value: number, limit: number): boolean => value <= limit + EPSILON * Math.max(1, Math.abs(limit));
const addressKey = (address: string): string => address.toLowerCase();
const isZeroAddress = (address: string): boolean => /^0x0{40}$/i.test(address);
const unique = (values: string[]): string[] => [...new Set(values)];

const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Strict ISO 8601 date and time with an explicit zone, as epoch milliseconds. Unlike Date.parse it rejects nonexistent
 * calendar days, leap seconds, hour 24, missing zones and date-only strings.
 */
export function parseIsoTimestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, fraction, zone, sign, offsetHour, offsetMinute] = match;
  const year = Number(y), month = Number(mo), day = Number(d), hour = Number(h), minute = Number(mi), second = Number(s);
  if (year < 1970 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  let offsetMinutes = 0;
  if (zone !== "Z") {
    const oh = Number(offsetHour), om = Number(offsetMinute);
    if (oh > 23 || om > 59) return null;
    offsetMinutes = (sign === "-" ? -1 : 1) * (oh * 60 + om);
  }
  const millis = fraction ? Number(fraction.padEnd(3, "0").slice(0, 3)) : 0;
  const result = Date.UTC(year, month - 1, day, hour, minute, second, millis) - offsetMinutes * 60_000;
  return Number.isFinite(result) ? result : null;
}

// ---------------------------------------------------------------------------
// Typed field readers (absent vs invalid vs ok)
// ---------------------------------------------------------------------------

type Read<T> = { kind: "absent" } | { kind: "invalid" } | { kind: "ok"; value: T };
const ABSENT: Read<never> = { kind: "absent" };
const INVALID: Read<never> = { kind: "invalid" };
const okRead = <T>(value: T): Read<T> => ({ kind: "ok", value });

interface NumberRule { min?: number; max?: number; exclusiveMin?: boolean; integer?: boolean }

function readNumber(record: Raw, key: string, rule: NumberRule = {}): Read<number> {
  const raw = own(record, key);
  if (raw === undefined || raw === null) return ABSENT;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return INVALID;
  if (rule.integer && !Number.isSafeInteger(raw)) return INVALID;
  if (rule.min !== undefined && (rule.exclusiveMin ? raw <= rule.min : raw < rule.min)) return INVALID;
  if (rule.max !== undefined && raw > rule.max) return INVALID;
  return okRead(raw);
}

function readBoolean(record: Raw, key: string): Read<boolean> {
  const raw = own(record, key);
  if (raw === undefined || raw === null) return ABSENT;
  return typeof raw === "boolean" ? okRead(raw) : INVALID;
}

function readText(record: Raw, key: string): Read<string> {
  const raw = own(record, key);
  if (raw === undefined || raw === null) return ABSENT;
  return typeof raw === "string" && raw.trim() !== "" ? okRead(raw) : INVALID;
}

function readTime(record: Raw, key: string): Read<number> {
  const raw = own(record, key);
  if (raw === undefined || raw === null) return ABSENT;
  const parsed = parseIsoTimestamp(raw);
  return parsed === null ? INVALID : okRead(parsed);
}

function readAddress(record: Raw, key: string): Read<string> {
  const raw = own(record, key);
  if (raw === undefined || raw === null) return ABSENT;
  return typeof raw === "string" && HEX_ADDRESS.test(raw) && !isZeroAddress(raw) ? okRead(raw) : INVALID;
}

type Reads = Record<string, Read<unknown>>;
type Values<R extends Reads> = { [K in keyof R]: R[K] extends Read<infer U> ? U : never };

function gather<R extends Reads>(reads: R): { invalid: string[]; absent: string[]; values: Values<R> } {
  const invalid: string[] = [];
  const absent: string[] = [];
  const values: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(reads)) {
    if (read.kind === "invalid") invalid.push(key);
    else if (read.kind === "absent") absent.push(key);
    else values[key] = read.value;
  }
  return { invalid, absent, values: values as Values<R> };
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

interface Outcome { status: ItemStatus; evidence: string; reason: string; codes: string[] }

const pass = (evidence: string): Outcome => ({ status: "met", evidence, reason: "", codes: [] });
const fail = (codes: string[], reason: string, evidence: string): Outcome => ({ status: "unmet", evidence, reason, codes: unique(codes) });
const unproven = (codes: string[], reason: string, evidence = "Sem evidência."): Outcome => ({ status: "unknown", evidence, reason, codes: unique(codes) });

/** invalid values outrank absent ones; returns null when every field was read. */
function fieldProblem(g: { invalid: string[]; absent: string[] }): Outcome | null {
  if (g.invalid.length > 0) {
    return fail(g.invalid.map((key) => `invalid:${key}`), `Valor inválido no manifesto: ${g.invalid.join(", ")}.`, `Campos inválidos: ${g.invalid.join(", ")}.`);
  }
  if (g.absent.length > 0) {
    return unproven(g.absent.map((key) => `absent:${key}`), `Sem evidência no manifesto: ${g.absent.join(", ")}.`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Configuration snapshot
// ---------------------------------------------------------------------------

type CfgState = { state: "absent" } | { state: "invalid"; problems: string[] } | { state: "ok"; value: ConfigSnapshot };

function readConfig(raw: unknown): CfgState {
  if (raw === null || raw === undefined) return { state: "absent" };
  if (!isRecord(raw)) return { state: "invalid", problems: ["not-object"] };
  const problems: string[] = [];
  const positive = (key: string): number => {
    const read = readNumber(raw, key, { min: 0, exclusiveMin: true });
    if (read.kind !== "ok") { problems.push(`invalid-config:${key}`); return 1; }
    return read.value;
  };
  const flag = (key: string): boolean => {
    const read = readBoolean(raw, key);
    if (read.kind !== "ok") { problems.push(`invalid-config:${key}`); return false; }
    return read.value;
  };
  const optionalFlag = (key: string): boolean | undefined => {
    if (own(raw, key) === undefined) return undefined;
    const read = readBoolean(raw, key);
    if (read.kind !== "ok") { problems.push(`invalid-config:${key}`); return undefined; }
    return read.value;
  };
  const model = typeof raw.model === "string" && raw.model.trim() !== "" ? raw.model : (problems.push("invalid-config:model"), "");
  const fraction = readNumber(raw, "maxCapitalFraction", { min: 0, exclusiveMin: true, max: 1 });
  if (fraction.kind !== "ok") problems.push("invalid-config:maxCapitalFraction");
  const interval = readNumber(raw, "quoteIntervalBlocks", { min: 1, integer: true });
  if (interval.kind !== "ok") problems.push("invalid-config:quoteIntervalBlocks");
  const confidence = readNumber(raw, "minConfidence", { min: 0, max: 1 });
  if (confidence.kind !== "ok") problems.push("invalid-config:minConfidence");
  let jevModelId: string | undefined;
  if (own(raw, "jevModelId") !== undefined) {
    if (typeof raw.jevModelId === "string") jevModelId = raw.jevModelId;
    else problems.push("invalid-config:jevModelId");
  }
  let signerAddress: string | null | undefined;
  if (own(raw, "signerAddress") !== undefined) {
    if (raw.signerAddress === null) signerAddress = null;
    else if (typeof raw.signerAddress === "string") signerAddress = raw.signerAddress;
    else problems.push("invalid-config:signerAddress");
  }
  const value: ConfigSnapshot = {
    dryRun: flag("dryRun"), model,
    bankrollUsd: positive("bankrollUsd"), maxLossUsd: positive("maxLossUsd"), maxSpendUsd: positive("maxSpendUsd"),
    tradeSizeMon: positive("tradeSizeMon"), maxPositionMon: positive("maxPositionMon"),
    maxCapitalFraction: fraction.kind === "ok" ? fraction.value : 1,
    quoteIntervalBlocks: interval.kind === "ok" ? interval.value : 1,
    minConfidence: confidence.kind === "ok" ? confidence.value : 0,
    economicGate: flag("economicGate"), walletKeyPresent: flag("walletKeyPresent"), jevKeyPresent: flag("jevKeyPresent"),
  };
  if (jevModelId !== undefined) value.jevModelId = jevModelId;
  const liveAckSet = optionalFlag("liveAckSet");
  if (liveAckSet !== undefined) value.liveAckSet = liveAckSet;
  const autoDeposit = optionalFlag("autoDeposit");
  if (autoDeposit !== undefined) value.autoDeposit = autoDeposit;
  if (signerAddress !== undefined) value.signerAddress = signerAddress;
  if (problems.length === 0 && value.tradeSizeMon > value.maxPositionMon) problems.push("invalid-config:tradeSizeMon");
  return problems.length > 0 ? { state: "invalid", problems: unique(problems) } : { state: "ok", value };
}

function profileOf(cfg: CfgState): CadenceProfile {
  if (cfg.state !== "ok") return "unknown";
  const c = cfg.value;
  return c.quoteIntervalBlocks === 1 && c.economicGate === false && c.minConfidence === 0 ? "every-block" : "gated";
}

// ---------------------------------------------------------------------------
// Authorization record
// ---------------------------------------------------------------------------

interface AuthorizationRecord {
  dateMs: number;
  expiryMs: number;
  walletAddress: string;
  maxLossUsd: number;
  maxSpendUsd: number;
  tradeSizeMon: number;
  maxPositionMon: number;
  maxCapitalFraction: number;
  sessionDurationMinutes: number;
  allowedModelId: string;
}

type AuthState =
  | { state: "absent" }
  | { state: "error"; error: InputError }
  | { state: "not-object" }
  | { state: "invalid"; codes: string[] }
  | { state: "valid"; record: AuthorizationRecord };

const AUTHORIZATION_FIELDS = Object.keys(AUTHORIZATION_TEMPLATE);
const LIMIT_FIELDS = ["maxLossUsd", "maxSpendUsd", "tradeSizeMon", "maxPositionMon", "maxCapitalFraction"] as const;

function unknownFieldCodes(record: Raw, allowed: readonly string[]): string[] {
  return Object.keys(record).filter((key) => !allowed.includes(key)).slice(0, 5).map((key) => `unknown-field:${safeName(key)}`);
}

function readAuthorization(input: LiveQualificationInput, policy: QualificationPolicy): AuthState {
  if (input.authorizationError) return { state: "error", error: input.authorizationError };
  if (input.authorization === undefined) return { state: "absent" };
  const raw = input.authorization;
  if (!isRecord(raw)) return { state: "not-object" };
  const codes: string[] = [];
  for (const field of AUTHORIZATION_FIELDS) if (own(raw, field) === undefined) codes.push(`missing:${field}`);
  codes.push(...unknownFieldCodes(raw, AUTHORIZATION_FIELDS));
  const has = (field: string) => own(raw, field) !== undefined;
  const bad = (field: string) => { if (has(field)) codes.push(`invalid:${field}`); };

  if (has("schemaVersion") && raw.schemaVersion !== 1) codes.push("invalid:schemaVersion");
  const owner = readText(raw, "owner");
  if (owner.kind !== "ok") bad("owner");
  const date = readTime(raw, "date");
  if (date.kind !== "ok") bad("date");
  const expiry = readTime(raw, "expiry");
  if (expiry.kind !== "ok") bad("expiry");
  const wallet = readAddress(raw, "walletAddress");
  if (wallet.kind !== "ok") bad("walletAddress");
  const model = readText(raw, "allowedModelId");
  if (model.kind !== "ok") bad("allowedModelId");
  const loss = readNumber(raw, "maxLossUsd", { min: 0, exclusiveMin: true });
  const spend = readNumber(raw, "maxSpendUsd", { min: 0, exclusiveMin: true });
  const size = readNumber(raw, "tradeSizeMon", { min: 0, exclusiveMin: true });
  const position = readNumber(raw, "maxPositionMon", { min: 0, exclusiveMin: true });
  const fraction = readNumber(raw, "maxCapitalFraction", { min: 0, exclusiveMin: true, max: 1 });
  const minutes = readNumber(raw, "sessionDurationMinutes", { min: 0, exclusiveMin: true });
  for (const [field, read] of [["maxLossUsd", loss], ["maxSpendUsd", spend], ["tradeSizeMon", size], ["maxPositionMon", position], ["maxCapitalFraction", fraction], ["sessionDurationMinutes", minutes]] as const) {
    if (read.kind !== "ok") bad(field);
  }
  if (size.kind === "ok" && position.kind === "ok" && size.value > position.value) codes.push("invalid:tradeSizeMon");
  const acknowledgement = own(raw, "acknowledgement");
  if (acknowledgement !== undefined) {
    const text = typeof acknowledgement === "string" ? acknowledgement.trim() : "";
    if (text.length < policy.minAcknowledgementLength || !text.includes(ACKNOWLEDGEMENT_TERM)) codes.push("invalid:acknowledgement");
  }

  if (codes.length > 0) return { state: "invalid", codes: unique(codes) };
  if (date.kind !== "ok" || expiry.kind !== "ok" || wallet.kind !== "ok" || model.kind !== "ok" || loss.kind !== "ok" || spend.kind !== "ok"
    || size.kind !== "ok" || position.kind !== "ok" || fraction.kind !== "ok" || minutes.kind !== "ok") {
    return { state: "invalid", codes: ["invalid:record"] };
  }
  return {
    state: "valid",
    record: {
      dateMs: date.value, expiryMs: expiry.value, walletAddress: wallet.value, maxLossUsd: loss.value, maxSpendUsd: spend.value,
      tradeSizeMon: size.value, maxPositionMon: position.value, maxCapitalFraction: fraction.value,
      sessionDurationMinutes: minutes.value, allowedModelId: model.value,
    },
  };
}

// ---------------------------------------------------------------------------
// Evidence manifest
// ---------------------------------------------------------------------------

type EvState =
  | { state: "absent" }
  | { state: "error"; error: InputError }
  | { state: "not-object" }
  | { state: "unusable"; codes: string[] }
  | { state: "ok"; record: Raw };

const EVIDENCE_FIELDS = Object.keys(EVIDENCE_TEMPLATE);
const RISK_IDS: readonly string[] = KNOWN_OPEN_RISKS.map((risk) => risk.id);

function readEvidence(input: LiveQualificationInput): EvState {
  if (input.evidenceError) return { state: "error", error: input.evidenceError };
  if (input.evidence === undefined) return { state: "absent" };
  const raw = input.evidence;
  if (!isRecord(raw)) return { state: "not-object" };
  const codes: string[] = unknownFieldCodes(raw, EVIDENCE_FIELDS);
  if (own(raw, "schemaVersion") === undefined) codes.push("missing:schemaVersion");
  else if (raw.schemaVersion !== 1) codes.push("invalid:schemaVersion");
  const risks = own(raw, "acknowledgedRisks");
  if (risks !== undefined && risks !== null) {
    if (!Array.isArray(risks) || !risks.every((entry) => typeof entry === "string")) codes.push("invalid:acknowledgedRisks");
    else if (risks.some((entry) => !RISK_IDS.includes(entry))) codes.push("unknown-risk");
  }
  const artifacts = own(raw, "artifacts");
  if (artifacts !== undefined && artifacts !== null) {
    if (!isRecord(artifacts)) codes.push("invalid:artifacts");
    else {
      for (const key of Object.keys(artifacts)) if (!(REQUIRED_ARTIFACTS as readonly string[]).includes(key)) codes.push(`unknown-artifact:${safeName(key)}`);
    }
  }
  return codes.length > 0 ? { state: "unusable", codes: unique(codes) } : { state: "ok", record: raw };
}

type Declaration = { kind: "absent" } | { kind: "invalid" } | { kind: "ok" };

export const isSha256Hex = (value: unknown): value is string => typeof value === "string" && HEX_SHA256.test(value);

/** A lexically safe path relative to the data directory: no absolute or UNC paths, drive letters, empty, dot or dot-dot segments. */
export function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value === "" || value.length > 260 || /[\u0000-\u001F:]/.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  return value.split(/[\\/]/).every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function readDeclaration(entry: unknown): Declaration {
  if (entry === undefined || entry === null) return { kind: "absent" };
  if (!isRecord(entry)) return { kind: "invalid" };
  if (Object.keys(entry).some((key) => key !== "path" && key !== "sha256")) return { kind: "invalid" };
  const path = own(entry, "path");
  const sha = own(entry, "sha256");
  if ((path === undefined || path === null) && (sha === undefined || sha === null)) return { kind: "absent" };
  return isSafeRelativePath(path) && isSha256Hex(sha) ? { kind: "ok" } : { kind: "invalid" };
}

// ---------------------------------------------------------------------------
// Item specifications
// ---------------------------------------------------------------------------

interface Context {
  cfg: CfgState;
  auth: AuthState;
  ev: EvState;
  policy: QualificationPolicy;
  nowMs: number;
  profile: CadenceProfile;
  artifactChecks: LiveQualificationInput["artifactChecks"];
}

interface Spec {
  id: string;
  group: ItemGroup;
  reference: string;
  requirement: (policy: QualificationPolicy) => string;
  evaluate: (ctx: Context) => Outcome;
}

const text = (value: string) => () => value;

const needConfig = (ctx: Context, fn: (cfg: ConfigSnapshot) => Outcome): Outcome => {
  if (ctx.cfg.state === "ok") return fn(ctx.cfg.value);
  return unproven(["no-config"], ctx.cfg.state === "absent"
    ? "Instantâneo de configuração ausente (loadConfig falhou ou não foi informado)."
    : "Instantâneo de configuração inválido; corrija a configuração primeiro.");
};

const noValidRecord = (ctx: Context): Outcome => unproven(["no-valid-record"], ctx.auth.state === "absent"
  ? "Registro de autorização ausente."
  : "Registro de autorização inválido ou ilegível; corrija o registro primeiro.");

const needAuth = (ctx: Context, fn: (auth: AuthorizationRecord) => Outcome): Outcome =>
  ctx.auth.state === "valid" ? fn(ctx.auth.record) : noValidRecord(ctx);

const needEvidence = (ctx: Context, fn: (record: Raw) => Outcome): Outcome => {
  if (ctx.ev.state === "ok") return fn(ctx.ev.record);
  return unproven([ctx.ev.state === "absent" ? "no-manifest" : "manifest-unusable"], ctx.ev.state === "absent"
    ? "Manifesto de evidências ausente."
    : "Manifesto de evidências inválido ou ilegível; corrija o manifesto primeiro.");
};

/** One boolean evidence flag that must be true. */
function flagItem(key: string, trueEvidence: string, falseCode: string, falseReason: string): (ctx: Context) => Outcome {
  return (ctx) => needEvidence(ctx, (record) => {
    const read = readBoolean(record, key);
    if (read.kind === "absent") return unproven([`absent:${key}`], `Sem evidência no manifesto: ${key}.`);
    if (read.kind === "invalid") return fail([`invalid:${key}`], `Valor inválido no manifesto: ${key}.`, `${key} não é booleano.`);
    return read.value ? pass(trueEvidence) : fail([falseCode], falseReason, `${key}=false.`);
  });
}

function limitViolations(auth: AuthorizationRecord, cfg: ConfigSnapshot, direction: "authorization-above" | "config-above"): string[] {
  return LIMIT_FIELDS.filter((field) => (direction === "authorization-above" ? auth[field] > cfg[field] : cfg[field] > auth[field]));
}

const SPECS: Spec[] = [
  // ---- config ----
  {
    id: "config.snapshot-valid", group: "config", reference: "src/config.ts loadConfig(): validações numéricas e Inconsistent size/fee limits",
    requirement: text("O instantâneo de configuração existe e seus limites numéricos são finitos e coerentes."),
    evaluate: (ctx) => {
      if (ctx.cfg.state === "absent") return unproven(["no-config"], "Instantâneo de configuração ausente (loadConfig falhou ou não foi informado).");
      if (ctx.cfg.state === "invalid") return fail(ctx.cfg.problems, `Instantâneo inválido: ${ctx.cfg.problems.join(", ")}.`, "Instantâneo com valores inválidos.");
      return pass("Instantâneo válido.");
    },
  },
  {
    id: "config.live-requested", group: "config", reference: "src/config.ts bool(DRY_RUN); src/market.ts Market.wallet",
    requirement: text("DRY_RUN=false foi pedido explicitamente para a sessão candidata."),
    evaluate: (ctx) => needConfig(ctx, (cfg) => cfg.dryRun
      ? fail(["dry-run"], "A configuração está em paper (DRY_RUN=true). É o esperado enquanto o bloqueio está ligado; o item só muda com a configuração candidata a live.", "DRY_RUN=true.")
      : pass("DRY_RUN=false.")),
  },
  {
    id: "config.model-jev", group: "config", reference: "src/config.ts: MODEL=jev é exigido para live",
    requirement: text("MODEL=jev: o mock nunca decide em sessão real."),
    evaluate: (ctx) => needConfig(ctx, (cfg) => cfg.model === "jev"
      ? pass("MODEL=jev.")
      : fail(["model-not-jev"], `MODEL=${clip(cfg.model)}; a sessão real exige o modelo jev.`, `MODEL=${clip(cfg.model)}.`)),
  },
  {
    id: "config.jev-key-present", group: "config", reference: "src/config.ts: MODEL=jev requires TYPESAFE_AI_API_KEY",
    requirement: text("TYPESAFE_AI_API_KEY está presente (somente booleano; o valor nunca entra no relatório)."),
    evaluate: (ctx) => needConfig(ctx, (cfg) => cfg.jevKeyPresent
      ? pass("Chave Jev presente (valor não lido).")
      : fail(["key-absent"], "TYPESAFE_AI_API_KEY ausente.", "Chave Jev ausente.")),
  },
  {
    id: "config.signer-key-present", group: "config", reference: "src/config.ts: Invalid PRIVATE_KEY format; Live requires PRIVATE_KEY",
    requirement: text("PRIVATE_KEY de um signatário dedicado está presente com formato válido (somente booleano)."),
    evaluate: (ctx) => needConfig(ctx, (cfg) => cfg.walletKeyPresent
      ? pass("Chave de carteira presente (valor não lido).")
      : fail(["key-absent"], "PRIVATE_KEY ausente.", "Chave de carteira ausente.")),
  },
  {
    id: "config.live-ack", group: "config", reference: "src/config.ts: env(\"LIVE_ACK\") !== \"OWN_FUNDS_RISK\"",
    requirement: text("LIVE_ACK=OWN_FUNDS_RISK foi definido pelo dono."),
    evaluate: (ctx) => needConfig(ctx, (cfg) => {
      if (cfg.liveAckSet === undefined) return unproven(["absent:liveAckSet"], "O instantâneo não informa se LIVE_ACK foi definido.");
      return cfg.liveAckSet ? pass("LIVE_ACK definido (valor não exibido).") : fail(["ack-not-set"], "LIVE_ACK não é OWN_FUNDS_RISK.", "LIVE_ACK ausente ou diferente.");
    }),
  },
  {
    id: "config.auto-deposit-off", group: "config", reference: "src/market.ts init() -> ensureMargin(); docs/READINESS-SPEC.md R3",
    requirement: text("AUTO_DEPOSIT=false: nenhum depósito, approve ou transferência automática na partida."),
    evaluate: (ctx) => needConfig(ctx, (cfg) => {
      if (cfg.autoDeposit === undefined) return unproven(["absent:autoDeposit"], "O instantâneo não informa AUTO_DEPOSIT.");
      return cfg.autoDeposit ? fail(["auto-deposit-on"], "AUTO_DEPOSIT=true faria depósitos e approve de token na partida.", "AUTO_DEPOSIT=true.") : pass("AUTO_DEPOSIT=false.");
    }),
  },
  {
    id: "config.model-id-pinned", group: "config", reference: "docs/JEV-WINDOWS.md; src/model.ts JevModel",
    requirement: text("JEV_MODEL_ID fixa uma versão exata, não um alias móvel como jev-latest."),
    evaluate: (ctx) => needConfig(ctx, (cfg) => {
      if (cfg.jevModelId === undefined) return unproven(["absent:jevModelId"], "O instantâneo não informa JEV_MODEL_ID.");
      return cfg.jevModelId.trim() === "" || /latest/i.test(cfg.jevModelId)
        ? fail(["alias"], "JEV_MODEL_ID é um alias móvel ou vazio; fixe uma versão exata (por exemplo jev-1.13.0).", `JEV_MODEL_ID=${clip(cfg.jevModelId)}.`)
        : pass(`JEV_MODEL_ID=${clip(cfg.jevModelId)}.`);
    }),
  },

  // ---- authorization ----
  {
    id: "authorization.record-present", group: "authorization", reference: `${DOC} seção 7`,
    requirement: text("Existe um registro de autorização legível em data/live-authorization.json."),
    evaluate: (ctx) => {
      switch (ctx.auth.state) {
        case "absent": return unproven(["no-record"], "Nenhum registro de autorização foi fornecido.");
        case "error": return fail([ctx.auth.error], `O arquivo do registro está ${ctx.auth.error === "malformed-json" ? "com JSON malformado" : "ilegível"}.`, `Arquivo ${ctx.auth.error}.`);
        case "not-object": return fail(["not-object"], "O registro precisa ser um objeto JSON.", "Valor não é objeto.");
        default: return pass("Registro presente.");
      }
    },
  },
  {
    id: "authorization.fields-valid", group: "authorization", reference: `${DOC} seção 7`,
    requirement: text("O registro tem todos os campos, sem campos extras, com limites positivos e finitos e textos reais."),
    evaluate: (ctx) => {
      if (ctx.auth.state === "valid") return pass("Todos os campos presentes e válidos.");
      if (ctx.auth.state === "invalid") return fail(ctx.auth.codes, `Campos com problema: ${ctx.auth.codes.join(", ")}.`, `${ctx.auth.codes.length} problema(s) no registro.`);
      return noValidRecord(ctx);
    },
  },
  {
    id: "authorization.time-window", group: "authorization", reference: `${DOC} seção 7`,
    requirement: (p) => `A data não está no futuro, a validade vem depois da data, está no futuro e não passa de ${p.maxAuthorizationValidityHours} horas.`,
    evaluate: (ctx) => needAuth(ctx, (auth) => {
      const codes: string[] = [];
      if (auth.dateMs > ctx.nowMs + ctx.policy.clockSkewToleranceMs) codes.push("date-in-future");
      if (auth.expiryMs <= auth.dateMs) codes.push("expiry-before-date");
      if (auth.expiryMs <= ctx.nowMs) codes.push("expired");
      if (auth.expiryMs - auth.dateMs > ctx.policy.maxAuthorizationValidityHours * 3_600_000) codes.push("validity-too-long");
      return codes.length === 0
        ? pass(`Válido até ${new Date(auth.expiryMs).toISOString()}.`)
        : fail(codes, `Janela de validade inválida: ${codes.join(", ")}.`, `Validade até ${new Date(auth.expiryMs).toISOString()}.`);
    }),
  },
  {
    id: "authorization.limits-within-config-caps", group: "authorization", reference: "src/config.ts MAX_LOSS_USD, MAX_SPEND_USD, TRADE_SIZE_MON, MAX_POSITION_MON, MAX_CAPITAL_FRACTION",
    requirement: text("Nenhum limite autorizado é maior que o limite aplicado pela configuração."),
    evaluate: (ctx) => needAuth(ctx, (auth) => needConfig(ctx, (cfg) => {
      const over = limitViolations(auth, cfg, "authorization-above");
      return over.length === 0 ? pass("Limites autorizados não excedem os da configuração.")
        : fail(over.map((field) => `exceeds-config:${field}`), `O registro autoriza mais do que a configuração aplica: ${over.join(", ")}.`, `${over.length} limite(s) acima da configuração.`);
    })),
  },
  {
    id: "authorization.config-within-authorized-limits", group: "authorization", reference: "src/config.ts; src/trader.ts riskStop (aplica os limites da configuração)",
    requirement: text("A configuração não permite mais do que o registro autoriza (na prática, limites iguais)."),
    evaluate: (ctx) => needAuth(ctx, (auth) => needConfig(ctx, (cfg) => {
      const over = limitViolations(auth, cfg, "config-above");
      return over.length === 0 ? pass("A configuração não excede os limites autorizados.")
        : fail(over.map((field) => `config-exceeds:${field}`), `A configuração permite mais do que o registro autoriza: ${over.join(", ")}.`, `${over.length} limite(s) da configuração acima do registro.`);
    })),
  },
  {
    id: "authorization.tiny-caps", group: "authorization", reference: `${DOC} seções 6 e 7`,
    requirement: (p) => `Perda e gasto autorizados até ${pct(p.maxLossFractionOfBankroll)}% e ${pct(p.maxSpendFractionOfBankroll)}% da banca, sessão de até ${p.maxSessionMinutes} minutos.`,
    evaluate: (ctx) => needAuth(ctx, (auth) => needConfig(ctx, (cfg) => {
      const codes: string[] = [];
      if (!lte(auth.maxLossUsd, ctx.policy.maxLossFractionOfBankroll * cfg.bankrollUsd)) codes.push("too-large:maxLossUsd");
      if (!lte(auth.maxSpendUsd, ctx.policy.maxSpendFractionOfBankroll * cfg.bankrollUsd)) codes.push("too-large:maxSpendUsd");
      if (auth.sessionDurationMinutes > ctx.policy.maxSessionMinutes) codes.push("too-large:sessionDurationMinutes");
      return codes.length === 0 ? pass("Limites pequenos em relação à banca e sessão curta.")
        : fail(codes, `Limites acima do teto de sanidade da política: ${codes.join(", ")}.`, `${codes.length} limite(s) acima do teto.`);
    })),
  },
  {
    id: "authorization.model-matches-config", group: "authorization", reference: "src/model.ts JevModel; src/config.ts JEV_MODEL_ID",
    requirement: text("O modelo permitido no registro é igual ao JEV_MODEL_ID da configuração."),
    evaluate: (ctx) => needAuth(ctx, (auth) => needConfig(ctx, (cfg) => {
      if (cfg.jevModelId === undefined) return unproven(["absent:jevModelId"], "O instantâneo não informa JEV_MODEL_ID.");
      return auth.allowedModelId === cfg.jevModelId ? pass("Modelo do registro igual ao da configuração.")
        : fail(["model-mismatch"], "O modelo permitido no registro difere do JEV_MODEL_ID da configuração.", "Modelos diferentes.");
    })),
  },
  {
    id: "authorization.wallet-matches-signer", group: "authorization", reference: "src/market.ts Market.wallet; src/config.ts PRIVATE_KEY",
    requirement: text("A carteira do registro é igual ao endereço público derivado de PRIVATE_KEY."),
    evaluate: (ctx) => needAuth(ctx, (auth) => needConfig(ctx, (cfg) => {
      if (cfg.signerAddress === undefined || cfg.signerAddress === null) {
        return unproven(["no-signer-address"], "Nenhum endereço foi derivado: não há PRIVATE_KEY no ambiente do verificador.");
      }
      return addressKey(cfg.signerAddress) === addressKey(auth.walletAddress) ? pass("Endereço do registro igual ao derivado da chave.")
        : fail(["wallet-mismatch"], "A carteira do registro difere do endereço derivado de PRIVATE_KEY.", "Carteiras diferentes.");
    })),
  },
  {
    id: "authorization.signed", group: "authorization", reference: `${DOC} seção 7`,
    requirement: text("O dono declara que assinou o registro (authorizationSigned)."),
    evaluate: flagItem("authorizationSigned", "O dono declarou a assinatura.", "not-signed", "O manifesto declara que o registro não foi assinado."),
  },

  // ---- evidence ----
  {
    id: "evidence.manifest-valid", group: "evidence", reference: `${DOC} seção 8`,
    requirement: text("O manifesto de evidências existe, tem schemaVersion 1 e nenhum campo desconhecido."),
    evaluate: (ctx) => {
      switch (ctx.ev.state) {
        case "absent": return unproven(["no-manifest"], "Nenhum manifesto de evidências foi fornecido.");
        case "error": return fail([ctx.ev.error], `O arquivo do manifesto está ${ctx.ev.error === "malformed-json" ? "com JSON malformado" : "ilegível"}.`, `Arquivo ${ctx.ev.error}.`);
        case "not-object": return fail(["not-object"], "O manifesto precisa ser um objeto JSON.", "Valor não é objeto.");
        case "unusable": return fail(ctx.ev.codes, `Estrutura inválida: ${ctx.ev.codes.join(", ")}.`, `${ctx.ev.codes.length} problema(s) de estrutura.`);
        default: return pass("Estrutura válida (declarações ainda não conferidas).");
      }
    },
  },
  {
    id: "evidence.artifacts-verified", group: "evidence", reference: `${DOC} seção 8`,
    requirement: text("Os quatro artefatos do manifesto existem em data/ e têm o SHA-256 declarado."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const declared = own(record, "artifacts");
      const entries: Raw = isRecord(declared) ? declared : {};
      const invalid: string[] = [], absent: string[] = [], unverified: string[] = [], failed: string[] = [];
      for (const id of REQUIRED_ARTIFACTS) {
        const declaration = readDeclaration(own(entries, id));
        if (declaration.kind === "invalid") { invalid.push(`invalid-declaration:${id}`); continue; }
        if (declaration.kind === "absent") { absent.push(`absent:${id}`); continue; }
        const check = ctx.artifactChecks && Object.prototype.hasOwnProperty.call(ctx.artifactChecks, id) ? ctx.artifactChecks[id] : undefined;
        if (!check) { unverified.push(`unverified:${id}`); continue; }
        if (check.status !== "match") failed.push(`${check.status}:${id}`);
      }
      if (invalid.length + failed.length > 0) {
        const codes = [...invalid, ...failed];
        return fail(codes, `Artefatos com problema: ${codes.join(", ")}.`, `${codes.length} artefato(s) com problema.`);
      }
      if (absent.length + unverified.length > 0) {
        const codes = [...absent, ...unverified];
        return unproven(codes, `Artefatos sem declaração ou sem conferência de hash: ${codes.join(", ")}.`);
      }
      return pass("Quatro artefatos declarados e conferidos por SHA-256.");
    }),
  },

  // ---- stage 1 ----
  {
    id: "stage1.soak-duration", group: "stage1", reference: `${RELEASE} (24 h nunca executada)`,
    requirement: (p) => `Soak em paper de pelo menos ${p.minSoakHours} horas contínuas.`,
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const hours = readNumber(record, "paperSoakHours", { min: 0 });
      if (hours.kind !== "ok") return fieldProblem(gather({ paperSoakHours: hours }))!;
      return hours.value >= ctx.policy.minSoakHours
        ? pass(`paperSoakHours=${hours.value} (mínimo ${ctx.policy.minSoakHours}).`)
        : fail(["below-minimum"], `Janela de ${hours.value} h, abaixo do mínimo de ${ctx.policy.minSoakHours} h.`, `paperSoakHours=${hours.value}.`);
    }),
  },
  {
    id: "stage1.soak-uninterrupted", group: "stage1", reference: "src/trader.ts riskStop e stopReason",
    requirement: text("Nenhuma parada travada durante a janela do soak."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const read = readBoolean(record, "paperSoakLatchedStop");
      if (read.kind === "absent") return unproven(["absent:paperSoakLatchedStop"], "Sem evidência no manifesto: paperSoakLatchedStop.");
      if (read.kind === "invalid") return fail(["invalid:paperSoakLatchedStop"], "Valor inválido no manifesto: paperSoakLatchedStop.", "paperSoakLatchedStop não é booleano.");
      return read.value ? fail(["latched-stop"], "O operador declarou uma parada travada durante o soak; reinicie com diário novo.", "paperSoakLatchedStop=true.") : pass("Nenhuma parada travada declarada.");
    }),
  },
  {
    id: "stage1.soak-real-rpc", group: "stage1", reference: "src/trader.ts: cabeçalho do diário (dataSource)",
    requirement: text("O soak leu o mercado real (dataSource real-market-paper)."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const raw = own(record, "paperSoakDataSource");
      if (raw === undefined || raw === null) return unproven(["absent:paperSoakDataSource"], "Sem evidência no manifesto: paperSoakDataSource.");
      if (typeof raw !== "string" || raw.trim() === "") return fail(["invalid:paperSoakDataSource"], "Valor inválido no manifesto: paperSoakDataSource.", "paperSoakDataSource não é texto.");
      return raw === "real-market-paper" ? pass("dataSource=real-market-paper.")
        : fail(["wrong-data-source"], `dataSource=${clip(raw)}; o soak precisa ser real-market-paper.`, `dataSource=${clip(raw)}.`);
    }),
  },
  {
    id: "stage1.soak-real-jev", group: "stage1", reference: "src/model.ts JevModel; docs/JEV-WINDOWS.md",
    requirement: text("O soak usou o Jev real, na mesma versão exata da configuração."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const model = readText(record, "paperSoakModelId");
      if (model.kind !== "ok") return fieldProblem(gather({ paperSoakModelId: model }))!;
      return needConfig(ctx, (cfg) => {
        if (model.value === "mock" || cfg.model === "mock") return fail(["mock-model"], "O modelo mock não qualifica sessão real.", "Modelo mock.");
        if (cfg.jevModelId === undefined) return unproven(["absent:jevModelId"], "O instantâneo não informa JEV_MODEL_ID.");
        return model.value === cfg.jevModelId ? pass(`Soak com ${clip(model.value)}.`)
          : fail(["model-mismatch"], `O soak usou ${clip(model.value)}, diferente de ${clip(cfg.jevModelId)} na configuração.`, `Soak com ${clip(model.value)}.`);
      });
    }),
  },
  {
    id: "stage1.latency-distribution", group: "stage1", reference: "src/trader.ts decideBeforeDeadline; SPEC.md (bloco de 300 ms)",
    requirement: (p) => `Latência de decisão (p50, p95, p99) medida em pelo menos ${p.minDecisionSamples} decisões; p95 até ${p.blockTimeMs} ms no perfil every-block e até ${p.maxDecisionMs} ms no perfil gated.`,
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const g = gather({
        decisionSampleCount: readNumber(record, "decisionSampleCount", { min: 0, integer: true }),
        decisionLatencyP50Ms: readNumber(record, "decisionLatencyP50Ms", { min: 0 }),
        decisionLatencyP95Ms: readNumber(record, "decisionLatencyP95Ms", { min: 0 }),
        decisionLatencyP99Ms: readNumber(record, "decisionLatencyP99Ms", { min: 0 }),
      });
      const problem = fieldProblem(g);
      if (problem) return problem;
      const { decisionSampleCount: samples, decisionLatencyP50Ms: p50, decisionLatencyP95Ms: p95, decisionLatencyP99Ms: p99 } = g.values;
      if (!(p50 <= p95 && p95 <= p99)) return fail(["percentile-order"], "Os percentis precisam respeitar p50 <= p95 <= p99.", `p50=${p50} p95=${p95} p99=${p99}.`);
      if (samples < ctx.policy.minDecisionSamples) return fail(["too-few-samples"], `Só ${samples} decisões; com menos de ${ctx.policy.minDecisionSamples} os percentis não descrevem a distribuição.`, `decisionSampleCount=${samples}.`);
      if (ctx.profile === "unknown") return unproven(["no-config"], "Sem configuração válida não há perfil de cadência para escolher o limite.");
      const limit = ctx.profile === "every-block" ? ctx.policy.blockTimeMs : ctx.policy.maxDecisionMs;
      return p95 <= limit ? pass(`p95=${p95} ms (limite ${limit} ms, perfil ${ctx.profile}).`)
        : fail(["p95-over-limit"], `p95 de ${p95} ms acima do limite de ${limit} ms do perfil ${ctx.profile}.`, `p95=${p95} ms.`);
    }),
  },
  {
    id: "stage1.late-block-rate", group: "stage1", reference: "src/trader.ts totals.lateBlocks",
    requirement: (p) => `A taxa de blocos atrasados não passa de ${pct(p.maxLateBlockRate)}%.`,
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const rate = readNumber(record, "lateBlockRate", { min: 0, max: 1 });
      if (rate.kind !== "ok") return fieldProblem(gather({ lateBlockRate: rate }))!;
      return rate.value <= ctx.policy.maxLateBlockRate ? pass(`lateBlockRate=${rate.value} (limite ${ctx.policy.maxLateBlockRate}).`)
        : fail(["late-rate-over-limit"], `Taxa de ${rate.value} acima do limite de ${ctx.policy.maxLateBlockRate}.`, `lateBlockRate=${rate.value}.`);
    }),
  },
  {
    id: "stage1.pending-receipt-cadence", group: "stage1", reference: `src/trader.ts riskStop (pendingReceiptCosts); ${RELEASE}`,
    requirement: (p) => `Efeito do recibo pendente medido por sonda somente leitura: atraso menor que o intervalo no perfil gated, fração de cotações de pelo menos ${Math.round((1 - p.maxLateBlockRate) * 1e6) / 1e6} no perfil every-block.`,
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const measured = readBoolean(record, "pendingReceiptCadenceMeasured");
      if (measured.kind === "invalid") return fail(["invalid:pendingReceiptCadenceMeasured"], "Valor inválido no manifesto: pendingReceiptCadenceMeasured.", "pendingReceiptCadenceMeasured não é booleano.");
      if (measured.kind === "absent") return unproven(["absent:pendingReceiptCadenceMeasured"], "Sem evidência no manifesto: pendingReceiptCadenceMeasured. O efeito segue NÃO MEDIDO.");
      if (!measured.value) return fail(["not-measured"], "O efeito do recibo pendente na cadência não foi medido.", "pendingReceiptCadenceMeasured=false.");
      const g = gather({
        receiptLagBlocksP95: readNumber(record, "receiptLagBlocksP95", { min: 0 }),
        quoteBlockFraction: readNumber(record, "quoteBlockFraction", { min: 0, exclusiveMin: true, max: 1 }),
      });
      const problem = fieldProblem(g);
      if (problem) return problem;
      const { receiptLagBlocksP95: lag, quoteBlockFraction: fraction } = g.values;
      return needConfig(ctx, (cfg) => {
        if (ctx.profile === "every-block") {
          const required = 1 - ctx.policy.maxLateBlockRate;
          return fraction >= required - EPSILON ? pass(`quoteBlockFraction=${fraction} (mínimo ${required}).`)
            : fail(["fraction-too-low"], `Só ${fraction} dos blocos podem cotar, abaixo de ${required}.`, `quoteBlockFraction=${fraction}.`);
        }
        return lag < cfg.quoteIntervalBlocks ? pass(`receiptLagBlocksP95=${lag} (intervalo ${cfg.quoteIntervalBlocks} blocos).`)
          : fail(["lag-over-interval"], `O atraso de recibo de ${lag} blocos alcança o intervalo de ${cfg.quoteIntervalBlocks} blocos.`, `receiptLagBlocksP95=${lag}.`);
      });
    }),
  },
  {
    id: "stage1.replay-reconciled", group: "stage1", reference: "src/backtest.ts replayJournal",
    requirement: (p) => `O replay do diário do soak foi aceito (sem fill sem vínculo, custo desconhecido ou recibo pendente) e exercitou pelo menos ${p.minSoakFills} fill.`,
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const g = gather({
        replayReconciled: readBoolean(record, "replayReconciled"),
        paperSoakFillCount: readNumber(record, "paperSoakFillCount", { min: 0, integer: true }),
      });
      if (g.invalid.length > 0) return fieldProblem({ invalid: g.invalid, absent: [] })!;
      if (!g.absent.includes("replayReconciled") && g.values.replayReconciled === false) {
        return fail(["not-reconciled"], "O replay do diário do soak não foi reconciliado.", "replayReconciled=false.");
      }
      if (g.absent.length > 0) return fieldProblem({ invalid: [], absent: g.absent })!;
      return g.values.paperSoakFillCount >= ctx.policy.minSoakFills
        ? pass(`Replay reconciliado com ${g.values.paperSoakFillCount} fill(s).`)
        : fail(["fills-below-minimum"], `Só ${g.values.paperSoakFillCount} fill(s); o caminho de fills não foi exercitado.`, `paperSoakFillCount=${g.values.paperSoakFillCount}.`);
    }),
  },
  {
    id: "stage1.costs-complete", group: "stage1", reference: "src/trader.ts totals.costsComplete; docs/READINESS-SPEC.md R2",
    requirement: text("Nenhum custo desconhecido e totais de gas, Jev e taxa maker registrados."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const g = gather({
        noUnknownCosts: readBoolean(record, "noUnknownCosts"),
        soakGasUsd: readNumber(record, "soakGasUsd", { min: 0 }),
        soakJevUsd: readNumber(record, "soakJevUsd", { min: 0 }),
        soakMakerFeeUsd: readNumber(record, "soakMakerFeeUsd", { min: 0 }),
      });
      if (g.invalid.length > 0) return fieldProblem({ invalid: g.invalid, absent: [] })!;
      if (!g.absent.includes("noUnknownCosts") && g.values.noUnknownCosts === false) {
        return fail(["unknown-costs"], "Há custos desconhecidos no soak.", "noUnknownCosts=false.");
      }
      if (g.absent.length > 0) return fieldProblem({ invalid: [], absent: g.absent })!;
      return pass("Custos completos e totais registrados.");
    }),
  },

  // ---- stage 2 ----
  {
    id: "stage2.rehearsal-wallet", group: "stage2", reference: `${DOC} seção 5`,
    requirement: text("O endereço do ensaio é igual ao do registro e ao derivado da chave configurada."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const wallet = readAddress(record, "rehearsalWalletAddress");
      if (wallet.kind !== "ok") return fieldProblem(gather({ rehearsalWalletAddress: wallet }))!;
      return needAuth(ctx, (auth) => {
        const signer = ctx.cfg.state === "ok" ? ctx.cfg.value.signerAddress : undefined;
        const sameAsAuth = addressKey(wallet.value) === addressKey(auth.walletAddress);
        const sameAsSigner = typeof signer !== "string" || addressKey(signer) === addressKey(wallet.value);
        return sameAsAuth && sameAsSigner ? pass("Endereço do ensaio coerente com o registro e com a chave.")
          : fail(["address-mismatch"], "O endereço do ensaio difere do registro ou da chave configurada.", "Endereços diferentes.");
      });
    }),
  },
  {
    id: "stage2.rehearsal-fresh", group: "stage2", reference: `${DOC} seção 5`,
    requirement: (p) => `O ensaio foi feito há no máximo ${p.maxRehearsalAgeHours} horas e não está no futuro.`,
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const at = readTime(record, "rehearsalAt");
      if (at.kind !== "ok") return fieldProblem(gather({ rehearsalAt: at }))!;
      const codes: string[] = [];
      if (at.value > ctx.nowMs + ctx.policy.clockSkewToleranceMs) codes.push("date-in-future");
      if (ctx.nowMs - at.value > ctx.policy.maxRehearsalAgeHours * 3_600_000) codes.push("stale");
      return codes.length === 0 ? pass(`Ensaio de ${new Date(at.value).toISOString()}.`)
        : fail(codes, `Ensaio fora da janela de frescor: ${codes.join(", ")}.`, `rehearsalAt=${new Date(at.value).toISOString()}.`);
    }),
  },
  {
    id: "stage2.nonce-unchanged", group: "stage2", reference: "src/market.ts resyncNonce",
    requirement: text("O nonce antes e depois do ensaio é igual: nenhuma transação saiu da carteira."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const g = gather({
        rehearsalNonceBefore: readNumber(record, "rehearsalNonceBefore", { min: 0, integer: true }),
        rehearsalNonceAfter: readNumber(record, "rehearsalNonceAfter", { min: 0, integer: true }),
      });
      const problem = fieldProblem(g);
      if (problem) return problem;
      return g.values.rehearsalNonceBefore === g.values.rehearsalNonceAfter ? pass(`Nonce ${g.values.rehearsalNonceBefore} antes e depois.`)
        : fail(["nonce-changed"], "O nonce mudou: alguma transação saiu da carteira. Trate como incidente.", `nonce ${g.values.rehearsalNonceBefore} para ${g.values.rehearsalNonceAfter}.`);
    }),
  },
  {
    id: "stage2.gas-estimated", group: "stage2", reference: "src/market.ts initGasLimit",
    requirement: text("O limite de gas do batchUpdate post-only foi estimado e registrado (Monad cobra sobre o limite)."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const limit = readNumber(record, "rehearsalGasLimit", { min: 0, exclusiveMin: true, integer: true });
      if (limit.kind !== "ok") return fieldProblem(gather({ rehearsalGasLimit: limit }))!;
      return pass(`rehearsalGasLimit=${limit.value}.`);
    }),
  },
  {
    id: "stage2.margin-and-vault-read", group: "stage2", reference: "src/market.ts refresh e marginBalance",
    requirement: text("Saldos de margem em MON e USDC e o estado do vault foram lidos e registrados."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const g = gather({
        rehearsalMarginMon: readNumber(record, "rehearsalMarginMon", { min: 0 }),
        rehearsalMarginUsdc: readNumber(record, "rehearsalMarginUsdc", { min: 0 }),
        rehearsalVaultStateRead: readBoolean(record, "rehearsalVaultStateRead"),
      });
      if (g.invalid.length > 0) return fieldProblem({ invalid: g.invalid, absent: [] })!;
      if (!g.absent.includes("rehearsalVaultStateRead") && g.values.rehearsalVaultStateRead === false) {
        return fail(["vault-not-read"], "O estado do vault não foi lido.", "rehearsalVaultStateRead=false.");
      }
      if (g.absent.length > 0) return fieldProblem({ invalid: [], absent: g.absent })!;
      return pass(`Margem ${g.values.rehearsalMarginMon} MON e ${g.values.rehearsalMarginUsdc} USDC registradas.`);
    }),
  },
  {
    id: "stage2.wallet-dedicated", group: "stage2", reference: "docs/OPERACAO-BRASIL.md (carteira operacional dedicada)",
    requirement: text("O dono declara que a carteira é dedicada e só tem o capital autorizado e gas."),
    evaluate: flagItem("rehearsalWalletDedicated", "O dono declarou carteira dedicada.", "not-dedicated", "A carteira não é dedicada."),
  },

  // ---- reconciliation (the three things the gate message names) ----
  {
    id: "reconciliation.existing-orders", group: "reconciliation", reference: "src/market.ts: mensagem do gate (reconcile existing orders)",
    requirement: text("Ordens existentes foram reconciliadas e não há ordem aberta do endereço na partida."),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const g = gather({
        existingOrdersReconciled: readBoolean(record, "existingOrdersReconciled"),
        openOrdersAtStart: readNumber(record, "openOrdersAtStart", { min: 0, integer: true }),
      });
      if (g.invalid.length > 0) return fieldProblem({ invalid: g.invalid, absent: [] })!;
      if (!g.absent.includes("existingOrdersReconciled") && g.values.existingOrdersReconciled === false) {
        return fail(["not-reconciled"], "As ordens existentes não foram reconciliadas.", "existingOrdersReconciled=false.");
      }
      if (g.absent.length > 0) return fieldProblem({ invalid: [], absent: g.absent })!;
      return g.values.openOrdersAtStart === 0 ? pass("Reconciliadas, sem ordens abertas na partida.")
        : fail([`open-orders:${g.values.openOrdersAtStart}`], `Há ${g.values.openOrdersAtStart} ordem(ns) aberta(s) na partida.`, `openOrdersAtStart=${g.values.openOrdersAtStart}.`);
    }),
  },
  {
    id: "reconciliation.balances", group: "reconciliation", reference: "src/market.ts: mensagem do gate (wallet/margin balances)",
    requirement: text("Saldos de carteira e de margem foram reconciliados com o esperado."),
    evaluate: flagItem("balancesReconciled", "Saldos reconciliados.", "not-reconciled", "Os saldos não foram reconciliados."),
  },
  {
    id: "reconciliation.restart-baseline", group: "reconciliation", reference: "src/market.ts: mensagem do gate (restart capital baseline); src/risk.ts SpotLedger",
    requirement: text("A base de capital do reinício (BANKROLL_USD e MARGIN_MON do livro-razão) bate com os saldos on-chain."),
    evaluate: flagItem("restartBaselineReconciled", "Base de capital reconciliada.", "not-reconciled", "A base de capital não foi reconciliada."),
  },

  // ---- stage 3 preparation ----
  {
    id: "stage3.kill-switch-drilled", group: "stage3", reference: `${DOC} seção 6`,
    requirement: text("O kill switch (parar o processo e reaplicar o bloqueio) foi ensaiado."),
    evaluate: flagItem("killSwitchDrilled", "Kill switch ensaiado.", "not-drilled", "O kill switch não foi ensaiado."),
  },
  {
    id: "stage3.emergency-cancel-drilled", group: "stage3", reference: `${DOC} seção 6 (lacuna G5)`,
    requirement: text("O cancelamento de emergência de ordens já no livro foi ensaiado (parar o processo não as remove)."),
    evaluate: flagItem("emergencyCancelDrilled", "Cancelamento de emergência ensaiado.", "not-drilled", "O cancelamento de emergência não foi ensaiado."),
  },
  {
    id: "stage3.independent-review", group: "stage3", reference: `${RELEASE} (sem revisão independente)`,
    requirement: text("Uma pessoa independente de quem escreveu o pacote revisou a evidência e o commit de levantamento."),
    evaluate: flagItem("independentReviewDone", "Revisão independente declarada.", "no-review", "Não há revisão independente."),
  },

  // ---- open risks (acknowledgement only; acknowledging does not remove a risk) ----
  ...KNOWN_OPEN_RISKS.map((risk): Spec => ({
    id: `risk.${risk.id}`, group: "open-risks", reference: risk.source,
    requirement: text(`O dono reconheceu o risco aberto (reconhecer não o remove): ${risk.risk}`),
    evaluate: (ctx) => needEvidence(ctx, (record) => {
      const list = own(record, "acknowledgedRisks");
      return Array.isArray(list) && list.includes(risk.id)
        ? pass("Risco reconhecido pelo dono no manifesto.")
        : unproven(["not-acknowledged"], "O manifesto não lista este risco em acknowledgedRisks.", "Sem reconhecimento.");
    }),
  })),
];

// ---------------------------------------------------------------------------
// Claims (informational, never part of readiness)
// ---------------------------------------------------------------------------

function assessClaims(cfg: CfgState, profile: CadenceProfile): ClaimAssessment[] {
  const c = cfg.state === "ok" ? cfg.value : null;
  const orderNote = c === null ? "Sem configuração válida."
    : profile === "every-block"
      ? "Perfil every-block configurado, mas a alegação segue não provada: bloco atrasado não cota, recibo pendente bloqueia cotações e a confirmação no mesmo bloco não está qualificada."
      : `Com o perfil gated (QUOTE_INTERVAL_BLOCKS=${c.quoteIntervalBlocks}, ECONOMIC_GATE=${c.economicGate}, MIN_CONFIDENCE=${c.minConfidence}) a decisão não ocorre a cada bloco; a alegação de ordem a cada bloco de 300 ms não é sustentada.`;
  return [
    {
      id: "jev-decides", claim: "Jev decide comprar ou vender a partir do feed de preço",
      supportedByConfig: c === null ? null : c.model === "jev" && c.jevKeyPresent,
      note: "No perfil gated o código ainda pode vetar a decisão (hold por confiança mínima, filtro econômico, limites e latches).",
    },
    {
      id: "real-trades-real-wallet", claim: "Execução real a partir de uma carteira real",
      supportedByConfig: c === null ? null : !c.dryRun && c.walletKeyPresent,
      note: "Mesmo com a configuração, o bloqueio em Market.init() impede ordens reais.",
    },
    {
      id: "order-every-300ms-block", claim: "Uma ordem no livro on-chain da Kuru a cada bloco de 300 ms",
      supportedByConfig: c === null ? null : profile === "every-block",
      note: orderNote,
    },
    {
      id: "demo-is-live-dashboard", claim: "A demonstração é o painel ao vivo",
      supportedByConfig: null,
      note: "Fora do escopo deste verificador (painel em web/).",
    },
  ];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function resolvePolicy(overrides: Partial<QualificationPolicy> | undefined): QualificationPolicy {
  const policy: QualificationPolicy = { ...DEFAULT_QUALIFICATION_POLICY };
  if (!overrides) return policy;
  for (const key of Object.keys(DEFAULT_QUALIFICATION_POLICY) as (keyof QualificationPolicy)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new RangeError(`policy.${key} must be a finite non-negative number`);
    policy[key] = value;
  }
  return policy;
}

export function evaluateLiveQualification(input: LiveQualificationInput): LiveQualificationReport {
  const nowMs = input.now();
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) throw new RangeError("now() must return finite epoch milliseconds");
  const policy = resolvePolicy(input.policy);
  const cfg = readConfig(input.config);
  const profile = profileOf(cfg);
  const ctx: Context = { cfg, auth: readAuthorization(input, policy), ev: readEvidence(input), policy, nowMs, profile, artifactChecks: input.artifactChecks };

  const items: ChecklistItem[] = SPECS.map((spec) => {
    const outcome = spec.evaluate(ctx);
    return {
      id: spec.id, group: spec.group, requirement: spec.requirement(policy), codeOrDocReference: spec.reference,
      status: outcome.status, evidence: outcome.evidence, reason: outcome.reason, codes: outcome.codes,
    };
  });

  const counts = { met: 0, unmet: 0, unknown: 0, total: items.length };
  for (const entry of items) counts[entry.status] += 1;
  const acknowledged = ctx.ev.state === "ok" && Array.isArray(own(ctx.ev.record, "acknowledgedRisks")) ? (own(ctx.ev.record, "acknowledgedRisks") as string[]) : [];

  return {
    schema: "live-qualification-v1",
    evaluatedAt: new Date(nowMs).toISOString(),
    inputs: {
      config: cfg.state === "absent" ? "absent" : "present",
      authorization: input.authorizationError ?? (input.authorization === undefined ? "absent" : "present"),
      evidence: input.evidenceError ?? (input.evidence === undefined ? "absent" : "present"),
    },
    cadenceProfile: profile,
    policy,
    items,
    summary: {
      readyForOwnerReview: counts.met === counts.total,
      blockers: items.filter((entry) => entry.status !== "met").map((entry) => entry.id),
      counts,
      grantsPermission: false,
      codeGate: { ...CODE_GATE_NOTICE },
      notice: NOTICE,
    },
    claims: assessClaims(cfg, profile),
    knownOpenRisks: KNOWN_OPEN_RISKS.map((risk) => ({ ...risk, coveredBy: [...risk.coveredBy], status: "open" as const, acknowledged: acknowledged.includes(risk.id) })),
  };
}
