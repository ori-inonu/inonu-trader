import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JEV_DAILY_CALLS, refund, reserve } from "./quota";

const ledger = () => join(mkdtempSync(join(tmpdir(), "quota-")), "q.json");
const day1 = new Date("2026-10-16T10:00:00Z");

test("concurrent reservations never exceed the daily limit and a crash keeps its reservation", async () => {
  const path = ledger();
  const grants = await Promise.all(Array.from({ length: 8 }, () => reserve(path, 10, day1, 35)));
  expect(grants.reduce((a, b) => a + b, 0)).toBe(35);
  expect(await reserve(path, 5, day1, 35)).toBe(0);
});

test("refund frees only the unused part and a new day starts fresh", async () => {
  const path = ledger();
  expect(await reserve(path, 30, day1, 50)).toBe(30);
  await refund(path, 25, day1);
  expect(await reserve(path, 100, day1, 50)).toBe(45);
  expect(await reserve(path, 100, new Date("2026-10-17T00:00:00Z"), 50)).toBe(50);
});

test("the default has no daily ceiling (owner decision of 2026-10-17) and the ledger still counts the day", async () => {
  const path = ledger();
  expect(JEV_DAILY_CALLS).toBe(Number.POSITIVE_INFINITY);
  expect(await reserve(path, 500, day1)).toBe(500);
  expect(await reserve(path, 700, day1)).toBe(700);
  expect((JSON.parse(readFileSync(path, "utf8")) as Record<string, number>)["2026-10-16"]).toBe(1200);
  await refund(path, 200, day1);
  expect((JSON.parse(readFileSync(path, "utf8")) as Record<string, number>)["2026-10-16"]).toBe(1000);
});
