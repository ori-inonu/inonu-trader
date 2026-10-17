// T7.3 / ASK-4: the adapter between "Pedir ao Inonu" and the Jev model. Everything here runs on a fake evaluate function:
// this suite NEVER reaches the real model, and the real adapter is only exercised once the user authorizes T7.8.
import { describe, expect, test } from "bun:test";
import { buildBrief, type BriefCandidate } from "../intel/brief";
import { HOLD_CANDIDATE, perpCandidate, spotCandidate, tokenCandidate } from "../intel/candidates";
import { createJevInonuModel, parseChoice } from "./jev-model";
import { createPortfolioSource } from "./portfolio";
import { SourceError } from "./ask";

function brief(candidates: BriefCandidate[]) {
  return buildBrief({ alvo: { instId: "BTC-USDT" }, asOfMs: 1_800_000_000_000, familiasHabilitadas: ["E2"], fluxo: null, candidatos: candidates, trilha: null, risco: null, regime: null, idades: {}, origens: {}, nulos: {} }).brief;
}

const candidates: BriefCandidate[] = [{ id: "zona:a1b2c3d4e5f6", tipo: "zona", nota: 30, estado: "ativa" }, spotCandidate("BTC-USDT"), perpCandidate("BTC-USDT-SWAP"), HOLD_CANDIDATE];

