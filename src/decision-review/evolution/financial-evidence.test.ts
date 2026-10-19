import { expect, test } from "bun:test";
import { normalizeFinancialEvidence, type FinancialEvidenceInput, type FinancialCost, type FinancialCashFlow, type FinancialReceipt, type FinancialInventory } from "./financial-evidence";

const H = "a".repeat(64), START = "b".repeat(64), END = "c".repeat(64);
const USD = { assetKey: "token:1:0x1111111111111111111111111111111111111111", decimals: 6 };
const TOKEN = { assetKey: "token:1:0x2222222222222222222222222222222222222222", decimals: 18 };
function fixture(change: Partial<FinancialEvidenceInput> = {}): FinancialEvidenceInput {
  return {
    schemaVersion: 1, roundId: "round1", pairId: "pair1", cohortHash: H, arm: "A", versionHash: H, evaluatorHash: H, baselineHash: H,
    startAtMs: 1000, endAtMs: 2000, asOfMs: 2100, commonInitialAtMs: 1000, commonInitialSnapshotHash: START,
    portfolioRef: "portfolio_A", ledgerRef: "ledger_A", divergedAtMs: null, measurementClass: "observed_marked", numeraire: USD,
    startInventoryRef: "start", endInventoryRef: "end",
    sources: [{ id: "source1", source: "synthetic_audit", observedAtMs: 2000, availableAtMs: 2050, hash: H }],
    inventories: [
      { id: "start", atMs: 1000, snapshotHash: START, portfolioRef: "portfolio_A", ledgerRef: "ledger_A", origin: "observed_A", sourceRef: "source1", positions: [{ unit: USD, quantityMinor: "100000000", markRef: null }] },
      { id: "end", atMs: 2000, snapshotHash: END, portfolioRef: "portfolio_A", ledgerRef: "ledger_A", origin: "observed_A", sourceRef: "source1", positions: [{ unit: USD, quantityMinor: "101000000", markRef: null }] },
    ], marks: [], flows: [], costs: [], receipts: [],
    coverage: ["inventory", "marks", "flows", "costs", "receipts"].map(kind => ({ kind: kind as "inventory" | "marks" | "flows" | "costs" | "receipts", fromAtMs: 1000, toAtMs: 2000, status: "complete", sourceRef: "source1", expectedIds: kind === "inventory" ? ["start", "end"] : [] })),
    ...change,
  };
}
function normalized(f: FinancialEvidenceInput) { const r = normalizeFinancialEvidence(f); if (!r.ok) throw Error(r.code); return r.value; }
const cost = (change: Partial<FinancialCost> = {}): FinancialCost => ({ id: "cost1", economicRef: "tx1_fee", kind: "fee", unit: USD, amountMinor: "17", atMs: 1500, inclusion: "separate", receiptRef: "receipt1", sourceRef: "source1", markRef: null, ...change });
const receipt = (eventIds = ["cost1"]): FinancialReceipt => ({ id: "receipt1", atMs: 1500, portfolioRef: "portfolio_A", ledgerRef: "ledger_A", origin: "observed", status: "final", auditHash: H, sourceRef: "source1", eventIds });
function withEvents(f: FinancialEvidenceInput, kinds: Partial<Record<"costs" | "flows" | "receipts" | "marks" | "inventory", string[]>>) {
  return { ...f, coverage: f.coverage.map(c => ({ ...c, expectedIds: kinds[c.kind] ?? c.expectedIds })) };
}

test("a locally complete window is only ready for a future calculator, never a return, reward or promotion", () => {
  const v = normalized(fixture()); expect(v.readiness).toBe("ready_for_calculation");
  expect(v.sourceAuthenticated).toBe(false); expect(v.returnCalculated).toBe(false); expect(v.rewardCalculated).toBe(false); expect(v.promotionProven).toBe(false);
  for (const k of ["returnPct", "roi", "profit", "reward"]) expect(Object.hasOwn(v, k)).toBe(false);
  expect(v.knownTotals).toEqual([]);
});

