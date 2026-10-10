import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalEnvelope,
  createInitialEnvelope,
  sealEnvelope,
  type PaperSupervisorEnvelope,
  type PaperSupervisorOwner,
} from "./paper-supervisor";
import { SqlitePaperSupervisorStore } from "./paper-supervisor-store";
import { PaperCapital, type PaperCapitalConfig } from "./paper-capital";

const asset = { chainId: "31337", token: "native", decimals: 0, venue: "synthetic" } as const;
const config: PaperCapitalConfig = {
  asset,
  initialAtoms: "1000",
  maxCommittedAtoms: "400",
  maxDrawdownAtoms: "100",
};
const adapterId = "store-test-v1";
const ownerA: PaperSupervisorOwner = { token: "a".repeat(32), pid: 801 };
const ownerB: PaperSupervisorOwner = { token: "b".repeat(32), pid: 802 };
const roots: string[] = [];

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "inonu-supervisor-store-"));
  roots.push(root);
  return root;
}

function nextGeneration(envelope: PaperSupervisorEnvelope, generation: number): PaperSupervisorEnvelope {
  const { sha256: _discard, ...body } = envelope;
  return sealEnvelope({ ...body, generation });
}

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("SqlitePaperSupervisorStore durable ownership", () => {
  test("fails closed without changing disk for schema, version, row, mirror, identity, and canonicality violations", async () => {
    const corruptions: Array<{ name: string; code: string; mutate(db: Database): void; config?: PaperCapitalConfig; adapterId?: string }> = [
      { name: "schema-version", code: "unsupported_schema", mutate(db) { db.exec("PRAGMA user_version=2"); } },
      { name: "extra-column", code: "unsupported_schema", mutate(db) { db.exec("ALTER TABLE supervisor_state ADD COLUMN unexpected TEXT"); } },
      { name: "extra-object", code: "unsupported_schema", mutate(db) { db.exec("CREATE TABLE unexpected(id INTEGER)"); } },
      { name: "missing-row", code: "invalid_store", mutate(db) { db.exec("DELETE FROM supervisor_state WHERE id=1"); } },
      { name: "extra-row", code: "invalid_store", mutate(db) {
        db.exec("PRAGMA ignore_check_constraints=ON");
        db.exec("INSERT INTO supervisor_state(id,generation,envelope_json,owner_token,owner_pid) VALUES(2,0,'{}',NULL,NULL)");
        db.exec("PRAGMA ignore_check_constraints=OFF");
      } },
      { name: "generation-mirror", code: "invalid_store", mutate(db) { db.exec("UPDATE supervisor_state SET generation=9 WHERE id=1"); } },
      { name: "token-mirror", code: "invalid_store", mutate(db) { db.query("UPDATE supervisor_state SET owner_token=? WHERE id=1").run("b".repeat(32)); } },
      { name: "pid-mirror", code: "invalid_store", mutate(db) { db.exec("UPDATE supervisor_state SET owner_pid=999 WHERE id=1"); } },
      { name: "noncanonical-json", code: "noncanonical_state", mutate(db) {
        const row = db.query("SELECT envelope_json FROM supervisor_state WHERE id=1").get() as { envelope_json: string };
        const envelope = JSON.parse(row.envelope_json) as Record<string, unknown>;
        db.query("UPDATE supervisor_state SET envelope_json=? WHERE id=1").run(JSON.stringify(Object.fromEntries(Object.entries(envelope).reverse())));
      } },
      { name: "bad-envelope-checksum", code: "invalid_envelope", mutate(db) {
        const row = db.query("SELECT envelope_json FROM supervisor_state WHERE id=1").get() as { envelope_json: string };
        const envelope = JSON.parse(row.envelope_json) as Record<string, unknown>;
        envelope.sha256 = "0".repeat(64);
        db.query("UPDATE supervisor_state SET envelope_json=? WHERE id=1").run(canonicalEnvelope(envelope as unknown as PaperSupervisorEnvelope));
      } },
      { name: "config-identity", code: "identity_mismatch", mutate() {}, config: { ...config, initialAtoms: "1001" } },
      { name: "adapter-identity", code: "identity_mismatch", mutate() {}, adapterId: "other-adapter" },
    ];

    for (const corruption of corruptions) {
      const stateDir = join(newRoot(), corruption.name);
      const created = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
      await created.release(0);
      await created.close();
      const databasePath = join(stateDir, "supervisor.sqlite");
      const disk = new Database(databasePath, { readwrite: true, strict: true });
      try { corruption.mutate(disk); }
      finally { disk.close(); }
      const before = fileSha256(databasePath);
      await expect(SqlitePaperSupervisorStore.resume({
        stateDir,
        config: corruption.config ?? config,
        adapterId: corruption.adapterId ?? adapterId,
        owner: ownerB,
      })).rejects.toThrow(corruption.code);
      expect(fileSha256(databasePath)).toBe(before);
    }
  });

  test("requires exact trusted prior-child identity and a positive exit acknowledgment before owner replacement", async () => {
    for (const failure of ["false", "unknown", "throw"] as const) {
      const stateDir = join(newRoot(), `proof-${failure}`);
      const created = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
      await created.close();
      const databasePath = join(stateDir, "supervisor.sqlite");
      const before = fileSha256(databasePath);
      let verifyCalls = 0;
      await expect(SqlitePaperSupervisorStore.resume({
        stateDir,
        config,
        adapterId,
        owner: ownerB,
        recoverOwner: {
          expectedToken: ownerA.token,
          expectedPid: ownerA.pid,
          verifyExited(owner) {
            verifyCalls++;
            expect(owner).toEqual(ownerA);
            if (failure === "throw") throw new Error("verifier_unavailable");
            return failure === "false" ? false : undefined as unknown as boolean;
          },
        },
      })).rejects.toThrow(failure === "throw" ? "store_io_error" : "owner_busy");
      expect(verifyCalls).toBe(1);
      expect(fileSha256(databasePath)).toBe(before);
    }

    const stateDir = join(newRoot(), "proof-mismatch");
    const created = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
    await created.close();
    const databasePath = join(stateDir, "supervisor.sqlite");
    const before = fileSha256(databasePath);
    let called = false;
    await expect(SqlitePaperSupervisorStore.resume({
      stateDir,
      config,
      adapterId,
      owner: ownerB,
      recoverOwner: { expectedToken: ownerA.token, expectedPid: ownerA.pid + 1, verifyExited() { called = true; return true; } },
    })).rejects.toThrow("owner_busy");
    expect(called).toBe(false);
    expect(fileSha256(databasePath)).toBe(before);
  });

  test("creates an exclusive local database and holds ownership for its lifetime", async () => {
    const stateDir = join(newRoot(), "state");
    const store = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
    const envelope = await store.load();

    const disk = new Database(join(stateDir, "supervisor.sqlite"), { readonly: true });
    expect((disk.query("PRAGMA journal_mode").get() as Record<string, unknown>).journal_mode).toBe("delete");
    expect(Number((disk.query("PRAGMA synchronous").get() as Record<string, unknown>).synchronous)).toBe(2);
    expect(Number((disk.query("PRAGMA busy_timeout").get() as Record<string, unknown>).timeout)).toBe(0);
    expect(Number((disk.query("PRAGMA user_version").get() as Record<string, unknown>).user_version)).toBe(1);
    disk.close();

    expect(store.createdFresh).toBe(true);
    expect(envelope.generation).toBe(0);
    expect(envelope.owner).toEqual(ownerA);
    expect(PaperCapital.restore(envelope.capital).snapshot().balanceAtoms).toBe("1000");
    expect(envelope.capital.events).toEqual([]);
    expect(await store.assertOwner(0)).toBeUndefined();
    await expect(SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerB })).rejects.toThrow();

    await store.close();
    await expect(SqlitePaperSupervisorStore.resume({ stateDir, config, adapterId, owner: ownerB })).rejects.toThrow();
    const recovered = await SqlitePaperSupervisorStore.resume({
      stateDir,
      config,
      adapterId,
      owner: ownerB,
      recoverOwner: { expectedToken: ownerA.token, expectedPid: ownerA.pid, verifyExited: async () => true },
    });
    expect((await recovered.load()).owner).toEqual(ownerB);
    await recovered.close();
  });

  test("distinguishes rollback before COMMIT from a committed save whose acknowledgment is lost", async () => {
    const stateDir = join(newRoot(), "state");
    const store = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
    const original = await store.load();
    const candidate = nextGeneration(original, 1);

    store.setTestFaults({ beforeCommit: () => { throw new Error("before_commit"); } });
    await expect(store.publish(0, candidate)).rejects.toThrow();
    expect((await store.load()).generation).toBe(0);

    await store.close();
    const afterCommit = await SqlitePaperSupervisorStore.resume({
      stateDir,
      config,
      adapterId,
      owner: ownerA,
      recoverOwner: { expectedToken: ownerA.token, expectedPid: ownerA.pid, verifyExited: async () => true },
    });
    const current = await afterCommit.load();
    const next = nextGeneration(current, current.generation + 1);
    afterCommit.setTestFaults({ afterCommitBeforePublishReturn: () => { throw new Error("ack_lost"); } });

    await expect(afterCommit.publish(current.generation, next)).rejects.toThrow("ack_lost");
    const disk = new Database(join(stateDir, "supervisor.sqlite"), { readonly: true });
    const row = disk.query("SELECT generation, envelope_json FROM supervisor_state WHERE id=1").get() as { generation: number; envelope_json: string };
    disk.close();
    expect(row.generation).toBe(next.generation);
    expect(JSON.parse(row.envelope_json)).toEqual(next);
    await afterCommit.close();
  });

  test("refuses missing resume state and cannot replace a live owner without exact exited-child proof", async () => {
    const root = newRoot();
    const missing = join(root, "missing");
    await expect(SqlitePaperSupervisorStore.resume({ stateDir: missing, config, adapterId, owner: ownerB })).rejects.toThrow();

    const stateDir = join(root, "state");
    const store = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
    await store.close();

    await expect(SqlitePaperSupervisorStore.resume({ stateDir, config, adapterId, owner: ownerB })).rejects.toThrow();
    await expect(SqlitePaperSupervisorStore.resume({
      stateDir,
      config,
      adapterId,
      owner: ownerB,
      recoverOwner: { expectedToken: "c".repeat(32), expectedPid: ownerA.pid, verifyExited: async () => true },
    })).rejects.toThrow();
  });

  test("keeps begin, update, read, and close faults distinct from committed acknowledgment loss", async () => {
    const stateDir = join(newRoot(), "state");
    const store = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
    try {
      const original = await store.load();

      store.setTestFaults({ beforeBegin: () => { throw new Error("begin_failed"); } });
      await expect(store.publish(0, nextGeneration(original, 1))).rejects.toThrow("begin_failed");
      store.setTestFaults({ beforeUpdate: () => { throw new Error("update_failed"); } });
      await expect(store.publish(0, nextGeneration(original, 1))).rejects.toThrow("update_failed");
      expect((await store.load()).generation).toBe(0);

      store.setTestFaults({ beforeRead: () => { throw new Error("read_failed"); } });
      await expect(store.load()).rejects.toThrow("read_failed");
      store.setTestFaults({});
      expect((await store.load()).generation).toBe(0);

      store.setTestFaults({ beforeClose: () => { throw new Error("close_failed"); } });
      await expect(store.close()).rejects.toThrow("close_failed");
      expect((await store.load()).generation).toBe(0);
      store.setTestFaults({});
      await store.close();
      await store.close();

      const lostCloseAck = await SqlitePaperSupervisorStore.create({ stateDir: join(newRoot(), "close-ack"), config, adapterId, owner: ownerA });
      lostCloseAck.setTestFaults({ afterCloseBeforeReturn: () => { throw new Error("close_ack_lost"); } });
      await expect(lostCloseAck.close()).rejects.toThrow("close_ack_lost");
      await expect(lostCloseAck.load()).rejects.toThrow("store_closed");
      await lostCloseAck.close();
    } finally {
      try { store.setTestFaults({}); } catch { /* store may already be closed */ }
      await store.close();
    }
  });

  test("uses a disk generation and owner fence across a competing SQLite connection", async () => {
    const stateDir = join(newRoot(), "state");
    const store = await SqlitePaperSupervisorStore.create({ stateDir, config, adapterId, owner: ownerA });
    const competing = new Database(join(stateDir, "supervisor.sqlite"), { readwrite: true, strict: true });
    try {
      const current = await store.load();
      const { sha256: _discard, ...body } = current;
      const resealed = sealEnvelope({ ...body, generation: 1, owner: ownerB });
      competing.query("UPDATE supervisor_state SET generation=?, envelope_json=?, owner_token=?, owner_pid=? WHERE id=1").run(
        resealed.generation, canonicalEnvelope(resealed), ownerB.token, ownerB.pid,
      );

      await expect(store.publish(0, nextGeneration(current, 1))).rejects.toThrow("generation_conflict");
      await expect(store.assertOwner(1)).rejects.toThrow("owner_mismatch");
      expect((competing.query("SELECT generation, owner_token, owner_pid FROM supervisor_state WHERE id=1").get() as Record<string, unknown>)).toEqual({ generation: 1, owner_token: ownerB.token, owner_pid: ownerB.pid });
    } finally {
      competing.close();
      await store.close();
    }
  });
});
