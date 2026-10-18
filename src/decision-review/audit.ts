import { choiceConfidence } from "../agent/conviction";
import { createHash } from "node:crypto";

export interface CandidateAudit {
  readonly id: string;
  readonly kind: "holding" | "buy";
  readonly selected: string | null;
  readonly requested: string | null;
  readonly offered: readonly string[];
  /** One offered option cannot prove that the model preferred it over a real alternative. */
  readonly selectableAlternative: boolean;
  readonly source: "closed_before_choice" | "model_or_post_choice_guard" | "model_choice" | "code_adjusted" | "invalid_answer" | "inconsistent";
  readonly observedBlocks: readonly string[];
  readonly missingBasis: boolean;
  /** Provider choice concentration, NOT an economic success probability. Null for a single option. */
  readonly choiceConcentration: number | null;
  /** Narrow model judgments, not evidence of facts or of a profit probability. */
  readonly facets: Readonly<Record<string, number>> | null;
  /** What a recorded confidence gate did, before any subsequent posture rule. Missing evidence stays unknown. */
  readonly gate: { readonly asked: string; readonly applied: string; readonly conviction: number | null; readonly bar: number | null; readonly reason: string | null } | null;
}

export interface ConsultAudit {
  readonly version: 1;
  readonly cycleId: string;
  readonly atMs: number;
  readonly posture: string;
  readonly mode: "sombra" | "limitado" | "desligado";
  readonly candidates: readonly CandidateAudit[];
  readonly decisionValid: boolean | null;
  readonly invalidReason: string | null;
  /** Global rule notes. They are not retroactively assigned as a model rationale. */
  readonly notes: readonly string[];
  readonly briefVersion: number | null;
  /** Recorded variants only; missing legacy metadata stays unknown. These are not evidence of improved returns. */
  readonly criteriaVersion: string | null;
  readonly legendVersion: string | null;
  readonly briefHash: string | null;
  readonly briefFingerprint: "unavailable" | "matched" | "mismatched";
  readonly findings: readonly ("all_purchases_closed" | "purchase_basis_missing" | "full_brief_missing" | "system_one_unavailable" | "market_context_unavailable" | "insufficient_measured_history" | "inconsistent_choice" | "choice_trace_missing" | "answer_rejected" | "brief_fingerprint_mismatch" | "ambiguous_purchase_legend")[];
}

const obj = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const strings = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every(s => typeof s === "string" && s.length > 0 && s.length <= 160);
const CLOSING = new Set(["entrada_esticada", "sem_historico", "sem_perfil", "estagnado", "sem_tamanho", "sem_saldo", "minimo", "risco", "reserva", "liquidez", "volume"]);
const plainCode = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(v);
const variant = (v: unknown): string | null => typeof v === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(v) ? v : null;

/** Detects the known purchase/holding key collision only. This diagnoses an input defect, never why the model chose to skip. */
function hasPurchaseLegendConflict(brief: Record<string, unknown>): boolean {
  const purchases = obj(brief.compras), legend = obj(brief.chaves);
  if (purchases === null || legend === null) return false;
  const holdingMeaning: Record<string, RegExp> = { v: /wallets.*sold/i, h: /hours held/i, t: /triggers/i, w: /share.*portfolio/i, p: /price change/i, m: /number of tags/i };
  return Object.entries(purchases).slice(0, 40).some(([, raw]) => {
    const p = obj(raw);
    return p !== null && Object.entries(holdingMeaning).some(([key, wrong]) => {
      const meaning = legend[`compras.${key}`] ?? legend[key];
      return Object.hasOwn(p, key) && p[key] !== null && typeof meaning === "string" && wrong.test(meaning);
    });
  });
}

/** Reconstructs the recorded v1 layout in original key order, including optional
 * execution feedback and the exact optional memory payload. Absence and null
 * differ. A hash proves consistency, not the truth of market data. */
