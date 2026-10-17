import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remainingToday, spend } from "./quota";

test("the daily quota accumulates across runs, never goes negative and resets on a new day", () => {
  const path = join(mkdtempSync(join(tmpdir(), "quota-")), "sub", "q.json");
  const day1 = new Date("2026-10-16T10:00:00Z");
  expect(remainingToday(path, day1, 50)).toBe(50);
  spend(path, 30, day1);
  spend(path, 25, day1);
  expect(remainingToday(path, day1, 50)).toBe(0);
  expect(remainingToday(path, new Date("2026-10-17T00:00:00Z"), 50)).toBe(50);
});
