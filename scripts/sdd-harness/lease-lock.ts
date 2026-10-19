import { hostname } from "node:os";
import { openSync, closeSync, writeSync, fsyncSync, readFileSync, linkSync, existsSync, lstatSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface LeaseRecord { v: 1; pid: number; host: string; nonce: string; createdAt: number; expiresAt: number }
export interface LeaseOptions { leaseMs?: number; now?: () => number; processAlive?: (pid: number) => boolean }
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } };
const parseLease = (path: string): LeaseRecord | null => {
  try {
    if (lstatSync(path).isSymbolicLink()) return null;
    const v = JSON.parse(readFileSync(path, "utf8"));
    return v?.v === 1 && Number.isSafeInteger(v.pid) && v.pid > 0 && typeof v.host === "string" && typeof v.nonce === "string" && Number.isFinite(v.createdAt) && Number.isFinite(v.expiresAt) ? v as LeaseRecord : null;
  } catch { return null; }
};
const mayReclaim = (lease: LeaseRecord | null, now: number, processAlive: (pid: number) => boolean) => !!lease && lease.host === hostname() && lease.expiresAt <= now && !processAlive(lease.pid);

export function acquireLease(path: string, options: LeaseOptions = {}): () => void {
  const now = options.now ?? Date.now, processAlive = options.processAlive ?? alive, leaseMs = options.leaseMs ?? 30_000;
  mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    const lease: LeaseRecord = { v: 1, pid: process.pid, host: hostname(), nonce: randomUUID(), createdAt: now(), expiresAt: now() + leaseMs };
    const staging = path + "." + process.pid + "." + lease.nonce + ".tmp";
    const fd = openSync(staging, "wx", 0o600);
    try { writeSync(fd, JSON.stringify(lease)); fsyncSync(fd); } catch (error) { closeSync(fd); try { unlinkSync(staging); } catch {} throw error; }
    closeSync(fd);
    try { linkSync(staging, path); unlinkSync(staging); }
    catch (error) {
      try { unlinkSync(staging); } catch {}
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = parseLease(path);
      if (!mayReclaim(existing, now(), processAlive)) throw new Error("lock ativo, lease valido ou proprietario nao verificavel");
      const quarantine = path + "." + randomUUID() + ".stale";
      try { renameSync(path, quarantine); } catch { continue; }
      const moved = parseLease(quarantine);
      if (!moved || moved.nonce !== existing!.nonce || !mayReclaim(moved, now(), processAlive)) {
        try { renameSync(quarantine, path); } catch {}
        throw new Error("lock mudou durante recuperacao; nenhuma escrita realizada");
      }
      unlinkSync(quarantine);
    }
    if (existsSync(path)) {
      const current = parseLease(path);
      if (current?.nonce === lease.nonce && current.pid === process.pid) return () => { const owner = parseLease(path); if (owner?.nonce === lease.nonce && owner.pid === process.pid) try { unlinkSync(path); } catch {} };
    }
  }
  throw new Error("lock concorrente; tente novamente");
}