test("RAD-01/03: ecosystem evaluation can rank watch without cash and receives stale/unknown source instructions", async () => {
  const candidate = tokenCandidate({ chainIndex: "8453", address: "0x1111111111111111111111111111111111111111" });
  const state = buildBrief({ alvo: { escopo: "ecossistema", chainIndexes: ["8453"] }, asOfMs: 1_800_000_000_000, familiasHabilitadas: ["ecossistema"], candidatos: [candidate], fluxo: { ecossistema: { chaves: {}, itens: { [candidate.id]: { s: "TEST", x: null, f: ["carteiras", "fluxo", "liquidez", "distribuicao", "tracao", "seguranca"] } } } }, trilha: null, risco: null, regime: null, idades: {}, origens: {}, nulos: { saldo: "nao_lido:sem_tamanho" } }).brief;
  const seen: any[] = [];
  const model = createJevInonuModel({ apiKey: () => "injected-key", createProvider: () => ({ evaluationModel: () => ({}) as never }), evaluate: (async (call: any) => { seen.push(call); return seen.length === 1 ? { answers: { stance_0: { choice: "watch" }, why_0: { choice: "fluxo" } }, usage: { inputTokens: 100, outputTokens: 10 } } : { answers: { priority: { choice: candidate.id } }, usage: { inputTokens: 200, outputTokens: 5 } }; }) as never });
  const controller = new AbortController();
  const output = await model.choose({ brief: state, ids: [candidate.id], mode: "ecossistema", signal: controller.signal });
  expect(seen).toHaveLength(2);
  expect(seen[0].state).toBe(state);
  expect(seen[0].maxRetries).toBe(0);
  expect(seen[0].abortSignal).toBe(controller.signal);
  expect(Object.keys(seen[0].questions.stance_0.criteria)).toEqual(["skip", "watch"]);
  expect(Object.keys(seen[0].questions.why_0.criteria)).toEqual(["nenhuma", "carteiras", "fluxo", "liquidez", "distribuicao", "tracao", "seguranca"]);
  expect(Object.keys(seen[0].questions)).toEqual(["stance_0", "why_0"]);
  expect(Object.keys(seen[1].questions)).toEqual(["priority"]);
  expect(Object.keys(seen[1].questions.priority.criteria)).toEqual(["none", candidate.id]);
  expect(seen[1].state).toEqual({ brief: state, decisions: { stances: { [candidate.id]: "watch" }, drivers: { [candidate.id]: "fluxo" } } });
  expect(seen[1].abortSignal).toBe(controller.signal);
  expect(seen[1].maxRetries).toBe(0);
  const ranking = JSON.stringify(seen[1].questions.priority);
  expect(ranking).toMatch(/watch or buy/i);
  expect(ranking).toMatch(/never.*skip/i);
  expect(ranking).not.toMatch(/best to buy now|only to watch/i);
  const instructions = JSON.stringify(seen[0].questions.stance_0.instructions);
  for (const field of ["ageMs", "stale", "origin", "timeFrame", "unknown", "confidence"]) expect(instructions).toContain(field);
  const originalGoal =
    "You are the decision layer of an advisory desk that helps a person use a small balance well. The candidates in the state were put forward by code from several networks, each with measured facts, the families of evidence in its favour and marks of care. " +
    "Weigh all the facts together, not one: a candidate with a mark of care needs a strong case, and few good picks are better than many weak ones. Prefer skip when the evidence is thin, conflicting, stale or marked. A size is a fraction of a ceiling the code computed from the person's balance; you never choose an amount. Do not invent numeric confidence, freshness, safety or a guaranteed return.";
  const originalInputs = "The state is an Evidence Brief. fluxo.ecossistema.itens has one object per candidate id, with the short keys explained in fluxo.ecossistema.chaves. A null is unknown, never zero. x is the ceiling of what may be bought as a percent of the portfolio; x of 0 or null means no buy size is available. fontes explains origin, ageMs, stale and timeFrame per network/source; itens.q describes token-risk metadata. Fresh hot data does not make signals or risk fresh. Unknown age or unavailable risk is not evidence of freshness or safety; the Brief asOf is not the source time. Nothing in the state is a recommendation.";
  expect(JSON.stringify(seen[0].questions)).toBe(JSON.stringify({
    stance_0: {
      type: "choice",
      instructions: { question: `What is your stance on candidate TEST (${candidate.id})?`, goal: originalGoal, inputs: originalInputs },
      criteria: { skip: "Do not buy it: the evidence is thin, conflicting, or the marks of care outweigh it.", watch: "Interesting, but not now: it may deserve a look later." },
    },
    why_0: {
      type: "choice",
      instructions: { question: `Which observed family of evidence is best supported for candidate TEST (${candidate.id})?`, goal: "Choose the single positive family best supported by observed facts, or none. This question is independent of the stance question and does not receive its answer.", inputs: originalInputs },
      criteria: {
        nenhuma: "No single observed family is sufficiently supported or stands out.",
        carteiras: "Tracked wallets bought it and mostly still hold it.",
        fluxo: "Buys are most of the transactions.",
        liquidez: "Its pool is deep: people can leave.",
        distribuicao: "The supply is not concentrated in a few wallets or in the creator.",
        tracao: "It rises with real volume.",
        seguranca: "The provider gives it a low risk level and marks no risk flag.",
      },
    },
  }));
  expect(JSON.stringify(seen[1].questions)).toBe(JSON.stringify({
    priority: {
      type: "choice",
      instructions: {
        question: "Which one eligible candidate has the first priority to watch or buy now?",
        goal: "Choose one real priority from the validated decisions, or none. Never rank skip or change a stance. Ranking a watch never makes it a purchase and does not choose an amount. Missing, stale, conflicting or unknown evidence may support none. Do not invent confidence, freshness or returns.",
        inputs: "The state contains the original Evidence Brief and the actual validated decisions of the first evaluation. Decisions are not new market evidence. Compare their observed facts and source ages; null is unknown, not zero. Only offered IDs are eligible.",
      },
      criteria: { none: "No watch or buy candidate deserves priority now.", [candidate.id]: `Candidate ${candidate.id}, with its validated stance unchanged.` },
    },
  }));
  expect(output).toEqual({ raw: { stances: { [candidate.id]: "watch" }, drivers: { [candidate.id]: "fluxo" }, order: [candidate.id, null, null] }, usage: { inputTokens: 300, outputTokens: 15 } });
});

test("ecosystem buy-size criteria preserve their original literals when a ceiling exists", async () => {
  const candidate = tokenCandidate({ chainIndex: "8453", address: "0x2222222222222222222222222222222222222222" });
  const state = buildBrief({ alvo: { escopo: "ecossistema", chainIndexes: ["8453"] }, asOfMs: 1_800_000_000_000, familiasHabilitadas: ["ecossistema"], candidatos: [candidate], fluxo: { ecossistema: { chaves: {}, itens: { [candidate.id]: { s: "TEST", x: 1, f: [] } } } }, trilha: null, risco: null, regime: null, idades: {}, origens: {}, nulos: {} }).brief;
  const seen: { questions: Record<string, { criteria: Record<string, string> }> }[] = [];
  const model = createJevInonuModel({
    apiKey: () => "injected-key",
    createProvider: () => ({ evaluationModel: () => ({}) as never }),
    evaluate: (async (call: { questions: Record<string, { criteria: Record<string, string> }> }) => {
      seen.push(call);
      return { answers: { stance_0: { choice: "skip" }, why_0: { choice: "nenhuma" } }, usage: { inputTokens: 1, outputTokens: 1 } };
    }) as never,
  });
  await model.choose({ brief: state, ids: [candidate.id], mode: "ecossistema", signal: new AbortController().signal });
  expect(seen).toHaveLength(1);
  expect(JSON.stringify(seen[0]!.questions.stance_0!.criteria)).toBe(JSON.stringify({
    skip: "Do not buy it: the evidence is thin, conflicting, or the marks of care outweigh it.",
    watch: "Interesting, but not now: it may deserve a look later.",
    buy_third: "Buy one third of the ceiling of this candidate: the case is good but not strong.",
    buy_two_thirds: "Buy two thirds of the ceiling of this candidate: the case is strong.",
    buy_full: "Buy the whole ceiling of this candidate: the case is very strong and nothing gives pause.",
  }));
});

