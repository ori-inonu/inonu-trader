/**
 * "Pedir ao Inonu" (T7.3, ASK-1, ASK-2, ASK-4, ASK-5, ASK-6, ASK-11): the ONLY door to the model.
 *
 * Nothing calls the model in the background. A click collects the data at that moment, builds the Evidence Brief, and asks
 * through closed choices; ecosystem mode may use two sequential evaluations. Answers are validated against the ids the code produced. Around that click:
 *
 *  - single flight: two clicks on the same target share one call, a click on another target while one runs is told
 *    `em_andamento`;
 *  - a cooldown per target, and reuse of the last answer when the Brief did not change (the hash is the same);
 *  - caps: the estimated cost of the request, the day's spending, the day's call count and the OnchainOS calls of a
 *    discovery, all checked BEFORE the model is asked;
 *  - a timeout and cancellation;
 *  - every call written to the ledger with measured values, `null` where the provider did not report them.
 *
 * The filter mode (the Rastreador "Perguntar ao Inonu", RAS-5) goes through the very same guards, but the model there gets the
 * sentence and nothing else and answers closed options, from which the code builds a filter (see screener.ts).
 *
 * The model, the data source and the ledger are injected: the tests use fakes and never reach the real model. The
 * envelope keeps `advisory: true` and `execution: "never"` in every answer. Free text from the model is never copied.
 */
import { SourceError } from "./source-error";
import { materialChange, type Brief, type BriefCandidate } from "../intel/brief";
import { candidateIds, validateDecision, type Action } from "../intel/candidates";
import { instTypeOf } from "./okx-public";
import { buildFilterState, filterFromChoices, type ScreenerFilter } from "./screener";
import { isPortfolioFresh, parsePortfolioInput, validatePortfolioDecision, type PortfolioContext, type PortfolioInput, type PortfolioResult } from "./portfolio";
import { isSaldoFresh, parseSaldo, validateEcosystem, type EcoContext, type EcoResult, type Saldo } from "../opportunity/ecosystem";

export const MAX_ONCHAINOS_CALLS_PER_REQUEST = 15;

export type AskMode = "ativo" | "token" | "descoberta" | "filtro" | "ranking" | "carteira" | "ecossistema";
const MODES: readonly string[] = ["ativo", "token", "descoberta", "filtro", "ranking", "carteira", "ecossistema"];

/** The ecosystem mode reads at most this many networks (two reads each). */
export const ECOSYSTEM_REDES_MAX = 4;

/** An OKX instrument, an on-chain token, or (the discovery mode) a whole network. */
export type AskTarget = { readonly instId: string } | { readonly chainIndex: string; readonly address: string } | { readonly chainIndex: string };

/** The ranking mode (RAS-6) asks about two to five OKX instruments the person chose in the Rastreador. */
export const RANKING_MIN = 2;
export const RANKING_MAX = 5;

export interface AskRequest {
 readonly modo: AskMode;
 readonly carteira?: PortfolioInput;
 readonly alvo?: AskTarget;
 /** Only in the ranking mode: the chosen instruments, two to five, all different. */
 readonly alvos?: readonly { readonly instId: string }[];
 /** Only in the filter mode, where the model receives nothing but the filter schema. */
 readonly textoLivre?: string;
 /** Only in the ecosystem mode: the networks to read (one to four). Without it the source takes the networks where the balance holds cash, else the usual ones. */
 readonly redes?: readonly string[];
 /** Only in the ecosystem mode: the balance the page read at the click, in the closed shape of parseSaldo. It sizes the picks; only percentages of it reach the model. */
 readonly saldo?: Saldo;
}

export type AskStatus = "respondido" | "em_andamento" | "teto_atingido" | "cooldown" | "cancelado" | "sem_chave" | "erro";

export interface AskResponse {
 readonly ok: boolean;
 readonly id: string;
 readonly status: AskStatus;
 readonly carteira?: PortfolioResult;
 /** Present only in the ecosystem mode: the picks of the model with the dollars the code computed (empty picks is a valid answer). */
 readonly oportunidades?: EcoResult;
 /** Present only in the filter mode, built from the options the model chose. */
 readonly filtro?: ScreenerFilter;
 /** Which model answered the filter request; provenance only. */
 readonly modelo?: string;
 /** Present only when the model's answer was valid. */
 readonly decisao?: { readonly action: Action; readonly candidateId: string | null; readonly pesos: Readonly<Record<string, number>> | null; readonly razao: string; readonly modelo: string };
 readonly custo: { readonly chamadasOnchainos: number | null; readonly tokens: number | null; readonly usd: number | null };
 readonly briefHash: string | null;
 readonly reutilizado?: boolean;
 readonly motivo?: string;
 readonly advisory: true;
 readonly execution: "never";
}

export interface BuiltBrief {
 readonly brief: Brief;
 readonly candidates: readonly BriefCandidate[];
 /** OnchainOS calls spent collecting the data for this click; null when unknown. */
 readonly onchainosCalls: number | null;
 readonly portfolio?: PortfolioContext;
 /** The candidates of the ecosystem mode with their facts and ceilings, which the answer of the model is checked against. */
 readonly ecosystem?: EcoContext;
}

export { SourceError } from "./source-error";