test("complete flags without source, expected rows or known coverage never invent zero", () => {
  for (const f of [fixture({ sources: [] }), fixture({ inventories: [] }), fixture({ coverage: [] }), fixture({ coverage: fixture().coverage.map(c => ({ ...c, expectedIds: null })) })]) {
    const v = normalized(f); expect(v.readiness).toBe("incomplete"); expect(v.knownTotals).toEqual([]); expect(v.diagnostics.length).toBeGreaterThan(0);
  }
});

test("amounts stay exact beyond Number precision and separate costs are summed using integer units", () => {
  const large = "900719925474099312345678901234567890";
  const costs = [cost({ amountMinor: large }), cost({ id: "cost2", economicRef: "tx1_tip", kind: "tip", amountMinor: "9" })];
  const v = normalized(withEvents(fixture({ costs, receipts: [receipt(["cost1", "cost2"])] }), { costs: ["cost1", "cost2"], receipts: ["receipt1"] }));
  expect(v.readiness).toBe("ready_for_calculation"); expect(v.knownTotals).toEqual([{ category: "costs", inclusion: "separate", unit: USD, amountMinor: (BigInt(large) + 9n).toString() }]);
  expect(normalizeFinancialEvidence({ ...fixture(), costs: [{ ...cost(), amountMinor: 1.5 }] }).ok).toBe(false);
});

test("cost inclusion avoids subtracting a fee or impact already represented by fills or inventory", () => {
  const costs = [cost({ inclusion: "in_fill" }), cost({ id: "cost2", economicRef: "tx2_impact", kind: "impact", inclusion: "in_inventory", amountMinor: "23" })];
  const v = normalized(withEvents(fixture({ costs, receipts: [receipt(["cost1", "cost2"])] }), { costs: ["cost1", "cost2"], receipts: ["receipt1"] }));
  expect(v.knownTotals).toEqual([{ category: "costs", inclusion: "included", unit: USD, amountMinor: "40" }]);
  expect(v.returnCalculated).toBe(false);
});

test("same economic cost is never counted twice and contradictory cost claims are conflicts", () => {
  const f = withEvents(fixture({ costs: [cost(), cost({ id: "alias" })], receipts: [receipt(["cost1", "alias"])] }), { costs: ["cost1", "alias"], receipts: ["receipt1"] });
  expect(normalized(f).knownTotals[0]?.amountMinor).toBe("17");
  const conflicting = normalized({ ...f, costs: [cost(), cost({ id: "alias", amountMinor: "18" })] });
  expect(conflicting.readiness).toBe("conflict"); expect(conflicting.diagnostics.some(d => d.code === "cost_conflict")).toBe(true);
});

test("absent amounts, unknown inclusion, missing audit or pending receipts keep costs incomplete", () => {
  for (const f of [
    fixture({ costs: [cost({ amountMinor: null })], receipts: [receipt()] }), fixture({ costs: [cost({ inclusion: "unknown" })], receipts: [receipt()] }),
    fixture({ costs: [cost()], receipts: [{ ...receipt(), auditHash: null }] }), fixture({ costs: [cost()], receipts: [{ ...receipt(), status: "pending" }] }),
  ]) {
    const v = normalized(withEvents(f, { costs: ["cost1"], receipts: ["receipt1"] })); expect(v.readiness).toBe("incomplete"); expect(v.knownTotals).toEqual([]);
  }
});

test("different assets never assume stablecoin parity and missing marks stay unknown", () => {
  const f = fixture(); const end = f.inventories[1]!;
  const v = normalized({ ...f, inventories: [f.inventories[0]!, { ...end, positions: [{ unit: TOKEN, quantityMinor: "1000000000000000000", markRef: null }] }] });
  expect(v.readiness).toBe("incomplete"); expect(v.diagnostics.some(d => d.code === "mark_missing")).toBe(true);
});

