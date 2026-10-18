import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { canonicalJson, decisionMetadata, decisionVersionOf, evaluatorHashOf, placarEvaluatorHash, placarSpec, sha256Hex } from "./decision-metadata";
import { questionsDigest, questionsDigestOf, questionTexts } from "./model";

const HEX64 = /^[0-9a-f]{64}$/;
const input = (over: Partial<Parameters<typeof decisionMetadata>[0]> = {}): Parameters<typeof decisionMetadata>[0] => ({
  recordLine: '{"cycleId":"cy1","atMs":1}',
  snapshotHash: "a".repeat(64),
  decisionVersion: "b".repeat(64),
  evaluatorHash: "e".repeat(64),
  factAvailableAtMs: 1_000,
  askedAtMs: 1_200,
  answeredAtMs: 4_500,
  recordedAtMs: 4_600,
  ...over,
});

describe("the metadata of a decision for the study of the agent (ADENDO-D, V2-4)", () => {
  test("every hash is a full SHA-256 and the hash of the record is of the EXACT text that was written, byte for byte", () => {
    const m = decisionMetadata(input())!;
    expect(m.sourceRecordHash).toMatch(HEX64);
    expect(m.sourceRecordHash).toBe(createHash("sha256").update('{"cycleId":"cy1","atMs":1}').digest("hex"));
    expect(decisionMetadata(input({ recordLine: '{"cycleId":"cy1","atMs":2}' }))!.sourceRecordHash).not.toBe(m.sourceRecordHash);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("the envelope has exactly the fields of the contract, with the four real clocks as they were read, the arm A and the evaluator hash it was given", () => {
    const m = decisionMetadata(input())!;
    expect(Object.keys(m).sort()).toEqual(["answeredAtMs", "arm", "askedAtMs", "decisionVersion", "evaluatorHash", "factAvailableAtMs", "recordedAtMs", "schemaVersion", "snapshotHash", "sourceRecordHash"]);
    expect(m).toMatchObject({ schemaVersion: 1, snapshotHash: "a".repeat(64), decisionVersion: "b".repeat(64), factAvailableAtMs: 1_000, askedAtMs: 1_200, answeredAtMs: 4_500, recordedAtMs: 4_600, arm: "A", evaluatorHash: "e".repeat(64) });
  });

  test("no envelope is written from clocks that cannot be true (the facts after the question, the answer before the question, the record before the answer, a clock that is not a positive whole number) nor from a hash that is not a full SHA-256", () => {
    for (const bad of [{ factAvailableAtMs: 2_000 }, { answeredAtMs: 1_000 }, { recordedAtMs: 4_000 }, { askedAtMs: Number.NaN }, { factAvailableAtMs: 0 }, { recordedAtMs: 4_600.5 }, { snapshotHash: "abc" }, { decisionVersion: "G".repeat(64) }, { evaluatorHash: "e".repeat(63) }, { recordLine: "" }]) {
      expect(decisionMetadata(input(bad as never))).toBeNull();
    }
    // equal clocks are possible on a coarse clock and are not a contradiction
    expect(decisionMetadata(input({ factAvailableAtMs: 1_200, answeredAtMs: 1_200, recordedAtMs: 1_200 }))).not.toBeNull();
  });
});

describe("the version of the decider is the hash of what the model reads and of the labels of its rules", () => {
  const base = { criteria: "rank-v1", legend: "scoped-v1", briefVersion: 1, model: "jev-latest", questions: "c".repeat(64) };

  test("it is a full SHA-256, it does not depend on the order the fields are written in, and it changes when any one of them changes", () => {
    const v = decisionVersionOf(base);
    expect(v).toMatch(HEX64);
    expect(decisionVersionOf({ questions: base.questions, model: base.model, briefVersion: 1, legend: "scoped-v1", criteria: "rank-v1" })).toBe(v);
    for (const change of [{ criteria: "rank-v2" }, { legend: "scoped-v2" }, { briefVersion: 2 }, { model: "jev-next" }, { questions: "d".repeat(64) }]) {
      expect(decisionVersionOf({ ...base, ...change })).not.toBe(v);
    }
  });

  test("the evaluator hash identifies the rule the Placar measures with: stable, full SHA-256, and it changes when a window or a threshold does", () => {
    const h = placarEvaluatorHash();
    expect(h).toMatch(HEX64);
    expect(h).toBe(placarEvaluatorHash());
    expect(h).toBe(evaluatorHashOf(placarSpec()));
    expect(evaluatorHashOf({ ...placarSpec(), minSample: 31 })).not.toBe(h);
    expect(evaluatorHashOf({ ...placarSpec(), evaluator: "placar-v2" })).not.toBe(h);
    expect(JSON.stringify(placarSpec().windows)).toContain("15m");
  });

  test("canonical JSON sorts every key at every depth and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}');
  });

  test("the digest of the question texts is stable, covers every constant text the model reads, and changes when any one of them is edited", () => {
    const texts = questionTexts();
    expect(Object.keys(texts).sort()).toEqual(["execLegend", "facets", "goal", "goalShort", "inputs", "inputsShort", "legend", "mandate", "mandateQuestions", "posture", "profile", "stance"]);
    expect(questionsDigest()).toMatch(HEX64);
    expect(questionsDigest()).toBe(questionsDigestOf(texts));
    expect(questionsDigest()).toBe(questionsDigest());
    expect(questionsDigestOf({ ...texts, goal: texts.goal + " " })).not.toBe(questionsDigest());
    expect(questionsDigestOf({ ...texts, posture: { ...(texts.posture as object), neutra: "x" } })).not.toBe(questionsDigest());
  });
});