export interface BriefSource {
 build(request: AskRequest, context: { readonly signal: AbortSignal; readonly maxOnchainosCalls: number; /** How many candidates the caller wants (the click wants the usual five; the agent asks for more so that enough of them are open); bounded by the source. */ readonly candidates?: number; readonly budgetIntent?: "user" | "background" }): Promise<BuiltBrief>;
}

export interface ModelOutput {
 /** The model's parsed answer, untrusted. */
 readonly raw: unknown;
 readonly usage?: { readonly inputTokens: number | null; readonly outputTokens: number | null };
}

export interface ModelEstimate {
 readonly inputTokens: number;
 readonly outputTokens: number;
}

export interface ModelInput {
 readonly brief: Brief;
 readonly ids: readonly string[];
 readonly mode: AskMode;
 readonly signal: AbortSignal;
 /** Synchronous pre-call guard and immediate measured usage, including before a later validation/cancellation fails. */
 readonly evaluations?: {
  beforeStart(indice: 1 | 2): void;
  onUsage(indice: 1 | 2, usage: NonNullable<ModelOutput["usage"]>): void;
 };
}

export interface InonuModel {
 readonly name: string;
 /** Adapters without this optional seam retain the legacy one-call accounting contract. */
 readonly tracksEvaluations?: true;
 estimateEvaluations?(input: Pick<ModelInput, "brief" | "ids" | "mode">): readonly ModelEstimate[] | undefined;
 choose(input: ModelInput): Promise<ModelOutput>;
}

/** The model of the filter mode: it gets the sentence and answers one option per closed question. */
export interface ScreenerModel {
 readonly name: string;
 choose(input: { readonly state: ReturnType<typeof buildFilterState>; readonly signal: AbortSignal }): Promise<ModelOutput>;
}

/** Measurement of one initiated evaluation. No model state, answer or candidate identity is stored. */
export interface EvaluationUsage {
 readonly indice: 1 | 2;
 readonly tokensEntrada: number | null;
 readonly tokensSaida: number | null;
 readonly usd: number | null;
 readonly usdEstimado: number | null;
}

export interface LedgerEntry {
 readonly id: string;
 readonly atMs: number;
 readonly modo: AskMode;
 /** Why the call happened: always a click. */
 readonly razao: string;
 readonly briefHash: string | null;
 readonly modelo: string | null;
 readonly chamadasModelo: 0 | 1 | 2;
 readonly chamadasOnchainos: number | null;
 readonly tokensEntrada: number | null;
 readonly tokensSaida: number | null;
 readonly usd: number | null;
 /** What the call was estimated to cost BEFORE it was made (null when no price was known). A call whose cost was not measured still counts for this against the daily cap. */
 readonly usdEstimado?: number | null;
 /** Optional for old ledger rows. Includes every initiated evaluation, even when its usage was not reported. */
 readonly avaliacoes?: readonly EvaluationUsage[];
 readonly latenciaMs: number | null;
 readonly resultado: string;
}

export interface Ledger {
 record(entry: LedgerEntry): void;
 /** Measured spending of the current day; null when some call's cost is unknown and nothing can be summed. */
 spentTodayUsd(nowMs: number): number | null;
 /**
  * What counts against the daily dollar cap: the measured cost of each model call of the day, or the estimate made before it when its cost
  * was not measured (a timeout, a cancel, a provider that reported no usage). Null only when some model call has neither, that is, when no
  * price was known. Absent in a ledger that does not know the difference: the measured sum is used.
  */
 committedTodayUsd?(nowMs: number): number | null;
 callsToday(nowMs: number): number;
}

export interface AskLimits {
 readonly cooldownMs: number;
 readonly reuseTtlMs: number;
 readonly maxUsdPerRequest: number;
 readonly maxUsdPerDay: number;
 readonly maxCallsPerDay: number;
 readonly timeoutMs: number;
 /** Price per million tokens; null when unknown, which switches off the dollar caps and leaves the call count. */
 readonly usdPerMtok: { readonly input: number | null; readonly output: number | null };
}

export interface AskDeps {
 readonly source: BriefSource;
 /** Null when the model key is not configured. A function is resolved at the moment of each click, because the key can be saved later in Settings. */
 readonly model: InonuModel | null | (() => InonuModel | null);
 /** The same, for the filter mode. */
 readonly screener?: ScreenerModel | null | (() => ScreenerModel | null);
 readonly ledger: Ledger;
 readonly limits: AskLimits;
 readonly now: () => number;
 /** The clock of this machine, the one that stamped what the page sends (a portfolio reading): `now` may be the corrected clock for the exchange signature, which is not the page's clock. Defaults to `now`. */
 readonly localNow?: () => number;
 readonly newId: () => string;
 readonly estimate?: (brief: Brief) => { readonly inputTokens: number; readonly outputTokens: number };
 readonly estimateFilter?: (state: ReturnType<typeof buildFilterState>) => { readonly inputTokens: number; readonly outputTokens: number };
}

export interface Asker {
 ask(request: AskRequest, options?: { readonly requestId?: string }): Promise<AskResponse>;
 cancel(id: string): boolean;
 /** Cancels only the request owning this client token, including before its POST arrives. */
 cancelRequest?(requestId: string): boolean;
 running(): { readonly id: string; readonly key: string; readonly startedAtMs: number } | null;
}

