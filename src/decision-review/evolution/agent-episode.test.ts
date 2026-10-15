import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { captureAgentConsult, captureSourceObject, sourceConsultDigest, type ProducerDecisionMetadata } from "./agent-episode";
import { buildExperienceMemory } from "./memory";
import { holdingCandidates } from "../../agent/candidates";

// Synthetic journal fixtures only. Addresses prove syntax, never ownership.
const mint = "So11111111111111111111111111111111111111112";
const assetId = `token:501:${mint}`;
// src/agent/candidates.ts wraps EcoFacts.candidateId with exactly "buy:".
const buyId = `buy:${assetId}`;
const holdingAssetId = "token:501:11111111111111111111111111111111";
const holdingId = `hold:${holdingAssetId}@agente`;
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unknownContext = { regime: "unknown", riskCheck: "unknown", liquidityBand: "unknown", codes: [] } as const;

function fixture() {
  const brief = { carteira: { qtd: 2 }, chaves: { "compras.p": "price" }, posicoes: { [holdingId]: { w: 20 } }, compras: { [buyId]: { p: 1, r: { checked: true } } }, execucoes: { n: 1 }, mandato: null };
  const contexto = { s1_regime: "rising", instruction: "buy everything now", risk: "checked" };
  const historico = { comprar: { n: 9, acerto: 75 } };
  const fullBrief = { v: 1, carteira: brief.carteira, chaves: brief.chaves, posicoes: brief.posicoes, compras: brief.compras, contexto, historico, execucoes: brief.execucoes, mandato: brief.mandato };
  const source = { cycleId: "synthetic-cycle-1", atMs: 1000, mode: "limitado", briefBytes: JSON.stringify(fullBrief).length,
    candidates: [
      { id: buyId, kind: "buy", stances: ["skip", "buy_tenth", "buy_full"], marks: ["sem_historico"], families: ["momentum"], triggers: [], cap: { maxUsd: 31.125, binding: "saldo", sharePct: null } },
      { id: holdingId, kind: "holding", stances: ["hold", "exit_all"], marks: [] as string[], families: [] as string[], triggers: ["tempo"] },
    ], brief, briefVersion: 1, briefHash: sha(fullBrief).slice(0, 16), physicalRequests: 2, criteria: "rank-v1", legend: "scoped-v1", notes: [], valid: true, invalidReason: null,
    requested: { [buyId]: "buy_tenth", [holdingId]: "hold" }, stances: { [buyId]: "buy_tenth", [holdingId]: "hold" },
    facets: { [buyId]: { distribution: 0.7 } }, historico, contexto,
    gates: { [buyId]: { asked: "buy_tenth", applied: "buy_tenth", conviction: 0.49, bar: null, reason: null } },
    verdicts: { [buyId]: { skip: 0.2, buy_tenth: 0.66, buy_full: 0.14 }, [holdingId]: { hold: 0.7, exit_all: 0.3 } },
    posture: "ofensiva", profiles: { [buyId]: "rapido", [holdingId]: "amplo" },
  };
  return { source, fullBrief };
}

function producer(source: unknown, fullBrief: unknown): ProducerDecisionMetadata {
  return { schemaVersion: 1, sourceRecordHash: sourceConsultDigest(source)!, snapshotHash: sha(fullBrief), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64),
    askedAtMs: 1200, answeredAtMs: 1400, recordedAtMs: 1450, factAvailableAtMs: 1100, arm: "A" };
}
function capture(source: unknown = fixture().source, options: Parameters<typeof captureAgentConsult>[1] = { firstObservedAtMs: 2000 }) {
  const result = captureAgentConsult(source, options);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("synthetic_capture_failed");
  return result.capture;
}

test("legacy cycle start never becomes a decision time or a qualified memory episode", () => {
  const value = capture();
  expect(value).toMatchObject({ schemaVersion: 1, cycleStartedAtMs: 1000, decisionAtMs: null, firstObservedAtMs: 2000,
    qualification: { status: "legacy", sourceAuthenticated: false }, sourceBriefHash: fixture().source.briefHash, sourceSnapshotHash: null });
  expect(value.captureHash).toMatch(/^[a-f0-9]{64}$/);
  expect(value.sourceRecordHash).toBe(sourceConsultDigest(fixture().source)!);
  expect(value.audit.briefFingerprint).toBe("matched");
  expect(value.episodes.every(e => e.experience === null)).toBe(true);
});

