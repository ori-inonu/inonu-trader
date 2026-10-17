import { expect, test } from "bun:test";
import { createJevAgentModel, type AgentBrief } from "../agent/model";
import type { Candidate } from "../agent/types";

test("an account rate limit is not retried immediately as a supposed facets incompatibility", async () => {
  const error = Object.assign(new Error("rate limited"), { statusCode: 429, responseHeaders: { "retry-after": "1" } });
  let calls = 0;
  const model = createJevAgentModel({
    apiKey: () => "synthetic-do-not-call-provider", createProvider: () => ({ evaluationModel: () => ({}) as never }),
    evaluate: (async () => { calls++; throw error; }) as never
  });
  const candidate: Candidate = {
    id: "hold:synthetic@agente", kind: "holding", symbol: "SYNTH", chainIndex: "501", address: "5".repeat(44), heldUsd: 10,
    stances: ["hold", "exit_all"], usdByStance: { hold: 0, exit_all: 10 }, wallet: "agente", profiles: [], plan: null, timing: null, facts: null, families: [], marks: [], triggers: []
  };
  const brief: AgentBrief = { v: 1, carteira: { caixa: 50, agente: 100, principal: 0, posicoes: 1 }, chaves: {}, posicoes: {}, compras: {}, contexto: null, historico: null, mandato: null };
  await expect(model.choose({ brief, candidates: [candidate], signal: new AbortController().signal, admitFallback: () => { } })).rejects.toThrow("rate limited");
  expect(calls).toBe(1);
});
