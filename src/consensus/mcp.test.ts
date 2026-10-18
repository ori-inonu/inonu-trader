import { describe, expect, test } from "bun:test";
import { DISCLAIMER, type DecisionSpec, type Receipt } from "./engine";
import { handleMessage, TOOLS, type McpDeps } from "./mcp";
import { parseSpec, planOf } from "./spec";

const raw = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "d1",
  goal: "Choose which improvement goes to the next release.",
  facts: { skipShare: 0.93, clockMinutes: 2 },
  rails: ["Never place an order from here."],
  options: [
    { id: "A", label: "Hot interval", what: "Look every minute within the daily cap." },
    { id: "B", label: "Outcome recorder", what: "Keep the price path of every offered purchase." },
  ],
  ...over,
});

const receipt: Receipt = {
  v: 1, specId: "d1", specHash: "h", status: "consenso", leader: "B", implement: true, removedByCode: [], rounds: [], askUser: null, calls: { asked: 9, failed: 0 },
  policy: {} as never, disclaimer: DISCLAIMER,
};
const deps = (over: Partial<McpDeps> = {}): McpDeps => ({ hasKey: () => true, run: async () => ({ receipt, meter: { sent: 9 } }), ...over });
const call = (name: string, args: Record<string, unknown>, d: McpDeps = deps()) => handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, d) as Promise<any>;
const text = (r: any): any => JSON.parse(r.result.content[0].text);

describe("a spec from outside is checked strictly before it reaches the engine", () => {
  test("an ordinary spec is accepted", () => {
    expect(parseSpec(raw()).options.map((o) => o.id)).toEqual(["A", "B"]);
  });

  test("fewer than two options is refused", () => {
    expect(() => parseSpec(raw({ options: [{ id: "A", label: "a", what: "a" }] }))).toThrow("spec_invalida");
  });

  test("a fact that is not a plain value is refused", () => {
    expect(() => parseSpec(raw({ facts: { nested: { a: 1 } } }))).toThrow("spec_invalida");
  });

  test("an address hidden in a fact is refused as sensitive", () => {
    expect(() => parseSpec(raw({ facts: { w: "0xb76960373c7309ca1d341bd65d9a78abb2395171" } }))).toThrow("dado_sensivel");
  });

  test("the cost is known before any question: calls and input tokens, as a bound", () => {
    const plan = planOf(parseSpec(raw()));
    expect([plan.plannedCalls > 0, plan.estimatedInputTokens > plan.plannedCalls * 400]).toEqual([true, true]);
  });
});

describe("the sequential decisions answer as an MCP server, and the paid part needs an explicit yes", () => {
  test("it lists two tools: the free plan and the paid run", async () => {
    const r = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, deps())) as any;
    expect(r.result.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });

  test("initialize answers with the tools capability and its name", async () => {
    const r = (await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }, deps())) as any;
    expect([r.result.serverInfo.name, "tools" in r.result.capabilities]).toEqual(["jev-consensus", true]);
  });

  test("a notification gets no answer", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps())).toBeNull();
  });

  test("an unknown method is an error of the protocol, not a crash", async () => {
    const r = (await handleMessage({ jsonrpc: "2.0", id: 4, method: "nope" }, deps())) as any;
    expect(r.error.code).toBe(-32601);
  });

  test("the plan tool needs no key and sends nothing", async () => {
    let ran = 0;
    const r = await call("consensus_plan", { spec: raw() }, deps({ hasKey: () => false, run: async () => (ran++, { receipt, meter: {} }) }));
    expect([text(r).plannedCalls > 0, ran]).toEqual([true, 0]);
  });

  test("the paid run needs no yes flag and no cap: it runs with the key alone", async () => {
    let ran = 0;
    const r = await call("consensus_run", { spec: raw() }, deps({ run: async () => (ran++, { receipt, meter: {} }) }));
    expect([r.result.isError, ran]).toEqual([undefined, 1]);
  });

  test("the paid run is refused without the key in the environment of the server", async () => {
    const r = await call("consensus_run", { spec: raw() }, deps({ hasKey: () => false }));
    expect(text(r).refused).toContain("chave");
  });

  test("with the key, the receipt comes back with the disclaimer", async () => {
    const r = await call("consensus_run", { spec: raw() });
    expect([text(r).receipt.status, text(r).disclaimer]).toEqual(["consenso", DISCLAIMER]);
  });

  test("a ceiling is handed to the run only when the caller gives one; otherwise there is none", async () => {
    const seen: Array<number | undefined> = [];
    const run = async (_s: DecisionSpec, cap: number | undefined) => (seen.push(cap), { receipt, meter: {} });
    await call("consensus_run", { spec: raw(), max_calls: 7 }, deps({ run }));
    await call("consensus_run", { spec: raw() }, deps({ run }));
    expect(seen).toEqual([7, undefined]);
  });

  test.each([0, -3, 2.5, "5", null])("a max_calls that is given but is not a positive integer (%p) is refused, never silently dropped to no ceiling", async (bad) => {
    let ran = 0;
    const r = await call("consensus_run", { spec: raw(), max_calls: bad }, deps({ run: async () => (ran++, { receipt, meter: {} }) }));
    expect([text(r).refused, ran]).toEqual(["max_calls, se informado, deve ser inteiro positivo", 0]);
  });

  test("a bad spec comes back as an error result with a code, never as an exception", async () => {
    const r = await call("consensus_plan", { spec: { id: "x" } });
    expect([r.result.isError, text(r).error]).toEqual([true, "spec_invalida: options (de 2 a 8)"]);
  });
});