/** Client-generated UUID v4: bounded opaque ownership, never an account or a free-text identifier. */
export const isAskRequestId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const REQUEST_TOKEN_TTL_MS = 120_000;
const MAX_REQUEST_TOKENS = 512;

const MAX_TEXT = 300;
const MAX_FIELD = 80;
// measured on this machine: an ordinary click of three or four candidates cost 1480 to 1550 tokens, of which the question (the instructions and
// two criteria for each candidate) is most; the estimate before a call must not sit far below that, or the caps would not mean what they say
const PROMPT_OVERHEAD_TOKENS = 700;
const TOKENS_PER_CANDIDATE = 110;
const ANSWER_TOKENS = 200;
/** The closed questions of the filter mode, with every option described, are part of what the model reads. */
const FILTER_PROMPT_TOKENS = 700;
const FILTER_ANSWER_TOKENS = 60;
const BYTES_PER_TOKEN = 3;
/** The ecosystem mode asks, for each candidate, a stance and a driver, and three places for the ranking: the questions are most of what the model reads. */
const ECOSYSTEM_PROMPT_TOKENS = 1_200;
const ECOSYSTEM_TOKENS_PER_CANDIDATE = 330;
const ECOSYSTEM_ANSWER_TOKENS_PER_CANDIDATE = 40;

const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length >= 1 && value.length <= max;

function parseRequest(raw: unknown): AskRequest | null {
 if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
 const input = raw as Record<string, unknown>;
 for (const key of Object.keys(input)) if (key !== "modo" && key !== "alvo" && key !== "alvos" && key !== "textoLivre" && key !== "carteira" && key !== "redes" && key !== "saldo") return null;
 if (typeof input.modo !== "string" || !MODES.includes(input.modo)) return null;
 const modo = input.modo as AskMode;
 if (modo === "carteira") {
  if (input.alvo !== undefined || input.alvos !== undefined || input.textoLivre !== undefined) return null;
  const carteira = parsePortfolioInput(input.carteira);
  return carteira === null ? null : { modo, carteira };
 }
 if (modo === "ecossistema") {
  if (input.alvo !== undefined || input.alvos !== undefined || input.textoLivre !== undefined || input.carteira !== undefined) return null;
  let redes: string[] | undefined;
  if (input.redes !== undefined) {
   if (!Array.isArray(input.redes) || input.redes.length < 1 || input.redes.length > ECOSYSTEM_REDES_MAX) return null;
   redes = [];
   for (const chain of input.redes as unknown[]) {
    if (typeof chain !== "string" || !/^[1-9]\d{0,11}$/.test(chain) || redes.includes(chain)) return null;
    redes.push(chain);
   }
  }
  let saldo: Saldo | undefined;
  if (input.saldo !== undefined) {
   const parsed = parseSaldo(input.saldo);
   if (parsed === null) return null;
   saldo = parsed;
  }
  return { modo, ...(redes ? { redes } : {}), ...(saldo ? { saldo } : {}) };
 }
 if (input.redes !== undefined || input.saldo !== undefined) return null;
 if (input.carteira !== undefined) return null;
 if (modo === "ranking") {
  if (input.alvo !== undefined || input.textoLivre !== undefined || !Array.isArray(input.alvos)) return null;
  if (input.alvos.length < RANKING_MIN || input.alvos.length > RANKING_MAX) return null;
  const alvos: { instId: string }[] = [];
  for (const item of input.alvos as unknown[]) {
   if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
   const entry = item as Record<string, unknown>;
   // a row id reaches the Brief and the key of the request: only the exact id of a spot pair or a perpetual may pass, never a sentence
   if (Object.keys(entry).length !== 1 || !isText(entry.instId, MAX_FIELD)) return null;
   const type = instTypeOf(entry.instId);
   if (type !== "SPOT" && type !== "SWAP") return null;
   if (alvos.some((a) => a.instId === entry.instId)) return null;
   alvos.push({ instId: entry.instId });
  }
  return { modo, alvos };
 }
 if (input.alvos !== undefined) return null;
 let alvo: AskTarget | undefined;
 if (input.alvo !== undefined) {
  const t = input.alvo as Record<string, unknown> | null;
  if (t === null || typeof t !== "object" || Array.isArray(t)) return null;
  if (Object.keys(t).length === 1 && isText(t.instId, MAX_FIELD)) alvo = { instId: t.instId };
  else if (Object.keys(t).length === 2 && isText(t.chainIndex, 20) && isText(t.address, MAX_FIELD)) alvo = { chainIndex: t.chainIndex, address: t.address };
  else if (Object.keys(t).length === 1 && isText(t.chainIndex, 20)) alvo = { chainIndex: t.chainIndex };
  else return null;
 }
 if (modo === "filtro") {
  if (!isText(input.textoLivre, MAX_TEXT)) return null;
  return { modo, textoLivre: input.textoLivre, ...(alvo ? { alvo } : {}) };
 }
 if (input.textoLivre !== undefined) return null;
 return { modo, ...(alvo ? { alvo } : {}) };
}

