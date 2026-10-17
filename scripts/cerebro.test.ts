import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addNode, exportCompact, linkNodes, lint, recordReceipt, retractNode, supersedeNode, verify } from "./cerebro";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "cerebro-v2-"));
  roots.push(root);
  return root;
}
const immutable = {
  "docs/_meta/evolucao/graph.json": "41e6e12eeed38f92247be9071f8475fef72275d818edf2f7b3a4b4a1e576a448",
  "docs/_meta/evolucao/curation.json": "08100c210e86a4773c59d4ca2dfb24220c20e550ba8ba3bfbf3d7da67d61bcb2",
  "docs/_meta/evolucao/outputs.json": "087ae670201a61274b31bb53b512788052d473dfda6da7d515737577f88b493d",
  "docs/_meta/evolucao/SPEC.md": "5eefcceba386952ba635a02477273151629ce3cedae7eedd64e4cd1d8251bac4",
  "docs/_meta/evolucao/RUNBOOK.md": "6a574b4ea424787de1228dde57ede27736c41c37a7cf85c4bc395c8ee8b4016f",
  "docs/_meta/evolucao/compiler.py": "58e7890f797a7be55ec268fceb1909c3dc188e6fc9e7c50097e1cfa588826f47",
  "docs/_meta/evolucao/test_compiler.py": "eeb019551bd193758f23ece9aaa0c2aeab49fb48bb7b9c48042a005e4f675581",
  "docs/_meta/evolucao/acceptance.py": "4f055848c05ca51039c44bc4f507fae66587cf05c4117e831ca86a5731f516fe",
} as const;

test("preserves v1 graph, curation, sources and output registry byte for byte", () => {
  const repo = resolve(import.meta.dir, "..");
  for (const [path, expected] of Object.entries(immutable)) {
    const actual = createHash("sha256").update(readFileSync(resolve(repo, path))).digest("hex");
    expect(actual).toBe(expected);
  }
});

test("hash chain rejects changed events and the derived head detects truncation", async () => {
  const changed = tempRoot();
  await addNode(changed, { id: "original", type: "fact", text: "Fato sem segredo." });
  const journal = join(changed, "events.jsonl");
  const event = JSON.parse(readFileSync(journal, "utf8").trim()) as { node: { text: string } };
  event.node.text = "Fato alterado.";
  writeFileSync(journal, `${JSON.stringify(event)}\n`);
  await expect(verify(changed)).rejects.toThrow("hash invalido");

  const truncated = tempRoot();
  await addNode(truncated, { id: "primeiro", type: "iteration", text: "Primeiro registro." });
  await addNode(truncated, { id: "segundo", type: "event", text: "Segundo registro." });
  const lines = readFileSync(join(truncated, "events.jsonl"), "utf8").trimEnd().split("\n");
  writeFileSync(join(truncated, "events.jsonl"), `${lines[0]}\n`);
  await expect(verify(truncated)).rejects.toThrow("grafo derivado diverge do log");
});

