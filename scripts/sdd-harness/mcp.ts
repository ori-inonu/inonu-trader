import { decide } from "../../src/consensus/engine";
import { createJevJudge } from "../../src/consensus/jev-judge";
import { handleMessage, TOOLS, type McpDeps } from "../../src/consensus/mcp";
import { enforceCallLimit } from "./core";
import { serveMcp } from "./mcp-transport";

const tools = TOOLS.map((tool) => tool.name === "consensus_run" ? { ...tool, description: "Explicit Jev run after consensus_plan; optional max_calls, with no artificial default ceiling or aggregate quota." } : tool);
const deps: McpDeps = {
  hasKey: () => !!process.env.TYPESAFE_AI_API_KEY,
  run: async (spec, cap) => {
    const checked = enforceCallLimit(spec, cap), key = process.env.TYPESAFE_AI_API_KEY;
    if (!key) throw new Error("credential missing from inherited environment");
    try {
      const judge = createJevJudge({ apiKey: key, maxCalls: checked.maxCalls });
      return { receipt: await decide(checked.parsed, judge), meter: judge.meter() };
    } catch { throw new Error("Jev provider request failed; details omitted"); }
  },
};
const send = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
await serveMcp(Bun.stdin.stream(), send, deps, handleMessage, tools);