test("mark conversion is explicit rational evidence with source, age, asset and numeraire", () => {
  const f = fixture(); const mark = { id: "price1", unit: TOKEN, numeraire: USD, numeratorMinor: "2010000", denominatorMinor: "1000000000000000000", marketAtMs: 1990, maxAgeMs: 20, sourceRef: "source1" };
  const g = withEvents({ ...f, marks: [mark], inventories: [f.inventories[0]!, { ...f.inventories[1]!, positions: [{ unit: TOKEN, quantityMinor: "1000000000000000000", markRef: "price1" }] }] }, { marks: ["price1"] });
  expect(normalized(g).readiness).toBe("ready_for_calculation");
  expect(normalized({ ...g, marks: [{ ...mark, sourceRef: null }] }).readiness).toBe("incomplete");
  expect(normalized({ ...g, marks: [{ ...mark, marketAtMs: 1900 }] }).diagnostics.some(d => d.code === "mark_stale")).toBe(true);
  expect(normalized({ ...g, marks: [{ ...mark, unit: USD }] }).readiness).toBe("conflict");
});

test("source availability is original, future availability is incomplete and time contradictions conflict", () => {
  const f = fixture(); const future = normalized({ ...f, sources: [{ ...f.sources[0]!, availableAtMs: 2200 }] });
  expect(future.readiness).toBe("incomplete"); expect(future.frame.sources[0]?.availableAtMs).toBe(2200);
  expect(normalized({ ...f, sources: [{ ...f.sources[0]!, availableAtMs: 1999 }] }).readiness).toBe("conflict");
});

test("synthetic zero marks stay unsupported, referenced or not, without rewriting reported evidence", () => {
  const f = fixture();
  const mark = { id: "zero_price", unit: TOKEN, numeraire: USD, numeratorMinor: "0", denominatorMinor: "1000000000000000000", marketAtMs: 1990, maxAgeMs: 20, sourceRef: "source1" };
  for (const referenced of [false, true]) {
    const g = withEvents({ ...f, marks: [mark], inventories: referenced
      ? [f.inventories[0]!, { ...f.inventories[1]!, positions: [{ unit: TOKEN, quantityMinor: "1000000000000000000", markRef: mark.id }] }]
      : f.inventories }, { marks: [mark.id] });
    const v = normalized(g);
    expect(v.readiness).toBe("incomplete");
    expect(v.diagnostics).toContainEqual({ code: "mark_zero_unsupported", severity: "incomplete", ref: mark.id });
    expect(v.frame.marks).toEqual([mark]);
    expect(v.frame.inventories).toEqual(g.inventories.slice().sort((a, b) => a.id.localeCompare(b.id)));
    const equivalent = { ...g, marks: [{ ...mark, numeratorMinor: "00" }], inventories: [...g.inventories].reverse(), coverage: [...g.coverage].reverse() };
    expect(normalized(equivalent)).toEqual(v);
    expect(v.sourceAuthenticated).toBe(false); expect(v.externalHashesAuthenticated).toBe(false);
    expect(v.returnCalculated).toBe(false); expect(v.rewardCalculated).toBe(false); expect(v.promotionProven).toBe(false);
    expect(normalized({ ...g, marks: [{ ...mark, numeratorMinor: "1" }] }).readiness).toBe("ready_for_calculation");
    const unknown = normalized({ ...g, marks: [{ ...mark, numeratorMinor: null }] });
    expect(unknown.readiness).toBe("incomplete");
    expect(unknown.diagnostics.some(d => d.code === "mark_unknown")).toBe(true);
    expect(unknown.diagnostics.some(d => d.code === "mark_zero_unsupported")).toBe(false);
    for (const invalid of [{ ...mark, denominatorMinor: "0" }, { ...mark, marketAtMs: 2200 }]) {
      const conflict = normalized({ ...g, marks: [invalid] });
      expect(conflict.readiness).toBe("conflict");
      expect(conflict.diagnostics).toContainEqual({ code: "mark_zero_unsupported", severity: "incomplete", ref: mark.id });
      expect(conflict.diagnostics.some(d => d.code === "mark_time_or_ratio_conflict")).toBe(true);
    }
  }
});

