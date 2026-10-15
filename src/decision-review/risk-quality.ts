import { chainByIndex, isAddressForChain } from "../okx-wallet/chains";

export type RiskCheck = "checked" | "unchecked" | "unknown";
const RISK_QUALITY_NOTES = ["source_brief_missing", "source_schema_unknown", "source_clock_unknown", "source_clock_invalid", "candidate_list_invalid", "candidate_missing", "candidate_ambiguous", "risk_state_unknown", "risk_meta_missing", "risk_meta_invalid", "risk_meta_ambiguous", "risk_meta_oversized", "risk_state_meta_conflict", "candidate_identity_mismatch", "view_clock_invalid", "snapshot_invalid"] as const;
export type RiskQualityNote = typeof RISK_QUALITY_NOTES[number];
const knownNotes: ReadonlySet<string> = new Set(RISK_QUALITY_NOTES);

/** Source-reported quality, bound to one asset. Neither `checked` nor an empty flag list asserts that a token is safe. No data is fetched here. */
export interface RiskQualitySnapshot {
  readonly version: 1;
  readonly assetKey: string;
  readonly source: "inonu_ecosystem_brief";
  readonly capturedAtMs: number;
  readonly snapshotAtMs: number | null;
  readonly check: RiskCheck;
  /** The source's q tuple reports gateway age, not a verified provider creation timestamp. */
  readonly providerAgeMs: number | null;
  readonly providerStale: boolean | null;
  readonly notes: readonly RiskQualityNote[];
}

export interface RiskQualityView {
  readonly check: RiskCheck;
  readonly snapshotAgeMin: number | null;
  /** A lower bound: q was read before Brief.asOfMs. A later caller capture does not reset that clock; an unknown source clock leaves the bound unknown. */
  readonly riskAgeAtLeastMin: number | null;
  /** The marker reported at capture, never a claim that the cached data is fresh now. */
  readonly providerStale: boolean | null;
  readonly evidence: "source_reported";
  readonly notes: readonly RiskQualityNote[];
}

type CaptureResult = { readonly ok: true; readonly value: RiskQualitySnapshot } | { readonly ok: false; readonly reason: "candidate_identity_invalid" | "capture_clock_invalid" };
const rec = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const time = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const age = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
function assetKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const parts = v.split(":");
  const chain = parts[1], address = parts[2];
  if (parts.length !== 3 || parts[0] !== "token" || chain === undefined || address === undefined || !isAddressForChain(chain, address)) return null;
  return `token:${chain}:${chainByIndex(chain)?.kind === "evm" ? address.toLowerCase() : address}`;
}
/** The agent's buy id adds exactly one prefix to the ecosystem's token identity. Sell, hold and nested prefixes are different contracts. */
function candidateAssetKey(v: unknown): string | null {
  return assetKey(typeof v === "string" && v.startsWith("buy:") ? v.slice(4) : v);
}

/** Persisted JSON is untyped. Copy only this schema before using any field in arithmetic or exposing any note. This is shape validation, not source authentication. */
function readSnapshot(value: unknown): RiskQualitySnapshot | null {
  const s = rec(value);
  if (s === null || s.version !== 1 || s.source !== "inonu_ecosystem_brief" || typeof s.assetKey !== "string" || assetKey(s.assetKey) !== s.assetKey) return null;
  if (!time(s.capturedAtMs) || !(s.snapshotAtMs === null || (time(s.snapshotAtMs) && s.snapshotAtMs <= s.capturedAtMs))) return null;
  if (!(s.check === "checked" || s.check === "unchecked" || s.check === "unknown")) return null;
  if (!(s.providerAgeMs === null || age(s.providerAgeMs)) || !(s.providerStale === null || typeof s.providerStale === "boolean")) return null;
  if (!Array.isArray(s.notes) || s.notes.length > RISK_QUALITY_NOTES.length) return null;
  const notes = [...s.notes];
  if (!notes.every(note => typeof note === "string" && knownNotes.has(note))) return null;
  return { version: 1, assetKey: s.assetKey, source: "inonu_ecosystem_brief", capturedAtMs: s.capturedAtMs, snapshotAtMs: s.snapshotAtMs, check: s.check, providerAgeMs: s.providerAgeMs, providerStale: s.providerStale, notes: notes as RiskQualityNote[] };
}

