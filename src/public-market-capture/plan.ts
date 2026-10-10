import { isAbsolute } from "node:path";

export const SCHEMA = "okx-public-v5-2026-10-10";
export const ENDPOINTS = Object.freeze({ rest: "https://www.okx.com", websocket: "wss://ws.okx.com:8443/ws/v5/public" });
export const CEILINGS = Object.freeze({ durationMs: 300000, messages: 10000, payloadBytes: 1048576, persistedBytes: 33554432, controlBytes: 2097152, segments: 32, connections: 3, metadataRequests: 3, attemptMs: 10000, ingressBytes: 8388608, pending: 16 });
export interface Instrument { id: string; kind: "SPOT" | "SWAP" }
export interface Stream { channel: "books" | "funding-rate"; instrument: string }
export interface CapturePlan { version: 1; mode: "capture"; experimentId: string; parentExperimentId: string | null; outputRoot: string; schema: string; region: "global"; endpoints: typeof ENDPOINTS; instruments: Instrument[]; streams: Stream[]; limits: Record<keyof typeof CEILINGS, number> }
export interface AccessReceipt { version: 1; id: string; evidence: "synthetic" | "factual"; issuedAt: number; expiresAt: number; schema: string; region: string; endpoints: string[]; terms: "qualified"; regionAssessment: "qualified"; authority: { status: "explicit"; provenance: string } }
export interface RuntimeCapabilities { version: 1; runtime: string; evidence: "synthetic" | "qualified" | "unknown"; incrementalEncoded: boolean; incrementalDecoded: boolean; aggregateHeld: boolean; interruptible: boolean; sharedDeadline: boolean }
export type Preflight = { ok: true; plan: CapturePlan; access: AccessReceipt; runtime: RuntimeCapabilities } | { ok: false; reason: string };
function object(value: unknown): value is Record<string, any> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function keys(value: any, names: string[]): boolean { return object(value) && Object.keys(value).length === names.length && names.every(n => Object.hasOwn(value, n)); }
function identity(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value); }

/** Pure preflight: performs no filesystem lookup, DNS, socket creation or environment read. */
export function preflightCapture(input: unknown, receipt: unknown, capabilities: unknown, wallNow = Date.now()): Preflight {
  if (!object(input) || input.mode !== "capture") return { ok: false, reason: "offline" };
  const p = input;
  if (!keys(p, ["version", "mode", "experimentId", "parentExperimentId", "outputRoot", "schema", "region", "endpoints", "instruments", "streams", "limits"]) || p.version !== 1 || !identity(p.experimentId) || (p.parentExperimentId !== null && (!identity(p.parentExperimentId) || p.parentExperimentId === p.experimentId)) || typeof p.outputRoot !== "string" || !isAbsolute(p.outputRoot)) return { ok: false, reason: "invalid_plan" };
  if (p.schema !== SCHEMA || p.region !== "global" || !keys(p.endpoints, ["rest", "websocket"]) || p.endpoints.rest !== ENDPOINTS.rest || p.endpoints.websocket !== ENDPOINTS.websocket) return { ok: false, reason: "unpinned_endpoint_or_schema" };
  if (!keys(p.limits, Object.keys(CEILINGS)) || Object.entries(CEILINGS).some(([k, max]) => !Number.isSafeInteger(p.limits[k]) || p.limits[k] < 1 || p.limits[k] > max) || p.limits.controlBytes >= p.limits.persistedBytes) return { ok: false, reason: "invalid_limits" };
  if (!Array.isArray(p.instruments) || p.instruments.length < 1 || p.instruments.length > 2 || p.instruments.some((i: any) => !keys(i, ["id", "kind"]) || !identity(i.id) || !["SPOT", "SWAP"].includes(i.kind)) || new Set(p.instruments.map((i: any) => i.id)).size !== p.instruments.length || new Set(p.instruments.map((i: any) => i.kind)).size !== p.instruments.length || p.instruments.length > p.limits.metadataRequests) return { ok: false, reason: "invalid_instruments" };
  if (!Array.isArray(p.streams) || p.streams.length < 1 || p.streams.length > 3 || p.streams.some((s: any) => !keys(s, ["channel", "instrument"]) || !["books", "funding-rate"].includes(s.channel) || !p.instruments.some((i: any) => i.id === s.instrument && (s.channel !== "funding-rate" || i.kind === "SWAP"))) || new Set(p.streams.map((s: any) => s.channel + ":" + s.instrument)).size !== p.streams.length || p.instruments.some((i: any) => !p.streams.some((s: any) => s.instrument === i.id && s.channel === "books"))) return { ok: false, reason: "invalid_streams" };
  const a: any = receipt;
  if (!keys(a, ["version", "id", "evidence", "issuedAt", "expiresAt", "schema", "region", "endpoints", "terms", "regionAssessment", "authority"]) || a.version !== 1 || !identity(a.id) || !["synthetic", "factual"].includes(a.evidence) || !Number.isFinite(wallNow) || !Number.isSafeInteger(a.issuedAt) || !Number.isSafeInteger(a.expiresAt) || a.issuedAt > wallNow || a.expiresAt <= wallNow || a.expiresAt <= a.issuedAt || a.schema !== p.schema || a.region !== p.region || !Array.isArray(a.endpoints) || a.endpoints.length !== 2 || !Object.values(ENDPOINTS).every(e => a.endpoints.includes(e)) || a.terms !== "qualified" || a.regionAssessment !== "qualified" || !keys(a.authority, ["status", "provenance"]) || a.authority.status !== "explicit" || typeof a.authority.provenance !== "string" || a.authority.provenance.trim().length < 1) return { ok: false, reason: "access_unknown_or_stale" };
  const r: any = capabilities;
  if (!keys(r, ["version", "runtime", "evidence", "incrementalEncoded", "incrementalDecoded", "aggregateHeld", "interruptible", "sharedDeadline"]) || r.version !== 1 || typeof r.runtime !== "string" || !["synthetic", "qualified"].includes(r.evidence) || ["incrementalEncoded", "incrementalDecoded", "aggregateHeld", "interruptible", "sharedDeadline"].some(k => r[k] !== true) || (r.evidence === "synthetic") !== (a.evidence === "synthetic")) return { ok: false, reason: "runtime_capability_unqualified" };
  return { ok: true, plan: structuredClone(p) as CapturePlan, access: structuredClone(a), runtime: structuredClone(r) };
}
