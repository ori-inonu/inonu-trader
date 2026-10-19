import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSafeStateDirectory, resolveSafeStateDirectory, enforceCallLimit, projectRoot, saveCheckpoint, stateFile, validateCheckpoint } from "./core";
import { validateRunLimit } from "./limits";

const spec = { id: "test", goal: "Choose a safe implementation", facts: {}, rails: ["No network"], options: [{ id: "a", label: "A", what: "Do A" }, { id: "b", label: "B", what: "Do B" }] };
describe("sdd harness boundaries", () => {
  test("accepts omission and optional caps above 16, refusing invalid explicit values", () => {
    expect(validateRunLimit(undefined)).toBeUndefined();
    expect(validateRunLimit(16)).toBe(16);
    expect(validateRunLimit(17)).toBe(17);
    expect(validateRunLimit(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    for (const n of [null, "17", 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) expect(() => validateRunLimit(n)).toThrow();
  });
  test("rejects planned overflow before provider setup and permits repeated per-call caps", () => {
    expect(() => enforceCallLimit(spec, 1)).toThrow(/excedem teto/);
    expect(enforceCallLimit(spec, 16).plannedCalls).toBe(11);
    expect(enforceCallLimit(spec, 11).maxCalls).toBe(11);
    expect(enforceCallLimit(spec, 16).maxCalls).toBe(16);
    const largeSpec = { ...spec, options: Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}`, what: "Safe alternative" })) };
    expect(enforceCallLimit(largeSpec, undefined).maxCalls).toBeUndefined();
    expect(enforceCallLimit(largeSpec, undefined).plannedCalls).toBeGreaterThan(16);
  });
  test("state target is outside repo and path scoped to project", () => {
    const root = projectRoot(process.cwd()), file = stateFile(root);
    expect(file.toLowerCase()).not.toContain(".env");
    expect(file.toLowerCase()).not.toContain("\\data\\");
    expect(file.startsWith(root)).toBe(false);
  });
  test("rejects state bound to a different project", () => {
    const dir = mkdtempSync(join(tmpdir(), "sdd-harness-test-"));
    try {
      const root = projectRoot(dir), state = { v: 1 as const, project: root, objective: "test", iteration: 0, maxIterations: 2, deadlineMs: Date.now() + 1000, updatedAt: Date.now() };
      expect(validateCheckpoint(state, root)).toEqual(state);
      expect(() => validateCheckpoint(state, process.cwd())).toThrow(/invalido/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

test("state path rejects repository data, env folders, and redirected roots", () => {
  const repo = projectRoot(process.cwd()), safe = join(tmpdir(), "sdd-harness-state-safe");
  expect(() => assertSafeStateDirectory(safe, join(repo, "data", "checkpoints"), repo)).toThrow(/recusado/);
  expect(() => assertSafeStateDirectory(safe, join(safe, "different"), repo)).toThrow(/recusado/);
  expect(() => assertSafeStateDirectory(join(safe, ".env.local"), join(safe, ".env.local"), repo)).toThrow(/recusado/);
  expect(() => assertSafeStateDirectory(safe, safe, repo)).not.toThrow();
});
