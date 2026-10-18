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
import { PROMPTS } from "../generated/prompts";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import type { Brief } from "../intel/brief";
import { HOLD_CANDIDATE } from "../intel/candidates";
import type { InonuModel, ModelEstimate, ModelInput, ModelOutput, ScreenerModel } from "./ask";
import { FILTER_QUESTIONS, type buildFilterState } from "./screener";
import { PORTFOLIO_MAX_ASSETS, PORTFOLIO_MIN_ASSETS } from "./portfolio";
import { FAMILY_LABEL, NO_FAMILY } from "../opportunity/ecosystem";

const MAX_CHOICES = 254;
const DEFAULT_MODEL_ID = "jev-latest";
const INONU_PROMPT = PROMPTS["p-inonu"];

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
  if (id.startsWith("zona:")) return INONU_PROMPT.decision.kindDescriptions.zone;
  if (id.startsWith("spot:")) return INONU_PROMPT.decision.kindDescriptions.spot;
  if (id.startsWith("perp:")) return INONU_PROMPT.decision.kindDescriptions.perp;
  if (id.startsWith("token:")) return INONU_PROMPT.decision.kindDescriptions.token;
  return INONU_PROMPT.decision.kindDescriptions.candidate;
}

function criteriaFor(ids: readonly string[]): Record<string, string> {
  const criteria: Record<string, string> = {
  hold: INONU_PROMPT.decision.criteria.hold,
  };
  for (const id of ids) {
  if (id === HOLD_CANDIDATE.id) continue;
  criteria[`buy:${id}`] = INONU_PROMPT.decision.criteria.buy.replace("{id}", id).replace("{kind}", describe(id));
  criteria[`sell:${id}`] = INONU_PROMPT.decision.criteria.sell.replace("{id}", id).replace("{kind}", describe(id));
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
  buy: INONU_PROMPT.portfolio.criteria.buy,
  hold: INONU_PROMPT.portfolio.criteria.hold,
  abstain: INONU_PROMPT.portfolio.criteria.abstain,
  };
  if (typeof item[1] === "string" && /[1-9]/.test(item[1])) criteria.sell = INONU_PROMPT.portfolio.criteria.sell;
  questions[`asset_${index}`] = {
  type: "choice",
  instructions: {
  question: INONU_PROMPT.portfolio.question.replace("{id}", id),
  goal: INONU_PROMPT.portfolio.goal,
  inputs: INONU_PROMPT.portfolio.inputs,
  },
  criteria,
  };
  });
  return questions;
}

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
  const goal = INONU_PROMPT.ecosystem.goal;
  const inputs = INONU_PROMPT.ecosystem.inputs;
  const questions: Record<string, unknown> = {};
  ids.forEach((id, index) => {
  const item = items[index]!;
  const criteria: Record<string, string> = {
  skip: INONU_PROMPT.ecosystem.stanceCriteria.skip,
  watch: INONU_PROMPT.ecosystem.stanceCriteria.watch,
  };
  if (item.canBuy) {
  criteria.buy_third = INONU_PROMPT.ecosystem.stanceCriteria.buy_third;
  criteria.buy_two_thirds = INONU_PROMPT.ecosystem.stanceCriteria.buy_two_thirds;
  criteria.buy_full = INONU_PROMPT.ecosystem.stanceCriteria.buy_full;
  }
  questions[`stance_${index}`] = { type: "choice", instructions: { question: INONU_PROMPT.ecosystem.stanceQuestion.replace("{id}", id).replace("{symbol}", item.symbol), goal, inputs }, criteria };
  const why: Record<string, string> = { [NO_FAMILY]: INONU_PROMPT.ecosystem.familyMeanings[NO_FAMILY] };
  for (const family of item.families) if (family in FAMILY_LABEL) why[family] = INONU_PROMPT.ecosystem.familyMeanings[family as keyof typeof INONU_PROMPT.ecosystem.familyMeanings] ?? family;
  questions[`why_${index}`] = { type: "choice", instructions: { question: INONU_PROMPT.ecosystem.familyQuestion.replace("{id}", id).replace("{symbol}", item.symbol), goal: INONU_PROMPT.ecosystem.familyGoal, inputs }, criteria: why };
  });
  return questions;
}

function priorityQuestions(ids: readonly string[]): Record<string, unknown> {
  return {
  priority: {
  type: "choice",
  instructions: {
  question: INONU_PROMPT.priority.question,
  goal: INONU_PROMPT.priority.goal,
  inputs: INONU_PROMPT.priority.inputs,
  },
  criteria: Object.fromEntries([["none", INONU_PROMPT.priority.none], ...ids.map((id) => [id, INONU_PROMPT.priority.candidate.replace("{id}", id)])]),
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
  question: INONU_PROMPT.decision.question,
  goal: INONU_PROMPT.decision.goal + (ranking ? INONU_PROMPT.decision.rankingGoalSuffix : ""),
  inputs: INONU_PROMPT.decision.inputs + (ranking ? INONU_PROMPT.decision.rankingInputsSuffix : ""),
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
  goal: INONU_PROMPT.screener.goal,
  inputs: INONU_PROMPT.screener.inputs,
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
