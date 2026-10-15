import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const example = readFileSync(join(ROOT, "scripts", "jev-consensus.example.json"), "utf8");

/** Talks to the real stdio server: one JSON per line in, one JSON per line out. */
async function talk(messages: unknown[]): Promise<any[]> {
  const proc = Bun.spawn(["bun", "--no-env-file", "run", join(ROOT, "scripts", "jev-consensus-mcp.ts")], { cwd: ROOT, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, TYPESAFE_AI_API_KEY: "", TYPESAFE_API_KEY: "" } });
  for (const m of messages) proc.stdin.write(`${JSON.stringify(m)}\n`);
  proc.stdin.end();
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

describe("the sequential decisions server speaks MCP over stdio, and the paid tool is refused without a key", () => {
  test("initialize, the list of tools and a free plan come back as protocol messages, one per request", async () => {
    const out = await talk([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "consensus_plan", arguments: { spec: JSON.parse(example) } } },
    ]);
    const plan = JSON.parse(out[2].result.content[0].text);
    expect([out.length, out[0].result.serverInfo.name, out[1].result.tools.length, plan.plannedCalls > 0]).toEqual([3, "jev-consensus", 2, true]);
  });

  test("the paid run is refused when there is no key in the environment of the server, and nothing is sent", async () => {
    const out = await talk([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "consensus_run", arguments: { spec: JSON.parse(example), max_calls: 10, allow_paid_inference: true } } }]);
    expect(JSON.parse(out[0].result.content[0].text).refused).toContain("chave");
  });

  test("a line that is not JSON gets a protocol error and the server keeps answering", async () => {
    const proc = Bun.spawn(["bun", "--no-env-file", "run", join(ROOT, "scripts", "jev-consensus-mcp.ts")], { cwd: ROOT, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    proc.stdin.write("not json\n");
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })}\n`);
    proc.stdin.end();
    const lines = (await new Response(proc.stdout).text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect([lines[0].error.code, lines[1].id]).toEqual([-32700, 9]);
  });
});
