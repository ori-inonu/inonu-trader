/**
 * The sequential decisions as an MCP server (JSON-RPC 2.0 over stdio, one message per line): the adaptation of "sequential thinking" to the Jev, where the steps are JUDGMENTS and the process ends in a consensus with a receipt,
 * or in a question to the person. Two tools: `consensus_plan` (free: no key, no network, says what a run would cost at most) and `consensus_run` (asks the real Jev, with no ceiling on its calls; refuses only without the key). Nothing here executes an order, restarts anything or changes the live agent: a receipt is a recommendation and says so. This file is the pure handler; `scripts/jev-consensus-mcp.ts` is
 * the stdio loop around it.
 */
import { DISCLAIMER, type DecisionSpec, type Receipt } from "./engine";
import { parseSpec, planOf, type Plan } from "./spec";

export interface McpDeps {
  /** Whether the provider key is present. Only a boolean: the key never passes through this handler. */
  readonly hasKey: () => boolean;
  /** Runs the decision against the real Jev; `maxCalls` is optional and, when left out, there is no ceiling. */
  readonly run: (spec: DecisionSpec, maxCalls: number | undefined) => Promise<{ readonly receipt: Receipt; readonly meter: unknown }>;
}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

const SPEC_SCHEMA = {
  type: "object",
  description: "The decision: an id, the goal, sanitized facts, the rails (limits that must not be crossed), two to eight options and, optionally, option ids the code forbids and the unknown facts to ask the person about. No address, key or secret.",
  properties: {
    id: { type: "string" },
    goal: { type: "string" },
    facts: { type: "object" },
    rails: { type: "array", items: { type: "string" } },
    options: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, what: { type: "string" } }, required: ["id", "label", "what"] } },
    forbidden: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "object", properties: { id: { type: "string" }, ask: { type: "string" } }, required: ["id", "ask"] } },
  },
  required: ["id", "goal", "facts", "rails", "options"],
} as const;

export const TOOLS = [
  { name: "consensus_plan", description: "Checks a decision spec and says the most questions and input tokens a consensus run could use. Free: no key, no network.", inputSchema: { type: "object", properties: { spec: SPEC_SCHEMA }, required: ["spec"] } },
  {
    name: "consensus_run",
    description: "Asks the real Jev, in rounds and in several framings, which option to implement, until its answers agree in two consecutive rounds, or says there is no consensus and what to ask the person. No ceiling on its calls: the owner pays for the Jev. The result is a recommendation with a receipt; it authorizes nothing.",
    inputSchema: { type: "object", properties: { spec: SPEC_SCHEMA, max_calls: { type: "integer", minimum: 1 } }, required: ["spec"] },
  },
] as const;

const reply = (id: unknown, result: unknown): Json => ({ jsonrpc: "2.0", id, result });
const failure = (id: unknown, code: number, message: string): Json => ({ jsonrpc: "2.0", id, error: { code, message } });
const content = (value: unknown, isError = false): Json => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) });
const coded = (error: unknown): string => (error instanceof Error ? error.message.slice(0, 200) : "erro");

/** One JSON-RPC message in, the response out; null for a notification (nothing is sent back). Never throws. */
export async function handleMessage(message: unknown, deps: McpDeps): Promise<Json | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") return failure(isRecord(message) ? (message.id ?? null) : null, -32600, "pedido invalido");
  const { id, method } = message as { id?: unknown; method: string };
  const params = isRecord(message.params) ? message.params : {};
  if (id === undefined) return null;
  try {
    if (method === "initialize") return reply(id, { protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "jev-consensus", version: "0.1.0" } });
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools: TOOLS });
    if (method !== "tools/call") return failure(id, -32601, `metodo desconhecido: ${method}`);
    const args = isRecord(params.arguments) ? params.arguments : {};
    if (params.name === "consensus_plan") {
      const spec = parseSpec(args.spec);
      const plan: Plan = planOf(spec);
      return reply(id, content({ specId: spec.id, ...plan, note: "a bound, not a prediction; nothing was sent" }));
    }
    if (params.name === "consensus_run") {
      if (!deps.hasKey()) return reply(id, content({ refused: "chave do provedor ausente no ambiente do servidor" }, true));
      const spec = parseSpec(args.spec);
      const cap = typeof args.max_calls === "number" && Number.isInteger(args.max_calls) && args.max_calls >= 1 ? args.max_calls : undefined;
      const { receipt, meter } = await deps.run(spec, cap);
      return reply(id, content({ receipt, meter, disclaimer: DISCLAIMER }));
    }
    return reply(id, content({ refused: `ferramenta desconhecida: ${String(params.name)}` }, true));
  } catch (error) {
    return reply(id, content({ error: coded(error) }, true));
  }
}