test("synthetic zero quantities and known zero costs remain distinct from unsupported zero prices", () => {
  const f = fixture();
  const g = withEvents({ ...f,
    inventories: [f.inventories[0]!, { ...f.inventories[1]!, positions: [{ unit: TOKEN, quantityMinor: "0", markRef: null }] }],
    costs: [cost({ amountMinor: "0" })], receipts: [receipt()],
  }, { costs: ["cost1"], receipts: ["receipt1"] });
  const v = normalized(g);
  expect(v.readiness).toBe("ready_for_calculation");
  expect(v.knownTotals).toEqual([{ category: "costs", inclusion: "separate", unit: USD, amountMinor: "0" }]);
  expect(v.diagnostics.some(d => d.code === "mark_zero_unsupported" || d.code === "mark_missing")).toBe(false);
  expect(v.returnCalculated).toBe(false);
});

test("conflicting source IDs, units and receipt ownership are explicit diagnostics", () => {
  const f = fixture();
  expect(normalized({ ...f, sources: [...f.sources, { ...f.sources[0]!, hash: "d".repeat(64) }] }).readiness).toBe("conflict");
  const unitConflict = normalized({ ...f, inventories: [f.inventories[0]!, { ...f.inventories[1]!, positions: [{ unit: { ...USD, decimals: 18 }, quantityMinor: "10", markRef: null }] }] });
  expect(unitConflict.readiness).toBe("conflict");
  const badReceipt = withEvents(fixture({ costs: [cost()], receipts: [{ ...receipt(), portfolioRef: "another" }] }), { costs: ["cost1"], receipts: ["receipt1"] });
  expect(normalized(badReceipt).readiness).toBe("conflict");
});

test("a deposit is external capital with pre/post inventory anchors, never inferred profit", () => {
  const f = fixture();
  const anchors: FinancialInventory[] = [
    { ...f.inventories[0]!, id: "pre", atMs: 1500, snapshotHash: "d".repeat(64) },
    { ...f.inventories[0]!, id: "post", atMs: 1500, snapshotHash: "e".repeat(64), positions: [{ unit: USD, quantityMinor: "110000000", markRef: null }] },
  ];
  const flow: FinancialCashFlow = { id: "deposit1", economicRef: "tx1_transfer_0", kind: "deposit", unit: USD, amountMinor: "10000000", atMs: 1500, receiptRef: "receipt1", sourceRef: "source1", markRef: null, beforeInventoryRef: "pre", afterInventoryRef: "post" };
  const g = withEvents(fixture({ inventories: [...f.inventories, ...anchors], flows: [flow], receipts: [receipt(["deposit1"])] }), { inventory: ["start", "end", "pre", "post"], flows: ["deposit1"], receipts: ["receipt1"] });
  const v = normalized(g); expect(v.readiness).toBe("ready_for_calculation"); expect(v.knownTotals).toEqual([{ category: "external_flows", inclusion: "external", unit: USD, amountMinor: "10000000" }]);
  expect(Object.hasOwn(v, "profit")).toBe(false);
  expect(normalized({ ...g, flows: [{ ...flow, beforeInventoryRef: null }] }).readiness).toBe("incomplete");
  expect(normalized({ ...g, flows: [{ ...flow, kind: "unknown" }] }).readiness).toBe("incomplete");
});