test("retraction appends an audit tombstone and hides the node from JEV export", async () => {
  const root = tempRoot();
  await addNode(root, { id: "decision-old", type: "decision", text: "Decisao antiga retratada." });
  await addNode(root, { id: "fact-current", type: "fact", text: "Fato atual." }, ["decision-old"]);
  await addNode(root, { id: "event-current", type: "event", text: "Acontecimento atual." });
  await linkNodes(root, "fact-current", "event-current");
  await retractNode(root, "decision-old", "A decisao foi corrigida.");

  const events = readFileSync(join(root, "events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as { kind: string; reason?: string });
  expect(events.some((event) => event.kind === "node")).toBe(true);
  expect(events.at(-1)).toMatchObject({ kind: "retract", reason: "A decisao foi corrigida." });
  const graph = JSON.parse(readFileSync(join(root, "graph.v2.json"), "utf8")) as { nodes: { id: string }[]; edges: unknown[]; retractions: { id: string; reason: string; seq: number }[] };
  expect(graph.retractions).toContainEqual({ id: "decision-old", reason: "A decisao foi corrigida.", seq: 6 });
  expect(graph.nodes.map((node) => node.id)).not.toContain("decision-old");
  expect(graph.edges).toHaveLength(1);
  const journalBefore = readFileSync(join(root, "events.jsonl"), "utf8");
  const graphBefore = readFileSync(join(root, "graph.v2.json"), "utf8");
  const exported = await exportCompact(root);
  expect(exported).not.toContain("Decisao antiga retratada.");
  expect(exported).not.toContain("decision-old");
  expect(exported).toContain("Acontecimento atual.");
  expect(readFileSync(join(root, "events.jsonl"), "utf8")).toBe(journalBefore);
  expect(readFileSync(join(root, "graph.v2.json"), "utf8")).toBe(graphBefore);
  expect(await verify(root)).toMatchObject({ seq: 6 });
});

test("exports exactly 300-character facts and rejects longer strings", async () => {
  const root = tempRoot();
  const text = "x".repeat(300);
  await addNode(root, { id: "max-text", type: "fact", text });
  const spec = JSON.parse(await exportCompact(root)) as { facts: Record<string, string> };
  expect(Object.values(spec.facts)).toContain(text);
  await expect(addNode(root, { id: "long-text", type: "fact", text: `${text}x` })).rejects.toThrow();
  expect(existsSync(join(root, "events.jsonl"))).toBe(true);
  expect(readFileSync(join(root, "events.jsonl"), "utf8").trimEnd().split("\n")).toHaveLength(1);
});

test("refuses address and secret content before persisting", async () => {
  for (const [id, text] of [["address", `0x${"a".repeat(40)}`], ["secret", "api_key=test"]] as const) {
    const root = tempRoot();
    await expect(addNode(root, { id, type: "fact", text })).rejects.toThrow();
    expect(existsSync(join(root, "events.jsonl"))).toBe(false);
  }
});

test("refuses sensitive retraction reasons before logging", async () => {
  for (const reason of [`0x${"b".repeat(40)}`, "api_key=test"]) {
    const root = tempRoot();
    await addNode(root, { id: "retract-me", type: "fact", text: "Fato seguro." });
    await expect(retractNode(root, "retract-me", reason)).rejects.toThrow();
    expect(readFileSync(join(root, "events.jsonl"), "utf8").trimEnd().split("\n")).toHaveLength(1);
  }
});

test("verifies a CRLF checkout of the materialized graph", async () => {
  const root = tempRoot();
  await addNode(root, { id: "portable", type: "fact", text: "Derivado portavel." });
  const graphPath = join(root, "graph.v2.json");
  writeFileSync(graphPath, readFileSync(graphPath, "utf8").replace(/\n/g, "\r\n"));
  expect(await verify(root)).toMatchObject({ seq: 1 });
});

test("record links a JEV receipt to the given nodes (default: the latest one) and rejects malformed receipts", async () => {
  const root = tempRoot();
  await addNode(root, { id: "ctx", type: "fact", text: "Contexto." });
  await addNode(root, { id: "other", type: "fact", text: "Outro." }, ["ctx"]);
  const file = join(root, "r.json");
  writeFileSync(file, JSON.stringify({ receipt: { v: 1, specId: "s1", specHash: "a".repeat(64), status: "consenso", leader: "x" } }));
  expect(await recordReceipt(root, file)).toBe("jev-s1");
  expect(await verify(root)).toMatchObject({ seq: 5 });
  expect((await exportCompact(root, "ctx", 1)).includes("jev-s1")).toBe(false);
  const copy = readFileSync(join(root, "receipts", "s1.json"));
  expect(copy.equals(readFileSync(file))).toBe(true);
  expect(readFileSync(join(root, "events.jsonl"), "utf8")).toContain(createHash("sha256").update(copy).digest("hex"));
  writeFileSync(file, JSON.stringify({ receipt: { v: 1, specId: "s2", specHash: "zz", status: "consenso" } }));
  await expect(recordReceipt(root, file)).rejects.toThrow("recibo invalido");
  expect(await verify(root)).toMatchObject({ seq: 5 });
});

test("injected instruction files stay within 100 lines", () => {
  const files = [resolve(import.meta.dir, "../AGENTS.md"), join(homedir(), ".omp", "agent", "AGENTS.md")].filter(existsSync);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) expect(readFileSync(file, "utf8").trimEnd().split(/\r?\n/).length).toBeLessThanOrEqual(100);
});

test("lint reports active nodes without links and ignores retracted ones", async () => {
  const root = tempRoot();
  await addNode(root, { id: "a", type: "fact", text: "A." });
  await addNode(root, { id: "b", type: "fact", text: "B." }, ["a"]);
  await addNode(root, { id: "c", type: "fact", text: "C." });
  expect(await lint(root)).toEqual(["c"]);
  await retractNode(root, "c", "obsoleto");
  expect(await lint(root)).toEqual([]);
});

test("export with a focus returns only nodes within the given depth and rejects unknown ids", async () => {
  const root = tempRoot();
  await addNode(root, { id: "a", type: "fact", text: "Alfa." });
  await addNode(root, { id: "b", type: "fact", text: "Beta." }, ["a"]);
  await addNode(root, { id: "c", type: "fact", text: "Gama." }, ["b"]);
  await addNode(root, { id: "d", type: "fact", text: "Delta." }, ["c"]);
  const present = async (depth: number) => {
    const out = await exportCompact(root, "a", depth);
    return ["Alfa.", "Beta.", "Gama.", "Delta."].map((t) => out.includes(t));
  };
  expect(await present(1)).toEqual([true, true, false, false]);
  expect(await present(2)).toEqual([true, true, true, false]);
  await expect(exportCompact(root, "ghost")).rejects.toThrow();
});

test("lint reports two active nodes that claim the same @key until one is superseded", async () => {
  const root = tempRoot();
  await addNode(root, { id: "a", type: "fact", text: "@estado Antes." });
  await addNode(root, { id: "r", type: "fact", text: "Raiz." }, ["a"]);
  await addNode(root, { id: "b", type: "fact", text: "@estado Depois." }, ["a", "r"]);
  expect(await lint(root)).toEqual(["chave:estado"]);
  await supersedeNode(root, "a", "b");
  expect(await lint(root)).toEqual([]);
});

test("supersede retracts the old node pointing at a live replacement and rejects bad targets", async () => {
  const root = tempRoot();
  await addNode(root, { id: "old", type: "fact", text: "Antigo." });
  await addNode(root, { id: "new", type: "fact", text: "Novo." }, ["old"]);
  await expect(supersedeNode(root, "old", "ghost")).rejects.toThrow();
  await expect(supersedeNode(root, "old", "old")).rejects.toThrow();
  await supersedeNode(root, "old", "new");
  const graph = JSON.parse(readFileSync(join(root, "graph.v2.json"), "utf8")) as { nodes: { id: string }[]; retractions: { id: string; reason: string }[] };
  expect(graph.nodes.map((node) => node.id)).toEqual(["new"]);
  expect(graph.retractions[0]).toMatchObject({ id: "old", reason: "substituido por new" });
});
