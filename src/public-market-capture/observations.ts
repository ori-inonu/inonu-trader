import type { CapturePlan } from "./plan";
import { hash } from "./store";
import type { Reservation } from "./ingress";
export interface MessageEvent { type: "message"; source: "metadata" | "websocket"; instrument?: string; payload: Uint8Array | string; reservation?: Reservation }
export type TransportEvent = MessageEvent | { type: "control"; opcode: number; payload: Uint8Array } | { type: "incomplete"; reason: string; size: number | string; provenance: "observed_lower_bound" | "source_declared"; units?: number };
interface State { acknowledged: boolean; observed: boolean; phase: "awaiting_snapshot" | "active" | "quarantined"; lastSeq?: string; lastPayload?: string; epoch: number; seen: Map<string, string>; segmentId: string }
const integer = (v: unknown): v is string => typeof v === "string" && /^-?(0|[1-9]\d*)$/.test(v);
const decimal = (v: unknown): v is string => typeof v === "string" && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v);
/** Keep JSON numeric literals exact, including seqId beyond Number's safe range. Raw bytes are untouched. */
function parseExact(text: string): any {
  let out = "", string = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (string) { out += c; if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') string = false; continue; }
    if (c === '"') { string = true; out += c; continue; }
    if (c === "-" || /\d/.test(c)) {
      const match = text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) { out += JSON.stringify(match[0]); i += match[0].length - 1; continue; }
    }
    out += c;
  }
  return JSON.parse(out);
}
export class Observations {
  readonly streams = new Map<string, State>();
  readonly metadata = new Map<string, any>();
  connection = ""; generation = 0; gaps: string[] = []; duplicates = 0; heartbeats = 0; resets = 0;
  constructor(readonly plan: CapturePlan, readonly processId: string) {}
  begin(connection: string): void {
    if (this.connection) this.gaps.push("reconnect_gap");
    this.connection = connection; this.generation++;
    this.streams.clear();
    for (const s of this.plan.streams) this.streams.set(s.channel + ":" + s.instrument, { acknowledged: false, observed: false, phase: "awaiting_snapshot", epoch: 0, seen: new Map(), segmentId: `${this.processId}:${connection}:${s.channel}:${s.instrument}:${this.generation}` });
  }
  quarantineAll(reason: string): void { this.gaps.push(reason); for (const s of this.streams.values()) s.phase = "quarantined"; }
  inspect(event: MessageEvent, rawHash: string, reception: any, rawBase64: string): any {
    let e: any;
    try { e = parseExact(typeof event.payload === "string" ? event.payload : new TextDecoder("utf-8", { fatal: true }).decode(event.payload)); }
    catch { this.quarantineAll("malformed_json"); return { accepted: false, reason: "malformed_json", stop: event.source === "metadata" }; }
    if (!e || typeof e !== "object" || Array.isArray(e)) { this.quarantineAll("unknown_schema"); return { accepted: false, reason: "unknown_schema", stop: event.source === "metadata" }; }
    if (event.source === "metadata") {
      const i = this.plan.instruments.find(i => i.id === event.instrument), data = e.data;
      if (!i || e.code !== "0" || !Array.isArray(data) || data.length !== 1 || !data[0] || data[0].instId !== i.id || data[0].instType !== i.kind) { if (i) this.metadata.delete(i.id); this.quarantineAll("metadata_mismatch"); return { accepted: false, reason: "metadata_mismatch", stop: true }; }
      const d = data[0], unit = i.kind === "SPOT" ? ["baseCcy", "quoteCcy"] : ["ctVal", "ctValCcy", "ctMult", "settleCcy"];
      if (unit.some(k => typeof d[k] !== "string" || !d[k]) || ["lotSz", "tickSz", "minSz"].some(k => !decimal(d[k])) || d.state !== "live" || (i.kind === "SWAP" && (!decimal(d.ctVal) || !decimal(d.ctMult)))) { this.metadata.delete(i.id); this.quarantineAll("metadata_units_unknown"); return { accepted: false, reason: "metadata_units_unknown", stop: true }; }
      const previous = this.metadata.get(i.id);
      const fields = Object.fromEntries([...unit, "lotSz", "tickSz", "minSz", "state", "instType"].map(k => [k, d[k]]));
      if (previous) { this.metadata.delete(i.id); this.quarantineAll("metadata_changed_or_unplanned_refresh"); return { accepted: false, reason: "unexpected_metadata_refresh", stop: true }; }
      const observation = { kind: "metadata", instrument: i.id, receiptId: rawHash, rawHash, fields, retrievalInterval: { start: reception.requestStart ?? reception, end: reception }, historicalEffectiveTime: null };
      this.metadata.set(i.id, observation); return { accepted: !previous, reason: previous ? "unexpected_metadata_refresh" : "metadata", observation };
    }
    if (e.event === "error" || e.code && e.code !== "0") { this.quarantineAll("provider_error"); return { accepted: false, reason: "provider_error", stop: true }; }
    const channel = e.arg?.channel, instrument = e.arg?.instId;
    const key = channel + ":" + instrument, s = this.streams.get(key);
    if (!s) { this.quarantineAll("unrequested_identity"); return { accepted: false, reason: "unrequested_identity" }; }
    const metadata = this.metadata.get(instrument);
    if (e.event === "subscribe") {
      if (Object.keys(e.arg).some(k => !["channel", "instId"].includes(k)) || Object.keys(e).some(k => !["event", "arg", "connId"].includes(k))) { s.phase = "quarantined"; return { accepted: false, reason: "unknown_schema" }; }
      s.acknowledged = true; return { accepted: true, reason: "acknowledgement", stream: key, segmentId: s.segmentId };
    }
    const reject = (reason: string) => { s.phase = "quarantined"; this.gaps.push(reason); return { accepted: false, reason, stream: key, segmentId: s.segmentId }; };
    const unknownMetadataSchema = (reason: string) => {
      // An unrecognized extension cannot establish that the retained contract
      // metadata still applies. Close only this instrument's qualification.
      this.metadata.delete(instrument);
      for (const planned of this.plan.streams) if (planned.instrument === instrument) this.streams.get(planned.channel + ":" + instrument)!.phase = "quarantined";
      return { ...reject(reason), metadataQualification: "unknown", closeSegment: true };
    };
    if (!s.acknowledged) return reject("missing_acknowledgement");
    if (s.phase === "quarantined") return { accepted: false, reason: "quarantined", stream: key, segmentId: s.segmentId };
    if (!metadata) return reject("metadata_missing");
    if (!Array.isArray(e.data) || e.data.length !== 1 || !e.data[0] || Object.keys(e).some(k => !["arg", "action", "data"].includes(k)) || Object.keys(e.arg).some(k => !["channel", "instId"].includes(k))) return reject("unknown_schema");
    const d = e.data[0];
    if (channel === "funding-rate") {
      if (Object.keys(e).some(k => !["arg", "data"].includes(k))) return reject("unknown_funding_schema");
      if (Object.keys(d).some(k => !["instId", "fundingRate", "fundingTime", "nextFundingTime", "settState", "settFundingRate", "ts"].includes(k))) return unknownMetadataSchema("unknown_funding_schema");
      if (d.instId !== instrument || !decimal(d.fundingRate) || !integer(d.fundingTime) || !integer(d.nextFundingTime) || BigInt(d.fundingTime) < 0n || BigInt(d.nextFundingTime) <= BigInt(d.fundingTime) || !["processing", "settled"].includes(d.settState) || (d.settFundingRate !== "" && !decimal(d.settFundingRate)) || !integer(d.ts) || BigInt(d.ts) < 0n) return reject("unknown_funding_schema");
      s.observed = true; s.phase = "active";
      return { accepted: true, reason: "funding_observation", stream: key, segmentId: s.segmentId, observation: { kind: "funding", prediction: { rate: d.fundingRate, fundingTime: d.fundingTime, nextFundingTime: d.nextFundingTime }, settlement: { state: d.settState, rate: d.settFundingRate || null }, realized: d.settState === "settled" ? { rate: d.settFundingRate || null } : null, intervalMs: String(BigInt(d.nextFundingTime) - BigInt(d.fundingTime)), eventTime: typeof d.ts === "string" ? d.ts : null, metadataReceipt: metadata.receiptId, entitlement: null, fees: null, margin: null, liquidation: null } };
    }
    if (Object.keys(d).some(k => !["seqId", "prevSeqId", "asks", "bids", "ts", "checksum"].includes(k))) return unknownMetadataSchema("unknown_book_schema");
    if (!integer(d.seqId) || !integer(d.prevSeqId) || !Array.isArray(d.asks) || !Array.isArray(d.bids) || [...d.asks, ...d.bids].some((level: any) => !Array.isArray(level) || level.length !== 4 || level.some((x: any) => !decimal(x))) || !integer(d.ts) || d.checksum !== "0") return reject("malformed_book_schema");
    let diagnostic: string;
    if (s.phase === "awaiting_snapshot") {
      if (e.action !== "snapshot" || d.prevSeqId !== "-1") return reject("awaiting_snapshot");
      s.phase = "active"; s.seen.clear(); s.epoch = 0; diagnostic = "snapshot";
    } else {
      if (s.lastPayload === rawBase64) { this.duplicates++; return { accepted: true, reason: "duplicate", stream: key, segmentId: s.segmentId, observation: { seqId: d.seqId, eventTime: d.ts, diagnostic: "duplicate", epoch: s.epoch, metadataReceipt: metadata.receiptId, checksumIntegrity: false } }; }
      if (e.action !== "update") return reject("unsolicited_snapshot");
      if (d.prevSeqId !== s.lastSeq) return reject("wrong_predecessor");
      const empty = d.asks.length === 0 && d.bids.length === 0;
      if (d.seqId === s.lastSeq && empty) { diagnostic = "heartbeat"; this.heartbeats++; }
      else if (BigInt(d.seqId) < BigInt(s.lastSeq!)) { s.epoch++; s.seen.clear(); diagnostic = "linked_reset"; this.resets++; }
      else if (s.seen.has(d.seqId) && s.seen.get(d.seqId) !== rawBase64) return reject("conflicting_sequence");
      else if (d.seqId === s.lastSeq) return reject("conflicting_sequence");
      else diagnostic = "linked_delta";
    }
    s.lastSeq = d.seqId; s.lastPayload = rawBase64; s.seen.set(d.seqId, rawBase64); s.observed = true;
    return { accepted: true, reason: diagnostic, stream: key, segmentId: s.segmentId, observation: { seqId: d.seqId, prevSeqId: d.prevSeqId, eventTime: d.ts, diagnostic, epoch: s.epoch, metadataReceipt: metadata.receiptId, checksumIntegrity: false } };
  }
  summary(): any[] { return [...this.streams.entries()].map(([identity, s]) => ({ identity, acknowledged: s.acknowledged, observed: s.observed, phase: s.phase, epoch: s.epoch, segmentId: s.segmentId })); }
  qualified(): boolean { return this.streams.size === this.plan.streams.length && [...this.streams.values()].every(s => s.acknowledged && s.observed && s.phase === "active") && this.plan.instruments.every(i => this.metadata.has(i.id)); }
}
