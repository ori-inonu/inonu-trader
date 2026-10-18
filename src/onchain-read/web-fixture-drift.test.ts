/**
 * Drift guard for the JSON contract between the backend normalizers and the web client.
 * Compare parsed data so checkout line endings cannot masquerade as contract drift.
 * If a normalizer changes, regenerate with scripts/make-onchain-web-fixtures.ts.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GUARDED_ROUTES, OUT_PATH, renderOnchainNormalized } from "../../scripts/make-onchain-web-fixtures";

describe("onchain web fixture contract", () => {
 test("the committed JSON equals a fresh regeneration for every guarded route", () => {
  const committed = readFileSync(OUT_PATH, "utf8");
  const parsed = JSON.parse(committed) as Record<string, unknown>;
  expect(parsed).toEqual(JSON.parse(renderOnchainNormalized()));
  expect(Object.keys(parsed).sort()).toEqual([...GUARDED_ROUTES].sort());
 });
});