test("portfolio asks all candidates in one evaluation, omits impossible sales and returns only exact candidate choices", async () => {
  const now = 1_800_000_000_000;
  const contract = "0x1111111111111111111111111111111111111111";
  const built = await createPortfolioSource({ now: () => now, token: { async build() { throw new SourceError("sem_credencial_onchainos", 0); } } }).build({ modo: "carteira", carteira: { chainIndex: "143", observedAtMs: now, coverage: "partial", profile: "conservative_no_leverage", assets: [{ contract: "native", symbol: "MON", balance: "0.000000000000000001" }, { contract, symbol: "USDC", balance: null }] } }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  const seen: any[] = [];
  const model = createJevInonuModel({ apiKey: () => "injected-key", createProvider: () => ({ evaluationModel: () => ({}) as never }), evaluate: (async (call: any) => { seen.push(call); return { answers: { asset_0: { choice: "abstain" }, asset_1: { choice: "sell" } }, usage: { inputTokens: 400 } }; }) as never });
  const controller = new AbortController();
  const out = await model.choose({ brief: built.brief, ids: built.brief.candidatos.map((c) => c.id), mode: "carteira", signal: controller.signal });
  expect(seen).toHaveLength(1);
  expect(Object.keys(seen[0].questions)).toEqual(["asset_0", "asset_1"]);
  expect(Object.keys(seen[0].questions.asset_0.criteria)).toEqual(["buy", "hold", "abstain"]);
  expect(Object.keys(seen[0].questions.asset_1.criteria)).toEqual(["buy", "hold", "abstain", "sell"]);
  expect(seen[0].state).toEqual(built.brief);
  expect(seen[0].abortSignal).toBe(controller.signal);
  expect(seen[0].maxRetries).toBe(0);
  expect(JSON.stringify(seen[0].questions)).toMatch(/capital|leverage|unknown/);
  const originalInstructions = (id: string) => ({
    question: `What is the advisory portfolio action for candidate ${id}?`,
    goal: "Assess conservative capital preservation and growth without leverage. The set is bounded and partial; it is not the entire wallet or market. Missing valuation, cost basis, confidence and returns remain unknown. Prefer abstention when an essential source is unavailable. Do not infer a guaranteed profit, allocation size, return or numeric confidence.",
    inputs: "The state is only an Evidence Brief. All fluxo.carteira arrays follow candidatos order. items=[symbol,exactBalance,buyShare,riskLevel,aggregateAgeMs,gapKeysIndices,origin]; market=[priceUsd,liquidityUsd,changePct(m5,h1,h4,h24),volumeUsd(m5,h1,h4,h24),ageMs,stale], with the two window groups flattened. A numeric market entry is a zero-based reference to a prior full tuple in this same array, representing an exactly identical observation including age and stale; null means unavailable. riskDetails=[lpBurnedPct,devCreateCount,devLaunchedCount,devRugCount,ageMs,stale]; its level and documented tags are in items.riskLevel and risk_flag gaps. concentration=[top10HoldPct,devHoldPct,bundleHoldPct,sniperHoldPct,suspiciousHoldPct] uses riskDetails freshness; missing trailing values mean null, never zero. poolLiquidity=[poolCount,topPoolsLiquidityUsd,largestPoolSharePct,ageMs,stale] uses the same prior-tuple numeric reference convention in its own array and summarizes at most five returned pools: always partial; the largest share denominator is those pools, not the market. All percentages are percentage points, qualified by the source; ambiguous units remain null with gaps. Each source has its own age/stale: stale or unknown-age data is not current support. Null arrays mean unavailable. Origin is in items; risk_flag is observed risk, not an action. Flow not collected because of the cap is an explicit optional gap, not an invented flow analysis or a blanket action rule. Wallet valuation and cost basis remain unknown; market price is public token evidence, not wallet net worth. Symbols are labels; chain and contract in the candidate id establish identity. A native token has no invented wrapped mapping.",
  });
  const originalCriteria = {
    buy: "Consider acquiring this candidate only if its observed evidence supports a conservative portfolio decision. No size or order is requested.",
    hold: "Leave this candidate unchanged; when its observed balance is zero or unknown, this means no acquisition or sale.",
    abstain: "Do not give a directional recommendation when evidence is missing, stale, conflicting, or insufficient for this candidate.",
  };
  expect(JSON.stringify(seen[0].questions)).toBe(JSON.stringify({
    asset_0: { type: "choice", instructions: originalInstructions(`token:143:${contract}`), criteria: originalCriteria },
    asset_1: {
      type: "choice",
      instructions: originalInstructions("token:143:native"),
      criteria: { ...originalCriteria, sell: "Consider reducing an observed positive position in this candidate if the evidence supports it. No size or order is requested." },
    },
  }));
  expect(out).toEqual({ raw: { choices: [{ candidateId: `token:143:${contract}`, action: "abstain" }, { candidateId: "token:143:native", action: "sell" }] }, usage: { inputTokens: 400, outputTokens: null } });
});

test("SH02: wallet question decodes exact shared tuples, preserves source freshness and never equates public token price with private valuation", async () => {
  const built = await createPortfolioSource({ now: () => 1_800_000_000_000, token: { async build() { throw new SourceError("sem_credencial_onchainos", 0); } } }).build({ modo: "carteira", carteira: { chainIndex: "143", observedAtMs: 1_800_000_000_000, coverage: "partial", profile: "conservative_no_leverage", assets: [{ contract: "native", symbol: "MON", balance: "1" }, { contract: "0x1111111111111111111111111111111111111111", symbol: "TEST", balance: null }] } }, { signal: new AbortController().signal, maxOnchainosCalls: 15 });
  const seen: any[] = [];
  const model = createJevInonuModel({ apiKey: () => "synthetic-key", createProvider: () => ({ evaluationModel: () => ({}) as never }), evaluate: (async (call: any) => { seen.push(call); return { answers: { asset_0: { choice: "hold" }, asset_1: { choice: "abstain" } }, usage: {} }; }) as never });
  await model.choose({ brief: built.brief, ids: built.brief.candidatos.map(c => c.id), mode: "carteira", signal: new AbortController().signal });
  const instructions = JSON.stringify(seen[0].questions.asset_0.instructions);
  for (const field of ["riskDetails", "lpBurnedPct", "concentration", "top10HoldPct", "poolLiquidity", "topPoolsLiquidityUsd", "largestPoolSharePct", "h4"]) expect(instructions).toContain(field);
  expect(instructions).toMatch(/zero-based reference to a prior full tuple/);
  expect(instructions).toMatch(/exactly identical observation including age and stale/);
  expect(instructions).toMatch(/missing trailing values mean null, never zero/);
  expect(instructions).toMatch(/at most five returned pools: always partial/);
  expect(instructions).toMatch(/unknown-age data is not current support/);
  expect(instructions).toMatch(/not wallet net worth/);
  expect(seen[0].state).toBe(built.brief);
  expect(seen).toHaveLength(1);
});

test("SEQ01/02/03: eight actual stances condition one priority of at most nine options and the two estimates cover both serialized requests", async () => {
  const rows = Array.from({ length: 8 }, (_, i) => tokenCandidate({ chainIndex: "8453", address: `0x${(i + 1).toString(16).padStart(40, "0")}` }));
  const ids = rows.map((row) => row.id);
  const state = buildBrief({ alvo: { escopo: "ecossistema", chainIndexes: ["8453"] }, asOfMs: 1_800_000_000_000, familiasHabilitadas: ["ecossistema"], candidatos: rows, fluxo: { ecossistema: { itens: Object.fromEntries(ids.map((id) => [id, { s: "SYNTHETIC", x: 2, f: ["liquidez", "fluxo"] }])) } }, trilha: null, risco: null, regime: null, idades: {}, origens: {}, nulos: {} }).brief;
  const seen: any[] = [];
  const lifecycle: unknown[] = [];
  const model = createJevInonuModel({
    apiKey: () => "synthetic-key", createProvider: () => ({ evaluationModel: () => ({}) as never }), evaluate: (async (call: any) => {
      seen.push(call);
      if (seen.length === 1) return { answers: Object.fromEntries(ids.flatMap((_, i) => [[`stance_${i}`, { choice: i === 0 ? "buy_two_thirds" : "watch" }], [`why_${i}`, { choice: "fluxo" }]])), usage: { inputTokens: 0, outputTokens: Number.NaN } };
      return { answers: { priority: { choice: ids[7] } }, usage: { inputTokens: -1, outputTokens: 5 } };
    }) as never
  });
  const controller = new AbortController();
  const input = { brief: state, ids, mode: "ecossistema" as const, signal: controller.signal, evaluations: { beforeStart: (indice: 1 | 2) => lifecycle.push({ start: indice }), onUsage: (indice: 1 | 2, usage: unknown) => lifecycle.push({ usage: indice, value: usage }) } };
  const estimates = model.estimateEvaluations!(input)!;
  const output = await model.choose(input);
  expect(seen).toHaveLength(2);
  expect(Object.keys(seen[1].questions.priority.criteria)).toEqual(["none", ...ids]);
  expect(seen[1].state.decisions.stances).toEqual(Object.fromEntries(ids.map((id, i) => [id, i === 0 ? "buy_two_thirds" : "watch"])));
  expect((output.raw as any).order).toEqual([ids[7], null, null]);
  expect(Object.keys((output.raw as any).stances)).toEqual(ids);
  expect(output.usage).toEqual({ inputTokens: null, outputTokens: null });
  expect(lifecycle).toEqual([{ start: 1 }, { usage: 1, value: { inputTokens: 0, outputTokens: null } }, { start: 2 }, { usage: 2, value: { inputTokens: null, outputTokens: 5 } }]);
  seen.forEach((call, index) => {
    const bytes = new TextEncoder().encode(JSON.stringify({ state: call.state, questions: call.questions })).length;
    expect(estimates[index]!.inputTokens).toBeGreaterThanOrEqual(Math.ceil(bytes / 3) + 700);
    expect(call.maxRetries).toBe(0);
    expect(call.abortSignal).toBe(controller.signal);
  });
  expect(JSON.stringify(seen[0].questions.why_0.instructions)).toMatch(/independent.*does not receive/);
});

test("SEQ04: a missing key or provider construction failure never announces a paid evaluation", async () => {
  for (const fail of ["key", "provider"] as const) {
    const lifecycle: number[] = [];
    let calls = 0;
    const model = createJevInonuModel({ apiKey: () => fail === "key" ? null : "synthetic-key", createProvider: () => { throw new Error("synthetic construction failure"); }, evaluate: (async () => { calls += 1; throw new Error("not reached"); }) as never });
    await expect(model.choose({ brief: brief(candidates), ids: candidates.map((row) => row.id), mode: "ativo", signal: new AbortController().signal, evaluations: { beforeStart: (indice) => { lifecycle.push(indice); }, onUsage: () => { } } })).rejects.toThrow();
    expect(calls).toBe(0);
    expect(lifecycle).toEqual([]);
  }
});

function harness(choice: string, usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = { inputTokens: 650, outputTokens: 12, totalTokens: 662 }) {
  const seen: { apiKey: string[]; modelId: string[]; call: { state?: unknown; questions?: Record<string, { criteria: Record<string, string> }>; abortSignal?: AbortSignal; maxRetries?: number }[] } = { apiKey: [], modelId: [], call: [] };
  const model = createJevInonuModel({
    apiKey: () => "SENTINEL-key-12345678",
    modelId: "jev-test",
    createProvider: (apiKey) => {
      seen.apiKey.push(apiKey);
      return { evaluationModel: (id: string) => (seen.modelId.push(id), { id }) as never };
    },
    evaluate: (async (call: never) => {
      seen.call.push(call);
      return { answers: { decision: { type: "choice", choice } }, usage };
    }) as never,
  });
  return { model, seen };
}

describe("the question asked", () => {
  test("hold, plus buy and sell for every candidate except the option to keep; the Brief is the state", async () => {
    const { model, seen } = harness("hold");
    const b = brief(candidates);
    await model.choose({ brief: b, ids: candidates.map((c) => c.id), mode: "ativo", signal: new AbortController().signal });
    const call = seen.call[0]!;
    expect(Object.keys(call.questions!.decision!.criteria).sort()).toEqual(["buy:perp:BTC-USDT-SWAP", "buy:spot:BTC-USDT", "buy:zona:a1b2c3d4e5f6", "hold", "sell:perp:BTC-USDT-SWAP", "sell:spot:BTC-USDT", "sell:zona:a1b2c3d4e5f6"]);
    expect(call.state).toEqual(b);
    expect(call.maxRetries).toBe(0);
    expect(seen.modelId).toEqual(["jev-test"]);
  });
  test("the effective active and ranking payloads match the original literals byte-for-byte", async () => {
    const originalCriteria = {
      hold: "Do nothing now. Choose this when the evidence is thin, stale (see the ages), conflicting, or when a field that matters is null.",
      "buy:zona:a1b2c3d4e5f6": "Take the buying side on the zone zona:a1b2c3d4e5f6. Choose it only when the flow, the score and the state in the Brief support it.",
      "sell:zona:a1b2c3d4e5f6": "Take the selling side on the zone zona:a1b2c3d4e5f6. Choose it only when the flow, the score and the state in the Brief support it.",
      "buy:spot:BTC-USDT": "Take the buying side on the spot market spot:BTC-USDT. Choose it only when the flow, the score and the state in the Brief support it.",
      "sell:spot:BTC-USDT": "Take the selling side on the spot market spot:BTC-USDT. Choose it only when the flow, the score and the state in the Brief support it.",
      "buy:perp:BTC-USDT-SWAP": "Take the buying side on the perpetual swap perp:BTC-USDT-SWAP. Choose it only when the flow, the score and the state in the Brief support it.",
      "sell:perp:BTC-USDT-SWAP": "Take the selling side on the perpetual swap perp:BTC-USDT-SWAP. Choose it only when the flow, the score and the state in the Brief support it.",
    };
    const originalQuestions = (ranking: boolean) => ({
      decision: {
        type: "choice",
        instructions: {
          question: "What is the single best action now: buy or sell one candidate, or hold?",
          goal: "You are the decision layer of a read-only advisory desk. Candidates are listed in the state; a zone describes demand or supply and is never an order by itself. Prefer hold when the evidence is thin, stale or conflicting." + (ranking ? " The candidates are instruments the person chose to compare: pick the one whose evidence is clearly strongest, or hold when none stands out." : ""),
          inputs: "The state is an Evidence Brief: flow counts and levels, candidates with score, state and distances in basis points of the current price, the age of each field, and nulls with their reasons. Nothing in it is a recommendation." + (ranking ? " In fluxo.itens each instrument has negocios (trades counted in the last minute), deltaRazao (bought minus sold over everything traded, from -1 to 1, comparable across instruments) and imb (counts of imbalances, c on the buying side and v on the selling side, null while the thresholds warm up). A candidate nota is the score of its best zone; estado says how many zones it has." : ""),
        },
        criteria: originalCriteria,
      },
    });
    const state = brief(candidates);
    const active = harness("hold");
    await active.model.choose({ brief: state, ids: candidates.map((candidate) => candidate.id), mode: "ativo", signal: new AbortController().signal });
    expect(JSON.stringify(active.seen.call[0]!.questions)).toBe(JSON.stringify(originalQuestions(false)));
    const ranking = harness("hold");
    await ranking.model.choose({ brief: state, ids: candidates.map((candidate) => candidate.id), mode: "ranking", signal: new AbortController().signal });
    expect(JSON.stringify(ranking.seen.call[0]!.questions)).toBe(JSON.stringify(originalQuestions(true)));
  });


  test("the key comes from the vault getter and goes to the provider, never through the environment", async () => {
    const { model, seen } = harness("hold");
    await model.choose({ brief: brief(candidates), ids: candidates.map((c) => c.id), mode: "ativo", signal: new AbortController().signal });
    expect(seen.apiKey).toEqual(["SENTINEL-key-12345678"]);
    expect(process.env.TYPESAFE_AI_API_KEY ?? "").not.toContain("SENTINEL");
  });

  test("the abort signal is passed to the call so a cancel or a timeout reaches the network", async () => {
    const { model, seen } = harness("hold");
    const controller = new AbortController();
    await model.choose({ brief: brief(candidates), ids: candidates.map((c) => c.id), mode: "ativo", signal: controller.signal });
    expect(seen.call[0]!.abortSignal).toBe(controller.signal);
  });

  test("a ranking tells the model what the keys of the flow mean and that the candidates were chosen by the person; the other modes are asked as before (RAS-6)", async () => {
    const ranking = harness("hold");
    const rows: BriefCandidate[] = [spotCandidate("BTC-USDT"), spotCandidate("ETH-USDT"), HOLD_CANDIDATE];
    await ranking.model.choose({ brief: brief(rows), ids: rows.map((c) => c.id), mode: "ranking", signal: new AbortController().signal });
    const asked = JSON.stringify(ranking.seen.call[0]!.questions);
    for (const key of ["negocios", "deltaRazao", "imb"]) expect(asked).toContain(key);
    expect(asked).toMatch(/chose to compare/);
    expect(asked).not.toMatch(/you should (buy|sell)|always|guaranteed/i);
    // the single instrument question carries none of it
    const single = harness("hold");
    await single.model.choose({ brief: brief(candidates), ids: candidates.map((c) => c.id), mode: "ativo", signal: new AbortController().signal });
    expect(JSON.stringify(single.seen.call[0]!.questions)).not.toContain("deltaRazao");
  });

  test("the criteria text is neutral and never tells the model what the right answer is", async () => {
    const { model, seen } = harness("hold");
    await model.choose({ brief: brief(candidates), ids: candidates.map((c) => c.id), mode: "ativo", signal: new AbortController().signal });
    const text = JSON.stringify(seen.call[0]!.questions);
    expect(text).not.toMatch(/you should (buy|sell)|always|guaranteed/i);
  });
});

describe("the answer", () => {
  test("a choice becomes { action, candidateId }; hold has no id", async () => {
    for (const [choice, expected] of [
      ["hold", { action: "hold", candidateId: null }],
      ["buy:spot:BTC-USDT", { action: "buy", candidateId: "spot:BTC-USDT" }],
      ["sell:zona:a1b2c3d4e5f6", { action: "sell", candidateId: "zona:a1b2c3d4e5f6" }],
    ] as const) {
      const { model } = harness(choice);
      const out = await model.choose({ brief: brief(candidates), ids: candidates.map((c) => c.id), mode: "ativo", signal: new AbortController().signal });
      expect(out.raw).toEqual(expected);
    }
  });

  test("the usage the provider measured is returned, and what it left out is null", async () => {
    const full = await harness("hold").model.choose({ brief: brief(candidates), ids: ["manter"], mode: "ativo", signal: new AbortController().signal });
    expect(full.usage).toEqual({ inputTokens: 650, outputTokens: 12 });
    const partial = await harness("hold", { inputTokens: 650 }).model.choose({ brief: brief(candidates), ids: ["manter"], mode: "ativo", signal: new AbortController().signal });
    expect(partial.usage).toEqual({ inputTokens: 650, outputTokens: null });
  });

  test("a choice the code cannot read is passed on as it came, for the validator to discard", async () => {
    const out = await harness("???").model.choose({ brief: brief(candidates), ids: candidates.map((c) => c.id), mode: "ativo", signal: new AbortController().signal });
    expect(out.raw).toBe("???");
  });

  test("parseChoice splits at the first colon only, because ids contain colons", () => {
    expect(parseChoice("buy:token:1:0xabc")).toEqual({ action: "buy", candidateId: "token:1:0xabc" });
    expect(parseChoice("hold")).toEqual({ action: "hold", candidateId: null });
    expect(parseChoice("buy")).toBeNull();
    expect(parseChoice("long:spot:A-B")).toBeNull();
    expect(parseChoice(7)).toBeNull();
  });
});

describe("refusals before the network", () => {
  test("no key configured: it throws and builds nothing", async () => {
    const seen: string[] = [];
    const model = createJevInonuModel({ apiKey: () => null, createProvider: (k) => (seen.push(k), { evaluationModel: () => ({}) as never }), evaluate: (async () => ({})) as never });
    await expect(model.choose({ brief: brief(candidates), ids: ["manter"], mode: "ativo", signal: new AbortController().signal })).rejects.toThrow();
    expect(seen).toEqual([]);
  });

  test("more candidates than the evaluation can hold is refused", async () => {
    const many = Array.from({ length: 130 }, (_, i) => spotCandidate(`T${i}-USDT`));
    const { model, seen } = harness("hold");
    await expect(model.choose({ brief: brief([HOLD_CANDIDATE]), ids: many.map((c) => c.id), mode: "ativo", signal: new AbortController().signal })).rejects.toThrow(/Too many/);
    expect(seen.call).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------- the filter questions (RAS-5)
import { createJevScreenerModel } from "./jev-model";
import { FILTER_QUESTIONS, buildFilterState } from "./screener";

function screenerHarness(answers: Record<string, string | undefined>, usage: { inputTokens?: number; outputTokens?: number } = { inputTokens: 900, outputTokens: 30 }) {
  const seen: { apiKey: string[]; call: { state?: unknown; questions?: Record<string, { type: string; criteria: Record<string, string> }>; abortSignal?: AbortSignal; maxRetries?: number }[] } = { apiKey: [], call: [] };
  const model = createJevScreenerModel({
    apiKey: () => "SENTINEL-key-12345678",
    modelId: "jev-test",
    createProvider: (apiKey) => (seen.apiKey.push(apiKey), { evaluationModel: (id: string) => ({ id }) as never }),
    evaluate: (async (call: never) => {
      seen.call.push(call);
      return { answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { type: "choice", choice: v }])), usage };
    }) as never,
  });
  return { model, seen };
}

const FULL = { mercado: "perp", volume: "100M", variacao: "alta", posicao: "qualquer", ordem: "alta", fixados: "nao" };

describe("the filter questions asked of the model", () => {
  test("one choice question per closed question of the filter, with every option and its meaning; the state is the sentence only", async () => {
    const { model, seen } = screenerHarness(FULL);
    const state = buildFilterState("perpetuos grandes que subiram");
    await model.choose({ state, signal: new AbortController().signal });
    const call = seen.call[0]!;
    expect(Object.keys(call.questions!).sort()).toEqual(Object.keys(FILTER_QUESTIONS).sort());
    const originalGoal = "You turn the sentence of a person into the filter of a table of crypto trading pairs. Read the sentence in the state and pick the option that matches what the person asked. When the sentence says nothing about this question, pick the neutral option described in it.";
    const originalInputs = "The state holds only the sentence of the person. There is no market data: do not guess prices or names.";
    const originalQuestions = Object.fromEntries(Object.entries(FILTER_QUESTIONS).map(([key, question]) => [
      key,
      {
        type: "choice",
        instructions: { question: question.question, goal: originalGoal, inputs: originalInputs },
        criteria: Object.fromEntries(question.options.map((option) => [option.id, option.meaning])),
      },
    ]));
    expect(JSON.stringify(call.questions)).toBe(JSON.stringify(originalQuestions));
    for (const [key, question] of Object.entries(FILTER_QUESTIONS)) {
      expect(call.questions![key]!.type).toBe("choice");
      expect(Object.keys(call.questions![key]!.criteria)).toEqual(question.options.map((o) => o.id));
    }
    expect(call.state).toEqual({ tipo: "filtro_do_rastreador", pergunta: "perpetuos grandes que subiram" });
    expect(call.maxRetries).toBe(0);
  });

  test("the key comes from the vault getter, the abort signal reaches the call, and no market data is anywhere in what is sent", async () => {
    const { model, seen } = screenerHarness(FULL);
    const controller = new AbortController();
    await model.choose({ state: buildFilterState("x"), signal: controller.signal });
    expect(seen.apiKey).toEqual(["SENTINEL-key-12345678"]);
    expect(seen.call[0]!.abortSignal).toBe(controller.signal);
    expect(JSON.stringify(seen.call[0]!.state)).toBe('{"tipo":"filtro_do_rastreador","pergunta":"x"}');
    expect(JSON.stringify(seen.call[0]!.questions)).not.toMatch(/BTC|ETH|SOL|USDT|-SWAP/);
  });

  test("the criteria text describes options and never tells the model the right answer", async () => {
    const { model, seen } = screenerHarness(FULL);
    await model.choose({ state: buildFilterState("x"), signal: new AbortController().signal });
    expect(JSON.stringify(seen.call[0]!.questions)).not.toMatch(/you should|always choose|guaranteed|buy|sell/i);
  });
});

describe("the filter answer", () => {
  test("the choices come back as they are, with the usage the provider measured", async () => {
    const { model } = screenerHarness(FULL);
    const out = await model.choose({ state: buildFilterState("x"), signal: new AbortController().signal });
    expect(out.raw).toEqual(FULL);
    expect(out.usage).toEqual({ inputTokens: 900, outputTokens: 30 });
  });

  test("a question the model left unanswered stays out of the raw answer, so the code rejects the whole thing", async () => {
    const { model } = screenerHarness({ ...FULL, ordem: undefined });
    const out = await model.choose({ state: buildFilterState("x"), signal: new AbortController().signal });
    expect(Object.keys(out.raw as object)).not.toContain("ordem");
  });

  test("usage the provider does not report is null, never an estimate", async () => {
    const { model } = screenerHarness(FULL, {});
    expect((await model.choose({ state: buildFilterState("x"), signal: new AbortController().signal })).usage).toEqual({ inputTokens: null, outputTokens: null });
  });

  test("no key is a refusal before anything is sent", async () => {
    const model = createJevScreenerModel({
      apiKey: () => null, evaluate: (() => {
        throw new Error("must not be called");
      }) as never
    });
    await expect(model.choose({ state: buildFilterState("x"), signal: new AbortController().signal })).rejects.toThrow("not configured");
  });
});
