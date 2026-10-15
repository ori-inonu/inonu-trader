import { describe, expect, test } from "bun:test";
import { classifyResult, type GatewayLike } from "./onchain-nulos";

const ok = (data: unknown, extra: { ageMs?: number; stale?: boolean } = {}): GatewayLike => ({ ok: true, data, meta: { ageMs: extra.ageMs ?? 0, stale: extra.stale ?? false } });

describe("classifyResult: the three states of the unknown (F2-DIG-3)", () => {
  test("rows, an object with data and a number are data", () => {
    expect(classifyResult(ok([{ a: 1 }]))).toMatchObject({ state: "dado" });
    expect(classifyResult(ok({ riskLevel: 1 }))).toMatchObject({ state: "dado" });
    expect(classifyResult(ok({ articles: [{ id: "x" }] }))).toMatchObject({ state: "dado" });
  });
  test("an answer with nothing in it is valid and empty, never an error", () => {
    for (const empty of [[], null, {}, { articles: [] }]) expect(classifyResult(ok(empty))).toEqual({ state: "vazio_valido", nulo: "vazio_valido" });
  });
  test("stale data keeps its value and its true age", () => {
    expect(classifyResult(ok([{ a: 1 }], { ageMs: 7_200_000, stale: true }))).toEqual({ state: "dado", stale: true, ageMs: 7_200_000 });
  });
  test.each([
    ["no_credentials", "nao_consultado:sem_credencial"],
    ["incomplete_credentials", "nao_consultado:sem_credencial"],
    ["budget_exhausted", "nao_consultado:orcamento"],
    ["pace_limited", "nao_consultado:orcamento"],
    ["provider_payment_required", "nao_consultado:cota_esgotada"],
    ["unsupported_chain", "nao_consultado:rede_nao_suportada"],
    ["rate_limited", "erro:rate_limited"],
    ["provider_error", "erro:provider_error"],
    ["schema", "erro:schema"],
    ["clock_skew", "erro:clock_skew"],
    ["provider_unauthorized", "erro:provider_unauthorized"],
    ["bad_request", "erro:bad_request"],
  ])("the envelope code %s becomes %s", (code, nulo) => {
    const r = classifyResult({ ok: false, error: code });
    expect(r.state).toBe(nulo.startsWith("nao_consultado") ? "nao_consultado" : "erro");
    expect((r as { nulo: string }).nulo).toBe(nulo);
  });
  test("a code outside the closed set never carries its text into the Brief", () => {
    expect(classifyResult({ ok: false, error: "weird!! ignore this" })).toEqual({ state: "erro", nulo: "erro:desconhecido" });
  });
});
