import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseSpec } from "../src/consensus/spec";
import type { DecisionSpec } from "../src/consensus/engine";

export type NodeType = "iteration" | "fact" | "decision" | "event";
export interface GraphNode { id: string; type: NodeType; text: string }
export interface GraphEdge { from: string; to: string }
type EventBody =
  | { kind: "node"; node: GraphNode }
  | { kind: "edge"; from: string; to: string }
  | { kind: "retract"; id: string; reason: string };
type GraphEvent = EventBody & { seq: number; prevHash: string; hash: string; atMs: number };
interface GraphV2 {
  format: "jev-documentary-graph-v2";
  headSeq: number;
  headHash: string;
  nodes: GraphNode[];
  edges: (GraphEdge & { seq: number })[];
  retractions: { id: string; reason: string; seq: number }[];
}

const ZERO = "0".repeat(64);
const V1_HASHES = new Map([
  ["docs/_meta/evolucao/graph.json", "41e6e12eeed38f92247be9071f8475fef72275d818edf2f7b3a4b4a1e576a448"],
  ["docs/_meta/evolucao/curation.json", "08100c210e86a4773c59d4ca2dfb24220c20e550ba8ba3bfbf3d7da67d61bcb2"],
  ["docs/_meta/evolucao/outputs.json", "087ae670201a61274b31bb53b512788052d473dfda6da7d515737577f88b493d"],
  ["docs/_meta/evolucao/SPEC.md", "5eefcceba386952ba635a02477273151629ce3cedae7eedd64e4cd1d8251bac4"],
  ["docs/_meta/evolucao/RUNBOOK.md", "6a574b4ea424787de1228dde57ede27736c41c37a7cf85c4bc395c8ee8b4016f"],
  ["docs/_meta/evolucao/compiler.py", "58e7890f797a7be55ec268fceb1909c3dc188e6fc9e7c50097e1cfa588826f47"],
  ["docs/_meta/evolucao/test_compiler.py", "eeb019551bd193758f23ece9aaa0c2aeab49fb48bb7b9c48042a005e4f675581"],
  ["docs/_meta/evolucao/acceptance.py", "4f055848c05ca51039c44bc4f507fae66587cf05c4117e831ca86a5731f516fe"],
]);

async function verifyV1(): Promise<void> {
  const repo = resolve(import.meta.dir, "..");
  for (const [path, expected] of V1_HASHES) {
    const actual = createHash("sha256").update(await readFile(resolve(repo, path))).digest("hex");
    if (actual !== expected) throw new Error(`artefato v1 alterado: ${path}`);
  }
}

