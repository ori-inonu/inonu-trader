/**
 * Adapter between "Pedir ao Inonu" and the Jev model (T7.3, ASK-4). Jev is only the model behind the intelligence; the
 * interface says Inonu. Closed choices use the candidates the code produced. Ecosystem mode first chooses posture/family,
 * then at most one priority conditioned on those validated decisions. Other modes use one evaluation.
 *
 * The key is read from the vault getter at the moment of the call and handed to the provider explicitly; it never goes
 * through `process.env`, which child processes would inherit. The model call is `experimental_evaluate`, the same one
 * System One uses; the usage it returns is what the provider measured, with `undefined` turned into `null`.
 *
 * The real model is NOT exercised by the tests; they inject a fake `evaluate`. The first real call needs the user's
 * authorization (T7.8).
 */
import { experimental_evaluate } from "ai";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import type { Brief } from "../intel/brief";
import { HOLD_CANDIDATE } from "../intel/candidates";
import type { InonuModel, ModelEstimate, ModelInput, ModelOutput, ScreenerModel } from "./ask";
import { FILTER_QUESTIONS, type buildFilterState } from "./screener";
import { PORTFOLIO_MAX_ASSETS, PORTFOLIO_MIN_ASSETS } from "./portfolio";
import { FAMILY_LABEL, NO_FAMILY } from "../opportunity/ecosystem";

const MAX_CHOICES = 254;
const DEFAULT_MODEL_ID = "jev-latest";

export interface JevModelOptions {
  /** The model key from the vault, or null when it is not configured. */
  readonly apiKey: () => string | null;
  readonly modelId?: string;
  readonly createProvider?: (apiKey: string) => { evaluationModel(modelId: string): never };
  readonly evaluate?: typeof experimental_evaluate;
}

/** `hold` or `<buy|sell>:<candidate id>`; the id may contain colons, so only the first one splits. */
export function parseChoice(choice: unknown): { action: "buy" | "sell" | "hold"; candidateId: string | null } | null {
  if (typeof choice !== "string") return null;
  if (choice === "hold") return { action: "hold", candidateId: null };
  const cut = choice.indexOf(":");
  if (cut < 0) return null;
  const action = choice.slice(0, cut);
  const candidateId = choice.slice(cut + 1);
  if ((action !== "buy" && action !== "sell") || candidateId.length === 0) return null;
  return { action, candidateId };
}

function describe(id: string): string {
  if (id.startsWith("zona:")) return "the zone";
  if (id.startsWith("spot:")) return "the spot market";
  if (id.startsWith("perp:")) return "the perpetual swap";
  if (id.startsWith("token:")) return "this on-chain token";
  return "this candidate";
}

function criteriaFor(ids: readonly string[]): Record<string, string> {
  const criteria: Record<string, string> = {
    hold: "Do nothing now. Choose this when the evidence is thin, stale (see the ages), conflicting, or when a field that matters is null.",
  };
  for (const id of ids) {
    if (id === HOLD_CANDIDATE.id) continue;
    criteria[`buy:${id}`] = `Take the buying side on ${describe(id)} ${id}. Choose it only when the flow, the score and the state in the Brief support it.`;
    criteria[`sell:${id}`] = `Take the selling side on ${describe(id)} ${id}. Choose it only when the flow, the score and the state in the Brief support it.`;
  }
  return criteria;
}

