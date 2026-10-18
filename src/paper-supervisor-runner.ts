import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  PaperSupervisor,
  PaperSupervisorError,
  canonicalJson,
  type PaperSupervisorAdapter,
  type PaperSupervisorAdapterRequest,
  type PaperSupervisorCloseResult,
  type PaperSupervisorEnvelope,
  type PaperSupervisorLimits,
  type PaperSupervisorOptions,
  type PaperSupervisorStage,
} from "./paper-supervisor";
import { SqlitePaperSupervisorStore, type PaperSupervisorRecoveryProof } from "./paper-supervisor-store";
import type { PaperCapitalConfig, PaperPlan, PaperReceipt } from "./paper-capital";

export type PaperSupervisorFixture = "gain" | "loss" | "pending" | "unknown" | "incomplete-cost";
export type PaperSupervisorRunnerArgs = {
  kind: "run";
  mode: "create" | "resume";
  stateDir: string;
  fixture: PaperSupervisorFixture;
  limits: PaperSupervisorLimits;
};
export type ParsedPaperSupervisorArgs = PaperSupervisorRunnerArgs | { kind: "help" };

const DEFAULT_LIMITS: PaperSupervisorLimits = {
  maxTicks: 3,
  maxDurationMs: 2_000,
  cadenceMs: 20,
  adapterTimeoutMs: 250,
  drainTimeoutMs: 250,
};
const LIMIT_FLAGS = new Map<string, { key: keyof PaperSupervisorLimits; min: number; max: number }>([
  ["--max-ticks", { key: "maxTicks", min: 1, max: 20 }],
  ["--max-duration-ms", { key: "maxDurationMs", min: 1, max: 10_000 }],
  ["--cadence-ms", { key: "cadenceMs", min: 1, max: 1_000 }],
  ["--adapter-timeout-ms", { key: "adapterTimeoutMs", min: 1, max: 2_000 }],
  ["--drain-timeout-ms", { key: "drainTimeoutMs", min: 1, max: 2_000 }],
]);
const FIXTURES: readonly PaperSupervisorFixture[] = ["gain", "loss", "pending", "unknown", "incomplete-cost"];
const FIXTURE_DB_NAME = "fixture.sqlite";
const FIXTURE_SCHEMA_VERSION = 1;
const MAX_FIXTURE_DB_BYTES = 16 * 1024 * 1024;
const ASSET = { chainId: "31337", token: "native", decimals: 0, venue: "synthetic" } as const;
export const PAPER_FIXTURE_CONFIG: PaperCapitalConfig = {
  asset: ASSET,
  initialAtoms: "1000",
  maxCommittedAtoms: "400",
  maxDrawdownAtoms: "100",
};
export const PAPER_FIXTURE_PLAN: PaperPlan = {
  id: "inonu-fixture-plan-v1",
  asset: ASSET,
  inputAtoms: "100",
  costBudgetAtoms: "10",
};
export const PAPER_FIXTURE_ADAPTER_ID = "inonu-offline-fixture-v1";
const FIXTURE_IDENTITY_SCHEMA = "CREATE TABLE fixture_identity (id INTEGER PRIMARY KEY CHECK (id = 1), fixture_id TEXT NOT NULL, adapter_id TEXT NOT NULL, schema_version INTEGER NOT NULL)";
const EFFECTS_SCHEMA = "CREATE TABLE fixture_effects (attempt_id TEXT PRIMARY KEY, plan_sha256 TEXT NOT NULL, evidence_id TEXT NOT NULL, receipt_json TEXT NOT NULL)";