/** The chosen instruments count as a set: the same ones in another order are the same request. */
const chosenKey = (request: AskRequest): string => (request.alvos === undefined ? "" : request.alvos.map((a) => a.instId).sort().join(","));
const keyOf = (request: AskRequest): string => request.modo === "carteira" && request.carteira
 ? `carteira|${request.carteira.chainIndex}|${request.carteira.assets.map((a) => a.contract).sort().join(",")}`
 : request.modo === "ecossistema"
  ? `ecossistema|${[...(request.redes ?? [])].sort().join(",")}`
  : `${request.modo}|${JSON.stringify(request.alvo ?? null)}|${chosenKey(request)}|${request.textoLivre ?? ""}`;
// Cooldown is per candidate set; sharing an in-flight answer additionally requires the exact wallet observation.
const observationKeyOf = (request: AskRequest): string | null => request.saldo ? JSON.stringify(request.saldo) : request.carteira ? JSON.stringify({ ...request.carteira, assets: [...request.carteira.assets].sort((a, b) => a.contract.localeCompare(b.contract)) }) : null;

interface InFlight {
 readonly id: string;
 readonly key: string;
 readonly observationKey: string | null;
 readonly startedAtMs: number;
 readonly controller: AbortController;
 readonly promise: Promise<AskResponse>;
 readonly requestId?: string;
 cancelled: boolean;
 timedOut: boolean;
}

interface LastCall {
 /** The Brief the answer was given for (null in the filter mode): the next click is compared with it by what it says, not by the clock. */
 readonly brief?: Brief | null;
 readonly atMs: number;
 /** Null in the filter mode, which has no Brief. */
 readonly briefHash: string | null;
 readonly response: AskResponse | null;
}