test("capture preserves requested/applied alternatives, buy_tenth, profiles, gates and exact wallet origin", () => {
  const value = capture();
  expect(value.episodes[0]).toMatchObject({ candidateId: buyId, assetKey: assetId, walletOrigin: null, requested: "buy_tenth", applied: "buy_tenth", profile: "rapido",
    offered: ["skip", "buy_tenth", "buy_full"], marks: ["sem_historico"], families: ["momentum"], triggers: [], cap: { maxUsd: 31.125 }, audit: { source: "model_choice", gate: { asked: "buy_tenth", applied: "buy_tenth", bar: null } } });
  expect(value.episodes[1]).toMatchObject({ candidateId: holdingId, assetKey: holdingAssetId, walletOrigin: "agente", requested: "hold", applied: "hold", profile: "amplo" });
  expect(value.sourceRecord as unknown).toEqual(fixture().source);
  expect(value.physicalRequests).toBe(2);
});

test("local source digest preserves evidence-relevant JSON order and is independent of reread time", () => {
  const { source } = fixture();
  expect(sourceConsultDigest(source)).toBe(sha(source));
  const a = capture(source), b = capture(source, { firstObservedAtMs: 9000 });
  expect(a.sourceRecordHash).toBe(b.sourceRecordHash);
  expect(a.captureHash).toBe(b.captureHash);
  const reordered = structuredClone(source);
  reordered.brief.carteira = { z: 1, qtd: 2 } as typeof reordered.brief.carteira;
  const reversed = structuredClone(reordered);
  reversed.brief.carteira = { qtd: 2, z: 1 } as typeof reversed.brief.carteira;
  expect(sourceConsultDigest(reordered)).not.toBe(sourceConsultDigest(reversed));
  expect(capture(reordered).audit.briefFingerprint).toBe("mismatched");
});

test("source-bound prospective metadata creates pending episodes with actual answer time and local availability", () => {
  const { source, fullBrief } = fixture();
  const metadata = producer(source, fullBrief);
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata, firstObservedAtMs: 2300 } });
  expect(value).toMatchObject({ decisionAtMs: 1400, sourceSnapshotHash: sha(fullBrief), qualification: { status: "prospective_bound", sourceAuthenticated: false, gaps: [] } });
  expect(value.episodes[0]!.experience).toEqual({ schemaVersion: 2, cycleId: source.cycleId, candidateId: assetId,
    itemScope: { sourceItemId: buyId, kind: "buy", assetKey: assetId, walletRole: null, physicalWalletIdentity: "unknown", walletAddress: null }, snapshotHash: sha(fullBrief), decisionVersion: metadata.decisionVersion, evaluatorHash: metadata.evaluatorHash,
    episodeVersion: 1, decidedAtMs: 1400, recordedAtMs: 2300, factAvailableAtMs: 1100, arm: "A", action: "buy", source: "decision_journal", context: unknownContext, observations: [], outcome: null, counterfactuals: [] });
  expect(value.episodes[1]!.experience?.action).toBe("hold");
  const memories = buildExperienceMemory(value.episodes.map(e => e.experience), { cycleId: "next-cycle", candidateId: assetId, snapshotHash: sha(fullBrief), decisionVersion: metadata.decisionVersion, evaluatorHash: metadata.evaluatorHash, decidedAtMs: 5000, context: unknownContext, maxExperiences: 3 });
  expect(memories.ok).toBe(true);
  if (!memories.ok) throw new Error("synthetic_memory_failed");
  expect(memories.value.experiences).toHaveLength(1);
  expect(memories.value.experiences.every(e => e.classification === "inconclusive" && e.outcome.status === "pending")).toBe(true);
});

