import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { createEvolutionStore } from "./store";

type State = { schema: "test_evolution_v1"; revision: number; active: { version: string }; observations: number };
const A = "a".repeat(64), B = "b".repeat(64);
const state = (revision = 0, version = A): State => ({ schema: "test_evolution_v1", revision, active: { version }, observations: revision });
const validate = (raw: unknown): State | null => {
  const r = raw as State;
  return r?.schema === "test_evolution_v1" && Number.isSafeInteger(r.revision) && r.revision >= 0 && /^[a-f0-9]{64}$/.test(r.active?.version) && Number.isSafeInteger(r.observations) ? r : null;
};
function setup() {
  const db = new Database(":memory:");
  const s = createEvolutionStore(db, validate, (previous, next, reason) => previous === null ? next.revision === 0 : next.revision === previous.revision + 1 && next.schema === previous.schema && (next.active.version === previous.active.version || reason === "promote"));
  if (!s.ok) throw Error(s.code);
  return { db, store: s.store };
}

test("initialization and observations persist only validated intelligence state", () => {
  const { db, store } = setup();
  try {
    expect(store.load()).toEqual({ ok: true, state: null });
    expect(store.commit(null, state(), "initialize").ok).toBe(true);
    expect(store.commit({ revision: 0, activeVersion: A }, state(1), "observe").ok).toBe(true);
    expect(store.load()).toMatchObject({ ok: true, state: state(1) });
    expect(store.revision(0)).toMatchObject({ ok: true, state: state() });
  } finally { db.close(); }
});

test("a valid CAS cannot bypass the required predecessor to successor validator", () => {
  const { db, store } = setup();
  try {
    store.commit(null, state(), "initialize");
    expect(store.commit({ revision: 0, activeVersion: A }, state(1, B), "observe")).toEqual({ ok: false, code: "transition_invalid" });
    expect(store.load()).toMatchObject({ ok: true, state: state() });
  } finally { db.close(); }
});

test("missing intermediate revision makes the history explicitly invalid", () => {
  const { db, store } = setup();
  try {
    store.commit(null, state(), "initialize");
    store.commit({ revision: 0, activeVersion: A }, state(1), "observe");
    store.commit({ revision: 1, activeVersion: A }, state(2), "observe");
    db.exec("DELETE FROM evolution_state_history WHERE revision=1");
    expect(store.load()).toEqual({ ok: false, code: "stored_state_invalid" });
  } finally { db.close(); }
});

test("stale version or revision cannot replace a newer active intelligence artifact", () => {
  const { db, store } = setup();
  try {
    store.commit(null, state(), "initialize");
    expect(store.commit({ revision: 0, activeVersion: B }, state(1, B), "promote")).toEqual({ ok: false, code: "compare_and_swap_conflict" });
    expect(store.commit({ revision: 0, activeVersion: A }, state(1, B), "promote").ok).toBe(true);
    expect(store.commit({ revision: 0, activeVersion: A }, state(1), "observe")).toEqual({ ok: false, code: "compare_and_swap_conflict" });
    expect(store.load()).toMatchObject({ ok: true, state: state(1, B) });
  } finally { db.close(); }
});

test("identical retry after a committed write is idempotent and adds no history", () => {
  const { db, store } = setup();
  try {
    const first = store.commit(null, state(), "initialize");
    expect(first).toMatchObject({ ok: true, alreadyCommitted: false });
    expect(store.commit(null, state(), "initialize")).toMatchObject({ ok: true, alreadyCommitted: true });
    expect(db.query("SELECT count(*) AS n FROM evolution_state_history").get()).toEqual({ n: 1 });
  } finally { db.close(); }
});

test("idempotent retry must still match the predecessor version it claims", () => {
  const { db, store } = setup();
  try {
    store.commit(null, state(), "initialize");
    store.commit({ revision: 0, activeVersion: A }, state(1, B), "promote");
    expect(store.commit({ revision: 0, activeVersion: B }, state(1, B), "promote")).toEqual({ ok: false, code: "compare_and_swap_conflict" });
    expect(store.commit({ revision: 0, activeVersion: A }, state(1, B), "promote")).toMatchObject({ ok: true, alreadyCommitted: true });
  } finally { db.close(); }
});

test("tampered payload or missing immutable history remains invalid instead of resetting", () => {
  for (const tamper of ["UPDATE evolution_state SET payload='{}'", "DELETE FROM evolution_state_history"]) {
    const { db, store } = setup();
    try {
      store.commit(null, state(), "initialize"); db.exec(tamper);
      expect(store.load()).toEqual({ ok: false, code: "stored_state_invalid" });
      expect(store.commit(null, state(), "initialize")).toEqual({ ok: false, code: "stored_state_invalid" });
    } finally { db.close(); }
  }
});

test("failed journal insertion rolls back the pointer atomically", () => {
  const { db, store } = setup();
  try {
    store.commit(null, state(), "initialize");
    db.exec("CREATE TRIGGER fail_history BEFORE INSERT ON evolution_state_history BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    expect(store.commit({ revision: 0, activeVersion: A }, state(1, B), "promote")).toEqual({ ok: false, code: "storage_unavailable" });
    expect(store.load()).toMatchObject({ ok: true, state: state() });
    expect(store.revision(1)).toEqual({ ok: true, state: null });
  } finally { db.close(); }
});

test("invalid state, skipped revision, and thrown validator cannot become an active artifact", () => {
  const { db, store } = setup();
  try {
    expect(store.commit(null, state(2), "initialize")).toEqual({ ok: false, code: "revision_invalid" });
    expect(store.commit(null, { ...state(), schema: "bad" } as unknown as State, "initialize")).toEqual({ ok: false, code: "state_invalid" });
    expect(store.load()).toEqual({ ok: true, state: null });
  } finally { db.close(); }
  const other = new Database(":memory:");
  try {
    const s = createEvolutionStore<State>(other, () => { throw Error("private detail"); }, () => false);
    if (!s.ok) throw Error(s.code);
    const result = s.store.commit(null, state(), "initialize");
    expect(result).toEqual({ ok: false, code: "state_invalid" });
    expect(JSON.stringify(result)).not.toContain("private detail");
  } finally { other.close(); }
});
