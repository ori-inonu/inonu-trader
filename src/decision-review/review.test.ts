import { expect, test } from "bun:test";
import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emptyCursor, evidenceTail, reviewCycles } from "./review";

const cycle = (id: string, modelo: string | null = null) => ({ kind: "cycle", cycleId: id, atMs: 1000, outcome: "mantido", reason: modelo ? null : "ritmo_do_dia", modelo });
const consult = { cycleId: "synthetic:one", atMs: 1000, mode: "limitado", posture: "defensiva", candidates: [], stances: {}, verdicts: {}, brief: { carteira: {}, compras: {}, posicoes: {} }, historico: null, contexto: null };

test("every recorded cycle is reviewed, including budget waits, then unchanged evidence stays quiet", () => {
  const rows = [cycle("synthetic:one", "jev-latest"), cycle("synthetic:two")];
  const first = reviewCycles(rows, [consult], emptyCursor());
  expect(first.reviews).toHaveLength(2);
  expect(first.reviews[1]).toMatchObject({ consulted: false, reason: "ritmo_do_dia" });
  expect(reviewCycles(rows, [consult], first.cursor).reviews).toHaveLength(0);
});

test("a late Brief and a later confirmed receipt upgrade the review without inventing executions", () => {
  const c = cycle("synthetic:one", "jev-latest");
  const first = reviewCycles([c], [], emptyCursor());
  const second = reviewCycles([c], [consult], first.cursor);
  expect(second.reviews).toHaveLength(1);
  const order = { kind: "order", cycleId: c.cycleId, atMs: 1001, orderKey: "synthetic:order", stage: "executada", reason: "resolvida_pelo_usuario" };
  const third = reviewCycles([c, order], [consult], second.cursor);
  expect(third.reviews[0]!.orders[0]!.proof).toBe("user_report");
  const fourth = reviewCycles([c, { ...order, reason: "recibo_sucesso" }], [consult], third.cursor);
  expect(fourth.reviews[0]!.orders[0]!.proof).toBe("provider_receipt");
});

test("losing the previous cycle from the available source window is reported as a gap", () => {
  const first = reviewCycles([cycle("synthetic:old")], [], emptyCursor());
  const second = reviewCycles([cycle("synthetic:new")], [], first.cursor);
  expect(second.sourceGap).toBe(true);
});

test("a Brief rotating out of the source does not erase previously audited evidence or fabricate a new finding", () => {
  const c = cycle("synthetic:one", "jev-latest");
  const first = reviewCycles([c], [consult], emptyCursor());
  const afterRotation = reviewCycles([c], [], first.cursor);
  expect(afterRotation.reviews).toHaveLength(0);
  expect(afterRotation.cursor.consultations?.[c.cycleId]?.findings).toEqual(first.reviews[0]!.consultation!.findings);
});

test("a partially written line is deferred; malformed complete lines are counted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "inonu-review-synthetic-"));
  const path = join(dir, "ledger.jsonl");
  try {
    await Bun.write(path, JSON.stringify(cycle("synthetic:one")) + "\ninvalid\n{\"kind\":");
    const tail = await evidenceTail(path);
    expect(tail.rows).toHaveLength(1); expect(tail.invalid).toBe(1);
    expect(tail.incompleteFinalLine).toBe(true);
    const bounded = await evidenceTail(path, 30);
    expect(bounded.rows).toHaveLength(0); expect(bounded.truncated).toBe(true);
    await Bun.write(path, JSON.stringify(cycle("synthetic:one")) + "\n");
    expect((await evidenceTail(path)).incompleteFinalLine).toBe(false);
  } finally { unlinkSync(path); rmdirSync(dir); }
});