export function parsePaperSupervisorArgs(argv: readonly string[]): ParsedPaperSupervisorArgs {
  if (argv.length === 1 && argv[0] === "--help") return { kind: "help" };
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index]!;
    if (!key.startsWith("--") || key === "--help") throw new PaperSupervisorError("invalid_arguments");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--") || values.has(key)) throw new PaperSupervisorError("invalid_arguments");
    values.set(key, value);
    index++;
  }
  const allowed = new Set(["--mode", "--state-dir", "--fixture", ...LIMIT_FLAGS.keys()]);
  if ([...values.keys()].some((key) => !allowed.has(key))) throw new PaperSupervisorError("invalid_arguments");
  const mode = values.get("--mode");
  const stateDir = values.get("--state-dir");
  const fixture = values.get("--fixture");
  if ((mode !== "create" && mode !== "resume") || !stateDir || !fixture || !FIXTURES.includes(fixture as PaperSupervisorFixture)) throw new PaperSupervisorError("invalid_arguments");
  const normalizedInput = stateDir.replace(/[\\/]/g, "/").replace(/\/$/, "").toLowerCase();
  const normalizedResolved = resolve(stateDir).replace(/[\\/]/g, "/").toLowerCase();
  if (stateDir.length > 1024 || stateDir.startsWith("\\\\") || stateDir.startsWith("//") || !isAbsolute(stateDir) || normalizedResolved !== normalizedInput) throw new PaperSupervisorError("invalid_arguments");
  const limits = { ...DEFAULT_LIMITS };
  for (const [flag, value] of values) {
    const definition = LIMIT_FLAGS.get(flag);
    if (!definition) continue;
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new PaperSupervisorError("invalid_arguments");
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric < definition.min || numeric > definition.max) throw new PaperSupervisorError("invalid_arguments");
    limits[definition.key] = numeric;
  }
  return { kind: "run", mode, stateDir, fixture: fixture as PaperSupervisorFixture, limits };
}

type FixtureEffect = { attemptId: string; planSha256: string; evidenceId: string; receipt: PaperReceipt };
export type PaperFixtureStage = "execute_entered" | "effect_committed";
export type PaperSupervisorRunnerTestHooks = {
  onStage?: (stage: PaperSupervisorStage, envelope: PaperSupervisorEnvelope) => void | Promise<void>;
  onFixtureStage?: (stage: PaperFixtureStage, detail: { attemptId: string; evidenceId: string | null; effectCount: number }) => void | Promise<void>;
};
export type PaperSupervisorRunnerDependencies = {
  recoverOwner?: PaperSupervisorRecoveryProof;
  testHooks?: PaperSupervisorRunnerTestHooks;
  onFixtureActivity?: (kind: "execute" | "reconcile", attemptId: string, count: number) => void;
};
export type PaperSupervisorRunnerResult = {
  exitCode: 0 | 1 | 2;
  output: Record<string, unknown>;
};

function planDigest(plan: PaperPlan): string {
  return createHash("sha256").update(canonicalJson({ id: plan.id, asset: plan.asset, inputAtoms: plan.inputAtoms, costBudgetAtoms: plan.costBudgetAtoms }), "utf8").digest("hex");
}

