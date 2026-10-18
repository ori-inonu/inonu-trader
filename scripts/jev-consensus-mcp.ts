/**
 * MCP server (stdio) of the sequential decisions with the Jev as the judge: `consensus_plan` (free) and `consensus_run` (paid, explicit yes and a cap of calls). Logic and tests: src/consensus/mcp.ts. Register it in `.mcp.json`
 * with `bun --no-env-file run scripts/jev-consensus-mcp.ts`: the key is read from the environment of the process only to build the provider and is never printed, written or returned. Nothing here executes an order,
 * restarts anything or changes the live agent. stdout carries only protocol messages (one JSON per line); diagnostics go to stderr.
 */
import { decide } from "../src/consensus/engine";
import { createJevJudge } from "../src/consensus/jev-judge";
import { quotaPath, refund, reserve } from "../src/consensus/quota";
import { handleMessage, type McpDeps } from "../src/consensus/mcp";

const keyOf = (): string | undefined => process.env.TYPESAFE_AI_API_KEY ?? process.env.TYPESAFE_API_KEY;

const deps: McpDeps = {
  hasKey: () => typeof keyOf() === "string" && keyOf() !== "",
  run: async (spec, maxCalls) => {
    const path = quotaPath();
    // Sem teto: so reserva no ledger quando max_calls foi dado; sem ele o uso e somado ao ledger depois da execucao.
    const granted = maxCalls === undefined ? undefined : await reserve(path, maxCalls);
    if (granted === 0) throw new Error("sem chamadas ao Jev disponiveis para esta execucao");
    const judge = granted === undefined ? createJevJudge({ apiKey: keyOf()! }) : createJevJudge({ apiKey: keyOf()!, maxCalls: granted });
    try {
      return { receipt: await decide(spec, judge), meter: judge.meter() };
    } finally {
      if (granted === undefined) await reserve(path, judge.meter().sent);
      else await refund(path, granted - judge.meter().sent);
    }
  },
};

const send = (message: unknown): void => void process.stdout.write(`${JSON.stringify(message)}\n`);

let buffer = "";
const decoder = new TextDecoder();
for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true });
  let at: number;
  while ((at = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, at).trim();
    buffer = buffer.slice(at + 1);
    if (line === "") continue;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "json invalido" } });
      continue;
    }
    const response = await handleMessage(message, deps);
    if (response !== null) send(response);
  }
}
