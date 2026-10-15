/** Optional LLM context is interpretation of supplied public evidence. It never becomes a receipt, price, balance, order or profit probability. Pure and offline. */
export const RESEARCH_CODES = ["identity_conflict", "identity_needs_verification", "scheduled_event", "contract_controls_changed", "liquidity_changed", "sources_disagree", "exit_quote_missing", "no_material_change"] as const;
export type ResearchCode = (typeof RESEARCH_CODES)[number];

export interface PublicResearchSource {
  readonly id: string;
  readonly assetKeys: readonly string[];
  readonly observedAtMs: number | null;
  readonly maxAgeMs: number;
}
export interface ResearchContext {
  readonly version: 1;
  readonly model: "gpt-6-luna";
  readonly interpretations: readonly { readonly assetKey: string; readonly code: ResearchCode; readonly sourceIds: readonly string[]; readonly evidence: "model_interpretation" }[];
  readonly rejected: readonly { readonly assetKey: string; readonly reason: "source_unknown" | "identity_mismatch" | "source_stale" }[];
}

export const RESEARCH_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["version", "observations"],
  properties: {
    version: { type: "integer", enum: [1] },
    observations: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false,
      required: ["assetKey", "code", "sourceIds"], properties: {
        assetKey: { type: "string" }, code: { type: "string", enum: [...RESEARCH_CODES] },
        sourceIds: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      } } },
  },
} as const;

const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_:./@-]{1,160}$/.test(v);
const exact = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).length === names.length && names.every(n => Object.hasOwn(v, n));

/** JSON shape is insufficient: bind every interpretation to an existing source, exact asset identity and usable source time. */
export function validateResearch(raw: unknown, sources: readonly PublicResearchSource[], assets: readonly string[], nowMs: number): ResearchContext | null {
  const r = obj(raw);
  if (r === null || !exact(r, ["version", "observations"]) || r.version !== 1 || !Array.isArray(r.observations) || r.observations.length > 24 || !Number.isSafeInteger(nowMs) || nowMs < 0) return null;
  if (sources.length > 100 || !sources.every(s => id(s.id) && Number.isSafeInteger(s.maxAgeMs) && s.maxAgeMs >= 0 && s.assetKeys.every(id)) || new Set(sources.map(s => s.id)).size !== sources.length) return null;
  const catalog = new Map(sources.map(s => [s.id, s]));
  const interpretations: ResearchContext["interpretations"][number][] = [];
  const rejected: ResearchContext["rejected"][number][] = [];
  const seen = new Set<string>();
  for (const rawItem of r.observations) {
    const item = obj(rawItem);
    if (item === null || !exact(item, ["assetKey", "code", "sourceIds"]) || !id(item.assetKey) || !assets.includes(item.assetKey) || !(RESEARCH_CODES as readonly unknown[]).includes(item.code) || !Array.isArray(item.sourceIds) || item.sourceIds.length < 1 || item.sourceIds.length > 4 || !item.sourceIds.every(id) || new Set(item.sourceIds).size !== item.sourceIds.length) return null;
    const key = `${item.assetKey}|${item.code}`; if (seen.has(key)) return null; seen.add(key);
    const bound = item.sourceIds.map(s => catalog.get(s));
    if (bound.some(s => s === undefined)) { rejected.push({ assetKey: item.assetKey, reason: "source_unknown" }); continue; }
    if (bound.some(s => !s!.assetKeys.includes(item.assetKey as string))) { rejected.push({ assetKey: item.assetKey, reason: "identity_mismatch" }); continue; }
    if (bound.some(s => s!.observedAtMs === null || !Number.isSafeInteger(s!.observedAtMs) || s!.observedAtMs! > nowMs + 5000 || nowMs - s!.observedAtMs! > s!.maxAgeMs)) { rejected.push({ assetKey: item.assetKey, reason: "source_stale" }); continue; }
    interpretations.push({ assetKey: item.assetKey, code: item.code as ResearchCode, sourceIds: [...item.sourceIds], evidence: "model_interpretation" });
  }
  return { version: 1, model: "gpt-6-luna", interpretations, rejected };
}