test("external-flow aliases deduplicate economic locators while distinct deposits share an audit receipt", () => {
  const f = fixture();
  const pre: FinancialInventory = { ...f.inventories[0]!, id: "pre", atMs: 1500, snapshotHash: "d".repeat(64) };
  const post: FinancialInventory = { ...pre, id: "post", snapshotHash: "e".repeat(64), positions: [{ unit: USD, quantityMinor: "110000000", markRef: null }] };
  const flow: FinancialCashFlow = { id: "deposit1", economicRef: "tx1_transfer_0", kind: "deposit", unit: USD, amountMinor: "10000000", atMs: 1500, receiptRef: "receipt1", sourceRef: "source1", markRef: null, beforeInventoryRef: "pre", afterInventoryRef: "post" };
  const alias = { ...flow, id: "alias", receiptRef: "receipt_alias" };
  const g = withEvents(fixture({ inventories: [...f.inventories, pre, post], flows: [flow, alias], receipts: [receipt(["deposit1"]), { ...receipt(["alias"]), id: "receipt_alias" }] }), { inventory: ["start", "end", "pre", "post"], flows: ["deposit1", "alias"], receipts: ["receipt1", "receipt_alias"] });
  expect(normalized(g).readiness).toBe("ready_for_calculation"); expect(normalized(g).knownTotals[0]?.amountMinor).toBe("10000000");
  const distinct = { ...g, flows: [flow, { ...alias, economicRef: "tx1_transfer_1" }], inventories: [...f.inventories, pre, { ...post, positions: [{ unit: USD, quantityMinor: "120000000", markRef: null }] }] };
  expect(normalized(distinct).readiness).toBe("ready_for_calculation"); expect(normalized(distinct).knownTotals[0]?.amountMinor).toBe("20000000");
  expect(normalized({ ...g, flows: [flow, { ...alias, amountMinor: "10000001" }] }).readiness).toBe("conflict");
  expect(normalized({ ...g, flows: [flow, { ...alias, economicRef: null }] }).readiness).toBe("incomplete");
});

test("cost aliases use economic identity rather than local receipt IDs or unique audit hashes", () => {
  const f = withEvents(fixture({ costs: [cost(), cost({ id: "alias", receiptRef: "receipt_alias" })], receipts: [receipt(["cost1"]), { ...receipt(["alias"]), id: "receipt_alias" }] }), { costs: ["cost1", "alias"], receipts: ["receipt1", "receipt_alias"] });
  expect(normalized(f).readiness).toBe("ready_for_calculation"); expect(normalized(f).knownTotals[0]?.amountMinor).toBe("17");
  const distinct = { ...f, costs: [cost(), cost({ id: "alias", receiptRef: "receipt_alias", economicRef: "tx1_fee_2" })] };
  expect(normalized(distinct).knownTotals[0]?.amountMinor).toBe("34");
});

test("unknown alias evidence stays incomplete without discarding or duplicating a known raw quantity", () => {
  const f = withEvents(fixture({ costs: [cost({ amountMinor: null }), cost({ id: "alias" })], receipts: [receipt(["cost1", "alias"])] }), { costs: ["cost1", "alias"], receipts: ["receipt1"] });
  const v = normalized(f); expect(v.readiness).toBe("incomplete"); expect(v.knownTotals[0]?.amountMinor).toBe("17");
  const unknownIdentity = normalized(withEvents(fixture({ costs: [cost({ economicRef: null })], receipts: [receipt()] }), { costs: ["cost1"], receipts: ["receipt1"] }));
  expect(unknownIdentity.readiness).toBe("incomplete"); expect(unknownIdentity.knownTotals).toEqual([]);
  const unboundAlias = normalized({ ...f, costs: [cost(), cost({ id: "alias", receiptRef: null })] });
  expect(unboundAlias.readiness).toBe("incomplete");
  const contradiction = normalized({ ...f, costs: [cost(), cost({ id: "alias", inclusion: "in_fill" })] });
  expect(contradiction.readiness).toBe("conflict"); expect(contradiction.knownTotals).toEqual([]);
});