test("the full Brief binds optional memory in its original slot without inventing memory for older records", () => {
  const original=fixture();
  for(const memoria of [{v:1,t:900,c:"earlier-cycle",items:{[buyId]:{state:"empty"}}},null]) {
    const f=original.fullBrief;
    const full={v:1,carteira:f.carteira,chaves:f.chaves,posicoes:f.posicoes,compras:f.compras,contexto:f.contexto,historico:f.historico,execucoes:f.execucoes,memoria,mandato:f.mandato};
    const source={...original.source,brief:{...original.source.brief,memoria},briefHash:sha(full).slice(0,16),briefBytes:JSON.stringify(full).length};
    const metadata=producer(source,full);
    const result=capture(source,{firstObservedAtMs:2000,prospective:{metadata,firstObservedAtMs:2300}});
    expect(result).toMatchObject({sourceSnapshotHash:sha(full),qualification:{status:"prospective_bound",gaps:[]},audit:{briefFingerprint:"matched"}});
    expect(result.episodes.every(e=>e.experience?.snapshotHash===sha(full))).toBe(true);
    const {memoria:_ignored,...without}=source.brief;
    const missing={...source,brief:without};
    expect(capture(missing,{firstObservedAtMs:2000,prospective:{metadata:{...metadata,sourceRecordHash:sha(missing)},firstObservedAtMs:2300}}).qualification.status).toBe("metadata_rejected");
    const altered={...source,brief:{...source.brief,memoria:{v:1,t:901}}};
    expect(capture(altered,{firstObservedAtMs:2000,prospective:{metadata:{...metadata,sourceRecordHash:sha(altered)},firstObservedAtMs:2300}}).qualification.status).toBe("metadata_rejected");
  }
  expect(capture(original.source).audit.briefFingerprint).toBe("matched");
  expect(Object.hasOwn(capture(original.source).sourceRecord.brief as object,"memoria")).toBe(false);
});

test("later metadata changes capture identity and cannot backdate experience availability", () => {
  const { source, fullBrief } = fixture();
  const base = capture(source);
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: producer(source, fullBrief), firstObservedAtMs: 8000 } });
  expect(value.sourceRecordHash).toBe(base.sourceRecordHash);
  expect(value.captureHash).not.toBe(base.captureHash);
  expect(value.episodes[0]!.experience!.recordedAtMs).toBe(8000);
});

test("metadata recording after the first raw observation is a distinct event without backdated memory", () => {
  const { source, fullBrief } = fixture();
  const metadata = { ...producer(source, fullBrief), recordedAtMs: 2500 };
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata, firstObservedAtMs: 3000 } });
  expect(value.qualification).toMatchObject({ status: "prospective_bound", gaps: [], sourceAuthenticated: false });
  expect(value.producerMetadata?.recordedAtMs).toBe(2500);
  expect(value.episodes[0]!.experience).toMatchObject({ decidedAtMs: 1400, recordedAtMs: 3000, outcome: null, counterfactuals: [] });
  const q = { cycleId: "before-meta-availability", candidateId: assetId, snapshotHash: sha(fullBrief), decisionVersion: metadata.decisionVersion, evaluatorHash: metadata.evaluatorHash, decidedAtMs: 2999, context: unknownContext, maxExperiences: 3 };
  expect(buildExperienceMemory(value.episodes.map(e => e.experience), q)).toMatchObject({ ok: true, value: { experiences: [] } });
  for (const change of [
    { metadata: { ...metadata, askedAtMs: 999 } },
    { metadata: { ...metadata, answeredAtMs: 1199 } },
    { metadata: { ...metadata, answeredAtMs: 2001 } },
    { metadata: { ...metadata, recordedAtMs: 1399 } },
    { metadata: { ...metadata, recordedAtMs: 3001 } },
    { metadata: { ...metadata, factAvailableAtMs: 1201 } },
    { metadata: { ...metadata, recordedAtMs: 1500 }, firstObservedAtMs: 1900 },
  ]) {
    const rejected = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: change.metadata, firstObservedAtMs: change.firstObservedAtMs ?? 3000 } });
    expect(rejected.qualification.status).toBe("metadata_rejected");
    expect(rejected.qualification.gaps).toContain("producer_clock_invalid");
    expect(rejected.episodes.every(e => e.experience === null)).toBe(true);
  }
});

