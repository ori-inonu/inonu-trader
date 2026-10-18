import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface StopControl { version: 1; pid: number; nonce: string }
function parse(raw: unknown): StopControl | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return Object.keys(r).length === 3 && r.version === 1 && Number.isSafeInteger(r.pid) && (r.pid as number) > 0 && typeof r.nonce === "string" && /^[a-f0-9]{64}$/.test(r.nonce) ? r as unknown as StopControl : null;
}
function read(path: string): StopControl | null {
  try { if (statSync(path).size > 1024) return null; return parse(JSON.parse(readFileSync(path, "utf8"))); } catch { return null; }
}
const same = (a: StopControl | null, b: StopControl) => a !== null && a.pid === b.pid && a.nonce === b.nonce;
function writeExclusive(path: string, value: StopControl): void {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx"); try { writeFileSync(fd, JSON.stringify(value) + "\n"); } finally { closeSync(fd); }
}

/** Per-launch local capability. No network listener, financial file, vault access or process termination. A match asks the owning supervisor to send its existing private drain IPC. */
export function createStopControl(requestPath: string, stop: () => void, pid = process.pid): { sessionPath: string; poll(): void; close(): void } {
  const sessionPath = requestPath + ".session.json";
  const session: StopControl = { version: 1, pid, nonce: new Bun.CryptoHasher("sha256").update(crypto.randomUUID() + crypto.randomUUID()).digest("hex") };
  writeExclusive(sessionPath, session);
  let requested = false;
  const poll = () => { if (!requested && same(read(requestPath), session)) { requested = true; stop(); } };
  const timer = setInterval(poll, 1000); timer.unref();
  return { sessionPath, poll, close() { clearInterval(timer); if (same(read(sessionPath), session)) unlinkSync(sessionPath); } };
}

/** Only the exact owned supervisor launch is addressed. Stale or unrelated requests are never overwritten. */
export function requestSupervisorStop(sessionPath: string, requestPath: string, expectedPid: number): void {
  if (sessionPath !== requestPath + ".session.json") throw new Error("local_control_path_mismatch");
  const session = read(sessionPath);
  if (session === null || session.pid !== expectedPid) throw new Error("local_control_identity_mismatch");
  if (same(read(requestPath), session)) return;
  writeExclusive(requestPath, session);
}
