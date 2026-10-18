import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { BUY_FACETS, FACET_MAX_CANDIDATES, HOLDING_FACETS, facetQuestions, readFacets } from "./facets";
import type { Candidate } from "./types";

const candidate = (over: Partial<Candidate>): Candidate => ({
  id: "buy:token:501:So11111111111111111111111111111111111111112",
  kind: "buy",
  symbol: "NEAR",
  chainIndex: "501",
  address: "So11111111111111111111111111111111111111112",
  heldUsd: 0,
  stances: ["skip"],
  usdByStance: { skip: 0 },
  facts: null,
  triggers: [],
  families: [],
  marks: [],
  wallet: "agente",
  profiles: [],
  plan: null,
  timing: null,
  ...over,
});
const holding = (over: Partial<Candidate> = {}): Candidate => candidate({ id: "hold:token:501:Pedro1111111111111111111111111111111111111@agente", kind: "holding", symbol: "Pedro", stances: ["hold", "exit_all"], ...over });

describe("the facets: one narrow yes or no judgment per property, asked next to the stance and only RECORDED", () => {
  test("a purchase and a holding get their own facets, each a boolean question that names the token and its id", () => {
    const list = [holding(), candidate({})];
    const q = facetQuestions(list) as Record<string, { type: string; instructions: string }>;
    const keys = Object.keys(q);
    expect(keys).toEqual([...HOLDING_FACETS.map((f) => `facet_0_${f}`), ...BUY_FACETS.map((f) => `facet_1_${f}`)]);
    for (const question of Object.values(q)) {
      expect(question.type).toBe("boolean");
      expect(typeof question.instructions).toBe("string");
    }
    expect(q[`facet_0_${HOLDING_FACETS[0]}`]!.instructions).toContain("Pedro");
    expect(q[`facet_0_${HOLDING_FACETS[0]}`]!.instructions).toContain(list[0]!.id);
    expect(q[`facet_1_${BUY_FACETS[0]}`]!.instructions).toContain("NEAR");
    expect(q[`facet_1_${BUY_FACETS[0]}`]!.instructions).toContain(list[1]!.id);
  });

  test("every question is phrased so that a high value means yes, and carries no instruction to act", () => {
    const q = facetQuestions([holding(), candidate({})]) as Record<string, { instructions: string }>;
    for (const question of Object.values(q)) {
      expect(question.instructions.endsWith("?")).toBe(true);
      expect(question.instructions).not.toMatch(/\b(not|never|free of)\b/i);
      expect(question.instructions).not.toMatch(/\b(should|must|recommend)\b/i);
    }
  });

  test("the number of candidates asked about is bounded, holdings first, so the questions do not grow with the pool", () => {
    const many = [holding(), holding({ id: "hold:b", symbol: "B" }), ...Array.from({ length: 12 }, (_, i) => candidate({ id: `buy:t${i}`, symbol: `T${i}` }))];
    const keys = Object.keys(facetQuestions(many));
    const asked = new Set(keys.map((k) => k.split("_")[1]));
    expect(asked.size).toBe(FACET_MAX_CANDIDATES);
    expect(asked.has("0")).toBe(true);
    expect(asked.has("1")).toBe(true);
  });

  test("the answers come back by candidate id, rounded to two places", () => {
    const list = [holding(), candidate({})];
    const answers = {
      [`facet_0_${HOLDING_FACETS[0]}`]: { type: "boolean", probability: 0.8149 },
      [`facet_1_${BUY_FACETS[0]}`]: { type: "boolean", probability: 0.2 },
      [`facet_1_${BUY_FACETS[1]}`]: { type: "boolean", probability: 1 },
    };
    expect(readFacets(answers, list)).toEqual({
      [list[0]!.id]: { [HOLDING_FACETS[0]]: 0.81 },
      [list[1]!.id]: { [BUY_FACETS[0]]: 0.2, [BUY_FACETS[1]]: 1 },
    });
  });

  test("an answer that is missing, not a number or outside 0 to 1 is left out: a facet is a record, never a reason to fail the decision", () => {
    const list = [candidate({})];
    const answers = {
      [`facet_0_${BUY_FACETS[0]}`]: { type: "boolean", probability: Number.NaN },
      [`facet_0_${BUY_FACETS[1]}`]: { type: "boolean", probability: 1.4 },
      [`facet_0_${BUY_FACETS[2]}`]: { type: "boolean", probability: "0.5" },
      [`facet_0_${BUY_FACETS[3]}`]: null,
      [`facet_0_${BUY_FACETS[4]}`]: { type: "boolean", probability: 0.6 },
    };
    expect(readFacets(answers as never, list)).toEqual({ [list[0]!.id]: { [BUY_FACETS[4]]: 0.6 } });
    expect(readFacets(undefined, list)).toEqual({});
    expect(readFacets({}, list)).toEqual({});
  });

  test("the module reads and computes: no network, disk, clock, process or model", () => {
    const source = readFileSync(new URL("./facets.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\b(fetch|Bun\.|process\.|node:fs|Date\.now|setTimeout)\b/);
  });
});