function fingerprint(r: Record<string, unknown>): ConsultAudit["briefFingerprint"] {
  const b = obj(r.brief);
  if (r.briefVersion !== 1 || typeof r.briefHash !== "string" || !/^[a-f0-9]{16}$/.test(r.briefHash) || b === null || obj(b.carteira) === null || obj(b.chaves) === null || obj(b.posicoes) === null || obj(b.compras) === null || !Object.hasOwn(b, "mandato") || !Object.hasOwn(r, "contexto") || !Object.hasOwn(r, "historico")) return "unavailable";
  const body = JSON.stringify({ v: 1, carteira: b.carteira, chaves: b.chaves, posicoes: b.posicoes, compras: b.compras, contexto: r.contexto, historico: r.historico, ...(Object.hasOwn(b, "execucoes") ? { execucoes: b.execucoes } : {}), ...(Object.hasOwn(b, "memoria") ? { memoria: b.memoria } : {}), mandato: b.mandato });
  if (body.length > 100_000) return "unavailable";
  return createHash("sha256").update(body).digest("hex").slice(0, 16) === r.briefHash ? "matched" : "mismatched";
}

function facetsOf(raw: unknown): Readonly<Record<string, number>> | null {
  const f = obj(raw);
  if (f === null || Object.keys(f).length > 8 || !Object.entries(f).every(([name, p]) => plainCode(name) && typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1)) return null;
  return { ...f } as Record<string, number>;
}

function gateOf(raw: unknown, requested: string | null, offered: readonly string[]): CandidateAudit["gate"] {
  const g = obj(raw);
  const probability = (v: unknown): v is number | null => v === null || typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  if (g === null || Object.keys(g).length !== 5 || typeof g.asked !== "string" || g.asked !== requested || !offered.includes(g.asked) || typeof g.applied !== "string" || !offered.includes(g.applied) || !probability(g.conviction) || !probability(g.bar) || !(g.reason === null || plainCode(g.reason))) return null;
  return { asked: g.asked, applied: g.applied, conviction: g.conviction, bar: g.bar, reason: g.reason };
}

