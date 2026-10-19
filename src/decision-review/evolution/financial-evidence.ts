import { createHash } from "node:crypto";
import { chainByIndex, isAddressForChain } from "../../okx-wallet/chains";

/** Local readiness of REPORTED evidence, before a qualified return calculator.
 * External hashes/audit refs are not authenticated or fetched. Complete coverage
 * is a source's assertion plus a checked manifest, never inferred from no rows.
 * No price conversion, portfolio return, reward or promotion is performed. */
const FINANCIAL_EVIDENCE_SCHEMA = 1 as const;
export interface FinancialUnit { readonly assetKey: string; readonly decimals: number }
export interface FinancialSource {
  readonly id: string; readonly source: string;
  /** Original first local observation/availability, not a normalization clock. */
  readonly observedAtMs: number | null; readonly availableAtMs: number | null; readonly hash: string | null;
}
export interface FinancialInventory {
  readonly id: string; readonly atMs: number | null; readonly snapshotHash: string | null;
  readonly portfolioRef: string | null; readonly ledgerRef: string | null;
  readonly origin: "observed_A" | "simulated_B" | "copied_A" | "unknown"; readonly sourceRef: string | null;
  readonly positions: readonly { readonly unit: FinancialUnit; readonly quantityMinor: string | null; readonly markRef: string | null }[];
}
export interface FinancialMark {
  readonly id: string; readonly unit: FinancialUnit; readonly numeraire: FinancialUnit;
  /** Exact numeraire minor units per denominator base minor units. */
  readonly numeratorMinor: string | null; readonly denominatorMinor: string | null;
  /** Economic price instant, expressed by its producer in the window's epoch
   * domain. Unknown/unmapped market time stays null; retrieval is in source. */
  readonly marketAtMs: number | null; readonly maxAgeMs: number | null; readonly sourceRef: string | null;
}
export interface FinancialCashFlow {
  /** Stable event/component locator reported by an auditor/adapter, not a local
   * row ID. Distinct events in one audited transaction use distinct locators. */
  readonly id: string; readonly economicRef: string | null; readonly kind: "deposit" | "withdrawal" | "internal" | "unknown";
  readonly unit: FinancialUnit; readonly amountMinor: string | null; readonly atMs: number;
  readonly receiptRef: string | null; readonly sourceRef: string | null; readonly markRef: string | null;
  readonly beforeInventoryRef: string | null; readonly afterInventoryRef: string | null;
}
export interface FinancialCost {
  readonly id: string; readonly economicRef: string | null; readonly kind: "fee" | "gas" | "tax" | "impact" | "tip" | "rent";
  readonly unit: FinancialUnit; readonly amountMinor: string | null; readonly atMs: number;
  readonly inclusion: "in_inventory" | "in_fill" | "separate" | "unknown";
  readonly receiptRef: string | null; readonly sourceRef: string | null; readonly markRef: string | null;
}
export interface FinancialReceipt {
  readonly id: string; readonly atMs: number | null; readonly portfolioRef: string | null; readonly ledgerRef: string | null;
  readonly origin: "observed" | "simulated" | "unknown"; readonly status: "final" | "pending" | "unknown";
  /** Reference to the existing receipt auditor's artifact, not a substitute RPC/parser. */
  readonly auditHash: string | null; readonly sourceRef: string | null; readonly eventIds: readonly string[];
}
type Category = "inventory" | "marks" | "flows" | "costs" | "receipts";
export interface FinancialCoverage {
  readonly kind: Category; readonly fromAtMs: number; readonly toAtMs: number;
  readonly status: "complete" | "partial" | "unknown"; readonly sourceRef: string | null;
  readonly expectedIds: readonly string[] | null;
}
export interface FinancialEvidenceInput {
  readonly schemaVersion: 1; readonly roundId: string; readonly pairId: string; readonly cohortHash: string; readonly arm: "A" | "B";
  readonly versionHash: string; readonly evaluatorHash: string; readonly baselineHash: string;
  readonly startAtMs: number; readonly endAtMs: number; readonly asOfMs: number;
  readonly commonInitialAtMs: number; readonly commonInitialSnapshotHash: string;
  readonly portfolioRef: string | null; readonly ledgerRef: string | null; readonly divergedAtMs: number | null;
  readonly measurementClass: "observed_marked" | "observed_realized" | "simulated"; readonly numeraire: FinancialUnit;
  readonly startInventoryRef: string; readonly endInventoryRef: string;
  readonly sources: readonly FinancialSource[]; readonly inventories: readonly FinancialInventory[];
  readonly marks: readonly FinancialMark[]; readonly flows: readonly FinancialCashFlow[]; readonly costs: readonly FinancialCost[];
  readonly receipts: readonly FinancialReceipt[]; readonly coverage: readonly FinancialCoverage[];
}
export interface FinancialDiagnostic { readonly code: string; readonly severity: "incomplete" | "conflict" | "info"; readonly ref: string | null }
export interface FinancialKnownTotal {
  readonly category: "external_flows" | "costs"; readonly inclusion: "external" | "included" | "separate";
  readonly unit: FinancialUnit; readonly amountMinor: string;
}
export interface FinancialEvidenceFrame {
  readonly schemaVersion: 1; readonly frame: FinancialEvidenceInput;
  readonly readiness: "ready_for_calculation" | "incomplete" | "conflict";
  readonly diagnostics: readonly FinancialDiagnostic[];
  /** Partial known quantities by exact unit. Included costs must not be subtracted again. */
  readonly knownTotals: readonly FinancialKnownTotal[];
  readonly sourceAuthenticated: false; readonly externalHashesAuthenticated: false;
  readonly returnCalculated: false; readonly rewardCalculated: false; readonly promotionProven: false; readonly hash: string;
}
export type FinancialEvidenceResult = { readonly ok: true; readonly value: FinancialEvidenceFrame } | { readonly ok: false; readonly code: "input_invalid" };

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v: Obj, keys: string) => { const list = keys.split(" "); return Object.keys(v).length === list.length && list.every(k => Object.hasOwn(v, k)); };
const code = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const locator = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_.:/@-]{1,256}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const clock = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const nullable = (v: unknown, check: (v: unknown) => boolean) => v === null || check(v);
const among = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 2048 && v.every(code);
const unit = (v: unknown): FinancialUnit | null => {
  if (!object(v) || !exact(v, "assetKey decimals") || typeof v.assetKey !== "string" || !Number.isInteger(v.decimals) || (v.decimals as number) < 0 || (v.decimals as number) > 36) return null;
  const parts = v.assetKey.split(":");
  if (parts.length !== 3 || parts[0] !== "token" || !isAddressForChain(parts[1]!, parts[2]!)) return null;
  return { assetKey: `token:${parts[1]}:${chainByIndex(parts[1]!)?.kind === "evm" ? parts[2]!.toLowerCase() : parts[2]}`, decimals: v.decimals as number };
};
const minor = (v: unknown, signed = false): string | null | undefined => v === null ? null : typeof v === "string" && (signed ? /^-?\d{1,120}$/ : /^\d{1,120}$/).test(v) ? BigInt(v).toString() : undefined;
function canonical(v: unknown): string {
  if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (!object(v)) throw Error("non_json");
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
}
const digest = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");
function freeze<T>(v: T): T { if (v !== null && typeof v === "object") { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }

/** Reject executable/non-JSON input without reading getters. Proxy traps are
 * not sandboxed; thrown traps become input_invalid. Bounds are representation,
 * never money or operation policy. */
function detach(raw: unknown): unknown {
  let nodes = 0; const active = new Set<object>();
  function visit(v: unknown, depth: number): unknown {
    if (++nodes > 100_000 || depth > 24) throw Error("limit");
    if (v === null || typeof v === "boolean" || typeof v === "string" && v.length <= 2048 || typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || v === null || active.has(v)) throw Error("invalid");
    const array = Array.isArray(v), proto = Object.getPrototypeOf(v);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw Error("invalid");
    const ds = Object.getOwnPropertyDescriptors(v), all = Reflect.ownKeys(v);
    if (all.some(k => typeof k !== "string")) throw Error("invalid");
    const keys = Object.keys(ds).filter(k => !(array && k === "length"));
    if (keys.some(k => !ds[k]!.enumerable || !Object.hasOwn(ds[k]!, "value")) || array && (keys.length !== v.length || keys.some((k, i) => k !== String(i)))) throw Error("invalid");
    active.add(v); const out = array ? keys.map(k => visit(ds[k]!.value, depth + 1)) : Object.fromEntries(keys.map(k => [k, visit(ds[k]!.value, depth + 1)])); active.delete(v); return out;
  }
  const out = visit(raw, 0); if (Buffer.byteLength(JSON.stringify(out)) > 2_000_000) throw Error("limit"); return out;
}
function rows<T>(raw: unknown, parse: (v: Obj) => T | null): T[] | null {
  if (!Array.isArray(raw) || raw.length > 2048) return null;
  const out: T[] = []; for (const r of raw) { if (!object(r)) return null; const p = parse(r); if (p === null) return null; out.push(p); } return out;
}
function parse(raw: unknown): FinancialEvidenceInput | null {
  if (!object(raw) || !exact(raw, "schemaVersion roundId pairId cohortHash arm versionHash evaluatorHash baselineHash startAtMs endAtMs asOfMs commonInitialAtMs commonInitialSnapshotHash portfolioRef ledgerRef divergedAtMs measurementClass numeraire startInventoryRef endInventoryRef sources inventories marks flows costs receipts coverage") || raw.schemaVersion !== 1 || !code(raw.roundId) || !code(raw.pairId) || ![raw.cohortHash, raw.versionHash, raw.evaluatorHash, raw.baselineHash, raw.commonInitialSnapshotHash].every(hash) || !among(raw.arm, ["A", "B"]) || ![raw.startAtMs, raw.endAtMs, raw.asOfMs, raw.commonInitialAtMs].every(clock) || !nullable(raw.divergedAtMs, clock) || !nullable(raw.portfolioRef, code) || !nullable(raw.ledgerRef, code) || !among(raw.measurementClass, ["observed_marked", "observed_realized", "simulated"]) || !code(raw.startInventoryRef) || !code(raw.endInventoryRef)) return null;
  const numeraire = unit(raw.numeraire); if (numeraire === null) return null;
  const sources = rows(raw.sources, r => exact(r, "id source observedAtMs availableAtMs hash") && code(r.id) && code(r.source) && nullable(r.observedAtMs, clock) && nullable(r.availableAtMs, clock) && nullable(r.hash, hash) ? r as unknown as FinancialSource : null);
  const inventories = rows(raw.inventories, r => {
    if (!exact(r, "id atMs snapshotHash portfolioRef ledgerRef origin sourceRef positions") || !code(r.id) || !nullable(r.atMs, clock) || !nullable(r.snapshotHash, hash) || !nullable(r.portfolioRef, code) || !nullable(r.ledgerRef, code) || !among(r.origin, ["observed_A", "simulated_B", "copied_A", "unknown"]) || !nullable(r.sourceRef, code)) return null;
    const positions = rows(r.positions, p => { const u = unit(p.unit), q = minor(p.quantityMinor, true); return exact(p, "unit quantityMinor markRef") && u !== null && q !== undefined && nullable(p.markRef, code) ? { unit: u, quantityMinor: q, markRef: p.markRef as string | null } : null; });
    return positions === null ? null : { ...r, positions } as unknown as FinancialInventory;
  });
  const marks = rows(raw.marks, r => { const u = unit(r.unit), n = unit(r.numeraire), a = minor(r.numeratorMinor), b = minor(r.denominatorMinor); return exact(r, "id unit numeraire numeratorMinor denominatorMinor marketAtMs maxAgeMs sourceRef") && code(r.id) && u !== null && n !== null && a !== undefined && b !== undefined && nullable(r.marketAtMs, clock) && nullable(r.maxAgeMs, clock) && nullable(r.sourceRef, code) ? { ...r, unit: u, numeraire: n, numeratorMinor: a, denominatorMinor: b } as unknown as FinancialMark : null; });
  const common = (r: Obj) => code(r.id) && unit(r.unit) !== null && minor(r.amountMinor) !== undefined && clock(r.atMs) && nullable(r.receiptRef, code) && nullable(r.sourceRef, code) && nullable(r.markRef, code);
  const flows = rows(raw.flows, r => exact(r, "id economicRef kind unit amountMinor atMs receiptRef sourceRef markRef beforeInventoryRef afterInventoryRef") && common(r) && nullable(r.economicRef, locator) && among(r.kind, ["deposit", "withdrawal", "internal", "unknown"]) && nullable(r.beforeInventoryRef, code) && nullable(r.afterInventoryRef, code) ? { ...r, unit: unit(r.unit)!, amountMinor: minor(r.amountMinor)! } as unknown as FinancialCashFlow : null);
  const costs = rows(raw.costs, r => exact(r, "id economicRef kind unit amountMinor atMs inclusion receiptRef sourceRef markRef") && common(r) && nullable(r.economicRef, locator) && among(r.kind, ["fee", "gas", "tax", "impact", "tip", "rent"]) && among(r.inclusion, ["in_inventory", "in_fill", "separate", "unknown"]) ? { ...r, unit: unit(r.unit)!, amountMinor: minor(r.amountMinor)! } as unknown as FinancialCost : null);
  const receipts = rows(raw.receipts, r => exact(r, "id atMs portfolioRef ledgerRef origin status auditHash sourceRef eventIds") && code(r.id) && nullable(r.atMs, clock) && nullable(r.portfolioRef, code) && nullable(r.ledgerRef, code) && among(r.origin, ["observed", "simulated", "unknown"]) && among(r.status, ["final", "pending", "unknown"]) && nullable(r.auditHash, hash) && nullable(r.sourceRef, code) && ids(r.eventIds) ? r as unknown as FinancialReceipt : null);
  const coverage = rows(raw.coverage, r => exact(r, "kind fromAtMs toAtMs status sourceRef expectedIds") && among(r.kind, ["inventory", "marks", "flows", "costs", "receipts"]) && clock(r.fromAtMs) && clock(r.toAtMs) && among(r.status, ["complete", "partial", "unknown"]) && nullable(r.sourceRef, code) && nullable(r.expectedIds, ids) ? r as unknown as FinancialCoverage : null);
  if (!sources || !inventories || !marks || !flows || !costs || !receipts || !coverage) return null;
  return { ...raw, numeraire, sources, inventories, marks, flows, costs, receipts, coverage } as unknown as FinancialEvidenceInput;
}

export function normalizeFinancialEvidence(raw: unknown): FinancialEvidenceResult {
  try { const input = parse(detach(raw)); return input === null ? { ok: false, code: "input_invalid" } : { ok: true, value: normalize(input) }; }
  catch { return { ok: false, code: "input_invalid" }; }
}

function normalize(input: FinancialEvidenceInput): FinancialEvidenceFrame {
  const diagnostics: FinancialDiagnostic[] = [];
  const note = (code: string, severity: FinancialDiagnostic["severity"], ref: string | null = null) => { if (!diagnostics.some(d => d.code === code && d.severity === severity && d.ref === ref)) diagnostics.push({ code, severity, ref }); };
  function unique<T>(values: readonly T[], key: (v: T) => string, label: string): T[] {
    const byKey = new Map<string, T>(); for (const v of values) { const k = key(v), previous = byKey.get(k); if (previous === undefined) byKey.set(k, v); else note(digest(previous) === digest(v) ? "duplicate" : `${label}_conflict`, digest(previous) === digest(v) ? "info" : "conflict", k); }
    return [...byKey].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, v]) => v);
  }
  const frame: FinancialEvidenceInput = { ...input,
    sources: unique(input.sources, s => s.id, "source"),
    inventories: unique(input.inventories.map(s => ({ ...s, positions: unique(s.positions, p => p.unit.assetKey, "position") })), s => s.id, "inventory"),
    marks: unique(input.marks, m => m.id, "mark"), flows: unique(input.flows, f => f.id, "flow"), costs: unique(input.costs, c => c.id, "cost"),
    receipts: unique(input.receipts.map(r => ({ ...r, eventIds: [...r.eventIds].sort() })), r => r.id, "receipt"), coverage: unique(input.coverage.map(c => ({ ...c, expectedIds: c.expectedIds === null ? null : [...c.expectedIds].sort() })), c => c.kind, "coverage"),
  };
  const sources = new Map(frame.sources.map(s => [s.id, s])), inventories = new Map(frame.inventories.map(s => [s.id, s])), marks = new Map(frame.marks.map(m => [m.id, m])), receipts = new Map(frame.receipts.map(r => [r.id, r]));
  const conflictedSources = new Set(diagnostics.filter(d => d.code === "source_conflict").map(d => d.ref));
  function sourced(ref: string | null): boolean {
    const s = ref === null ? undefined : sources.get(ref);
    if (!s || s.hash === null || s.observedAtMs === null || s.availableAtMs === null) { note("source_unknown", "incomplete", ref); return false; }
    if (conflictedSources.has(ref)) return false;
    if (s.availableAtMs < s.observedAtMs) { note("source_time_conflict", "conflict", ref); return false; }
    if (s.availableAtMs > frame.asOfMs || s.observedAtMs > frame.asOfMs) { note("source_not_available", "incomplete", ref); return false; }
    return true;
  }
  for (const s of frame.sources) sourced(s.id);
  if (frame.endAtMs <= frame.startAtMs || frame.commonInitialAtMs > frame.startAtMs || frame.divergedAtMs !== null && (frame.divergedAtMs < frame.commonInitialAtMs || frame.divergedAtMs > frame.endAtMs)) note("window_conflict", "conflict");
  if (frame.asOfMs < frame.endAtMs) note("window_pending", "incomplete");
  if (frame.portfolioRef === null || frame.ledgerRef === null) note("portfolio_unknown", "incomplete");
  if (frame.arm === "B" ? frame.measurementClass !== "simulated" : frame.measurementClass === "simulated") note("measurement_class_conflict", "conflict");
  if (frame.measurementClass === "observed_realized") note("realized_basis_not_evaluated", "incomplete");

  const precisions = new Map<string, number>(), conflictedUnits = new Set<string>();
  const checkUnit = (u: FinancialUnit) => { const known = precisions.get(u.assetKey); if (known !== undefined && known !== u.decimals) { conflictedUnits.add(u.assetKey); note("unit_conflict", "conflict", u.assetKey); } else precisions.set(u.assetKey, u.decimals); };
  checkUnit(frame.numeraire); for (const s of frame.inventories) for (const p of s.positions) checkUnit(p.unit);
  for (const m of frame.marks) { checkUnit(m.unit); checkUnit(m.numeraire); }
  for (const e of [...frame.flows, ...frame.costs]) checkUnit(e.unit);
  const sameUnit = (a: FinancialUnit, b: FinancialUnit) => a.assetKey === b.assetKey && a.decimals === b.decimals;
  function marked(u: FinancialUnit, ref: string | null, atMs: number | null, owner: string): boolean {
    if (conflictedUnits.has(u.assetKey)) return false;
    if (sameUnit(u, frame.numeraire)) return true;
    const m = ref === null ? undefined : marks.get(ref);
    if (!m) { note("mark_missing", "incomplete", owner); return false; }
    if (!sameUnit(m.unit, u) || !sameUnit(m.numeraire, frame.numeraire)) { note("mark_unit_conflict", "conflict", m.id); return false; }
    const sourceOk = sourced(m.sourceRef);
    if (m.numeratorMinor === null || m.denominatorMinor === null || m.marketAtMs === null || m.maxAgeMs === null || atMs === null) { note("mark_unknown", "incomplete", m.id); return false; }
    if (BigInt(m.denominatorMinor) === 0n || m.marketAtMs > atMs) { note("mark_time_or_ratio_conflict", "conflict", m.id); return false; }
    if (atMs - m.marketAtMs > m.maxAgeMs) { note("mark_stale", "incomplete", m.id); return false; }
    return sourceOk;
  }
  for (const m of frame.marks) {
    sourced(m.sourceRef);
    if (!sameUnit(m.numeraire, frame.numeraire)) note("mark_unit_conflict", "conflict", m.id);
    if (m.numeratorMinor === null || m.denominatorMinor === null || m.marketAtMs === null || m.maxAgeMs === null) note("mark_unknown", "incomplete", m.id);
    else if (BigInt(m.denominatorMinor) === 0n || m.marketAtMs > frame.asOfMs) note("mark_time_or_ratio_conflict", "conflict", m.id);
  }
  const inventoryHashes = new Map<string, string>();
  for (const s of frame.inventories) {
    sourced(s.sourceRef);
    if (s.atMs === null || s.snapshotHash === null) note("inventory_unknown", "incomplete", s.id);
    else if (s.atMs < frame.startAtMs || s.atMs > frame.endAtMs) note("inventory_time_conflict", "conflict", s.id);
    if (s.snapshotHash !== null) {
      // A mark is a separate valuation claim. Its local row ID is not part of
      // the reported holdings identity and cannot make an alias contradictory.
      const content = digest(s.positions.map(p => ({ unit: p.unit, quantityMinor: p.quantityMinor }))), old = inventoryHashes.get(s.snapshotHash);
      if (old !== undefined && old !== content) note("inventory_hash_conflict", "conflict", s.id);
      else inventoryHashes.set(s.snapshotHash, content);
    }
    if (s.portfolioRef === null || s.ledgerRef === null || s.origin === "unknown") note("inventory_identity_unknown", "incomplete", s.id);
    else if (s.portfolioRef !== frame.portfolioRef || s.ledgerRef !== frame.ledgerRef || frame.arm === "A" && s.origin !== "observed_A" || frame.arm === "B" && (frame.divergedAtMs === null || s.atMs !== null && s.atMs >= frame.divergedAtMs) && s.origin !== "simulated_B") note("inventory_identity_conflict", "conflict", s.id);
    for (const p of s.positions) if (p.quantityMinor === null) note("quantity_unknown", "incomplete", s.id); else if (BigInt(p.quantityMinor) !== 0n) marked(p.unit, p.markRef, s.atMs, s.id);
  }
  for (const [ref, expected] of [[frame.startInventoryRef, frame.startAtMs], [frame.endInventoryRef, frame.endAtMs]] as const) {
    const s = inventories.get(ref); if (!s) note("boundary_inventory_missing", "incomplete", ref); else if (s.atMs !== null && s.atMs !== expected) note("boundary_time_conflict", "conflict", ref);
  }
  const start = inventories.get(frame.startInventoryRef);
  if (frame.commonInitialAtMs === frame.startAtMs && start?.snapshotHash !== null && start?.snapshotHash !== undefined && start.snapshotHash !== frame.commonInitialSnapshotHash) note("common_initial_conflict", "conflict", start.id);

  const eventIds = new Set<string>();
  for (const e of [...frame.flows, ...frame.costs]) { if (eventIds.has(e.id)) note("event_identity_conflict", "conflict", e.id); eventIds.add(e.id); }
  for (const r of frame.receipts) {
    sourced(r.sourceRef);
    if (r.atMs === null || r.auditHash === null || r.status !== "final" || r.origin === "unknown") note("receipt_incomplete", "incomplete", r.id);
    else if (r.atMs < frame.startAtMs || r.atMs > frame.endAtMs) note("receipt_time_conflict", "conflict", r.id);
    if (r.portfolioRef === null || r.ledgerRef === null) note("receipt_identity_unknown", "incomplete", r.id);
    else if (r.portfolioRef !== frame.portfolioRef || r.ledgerRef !== frame.ledgerRef || r.origin !== (frame.arm === "A" ? "observed" : "simulated")) note("receipt_identity_conflict", "conflict", r.id);
    if (new Set(r.eventIds).size !== r.eventIds.length || r.eventIds.some(id => !eventIds.has(id))) note("receipt_events_conflict", "conflict", r.id);
  }
  function settled(e: FinancialCost | FinancialCashFlow): boolean {
    const r = e.receiptRef === null ? undefined : receipts.get(e.receiptRef);
    if (!r || r.status !== "final" || r.auditHash === null || r.atMs === null) { note("receipt_incomplete", "incomplete", e.id); return false; }
    if (r.portfolioRef === null || r.ledgerRef === null || frame.portfolioRef === null || frame.ledgerRef === null) { note("receipt_identity_unknown", "incomplete", e.id); return false; }
    if (r.portfolioRef !== frame.portfolioRef || r.ledgerRef !== frame.ledgerRef || r.origin !== (frame.arm === "A" ? "observed" : "simulated") || !r.eventIds.includes(e.id)) { note("receipt_binding_conflict", "conflict", e.id); return false; }
    return sourced(r.sourceRef);
  }
  const totals = new Map<string, { category: FinancialKnownTotal["category"]; inclusion: FinancialKnownTotal["inclusion"]; unit: FinancialUnit; amount: bigint }>();
  const add = (category: FinancialKnownTotal["category"], inclusion: FinancialKnownTotal["inclusion"], u: FinancialUnit, amount: bigint) => { const k = `${category}|${inclusion}|${u.assetKey}|${u.decimals}`, old = totals.get(k); totals.set(k, { category, inclusion, unit: u, amount: (old?.amount ?? 0n) + amount }); };
  function money(e: FinancialCost | FinancialCashFlow): boolean {
    const sourceOk = sourced(e.sourceRef), receiptOk = settled(e);
    if (e.atMs < frame.startAtMs || e.atMs > frame.endAtMs) { note("event_time_conflict", "conflict", e.id); return false; }
    if (e.amountMinor === null) { note("amount_unknown", "incomplete", e.id); return false; }
    marked(e.unit, e.markRef, e.atMs, e.id);
    return sourceOk && receiptOk && !conflictedUnits.has(e.unit.assetKey);
  }
  // Local receipt/source/mark IDs can alias the same economic event. Compare
  // claims, not those row IDs or auditHash uniqueness. Null/unknown evidence is
  // incomplete rather than a contradictory assertion. Every alias is validated.
  function economicGroups<T extends FinancialCost | FinancialCashFlow>(events: readonly T[], label: "flow" | "cost", claim: (event: T) => Record<string, unknown>): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const e of events) {
      if (e.economicRef === null) { note("economic_identity_unknown", "incomplete", e.id); continue; }
      const previous = groups.get(e.economicRef) ?? [], current = claim(e);
      for (const p of previous) {
        const earlier = claim(p);
        if (Object.keys(current).some(k => current[k] !== null && earlier[k] !== null && digest(current[k]) !== digest(earlier[k]))) note(`${label}_conflict`, "conflict", e.economicRef);
      }
      if (previous.length > 0) note(`${label}_alias`, "info", e.economicRef);
      previous.push(e); groups.set(e.economicRef, previous);
    }
    return groups;
  }
  const baseClaim = (e: FinancialCost | FinancialCashFlow) => ({ unit: e.unit, amountMinor: e.amountMinor, atMs: e.atMs, kind: e.kind === "unknown" ? null : e.kind });
  const anchorHash = (ref: string | null) => ref === null ? null : inventories.get(ref)?.snapshotHash ?? null;
  const flowGroups = economicGroups(frame.flows, "flow", f => ({ ...baseClaim(f), beforeHash: anchorHash(f.beforeInventoryRef), afterHash: anchorHash(f.afterInventoryRef) }));
  const knownFlows = new Set<string>();
  for (const f of frame.flows) {
    const known = money(f);
    if (f.kind === "unknown") note("flow_unknown", "incomplete", f.id);
    if (f.kind !== "deposit" && f.kind !== "withdrawal") continue;
    const before = f.beforeInventoryRef === null ? undefined : inventories.get(f.beforeInventoryRef), after = f.afterInventoryRef === null ? undefined : inventories.get(f.afterInventoryRef);
    if (!before || !after || before.snapshotHash === null || after.snapshotHash === null) note("flow_valuation_missing", "incomplete", f.id);
    else if (before.id === after.id || before.atMs !== f.atMs || after.atMs !== f.atMs) note("flow_valuation_conflict", "conflict", f.id);
    if (known && f.economicRef !== null && flowGroups.has(f.economicRef) && !knownFlows.has(f.economicRef)) {
      knownFlows.add(f.economicRef); add("external_flows", "external", f.unit, BigInt(f.amountMinor!) * (f.kind === "deposit" ? 1n : -1n));
    }
  }
  const costGroups = economicGroups(frame.costs, "cost", c => ({ ...baseClaim(c), inclusion: c.inclusion === "unknown" ? null : c.inclusion }));
  const knownCosts = new Set<string>();
  for (const c of frame.costs) {
    const known = money(c);
    if (c.inclusion === "unknown") note("cost_inclusion_unknown", "incomplete", c.id);
    if (known && c.inclusion !== "unknown" && c.economicRef !== null && costGroups.has(c.economicRef) && !knownCosts.has(c.economicRef)) {
      knownCosts.add(c.economicRef); add("costs", c.inclusion === "separate" ? "separate" : "included", c.unit, BigInt(c.amountMinor!));
    }
  }
  const categories: Record<Category, readonly string[]> = { inventory: frame.inventories.map(s => s.id), marks: frame.marks.map(m => m.id), flows: frame.flows.map(f => f.id), costs: frame.costs.map(c => c.id), receipts: frame.receipts.map(r => r.id) };
  for (const kind of Object.keys(categories) as Category[]) {
    const c = frame.coverage.find(v => v.kind === kind);
    if (!c) { note("coverage_unknown", "incomplete", kind); continue; }
    sourced(c.sourceRef);
    if (c.status !== "complete" || c.expectedIds === null) note("coverage_unknown", "incomplete", kind);
    if (c.fromAtMs > frame.startAtMs || c.toAtMs < frame.endAtMs) note("coverage_gap", "incomplete", kind);
    if (c.toAtMs < c.fromAtMs) note("coverage_time_conflict", "conflict", kind);
    if (c.expectedIds !== null) {
      if (new Set(c.expectedIds).size !== c.expectedIds.length) note("coverage_ids_conflict", "conflict", kind);
      if (c.expectedIds.some(id => !categories[kind].includes(id))) note("expected_evidence_missing", "incomplete", kind);
      if (categories[kind].some(id => !c.expectedIds!.includes(id))) note("coverage_unlisted_evidence", "conflict", kind);
    }
  }
  diagnostics.sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
  // A contradictory frame never presents selected claims as trustworthy totals.
  // Incomplete but non-conflicting frames may retain explicitly partial amounts.
  const knownTotals = diagnostics.some(d => d.severity === "conflict") ? [] : [...totals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, t]) => ({ category: t.category, inclusion: t.inclusion, unit: t.unit, amountMinor: t.amount.toString() }));
  const body = { schemaVersion: FINANCIAL_EVIDENCE_SCHEMA, frame, readiness: diagnostics.some(d => d.severity === "conflict") ? "conflict" as const : diagnostics.some(d => d.severity === "incomplete") ? "incomplete" as const : "ready_for_calculation" as const,
    diagnostics, knownTotals, sourceAuthenticated: false as const, externalHashesAuthenticated: false as const, returnCalculated: false as const, rewardCalculated: false as const, promotionProven: false as const };
  return freeze({ ...body, hash: digest(body) });
}