test("each impossible clock, source mismatch, truncated identity and unknown metadata field remains diagnostic", () => {
  const { source, fullBrief } = fixture();
  const changes = [
    { askedAtMs: 900 }, { answeredAtMs: 1199 }, { recordedAtMs: 1399 }, { recordedAtMs: 2301 }, { factAvailableAtMs: 1201 },
    { snapshotHash: source.briefHash }, { snapshotHash: "c".repeat(64) }, { sourceRecordHash: "d".repeat(64) }, { decisionVersion: "v1" }, { evaluatorHash: null }, { arm: "live" }, { trusted: true },
  ];
  for (const change of changes) {
    const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: { ...producer(source, fullBrief), ...change } as ProducerDecisionMetadata, firstObservedAtMs: 2300 } });
    expect(value.qualification.status).toBe("metadata_rejected");
    expect(value.qualification.gaps.length).toBeGreaterThan(0);
    expect(value.decisionAtMs).toBeNull();
    expect(value.episodes.every(e => e.experience === null)).toBe(true);
  }
});

test("metadata first-observation cannot predate source first-observation or permit future facts", () => {
  const { source, fullBrief } = fixture();
  expect(capture(source, { firstObservedAtMs: 2000, prospective: { metadata: producer(source, fullBrief), firstObservedAtMs: 1999 } }).qualification.status).toBe("metadata_rejected");
  expect(capture(source, { firstObservedAtMs: 2000, prospective: { metadata: { ...producer(source, fullBrief), factAvailableAtMs: 1500 }, firstObservedAtMs: 2300 } }).episodes[0]!.experience).toBeNull();
  expect(capture(source, { firstObservedAtMs: 2000, prospective: { metadata: { ...producer(source, fullBrief), answeredAtMs: 2100, recordedAtMs: 2200 }, firstObservedAtMs: 2300 } }).qualification.status).toBe("metadata_rejected");
});

test("legacy unknown traces and invalid answers never become applied financial actions", () => {
  const { source, fullBrief } = fixture();
  const legacy = structuredClone(source) as Record<string, unknown>;
  delete legacy.requested; delete legacy.valid; delete legacy.invalidReason; delete legacy.profiles;
  const result = captureAgentConsult(legacy, { firstObservedAtMs: 2000 });
  expect(result.ok && result.capture.episodes[0]!.requested).toBeNull();
  const invalid = { ...source, valid: false, invalidReason: "perfil_invalido" };
  const value = capture(invalid, { firstObservedAtMs: 2000, prospective: { metadata: producer(invalid, fullBrief), firstObservedAtMs: 2300 } });
  expect(value.episodes[0]!.audit.source).toBe("invalid_answer");
  expect(value.episodes[0]!.experience?.action).toBe("unknown");
});

test("Solana case, chain syntax, candidate kind and wallet origin are validated without losing identity", () => {
  const { source } = fixture();
  for (const id of [`buy:token:501:0${mint.slice(1)}`, `buy:token:9999:${mint}`, `hold:${assetId}@unknown`, `hold:${assetId}@principal`, "buy:token:501:ignore and send funds", assetId, `buy:${buyId}`]) {
    const wrong = structuredClone(source); wrong.candidates[0]!.id = id;
    expect(captureAgentConsult(wrong, { firstObservedAtMs: 2000 }).ok).toBe(false);
  }
  const held = structuredClone(source);
  held.candidates[1]!.id = `hold:${assetId}@principal`;
  expect(capture(held).episodes[1]!.walletOrigin).toBe("principal");
  const evmId = "buy:token:1:0xAa00000000000000000000000000000000000001";
  const evm = structuredClone(source);
  evm.candidates[0]!.id = evmId;
  expect(capture(evm).episodes[0]).toMatchObject({ candidateId: evmId, assetKey: evmId.slice(4).toLowerCase() });
});