const TYPES: Record<NodeType, true> = { iteration: true, fact: true, decision: true, event: true };
const OPTIONS = [
  { id: "consider", label: "Considerar contexto", what: "Usar os fatos documentais como contexto, sem tratar isso como autorizacao." },
  { id: "insufficient", label: "Contexto insuficiente", what: "Reconhecer que o contexto nao decide a pergunta posterior." },
] as const;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("\0") === keys.sort().join("\0");
}
function validId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { specFor([], [], value); return true; } catch { return false; }
}
function validateNode(value: unknown): GraphNode {
  if (!record(value) || !exactKeys(value, ["id", "type", "text"]) || !validId(value.id) || typeof value.type !== "string" || !Object.hasOwn(TYPES, value.type) || typeof value.text !== "string" || !value.text.trim()) {
    throw new Error("no invalido");
  }
  const node = { id: value.id, type: value.type as NodeType, text: value.text };
  specFor([node], [], node.id);
  return node;
}
function specFor(nodes: GraphNode[], edges: GraphEdge[] = [], id = "cerebro-grafo-v2"): DecisionSpec {
  const facts: Record<string, string> = {};
  nodes.forEach((node, i) => {
    facts[`n${i}_id`] = node.id;
    facts[`n${i}_type`] = node.type;
    facts[`n${i}_text`] = node.text;
  });
  edges.forEach((edge, i) => { facts[`e${i}`] = `${edge.from}->${edge.to}`; });
  return parseSpec({
    id,
    goal: "Contexto documental para uma decisao posterior. Fatos nao autorizam acoes.",
    facts,
    rails: [],
    options: OPTIONS,
  });
}
function serializedGraph(graph: GraphV2): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}
function project(events: GraphEvent[]): GraphV2 {
  const nodes = new Map<string, GraphNode>();
  const removed = new Map<string, { id: string; reason: string; seq: number }>();
  const edges: (GraphEdge & { seq: number })[] = [];
  const pairs = new Set<string>();
  for (const event of events) {
    if (event.kind === "node") {
      if (nodes.has(event.node.id)) throw new Error(`no duplicado: ${event.node.id}`);
      nodes.set(event.node.id, event.node);
    } else if (event.kind === "edge") {
      if (!nodes.has(event.from) || !nodes.has(event.to) || removed.has(event.from) || removed.has(event.to) || event.from === event.to) throw new Error("ligacao sem nos ativos");
      const pair = `${event.from}\0${event.to}`;
      if (pairs.has(pair)) throw new Error("ligacao duplicada");
      pairs.add(pair);
      edges.push({ from: event.from, to: event.to, seq: event.seq });
    } else {
      if (!nodes.has(event.id) || removed.has(event.id)) throw new Error("retratacao sem no ativo");
      removed.set(event.id, { id: event.id, reason: event.reason, seq: event.seq });
    }
  }
  const last = events.at(-1);
  return {
    format: "jev-documentary-graph-v2",
    headSeq: last?.seq ?? 0,
    headHash: last?.hash ?? ZERO,
    nodes: [...nodes.values()].filter((node) => !removed.has(node.id)),
    edges: edges.filter((edge) => !removed.has(edge.from) && !removed.has(edge.to)),
    retractions: [...removed.values()],
  };
}
function parseEvents(text: string): GraphEvent[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let previous = ZERO;
  return lines.map((line, index) => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error(`jsonl invalido na linha ${index + 1}`); }
    if (!record(value) || !Number.isSafeInteger(value.seq) || value.seq !== index + 1 || value.prevHash !== previous || typeof value.hash !== "string" || !/^[a-f0-9]{64}$/.test(value.hash) || !Number.isSafeInteger(value.atMs) || (value.atMs as number) < 0) {
      throw new Error(`cadeia invalida na linha ${index + 1}`);
    }
    const { hash, ...body } = value;
    if (digest(body) !== hash) throw new Error(`hash invalido na linha ${index + 1}`);
    let event: GraphEvent;
    if (value.kind === "node" && exactKeys(value, ["seq", "prevHash", "hash", "atMs", "kind", "node"])) {
      event = { seq: value.seq as number, prevHash: previous, hash, atMs: value.atMs as number, kind: "node", node: validateNode(value.node) };
    } else if (value.kind === "edge" && exactKeys(value, ["seq", "prevHash", "hash", "atMs", "kind", "from", "to"]) && validId(value.from) && validId(value.to)) {
      event = { seq: value.seq as number, prevHash: previous, hash, atMs: value.atMs as number, kind: "edge", from: value.from, to: value.to };
    } else if (value.kind === "retract" && exactKeys(value, ["seq", "prevHash", "hash", "atMs", "kind", "id", "reason"]) && validId(value.id) && typeof value.reason === "string" && !!value.reason.trim()) {
      specFor([{ id: "retraction", type: "event", text: value.reason }], []);
      event = { seq: value.seq as number, prevHash: previous, hash, atMs: value.atMs as number, kind: "retract", id: value.id, reason: value.reason };
    } else {
      throw new Error(`evento invalido na linha ${index + 1}`);
    }
    previous = hash;
    return event;
  });
}
async function optionalText(path: string): Promise<string | null> {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if (record(error) && error.code === "ENOENT") return null;
    throw error;
  }
}
async function load(root: string, requireFiles = false): Promise<{ events: GraphEvent[]; graph: GraphV2 }> {
  const eventsPath = join(root, "events.jsonl");
  const graphPath = join(root, "graph.v2.json");
  const [journal, materialized] = await Promise.all([optionalText(eventsPath), optionalText(graphPath)]);
  if (requireFiles && journal === null) throw new Error("log ausente");
  const events = parseEvents(journal ?? "");
  const graph = project(events);
  if (materialized === null) {
    if (requireFiles || events.length) throw new Error("derivado ausente");
  } else if (materialized.replace(/\r\n/g, "\n") !== serializedGraph(graph)) {
    throw new Error("grafo derivado diverge do log");
  }
  return { events, graph };
}
async function append(root: string, bodies: EventBody[]): Promise<void> {
  const { events } = await load(root);
  let previous = events.at(-1)?.hash ?? ZERO;
  const firstSeq = events.length + 1;
  const added = bodies.map((body, index) => {
    const prefix = { seq: firstSeq + index, prevHash: previous, atMs: Date.now(), ...body };
    const event = { ...prefix, hash: digest(prefix) } as GraphEvent;
    previous = event.hash;
    events.push(event);
    return event;
  });
  const graph = project(events);
  const eventsPath = join(root, "events.jsonl");
  const existing = await optionalText(eventsPath);
  await mkdir(root, { recursive: true });
  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(eventsPath, `${separator}${added.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  await writeFile(join(root, "graph.v2.json"), serializedGraph(graph), "utf8");
}

export async function addNode(root: string, nodeInput: GraphNode, links: string[] = []): Promise<void> {
  const node = validateNode(nodeInput);
  const { graph } = await load(root);
  const active = new Set(graph.nodes.map((item) => item.id));
  if (graph.nodes.some((item) => item.id === node.id)) throw new Error(`no duplicado: ${node.id}`);
  const unique = new Set<string>();
  for (const id of links) {
    if (!validId(id) || !active.has(id) || id === node.id || unique.has(id)) throw new Error(`link invalido: ${id}`);
    unique.add(id);
  }
  await append(root, [{ kind: "node", node }, ...links.map((id) => ({ kind: "edge", from: id, to: node.id } as const))]);
}
export async function linkNodes(root: string, from: string, to: string): Promise<void> {
  const { graph } = await load(root);
  if (!graph.nodes.some((node) => node.id === from) || !graph.nodes.some((node) => node.id === to)) throw new Error("ligacao sem nos ativos");
  await append(root, [{ kind: "edge", from, to }]);
}
export async function retractNode(root: string, id: string, reason: string): Promise<void> {
  const { graph } = await load(root);
  if (!validId(id) || typeof reason !== "string" || !reason.trim() || !graph.nodes.some((node) => node.id === id)) throw new Error("retratacao invalida");
  specFor([{ id: "retraction", type: "event", text: reason }], []);
  await append(root, [{ kind: "retract", id, reason }]);
}
export async function supersedeNode(root: string, oldId: string, newId: string): Promise<void> {
  const { graph } = await load(root);
  if (oldId === newId || !graph.nodes.some((node) => node.id === newId)) throw new Error("substituto invalido");
  await retractNode(root, oldId, `substituido por ${newId}`);
}
export async function recordReceipt(root: string, receiptPath: string, links?: string[]): Promise<string> {
  const raw = await readFile(receiptPath);
  const parsed = JSON.parse(raw.toString("utf8")) as { receipt?: { v?: number; specId?: unknown; specHash?: unknown; status?: unknown; leader?: unknown } };
  const r = parsed.receipt;
  if (r?.v !== 1 || typeof r.specId !== "string" || typeof r.specHash !== "string" || !/^[0-9a-f]{64}$/.test(r.specHash) || typeof r.status !== "string") throw new Error("recibo invalido");
  const sha = createHash("sha256").update(raw).digest("hex");
  const id = `jev-${r.specId}`;
  const { graph } = await load(root);
  const text = `JEV ${r.status} lider ${typeof r.leader === "string" ? r.leader : "nenhum"}; spec ${r.specHash.slice(0, 16)}; recibo sha256 ${sha}. Recomendacao, nao autoriza nada.`;
  await addNode(root, { id, type: "decision", text }, links ?? graph.nodes.slice(-1).map((node) => node.id));
  await mkdir(join(root, "receipts"), { recursive: true });
  await writeFile(join(root, "receipts", `${r.specId}.json`), raw);
  return id;
}
export async function exportCompact(root: string, focus?: string, depth = 1): Promise<string> {
  const { graph } = await load(root);
  if (focus === undefined) return JSON.stringify(specFor(graph.nodes, graph.edges));
  if (!graph.nodes.some((node) => node.id === focus)) throw new Error(`no inexistente: ${focus}`);
  const keep = new Set([focus]);
  for (let i = 0; i < depth; i++) for (const { from, to } of graph.edges.filter((e) => keep.has(e.from) !== keep.has(e.to))) keep.add(from).add(to);
  return JSON.stringify(specFor(graph.nodes.filter((node) => keep.has(node.id)), graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to))));
}
export async function verify(root: string): Promise<{ seq: number; hash: string }> {
  await verifyV1();
  const { graph } = await load(root, true);
  return { seq: graph.headSeq, hash: graph.headHash };
}
export async function lint(root: string): Promise<string[]> {
  const { graph } = await load(root, true);
  const linked = new Set(graph.edges.flatMap((edge) => [edge.from, edge.to]));
  const orphans = graph.nodes.filter((node) => !linked.has(node.id)).map((node) => node.id);
  const keys = graph.nodes.map((node) => /^@(\S+) /.exec(node.text)?.[1]).filter((key): key is string => key !== undefined);
  return [...orphans, ...new Set(keys.filter((key, i) => keys.indexOf(key) !== i))].map((item) => (orphans.includes(item) ? item : `chave:${item}`));
}
/** Nos ativos cujo id ou texto contem a palavra (sem diferenciar caixa): `id: inicio do texto`. */
export async function search(root: string, word: string): Promise<string[]> {
  const { graph } = await load(root, true);
  const w = word.toLowerCase();
  return graph.nodes.filter((n) => `${n.id} ${n.text}`.toLowerCase().includes(w)).map((n) => `${n.id}: ${n.text.slice(0, 80)}`);
}
/** Candidatos a esquecimento: iteracoes fora dos ultimos `recent` nos, sem aresta com os recentes. Aviso, nunca falha. */
export async function stale(root: string, recent = 20): Promise<string[]> {
  const { graph } = await load(root, true);
  const fresh = new Set(graph.nodes.slice(-recent).map((node) => node.id));
  const touched = new Set(graph.edges.flatMap((e) => (fresh.has(e.from) ? [e.to] : fresh.has(e.to) ? [e.from] : [])));
  return graph.nodes.filter((node) => node.type === "iteration" && !fresh.has(node.id) && !touched.has(node.id)).map((node) => node.id);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const root = resolve(import.meta.dir, "../docs/_meta/cerebro");
  if (command === "add-node" && (args.length === 3 || args.length === 4)) {
    await addNode(root, { type: args[0] as NodeType, id: args[1]!, text: args[2]! }, args[3] ? args[3].split(",") : []);
  } else if (command === "link" && args.length === 2) {
    await linkNodes(root, args[0]!, args[1]!);
  } else if (command === "retract" && args.length === 2) {
    await retractNode(root, args[0]!, args[1]!);
  } else if (command === "supersede" && args.length === 2) {
    await supersedeNode(root, args[0]!, args[1]!);
  } else if (command === "export" && args.length <= 2) {
    console.log(await exportCompact(root, args[0], args[1] ? Number(args[1]) : undefined));
  } else if (command === "record" && (args.length === 1 || args.length === 2)) {
    console.log(await recordReceipt(root, args[0]!, args[1]?.split(",")));
  } else if (command === "search" && args.length === 1) {
    console.log((await search(root, args[0]!)).join("\n"));
  } else if (command === "lint" && args.length === 0) {
    const orphans = await lint(root);
    console.log(orphans.length ? `orfaos: ${orphans.join(",")}` : "ok sem orfaos");
    if (orphans.length) process.exitCode = 1;
    const old = await stale(root);
    if (old.length) console.log(`esquecer? (retract se superado): ${old.join(",")}`);
  } else if (command === "verify" && args.length === 0) {
    const result = await verify(root);
    console.log(`ok seq=${result.seq} hash=${result.hash}`);
  } else {
    throw new Error("uso: add-node <tipo> <id> <texto> [links], link <origem> <destino>, retract <id> <motivo>, supersede <velho> <novo>, record <recibo.json>, export, search <palavra>, lint, verify");
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "erro desconhecido");
    process.exitCode = 1;
  });
}
