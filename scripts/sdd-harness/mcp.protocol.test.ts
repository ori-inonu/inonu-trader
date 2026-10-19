import { expect, test } from "bun:test";
import { handleMessage } from "../../src/consensus/mcp";
import { join } from "node:path";
import { MAX_REQUEST_LINE_BYTES, serveMcp } from "./mcp-transport";
import { decide } from "../../src/consensus/engine";
import type { McpDeps } from "../../src/consensus/mcp";

const spec = { id: "protocol-test", goal: "Pick a safe option", facts: {}, rails: ["No network"], options: [{ id: "a", label: "A", what: "Option A" }, { id: "b", label: "B", what: "Option B" }] };
async function request(messages: unknown[]) {
  const child = Bun.spawn(["bun", "--no-env-file", "run", join(import.meta.dir, "mcp.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, TYPESAFE_AI_API_KEY: "" } });
  child.stdin.write(messages.map((m) => JSON.stringify(m)).join("\n") + "\n"); child.stdin.end();
  const stdout = await new Response(child.stdout).text(); await child.exited;
  return stdout.trim().split("\n").map((line) => JSON.parse(line));
}
const planCall = (id: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "consensus_plan", arguments: { spec } } });
const runCall = (id: number, max_calls?: number) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "consensus_run", arguments: { spec, ...(max_calls === undefined ? {} : { max_calls }) } } });

async function exchange(messages: unknown[], deps: McpDeps, handler = handleMessage) {
  async function* input() { yield new TextEncoder().encode(messages.map((m) => JSON.stringify(m)).join("\n") + "\n"); }
  const output: any[] = [];
  await serveMcp(input(), (value) => output.push(value), deps, handler);
  return output;
}

test("a complete receipt preserves long validated identifiers and safe RPC correlation while redacting provider details", async () => {
  const longSpec = { ...spec, id: "protocol_decision_identifier_long_2026", options: [
    { id: "choose_reversible_adapter_update_2026", label: "A", what: "Option A" },
    { id: "b", label: "B", what: "Option B" },
  ] };
  const rpcId = "correlation_request_identifier_long_2026";
  const output = await exchange([
    { ...planCall(1), id: rpcId, params: { name: "consensus_plan", arguments: { spec: longSpec } } },
    { ...runCall(2), params: { name: "consensus_run", arguments: { spec: longSpec } } },
  ], { hasKey: () => true, run: async (checked) => ({
    receipt: await decide(checked, { ask: async (q) => ({ probabilities: q.kind === "rail" ? { violates: 0, compatible: 1 } : Object.fromEntries(q.keys.map((k) => [k, k === "choose_reversible_adapter_update_2026" ? 1 : 0])) }) }),
    meter: { detail: "sk-SyntheticCredentialNeverExpose12345" },
  }) });
  expect(output[0].id).toBe(rpcId);
  expect(JSON.parse(output[0].result.content[0].text).specId).toBe(longSpec.id);
  const result = JSON.parse(output[1].result.content[0].text);
  expect(result.receipt.specId).toBe(longSpec.id);
  expect(result.receipt.leader).toBe("choose_reversible_adapter_update_2026");
  expect(result.receipt.rounds[0].means.choose_reversible_adapter_update_2026).toBe(1);
  expect(result.receipt.specHash).toBe("aa968841989242a66a547d3091278fd7b14ac813259a7f7d042018f75d1a6b02");
  expect(result.meter.detail).toBe("[redacted]");
});

test.each(["error", "mismatch", "missing", "tool-error", "both"])("a %s planning response never authorizes a run", async (fault) => {
  let runs = 0;
  const deps: McpDeps = { hasKey: () => true, run: async () => { runs++; return { receipt: {} as never, meter: {} }; } };
  const output = await exchange([planCall(1), runCall(2)], deps, async (message: any, dependencies) => {
    const response: any = await handleMessage(message, dependencies);
    if (message.params?.name !== "consensus_plan") return response;
    if (fault === "error") return { jsonrpc: "2.0", id: 1, error: { code: -32600, message: "rejected" } };
    if (fault === "mismatch") return { ...response, id: 99 };
    if (fault === "missing") return { jsonrpc: "2.0", id: 1, result: {} };
    if (fault === "tool-error") return { ...response, result: { ...response.result, isError: true } };
    return { ...response, error: { code: -32600, message: "rejected" } };
  });
  expect(runs).toBe(0);
  expect(output[1].result.isError).toBe(true);
  expect(output[1].result.content[0].text).toContain("consensus_plan");
});

