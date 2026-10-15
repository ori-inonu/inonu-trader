import { expect, test } from "bun:test";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStopControl, requestSupervisorStop } from "./control";

test("a fresh local stop capability addresses one owned launch and asks its normal drain exactly once", () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-control-synthetic-")), path = join(dir, "stop.json"); let stops = 0;
  const c = createStopControl(path, () => { stops++; }, 123);
  try {
    c.poll(); expect(stops).toBe(0);
    expect(() => requestSupervisorStop(c.sessionPath, path, 456)).toThrow("local_control_identity_mismatch");
    requestSupervisorStop(c.sessionPath, path, 123); c.poll(); c.poll(); expect(stops).toBe(1);
    requestSupervisorStop(c.sessionPath, path, 123); expect(stops).toBe(1);
  } finally { c.close(); unlinkSync(path); rmdirSync(dir); }
});

test("a stale request or an invalid document cannot stop the next supervisor launch", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-control-synthetic-")), path = join(dir, "stop.json"); let stops = 0;
  const first = createStopControl(path, () => { stops++; }, 123);
  requestSupervisorStop(first.sessionPath, path, 123); first.close();
  const second = createStopControl(path, () => { stops++; }, 123);
  try {
    second.poll(); expect(stops).toBe(0);
    await Bun.write(path, JSON.stringify({ version: 1, pid: 123, nonce: "invalid", execute: true }));
    second.poll(); expect(stops).toBe(0);
    expect(() => requestSupervisorStop(second.sessionPath, path + ".other", 123)).toThrow("local_control_path_mismatch");
  } finally { second.close(); unlinkSync(path); rmdirSync(dir); }
});
