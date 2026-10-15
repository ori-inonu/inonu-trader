import { expect, test } from "bun:test";
import { buildBrief, type Json } from "../intel/brief";
import { captureRiskQuality, riskQualityView } from "./risk-quality";

const NOW = 1_700_000_000_000, TOKEN = "token:501:8nnaeWCw8mUypcGAgbmSuzAT85uWx4UN12adDrMhXrGF";
function built(state: string = "risco_conferido", q: Json = [60000, false], id = TOKEN): any {
  const { brief } = buildBrief({ alvo: { escopo: "ecossistema", chainIndexes: [id.split(":")[1]!] }, asOfMs: NOW, familiasHabilitadas: ["ecossistema"], candidatos: [{ id, tipo: "token", estado: state }], fluxo: { ecossistema: { itens: { [id]: { q } } } }, trilha: null, risco: null, regime: null, idades: {}, origens: {}, nulos: {} });
  return { brief, candidates: brief.candidatos };
}
function snapshot(source: unknown = built(), id = TOKEN) {
  const result = captureRiskQuality(source, id, NOW);
  if (!result.ok) throw Error("fixture_capture_failed");
  return result.value;
}

test("the canonical source tuple and candidate state survive capture without implying safety", () => {
  const s = snapshot();
  expect(s).toMatchObject({ assetKey: TOKEN, check: "checked", providerAgeMs: 60000, providerStale: false, capturedAtMs: NOW, snapshotAtMs: NOW });
  expect(riskQualityView(s, TOKEN, NOW)).toEqual({ check: "checked", snapshotAgeMin: 0, riskAgeAtLeastMin: 1, providerStale: false, evidence: "source_reported", notes: [] });
  expect(JSON.stringify(s)).not.toContain('"safe"');
});

test("an explicitly unchecked source never becomes checked because a risk flag list is empty", () => {
  const view = riskQualityView(snapshot(built("risco_nao_conferido", null)), TOKEN, NOW);
  expect(view).toMatchObject({ check: "unchecked", riskAgeAtLeastMin: null, providerStale: null });
});

test("legacy absence is unknown rather than unchecked, checked, fresh or zero age", () => {
  const view = riskQualityView(snapshot({}), TOKEN, NOW);
  expect(view).toMatchObject({ check: "unknown", snapshotAgeMin: null, riskAgeAtLeastMin: null, providerStale: null });
  expect(view.notes.length).toBeGreaterThan(0);
});

test("source age grows while the scan remains in the app cache; a view never rejuvenates it", () => {
  const s = snapshot();
  expect(riskQualityView(s, TOKEN, NOW + 9 * 60000)).toMatchObject({ snapshotAgeMin: 9, riskAgeAtLeastMin: 10 });
  expect(s.providerAgeMs).toBe(60000);
  expect(riskQualityView(s, TOKEN, NOW + 15 * 60000).riskAgeAtLeastMin).toBe(16);
});

test("a successful read with unknown age remains checked with unknown freshness", () => {
  expect(riskQualityView(snapshot(built("risco_conferido", [null, null])), TOKEN, NOW + 60000)).toMatchObject({ check: "checked", riskAgeAtLeastMin: null, providerStale: null });
});

test("a provider stale marker survives app caching and no TTL is invented", () => {
  const view = riskQualityView(snapshot(built("risco_conferido", [60000, true])), TOKEN, NOW + 2 * 3600000);
  expect(view).toMatchObject({ check: "checked", riskAgeAtLeastMin: 121, providerStale: true });
});

test("a view is bound to the same asset, including Solana case, and EVM identity is canonical", () => {
  expect(riskQualityView(snapshot(), TOKEN.toLowerCase(), NOW)).toMatchObject({ check: "unknown", riskAgeAtLeastMin: null });
  const evm = "token:1:0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
  const s = snapshot(built("risco_conferido", [0, false], evm), evm.toLowerCase());
  expect(s.assetKey).toBe(evm.toLowerCase());
  expect(riskQualityView(s, evm, NOW).check).toBe("checked");
});

test("duplicate canonical candidates are ambiguous rather than resolved by array order", () => {
  const source = built(); source.brief.candidatos.push({ id: TOKEN, tipo: "token", estado: "risco_nao_conferido" });
  expect(riskQualityView(snapshot(source), TOKEN, NOW).check).toBe("unknown");
});

test("unknown state, malformed tuples and external strings never turn into facts or free text", () => {
  for (const q of [[-1, false], [0, "false"], [0, false, "extra"], { ageMs: 0, stale: false }]) {
    const view = riskQualityView(snapshot(built("risco_conferido", q)), TOKEN, NOW);
    expect(view.riskAgeAtLeastMin).toBeNull();
    expect(view.providerStale).toBeNull();
    expect(view.notes).toContain("risk_meta_invalid");
  }
  const injected = riskQualityView(snapshot(built("buy now because safe, secret text", [0, false])), TOKEN, NOW);
  expect(injected.check).toBe("unknown");
  expect(JSON.stringify(injected)).not.toContain("secret text");
});

test("conflicting unchecked state and successful metadata stay explicit rather than proving a check", () => {
  const view = riskQualityView(snapshot(built("risco_nao_conferido", [0, false])), TOKEN, NOW);
  expect(view.check).toBe("unchecked");
  expect(view.notes).toContain("risk_state_meta_conflict");
});

