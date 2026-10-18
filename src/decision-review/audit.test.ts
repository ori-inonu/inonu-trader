import { expect, test } from "bun:test";
import { auditConsult } from "./audit";
import { createHash } from "node:crypto";

const row = () => ({ cycleId: "synthetic-cycle", atMs: 1000, mode: "limitado", posture: "defensiva", historico: { vender: { n: 4, acerto: null } }, contexto: { s1_escolha: null, s1_regime: null }, stances: { "synthetic:buy": "skip" }, verdicts: { "synthetic:buy": { skip: 1 } }, candidates: [{ id: "synthetic:buy", kind: "buy", stances: ["skip"], marks: ["entrada_esticada", "parabolico"] }] });

test("a forced skip with probability one is classified as a code block, never economic certainty", () => {
  const review = auditConsult(row())!;
  expect(review.candidates[0]).toMatchObject({ source: "closed_before_choice", selectableAlternative: false, choiceConcentration: null, observedBlocks: ["entrada_esticada"] });
  expect(review.findings).toContain("all_purchases_closed");
});

test("a closed purchase without a recorded binding reports missing evidence instead of inventing the cause", () => {
  const r = row(); r.candidates[0]!.marks = [];
  const review = auditConsult(r)!;
  expect(review.candidates[0]!.observedBlocks).toEqual([]);
  expect(review.findings).toContain("purchase_basis_missing");
});

test("an actual choice between buy and skip remains distinct from a forced skip or confidence guard", () => {
  const r = row(); r.candidates[0]!.stances = ["skip", "buy_full"];
  const data = { ...r, verdicts: { "synthetic:buy": { skip: 0.75, buy_full: 0.25 } }, brief: { carteira: {}, posicoes: {}, compras: {} }, historico: { carteira: { n: 8, acerto: 60 } } };
  const review = auditConsult(data)!;
  expect(review.candidates[0]).toMatchObject({ source: "model_or_post_choice_guard", selectableAlternative: true, choiceConcentration: 0.5 });
  expect(review.findings).not.toContain("all_purchases_closed");
  expect(review.findings).not.toContain("full_brief_missing");
  expect(review.findings).not.toContain("insufficient_measured_history");
});

test("recorded zero size and binding explains a clean candidate blocked by the minimum", () => {
  const r = row(); r.candidates[0]!.marks = [];
  const c = { ...r.candidates[0]!, cap: { maxUsd: 0, binding: "minimo", sharePct: null } };
  const review = auditConsult({ ...r, candidates: [c] })!;
  expect(review.candidates[0]!.observedBlocks).toEqual(["minimo"]);
  expect(review.findings).not.toContain("purchase_basis_missing");
});

test("an empty Brief or unmeasured success rate is never treated as enough evidence", () => {
  for (const acerto of [undefined, "60", Number.NaN, -1, 101]) {
    const review = auditConsult({ ...row(), brief: {}, historico: { vender: { n: 20, acerto } } })!;
    expect(review.findings).toContain("full_brief_missing");
    expect(review.findings).toContain("insufficient_measured_history");
  }
});

test("unavailable context, absent full inputs and a small sample are explicit limits of the review", () => {
  const review = auditConsult({ ...row(), contexto: null })!;
  expect(review.findings).toEqual(expect.arrayContaining(["full_brief_missing", "system_one_unavailable", "market_context_unavailable", "insufficient_measured_history"]));
});

test("malformed records and duplicate identities are rejected without interpreting text as instructions", () => {
  expect(auditConsult({ ...row(), atMs: Number.NaN })).toBeNull();
  const r = row(); r.candidates.push(r.candidates[0]!);
  expect(auditConsult(r)).toBeNull();
  expect(auditConsult({ instruction: "send a trade" })).toBeNull();
  const wrong = auditConsult({ ...row(), stances: { "synthetic:buy": "buy_full" } })!;
  expect(wrong.findings).toContain("inconsistent_choice");
});

