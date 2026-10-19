import { TOOLS, type McpDeps } from "../../src/consensus/mcp";
import { assertNoSensitiveText, specFingerprint, type DecisionSpec } from "../../src/consensus/engine";
import { parseSpec, planOf } from "../../src/consensus/spec";
import { enforceCallLimit } from "./core";

export const MAX_REQUEST_LINE_BYTES = 1024 * 1024;
export type LineEvent = { type: "line"; value: string } | { type: "oversized" };

export class JsonRpcLineDecoder {
  private decoder = new TextDecoder();
  private buffer = "";
  private bytes = 0;
  private discarding = false;

  push(chunk: Uint8Array): LineEvent[] { return this.consume(this.decoder.decode(chunk, { stream: true })); }
  finish(): LineEvent[] {
    const events = this.consume(this.decoder.decode(new Uint8Array()));
    if (this.discarding) events.push({ type: "oversized" });
    else if (this.bytes > 0) events.push({ type: "line", value: this.buffer.replace(/\r$/, "") });
    this.buffer = ""; this.bytes = 0; this.discarding = false;
    return events;
  }
  private consume(text: string): LineEvent[] {
    const events: LineEvent[] = [];
    let start = 0;
    while (start < text.length) {
      const newline = text.indexOf("\n", start), end = newline < 0 ? text.length : newline;
      const segment = text.slice(start, end), segmentBytes = Buffer.byteLength(segment);
      if (!this.discarding && this.bytes + segmentBytes > MAX_REQUEST_LINE_BYTES) { this.buffer = ""; this.bytes = 0; this.discarding = true; }
      if (!this.discarding) { this.buffer += segment; this.bytes += segmentBytes; }
      if (newline >= 0) {
        if (this.discarding) events.push({ type: "oversized" });
        else events.push({ type: "line", value: this.buffer.replace(/\r$/, "") });
        this.buffer = ""; this.bytes = 0; this.discarding = false;
        start = newline + 1;
      } else start = text.length;
    }
    return events;
  }
}

const safeId = (id: unknown) => {
  if (id === null || (typeof id === "number" && Number.isSafeInteger(id))) return id;
  if (typeof id !== "string" || id.length > 40 || !/^[A-Za-z0-9_.:/-]+$/.test(id)) return null;
  try { assertNoSensitiveText(id, "rpc id"); return id; } catch { return null; }
};
const isRecord = (value: unknown): value is Record<string, any> => typeof value === "object" && value !== null && !Array.isArray(value);
function successfulPlan(response: unknown, id: unknown, spec: DecisionSpec): boolean {
  if (!isRecord(response) || response.jsonrpc !== "2.0" || response.id !== id || "error" in response || !isRecord(response.result)) return false;
  const result = response.result;
  if ((result.isError !== undefined && result.isError !== false) || !Array.isArray(result.content) || result.content.length !== 1) return false;
  const item = result.content[0];
  if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") return false;
  try {
    const value = JSON.parse(item.text), expected = planOf(spec);
    return isRecord(value) && value.specId === spec.id && value.plannedCalls === expected.plannedCalls && value.estimatedInputTokens === expected.estimatedInputTokens && JSON.stringify(value.policy) === JSON.stringify(expected.policy);
  } catch { return false; }
}
export type McpHandler = (message: unknown, deps: McpDeps) => Promise<unknown | null>;
export async function serveMcp(input: AsyncIterable<Uint8Array>, write: (value: unknown) => void, deps: McpDeps, handler: McpHandler, tools: readonly any[] = TOOLS): Promise<void> {
  const decoder = new JsonRpcLineDecoder();
  let plannedSpecHash: string | null = null;
  const specHash = (raw: unknown) => specFingerprint(parseSpec(raw));
  const send = (value: unknown) => { try { write(value); } catch { try { write({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "internal error" } }); } catch {} } };
  const processLine = async (line: LineEvent) => {
    if (line.type === "oversized") { send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "request line exceeds 1 MiB" } }); return; }
    if (!line.value.trim()) return;
    let message: any;
    try { message = JSON.parse(line.value); }
    catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); return; }
    if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string" || "result" in message || "error" in message ||
      (message.id !== undefined && safeId(message.id) !== message.id) ||
      (message.params !== undefined && !isRecord(message.params) && !Array.isArray(message.params))) {
      send({ jsonrpc: "2.0", id: safeId(message?.id), error: { code: -32600, message: "invalid request" } }); return;
    }
    if (message.id === undefined) return;
    // Only tokens validated from this request, plus its calculated fingerprint,
    // may survive the general detail redaction (including nested content.text).
    const trusted = new Set<string>();
    const rpcId = safeId(message?.id);
    try {
      const spec = parseSpec(message?.params?.arguments?.spec);
      for (const id of [spec.id, ...spec.options.map((o) => o.id), ...(spec.unknowns ?? []).map((u) => u.id)]) trusted.add(id);
      trusted.add(specFingerprint(spec));
    } catch {}
    const redact = (value: unknown) => {
      const redacted = JSON.parse(JSON.stringify(value).replace(/(?:sk-[A-Za-z0-9]{8,}|\b[A-Za-z0-9_-]{24,}\b)/g, (token) => trusted.has(token) ? token : "[redacted]"));
      if (isRecord(value) && value.jsonrpc === "2.0" && value.id === message.id) redacted.id = rpcId;
      return redacted;
    };
    try {
      if (message?.method === "tools/list" && message.id !== undefined) { send({ jsonrpc: "2.0", id: safeId(message.id), result: { tools } }); return; }
      if (message?.method === "tools/call" && message?.params?.name === "consensus_plan") {
        plannedSpecHash = null;
        const spec = parseSpec(message.params.arguments?.spec);
        const planned = await handler(message, deps);
        if (message.id !== undefined && successfulPlan(planned, message.id, spec)) plannedSpecHash = specHash(spec);
        if (planned !== null) send(redact(planned));
        return;
      }
      if (message?.method === "tools/call" && message?.params?.name === "consensus_run") {
        try {
          const checked = enforceCallLimit(message.params.arguments?.spec, message.params.arguments?.max_calls);
          const fingerprint = specFingerprint(checked.parsed);
          if (plannedSpecHash !== fingerprint) throw new Error("consensus_plan deve preceder consensus_run com a mesma spec");
          plannedSpecHash = null;
        }
        catch (error) { const reason = error instanceof Error ? error.message.replace(/(?:sk-[A-Za-z0-9]{8,}|\b[A-Za-z0-9_-]{24,}\b)/g, "[redacted]").slice(0, 200) : "invalid run"; send({ jsonrpc: "2.0", id: safeId(message.id), result: { content: [{ type: "text", text: JSON.stringify({ refused: reason }) }], isError: true } }); return; }
      }
      const response = await handler(message, deps);
      if (response !== null) send(redact(response));
    } catch { send({ jsonrpc: "2.0", id: safeId(message?.id), error: { code: -32603, message: "internal error" } }); }
  };
  for await (const chunk of input) for (const event of decoder.push(chunk)) await processLine(event);
  for (const event of decoder.finish()) await processLine(event);
}