function portfolioQuestions(brief: Brief, ids: readonly string[]): Record<string, unknown> {
  const composition = brief.fluxo?.carteira;
  if (!composition || Array.isArray(composition) || typeof composition !== "object" || composition.coverage !== "partial" || composition.profile !== "conservative_no_leverage" || !Array.isArray(composition.items) || ids.length < PORTFOLIO_MIN_ASSETS || ids.length > PORTFOLIO_MAX_ASSETS || composition.items.length !== ids.length || new Set(ids).size !== ids.length) throw new Error("Invalid portfolio candidates");
  const items = composition.items;
  const questions: Record<string, unknown> = {};
  ids.forEach((id, index) => {
    const candidate = brief.candidatos[index];
    const item = items[index];
    if (!candidate || candidate.id !== id || candidate.tipo !== "token" || !/^token:(?:[1-9]\d{0,11}:(?:native|0x[0-9a-f]{40})|501:[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(id) || !Array.isArray(item) || (item[1] !== null && (typeof item[1] !== "string" || !/^(0|[1-9]\d*)(\.\d+)?$/.test(item[1])))) throw new Error("Invalid portfolio candidates");
    const criteria: Record<string, string> = {
      buy: "Consider acquiring this candidate only if its observed evidence supports a conservative portfolio decision. No size or order is requested.",
      hold: "Leave this candidate unchanged; when its observed balance is zero or unknown, this means no acquisition or sale.",
      abstain: "Do not give a directional recommendation when evidence is missing, stale, conflicting, or insufficient for this candidate.",
    };
    if (typeof item[1] === "string" && /[1-9]/.test(item[1])) criteria.sell = "Consider reducing an observed positive position in this candidate if the evidence supports it. No size or order is requested.";
    questions[`asset_${index}`] = {
      type: "choice",
      instructions: {
        question: `What is the advisory portfolio action for candidate ${id}?`,
        goal: "Assess conservative capital preservation and growth without leverage. The set is bounded and partial; it is not the entire wallet or market. Missing valuation, cost basis, confidence and returns remain unknown. Prefer abstention when an essential source is unavailable. Do not infer a guaranteed profit, allocation size, return or numeric confidence.",
        inputs: "The state is only an Evidence Brief. All fluxo.carteira arrays follow candidatos order. items=[symbol,exactBalance,buyShare,riskLevel,aggregateAgeMs,gapKeysIndices,origin]; market=[priceUsd,liquidityUsd,changePct(m5,h1,h4,h24),volumeUsd(m5,h1,h4,h24),ageMs,stale], with the two window groups flattened. A numeric market entry is a zero-based reference to a prior full tuple in this same array, representing an exactly identical observation including age and stale; null means unavailable. riskDetails=[lpBurnedPct,devCreateCount,devLaunchedCount,devRugCount,ageMs,stale]; its level and documented tags are in items.riskLevel and risk_flag gaps. concentration=[top10HoldPct,devHoldPct,bundleHoldPct,sniperHoldPct,suspiciousHoldPct] uses riskDetails freshness; missing trailing values mean null, never zero. poolLiquidity=[poolCount,topPoolsLiquidityUsd,largestPoolSharePct,ageMs,stale] uses the same prior-tuple numeric reference convention in its own array and summarizes at most five returned pools: always partial; the largest share denominator is those pools, not the market. All percentages are percentage points, qualified by the source; ambiguous units remain null with gaps. Each source has its own age/stale: stale or unknown-age data is not current support. Null arrays mean unavailable. Origin is in items; risk_flag is observed risk, not an action. Flow not collected because of the cap is an explicit optional gap, not an invented flow analysis or a blanket action rule. Wallet valuation and cost basis remain unknown; market price is public token evidence, not wallet net worth. Symbols are labels; chain and contract in the candidate id establish identity. A native token has no invented wrapped mapping.",
      },
      criteria,
    };
  });
  return questions;
}

const FAMILY_MEANING: Readonly<Record<string, string>> = {
  carteiras: "Tracked wallets bought it and mostly still hold it.",
  fluxo: "Buys are most of the transactions.",
  liquidez: "Its pool is deep: people can leave.",
  distribuicao: "The supply is not concentrated in a few wallets or in the creator.",
  tracao: "It rises with real volume.",
  seguranca: "The provider gives it a low risk level and marks no risk flag.",
  [NO_FAMILY]: "No single observed family is sufficiently supported or stands out.",
};

interface EcosystemItem {
  readonly symbol: string;
  readonly canBuy: boolean;
  readonly families: readonly string[];
}

/** The candidates of the ecosystem Brief as the questions need them: read from the Brief the code built, in the order of the ids, and refused when they do not match. */
function ecosystemItems(brief: Brief, ids: readonly string[]): EcosystemItem[] {
  const eco = brief.fluxo?.ecossistema;
  const itens = eco !== null && typeof eco === "object" && !Array.isArray(eco) ? (eco as { itens?: unknown }).itens : undefined;
  if (itens === null || typeof itens !== "object" || Array.isArray(itens) || ids.length < 1 || ids.length > 8) throw new Error("the ecosystem Brief is not in the expected shape");
  return ids.map((id) => {
    const item = (itens as Record<string, unknown>)[id];
    if (item === null || typeof item !== "object" || Array.isArray(item)) throw new Error("the ecosystem Brief is missing a candidate");
    const o = item as { s?: unknown; x?: unknown; f?: unknown };
    if (typeof o.s !== "string" || !Array.isArray(o.f)) throw new Error("the ecosystem Brief has a malformed candidate");
    return { symbol: o.s, canBuy: typeof o.x === "number" && o.x > 0, families: o.f.filter((f): f is string => typeof f === "string") };
  });
}

/**
 * The questions of the ecosystem mode, all closed: for each candidate a stance (skip, watch and, only where the code found a ceiling, three sizes that are fractions of it) and the family of evidence
 * that is best supported by the observed evidence. These questions are independent. A second evaluation can choose one priority from the validated watch/buy decisions.
 */
export function ecosystemQuestions(brief: Brief, ids: readonly string[]): Record<string, unknown> {
  const items = ecosystemItems(brief, ids);
  const goal =
    "You are the decision layer of an advisory desk that helps a person use a small balance well. The candidates in the state were put forward by code from several networks, each with measured facts, the families of evidence in its favour and marks of care. " +
    "Weigh all the facts together, not one: a candidate with a mark of care needs a strong case, and few good picks are better than many weak ones. Prefer skip when the evidence is thin, conflicting, stale or marked. A size is a fraction of a ceiling the code computed from the person's balance; you never choose an amount. Do not invent numeric confidence, freshness, safety or a guaranteed return.";
  const inputs =
    "The state is an Evidence Brief. fluxo.ecossistema.itens has one object per candidate id, with the short keys explained in fluxo.ecossistema.chaves. A null is unknown, never zero. x is the ceiling of what may be bought as a percent of the portfolio; x of 0 or null means no buy size is available. fontes explains origin, ageMs, stale and timeFrame per network/source; itens.q describes token-risk metadata. Fresh hot data does not make signals or risk fresh. Unknown age or unavailable risk is not evidence of freshness or safety; the Brief asOf is not the source time. Nothing in the state is a recommendation.";
  const questions: Record<string, unknown> = {};
  ids.forEach((id, index) => {
    const item = items[index]!;
    const criteria: Record<string, string> = {
      skip: "Do not buy it: the evidence is thin, conflicting, or the marks of care outweigh it.",
      watch: "Interesting, but not now: it may deserve a look later.",
    };
    if (item.canBuy) {
      criteria.buy_third = "Buy one third of the ceiling of this candidate: the case is good but not strong.";
      criteria.buy_two_thirds = "Buy two thirds of the ceiling of this candidate: the case is strong.";
      criteria.buy_full = "Buy the whole ceiling of this candidate: the case is very strong and nothing gives pause.";
    }
    questions[`stance_${index}`] = { type: "choice", instructions: { question: `What is your stance on candidate ${item.symbol} (${id})?`, goal, inputs }, criteria };
    const why: Record<string, string> = { [NO_FAMILY]: FAMILY_MEANING[NO_FAMILY]! };
    for (const family of item.families) if (family in FAMILY_LABEL) why[family] = FAMILY_MEANING[family] ?? family;
    questions[`why_${index}`] = { type: "choice", instructions: { question: `Which observed family of evidence is best supported for candidate ${item.symbol} (${id})?`, goal: "Choose the single positive family best supported by observed facts, or none. This question is independent of the stance question and does not receive its answer.", inputs }, criteria: why };
  });
  return questions;
}

function priorityQuestions(ids: readonly string[]): Record<string, unknown> {
  return {
    priority: {
      type: "choice",
      instructions: {
        question: "Which one eligible candidate has the first priority to watch or buy now?",
        goal: "Choose one real priority from the validated decisions, or none. Never rank skip or change a stance. Ranking a watch never makes it a purchase and does not choose an amount. Missing, stale, conflicting or unknown evidence may support none. Do not invent confidence, freshness or returns.",
        inputs: "The state contains the original Evidence Brief and the actual validated decisions of the first evaluation. Decisions are not new market evidence. Compare their observed facts and source ages; null is unknown, not zero. Only offered IDs are eligible.",
      },
      criteria: Object.fromEntries([["none", "No watch or buy candidate deserves priority now."], ...ids.map((id) => [id, `Candidate ${id}, with its validated stance unchanged.`])]),
    },
  };
}

function measuredUsage(result: unknown): NonNullable<ModelOutput["usage"]> {
  const usage = (result as { usage?: { inputTokens?: unknown; outputTokens?: unknown } }).usage;
  const token = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  return { inputTokens: token(usage?.inputTokens), outputTokens: token(usage?.outputTokens) };
}

/** Conservative local reservation of serialized state/questions plus framing, not a claim about billed tokens. */
function evaluationEstimate(state: unknown, questions: Record<string, unknown>, outputTokens: number): ModelEstimate {
  const bytes = new TextEncoder().encode(JSON.stringify({ state, questions })).length;
  return { inputTokens: Math.ceil(bytes / 3) + 700, outputTokens };
}

export function createJevInonuModel(options: JevModelOptions): InonuModel {
  const modelId = options.modelId ?? DEFAULT_MODEL_ID;
  const createProvider = options.createProvider ?? ((apiKey: string) => createTypeSafeAi({ apiKey }) as never);
  const evaluate = options.evaluate ?? experimental_evaluate;

  return {
    name: modelId,
    tracksEvaluations: true,
    estimateEvaluations(input) {
      if (input.mode !== "ecossistema") return undefined;
      const questions = ecosystemQuestions(input.brief, input.ids);
      const stances: Record<string, string> = {};
      const drivers: Record<string, string> = {};
      input.ids.forEach((id, index) => {
        const longest = (criteria: Record<string, string>) => Object.keys(criteria).reduce((a, b) => a.length >= b.length ? a : b);
        stances[id] = longest((questions[`stance_${index}`] as { criteria: Record<string, string> }).criteria);
        drivers[id] = longest((questions[`why_${index}`] as { criteria: Record<string, string> }).criteria);
      });
      return [evaluationEstimate(input.brief, questions, 200 + 40 * input.ids.length), evaluationEstimate({ brief: input.brief, decisions: { stances, drivers } }, priorityQuestions(input.ids), 200)];
    },
    async choose(input: ModelInput): Promise<ModelOutput> {
      const apiKey = options.apiKey();
      if (apiKey === null || apiKey.length === 0) throw new Error("the model key is not configured");
      const evaluateOnce = async (indice: 1 | 2, state: unknown, questions: Record<string, unknown>) => {
        const model = createProvider(apiKey).evaluationModel(modelId);
        if (input.signal.aborted) throw new Error("aborted");
        input.evaluations?.beforeStart(indice);
        const result = await evaluate({ model, state: state as never, questions: questions as never, maxRetries: 0, abortSignal: input.signal });
        input.evaluations?.onUsage(indice, measuredUsage(result));
        return result;
      };
      if (input.mode === "carteira") {
        const questions = portfolioQuestions(input.brief, input.ids);
        const result = await evaluateOnce(1, input.brief, questions);
        const answers = (result as { answers?: Record<string, { choice?: unknown }> }).answers;
        const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
        return {
          raw: { choices: input.ids.map((candidateId, index) => ({ candidateId, action: answers?.[`asset_${index}`]?.choice })) },
          usage: { inputTokens: typeof usage?.inputTokens === "number" ? usage.inputTokens : null, outputTokens: typeof usage?.outputTokens === "number" ? usage.outputTokens : null },
        };
      }
      if (input.mode === "ecossistema") {
        const questions = ecosystemQuestions(input.brief, input.ids);
        if (input.signal.aborted) throw new Error("aborted");
        const result = await evaluateOnce(1, input.brief, questions);
        const answers = (result as { answers?: Record<string, { choice?: unknown }> }).answers;
        const usage = measuredUsage(result);
        const stances: Record<string, string> = {};
        const drivers: Record<string, string> = {};
        input.ids.forEach((id, index) => {
          const stance = answers?.["stance_" + index]?.choice;
          const driver = answers?.["why_" + index]?.choice;
          const stanceCriteria = (questions["stance_" + index] as { criteria: Record<string, string> }).criteria;
          const driverCriteria = (questions["why_" + index] as { criteria: Record<string, string> }).criteria;
          if (typeof stance !== "string" || !Object.hasOwn(stanceCriteria, stance) || typeof driver !== "string" || !Object.hasOwn(driverCriteria, driver)) throw new Error("Invalid ecosystem decisions");
          stances[id] = stance;
          drivers[id] = driver;
        });
        if (input.signal.aborted) throw new Error("aborted");
        const eligible = input.ids.filter((id) => stances[id] !== "skip");
        if (eligible.length === 0) return { raw: { stances, drivers, order: [null, null, null] }, usage };
        const ranking = await evaluateOnce(2, { brief: input.brief, decisions: { stances, drivers } }, priorityQuestions(eligible));
        const choice = (ranking as { answers?: Record<string, { choice?: unknown }> }).answers?.priority?.choice;
        if (choice !== "none" && (typeof choice !== "string" || !eligible.includes(choice))) throw new Error("Invalid ecosystem priority");
        const rankingUsage = measuredUsage(ranking);
        return {
          raw: { stances, drivers, order: [choice === "none" ? null : choice, null, null] },
          usage: { inputTokens: usage.inputTokens !== null && rankingUsage.inputTokens !== null ? usage.inputTokens + rankingUsage.inputTokens : null, outputTokens: usage.outputTokens !== null && rankingUsage.outputTokens !== null ? usage.outputTokens + rankingUsage.outputTokens : null },
        };
      }
      const criteria = criteriaFor(input.ids);
      if (Object.keys(criteria).length > MAX_CHOICES) throw new Error("Too many candidates for one choice question");

      // a ranking compares the instruments a person chose: the model is told what the per-instrument flow keys mean, since there is no single target
      const ranking = input.mode === "ranking";
      const questions = {
        decision: {
          type: "choice",
          instructions: {
            question: "What is the single best action now: buy or sell one candidate, or hold?",
            goal: "You are the decision layer of a read-only advisory desk. Candidates are listed in the state; a zone describes demand or supply and is never an order by itself. Prefer hold when the evidence is thin, stale or conflicting." + (ranking ? " The candidates are instruments the person chose to compare: pick the one whose evidence is clearly strongest, or hold when none stands out." : ""),
            inputs: "The state is an Evidence Brief: flow counts and levels, candidates with score, state and distances in basis points of the current price, the age of each field, and nulls with their reasons. Nothing in it is a recommendation." + (ranking ? " In fluxo.itens each instrument has negocios (trades counted in the last minute), deltaRazao (bought minus sold over everything traded, from -1 to 1, comparable across instruments) and imb (counts of imbalances, c on the buying side and v on the selling side, null while the thresholds warm up). A candidate nota is the score of its best zone; estado says how many zones it has." : ""),
          },
          criteria,
        },
      } as const;

      const result = await evaluateOnce(1, input.brief, questions);
      const answers = (result as { answers?: Record<string, { choice?: unknown }> }).answers;
      const choice = answers?.decision?.choice;
      const parsed = parseChoice(choice);
      const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
      return {
        raw: parsed ?? choice,
        usage: { inputTokens: typeof usage?.inputTokens === "number" ? usage.inputTokens : null, outputTokens: typeof usage?.outputTokens === "number" ? usage.outputTokens : null },
      };
    },
  };
}

/**
 * The model of the Rastreador filter (RAS-5): the sentence is the whole state, and every closed question of the filter is a choice
 * question with its options described. The model answers one option per question; it writes no number and no field name. The
 * answer is returned raw: the code, not the model, decides whether it is a valid filter.
 */
export function createJevScreenerModel(options: JevModelOptions): ScreenerModel {
  const modelId = options.modelId ?? DEFAULT_MODEL_ID;
  const createProvider = options.createProvider ?? ((apiKey: string) => createTypeSafeAi({ apiKey }) as never);
  const evaluate = options.evaluate ?? experimental_evaluate;

  return {
    name: modelId,
    async choose(input: { readonly state: ReturnType<typeof buildFilterState>; readonly signal: AbortSignal }): Promise<ModelOutput> {
      const apiKey = options.apiKey();
      if (apiKey === null || apiKey.length === 0) throw new Error("the model key is not configured");

      const questions: Record<string, unknown> = {};
      for (const [key, question] of Object.entries(FILTER_QUESTIONS)) {
        questions[key] = {
          type: "choice",
          instructions: {
            question: question.question,
            goal: "You turn the sentence of a person into the filter of a table of crypto trading pairs. Read the sentence in the state and pick the option that matches what the person asked. When the sentence says nothing about this question, pick the neutral option described in it.",
            inputs: "The state holds only the sentence of the person. There is no market data: do not guess prices or names.",
          },
          criteria: Object.fromEntries(question.options.map((o) => [o.id, o.meaning])),
        };
      }

      const result = await evaluate({ model: createProvider(apiKey).evaluationModel(modelId), state: input.state as never, questions: questions as never, maxRetries: 0, abortSignal: input.signal });
      const answers = (result as { answers?: Record<string, { choice?: unknown } | undefined> }).answers ?? {};
      const raw: Record<string, unknown> = {};
      for (const key of Object.keys(FILTER_QUESTIONS)) {
        const choice = answers[key]?.choice;
        if (choice !== undefined) raw[key] = choice;
      }
      const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
      return {
        raw,
        usage: { inputTokens: typeof usage?.inputTokens === "number" ? usage.inputTokens : null, outputTokens: typeof usage?.outputTokens === "number" ? usage.outputTokens : null },
      };
    },
  };
}