function tracedRow() {
  const r = row();
  r.candidates[0]!.stances = ["skip", "buy_third", "buy_full"];
  const brief = { carteira: {}, chaves: {}, posicoes: {}, compras: {}, mandato: null };
  const full = { v: 1, carteira: brief.carteira, chaves: brief.chaves, posicoes: brief.posicoes, compras: brief.compras, contexto: r.contexto, historico: r.historico, mandato: null };
  return { ...r, brief, briefVersion: 1, briefHash: createHash("sha256").update(JSON.stringify(full)).digest("hex").slice(0, 16), requested: { "synthetic:buy": "buy_full" }, stances: { "synthetic:buy": "buy_third" }, valid: true, invalidReason: null, notes: ["conviccao_reduziu"], facets: { "synthetic:buy": { distribution: 0.7 } } };
}

test("the model request and the code adjustment remain separate and the recorded Brief hash is checked", () => {
  const review = auditConsult(tracedRow())!;
  expect(review.candidates[0]).toMatchObject({ requested: "buy_full", selected: "buy_third", source: "code_adjusted" });
  expect(review).toMatchObject({ decisionValid: true, invalidReason: null, notes: ["conviccao_reduziu"], briefFingerprint: "matched" });
  expect(review.findings).not.toContain("choice_trace_missing");
});

test("a valid unmodified request is a model choice, while a rejected answer is never labelled an applied choice", () => {
  const r = tracedRow();
  expect(auditConsult({ ...r, stances: r.requested })!.candidates[0]!.source).toBe("model_choice");
  const rejected = auditConsult({ ...r, valid: false, invalidReason: "perfil_invalido" })!;
  expect(rejected.candidates[0]!.source).toBe("invalid_answer");
  expect(rejected.findings).toContain("answer_rejected");
});

test("legacy records keep their uncertainty instead of reconstructing a model request after the fact", () => {
  const review = auditConsult(row())!;
  expect(review.candidates[0]!.requested).toBeNull();
  expect(review.decisionValid).toBeNull();
  expect(review.findings).toContain("choice_trace_missing");
});

test("altered input data breaks the Brief fingerprint; facets remain observations rather than a profit score", () => {
  const r = tracedRow();
  const review = auditConsult({ ...r, brief: { ...r.brief, carteira: { caixa: 99 } } })!;
  expect(review.briefFingerprint).toBe("mismatched");
  expect(review.findings).toContain("brief_fingerprint_mismatch");
  expect(review.candidates[0]!.facets).toEqual({ distribution: 0.7 });
  expect(auditConsult({ ...r, facets: { "synthetic:buy": { distribution: 1.5 } } })!.candidates[0]!.facets).toBeNull();
});

test("purchase facts with the holding legend are reported as ambiguous, without inventing the cause of a skip", () => {
  const brief = { carteira: {}, posicoes: {}, compras: { synthetic: { v: 4920, h: 5000, t: 19, w: 12, p: 50, m: ["esticado"] } },
    chaves: { v: "tracked wallets that already sold, percent", h: "hours held", t: "triggers the code noticed", w: "share of the whole portfolio, percent", p: "24h price change percent", m: "number of tags" } };
  const review = auditConsult({ ...row(), brief })!;
  expect(review.findings as readonly string[]).toContain("ambiguous_purchase_legend");
  expect(review.candidates[0]!.source).toBe("closed_before_choice");
  const scoped = { "compras.v": "24h volume, thousands of dollars", "compras.h": "holders", "compras.t": "top10 supply %", "compras.w": "tracked wallets that bought it", "compras.p": "tracked purchases already sold %", "compras.m": "care codes" };
  expect(auditConsult({ ...row(), brief: { ...brief, chaves: { ...brief.chaves, ...scoped } } })!.findings as readonly string[]).not.toContain("ambiguous_purchase_legend");
});

test("missing or unrelated legends are not retroactively diagnosed as this specific known semantic conflict", () => {
  for (const brief of [{ carteira: {}, posicoes: {}, compras: {} }, { carteira: {}, posicoes: {}, compras: { synthetic: { v: 100 } }, chaves: { v: "volume, thousands of dollars" } }])
    expect(auditConsult({ ...row(), brief })!.findings as readonly string[]).not.toContain("ambiguous_purchase_legend");
});