test.each([
  { ...planCall(1), jsonrpc: "1.0" },
  { ...planCall(1), id: {} },
  { ...planCall(1), error: { code: -1 } },
  { ...planCall(1), result: {} },
])("an invalid request envelope cannot authorize a run", async (invalid) => {
  let runs = 0;
  const output = await exchange([invalid, runCall(2)], { hasKey: () => true, run: async () => { runs++; return { receipt: {} as never, meter: {} }; } });
  expect(output[0].error.code).toBe(-32600);
  expect(output[1].result.isError).toBe(true);
  expect(runs).toBe(0);
});

test("notifications are silent and leave a valid plan available for one requested run", async () => {
  let runs = 0;
  const { id: _planId, ...planNotification } = planCall(1);
  const { id: _runId, ...runNotification } = runCall(2);
  const output = await exchange([planNotification, runNotification, planCall(3), runNotification, runCall(4), runCall(5)], {
    hasKey: () => true, run: async () => { runs++; return { receipt: {} as never, meter: {} }; },
  });
  expect(output.map((response) => response.id)).toEqual([3, 4, 5]);
  expect(runs).toBe(1);
  expect(output[1].result.isError).not.toBe(true);
  expect(output[2].result.isError).toBe(true);
});

test("tools/list validates the envelope before exposing tools", async () => {
  const output = await exchange([{ jsonrpc: "1.0", id: 1, method: "tools/list" }], { hasKey: () => false, run: async () => { throw new Error("unreachable"); } });
  expect(output[0].error.code).toBe(-32600);
});

test.each(["sk-SyntheticCredentialNeverExpose12345", "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghij"])("sensitive spec identifiers are refused without echo or provider execution", async (sensitiveId) => {
  let runs = 0;
  const sensitive = { ...spec, id: sensitiveId };
  const output = await exchange([
    { ...planCall(1), params: { name: "consensus_plan", arguments: { spec: sensitive } } },
    { ...runCall(2), params: { name: "consensus_run", arguments: { spec: sensitive } } },
  ], { hasKey: () => true, run: async () => { runs++; return { receipt: {} as never, meter: {} }; } });
  expect(JSON.stringify(output)).not.toContain(sensitiveId);
  expect(runs).toBe(0);
  expect(output[0].error).toBeDefined();
});

test("a sensitive RPC identifier is rejected before even planning", async () => {
  const output = await exchange([{ ...planCall(1), id: "sk-SyntheticCredentialNeverExpose12345" }, runCall(2)], { hasKey: () => true, run: async () => { throw new Error("unreachable"); } });
  expect(output[0]).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } });
  expect(output[1].result.isError).toBe(true);
});

test("credential-shaped short identifiers cannot bypass detail redaction as trusted metadata", async () => {
  const sensitive = { ...spec, id: "sk-Synthetic123" };
  const output = await exchange([{ ...planCall(1), params: { name: "consensus_plan", arguments: { spec: sensitive } } }], { hasKey: () => false, run: async () => { throw new Error("unreachable"); } });
  expect(JSON.stringify(output)).not.toContain("sk-Synthetic123");
  expect(output[0].error).toBeDefined();
});

test("canonical facts and forbidden ordering share one single-use plan", async () => {
  let runs = 0;
  const planned = { ...spec, facts: { alpha: true, beta: false }, forbidden: ["b", "b"] };
  const reordered = { ...spec, facts: { beta: false, alpha: true }, forbidden: ["b"] };
  const output = await exchange([
    { ...planCall(1), params: { name: "consensus_plan", arguments: { spec: planned } } },
    { ...runCall(2), id: "rpc:correlation_identifier_2026", params: { name: "consensus_run", arguments: { spec: reordered } } },
    { ...runCall(3), params: { name: "consensus_run", arguments: { spec: reordered } } },
  ], { hasKey: () => true, run: async () => { runs++; return { receipt: {} as never, meter: { specId: "SyntheticArbitraryProviderDetail12345" } }; } });
  expect(output[1].id).toBe("rpc:correlation_identifier_2026");
  expect(output[1].result.isError).not.toBe(true);
  expect(JSON.parse(output[1].result.content[0].text).meter.specId).toBe("[redacted]");
  expect(output[2].result.isError).toBe(true);
  expect(runs).toBe(1);
});