test("inventory identity compares holdings rather than the local names of equivalent valuation marks", () => {
  const f = fixture(), p = { id: "p1", unit: TOKEN, numeraire: USD, numeratorMinor: "2010000", denominatorMinor: "1000000000000000000", marketAtMs: 1990, maxAgeMs: 20, sourceRef: "source1" };
  const end: FinancialInventory = { ...f.inventories[1]!, positions: [{ unit: TOKEN, quantityMinor: "1000000000000000000", markRef: "p1" }] };
  const alias: FinancialInventory = { ...end, id: "end_alias", positions: [{ ...end.positions[0]!, markRef: "p2" }] };
  const g = withEvents({ ...f, marks: [p, { ...p, id: "p2" }], inventories: [f.inventories[0]!, end, alias] }, { inventory: ["start", "end", "end_alias"], marks: ["p1", "p2"] });
  expect(normalized(g).readiness).toBe("ready_for_calculation");
  expect(normalized({ ...g, inventories: [f.inventories[0]!, end, { ...alias, positions: [{ ...alias.positions[0]!, quantityMinor: "2" }] }] }).readiness).toBe("conflict");
});

test("B preserves own divergent inventories and does not forge the common initial hash", () => {
  const f = fixture(); const b = fixture({ arm: "B", measurementClass: "simulated", portfolioRef: "portfolio_B", ledgerRef: "ledger_B", commonInitialAtMs: 500, divergedAtMs: 900,
    inventories: f.inventories.map(s => ({ ...s, portfolioRef: "portfolio_B", ledgerRef: "ledger_B", origin: "simulated_B", snapshotHash: s.id === "start" ? "d".repeat(64) : "e".repeat(64) })) });
  const v = normalized(b); expect(v.readiness).toBe("ready_for_calculation"); expect(v.frame.commonInitialSnapshotHash).toBe(START);
  expect(v.frame.inventories[0]?.snapshotHash).not.toBe(START); expect(v.frame.inventories[1]?.snapshotHash).not.toBe(START);
  expect(normalized({ ...b, inventories: b.inventories.map(s => ({ ...s, origin: "copied_A" })) }).readiness).toBe("conflict");
});

test("observed marked, observed realized and simulated are distinct and no realized basis is invented", () => {
  const v = normalized(fixture({ measurementClass: "observed_realized" })); expect(v.readiness).toBe("incomplete");
  expect(v.diagnostics.some(d => d.code === "realized_basis_not_evaluated")).toBe(true);
  expect(normalized(fixture({ measurementClass: "simulated" })).readiness).toBe("conflict");
});

test("normalization is detached, frozen, canonical, and rejects executable or non-exact money input", () => {
  const f = fixture(); const v = normalized(f);
  expect(Object.isFrozen(v.frame)).toBe(true); expect(Object.isFrozen(v.frame.inventories[0]?.positions)).toBe(true);
  expect(normalized({ ...f, sources: [...f.sources].reverse(), inventories: [...f.inventories].reverse() }).hash).toBe(v.hash);
  let calls = 0; const getter = Object.defineProperty({ ...f }, "roundId", { enumerable: true, get() { calls++; throw Error("private"); } });
  expect(normalizeFinancialEvidence(getter).ok).toBe(false); expect(calls).toBe(0);
  expect(normalizeFinancialEvidence({ ...f, costs: [{ ...cost(), amountMinor: "1e6" }] }).ok).toBe(false);
  expect(normalizeFinancialEvidence({ ...f, extra: true }).ok).toBe(false);
  expect(normalizeFinancialEvidence({ ...f, [Symbol("extra")]: true }).ok).toBe(false);
  Object.assign(f.inventories[0]!, { positions: [] });
  expect(v.frame.inventories[0]?.positions).toHaveLength(1);
});

test("financial readiness normalizer has no network, environment, own clock, DB, model or execution imports", async () => {
  const code = await Bun.file(new URL("./financial-evidence.ts", import.meta.url)).text();
  expect(code).not.toMatch(/\bfetch\s*\(|\bprocess\.|\bDate\.now\s*\(|Bun\.|from ["'][^"']*(?:node:fs|sqlite|executor|ledger|model|wire|engine)["']/);
});
