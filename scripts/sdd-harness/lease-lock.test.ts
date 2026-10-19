import { expect, test } from "bun:test";
import { hostname } from "node:os";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLease } from "./lease-lock";
import { resolveSafeStateDirectory } from "./core";

test("an active lease cannot be stolen by a concurrent writer", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-lease-live-")), lock = join(dir, "state.lock");
  try {
    const release = acquireLease(lock, { leaseMs: 10_000 });
    expect(() => acquireLease(lock)).toThrow(/lock ativo/);
    release();
    expect(existsSync(lock)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an expired lease is reclaimed only after its owning PID is dead", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdd-lease-stale-")), lock = join(dir, "state.lock"), now = Date.now();
  const stale = { v: 1, pid: 187654321, host: hostname(), nonce: "dead-owner", createdAt: now - 60_000, expiresAt: now - 1 };
  try {
    writeFileSync(lock, JSON.stringify(stale));
    expect(() => acquireLease(lock, { now: () => now, processAlive: () => true })).toThrow(/lock ativo/);
    const release = acquireLease(lock, { now: () => now, processAlive: (pid) => pid !== stale.pid });
    const current = JSON.parse(readFileSync(lock, "utf8"));
    expect(current.nonce).not.toBe(stale.nonce);
    release();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checkpoint state creation refuses a home component redirected by junction", () => {
  const root = mkdtempSync(join(tmpdir(), "sdd-home-redirect-")), home = join(root, "home"), redirected = join(root, "redirect-data");
  mkdirSync(home); mkdirSync(redirected); symlinkSync(redirected, join(home, ".sdd-harness"), "junction");
  try {
    expect(() => resolveSafeStateDirectory(true, join(root, "repo"), home)).toThrow(/redirecionado/);
    expect(existsSync(join(redirected, "projects"))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
