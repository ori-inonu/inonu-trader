import { createHash } from "node:crypto";
import { specFingerprint, type DecisionSpec } from "../../src/consensus/engine";
import { parseSpec } from "../../src/consensus/spec";

import type { SddTask, SddTaskPlan } from "./scheduler";

interface RpcMessage { jsonrpc: "2.0"; id?: number; method?: string; result?: any; error?: { code: number; message: string } }
export interface TaskChoice { selectedId: string | null; source: "jev" | "sem-jev"; receiptHash: string | null; specHash: string; status: string; fallbackReason?: string }
class StdioClient {
  private nextId = 1;
  private buffer = "";
  private decoder = new TextDecoder();
  private iterator: AsyncIterator<Uint8Array>;
  private stdin: { write(chunk: string): unknown; flush(): unknown; end(): unknown };
  private stderrDrain: Promise<void>;
  constructor(private readonly process: ReturnType<typeof Bun.spawn>) {
    const stdin = process.stdin, stdout = process.stdout, stderr = process.stderr;
    if (!stdin || typeof stdin === "number" || !stdout || typeof stdout === "number") throw new Error("MCP stdio unavailable");
    this.stdin = stdin;
    this.iterator = (stdout as ReadableStream<Uint8Array> as unknown as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
    this.stderrDrain = stderr && typeof stderr !== "number" ? (async () => { for await (const _chunk of stderr as unknown as AsyncIterable<Uint8Array>) { /* discard */ } })() : Promise.resolve();
  }
  private async readLine(): Promise<string> {
    for (;;) {
      const i = this.buffer.indexOf("\n"); if (i >= 0) { const frame = this.buffer.slice(0, i); if (Buffer.byteLength(frame) > 1024 * 1024) throw new Error("MCP reply exceeds the frame limit"); this.buffer = this.buffer.slice(i + 1); return frame.replace(/\r$/, ""); }
      if (Buffer.byteLength(this.buffer) > 1024 * 1024) throw new Error("MCP reply exceeds the frame limit");
      const next = await this.iterator.next(); if (next.done) throw new Error("MCP server closed before replying");
      this.buffer += this.decoder.decode(next.value, { stream: true });
    }
  }
  async rpc(method: string, params?: unknown): Promise<RpcMessage> {
    const id = this.nextId++; this.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }) + "\n"); this.stdin.flush();
    for (;;) { const line = await this.readLine(); let value: RpcMessage; try { value = JSON.parse(line); } catch { continue; } if (value.id !== id) continue; if (value.error) throw new Error("MCP protocol request failed"); return value; }
  }
  notify(method: string, params?: unknown) { this.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) }) + "\n"); this.stdin.flush(); }
  async close() { try { this.stdin.end(); } catch {} await this.process.exited; await this.stderrDrain; }
}
function parseToolText(reply: RpcMessage): any {
  if (reply.result?.isError) throw new Error("Jev returned a safe refusal");
  const text = reply.result?.content?.find((item: any) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Jev tool response missing JSON text");
  return JSON.parse(text);
}
export async function oneChoice(rawSpec: DecisionSpec, cwd: string, mcpScript: string, spawn: typeof Bun.spawn = Bun.spawn): Promise<TaskChoice> {
  const spec = parseSpec(rawSpec), specHash = specFingerprint(spec);
  const child = spawn(["bun", "--no-env-file", "run", mcpScript], { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const client = new StdioClient(child);
  try {
    await client.rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "sdd-autonomy-coordinator", version: "0.1.0" } });
    client.notify("notifications/initialized");
    const tools = (await client.rpc("tools/list")).result?.tools;
    const run = Array.isArray(tools) ? tools.find((tool: any) => tool.name === "consensus_run") : null;
    if (!run || !run.inputSchema?.required?.includes("spec") || run.inputSchema.required.includes("max_calls") || run.inputSchema.properties?.max_calls?.maximum !== undefined) throw new Error("jev-sdd optional cap schema unavailable");
    const plan = parseToolText(await client.rpc("tools/call", { name: "consensus_plan", arguments: { spec } }));
    if (!Number.isSafeInteger(plan.plannedCalls) || plan.plannedCalls < 1) throw new Error("invalid decision plan");
    const result = parseToolText(await client.rpc("tools/call", { name: "consensus_run", arguments: { spec } }));
    const receipt = result.receipt;
    if (!receipt || receipt.specId !== spec.id || receipt.specHash !== specHash || !["consenso", "sem_consenso", "sem_opcoes", "juiz_falhou"].includes(receipt.status) || (receipt.status === "consenso" && !spec.options.some(option => option.id === receipt.leader && !spec.forbidden?.includes(option.id)))) throw new Error("invalid Jev receipt");
    const receiptHash = createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
    return { selectedId: receipt.status === "consenso" && typeof receipt.leader === "string" ? receipt.leader : null, source: receipt.status === "consenso" ? "jev" : "sem-jev", receiptHash, specHash, status: receipt.status, fallbackReason: receipt.status === "consenso" ? undefined : "Jev returned no consensus" };
  } finally { await client.close(); }
}
export async function decideTaskSpec(spec: DecisionSpec, cwd: string, mcpScript: string, spawn: typeof Bun.spawn = Bun.spawn): Promise<TaskChoice> {
  const result = await oneChoice(spec, cwd, mcpScript, spawn);
  if (result.selectedId !== null) return result;
  const fallbackId = spec.facts.semJevFallbackOptionId;
  if (typeof fallbackId !== "string" || !spec.options.some((option) => option.id === fallbackId && !spec.forbidden?.includes(option.id))) throw new Error("no safe sem-jev fallback option declared");
  return { ...result, selectedId: fallbackId, source: "sem-jev", fallbackReason: result.fallbackReason ?? "Jev returned no consensus; reversible fallback selected" };
}
function fallback(tasks: SddTask[], specHash: string, reason: string): TaskChoice {
  const selected = [...tasks].sort((a, b) => Number(b.reversible) - Number(a.reversible) || ["low", "medium", "high"].indexOf(a.risk) - ["low", "medium", "high"].indexOf(b.risk) || a.id.localeCompare(b.id))[0]!;
  return { selectedId: selected.id, source: "sem-jev", receiptHash: null, specHash, status: "sem-jev", fallbackReason: reason };
}
function selectionSpec(plan: SddTaskPlan, completed: string[], options: SddTask[], round: number): DecisionSpec {
  const sorted = options.slice().sort((a, b) => a.id.localeCompare(b.id));
  const safeFallback = [...sorted].sort((a, b) => Number(b.reversible) - Number(a.reversible) || ["low", "medium", "high"].indexOf(a.risk) - ["low", "medium", "high"].indexOf(b.risk) || a.id.localeCompare(b.id))[0]!;
  return {
    id: `sdd_${createHash("sha256").update(`${plan.id}:${round}`).digest("hex").slice(0, 16)}`,
    goal: `Choose the next eligible implementation ticket for the explicitly authorized objective: ${plan.objective}`,
    facts: { objectiveId: plan.id, completedCount: completed.length, completedDigest: createHash("sha256").update(completed.join(",")).digest("hex").slice(0, 16), eligibleTaskIds: sorted.map((task) => task.id).join(","), semJevFallbackOptionId: safeFallback.id },
    rails: ["Choose only one of the supplied eligible task IDs", "Do not expand the authorized task graph", "Do not select fenced trading, credential, migration, billing, or destructive Git work"],
    options: sorted.map((task) => ({ id: task.id, label: task.title.slice(0, 120), what: `${task.title.slice(0, 250)}. Risk=${task.risk}; reversible=${task.reversible}; dependencies=${task.dependsOn.join(",") || "none"}.`.slice(0, 400) })),
  };
}
export async function chooseNextTask(plan: SddTaskPlan, completed: string[], eligible: SddTask[], cwd: string, mcpScript: string): Promise<{ choice: TaskChoice; decisions: TaskChoice[] }> {
  if (eligible.length === 0) throw new Error("no eligible tasks to choose");
  if (eligible.length === 1) { const task = eligible[0]!; return { choice: { selectedId: task.id, source: "sem-jev", receiptHash: null, specHash: "deterministic-single-eligible", status: "single-candidate" }, decisions: [] }; }
  let candidates = eligible.slice().sort((a, b) => a.id.localeCompare(b.id)), decisions: TaskChoice[] = [], round = 0;
  while (candidates.length > 1) {
    const winners: SddTask[] = [];
    for (let offset = 0; offset < candidates.length; offset += 7) {
      const group = candidates.slice(offset, offset + 7); if (group.length === 1) { winners.push(group[0]!); continue; }
      const spec = selectionSpec(plan, completed, group, round++);
      let choice: TaskChoice;
      try { choice = await oneChoice(spec, cwd, mcpScript); if (choice.selectedId === null) { const safe = fallback(group, choice.specHash, choice.fallbackReason ?? "Jev gave no consensus"); choice = { ...safe, receiptHash: choice.receiptHash, status: choice.status }; } if (!group.some((task) => task.id === choice.selectedId)) throw new Error("Jev selected an unavailable task"); }
      catch (error) { choice = fallback(group, specFingerprint(spec), error instanceof Error ? error.message : "Jev unavailable"); }
      decisions.push(choice); winners.push(group.find((task) => task.id === choice.selectedId)!);
    }
    if (winners.length >= candidates.length) throw new Error("task selection made no progress");
    candidates = winners;
  }
  return { choice: decisions.at(-1) ?? { selectedId: candidates[0]!.id, source: "sem-jev", receiptHash: null, specHash: "deterministic", status: "single-candidate" }, decisions };
}
