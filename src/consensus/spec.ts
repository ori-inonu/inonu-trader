/**
 * The edge of the sequential decisions: a spec that comes from outside (a JSON file, an MCP call) is checked strictly here before it reaches the engine, and the cost of running it is estimated before any question is sent.
 * Pure: no network, no environment, no storage.
 */
import { CONSENSUS_POLICY, plannedCalls, sanitizeSpec, type DecisionSpec } from "./engine";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, where: string, max: number): string => {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) throw new Error(`spec_invalida: ${where}`);
  return v;
};
const id = (v: unknown, where: string): string => {
  const s = text(v, where, 40);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error(`spec_invalida: ${where}`);
  return s;
};

/** A spec from outside, checked field by field and sanitized (no address, key or secret). Throws a coded error for anything else. */
export function parseSpec(raw: unknown): DecisionSpec {
  if (!isRecord(raw)) throw new Error("spec_invalida: raiz");
  if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 8) throw new Error("spec_invalida: options (de 2 a 8)");
  if (!Array.isArray(raw.rails) || raw.rails.length > 12) throw new Error("spec_invalida: rails");
  if (!isRecord(raw.facts)) throw new Error("spec_invalida: facts");
  const facts: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw.facts)) {
    if (!(v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 300))) throw new Error(`spec_invalida: facts.${k}`);
    facts[k] = v;
  }
  const spec: DecisionSpec = {
    id: id(raw.id, "id"),
    goal: text(raw.goal, "goal", 600),
    facts,
    rails: raw.rails.map((r, i) => text(r, `rails[${i}]`, 300)),
    options: raw.options.map((o, i) => {
      if (!isRecord(o)) throw new Error(`spec_invalida: options[${i}]`);
      return { id: id(o.id, `options[${i}].id`), label: text(o.label, `options[${i}].label`, 120), what: text(o.what, `options[${i}].what`, 400) };
    }),
    ...(raw.forbidden === undefined ? {} : { forbidden: (Array.isArray(raw.forbidden) ? raw.forbidden : (() => { throw new Error("spec_invalida: forbidden"); })()).map((f, i) => id(f, `forbidden[${i}]`)) }),
    ...(raw.unknowns === undefined
      ? {}
      : {
          unknowns: (Array.isArray(raw.unknowns) ? raw.unknowns : (() => { throw new Error("spec_invalida: unknowns"); })()).map((u, i) => {
            if (!isRecord(u)) throw new Error(`spec_invalida: unknowns[${i}]`);
            return { id: id(u.id, `unknowns[${i}].id`), ask: text(u.ask, `unknowns[${i}].ask`, 300) };
          }),
        }),
  };
  return sanitizeSpec(spec);
}

export interface Plan {
  readonly plannedCalls: number;
  /** An upper estimate of the input tokens of the whole run: characters over three of the state plus a fixed overhead per question. */
  readonly estimatedInputTokens: number;
  readonly policy: typeof CONSENSUS_POLICY;
}

/** What a run can cost at most, known without any network and any key. */
export function planOf(spec: DecisionSpec): Plan {
  const calls = plannedCalls(spec);
  const perQuestion = Math.ceil(JSON.stringify({ goal: spec.goal, facts: spec.facts, rails: spec.rails, options: spec.options }).length / 3) + 450;
  return { plannedCalls: calls, estimatedInputTokens: calls * perQuestion, policy: CONSENSUS_POLICY };
}
