import { appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, opendirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { CEILINGS } from "./plan";
import type { CapturePlan } from "./plan";
export const hash = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const encoded = (v: unknown): Buffer => Buffer.from(JSON.stringify(v) + "\n");
export interface RawRecord { kind: "raw"; payloadBase64: string; payloadBytes: number; payloadHash: string; encoding: string; [key: string]: any }
interface Segment { file: string; bytes: number; count: number; firstOrdinal: number | null; lastOrdinal: number | null; hash?: string; identities: string[]; sources: string[]; clockStatus: string; checkedObservations: number; rejectedObservations: number; continuityStatus: string; terminationReason: string; records: { offset: number; length: number; hash: string }[] }
const checkedObservation = (record: RawRecord): boolean => record.accepted === true && (record.observation?.kind === "funding" || ["snapshot", "linked_delta", "linked_reset", "heartbeat", "duplicate"].includes(record.observation?.diagnostic));
const continuityStatus = (checked: number, rejected: number): string => rejected ? "contains_rejected_observations" : checked ? "contains_checked_observations" : "no_continuity_observation";

export function containedTarget(plan: CapturePlan): string {
  const root = resolve(plan.outputRoot);
  if (!existsSync(root)) throw Error("capture_root_missing");
  if (lstatSync(root).isSymbolicLink()) throw Error("path_symlink_or_reparse");
  if (!lstatSync(root).isDirectory()) throw Error("capture_root_missing");
  for (let cursor = root; ; cursor = dirname(cursor)) {
    if (lstatSync(cursor).isSymbolicLink()) throw Error("path_symlink_or_reparse");
    if (dirname(cursor) === cursor) break;
  }
  if (realpathSync(root).toLowerCase() !== root.toLowerCase()) throw Error("path_symlink_or_reparse");
  const target = resolve(root, plan.experimentId), rel = relative(root, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || dirname(target) !== root) throw Error("path_escape");
  if (existsSync(target)) throw Error("experiment_exists");
  return target;
}

/** Append-only local store; time assertions surround synchronous I/O, not a physical OS cancellation claim. */
export class CaptureStore {
  readonly directory: string;
  readonly segments: Segment[] = [];
  bytes = 0; controlBytes = 0; appendedRaw = 0; persistedRaw = 0; controlRecords = 0;
  private active: Segment | null = null;
  constructor(readonly plan: CapturePlan, private assertTime: () => void, target: string) {
    this.directory = target;
    assertTime(); mkdirSync(target); assertTime();
    assertTime(); const fd = openSync(join(target, "control.jsonl"), "wx"); closeSync(fd); assertTime();
  }
  private reserve(): number { return Math.min(this.plan.limits.controlBytes, 8192 + this.plan.limits.messages * 160 + this.plan.limits.segments * 600); }
  control(value: unknown): void {
    const data = encoded(value);
    if (this.controlBytes + data.length + this.reserve() > this.plan.limits.controlBytes || this.bytes + data.length + this.reserve() > this.plan.limits.persistedBytes) throw Error("control_budget");
    this.assertTime(); appendFileSync(join(this.directory, "control.jsonl"), data); this.bytes += data.length; this.controlBytes += data.length; this.controlRecords++; this.assertTime();
  }
  rotate(reason: string, clockStatus = "observed"): void {
    if (this.active) { this.active.terminationReason = reason; this.active.clockStatus = clockStatus; this.active = null; }
  }
  append(record: RawRecord): void {
    const data = encoded(record);
    if (this.bytes - this.controlBytes + data.length > this.plan.limits.persistedBytes - this.plan.limits.controlBytes || this.bytes + data.length + this.reserve() > this.plan.limits.persistedBytes) throw Error("persisted_byte_limit");
    if (!this.active) {
      if (this.segments.length >= this.plan.limits.segments) throw Error("segment_limit");
      this.assertTime();
      const file = `segment-${String(this.segments.length).padStart(3, "0")}.jsonl`;
      const fd = openSync(join(this.directory, file), "wx"); closeSync(fd);
      this.active = { file, bytes: 0, count: 0, firstOrdinal: null, lastOrdinal: null, identities: [], sources: [], clockStatus: "observed", checkedObservations: 0, rejectedObservations: 0, continuityStatus: "no_continuity_observation", terminationReason: "open", records: [] }; this.segments.push(this.active);
    }
    const s = this.active;
    this.assertTime(); appendFileSync(join(this.directory, s.file), data);
    s.records.push({ offset: s.bytes, length: data.length, hash: hash(data) }); s.bytes += data.length; s.count++;
    const ordinal = record.reception.ordinal; s.firstOrdinal ??= ordinal; s.lastOrdinal = ordinal;
    if (checkedObservation(record)) s.checkedObservations++;
    if (record.accepted === false) s.rejectedObservations++;
    s.continuityStatus = continuityStatus(s.checkedObservations, s.rejectedObservations);
    if (typeof record.source === "string" && !s.sources.includes(record.source)) s.sources.push(record.source);
    for (const id of [record.reception.processId, record.reception.clockId, record.connectionId, record.segmentId]) if (typeof id === "string" && !s.identities.includes(id)) s.identities.push(id);
    this.bytes += data.length; this.appendedRaw++; this.assertTime();
  }
  finalize(pins: unknown, report: any): void {
    this.rotate(report.stopReason);
    for (const segment of this.segments) {
      this.assertTime(); const bytes = readFileSync(join(this.directory, segment.file)); this.assertTime();
      if (bytes.length !== segment.bytes || segment.records.length !== segment.count || segment.records.some(r => r.offset < 0 || r.length < 1 || r.offset + r.length > bytes.length || hash(bytes.subarray(r.offset, r.offset + r.length)) !== r.hash)) throw Error("segment_finalization_integrity");
      segment.hash = hash(bytes);
    }
    this.assertTime(); const controls = readFileSync(join(this.directory, "control.jsonl")); this.assertTime();
    // These disk counts are verified against finalized bytes by readCapture, while
    // the runner promotes its counter only after finalization and timed validation.
    const counts = { ...report.counts, persistedRaw: this.appendedRaw, unpersistedRaw: report.counts.rawPrepared - this.appendedRaw };
    counts.dropped = counts.unpersistedRaw + counts.completeRejectedWithoutRaw + counts.incompleteTransportAssemblies;
    // Bytes written cannot observe the completion time of their own final write.
    const manifest = { version: 1, finalized: true, finalTiming: { state: "unobserved", completedAt: null, durationNs: null }, plan: this.plan, pins, segments: this.segments, control: { file: "control.jsonl", bytes: controls.length, count: this.controlRecords, hash: hash(controls) }, report: { ...report, counts, incompleteRecords: counts.unpersistedRaw, provisionalOutcome: report.outcome, outcome: "failed_incomplete", stopReason: "final_timing_unobserved", encodedBytes: this.bytes }, powerLossQualified: false };
    let data = encoded(manifest);
    for (let n = 0; n < 8 && manifest.report.encodedBytes !== this.bytes + data.length; n++) {
      manifest.report.encodedBytes = this.bytes + data.length; data = encoded(manifest);
    }
    if (manifest.report.encodedBytes !== this.bytes + data.length) throw Error("manifest_length_unstable");
    if (this.controlBytes + data.length > this.plan.limits.controlBytes || this.bytes + data.length > this.plan.limits.persistedBytes) throw Error("terminal_evidence_budget");
    this.assertTime(); writeFileSync(join(this.directory, "manifest.json"), data, { flag: "wx" }); this.bytes += data.length; this.controlBytes += data.length; this.assertTime();
    this.persistedRaw = this.appendedRaw;
  }
}

export interface Recovery { outcome: string; records: RawRecord[]; manifest: any | null; errors: string[]; untrustedTail: boolean; missingCounts: null; powerLossQualified: false }
/** Bounded read-only recovery. No files are created, repaired or reopened for append. */
export function readCapture(directory: string): Recovery {
  const result: Recovery = { outcome: "failed_incomplete", records: [], manifest: null, errors: [], untrustedTail: false, missingCounts: null, powerLossQualified: false };
  const root = resolve(directory);
  if (!existsSync(root) || lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory() || realpathSync(root).toLowerCase() !== root.toLowerCase()) { result.errors.push("invalid_capture_directory"); return result; }
  const inventory: string[] = [];
  const entries = opendirSync(root, { bufferSize: 16 });
  try { for (let entry = entries.readSync(); entry; entry = entries.readSync()) { inventory.push(entry.name); if (inventory.length > 34) { result.errors.push("capture_inventory_limit"); return result; } } }
  finally { entries.closeSync(); }
  let manifest: any = null;
  try {
    const path = join(root, "manifest.json");
    if (lstatSync(path).isSymbolicLink() || statSync(path).size > 2097152) throw Error("manifest_bounds");
    manifest = JSON.parse(readFileSync(path, "utf8"));
    if (manifest.version !== 1 || manifest.finalized !== true || !Array.isArray(manifest.segments) || manifest.segments.length > 32 || !manifest.plan?.limits || Object.entries(CEILINGS).some(([key, max]) => !Number.isSafeInteger(manifest.plan.limits[key]) || manifest.plan.limits[key] < 1 || manifest.plan.limits[key] > max) || manifest.segments.length > manifest.plan.limits.segments) throw Error("invalid_manifest");
    result.manifest = manifest;
  } catch { manifest = null; result.errors.push("missing_or_invalid_manifest"); }
  const files = inventory.filter(n => /^segment-\d{3}\.jsonl$/.test(n)).sort();
  if (files.length > 32) { result.errors.push("segment_count_limit"); return result; }
  const listed: any[] = manifest?.segments ?? files.map(file => ({ file }));
  if (manifest && (new Set(listed.map(s => s.file)).size !== listed.length || files.join("|") !== listed.map(s => s.file).sort().join("|"))) result.errors.push("segment_inventory");
  let total = manifest ? statSync(join(root, "manifest.json")).size : 0;
  let previousOrdinal = 0;
  for (const s of listed) {
    try {
      if (!/^segment-\d{3}\.jsonl$/.test(s.file)) throw Error("segment_path");
      if (manifest && (!Number.isSafeInteger(s.count) || s.count < 0 || s.count > manifest.plan.limits.messages - result.records.length || !Array.isArray(s.records) || s.records.length !== s.count)) throw Error("segment_count_bounds");
      const path = join(root, s.file);
      if (lstatSync(path).isSymbolicLink()) throw Error("segment_symlink");
      const size = statSync(path).size; total += size;
      if (size > 33554432 || total > (manifest?.plan.limits.persistedBytes ?? 33554432)) throw Error("segment_byte_limit");
      const bytes = readFileSync(path);
      if (manifest && (s.bytes !== bytes.length || s.hash !== hash(bytes) || !Array.isArray(s.records) || s.records.length !== s.count)) throw Error("segment_integrity");
      let offset = 0, count = 0, checked = 0, rejected = 0, firstOrdinal: number | null = null, lastOrdinal: number | null = null;
      const identities: string[] = [], sources: string[] = [];
      while (offset < bytes.length && result.records.length < (manifest?.plan.limits.messages ?? 10000)) {
        const end = bytes.indexOf(10, offset);
        if (end < 0) { result.untrustedTail = true; break; }
        const line = bytes.subarray(offset, end + 1);
        if (line.length > 2097152) throw Error("record_bounds");
        const record = JSON.parse(line.toString("utf8"));
        const index = s.records?.[count];
        if (manifest && (!index || index.offset !== offset || index.length !== line.length || index.hash !== hash(line))) throw Error("record_integrity");
        if (record.kind !== "raw" || typeof record.payloadBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(record.payloadBase64) || !Number.isSafeInteger(record.payloadBytes) || record.payloadBytes < 0 || record.payloadBytes > (manifest?.plan.limits.payloadBytes ?? 1048576)) throw Error("raw_bounds");
        const payload = Buffer.from(record.payloadBase64, "base64");
        if (payload.length !== record.payloadBytes || hash(payload) !== record.payloadHash || payload.toString("base64") !== record.payloadBase64) throw Error("payload_integrity");
        const ordinal = record.reception?.ordinal;
        if (!Number.isSafeInteger(ordinal) || ordinal <= previousOrdinal || !/^(0|[1-9]\d*)$/.test(record.reception?.monoNs) || !Number.isSafeInteger(record.reception?.wallMs)) throw Error("record_reception_integrity");
        for (const id of [record.reception.processId, record.reception.clockId, record.connectionId, record.segmentId]) { if (typeof id !== "string" || !id) throw Error("record_identity_integrity"); if (!identities.includes(id)) identities.push(id); }
        if (!["metadata", "websocket"].includes(record.source)) throw Error("record_source_integrity");
        if (!sources.includes(record.source)) sources.push(record.source);
        previousOrdinal = ordinal; firstOrdinal ??= ordinal; lastOrdinal = ordinal;
        if (checkedObservation(record)) checked++;
        if (record.accepted === false) rejected++;
        result.records.push(record); count++; offset = end + 1;
      }
      if (offset < bytes.length && result.records.length >= (manifest?.plan.limits.messages ?? 10000)) throw Error("record_count_limit");
      if (manifest && (count !== s.count || firstOrdinal !== s.firstOrdinal || lastOrdinal !== s.lastOrdinal || JSON.stringify(identities) !== JSON.stringify(s.identities) || !["observed", "clock_ambiguous"].includes(s.clockStatus) || typeof s.terminationReason !== "string" || s.terminationReason === "open")) throw Error("segment_range_or_identity");
      if (manifest && (s.checkedObservations !== checked || s.rejectedObservations !== rejected || s.continuityStatus !== continuityStatus(checked, rejected))) throw Error("segment_continuity_integrity");
      if (manifest && JSON.stringify(s.sources) !== JSON.stringify(sources)) throw Error("segment_source_integrity");
    } catch (e) { result.errors.push(e instanceof Error ? e.message : "recovery_failure"); result.untrustedTail = true; }
  }
  if (manifest) {
    try {
      const c = manifest.control;
      if (c.file !== "control.jsonl" || !Number.isSafeInteger(c.bytes) || c.bytes < 0 || c.bytes > manifest.plan.limits.controlBytes || statSync(join(root, c.file)).size > manifest.plan.limits.controlBytes || lstatSync(join(root, c.file)).isSymbolicLink()) throw Error("control_bounds");
      const bytes = readFileSync(join(root, c.file));
      if (bytes.length !== c.bytes || hash(bytes) !== c.hash || bytes.toString().split("\n").filter(Boolean).length !== c.count || manifest.report.counts.persistedRaw !== result.records.length) throw Error("control_or_report_integrity");
      total += bytes.length;
      if (total > manifest.plan.limits.persistedBytes || bytes.length + statSync(join(root, "manifest.json")).size > manifest.plan.limits.controlBytes || total !== manifest.report.encodedBytes) throw Error("encoded_byte_integrity");
      const counts = manifest.report.counts;
      if (["completeReceived", "accepted", "rejected", "rawPrepared", "completeRejectedWithoutRaw", "persistedRaw", "unpersistedRaw", "incompleteTransportAssemblies", "dropped", "controlRecords"].some(key => !Number.isSafeInteger(counts[key]) || counts[key] < 0) || counts.controlRecords !== c.count || counts.completeReceived !== counts.accepted + counts.rejected || counts.completeReceived !== counts.rawPrepared + counts.completeRejectedWithoutRaw || counts.rawPrepared !== counts.persistedRaw + counts.unpersistedRaw || counts.dropped !== counts.unpersistedRaw + counts.completeRejectedWithoutRaw + counts.incompleteTransportAssemblies || counts.completeReceived + counts.incompleteTransportAssemblies !== counts.persistedRaw + counts.dropped || result.records.filter(r => r.accepted === true).length > counts.accepted || result.records.filter(r => r.accepted === false).length > counts.rejected) throw Error("count_conservation_integrity");
      if (manifest.finalTiming?.state !== "unobserved" || manifest.finalTiming.completedAt !== null || manifest.finalTiming.durationNs !== null || manifest.report.outcome !== "failed_incomplete" || ["strategyQualified", "executionQualified", "profitEvidence"].some(key => manifest.report[key] !== false)) throw Error("report_qualification_integrity");
      // Recovery validates persistence, never upgrades unobserved final timing.
      if (!result.errors.length && !result.untrustedTail) result.outcome = "failed_incomplete";
    } catch (e) { result.errors.push(e instanceof Error ? e.message : "control_integrity"); }
  }
  return result;
}
