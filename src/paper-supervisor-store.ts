import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  PaperSupervisorError,
  assertByteEventCapacity,
  assertRecoveryCapacity,
  assertOwnedCapacity,
  canonicalJson,
  canonicalEnvelope,
  createInitialEnvelope,
  sealEnvelope,
  validateEnvelope,
  type PaperSupervisorEnvelope,
  type PaperSupervisorOwner,
  type PaperSupervisorStore,
} from "./paper-supervisor";
import type { PaperCapitalConfig } from "./paper-capital";

const DATABASE_NAME = "supervisor.sqlite";
const MAX_DATABASE_BYTES = 16 * 1024 * 1024;
const EXPECTED_SCHEMA = "CREATE TABLE supervisor_state (id INTEGER PRIMARY KEY CHECK (id = 1), generation INTEGER NOT NULL, envelope_json TEXT NOT NULL, owner_token TEXT, owner_pid INTEGER)";

export type PaperSupervisorRecoveryProof = {
  expectedToken: string;
  expectedPid: number;
  verifyExited: (owner: PaperSupervisorOwner) => boolean | Promise<boolean>;
};

export type SqlitePaperSupervisorCreateOptions = {
  stateDir: string;
  config: PaperCapitalConfig;
  adapterId: string;
  owner: PaperSupervisorOwner;
};

export type SqlitePaperSupervisorResumeOptions = SqlitePaperSupervisorCreateOptions & {
  recoverOwner?: PaperSupervisorRecoveryProof;
};

export type SqlitePaperSupervisorTestFaults = {
  beforeBegin?: () => void;
  beforeUpdate?: () => void;
  beforeRead?: () => void;
  beforeClose?: () => void;
  afterCloseBeforeReturn?: () => void;
  beforeCommit?: () => void;
  afterCommitBeforePublishReturn?: () => void;
};

type StoreRow = {
  id: number;
  generation: number;
  envelope_json: string;
  owner_token: string | null;
  owner_pid: number | null;
};

function fail(code: string): never {
  throw new PaperSupervisorError(code);
}

