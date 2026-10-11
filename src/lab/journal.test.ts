import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileJournal,
  JournalError,
  MemoryJournal,
  assertComplete,
  canonicalJson,
  digestText,
  parseJournalText,
  runIdOf,
  type JournalRecord,
} from "./journal.ts";
import { LEVERAGES, type Epoch, type LabCandidate, type Outcome, type PolicyDecision } from "./types.ts";

// Spec: docs/JEV-LABORATORIO-DE-DECISAO.md section 3.5. Titles start with the acceptance id (LB22, LB23).
// Every file lives in a temporary directory created here.

const ROOT = mkdtempSync(join(tmpdir(), "jev-lab-journal-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
let counter = 0;
function freshDir(): string {
  counter += 1;
  return join(ROOT, `run-${counter}`);
}

const T = 1_800_000_000_000;
const MANIFEST = {
  schema: "jev-lab-manifest-v1",
  mode: "synthetic",
  source: "synthetic:seed=7",
  stepMs: 21_600_000,
  horizonMs: 86_400_000,
  policies: ["hold", "jev"],
};

function candidate(modality: "perp-directional" | "spot-momentum", instrument: string, side: "long" | "short"): LabCandidate {
  return {
    id: `${modality}.${instrument}.${side}`,
    modality,
    instrument,
    hedgeInstrument: null,
    venue: "okx",
    observedAtMs: T,
    horizonMs: 86_400_000,
    side,
    features: { retLookbackBps: 12.5, volHorizonBps: null, costBps: 14 },
    costs: { feeBps: 10, spreadBps: 2, slippageBps: 2, fixedUsd: 0, notionalUsd: 100, complete: true },
    validUntilMs: T + 21_600_000,
    provenance: { source: "synthetic:seed=7", externalAccessObserved: false },
  };
}

const LONG = candidate("perp-directional", "SYNA-USDT-SWAP", "long");
const SHORT = candidate("perp-directional", "SYNA-USDT-SWAP", "short");

function epochAt(t: number, index: number): Epoch {
  const long = { ...LONG, observedAtMs: t, validUntilMs: t + 21_600_000 };
  const short = { ...SHORT, observedAtMs: t, validUntilMs: t + 21_600_000 };
  return { id: `e${t}`, index, t, candidates: [long, short], eligibleIds: [long.id], ineligible: [{ id: short.id, reasons: ["costs-unknown:spread"] }] };
}

function decision(epochId: string, policyId: string, choice: string, over: Partial<PolicyDecision> = {}): PolicyDecision {
  return { policyId, epochId, choice, probabilities: { hold: choice === "hold" ? 1 : 0, [LONG.id]: choice === LONG.id ? 1 : 0 }, latencyMs: 0, inputTokens: 0, costUsd: 0, status: "ok", note: null, ...over };
}

function outcome(epochId: string, candidateId: string, over: Partial<Outcome> = {}): Outcome {
  return {
    epochId,
    candidateId,
    entryMs: T + 900_000,
    horizonEndMs: T + 87_300_000,
    grossReturn: 0.01,
    fundingReturn: -0.0001,
    costReturn: 0.0014,
    opportunityCost: 0.000111,
    netReturn: 0.008389,
    capitalPerNotional: 1,
    leverage: LEVERAGES.map((leverage) => ({ leverage, applicable: true, liquidated: false, equityMultiple: 1 + leverage * 0.008389 })),
    complete: true,
    incompleteReason: null,
    ...over,
  };
}

function group(t: number, index: number): JournalRecord[] {
  const epoch = epochAt(t, index);
  return [
    { type: "epoch", epoch },
    { type: "decision", decision: decision(epoch.id, "hold", "hold") },
    { type: "decision", decision: decision(epoch.id, "jev", LONG.id, { inputTokens: 1800, costUsd: null }) },
    { type: "outcome", outcome: outcome(epoch.id, LONG.id) },
  ];
}

function catchError(fn: () => unknown): JournalError {
  try {
    fn();
  } catch (error) {
    if (error instanceof JournalError) return error;
    throw error;
  }
  throw new Error("expected a JournalError");
}

describe("LB22 canonical form, identity and digest", () => {
  test("LB22 canonicalJson sorts keys at every depth and runId depends only on the content of the manifest", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
    expect(runIdOf(MANIFEST)).toBe(runIdOf({ ...MANIFEST, policies: ["hold", "jev"], mode: "synthetic" }));
    expect(runIdOf(MANIFEST)).toMatch(/^[0-9a-f]{16}$/);
    expect(runIdOf({ ...MANIFEST, stepMs: 1 })).not.toBe(runIdOf(MANIFEST));
    expect(digestText("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("LB22 memory journal: append only and idempotent", () => {
  test("LB22 appending a group stores it in order; appending the same group again changes nothing", () => {
    const journal = new MemoryJournal(MANIFEST);
    expect(journal.append(group(T, 0))).toBe(4);
    expect(journal.hasEpoch(`e${T}`)).toBe(true);
    expect(journal.hasDecision(`e${T}`, "jev")).toBe(true);
    expect(journal.hasDecision(`e${T}`, "random")).toBe(false);
    expect(journal.hasOutcome(`e${T}`, LONG.id)).toBe(true);
    const before = JSON.stringify(journal.data());
    expect(journal.append(group(T, 0))).toBe(0);
    expect(JSON.stringify(journal.data())).toBe(before);
    expect(journal.data().epochs.length).toBe(1);
    expect(journal.data().decisions.length).toBe(2);
    expect(journal.data().outcomes.length).toBe(1);
  });

  test("LB22 same key with different content is a conflict and nothing from that batch is stored", () => {
    const journal = new MemoryJournal(MANIFEST);
    journal.append(group(T, 0));
    const changed = group(T, 0);
    changed[3] = { type: "outcome", outcome: outcome(`e${T}`, LONG.id, { netReturn: 0.5 }) };
    const error = catchError(() => journal.append([{ type: "epoch", epoch: epochAt(T + 21_600_000, 1) }, ...changed]));
    expect(error.kind).toBe("conflict");
    expect(journal.hasEpoch(`e${T + 21_600_000}`)).toBe(false);
  });

  test("LB22 key order inside a record does not make an identical record a conflict", () => {
    const journal = new MemoryJournal(MANIFEST);
    journal.append(group(T, 0));
    const original = group(T, 0)[2] as { type: "decision"; decision: PolicyDecision };
    const reordered = { type: "decision" as const, decision: Object.fromEntries(Object.entries(original.decision).reverse()) as unknown as PolicyDecision };
    expect(journal.append([reordered])).toBe(0);
  });

  test("LB22 a decision or an outcome needs its epoch, and must name a real choice", () => {
    const journal = new MemoryJournal(MANIFEST);
    expect(catchError(() => journal.append([{ type: "decision", decision: decision(`e${T}`, "hold", "hold") }])).kind).toBe("invalid");
    journal.append([{ type: "epoch", epoch: epochAt(T, 0) }]);
    expect(catchError(() => journal.append([{ type: "decision", decision: decision(`e${T}`, "jev", SHORT.id) }])).kind).toBe("invalid");
    expect(catchError(() => journal.append([{ type: "decision", decision: decision(`e${T}`, "jev", "perp-directional.NOPE-USDT-SWAP.long") }])).kind).toBe("invalid");
    expect(catchError(() => journal.append([{ type: "outcome", outcome: outcome(`e${T}`, SHORT.id) }])).kind).toBe("invalid");
    expect(journal.append([{ type: "decision", decision: decision(`e${T}`, "hold", "hold") }])).toBe(1);
  });

  test("LB22 records that could not be read back are refused before being stored: NaN, infinity, wrong shapes", () => {
    const journal = new MemoryJournal(MANIFEST);
    journal.append([{ type: "epoch", epoch: epochAt(T, 0) }]);
    const bad: PolicyDecision[] = [
      decision(`e${T}`, "jev", "hold", { latencyMs: Number.NaN }),
      decision(`e${T}`, "jev", "hold", { inputTokens: 1.5 }),
      decision(`e${T}`, "jev", "hold", { costUsd: -1 }),
      decision(`e${T}`, "jev", "hold", { status: "weird" as unknown as "ok" }),
      decision(`e${T}`, "Bad Id", "hold"),
      decision(`e${T}`, "jev", "hold", { probabilities: { hold: 2 } }),
    ];
    for (const entry of bad) expect(catchError(() => journal.append([{ type: "decision", decision: entry }])).kind).toBe("invalid");
    expect(catchError(() => journal.append([{ type: "outcome", outcome: outcome(`e${T}`, LONG.id, { netReturn: Number.POSITIVE_INFINITY }) }])).kind).toBe("invalid");
    expect(catchError(() => journal.append([{ type: "outcome", outcome: outcome(`e${T}`, LONG.id, { complete: false, incompleteReason: null }) }])).kind).toBe("invalid");
    expect(journal.data().decisions.length).toBe(0);
  });
});

describe("LB22 file journal", () => {
  test("LB22 a fresh directory gets a header-only journal, deterministic byte for byte", () => {
    const dirA = freshDir();
    const dirB = freshDir();
    FileJournal.open(dirA, MANIFEST);
    FileJournal.open(dirB, MANIFEST);
    const textA = readFileSync(join(dirA, "journal.jsonl"), "utf8");
    expect(textA).toBe(readFileSync(join(dirB, "journal.jsonl"), "utf8"));
    expect(textA.endsWith("\n")).toBe(true);
    expect(textA.split("\n").length).toBe(2);
    const header = JSON.parse(textA.split("\n")[0] as string) as Record<string, unknown>;
    expect(header).toMatchObject({ type: "header", schema: "jev-lab-journal-v1", runId: runIdOf(MANIFEST), manifest: MANIFEST });
  });

  test("LB22 the log is appended to, never rewritten: earlier bytes stay identical", () => {
    const dir = freshDir();
    const journal = FileJournal.open(dir, MANIFEST);
    const path = join(dir, "journal.jsonl");
    const headerBytes = readFileSync(path);
    journal.append(group(T, 0));
    const afterFirst = readFileSync(path);
    expect(afterFirst.subarray(0, headerBytes.length).equals(headerBytes)).toBe(true);
    journal.append(group(T + 21_600_000, 1));
    const afterSecond = readFileSync(path);
    expect(afterSecond.subarray(0, afterFirst.length).equals(afterFirst)).toBe(true);
    expect(afterSecond.length).toBeGreaterThan(afterFirst.length);
  });

  test("LB22 rerunning the same epoch writes nothing: the file size does not move", () => {
    const dir = freshDir();
    const journal = FileJournal.open(dir, MANIFEST);
    journal.append(group(T, 0));
    const size = statSync(join(dir, "journal.jsonl")).size;
    expect(journal.append(group(T, 0))).toBe(0);
    expect(statSync(join(dir, "journal.jsonl")).size).toBe(size);
    const reopened = FileJournal.open(dir, MANIFEST);
    expect(reopened.append(group(T, 0))).toBe(0);
    expect(statSync(join(dir, "journal.jsonl")).size).toBe(size);
  });

  test("LB22 resume: reopening loads what was written and a half written epoch is completed, not repeated", () => {
    const dir = freshDir();
    const first = FileJournal.open(dir, MANIFEST);
    first.append(group(T, 0));
    const partial = group(T + 21_600_000, 1);
    first.append(partial.slice(0, 2)); // epoch and the hold decision only
    const resumed = FileJournal.open(dir, MANIFEST);
    expect(resumed.hasEpoch(`e${T + 21_600_000}`)).toBe(true);
    expect(resumed.hasDecision(`e${T + 21_600_000}`, "hold")).toBe(true);
    expect(resumed.hasDecision(`e${T + 21_600_000}`, "jev")).toBe(false);
    expect(resumed.append(partial)).toBe(2);
    const text = readFileSync(join(dir, "journal.jsonl"), "utf8");
    expect(text.split("\n").length).toBe(1 + 4 + 4 + 1);
    expect(assertComplete(parseJournalText(text), ["hold", "jev"])).toBeUndefined();
  });

  test("LB22 an interrupted run followed by a resume writes the same bytes as an uninterrupted run", () => {
    const whole = freshDir();
    const journalWhole = FileJournal.open(whole, MANIFEST);
    for (let i = 0; i < 4; i += 1) journalWhole.append(group(T + i * 21_600_000, i));
    const split = freshDir();
    const part = FileJournal.open(split, MANIFEST);
    for (let i = 0; i < 2; i += 1) part.append(group(T + i * 21_600_000, i));
    const rest = FileJournal.open(split, MANIFEST);
    for (let i = 0; i < 4; i += 1) rest.append(group(T + i * 21_600_000, i));
    expect(readFileSync(join(split, "journal.jsonl"), "utf8")).toBe(readFileSync(join(whole, "journal.jsonl"), "utf8"));
  });

  test("LB22 snapshot.json is written atomically through a temporary file and holds the counts and the journal size", () => {
    const dir = freshDir();
    const journal = FileJournal.open(dir, MANIFEST);
    journal.append(group(T, 0));
    journal.append(group(T + 21_600_000, 1));
    journal.snapshot();
    const snapshot = JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf8")) as Record<string, unknown>;
    expect(snapshot).toEqual({
      schema: "jev-lab-snapshot-v1",
      runId: runIdOf(MANIFEST),
      epochs: 2,
      decisions: 4,
      outcomes: 2,
      journalBytes: statSync(join(dir, "journal.jsonl")).size,
      lastEpochId: `e${T + 21_600_000}`,
    });
    expect(readdirSync(dir).sort()).toEqual(["journal.jsonl", "snapshot.json"]);
    // a stale temporary file from a crash does not matter: the next snapshot replaces it
    writeFileSync(join(dir, "snapshot.json.tmp"), "half written");
    journal.append(group(T + 2 * 21_600_000, 2));
    journal.snapshot();
    expect(existsSync(join(dir, "snapshot.json.tmp"))).toBe(false);
    expect((JSON.parse(readFileSync(join(dir, "snapshot.json"), "utf8")) as { epochs: number }).epochs).toBe(3);
  });

  test("LB22 the journal reader of a path returns the same data as the one that wrote it", () => {
    const dir = freshDir();
    const journal = FileJournal.open(dir, MANIFEST);
    for (let i = 0; i < 3; i += 1) journal.append(group(T + i * 21_600_000, i));
    const read = FileJournal.read(join(dir, "journal.jsonl"));
    expect(JSON.stringify(read)).toBe(JSON.stringify(journal.data()));
    expect(read.runId).toBe(runIdOf(MANIFEST));
    expect(read.manifest).toEqual(MANIFEST);
  });
});

describe("LB23 strict reading names the line", () => {
  const good = (): string[] => {
    const dir = freshDir();
    const journal = FileJournal.open(dir, MANIFEST);
    for (let i = 0; i < 2; i += 1) journal.append(group(T + i * 21_600_000, i));
    return readFileSync(join(dir, "journal.jsonl"), "utf8").split("\n");
  };

  test("LB23 the good file parses and every kind of line is found", () => {
    const lines = good();
    const data = parseJournalText(lines.join("\n"));
    expect(data.epochs.length).toBe(2);
    expect(data.decisions.length).toBe(4);
    expect(data.outcomes.length).toBe(2);
    expect(data.epochs[0]?.candidates[0]?.features.volHorizonBps).toBeNull();
  });

  const corruptions: ReadonlyArray<readonly [string, number, (line: string) => string]> = [
    ["not json", 3, () => "{not json"],
    ["a blank line", 3, () => ""],
    ["an unknown type", 3, (l) => l.replace('"type":"decision"', '"type":"dec"')],
    ["an extra key", 3, (l) => l.replace('"type":"decision"', '"type":"decision","extra":1')],
    ["a decision with a wrong status", 3, (l) => l.replace('"status":"ok"', '"status":"nice"')],
    ["a decision with a NaN written as null", 3, (l) => l.replace('"latencyMs":0', '"latencyMs":null')],
    ["a decision of an unknown epoch", 3, (l) => l.replace(/"epochId":"e\d+"/, '"epochId":"e1"')],
    ["a second header", 3, () => '{"type":"header","schema":"jev-lab-journal-v1","runId":"0123456789abcdef","manifest":{}}'],
    ["an epoch whose id does not match its time", 2, (l) => l.replace(/"id":"e(\d+)"/, '"id":"e5"')],
    ["an outcome naming a candidate that was not eligible", 5, (l) => l.replace(/"candidateId":"[^"]+"/, `"candidateId":"${SHORT.id}"`)],
    ["a number written as text", 5, (l) => l.replace('"netReturn":0.008389', '"netReturn":"0.008389"')],
    ["a complete outcome with a reason", 5, (l) => l.replace('"incompleteReason":null', '"incompleteReason":"candle-gap"')],
    ["a truncated line", 5, (l) => l.slice(0, Math.floor(l.length / 2))],
  ];

  for (const [name, lineNumber, mutate] of corruptions) {
    test(`LB23 ${name} is an error that names line ${lineNumber}`, () => {
      const lines = good();
      lines[lineNumber - 1] = mutate(lines[lineNumber - 1] as string);
      const error = catchError(() => parseJournalText(lines.join("\n")));
      expect(error.kind).toBe("corrupt");
      expect(error.line).toBe(lineNumber);
      expect(error.message).toContain(`linha ${lineNumber}`);
    });
  }

  test("LB23 the first line must be the header, and an empty text or a missing final newline is refused", () => {
    const lines = good();
    expect(catchError(() => parseJournalText(lines.slice(1).join("\n"))).line).toBe(1);
    expect(catchError(() => parseJournalText("")).kind).toBe("corrupt");
    const unterminated = lines.slice(0, -1).join("\n");
    const error = catchError(() => parseJournalText(unterminated));
    expect(error.kind).toBe("corrupt");
    expect(error.line).toBe(lines.length - 1);
    expect(catchError(() => parseJournalText(`﻿${lines.join("\n")}`)).line).toBe(1);
  });

  test("LB23 a duplicated record is an error that names the second occurrence", () => {
    const lines = good();
    const withDuplicate = [...lines.slice(0, 4), lines[3] as string, ...lines.slice(4)];
    const error = catchError(() => parseJournalText(withDuplicate.join("\n")));
    expect(error.line).toBe(5);
  });

  test("LB23 error messages never repeat the content of the offending line", () => {
    const lines = good();
    lines[2] = '{"type":"decision","decision":{"policyId":"SECRET-CANARY"}}';
    const error = catchError(() => parseJournalText(lines.join("\n")));
    expect(error.message).not.toContain("SECRET-CANARY");
  });

  test("LB23 assertComplete wants every policy of the manifest to have decided and every eligible candidate to have an outcome", () => {
    const lines = good();
    const noOutcome = [...lines.slice(0, 4), ...lines.slice(5)];
    const data = parseJournalText(noOutcome.join("\n"));
    const error = catchError(() => assertComplete(data, ["hold", "jev"]));
    expect(error.kind).toBe("incomplete");
    expect(error.message).toContain(`e${T}`);
    const noDecision = [...lines.slice(0, 2), ...lines.slice(3)];
    expect(catchError(() => assertComplete(parseJournalText(noDecision.join("\n")), ["hold", "jev"])).kind).toBe("incomplete");
    expect(assertComplete(parseJournalText(lines.join("\n")), ["hold", "jev"])).toBeUndefined();
  });
});

describe("LB23 a missing or corrupt journal stops the run instead of starting empty", () => {
  function written(): { dir: string; path: string; snapshot: string } {
    const dir = freshDir();
    const journal = FileJournal.open(dir, MANIFEST);
    for (let i = 0; i < 3; i += 1) journal.append(group(T + i * 21_600_000, i));
    journal.snapshot();
    return { dir, path: join(dir, "journal.jsonl"), snapshot: join(dir, "snapshot.json") };
  }

  function bytes(dir: string): Record<string, string> {
    return Object.fromEntries(readdirSync(dir).sort().map((name) => [name, readFileSync(join(dir, name), "utf8")]));
  }

  test("LB23 journal deleted but snapshot present: STOP (kind missing) and nothing is created", () => {
    const { dir, path } = written();
    rmSync(path);
    const before = bytes(dir);
    const error = catchError(() => FileJournal.open(dir, MANIFEST));
    expect(error.kind).toBe("missing");
    expect(error.message).toContain("snapshot");
    expect(bytes(dir)).toEqual(before);
    expect(existsSync(path)).toBe(false);
  });

  test("LB23 a corrupt line in the middle: STOP (kind corrupt) with the line number, the file is left alone", () => {
    const { dir, path } = written();
    const lines = readFileSync(path, "utf8").split("\n");
    lines[6] = "garbage";
    writeFileSync(path, lines.join("\n"));
    const before = bytes(dir);
    const error = catchError(() => FileJournal.open(dir, MANIFEST));
    expect(error.kind).toBe("corrupt");
    expect(error.line).toBe(7);
    expect(bytes(dir)).toEqual(before);
  });

  test("LB23 a journal cut in the middle of a line (a crash while writing) stops the run and says which line", () => {
    const { dir, path } = written();
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.slice(0, text.length - 40));
    const error = catchError(() => FileJournal.open(dir, MANIFEST));
    expect(error.kind).toBe("corrupt");
    expect(error.line).toBe(text.split("\n").length - 1);
  });

  test("LB23 a journal cut at a line boundary that lost epochs the snapshot knew about is truncation: STOP", () => {
    const { dir, path } = written();
    const lines = readFileSync(path, "utf8").split("\n");
    writeFileSync(path, `${lines.slice(0, 1 + 4).join("\n")}\n`);
    const error = catchError(() => FileJournal.open(dir, MANIFEST));
    expect(error.kind).toBe("corrupt");
    expect(error.message).toContain("snapshot");
  });

  test("LB23 an empty journal file is corrupt, not a fresh start", () => {
    const { dir, path } = written();
    writeFileSync(path, "");
    expect(catchError(() => FileJournal.open(dir, MANIFEST)).kind).toBe("corrupt");
  });

  test("LB23 a journal written for another configuration stops the run (kind mismatch) and is not touched", () => {
    const { dir } = written();
    const before = bytes(dir);
    const error = catchError(() => FileJournal.open(dir, { ...MANIFEST, stepMs: 3_600_000 }));
    expect(error.kind).toBe("mismatch");
    expect(bytes(dir)).toEqual(before);
  });

  test("LB23 a corrupt snapshot also stops the run", () => {
    const { dir, snapshot } = written();
    writeFileSync(snapshot, "{not json");
    expect(catchError(() => FileJournal.open(dir, MANIFEST)).kind).toBe("corrupt");
    writeFileSync(snapshot, JSON.stringify({ schema: "other" }));
    expect(catchError(() => FileJournal.open(dir, MANIFEST)).kind).toBe("corrupt");
  });

  test("LB23 a snapshot that lags behind the journal is fine (a crash between the append and the snapshot)", () => {
    const { dir } = written();
    const journal = FileJournal.open(dir, MANIFEST);
    journal.append(group(T + 3 * 21_600_000, 3));
    expect(() => FileJournal.open(dir, MANIFEST)).not.toThrow();
  });

  test("LB23 no journal and no snapshot is a legitimate fresh start", () => {
    const dir = freshDir();
    mkdirSync(dir, { recursive: true });
    expect(() => FileJournal.open(dir, MANIFEST)).not.toThrow();
    expect(existsSync(join(dir, "journal.jsonl"))).toBe(true);
  });

  test("LB23 a path that is a file, not a directory, is refused", () => {
    const dir = freshDir();
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(dir, "i am a file");
    expect(catchError(() => FileJournal.open(dir, MANIFEST)).kind).toBe("invalid");
  });

  test("LB23 reading a journal path: missing, not a regular file and corrupt are all refused", () => {
    expect(catchError(() => FileJournal.read(join(ROOT, "nope", "journal.jsonl"))).kind).toBe("missing");
    expect(catchError(() => FileJournal.read(ROOT)).kind).toBe("invalid");
    const { path } = written();
    writeFileSync(path, "garbage\n");
    expect(catchError(() => FileJournal.read(path)).line).toBe(1);
  });
});