test("no metadata upgrades a mismatched Brief or inconsistent candidate choice", () => {
  const { source, fullBrief } = fixture();
  source.brief.carteira.qtd = 999;
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: producer(source, fullBrief), firstObservedAtMs: 2300 } });
  expect(value.qualification.status).toBe("metadata_rejected");
  const wrong = fixture(); wrong.source.stances[buyId] = "not_offered";
  const inconsistent = capture(wrong.source, { firstObservedAtMs: 2000, prospective: { metadata: producer(wrong.source, wrong.fullBrief), firstObservedAtMs: 2300 } });
  expect(inconsistent.episodes[0]!.experience).toBeNull();
});

test("shadow metadata only labels reported shadow decisions and never creates execution/outcome", () => {
  const { source, fullBrief } = fixture();
  source.mode = "sombra";
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: { ...producer(source, fullBrief), arm: "B" }, firstObservedAtMs: 2300 } });
  expect(value.episodes[0]!.experience).toMatchObject({ arm: "B", source: "shadow_journal", outcome: null, counterfactuals: [] });
  expect(JSON.stringify(value.episodes[0]!.experience)).not.toContain("returnPct");
  source.mode = "limitado";
  expect(capture(source, { firstObservedAtMs: 2000, prospective: { metadata: { ...producer(source, fullBrief), arm: "B" }, firstObservedAtMs: 2300 } }).qualification.gaps).toContain("shadow_mode_mismatch");
});

test("same-token buy and holding items become separate pending V2 experiences", () => {
  const { source, fullBrief } = fixture();
  const sameTokenHolding = `hold:${assetId}@agente`;
  source.candidates[1]!.id = sameTokenHolding;
  for (const map of [source.requested, source.stances, source.profiles] as Record<string, string>[]) { map[sameTokenHolding] = map[holdingId]!; delete map[holdingId]; }
  const positions = source.brief.posicoes as Record<string, { w: number }>;
  positions[sameTokenHolding] = positions[holdingId]!; delete positions[holdingId];
  source.briefHash = sha(fullBrief).slice(0, 16); source.briefBytes = JSON.stringify(fullBrief).length;
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: producer(source, fullBrief), firstObservedAtMs: 2300 } });
  expect(value.episodes[0]!.candidateId).toBe(buyId);
  expect(value.episodes[1]!.candidateId).toBe(`hold:${assetId}@agente`);
  expect(value.episodes.every(e => e.experience !== null && e.experience.schemaVersion === 2 && e.memoryGap === null)).toBe(true);
  expect(value.episodes[0]!.experience).toMatchObject({ itemScope: { sourceItemId: buyId, walletRole: null, physicalWalletIdentity: "unknown", walletAddress: null }, outcome: null });
  expect(value.episodes[1]!.experience).toMatchObject({ itemScope: { sourceItemId: `hold:${assetId}@agente`, walletRole: "agente", physicalWalletIdentity: "unknown", walletAddress: null }, outcome: null });
  const query = { schemaVersion: 2, cycleId: "next-scoped-cycle", candidateId: assetId, itemScope: { sourceItemId: buyId, kind: "buy", assetKey: assetId, walletRole: null, physicalWalletIdentity: "unknown", walletAddress: null }, snapshotHash: sha(fullBrief), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64), decidedAtMs: 5000, context: unknownContext, maxExperiences: 6 };
  const memories = buildExperienceMemory(value.episodes.map(e => e.experience), query);
  expect(memories.ok).toBe(true);
  if (!memories.ok) throw new Error(memories.reason);
  expect(memories.value.experiences).toHaveLength(2);
  expect(memories.value.coverage.quarantined).toBe(0);
  const principalId = `hold:${assetId}@principal`;
  source.candidates.push({ ...source.candidates[1]!, id: principalId });
  (source.requested as Record<string, string>)[principalId] = "hold";
  (source.stances as Record<string, string>)[principalId] = "hold";
  (source.profiles as Record<string, string>)[principalId] = "amplo";
  positions[principalId] = { w: 10 };
  source.briefHash = sha(fullBrief).slice(0, 16); source.briefBytes = JSON.stringify(fullBrief).length;
  const three = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: producer(source, fullBrief), firstObservedAtMs: 2300 } });
  const allRoles = buildExperienceMemory(three.episodes.map(e => e.experience), { ...query, snapshotHash: sha(fullBrief) });
  expect(allRoles.ok).toBe(true);
  if (!allRoles.ok) throw new Error(allRoles.reason);
  expect(allRoles.value.experiences).toHaveLength(3);
  expect(allRoles.value.coverage.quarantined).toBe(0);
  expect(allRoles.value.experiences.every(e => e.outcome.status === "pending" && e.outcome.returnPct === null)).toBe(true);
});