function normalizeSql(sql: string): string {
  return sql.toLowerCase().replace(/[\s"`\[\]]/g, "");
}

function configureFixtureDb(db: Database, creating: boolean): void {
  const journal = db.query("PRAGMA journal_mode=DELETE").get() as Record<string, unknown> | null;
  if (String(journal?.journal_mode).toLowerCase() !== "delete") throw new PaperSupervisorError("fixture_invalid");
  db.exec("PRAGMA synchronous=FULL");
  db.exec("PRAGMA busy_timeout=0");
  if (creating) db.exec(`PRAGMA user_version=${FIXTURE_SCHEMA_VERSION}`);
  const sync = db.query("PRAGMA synchronous").get() as Record<string, unknown> | null;
  const busy = db.query("PRAGMA busy_timeout").get() as Record<string, unknown> | null;
  const version = db.query("PRAGMA user_version").get() as Record<string, unknown> | null;
  if (Number(sync?.synchronous) !== 2 || Number(busy?.timeout ?? busy?.busy_timeout) !== 0 || Number(version?.user_version) !== FIXTURE_SCHEMA_VERSION) throw new PaperSupervisorError("fixture_invalid");
}

function readEffect(db: Database, attemptId: string): FixtureEffect | null {
  const row = db.query("SELECT attempt_id, plan_sha256, evidence_id, receipt_json FROM fixture_effects WHERE attempt_id=?").get(attemptId) as { attempt_id: string; plan_sha256: string; evidence_id: string; receipt_json: string } | null;
  if (!row) return null;
  let receipt: unknown;
  try { receipt = JSON.parse(row.receipt_json) as unknown; } catch { throw new PaperSupervisorError("fixture_invalid"); }
  if (canonicalJson(receipt) !== row.receipt_json || !receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw new PaperSupervisorError("fixture_invalid");
  return { attemptId: row.attempt_id, planSha256: row.plan_sha256, evidenceId: row.evidence_id, receipt: receipt as PaperReceipt };
}

function fixtureReceipt(fixture: PaperSupervisorFixture, plan: PaperPlan, attemptId: string): PaperReceipt {
  if (fixture === "loss") return {
    receiptId: `receipt-${attemptId}`,
    planId: plan.id,
    asset: plan.asset,
    inputAtoms: plan.inputAtoms,
    returnedAtoms: "90",
    externalCostAtoms: "5",
    costsComplete: true,
    outcome: "completed",
  };
  if (fixture === "incomplete-cost") return {
    receiptId: `receipt-${attemptId}`,
    planId: plan.id,
    asset: plan.asset,
    inputAtoms: plan.inputAtoms,
    returnedAtoms: "115",
    externalCostAtoms: null,
    costsComplete: false,
    outcome: "completed",
  };
  return {
    receiptId: `receipt-${attemptId}`,
    planId: plan.id,
    asset: plan.asset,
    inputAtoms: plan.inputAtoms,
    returnedAtoms: "120",
    externalCostAtoms: "5",
    costsComplete: true,
    outcome: "completed",
  };
}

class DurablePaperFixtureAdapter implements PaperSupervisorAdapter {
  private readonly db: Database;
  private readonly fixture: PaperSupervisorFixture;
  private readonly hooks?: PaperSupervisorRunnerTestHooks;
  private readonly onActivity?: PaperSupervisorRunnerDependencies["onFixtureActivity"];
  private effectCount = 0;
  private closed = false;
  private readonly activity = { execute: 0, reconcile: 0 };

  private constructor(input: { db: Database; fixture: PaperSupervisorFixture; hooks?: PaperSupervisorRunnerTestHooks; onActivity?: PaperSupervisorRunnerDependencies["onFixtureActivity"] }) {
    this.db = input.db;
    this.fixture = input.fixture;
    this.hooks = input.hooks;
    this.onActivity = input.onActivity;
    this.effectCount = Number((this.db.query("SELECT COUNT(*) AS count FROM fixture_effects").get() as { count: number }).count);
  }

  static open(stateDir: string, fixture: PaperSupervisorFixture, mode: "create" | "resume", hooks?: PaperSupervisorRunnerTestHooks, onActivity?: PaperSupervisorRunnerDependencies["onFixtureActivity"]): DurablePaperFixtureAdapter {
    const path = join(stateDir, FIXTURE_DB_NAME);
    if (mode === "create" ? existsSync(path) : !existsSync(path)) throw new PaperSupervisorError("fixture_invalid");
    if (existsSync(path)) {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FIXTURE_DB_BYTES) throw new PaperSupervisorError("fixture_invalid");
    }
    let db: Database | null = null;
    try {
      db = new Database(path, { create: mode === "create", readwrite: true, strict: true });
      configureFixtureDb(db, mode === "create");
      if (mode === "create") {
        db.exec(FIXTURE_IDENTITY_SCHEMA);
        db.exec(EFFECTS_SCHEMA);
        db.query("INSERT INTO fixture_identity(id, fixture_id, adapter_id, schema_version) VALUES (1, ?, ?, ?)").run(fixture, PAPER_FIXTURE_ADAPTER_ID, FIXTURE_SCHEMA_VERSION);
      }
      const objects = db.query("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as Array<{ type: string; name: string; sql: string }>;
      const expected = new Map([["fixture_identity", FIXTURE_IDENTITY_SCHEMA], ["fixture_effects", EFFECTS_SCHEMA]]);
      if (objects.length !== 2 || objects.some((item) => item.type !== "table" || expected.get(item.name) === undefined || normalizeSql(item.sql) !== normalizeSql(expected.get(item.name)!))) throw new PaperSupervisorError("fixture_invalid");
      const identity = db.query("SELECT fixture_id, adapter_id, schema_version FROM fixture_identity WHERE id=1").get() as { fixture_id: string; adapter_id: string; schema_version: number } | null;
      const count = Number((db.query("SELECT COUNT(*) AS count FROM fixture_identity").get() as { count: number }).count);
      if (count !== 1 || identity?.fixture_id !== fixture || identity.adapter_id !== PAPER_FIXTURE_ADAPTER_ID || identity.schema_version !== FIXTURE_SCHEMA_VERSION) throw new PaperSupervisorError("fixture_identity_mismatch");
      return new DurablePaperFixtureAdapter({ db, fixture, hooks, onActivity });
    } catch (error) {
      try { db?.close(true); } catch { /* preserve the fixture validation failure */ }
      if (error instanceof PaperSupervisorError) throw error;
      throw new PaperSupervisorError("fixture_invalid");
    }
  }

  async execute(request: PaperSupervisorAdapterRequest, _signal: AbortSignal): Promise<{ kind: "terminal"; evidenceId: string; receipt: PaperReceipt } | { kind: "pending" | "unknown"; reason: string }> {
    this.assertOpen();
    this.activity.execute++;
    this.onActivity?.("execute", request.attemptId, this.activity.execute);
    await this.hooks?.onFixtureStage?.("execute_entered", { attemptId: request.attemptId, evidenceId: null, effectCount: this.effectCount });
    if (this.fixture === "pending") return { kind: "pending", reason: "fixture_pending" };
    if (this.fixture === "unknown") return { kind: "unknown", reason: "fixture_unknown" };
    const digest = planDigest(request.plan);
    const evidenceId = `effect-${request.attemptId}`;
    const receipt = fixtureReceipt(this.fixture, request.plan, request.attemptId);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const prior = readEffect(this.db, request.attemptId);
      if (prior) {
        if (prior.planSha256 !== digest || prior.evidenceId !== evidenceId || canonicalJson(prior.receipt) !== canonicalJson(receipt)) throw new PaperSupervisorError("fixture_effect_conflict");
      } else {
        this.db.query("INSERT INTO fixture_effects(attempt_id, plan_sha256, evidence_id, receipt_json) VALUES (?, ?, ?, ?)").run(request.attemptId, digest, evidenceId, canonicalJson(receipt));
      }
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.inTransaction) { try { this.db.exec("ROLLBACK"); } catch { /* preserve the original failure */ } }
      throw error;
    }
    this.effectCount = Number((this.db.query("SELECT COUNT(*) AS count FROM fixture_effects").get() as { count: number }).count);
    await this.hooks?.onFixtureStage?.("effect_committed", { attemptId: request.attemptId, evidenceId, effectCount: this.effectCount });
    return { kind: "terminal", evidenceId, receipt };
  }

  async reconcile(request: PaperSupervisorAdapterRequest, _signal: AbortSignal): Promise<{ kind: "terminal"; evidenceId: string; receipt: PaperReceipt } | { kind: "pending" | "unknown"; reason: string }> {
    this.assertOpen();
    this.activity.reconcile++;
    this.onActivity?.("reconcile", request.attemptId, this.activity.reconcile);
    if (this.fixture === "pending") return { kind: "pending", reason: "fixture_pending" };
    if (this.fixture === "unknown") return { kind: "unknown", reason: "fixture_unknown" };
    const prior = readEffect(this.db, request.attemptId);
    if (!prior) return { kind: "unknown", reason: "effect_absent" };
    if (prior.planSha256 !== planDigest(request.plan) || prior.receipt.planId !== request.plan.id || prior.receipt.inputAtoms !== request.plan.inputAtoms || canonicalJson(prior.receipt.asset) !== canonicalJson(request.plan.asset)) throw new PaperSupervisorError("fixture_effect_conflict");
    return { kind: "terminal", evidenceId: prior.evidenceId, receipt: prior.receipt };
  }

  async drain(_signal: AbortSignal): Promise<{ drained: boolean }> { return { drained: this.closed === false }; }
  async close(_signal: AbortSignal): Promise<void> { if (this.closed) return; this.db.close(true); this.closed = true; }
  private assertOpen(): void { if (this.closed) throw new PaperSupervisorError("fixture_closed"); }
}

function errorCode(error: unknown): string {
  if (error instanceof PaperSupervisorError) return error.code.slice(0, 64);
  return "runner_error";
}

function compactOutput(value: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, "utf8") <= 8_192) return value;
  return { ok: false, error: "result_too_large" };
}

