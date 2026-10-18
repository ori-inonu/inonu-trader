import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createEvolutionState, proposeEvolutionRound, rejectEvolutionRound, sealEvolutionRound, validateEvolutionState, validateEvolutionTransition, type EvolutionState } from "./engine";
import { createEvolutionStore } from "./store";

const at = 1_800_000_000_000;
const policy = () => ({ factOrder: ["source_age", "costs"], memory: { rankBy: "similarity" as const, featureRefs: ["liquidity"] }, questionRefs: ["choose_action_v1"] });
const initial = () => { const r = createEvolutionState(policy(), at); if (!r.ok) throw Error(r.code); return r.state; };
function setup() {
  const db = new Database(":memory:");
  const s = createEvolutionStore<EvolutionState>(db, raw => { const v = validateEvolutionState(raw); return v.ok ? v.state : null; }, validateEvolutionTransition);
  if (!s.ok) throw Error(s.code);
  return { db, store: s.store };
}

test("real engine round lifecycle is committed and recovered through full transition validation", () => {
  const { db, store } = setup();
  try {
    let s = initial(); expect(store.commit(null, s, "initialize").ok).toBe(true);
    const p = proposeEvolutionRound(s, { id: "round_1", hypothesisId: "costs_first", change: "fact_order", evidenceRefs: ["episode_1"], candidatePolicy: { ...policy(), factOrder: ["costs", "source_age"] }, protocol: { evaluatorHash: "e".repeat(64), holdoutHash: "d".repeat(64), method: "fixed_holdout", decisionAfterMs: at + 1000, minComparablePairs: 1, uncertaintyMethodRef: "time_block_bootstrap_v1", significanceLevel: .05 }, baselineHash: "f".repeat(64), numeraireKey: "token:501:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", horizonMs: 100, createdAtMs: at + 1 });
    expect(p.ok).toBe(true);
    expect(store.commit({ revision: s.revision, activeVersion: s.active.version }, p.state, "hypothesis").ok).toBe(true); s = p.state;
    const sealed = sealEvolutionRound(s, at + 2);
    expect(store.commit({ revision: s.revision, activeVersion: s.active.version }, sealed.state, "seal").ok).toBe(true); s = sealed.state;
    const rejected = rejectEvolutionRound(s, "no_measurable_outcome", at + 3);
    expect(store.commit({ revision: s.revision, activeVersion: s.active.version }, rejected.state, "reject").ok).toBe(true);
    const loaded = store.load();
    expect(loaded.ok && loaded.state?.active.version).toBe(initial().active.version);
    expect(loaded.ok && loaded.state?.history[0]?.status).toBe("rejected");
    expect(store.revision(1).ok).toBe(true);
  } finally { db.close(); }
});

test("another individually valid engine lineage cannot replace A using a valid CAS", () => {
  const { db, store } = setup();
  try {
    const a = initial(); store.commit(null, a, "initialize");
    const created = createEvolutionState({ ...policy(), factOrder: ["costs", "source_age"] }, at + 1);
    if (!created.ok) throw Error(created.code);
    const other = rejectEvolutionRound(created.state, "not_running", at + 2).state;
    expect(validateEvolutionState(other).ok).toBe(true);
    expect(store.commit({ revision: 0, activeVersion: a.active.version }, other, "observe")).toEqual({ ok: false, code: "transition_invalid" });
    const loaded = store.load(); expect(loaded.ok && loaded.state?.initial.version).toBe(a.initial.version);
  } finally { db.close(); }
});

test("storage cannot use an unimplemented rollback to rewrite a valid engine state", () => {
  const { db, store } = setup();
  try {
    const a = initial(); store.commit(null, a, "initialize");
    const next = rejectEvolutionRound(a, "not_running", at + 1).state;
    expect(store.commit({ revision: 0, activeVersion: a.active.version }, next, "rollback")).toEqual({ ok: false, code: "transition_invalid" });
    expect(store.commit({ revision: 0, activeVersion: a.active.version }, next, "reject").ok).toBe(true);
  } finally { db.close(); }
});