/** Reads the CURRENT source contract: Brief.candidatos[].estado and fluxo.ecossistema.itens[asset].q = [ageMs, stale] or null. No symbols, array position or empty flags bind quality. */
export function captureRiskQuality(built: unknown, candidateId: string, capturedAtMs: number): CaptureResult {
  const key = candidateAssetKey(candidateId);
  if (key === null) return { ok: false, reason: "candidate_identity_invalid" };
  if (!time(capturedAtMs)) return { ok: false, reason: "capture_clock_invalid" };
  const notes: RiskQualityNote[] = [];
  const b = rec(rec(built)?.brief);
  let check: RiskCheck = "unknown", snapshotAtMs: number | null = null, providerAgeMs: number | null = null, providerStale: boolean | null = null;
  if (b === null) notes.push("source_brief_missing");
  else if (b.schemaVersion !== 1) notes.push("source_schema_unknown");
  else {
    if (!time(b.asOfMs)) notes.push("source_clock_unknown");
    else if (b.asOfMs > capturedAtMs) notes.push("source_clock_invalid");
    else snapshotAtMs = b.asOfMs;
    const list = b.candidatos;
    if (!Array.isArray(list) || list.length > 40) notes.push("candidate_list_invalid");
    else {
      const matches = list.map(rec).filter(c => c !== null && c.tipo === "token" && assetKey(c.id) === key);
      if (matches.length === 0) notes.push("candidate_missing");
      else if (matches.length !== 1) notes.push("candidate_ambiguous");
      else {
        const state = matches[0]!.estado;
        if (state === "risco_conferido") check = "checked";
        else if (state === "risco_nao_conferido") check = "unchecked";
        else notes.push("risk_state_unknown");
        const items = rec(rec(rec(b.fluxo)?.ecossistema)?.itens);
        const keys = items === null ? [] : Object.keys(items);
        const matchingKeys = keys.length > 40 ? [] : keys.filter(k => assetKey(k) === key);
        if (keys.length > 40) notes.push("risk_meta_oversized");
        else if (matchingKeys.length > 1) notes.push("risk_meta_ambiguous");
        else {
          const q = items === null || matchingKeys.length !== 1 ? null : rec(items[matchingKeys[0]!])?.q;
          if (q == null) notes.push("risk_meta_missing");
          else if (!Array.isArray(q) || q.length !== 2 || !(q[0] === null || age(q[0])) || !(q[1] === null || typeof q[1] === "boolean")) notes.push("risk_meta_invalid");
          else {
            if (check === "unchecked") notes.push("risk_state_meta_conflict");
            else {
              providerAgeMs = q[0] as number | null;
              providerStale = q[1] as boolean | null;
            }
          }
        }
      }
    }
  }
  return { ok: true, value: { version: 1, assetKey: key, source: "inonu_ecosystem_brief", capturedAtMs, snapshotAtMs, check, providerAgeMs, providerStale, notes } };
}

/** A view contains no address, balance, dollar amount or free external text. Recompute it at every decision; caching a view would freeze its age again. No TTL, veto or trading decision is invented. */
export function riskQualityView(rawSnapshot: unknown, expectedCandidateId: string, nowMs: number): RiskQualityView {
  const unknown = (note: RiskQualityNote): RiskQualityView => ({ check: "unknown", snapshotAgeMin: null, riskAgeAtLeastMin: null, providerStale: null, evidence: "source_reported", notes: [note] });
  let snapshot: RiskQualitySnapshot | null;
  try { snapshot = readSnapshot(rawSnapshot); } catch { return unknown("snapshot_invalid"); }
  if (snapshot === null) return unknown("snapshot_invalid");
  if (candidateAssetKey(expectedCandidateId) !== snapshot.assetKey) return unknown("candidate_identity_mismatch");
  if (!time(nowMs) || nowMs < snapshot.capturedAtMs) return unknown("view_clock_invalid");
  const notes = [...snapshot.notes];
  const conflict = snapshot.check === "unchecked" && (snapshot.providerAgeMs !== null || snapshot.providerStale !== null || notes.includes("risk_state_meta_conflict"));
  if (conflict && !notes.includes("risk_state_meta_conflict")) notes.push("risk_state_meta_conflict");
  return { check: snapshot.check,
    snapshotAgeMin: snapshot.snapshotAtMs === null ? null : (nowMs - snapshot.snapshotAtMs) / 60000,
    riskAgeAtLeastMin: conflict || snapshot.providerAgeMs === null || snapshot.snapshotAtMs === null ? null : (snapshot.providerAgeMs + nowMs - snapshot.snapshotAtMs) / 60000,
    providerStale: conflict ? null : snapshot.providerStale, evidence: "source_reported", notes };
}
