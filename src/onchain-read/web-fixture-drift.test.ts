/**
 * Drift guard for the contract between the backend normalizers and the web client: the committed
 * web/src/lib/test-fixtures/onchain-normalized.json must equal a fresh regeneration from the
 * backend fixtures. If a normalizer changes, regenerate with scripts/make-onchain-web-fixtures.ts.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GUARDED_ROUTES, OUT_PATH, renderOnchainNormalized } from "../../scripts/make-onchain-web-fixtures";

describe("onchain web fixture contract", () => {
  test("the committed JSON equals a fresh regeneration for every guarded route", () => {
    const committed = readFileSync(OUT_PATH, "utf8");
    expect(committed).toBe(renderOnchainNormalized());
    const parsed = JSON.parse(committed) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([...GUARDED_ROUTES].sort());
  });
});