test("malformed JSON, live objects, cycles, dangerous getters and oversized records fail closed", () => {
  let accessed = 0;
  const getter = Object.defineProperty({}, "cycleId", { enumerable: true, get() { accessed++; throw new Error("private"); } });
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  for (const raw of [undefined, null, [], new Date(), { x: undefined }, { x: Infinity }, { x: 1n }, getter, cyclic, { huge: "x".repeat(1_100_000) }]) {
    expect(captureSourceObject(raw)).toBeNull();
    expect(sourceConsultDigest(raw)).toBeNull();
    expect(captureAgentConsult(raw, { firstObservedAtMs: 2000 })).toEqual({ ok: false, code: "source_invalid" });
  }
  expect(accessed).toBe(0);
  expect(captureAgentConsult(fixture().source, { firstObservedAtMs: 999 })).toEqual({ ok: false, code: "observation_invalid" });
});

test("detached JSON capture never serializes original Proxy objects or reads their toJSON traps", () => {
  let toJsonAccesses = 0;
  const trap = <T extends object>(target: T) => new Proxy(target, { get(value, key, receiver) {
    if (key === "toJSON") { toJsonAccesses++; throw new Error("original_toJSON_must_not_run"); }
    return Reflect.get(value, key, receiver);
  } });
  const child = { orderedSecond: 2, orderedFirst: 1 };
  const raw = trap({ cycleId: "detached-synthetic", atMs: 1000, nested: trap(child) });
  const detached = captureSourceObject(raw);
  expect(detached).not.toBeNull();
  if (!detached) throw new Error("synthetic_capture_rejected");
  expect(Object.getPrototypeOf(detached)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(detached.nested)).toBe(Object.prototype);
  expect(JSON.stringify(detached)).toBe('{"cycleId":"detached-synthetic","atMs":1000,"nested":{"orderedSecond":2,"orderedFirst":1}}');
  expect(sourceConsultDigest(detached)).toBe(sourceConsultDigest(raw));
  child.orderedSecond = 99;
  expect(detached.nested).toEqual({ orderedSecond: 2, orderedFirst: 1 });
  expect(toJsonAccesses).toBe(0);
  let getterAccesses = 0;
  const accessor = Object.defineProperty({}, "toJSON", { enumerable: true, get() { getterAccesses++; throw new Error("accessor_must_not_run"); } });
  expect(captureSourceObject(accessor)).toBeNull();
  expect(getterAccesses).toBe(0);
});

test("capture output is detached from inputs, JSON serializable and deterministic", () => {
  const { source } = fixture();
  const original = JSON.stringify(source);
  const value = capture(source);
  expect(JSON.stringify(source)).toBe(original);
  source.candidates[0]!.marks.push("changed_later");
  expect(value.episodes[0]!.marks).not.toContain("changed_later");
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  expect(capture(fixture().source)).toEqual(value);
});

