import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chooseNextTask, oneChoice, decideTaskSpec } from "./jev-client";
import type { DecisionSpec } from "../../src/consensus/engine";
import type { SddTask, SddTaskPlan } from "./scheduler";

function serverSource() { return `
import { specFingerprint } from ${JSON.stringify(join(import.meta.dir, "../../src/consensus/engine.ts"))};
let buffer = "", plannedId = "", plannedCalls = 0;
for await (const chunk of Bun.stdin.stream()) {
  buffer += new TextDecoder().decode(chunk);
  while (buffer.includes("\\n")) {
    const index = buffer.indexOf("\\n"), message = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
    if (message.id === undefined) continue;
    let result: any = {};
    if (message.method === "tools/list") result = { tools: [{ name: "consensus_run", inputSchema: { required: ["spec"], properties: { max_calls: { type: "integer", minimum: 1 } } } }] };
    if (message.params?.name === "consensus_plan") { plannedId = message.params.arguments.spec.id; plannedCalls = 27 + message.params.arguments.spec.options.length; result = { content: [{ type: "text", text: JSON.stringify({ specId: plannedId, plannedCalls }) }] }; }
    if (message.params?.name === "consensus_run") {
      const { spec, max_calls } = message.params.arguments;
      if (spec.id !== plannedId || "max_calls" in message.params.arguments || plannedCalls <= 16) throw new Error("per-invocation protocol mismatch");
      const leader = spec.options[spec.options.length - 1].id;
      result = { content: [{ type: "text", text: JSON.stringify({ receipt: { specId: spec.id, specHash: specFingerprint(spec), status: "consenso", leader } }) }] };
    }
    console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  }
}
`; }
const makeTask = (id: string): SddTask => ({ id, title: `Safe task ${id}`, acceptance: ["safe task accepted"], dependsOn: [], writePaths: ["example.ts"], verifyArgv: [["bun", "--no-env-file", "test"]], risk: "low", reversible: true });

const contractSpec: DecisionSpec = { id: "client-contract", goal: "Choose a reversible implementation", facts: { semJevFallbackOptionId: "safe" }, rails: [], options: [{ id: "safe", label: "Safe", what: "Use the reversible option" }, { id: "wait", label: "Wait", what: "Wait for more evidence" }] };
// Known SHA256 of the canonical receipt identity, including default forbidden:[].
const contractHash = "8f5402f37edec5d250a88d0bde8aede7d590409802e06c32c2dc5622588888c8";
function fakeMcp(options: { wrongHash?: boolean; oversized?: boolean; noticeBurst?: boolean; status?: string; specHash?: string } = {}): typeof Bun.spawn {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stdout = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const encode = (value: unknown) => JSON.stringify(value) + "\n";
  return (() => ({
    stdin: {
      write(chunk: string) {
        const m = JSON.parse(chunk); if (m.id === undefined) return;
        let result: unknown = {};
        if (m.method === "tools/list") result = { tools: [{ name: "consensus_run", inputSchema: { required: ["spec"], properties: { max_calls: { type: "integer", minimum: 1 } } } }] };
        if (m.params?.name === "consensus_plan") result = { content: [{ type: "text", text: JSON.stringify({ plannedCalls: 27 }) }] };
        if (m.params?.name === "consensus_run") result = { content: [{ type: "text", text: JSON.stringify({ receipt: { specId: contractSpec.id, specHash: options.specHash ?? (options.wrongHash ? "f".repeat(64) : contractHash), status: options.status ?? "consenso", leader: options.status && options.status !== "consenso" ? null : "safe" } }) }] };
        if (options.oversized && m.method === "initialize") result = { padding: "a".repeat(1024 * 1024) };
        const notices = options.noticeBurst && m.method === "initialize" ? encode({ jsonrpc: "2.0", method: "notice", params: { padding: "a".repeat(600 * 1024) } }).repeat(2) : "";
        controller!.enqueue(new TextEncoder().encode(notices + encode({ jsonrpc: "2.0", id: m.id, result })));
      },
      flush() {}, end() { controller!.close(); },
    }, stdout, stderr: new ReadableStream({ start(c) { c.close(); } }), exited: Promise.resolve(0),
  })) as unknown as typeof Bun.spawn;
}

test("a receipt for another canonical spec is refused", async () => {
  await expect(oneChoice(contractSpec, import.meta.dir, "unused-fixture.ts", fakeMcp({ wrongHash: true }))).rejects.toThrow("invalid Jev receipt");
});

test("a no-consensus receipt never restores a forbidden fallback option", async () => {
  const spec = { ...contractSpec, forbidden: ["safe"] };
  await expect(decideTaskSpec(spec, import.meta.dir, "unused-fixture.ts", fakeMcp({ status: "sem_consenso", specHash: "52ceda122be22f2ebc1314c151f6825ee1055e922d19a4c7f84f5304966dc6f2" }))).rejects.toThrow("no safe sem-jev fallback");
});

test("a reply above one MiB with its newline in the same chunk is refused", async () => {
  await expect(oneChoice(contractSpec, import.meta.dir, "unused-fixture.ts", fakeMcp({ oversized: true }))).rejects.toThrow("frame limit");
});

test("the canonical receipt hash is preserved independent of spec property order", async () => {
  const spec = { options: contractSpec.options, rails: [], facts: contractSpec.facts, goal: contractSpec.goal, id: contractSpec.id };
  const choice = await oneChoice(spec, import.meta.dir, "unused-fixture.ts", fakeMcp({ noticeBurst: true }));
  expect(choice.selectedId).toBe("safe"); expect(choice.source).toBe("jev"); expect(choice.specHash).toBe(contractHash);
});

test("task choices plan the same spec above 16 before each uncapped run", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jev-client-contract-")), server = join(dir, "server.ts"); writeFileSync(server, serverSource());
  const tasks = [makeTask("a"), makeTask("b")], plan: SddTaskPlan = { version: 1, id: "client-test", objective: "Test decisions", authorizedScope: "Test fixture", tasks, sourcePath: "fixture", sourceHash: "fixture-hash" };
  try {
    const result = await chooseNextTask(plan, [], tasks, dir, server);
    expect(result.choice.selectedId).toBe("b"); expect(result.choice.source).toBe("jev"); expect(result.decisions).toHaveLength(1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("large eligible sets use repeated planned calls without an aggregate ceiling", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jev-client-tournament-")), server = join(dir, "server.ts"); writeFileSync(server, serverSource());
  const tasks = Array.from({ length: 10 }, (_, i) => makeTask(`t${i}`)), plan: SddTaskPlan = { version: 1, id: "tournament", objective: "Choose among more than seven ready tickets", authorizedScope: "Test fixture", tasks, sourcePath: "fixture", sourceHash: "fixture-hash" };
  try {
    const result = await chooseNextTask(plan, [], tasks, dir, server);
    expect(result.choice.selectedId).toBe("t9"); expect(result.decisions).toHaveLength(3);
    expect(result.decisions.every((decision) => decision.source === "jev")).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
