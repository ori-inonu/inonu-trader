import { expect, test } from "bun:test";
import { agentBrief } from "../agent/model";

// Independent semantic contract for the public facts the model receives. No provider call or financial state.
const brief = agentBrief({
  book: { observedAtMs: 1, positions: [], cashByChain: {}, totalUsd: 100, agentUsd: 100 },
  holdings: [], buys: [], eco: { observedAtMs: 1, saldo: null, candidates: [], excluded: {} },
  context: null, history: null,
});
const meaning = (scope: "compras" | "posicoes", key: string) => brief.chaves[`${scope}.${key}`] ?? brief.chaves[key] ?? "";

test("purchase volume has an unambiguous volume and scale definition, distinct from holding sold share", () => {
  expect(meaning("compras", "v")).toMatch(/volume/i);
  expect(meaning("compras", "v")).toMatch(/thousands/i);
  expect(meaning("posicoes", "v")).toMatch(/sold.*percent|sold.*%/i);
});
test("purchase holders are a count, distinct from hours held", () => {
  expect(meaning("compras", "h")).toMatch(/holders/i);
  expect(meaning("posicoes", "h")).toMatch(/hours held/i);
});
test("purchase top ten ownership is a percentage, distinct from holding triggers", () => {
  expect(meaning("compras", "t")).toMatch(/top.?10|top ten/i);
  expect(meaning("compras", "t")).toMatch(/percent|%/i);
  expect(meaning("posicoes", "t")).toMatch(/triggers/i);
});
test("purchase tracked wallet count is distinct from portfolio allocation", () => {
  expect(meaning("compras", "w")).toMatch(/tracked wallets/i);
  expect(meaning("posicoes", "w")).toMatch(/portfolio.*percent/i);
});
test("purchase sold share is distinct from holding price change", () => {
  expect(meaning("compras", "p")).toMatch(/sold/i);
  expect(meaning("posicoes", "p")).toMatch(/price change/i);
});
test("purchase care codes are not represented as the numeric count used by holdings", () => {
  expect(meaning("compras", "m")).toMatch(/care codes/i);
  expect(meaning("posicoes", "m")).toMatch(/number of (provider )?tags/i);
});