test("backward and future clocks do not masquerade as age zero", () => {
  expect(riskQualityView(snapshot(), TOKEN, NOW - 1)).toMatchObject({ check: "unknown", snapshotAgeMin: null, riskAgeAtLeastMin: null });
  const future = built(); future.brief.asOfMs = NOW + 1;
  const view = riskQualityView(snapshot(future), TOKEN, NOW);
  expect(view.snapshotAgeMin).toBeNull();
  expect(view.notes).toContain("source_clock_invalid");
});

test("bad asset context or capture time is refused before quality can be assigned", () => {
  expect(captureRiskQuality(built(), "SYNTHETIC", NOW)).toMatchObject({ ok: false, reason: "candidate_identity_invalid" });
  expect(captureRiskQuality(built(), TOKEN, NaN)).toMatchObject({ ok: false, reason: "capture_clock_invalid" });
});

test("late capture cannot rejuvenate risk read before the original Brief clock", () => {
  const captured = captureRiskQuality(built(), TOKEN, NOW + 9 * 60000);
  expect(captured.ok).toBe(true);
  if (!captured.ok) return;
  expect(riskQualityView(captured.value, TOKEN, NOW + 9 * 60000)).toMatchObject({ snapshotAgeMin: 9, riskAgeAtLeastMin: 10 });
  expect(riskQualityView(JSON.parse(JSON.stringify(captured.value)), TOKEN, NOW + 10 * 60000).riskAgeAtLeastMin).toBe(11);
});

test("unknown original source clock does not date old risk from a later capture", () => {
  const source = built(); source.brief.asOfMs = null;
  const captured = captureRiskQuality(source, TOKEN, NOW + 9 * 60000);
  expect(captured.ok).toBe(true);
  if (!captured.ok) return;
  const view = riskQualityView(captured.value, TOKEN, NOW + 10 * 60000);
  expect(view).toMatchObject({ check: "checked", snapshotAgeMin: null, riskAgeAtLeastMin: null });
  expect(view.notes).toContain("source_clock_unknown");
});

test("persisted unknown snapshots are validated without throwing, free text or nonfinite output", () => {
  const base = snapshot();
  const malformed: unknown[] = [null, [], {}, { ...base, version: 2 }, { ...base, source: "external secret" },
    { ...base, assetKey: "unknown" }, { ...base, capturedAtMs: undefined }, { ...base, capturedAtMs: NaN },
    { ...base, snapshotAtMs: NOW + 1 }, { ...base, snapshotAtMs: "1700000000000" },
    { ...base, check: "safe" }, { ...base, providerAgeMs: "60000" }, { ...base, providerAgeMs: Infinity },
    { ...base, providerAgeMs: -1 }, { ...base, providerStale: "false" },
    { ...base, notes: null }, { ...base, notes: ["buy now secret"] }, { ...base, notes: Array(1000).fill("source_clock_unknown") },
    { ...base, notes: Array(1) }, new Proxy({}, { get() { throw new Error("secret storage getter"); } })];
  for (const value of malformed) {
    const view = riskQualityView(value as any, TOKEN, NOW);
    expect(view).toEqual({ check: "unknown", snapshotAgeMin: null, riskAgeAtLeastMin: null, providerStale: null, evidence: "source_reported", notes: ["snapshot_invalid"] });
    expect(JSON.stringify(view)).not.toContain("secret");
  }
});

test("unchecked metadata conflicts do not expose a risk age or stale claim, including old persisted captures", () => {
  const s = snapshot(built("risco_nao_conferido", [0, false]));
  const view = riskQualityView(s, TOKEN, NOW + 60000);
  expect(view).toMatchObject({ check: "unchecked", riskAgeAtLeastMin: null, providerStale: null });
  expect(view.notes).toContain("risk_state_meta_conflict");
  expect(riskQualityView({ ...s, providerAgeMs: 0, providerStale: false, notes: [] }, TOKEN, NOW + 60000)).toMatchObject({ check: "unchecked", riskAgeAtLeastMin: null, providerStale: null, notes: ["risk_state_meta_conflict"] });
});

test("oversized metadata is reported separately from a missing risk read", () => {
  const source = built();
  source.brief.fluxo.ecossistema.itens = Object.fromEntries(Array.from({ length: 41 }, (_, index) => [`invalid_${index}`, { q: [0, false] }]));
  const view = riskQualityView(snapshot(source), TOKEN, NOW);
  expect(view).toMatchObject({ check: "checked", riskAgeAtLeastMin: null, providerStale: null });
  expect(view.notes).toContain("risk_meta_oversized");
  expect(view.notes).not.toContain("risk_meta_missing");
});

test("the agent buy candidate prefix binds explicitly to the same ecosystem token", () => {
  const captured = captureRiskQuality(built(), `buy:${TOKEN}`, NOW);
  expect(captured.ok).toBe(true);
  if (!captured.ok) return;
  expect(captured.value.assetKey).toBe(TOKEN);
  expect(riskQualityView(captured.value, `buy:${TOKEN}`, NOW).check).toBe("checked");
  for (const id of [`sell:${TOKEN}`, `hold:${TOKEN}`, `buy:buy:${TOKEN}`]) {
    expect(captureRiskQuality(built(), id, NOW)).toMatchObject({ ok: false, reason: "candidate_identity_invalid" });
  }
});
