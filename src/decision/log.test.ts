import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendReason } from "./log";
import type { ReasonRecord } from "./types";

const dir = mkdtempSync(join(tmpdir(), "decision-reasons-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const record = (id: string): ReasonRecord => ({
  v: 1,
  tsMs: 1,
  mode: "replay",
  venue: "dex",
  chain: "base",
  decision: {
    action: "NAO_OPERAR",
    id,
    symbol: "TOKEN",
    sizeUsd: 0,
    grossEdgeBps: 110,
    costBps: 91,
    netEdgeBps: 19,
    reasons: ["edge_below_min"],
    stages: [{ name: "edge", ok: false, reason: "edge_below_min", ms: 0 }],
  },
});

test("appendReason cria o diretorio pai e anexa uma linha JSON por registro", async () => {
  const path = join(dir, "nested", "decision-reasons.jsonl");
  await appendReason(record("a"), path);
  await appendReason(record("b"), path);
  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  expect(lines.map((l) => (JSON.parse(l) as ReasonRecord).decision.id)).toEqual(["a", "b"]);
});

test("appends concorrentes nao se misturam: cada linha continua JSON valido", async () => {
  const path = join(dir, "concurrent.jsonl");
  await Promise.all(Array.from({ length: 30 }, (_, i) => appendReason(record(`c${i}`), path)));
  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  expect(lines.length).toBe(30);
  expect(new Set(lines.map((l) => (JSON.parse(l) as ReasonRecord).decision.id)).size).toBe(30);
});