function normalizeSql(sql: string): string {
  return sql.toLowerCase().replace(/[\s"`\[\]]/g, "");
}

function isWithin(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function assertPathComponentIsNotLink(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || stat.isDirectory() === false && stat.isFile() === false) fail("unsupported_state_path");
}

function assertNoLinkedComponents(path: string, includeLeaf: boolean): void {
  const absolute = resolve(path);
  const { root } = parseRoot(absolute);
  let current = root;
  const parts = absolute.slice(root.length).split(/[\\/]/).filter(Boolean);
  const limit = includeLeaf ? parts.length : Math.max(0, parts.length - 1);
  for (let index = 0; index < limit; index++) {
    current = join(current, parts[index]!);
    assertPathComponentIsNotLink(current);
  }
}

function parseRoot(path: string): { root: string } {
  const root = resolve(path, "..").slice(0, 3);
  if (!/^[A-Za-z]:[\\/]$/.test(root)) fail("unsupported_state_path");
  return { root };
}

function repoRoot(): string {
  return resolve(import.meta.dir, "..");
}

function validateStateDirectory(stateDir: string, mode: "create" | "resume"): { stateDir: string; databasePath: string } {
  if (typeof stateDir !== "string" || stateDir.length === 0 || stateDir.length > 1024 || stateDir.startsWith("\\\\") || stateDir.startsWith("//")) fail("unsupported_state_path");
  const resolvedStateDir = resolve(stateDir);
  const comparableInput = stateDir.replace(/[\\/]/g, "/").replace(/\/$/, "").toLowerCase();
  const comparableResolved = resolvedStateDir.replace(/[\\/]/g, "/").toLowerCase();
  if (!isAbsolute(stateDir) || comparableResolved !== comparableInput) fail("unsupported_state_path");
  stateDir = resolvedStateDir;
  const root = repoRoot();
  if (isWithin(root.toLowerCase(), stateDir.toLowerCase())) fail("state_inside_repository");
  const parent = dirname(stateDir);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) fail("state_parent_missing");
  assertNoLinkedComponents(stateDir, mode === "resume");
  const canonicalParent = realpathSync(parent);
  if (canonicalParent.toLowerCase() !== parent.toLowerCase()) fail("unsupported_state_path");
  const databasePath = join(stateDir, DATABASE_NAME);
  if (mode === "resume") {
    const info = lstatSync(stateDir);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("unsupported_state_path");
    const dbInfo = lstatSync(databasePath);
    if (!dbInfo.isFile() || dbInfo.isSymbolicLink()) fail("invalid_store");
    if (dbInfo.size > MAX_DATABASE_BYTES) fail("store_too_large");
    const journal = `${databasePath}-journal`;
    if (existsSync(journal)) {
      const journalInfo = lstatSync(journal);
      if (!journalInfo.isFile() || journalInfo.isSymbolicLink() || journalInfo.size > MAX_DATABASE_BYTES) fail("invalid_store");
    }
  } else if (existsSync(stateDir)) {
    fail("state_exists");
  }
  return { stateDir, databasePath };
}

function configureDatabase(db: Database, creating: boolean): void {
  const journalMode = db.query("PRAGMA journal_mode=DELETE").get() as Record<string, unknown> | null;
  if (String(journalMode?.journal_mode).toLowerCase() !== "delete") fail("sqlite_pragma_mismatch");
  db.exec("PRAGMA synchronous=FULL");
  db.exec("PRAGMA busy_timeout=0");
  const synchronous = db.query("PRAGMA synchronous").get() as Record<string, unknown> | null;
  const busyTimeout = db.query("PRAGMA busy_timeout").get() as Record<string, unknown> | null;
  if (Number(synchronous?.synchronous) !== 2 || Number(busyTimeout?.timeout ?? busyTimeout?.busy_timeout) !== 0) fail("sqlite_pragma_mismatch");
  if (creating) db.exec("PRAGMA user_version=1");
  const userVersion = db.query("PRAGMA user_version").get() as Record<string, unknown> | null;
  if (Number(userVersion?.user_version) !== 1) fail("unsupported_schema");
}

function validateSchema(db: Database): void {
  const objects = db.query("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all() as Array<{ type: string; name: string; sql: string | null }>;
  if (objects.length !== 1 || objects[0]?.type !== "table" || objects[0]?.name !== "supervisor_state" || typeof objects[0]?.sql !== "string" || normalizeSql(objects[0].sql) !== normalizeSql(EXPECTED_SCHEMA)) fail("unsupported_schema");
  const columns = db.query("PRAGMA table_info(supervisor_state)").all() as Array<{ name: string; type: string; notnull: number; pk: number; dflt_value: unknown }>;
  const expected = [
    { name: "id", type: "INTEGER", notnull: 0, pk: 1 },
    { name: "generation", type: "INTEGER", notnull: 1, pk: 0 },
    { name: "envelope_json", type: "TEXT", notnull: 1, pk: 0 },
    { name: "owner_token", type: "TEXT", notnull: 0, pk: 0 },
    { name: "owner_pid", type: "INTEGER", notnull: 0, pk: 0 },
  ];
  if (columns.length !== expected.length || columns.some((column, index) => {
    const target = expected[index]!;
    return column.name !== target.name || column.type.toUpperCase() !== target.type || column.notnull !== target.notnull || column.pk !== target.pk || column.dflt_value !== null;
  })) fail("unsupported_schema");
  const rows = db.query("SELECT COUNT(*) AS count FROM supervisor_state").get() as { count: number } | null;
  if (Number(rows?.count) !== 1) fail("invalid_store");
}

function parseRow(row: StoreRow | null, expected: { config: PaperCapitalConfig; adapterId: string }): PaperSupervisorEnvelope {
  if (!row || row.id !== 1 || !Number.isSafeInteger(row.generation) || typeof row.envelope_json !== "string" || row.envelope_json.length > 1_048_576) fail("invalid_store");
  let parsed: unknown;
  try { parsed = JSON.parse(row.envelope_json) as unknown; }
  catch { fail("invalid_store"); }
  const envelope = validateEnvelope(parsed, expected);
  if (row.generation !== envelope.generation || row.owner_token !== (envelope.owner?.token ?? null) || row.owner_pid !== (envelope.owner?.pid ?? null)) fail("invalid_store");
  if (row.envelope_json !== canonicalEnvelope(envelope)) fail("noncanonical_state");
  return envelope;
}

function readRow(db: Database): StoreRow | null {
  return db.query("SELECT id, generation, envelope_json, owner_token, owner_pid FROM supervisor_state WHERE id=1").get() as StoreRow | null;
}

function requireSameOwner(actual: PaperSupervisorOwner | null, expected: PaperSupervisorOwner): void {
  if (!actual || actual.token !== expected.token || actual.pid !== expected.pid) fail("owner_mismatch");
}

export class SqlitePaperSupervisorStore implements PaperSupervisorStore {
  readonly createdFresh: boolean;
  readonly stateDir: string;
  readonly databasePath: string;
  private readonly db: Database;
  private readonly identity: { config: PaperCapitalConfig; adapterId: string };
  private owner: PaperSupervisorOwner;
  private closed = false;
  private faults: SqlitePaperSupervisorTestFaults = {};

  private constructor(input: {
    db: Database;
    stateDir: string;
    databasePath: string;
    identity: { config: PaperCapitalConfig; adapterId: string };
    owner: PaperSupervisorOwner;
    createdFresh: boolean;
  }) {
    this.db = input.db;
    this.stateDir = input.stateDir;
    this.databasePath = input.databasePath;
    this.identity = input.identity;
    this.owner = { ...input.owner };
    this.createdFresh = input.createdFresh;
  }

  static async create(options: SqlitePaperSupervisorCreateOptions): Promise<SqlitePaperSupervisorStore> {
    const paths = validateStateDirectory(options.stateDir, "create");
    validateOwner(options.owner);
    validateIdentity(options.adapterId);
    mkdirSync(paths.stateDir);
    let db: Database | null = null;
    try {
      db = new Database(paths.databasePath, { create: true, readwrite: true, strict: true });
      configureDatabase(db, true);
      db.exec(EXPECTED_SCHEMA);
      const initial = createInitialEnvelope({ config: options.config, adapterId: options.adapterId, owner: options.owner });
      db.query("INSERT INTO supervisor_state(id, generation, envelope_json, owner_token, owner_pid) VALUES (1, ?, ?, ?, ?)").run(initial.generation, canonicalEnvelope(initial), initial.owner!.token, initial.owner!.pid);
      validateSchema(db);
      parseRow(readRow(db), { config: options.config, adapterId: options.adapterId });
      assertOwnedCapacity(initial);
      return new SqlitePaperSupervisorStore({ db, stateDir: paths.stateDir, databasePath: paths.databasePath, identity: { config: options.config, adapterId: options.adapterId }, owner: options.owner, createdFresh: true });
    } catch (error) {
      try { db?.close(true); } catch { /* the incomplete directory is preserved for inspection */ }
      throw normalizeStoreError(error);
    }
  }

  static async resume(options: SqlitePaperSupervisorResumeOptions): Promise<SqlitePaperSupervisorStore> {
    const paths = validateStateDirectory(options.stateDir, "resume");
    validateOwner(options.owner);
    validateIdentity(options.adapterId);
    let db: Database;
    try { db = new Database(paths.databasePath, { create: false, readwrite: true, strict: true }); }
    catch (error) { throw normalizeStoreError(error); }
    try {
      configureDatabase(db, false);
      validateSchema(db);
      const current = parseRow(readRow(db), { config: options.config, adapterId: options.adapterId });
      if (current.owner) {
        const proof = options.recoverOwner;
        if (!proof || proof.expectedToken !== current.owner.token || proof.expectedPid !== current.owner.pid) fail("owner_busy");
        const verified = await proof.verifyExited({ ...current.owner });
        if (verified !== true) fail("owner_busy");
      }
      const ownerForTransaction = current.owner ? { ...current.owner } : null;
      const replacement = { ...options.owner };
      const next = await transaction(db, () => {
        const disk = parseRow(readRow(db), { config: options.config, adapterId: options.adapterId });
        if (disk.generation !== current.generation || (disk.owner?.token ?? null) !== (ownerForTransaction?.token ?? null) || (disk.owner?.pid ?? null) !== (ownerForTransaction?.pid ?? null)) fail("owner_changed");
        if (ownerForTransaction) requireSameOwner(disk.owner, ownerForTransaction);
        else if (disk.owner !== null) fail("owner_changed");
        assertRecoveryCapacity(disk);
        const candidate = reseal(disk, disk.generation + 1, replacement);
        const result = db.query("UPDATE supervisor_state SET generation=?, envelope_json=?, owner_token=?, owner_pid=? WHERE id=1 AND generation=? AND owner_token IS ? AND owner_pid IS ?").run(
          candidate.generation, canonicalEnvelope(candidate), replacement.token, replacement.pid,
          disk.generation, disk.owner?.token ?? null, disk.owner?.pid ?? null,
        );
        if (result.changes !== 1) fail("owner_changed");
        return candidate;
      });
      const checked = parseRow(readRow(db), { config: options.config, adapterId: options.adapterId });
      if (canonicalEnvelope(checked) !== canonicalEnvelope(next)) fail("store_mismatch");
      assertOwnedCapacity(checked);
      return new SqlitePaperSupervisorStore({ db, stateDir: paths.stateDir, databasePath: paths.databasePath, identity: { config: options.config, adapterId: options.adapterId }, owner: replacement, createdFresh: false });
    } catch (error) {
      try { db.close(true); } catch { /* preserve the underlying failure */ }
      throw normalizeStoreError(error);
    }
  }

  setTestFaults(faults: SqlitePaperSupervisorTestFaults): void {
    this.assertOpen();
    this.faults = { ...faults };
  }

  async load(): Promise<PaperSupervisorEnvelope> {
    this.assertOpen();
    return cloneEnvelope(parseRow(this.readCurrentRow(), this.identity));
  }

  async assertOwner(expectedGeneration: number): Promise<void> {
    this.assertOpen();
    const envelope = parseRow(this.readCurrentRow(), this.identity);
    if (envelope.generation !== expectedGeneration) fail("generation_conflict");
    requireSameOwner(envelope.owner, this.owner);
  }

  async publish(expectedGeneration: number, candidate: PaperSupervisorEnvelope): Promise<PaperSupervisorEnvelope> {
    this.assertOpen();
    const checkedCandidate = validateEnvelope(candidate, this.identity);
    if (checkedCandidate.generation !== expectedGeneration + 1) fail("generation_conflict");
    requireSameOwner(checkedCandidate.owner, this.owner);
    if (canonicalEnvelope(candidate) !== canonicalEnvelope(checkedCandidate)) fail("invalid_envelope");
    await transaction(this.db, () => {
      const current = parseRow(this.readCurrentRow(), this.identity);
      if (current.generation !== expectedGeneration) fail("generation_conflict");
      requireSameOwner(current.owner, this.owner);
      this.faults.beforeUpdate?.();
      const result = this.db.query("UPDATE supervisor_state SET generation=?, envelope_json=?, owner_token=?, owner_pid=? WHERE id=1 AND generation=? AND owner_token=? AND owner_pid=?").run(
        checkedCandidate.generation, canonicalEnvelope(checkedCandidate), this.owner.token, this.owner.pid,
        expectedGeneration, this.owner.token, this.owner.pid,
      );
      if (result.changes !== 1) fail("generation_conflict");
    }, this.faults);
    const acknowledged = parseRow(this.readCurrentRow(), this.identity);
    if (canonicalEnvelope(acknowledged) !== canonicalEnvelope(checkedCandidate)) fail("store_mismatch");
    return cloneEnvelope(acknowledged);
  }

  async release(expectedGeneration: number): Promise<PaperSupervisorEnvelope> {
    this.assertOpen();
    const released = await transaction(this.db, () => {
      const current = parseRow(this.readCurrentRow(), this.identity);
      if (current.generation !== expectedGeneration) fail("generation_conflict");
      requireSameOwner(current.owner, this.owner);
      assertOwnedCapacity(current);
      const candidate = reseal(current, current.generation + 1, null);
      this.faults.beforeUpdate?.();
      const result = this.db.query("UPDATE supervisor_state SET generation=?, envelope_json=?, owner_token=NULL, owner_pid=NULL WHERE id=1 AND generation=? AND owner_token=? AND owner_pid=?").run(
        candidate.generation, canonicalEnvelope(candidate), expectedGeneration, this.owner.token, this.owner.pid,
      );
      if (result.changes !== 1) fail("generation_conflict");
      return candidate;
    });
    const checked = parseRow(this.readCurrentRow(), this.identity);
    if (canonicalEnvelope(checked) !== canonicalEnvelope(released)) fail("store_mismatch");
    this.owner = { ...this.owner };
    return cloneEnvelope(checked);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.faults.beforeClose?.();
    this.db.close(true);
    this.closed = true;
    this.faults.afterCloseBeforeReturn?.();
  }

  private readCurrentRow(): StoreRow | null {
    this.faults.beforeRead?.();
    return readRow(this.db);
  }

  private assertOpen(): void {
    if (this.closed) fail("store_closed");
  }
}

async function transaction<T>(db: Database, operation: () => T, faults: SqlitePaperSupervisorTestFaults = {}): Promise<T> {
  let committed = false;
  try {
    faults.beforeBegin?.();
    db.exec("BEGIN IMMEDIATE");
    const result = operation();
    faults.beforeCommit?.();
    db.exec("COMMIT");
    committed = true;
    faults.afterCommitBeforePublishReturn?.();
    return result;
  } catch (error) {
    if (!committed && db.inTransaction) {
      try { db.exec("ROLLBACK"); } catch { /* preserve the original transaction failure */ }
    }
    throw error;
  }
}

function reseal(envelope: PaperSupervisorEnvelope, generation: number, owner: PaperSupervisorOwner | null): PaperSupervisorEnvelope {
  const { sha256: _discard, ...body } = envelope;
  const candidate = sealEnvelope({ ...body, generation, owner });
  return validateEnvelope(candidate, { config: envelope.capital.config, adapterId: envelope.adapterId });
}

function cloneEnvelope(envelope: PaperSupervisorEnvelope): PaperSupervisorEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as PaperSupervisorEnvelope;
}

function validateOwner(owner: PaperSupervisorOwner): void {
  if (!owner || typeof owner !== "object" || !/^[0-9a-f]{32}$/.test(owner.token) || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) fail("invalid_owner");
}

function validateIdentity(adapterId: string): void {
  if (typeof adapterId !== "string" || adapterId.length === 0 || adapterId.length > 128) fail("identity_mismatch");
}

function normalizeStoreError(error: unknown): Error {
  if (error instanceof PaperSupervisorError) return error;
  const wrapped = new PaperSupervisorError("store_io_error");
  Object.defineProperty(wrapped, "cause", { value: error instanceof Error ? error.name : "unknown", enumerable: false });
  return wrapped;
}