export function createAsker(deps: AskDeps): Asker {
 const { limits, ledger } = deps;
 let inflight: InFlight | null = null;
 const last = new Map<string, LastCall>();
 const requests = new Map<string, { requestKey: string | null; promise: Promise<AskResponse> | null; cancelled: boolean; expiresAtMs: number }>();
 const pruneRequests = () => {
  const nowMs = deps.now();
  for (const [requestId, request] of requests) if (request.expiresAtMs <= nowMs) requests.delete(requestId);
 };

 // read at the moment of each call: the person can give the price per token while the app runs (T7.4)
 const cost = (inputTokens: number, outputTokens: number): number | null => {
  const { input, output } = limits.usdPerMtok;
  return input !== null && output !== null ? (inputTokens * input + outputTokens * output) / 1_000_000 : null;
 };
 const estimateOf =
  deps.estimate ??
  ((brief: Brief) => {
   const ecosystem = "escopo" in brief.alvo && brief.alvo.escopo === "ecossistema";
   return ecosystem
    ? { inputTokens: Math.ceil(JSON.stringify(brief).length / BYTES_PER_TOKEN) + ECOSYSTEM_PROMPT_TOKENS + ECOSYSTEM_TOKENS_PER_CANDIDATE * brief.candidatos.length, outputTokens: ANSWER_TOKENS + ECOSYSTEM_ANSWER_TOKENS_PER_CANDIDATE * brief.candidatos.length }
    : { inputTokens: Math.ceil(JSON.stringify(brief).length / BYTES_PER_TOKEN) + PROMPT_OVERHEAD_TOKENS + TOKENS_PER_CANDIDATE * brief.candidatos.length, outputTokens: ANSWER_TOKENS };
  });

 const respond = (id: string, status: AskStatus, extra: Partial<AskResponse> = {}): AskResponse => ({
  ok: status === "respondido",
  id,
  status,
  custo: { chamadasOnchainos: null, tokens: null, usd: null },
  briefHash: null,
  advisory: true,
  execution: "never",
  ...extra,
 });

 // the daily dollar cap counts a call whose cost was not measured for its estimate, so a timeout cannot switch the cap off
 const committedToday = (nowMs: number): number | null => (ledger.committedTodayUsd ? ledger.committedTodayUsd(nowMs) : ledger.spentTodayUsd(nowMs));
 const resolveModel = (): InonuModel | null => (typeof deps.model === "function" ? deps.model() : deps.model);
 const resolveScreener = (): ScreenerModel | null => (typeof deps.screener === "function" ? deps.screener() : (deps.screener ?? null));
 const estimateFilterOf =
  deps.estimateFilter ?? ((state: ReturnType<typeof buildFilterState>) => ({ inputTokens: Math.ceil(JSON.stringify(state).length / BYTES_PER_TOKEN) + FILTER_PROMPT_TOKENS, outputTokens: FILTER_ANSWER_TOKENS }));

 /** The filter mode: no data is collected, the model reads the sentence, and the filter is built from the options it chose. */
 async function runFilter(state: InFlight, request: AskRequest, screener: ScreenerModel): Promise<AskResponse> {
  const { id } = state;
  let modelStarted = false;
  let estimatedUsd: number | null = null;
  const startedAt = performance.now();
  const timer = setTimeout(() => {
   state.timedOut = true;
   state.controller.abort();
  }, limits.timeoutMs);
  const entry = (over: Partial<LedgerEntry> & Pick<LedgerEntry, "resultado">): LedgerEntry => ({
   id,
   atMs: deps.now(),
   modo: "filtro",
   razao: "clique:filtro",
   briefHash: null,
   modelo: modelStarted ? screener.name : null,
   chamadasModelo: modelStarted ? 1 : 0,
   chamadasOnchainos: 0,
   tokensEntrada: null,
   tokensSaida: null,
   usd: null,
   usdEstimado: modelStarted ? estimatedUsd : null,
   latenciaMs: null,
   ...over,
  });
  try {
   const key = state.key;
   const filterState = buildFilterState(request.textoLivre ?? "");
   const previous = last.get(key);
   if (previous?.response?.filtro && deps.now() - previous.atMs < limits.reuseTtlMs) {
    return respond(id, "respondido", { filtro: previous.response.filtro, ...(previous.response.modelo ? { modelo: previous.response.modelo } : {}), reutilizado: true, custo: { chamadasOnchainos: 0, tokens: 0, usd: 0 } });
   }

   const estimate = estimateFilterOf(filterState);
   const usdEstimate = cost(estimate.inputTokens, estimate.outputTokens);
   estimatedUsd = usdEstimate;
   const refuse = (motivo: string) => {
    ledger.record(entry({ resultado: motivo }));
    return respond(id, "teto_atingido", { motivo, custo: { chamadasOnchainos: 0, tokens: null, usd: null } });
   };
   if (usdEstimate !== null && usdEstimate > limits.maxUsdPerRequest) return refuse("teto_por_pedido");
   const spent = committedToday(deps.now());
   if (usdEstimate !== null && spent !== null && spent + usdEstimate > limits.maxUsdPerDay) return refuse("teto_diario");
   if (ledger.callsToday(deps.now()) >= limits.maxCallsPerDay) return refuse("teto_de_chamadas");

   modelStarted = true;
   last.set(key, { atMs: deps.now(), briefHash: null, response: null }); // a paid call starts the cooldown even if the answer is bad
   const output = await screener.choose({ state: filterState, signal: state.controller.signal });
   const latenciaMs = Math.round(performance.now() - startedAt);

   const tokensEntrada = typeof output.usage?.inputTokens === "number" ? output.usage.inputTokens : null;
   const tokensSaida = typeof output.usage?.outputTokens === "number" ? output.usage.outputTokens : null;
   const measured = tokensEntrada !== null && tokensSaida !== null;
   const custo = { chamadasOnchainos: 0, tokens: measured ? tokensEntrada + tokensSaida : null, usd: measured ? cost(tokensEntrada, tokensSaida) : null };

   const verdict = filterFromChoices(output.raw);
   if (!verdict.ok) {
    ledger.record(entry({ resultado: `invalida:${verdict.reason}`, tokensEntrada, tokensSaida, usd: custo.usd, latenciaMs }));
    return respond(id, "erro", { motivo: `resposta_invalida:${verdict.reason}`, custo });
   }
   const response = respond(id, "respondido", { filtro: verdict.filtro, modelo: screener.name, reutilizado: false, custo });
   ledger.record(entry({ resultado: "respondido", tokensEntrada, tokensSaida, usd: custo.usd, latenciaMs }));
   last.set(key, { atMs: deps.now(), briefHash: null, response });
   return response;
  } catch {
   // nothing of the failure travels: its message may carry a value
   const motivo = state.cancelled ? "cancelado" : state.timedOut ? "tempo_esgotado" : modelStarted ? "modelo_falhou" : "coleta_falhou";
   ledger.record(entry({ resultado: state.cancelled ? "cancelado" : `erro:${motivo}`, latenciaMs: Math.round(performance.now() - startedAt) }));
   return state.cancelled ? respond(id, "cancelado", { motivo }) : respond(id, "erro", { motivo });
  } finally {
   clearTimeout(timer);
  }
 }

 async function run(state: InFlight, request: AskRequest, model: InonuModel): Promise<AskResponse> {
  const { id } = state;
  const evaluations: EvaluationUsage[] = [];
  const maxEvaluations = request.modo === "ecossistema" ? 2 : 1;
  const rates = { ...limits.usdPerMtok };
  const priced = (input: number, output: number): number | null => rates.input !== null && rates.output !== null
   ? (input * rates.input + output * rates.output) / 1_000_000 : null;
  const sum = (field: "tokensEntrada" | "tokensSaida" | "usd" | "usdEstimado"): number | null => evaluations.length > 0 && evaluations.every((evaluation) => evaluation[field] !== null)
   ? evaluations.reduce((total, evaluation) => total + evaluation[field]!, 0) : null;
  const measuredUsage = () => ({ tokensEntrada: sum("tokensEntrada"), tokensSaida: sum("tokensSaida"), usd: sum("usd") });
  let built: BuiltBrief | null = null;
  const startedAt = performance.now();
  // the age of a reading the page made is judged on the clock that stamped it (this machine's), not on the one corrected for the exchange signature
  const localNow = deps.localNow ?? deps.now;
  const timer = setTimeout(() => {
   state.timedOut = true;
   state.controller.abort();
  }, limits.timeoutMs);
  const entry = (over: Partial<LedgerEntry> & Pick<LedgerEntry, "resultado">): LedgerEntry => ({
   id,
   atMs: deps.now(),
   modo: request.modo,
   razao: `clique:${request.modo}`,
   briefHash: built?.brief.hash ?? null,
   modelo: evaluations.length > 0 ? model.name : null,
   chamadasModelo: evaluations.length as 0 | 1 | 2,
   chamadasOnchainos: built?.onchainosCalls ?? null,
   ...measuredUsage(),
   usdEstimado: sum("usdEstimado"),
   ...(evaluations.length > 0 ? { avaliacoes: evaluations.map((evaluation) => ({ ...evaluation })) } : {}),
   latenciaMs: null,
   ...over,
  });
  try {
   built = await deps.source.build(request, { signal: state.controller.signal, maxOnchainosCalls: MAX_ONCHAINOS_CALLS_PER_REQUEST });
   // a cancel or a timeout that landed while the data was being read must not become a paid call
   if (state.controller.signal.aborted) throw new Error("aborted");
   const { brief } = built;
   const onchainos = built.onchainosCalls;
   if (request.modo === "carteira" && (!request.carteira || !built.portfolio || !isPortfolioFresh(request.carteira, localNow()))) throw new SourceError("carteira_vencida", onchainos);
   // the balance the page read is judged on the clock that stamped it, and a click on an old one is refused BEFORE the model is asked
   if (request.modo === "ecossistema" && (!built.ecosystem || (request.saldo !== undefined && !isSaldoFresh(request.saldo, localNow())))) throw new SourceError("saldo_vencido", onchainos);

   if (onchainos !== null && onchainos > MAX_ONCHAINOS_CALLS_PER_REQUEST) {
    ledger.record(entry({ resultado: "teto_onchainos" }));
    return respond(id, "teto_atingido", { motivo: "teto_onchainos", briefHash: brief.hash, custo: { chamadasOnchainos: onchainos, tokens: null, usd: null } });
   }

   const key = state.key;
   const previous = last.get(key);
   // the hash holds the moment of the reading and the age of each datum, so it never repeats: the answer is reused when nothing material
   // changed (ING-2), that is, the same candidates in the same state, scores within ten points and the same runs
   const unchanged = previous?.briefHash === brief.hash || (request.modo !== "carteira" && request.modo !== "ecossistema" && previous?.brief != null && !materialChange(previous.brief, brief).changed);
   if (previous?.response?.oportunidades && request.modo === "ecossistema" && unchanged && deps.now() - previous.atMs < limits.reuseTtlMs) {
    return respond(id, "respondido", { oportunidades: previous.response.oportunidades, briefHash: brief.hash, reutilizado: true, custo: { chamadasOnchainos: onchainos, tokens: 0, usd: 0 } });
   }
   if (previous?.response?.carteira && request.modo === "carteira" && unchanged && deps.now() - previous.atMs < limits.reuseTtlMs) {
    return respond(id, "respondido", { carteira: previous.response.carteira, briefHash: brief.hash, reutilizado: true, custo: { chamadasOnchainos: onchainos, tokens: 0, usd: 0 } });
   }
   if (previous?.response?.decisao && request.modo !== "carteira" && unchanged && deps.now() - previous.atMs < limits.reuseTtlMs) {
    return respond(id, "respondido", { decisao: previous.response.decisao, briefHash: brief.hash, reutilizado: true, custo: { chamadasOnchainos: onchainos, tokens: 0, usd: 0 } });
   }

   const ids = candidateIds(request.modo === "carteira" ? brief.candidatos : built.candidates);
   const offeredIds = [...ids];
   const estimates = model.estimateEvaluations?.({ brief, ids: offeredIds, mode: request.modo })
    ?? Array.from({ length: maxEvaluations }, () => estimateOf(brief));
   if (estimates.length !== maxEvaluations || estimates.some((estimate) => !Number.isFinite(estimate.inputTokens) || estimate.inputTokens < 0 || !Number.isFinite(estimate.outputTokens) || estimate.outputTokens < 0)) throw new Error("invalid estimate");
   const stageEstimates = estimates.map((estimate) => priced(estimate.inputTokens, estimate.outputTokens));
   const usdEstimate = stageEstimates.every((estimate) => estimate !== null) ? stageEstimates.reduce<number>((total, estimate) => total + estimate!, 0) : null;
   const refuse = (motivo: string) => {
    ledger.record(entry({ resultado: motivo }));
    return respond(id, "teto_atingido", { motivo, briefHash: brief.hash, custo: { chamadasOnchainos: onchainos, tokens: null, usd: null } });
   };
   if (usdEstimate !== null && usdEstimate > limits.maxUsdPerRequest) return refuse("teto_por_pedido");
   const spent = committedToday(deps.now());
   if (usdEstimate !== null && spent !== null && spent + usdEstimate > limits.maxUsdPerDay) return refuse("teto_diario");
   if (ledger.callsToday(deps.now()) + maxEvaluations > limits.maxCallsPerDay) return refuse("teto_de_chamadas");

   const beforeStart = (indice: 1 | 2) => {
    if (state.controller.signal.aborted) throw new Error("aborted");
    if (indice !== evaluations.length + 1 || indice > maxEvaluations) throw new Error("invalid evaluation sequence");
    // Recheck the outstanding reservation using already measured spending before a second paid call.
    const projected = [...evaluations.map((evaluation) => evaluation.usd ?? evaluation.usdEstimado), ...stageEstimates.slice(evaluations.length)];
    const projectedUsd = projected.every((value) => value !== null) ? projected.reduce<number>((total, value) => total + value!, 0) : null;
    if (projectedUsd !== null && projectedUsd > limits.maxUsdPerRequest) throw new SourceError("teto_por_pedido", onchainos);
    const committed = committedToday(deps.now());
    if (projectedUsd !== null && committed !== null && committed + projectedUsd > limits.maxUsdPerDay) throw new SourceError("teto_diario", onchainos);
    if (ledger.callsToday(deps.now()) + maxEvaluations > limits.maxCallsPerDay) throw new SourceError("teto_de_chamadas", onchainos);
    evaluations.push({ indice, tokensEntrada: null, tokensSaida: null, usd: null, usdEstimado: stageEstimates[indice - 1]! });
    if (indice === 1) last.set(key, { atMs: deps.now(), briefHash: brief.hash, brief, response: null });
   };
   const onUsage = (indice: 1 | 2, usage: NonNullable<ModelOutput["usage"]>) => {
    if (indice !== evaluations.length) throw new Error("invalid usage sequence");
    const finite = (value: number | null): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const tokensEntrada = finite(usage.inputTokens);
    const tokensSaida = finite(usage.outputTokens);
    evaluations[indice - 1] = { ...evaluations[indice - 1]!, tokensEntrada, tokensSaida, usd: tokensEntrada !== null && tokensSaida !== null ? priced(tokensEntrada, tokensSaida) : null };
   };
   if (!model.tracksEvaluations) beforeStart(1);
   const output = await model.choose({ brief, ids: offeredIds, mode: request.modo, signal: state.controller.signal, evaluations: { beforeStart, onUsage } });
   if (!model.tracksEvaluations && output.usage) onUsage(1, output.usage);
   if (evaluations.length === 0) throw new Error("missing evaluation lifecycle");
   const latenciaMs = Math.round(performance.now() - startedAt);

   const { tokensEntrada, tokensSaida, usd } = measuredUsage();
   const measured = tokensEntrada !== null && tokensSaida !== null;
   const tokens = measured ? tokensEntrada + tokensSaida : null;
   const custo = { chamadasOnchainos: onchainos, tokens, usd };

   if (state.controller.signal.aborted) throw new Error("aborted");
   if (request.modo === "carteira") {
    if (!request.carteira || !built.portfolio || !isPortfolioFresh(request.carteira, localNow())) {
     ledger.record(entry({ resultado: "carteira_vencida", tokensEntrada, tokensSaida, usd, latenciaMs }));
     return respond(id, "erro", { motivo: "carteira_vencida", briefHash: brief.hash, custo });
    }
    const verdict = validatePortfolioDecision(output.raw, built.portfolio);
    if (!verdict.ok) {
     ledger.record(entry({ resultado: `invalida:${verdict.reason}`, tokensEntrada, tokensSaida, usd, latenciaMs }));
     return respond(id, "erro", { motivo: `resposta_invalida:${verdict.reason}`, briefHash: brief.hash, custo });
    }
    const carteira: PortfolioResult = { ...built.portfolio, assets: built.portfolio.assets.map((asset) => ({ ...asset, action: verdict.choices.find((choice) => choice.candidateId === asset.candidateId)!.action, model: model.name })) };
    const response = respond(id, "respondido", { carteira, briefHash: brief.hash, reutilizado: false, custo });
    ledger.record(entry({ resultado: "respondido", tokensEntrada, tokensSaida, usd, latenciaMs }));
    last.set(key, { atMs: deps.now(), briefHash: brief.hash, brief, response });
    return response;
   }

   if (request.modo === "ecossistema") {
    const verdict = validateEcosystem(output.raw, built.ecosystem!);
    if (!verdict.ok) {
     ledger.record(entry({ resultado: `invalida:${verdict.reason}`, tokensEntrada, tokensSaida, usd, latenciaMs }));
     return respond(id, "erro", { motivo: `resposta_invalida:${verdict.reason}`, briefHash: brief.hash, custo });
    }
    const response = respond(id, "respondido", { oportunidades: verdict.result, modelo: model.name, briefHash: brief.hash, reutilizado: false, custo });
    ledger.record(entry({ resultado: "respondido", tokensEntrada, tokensSaida, usd, latenciaMs }));
    last.set(key, { atMs: deps.now(), briefHash: brief.hash, brief, response });
    return response;
   }

   const verdict = validateDecision(output.raw, ids);
   if (!verdict.ok) {
    ledger.record(entry({ resultado: `invalida:${verdict.reason}`, tokensEntrada, tokensSaida, usd, latenciaMs }));
    return respond(id, "erro", { motivo: `resposta_invalida:${verdict.reason}`, briefHash: brief.hash, custo });
   }
   const { decision } = verdict;
   const response = respond(id, "respondido", {
    decisao: { action: decision.action, candidateId: decision.candidateId, pesos: decision.pesos, razao: `modelo escolheu ${decision.candidateId ?? "manter"} entre ${ids.size} candidatos`, modelo: model.name },
    briefHash: brief.hash,
    reutilizado: false,
    custo,
   });
   ledger.record(entry({ resultado: "respondido", tokensEntrada, tokensSaida, usd, latenciaMs }));
   last.set(key, { atMs: deps.now(), briefHash: brief.hash, brief, response });
   return response;
  } catch (error) {
   // nothing of the failure travels except the constant code of a SourceError: any other message may carry a value
   const motivo = state.cancelled ? "cancelado" : state.timedOut ? "tempo_esgotado" : error instanceof SourceError ? error.code : evaluations.length > 0 ? "modelo_falhou" : "coleta_falhou";
   // the provider calls that left before the refusal still count: a source that read and then refused says how many
   const spent = built?.onchainosCalls ?? (error instanceof SourceError ? error.onchainosCalls : null);
   ledger.record(entry({ resultado: state.cancelled ? "cancelado" : `erro:${motivo}`, latenciaMs: Math.round(performance.now() - startedAt), chamadasOnchainos: spent }));
   const usage = measuredUsage();
   const extra = { motivo, briefHash: built?.brief.hash ?? null, custo: { chamadasOnchainos: spent, tokens: usage.tokensEntrada !== null && usage.tokensSaida !== null ? usage.tokensEntrada + usage.tokensSaida : null, usd: usage.usd } };
   return state.cancelled ? respond(id, "cancelado", extra) : respond(id, motivo.startsWith("teto_") ? "teto_atingido" : "erro", extra);
  } finally {
   clearTimeout(timer);
  }
 }

 return {
  ask(raw, options) {
   const requestId = options?.requestId;
   if (requestId !== undefined && !isAskRequestId(requestId)) return Promise.resolve(respond(deps.newId(), "erro", { motivo: "pedido_invalido" }));
   const token = requestId?.toLowerCase();
   pruneRequests();
   const owned = token === undefined ? undefined : requests.get(token);
   if (owned?.cancelled) return Promise.resolve(respond(deps.newId(), "cancelado", { motivo: "cancelado" }));
   const request = parseRequest(raw);
   if (request === null) return Promise.resolve(respond(deps.newId(), "erro", { motivo: "pedido_invalido" }));
   const requestKey = JSON.stringify(request);
   if (owned) return owned.requestKey === requestKey && owned.promise ? owned.promise : Promise.resolve(respond(deps.newId(), "erro", { motivo: "pedido_invalido" }));
   if (token !== undefined && requests.size >= MAX_REQUEST_TOKENS) return Promise.resolve(respond(deps.newId(), "teto_atingido", { motivo: "teto_de_pedidos" }));
   const track = (promise: Promise<AskResponse>): Promise<AskResponse> => {
    if (token === undefined) return promise;
    // An unfinished token cannot expire and accidentally acquire ownership of another run.
    const record = { requestKey, promise: null as Promise<AskResponse> | null, cancelled: false, expiresAtMs: Infinity };
    record.promise = promise.then((response) => record.cancelled
     ? respond(response.id, "cancelado", { motivo: "cancelado", custo: response.custo, briefHash: response.briefHash })
     : response).finally(() => { record.expiresAtMs = deps.now() + REQUEST_TOKEN_TTL_MS; });
    requests.set(token, record);
    return record.promise;
   };
   const filterMode = request.modo === "filtro";
   const model = filterMode ? null : resolveModel();
   const screener = filterMode ? resolveScreener() : null;
   if (filterMode ? screener === null : model === null) return track(Promise.resolve(respond(deps.newId(), "sem_chave", { motivo: "sem_chave" })));
   const key = keyOf(request);
   const observationKey = observationKeyOf(request);
   if (inflight !== null) {
    if (inflight.key === key && inflight.observationKey === observationKey) return track(inflight.promise); // sharing an answer does not share cancellation ownership
    return track(Promise.resolve(respond(inflight.id, "em_andamento", { motivo: "em_andamento" })));
   }
   const previous = last.get(key);
   if (previous !== undefined && deps.now() - previous.atMs < limits.cooldownMs) return track(Promise.resolve(respond(deps.newId(), "cooldown", { motivo: "cooldown", briefHash: previous.briefHash })));

   const controller = new AbortController();
   const state = { id: deps.newId(), key, observationKey, startedAtMs: deps.now(), controller, cancelled: false, timedOut: false, ...(token ? { requestId: token } : {}) } as InFlight;
   const promise = (filterMode ? runFilter(state, request, screener!) : run(state, request, model!)).finally(() => {
    if (inflight === state) inflight = null;
   });
   (state as { promise: Promise<AskResponse> }).promise = promise;
   inflight = state;
   return track(promise);
  },

  cancel(id) {
   if (inflight === null || inflight.id !== id) return false;
   inflight.cancelled = true;
   inflight.controller.abort();
   return true;
  },

  cancelRequest(requestId) {
   if (!isAskRequestId(requestId)) return false;
   const token = requestId.toLowerCase();
   pruneRequests();
   const existing = requests.get(token);
   if (!existing && requests.size >= MAX_REQUEST_TOKENS) return false;
   if (existing) existing.cancelled = true;
   else requests.set(token, { requestKey: null, promise: null, cancelled: true, expiresAtMs: deps.now() + REQUEST_TOKEN_TTL_MS });
   if (inflight?.requestId === token) {
    inflight.cancelled = true;
    inflight.controller.abort();
   }
   return true;
  },

  running() {
   return inflight === null ? null : { id: inflight.id, key: inflight.key, startedAtMs: inflight.startedAtMs };
  },
 };
}