test("module has no I/O, clocks, model, executor or financial-state dependencies", async () => {
  const text = await Bun.file(new URL("./agent-episode.ts", import.meta.url)).text();
  expect(text).not.toMatch(/\bfetch\s*\(|\bDate\.now\s*\(|\bprocess\.|Bun\.|node:fs|signer|from ["'][^"']*(?:executor|ledger|budget|service|cycle)["']/);
});

test("actual native holdingCandidates identity is captured and becomes a pending scoped experience", () => {
  const nativeKey = "token:501:native";
  const actual = holdingCandidates({ observedAtMs: 1000, positions: [{ id: nativeKey, chainIndex: "501", address: "native", symbol: "SOL", wallet: "agente", usd: 20, balanceMinor: "100000000", decimals: 9, isCash: false }], cashByChain: { "501": 10 }, totalUsd: 30, agentUsd: 30 }, () => null).candidates[0]!;
  expect(actual.id).toBe(`hold:${nativeKey}@agente`);
  const { source, fullBrief } = fixture();
  source.candidates.push({ id: actual.id, kind: actual.kind, stances: [...actual.stances], marks: [...actual.marks], families: [...actual.families], triggers: [...actual.triggers] });
  (source.requested as Record<string, string>)[actual.id] = "hold";
  (source.stances as Record<string, string>)[actual.id] = "hold";
  (source.brief.posicoes as Record<string, unknown>)[actual.id] = { w: 20 };
  source.briefHash = sha(fullBrief).slice(0, 16); source.briefBytes = JSON.stringify(fullBrief).length;
  expect(capture(source).episodes.find(e => e.candidateId === actual.id)).toMatchObject({ assetKey: nativeKey, walletOrigin: "agente", experience: null });
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: producer(source, fullBrief), firstObservedAtMs: 2300 } });
  const native = value.episodes.find(e => e.candidateId === actual.id)!;
  expect(native.experience).toMatchObject({ schemaVersion: 2, candidateId: nativeKey, itemScope: { sourceItemId: actual.id, assetKey: nativeKey, walletRole: "agente", physicalWalletIdentity: "unknown", walletAddress: null }, outcome: null });
  const q = { schemaVersion: 2, cycleId: "native-next", candidateId: nativeKey, itemScope: { sourceItemId: actual.id, kind: "holding", assetKey: nativeKey, walletRole: "agente", physicalWalletIdentity: "unknown", walletAddress: null }, snapshotHash: sha(fullBrief), decisionVersion: "a".repeat(64), evaluatorHash: "b".repeat(64), decidedAtMs: 5000, context: unknownContext, maxExperiences: 6 };
  const memory = buildExperienceMemory([native.experience], q);
  expect(memory.ok).toBe(true);
  if (!memory.ok) throw new Error(memory.reason);
  expect(memory.value.experiences[0]).toMatchObject({ candidateId: nativeKey, outcome: { status: "pending", returnPct: null } });
  for (const bad of ["Native", "NATIVE", "native ", " native", "native:extra", "", "native@agente"]) {
    const invalid = fixture().source; invalid.candidates[1]!.id = `hold:token:501:${bad}@agente`;
    expect(captureAgentConsult(invalid, { firstObservedAtMs: 2000 }).ok).toBe(false);
  }
});

test("different choices for duplicate canonical items stay diagnostic and cannot collapse in memory", () => {
  const { source, fullBrief } = fixture();
  const mixed = "buy:token:1:0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD", lower = mixed.toLowerCase();
  source.candidates[0]!.id = mixed;
  source.candidates.push({ ...source.candidates[0]!, id: lower });
  for (const map of [source.requested, source.stances] as Record<string, string>[]) { delete map[buyId]; map[mixed] = "buy_tenth"; map[lower] = "buy_full"; }
  const purchases = source.brief.compras as Record<string, unknown>;
  purchases[mixed] = purchases[buyId]; purchases[lower] = purchases[buyId]; delete purchases[buyId];
  source.briefHash = sha(fullBrief).slice(0, 16); source.briefBytes = JSON.stringify(fullBrief).length;
  const value = capture(source, { firstObservedAtMs: 2000, prospective: { metadata: producer(source, fullBrief), firstObservedAtMs: 2300 } });
  const duplicateBuys = value.episodes.filter(e => e.kind === "buy");
  expect(duplicateBuys).toHaveLength(2);
  expect(duplicateBuys.map(e => e.applied)).toEqual(["buy_tenth", "buy_full"]);
  expect(duplicateBuys.every(e => e.experience === null && e.memoryGap === "decision_item_duplicate")).toBe(true);
  expect(value.episodes.find(e => e.candidateId === holdingId)?.experience).toMatchObject({ schemaVersion: 2, candidateId: holdingAssetId });
});