/** Review recorded evidence only. It neither fabricates a rationale nor chooses a trade. Safe to run after each consultation. */
export function auditConsult(raw: unknown): ConsultAudit | null {
  const r = obj(raw);
  if (r === null || typeof r.cycleId !== "string" || r.cycleId.length > 160 || !Number.isSafeInteger(r.atMs) || (r.atMs as number) < 0 || !["sombra", "limitado", "desligado"].includes(r.mode as string) || typeof r.posture !== "string" || r.posture.length > 40 || !Array.isArray(r.candidates) || r.candidates.length > 40) return null;
  const stances = obj(r.stances);
  if (stances === null) return null;
  const verdicts = obj(r.verdicts);
  const requestedStances = obj(r.requested);
  const decisionValid = typeof r.valid === "boolean" ? r.valid : null;
  const invalidReason = plainCode(r.invalidReason) ? r.invalidReason : null;
  const traceValid = requestedStances !== null && Object.keys(requestedStances).length <= 40 && decisionValid !== null && (decisionValid ? r.invalidReason === null : invalidReason !== null) && strings(r.notes, 24) && r.notes.every(plainCode);
  const notes = strings(r.notes, 24) && r.notes.every(plainCode) ? [...r.notes] : [];
  const facets = obj(r.facets);
  const gates = obj(r.gates);
  const candidates: CandidateAudit[] = [];
  const ids = new Set<string>();
  for (const item of r.candidates) {
    const c = obj(item);
    if (c === null || typeof c.id !== "string" || c.id.length > 160 || ids.has(c.id) || !["holding", "buy"].includes(c.kind as string) || !strings(c.stances, 8) || c.stances.length === 0 || new Set(c.stances).size !== c.stances.length || !strings(c.marks, 24)) return null;
    ids.add(c.id);
    const selected = typeof stances[c.id] === "string" ? stances[c.id] as string : null;
    const requested = typeof requestedStances?.[c.id] === "string" && (requestedStances[c.id] as string).length <= 40 ? requestedStances[c.id] as string : null;
    const valid = selected !== null && c.stances.includes(selected);
    const closed = c.kind === "buy" && c.stances.length === 1 && c.stances[0] === "skip";
    const blocks = c.marks.filter(m => CLOSING.has(m));
    const cap = obj(c.cap);
    if (closed && cap !== null && typeof cap.maxUsd === "number" && Number.isFinite(cap.maxUsd) && cap.maxUsd === 0 && typeof cap.binding === "string" && ["minimo", "risco", "reserva", "liquidez", "volume", "sem_saldo"].includes(cap.binding) && !blocks.includes(cap.binding)) blocks.push(cap.binding);
    const p = obj(verdicts?.[c.id]);
    const probabilities = p !== null && Object.keys(p).length === c.stances.length && c.stances.every(s => typeof p[s] === "number") ? p as Record<string, number> : null;
    candidates.push({ id: c.id, kind: c.kind as "holding" | "buy", selected, requested, offered: [...c.stances], selectableAlternative: c.stances.length > 1,
      source: decisionValid === false ? "invalid_answer" : !valid ? "inconsistent" : closed ? "closed_before_choice" : !traceValid || requested === null ? "model_or_post_choice_guard" : !c.stances.includes(requested) ? "inconsistent" : requested === selected ? "model_choice" : "code_adjusted",
      observedBlocks: blocks, missingBasis: closed && blocks.length === 0,
      choiceConcentration: probabilities === null ? null : choiceConfidence(probabilities),
      facets: facetsOf(facets?.[c.id]),
      gate: c.kind === "buy" ? gateOf(gates?.[c.id], requested, c.stances) : null,
    });
  }
  const findings = new Set<ConsultAudit["findings"][number]>();
  if (!traceValid || candidates.some(c => c.requested === null)) findings.add("choice_trace_missing");
  if (decisionValid === false) findings.add("answer_rejected");
  const briefFingerprint = fingerprint(r);
  if (briefFingerprint === "mismatched") findings.add("brief_fingerprint_mismatch");
  const buys = candidates.filter(c => c.kind === "buy");
  if (buys.length > 0 && buys.every(c => !c.selectableAlternative)) findings.add("all_purchases_closed");
  if (buys.some(c => c.missingBasis)) findings.add("purchase_basis_missing");
  const brief = obj(r.brief);
  if (brief === null || obj(brief.carteira) === null || obj(brief.posicoes) === null || obj(brief.compras) === null) findings.add("full_brief_missing");
  if (brief !== null && hasPurchaseLegendConflict(brief)) findings.add("ambiguous_purchase_legend");
  const context = obj(r.contexto);
  if (context === null) findings.add("market_context_unavailable");
  if (context?.s1_escolha == null && context?.s1_regime == null) findings.add("system_one_unavailable");
  const history = obj(r.historico);
  if (history === null || Object.values(history).every(v => { const e = obj(v); return e === null || !Number.isSafeInteger(e.n) || (e.n as number) < 5 || typeof e.acerto !== "number" || !Number.isFinite(e.acerto) || e.acerto < 0 || e.acerto > 100; })) findings.add("insufficient_measured_history");
  if (candidates.some(c => c.source === "inconsistent")) findings.add("inconsistent_choice");
  return { version: 1, cycleId: r.cycleId, atMs: r.atMs as number, mode: r.mode as ConsultAudit["mode"], posture: r.posture, candidates, decisionValid, invalidReason, notes,
    briefVersion: Number.isSafeInteger(r.briefVersion) ? r.briefVersion as number : null, criteriaVersion: variant(r.criteria), legendVersion: variant(r.legend),
    briefHash: typeof r.briefHash === "string" && /^[a-f0-9]{16}$/.test(r.briefHash) ? r.briefHash : null, briefFingerprint, findings: [...findings] };
}