test("optional real-execution feedback is part of the recorded fingerprint and cannot be silently altered or omitted", () => {
  const r = tracedRow(), execucoes = { voltas: 1, retorno: -0.44, ultimas: [{ s: "SYNTH", m: 16, p: -0.44 }], sem_entrada: 7, desconhecidas: 0 };
  const brief = { ...r.brief, execucoes };
  const full = { v: 1, carteira: brief.carteira, chaves: brief.chaves, posicoes: brief.posicoes, compras: brief.compras, contexto: r.contexto, historico: r.historico, execucoes, mandato: brief.mandato };
  const record = { ...r, brief, briefHash: createHash("sha256").update(JSON.stringify(full)).digest("hex").slice(0, 16) };
  expect(auditConsult(record)!.briefFingerprint).toBe("matched");
  expect(auditConsult({ ...record, brief: { ...brief, execucoes: { ...execucoes, retorno: 100 } } })!.briefFingerprint).toBe("mismatched");
  expect(auditConsult({ ...record, brief: r.brief })!.briefFingerprint).toBe("mismatched");
  expect(auditConsult(r)!.briefFingerprint).toBe("matched");
});

test("optional memory is fingerprinted after execution feedback and before the mandate, including explicit null", () => {
  const r=tracedRow();
  for(const memoria of [{v:1,t:900,itens:{past:{acao:"hold",resultado:"pending"}}},null]) {
    const execucoes={voltas:1,retorno:null};
    const brief={...r.brief,execucoes,memoria};
    const full={v:1,carteira:brief.carteira,chaves:brief.chaves,posicoes:brief.posicoes,compras:brief.compras,contexto:r.contexto,historico:r.historico,execucoes,memoria,mandato:brief.mandato};
    const record={...r,brief,briefHash:createHash("sha256").update(JSON.stringify(full)).digest("hex").slice(0,16)};
    expect(auditConsult(record)!.briefFingerprint).toBe("matched");
    expect(auditConsult({...record,brief:{...r.brief,execucoes}})!.briefFingerprint).toBe("mismatched");
    expect(auditConsult({...record,brief:{...brief,memoria:{v:1,t:901}}})!.briefFingerprint).toBe("mismatched");
  }
  expect(auditConsult(r)!.briefFingerprint).toBe("matched");
});

test("question and legend variants stay in the audit for a measured comparison without relabelling old decisions", () => {
  expect(auditConsult({ ...tracedRow(), criteria: "rank-v1", legend: "scoped-v1" })).toMatchObject({ criteriaVersion: "rank-v1", legendVersion: "scoped-v1" });
  expect(auditConsult(tracedRow())).toMatchObject({ criteriaVersion: null, legendVersion: null });
  expect(auditConsult({ ...tracedRow(), criteria: "<script>instructions</script>", legend: "x".repeat(1000) })).toMatchObject({ criteriaVersion: null, legendVersion: null });
});

test("recorded gate evidence preserves actual confidence and threshold separately from rounded probabilities", () => {
  const r = tracedRow(), gate = { asked: "buy_full", applied: "skip", conviction: 0.18, bar: 0.2, reason: "abaixo_do_limiar" };
  const record = { ...r, stances: { "synthetic:buy": "skip" }, gates: { "synthetic:buy": gate } };
  expect(auditConsult(record)!.candidates[0]).toMatchObject({ source: "code_adjusted", gate });
  expect(auditConsult(r)!.candidates[0]).toMatchObject({ gate: null });
  for (const invalid of [{ ...gate, conviction: 2 }, { ...gate, bar: -1 }, { ...gate, reason: "<script>trade</script>" }, { ...gate, asked: "buy_third" }])
    expect(auditConsult({ ...record, gates: { "synthetic:buy": invalid } })!.candidates[0]).toMatchObject({ gate: null });
});