test("a refused new plan invalidates the earlier plan", async () => {
  let runs = 0;
  const output = await exchange([planCall(1), planCall(2), runCall(3)], { hasKey: () => true, run: async () => { runs++; return { receipt: {} as never, meter: {} }; } }, async (message: any, deps) => message.id === 2 ? { jsonrpc: "2.0", id: 2, error: { code: -32600, message: "rejected" } } : handleMessage(message, deps));
  expect(runs).toBe(0);
  expect(output[2].result.isError).toBe(true);
});

test("stdio MCP exposes an optional cap without a maximum of 16", async () => {
  const [response] = await request([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  const run = response.result.tools.find((tool: any) => tool.name === "consensus_run");
  expect(run.inputSchema.required).toEqual(["spec"]);
  expect(run.inputSchema.properties.max_calls).toEqual({ type: "integer", minimum: 1 });
});

test("stdio MCP refuses run unless the same spec was planned first", async () => {
  const [response] = await request([runCall(2, 16)]);
  expect(response.result.isError).toBe(true); expect(response.result.content[0].text).toContain("consensus_plan");
});

test("stdio MCP rejects planned-call overflow before credential lookup or network", async () => {
  const output = await request([planCall(3), runCall(4, 1)]), response = output[1]!;
  expect(output[0]!.result.isError).not.toBe(true); expect(response.result.isError).toBe(true); expect(response.result.content[0].text).toContain("excedem teto");
});

test("stdio MCP accepts omitted and above-16 caps before credential lookup", async () => {
  const missing = await request([planCall(5), runCall(6)]), over = await request([planCall(7), runCall(8, 17)]);
  expect(missing[1]!.result.content[0].text).toContain("chave do provedor ausente");
  expect(over[1]!.result.content[0].text).toContain("chave do provedor ausente");
});

test("stdio MCP rejects oversized frames and continues at the next request", async () => {
  const child = Bun.spawn(["bun", "--no-env-file", "run", join(import.meta.dir, "mcp.ts")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, TYPESAFE_AI_API_KEY: "" } });
  child.stdin.write("x".repeat(MAX_REQUEST_LINE_BYTES + 10) + "\n" + JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) + "\n"); child.stdin.end();
  const stdout = await new Response(child.stdout).text(); await child.exited;
  const output = stdout.trim().split("\n").map((line) => JSON.parse(line));
  expect(output[0].error.code).toBe(-32600); expect(output[1].id).toBe(9);
});

test("protocol catches handler errors, redacts details, and continues", async () => {
  const secret = "sk-test-secret-never-return";
  async function* input() { yield new TextEncoder().encode('{"jsonrpc":"2.0","id":10,"method":"fail"}\n{"jsonrpc":"2.0","id":11,"method":"tools/list"}\n'); }
  const output: any[] = [];
  await serveMcp(input(), (value) => output.push(value), { hasKey: () => false, run: async () => { throw new Error(secret); } }, async () => { throw new Error(secret); });
  expect(output[0].error).toEqual({ code: -32603, message: "internal error" }); expect(JSON.stringify(output)).not.toContain(secret); expect(output[1].id).toBe(11);
});

test("omitted and above-16 caps reach the judge after each matching plan", async () => {
  const caps: (number | undefined)[] = [], output: any[] = [];
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "consensus_plan", arguments: { spec } } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "consensus_run", arguments: { spec } } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "consensus_plan", arguments: { spec } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "consensus_run", arguments: { spec, max_calls: 17 } } },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "consensus_plan", arguments: { spec } } },
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "consensus_run", arguments: { spec, max_calls: 16 } } },
  ];
  async function* input() { yield new TextEncoder().encode(messages.map((message) => JSON.stringify(message)).join("\n") + "\n"); }
  await serveMcp(input(), (value) => output.push(value), { hasKey: () => true, run: async (_spec, cap) => { caps.push(cap); return { receipt: {} as never, meter: { maxCalls: cap ?? null } }; } }, handleMessage);
  expect(caps).toEqual([undefined, 17, 16]);
  expect(output[1].result.isError).not.toBe(true);
  expect(output[3].result.isError).not.toBe(true);
  expect(output[5].result.isError).not.toBe(true);
});