export async function runPaperSupervisor(argv: readonly string[], dependencies: PaperSupervisorRunnerDependencies = {}): Promise<PaperSupervisorRunnerResult> {
  let parsed: ParsedPaperSupervisorArgs;
  try { parsed = parsePaperSupervisorArgs(argv); }
  catch (error) { return { exitCode: 1, output: { ok: false, error: errorCode(error) } }; }
  if (parsed.kind === "help") return { exitCode: 0, output: { ok: true, help: "--mode create|resume --state-dir <absolute-local-path> --fixture gain|loss|pending|unknown|incomplete-cost [finite numeric limits]" } };

  const owner = { token: randomBytes(16).toString("hex"), pid: process.pid };
  let store: SqlitePaperSupervisorStore | null = null;
  let supervisor: PaperSupervisor | null = null;
  let adapter: DurablePaperFixtureAdapter | null = null;
  try {
    const storeOptions = { stateDir: parsed.stateDir, config: PAPER_FIXTURE_CONFIG, adapterId: PAPER_FIXTURE_ADAPTER_ID, owner };
    store = parsed.mode === "create"
      ? await SqlitePaperSupervisorStore.create(storeOptions)
      : await SqlitePaperSupervisorStore.resume({ ...storeOptions, ...(dependencies.recoverOwner ? { recoverOwner: dependencies.recoverOwner } : {}) });
    adapter = DurablePaperFixtureAdapter.open(parsed.stateDir, parsed.fixture, parsed.mode, dependencies.testHooks, dependencies.onFixtureActivity);
    const options: PaperSupervisorOptions = {
      store,
      adapter,
      limits: parsed.limits,
      ...(dependencies.testHooks?.onStage ? { onStage: dependencies.testHooks.onStage } : {}),
    };
    supervisor = await PaperSupervisor.open(options);
    const results = await supervisor.run({ nextOpportunity: () => ({ plan: PAPER_FIXTURE_PLAN, expiresAtMs: Date.now() + 60_000 }) });
    const beforeClose = supervisor.status();
    const close: PaperSupervisorCloseResult = await supervisor.close();
    const held = beforeClose.operationalState === "held" || beforeClose.operationalState === "quarantined" || results.some((result) => result.kind === "held") || close.kind !== "closed";
    const finalStatus = supervisor.status();
    const output = compactOutput({
      ok: close.kind === "closed",
      mode: parsed.mode,
      fixture: parsed.fixture,
      results,
      held,
      close,
      status: finalStatus,
    });
    return { exitCode: close.kind !== "closed" ? 2 : held ? 2 : 0, output };
  } catch (error) {
    if (supervisor) {
      try { await supervisor.close(); } catch { /* retain the best available outcome */ }
    } else if (store) {
      try {
        const current = await store.load();
        if (current.owner?.token === owner.token && current.owner.pid === owner.pid) await store.release(current.generation);
      } catch { /* preserve uncertain ownership when cleanup cannot be proven */ }
      try { await adapter?.close(new AbortController().signal); } catch { /* best effort */ }
      try { await store.close(); } catch { /* preserve the original runner error */ }
    }
    const code = errorCode(error);
    return { exitCode: code === "owner_busy" || code === "drain_incomplete" ? 2 : 1, output: { ok: false, error: code, mode: parsed.mode, fixture: parsed.fixture } };
  }
}

async function main(): Promise<void> {
  const result = await runPaperSupervisor(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.output)}\n`);
  process.exitCode = result.exitCode;
}

if (import.meta.main) void main();
