import { expect, test } from "bun:test";
import { createFixtureAdapter, createSyntheticAdapter } from "./adapter.ts";
import { sha256Hex } from "./canonical.ts";
import { canonicalJson } from "./canonical.ts";
import { syntheticInput } from "./fixture.ts";
import { DerivativesError } from "./types.ts";

test("OKX-DERIV D14: the synthetic adapter is a read-only OKX venue adapter with explicit capabilities and blockers", () => {
  const adapter = createSyntheticAdapter();
  expect(adapter.venue).toBe("okx");
  expect(adapter.adapterKind).toBe("offline_fixture");
  expect(adapter.apiVersion).toBe("okx_v5_normalized_snapshot_v1");
  expect(adapter.mode).toBe("synthetic");
  expect(adapter.sourceClaim).toBe("synthetic");
  expect(adapter.capabilities).toEqual({
    read: true,
    authenticated: false,
    demo: false,
    live: false,
    signer: false,
    network: false,
    blockers: ["execution_not_qualified", "no_credentials", "no_network_client", "no_signer", "offline_fixture_only"],
  });
});

test("OKX-DERIV D16: the adapter surface can read snapshots and nothing else: no order, signing or network method exists", () => {
  const adapter = createSyntheticAdapter();
  expect(Object.keys(adapter).sort()).toEqual(["adapterKind", "apiVersion", "capabilities", "evaluation", "inputSha256", "mode", "snapshot", "sourceClaim", "venue"]);
  expect(Object.isFrozen(adapter)).toBe(true);
  expect(Object.isFrozen(adapter.capabilities)).toBe(true);
  expect(Object.isFrozen(adapter.capabilities.blockers)).toBe(true);
  for (const name of Object.keys(adapter)) {
    expect(/order|place|cancel|sign|send|trade|transfer|withdraw|connect|fetch|subscribe|login|auth/i.test(name) && name !== "capabilities").toBe(false);
  }
});

test("OKX-DERIV D14: snapshot and evaluation are synchronous, repeatable and typed values", () => {
  const adapter = createSyntheticAdapter();
  const first = adapter.snapshot();
  expect(adapter.snapshot()).toBe(first);
  expect(first.perp.instId).toBe("SYN-USDT-SWAP");
  expect(adapter.evaluation().leverages).toEqual([1, 2, 3, 5, 10, 20]);
  expect(adapter.inputSha256()).toBe(sha256Hex(canonicalJson(syntheticInput())));
  expect(adapter.inputSha256()).toMatch(/^[0-9a-f]{64}$/);
});

test("OKX-DERIV D14: a file-based adapter validates strictly and is marked imported", () => {
  const adapter = createFixtureAdapter(syntheticInput(), "imported");
  expect(adapter.mode).toBe("imported");
  expect(adapter.sourceClaim).toBe("synthetic");
  const claimed = syntheticInput();
  claimed.sourceClaim = "operator_claimed";
  expect(createFixtureAdapter(claimed, "imported").sourceClaim).toBe("operator_claimed");
  const hash = adapter.inputSha256();
  const changed = syntheticInput() as { snapshot: { mark: { markPx: string } } };
  changed.snapshot.mark.markPx = "1001.2";
  expect(createFixtureAdapter(changed, "imported").inputSha256()).not.toBe(hash);

  for (const bad of [null, [], "x", { schema: "okx_derivatives_input_v1" }, { ...syntheticInput(), extra: 1 }]) {
    expect(() => createFixtureAdapter(bad, "imported")).toThrow(DerivativesError);
  }
});
