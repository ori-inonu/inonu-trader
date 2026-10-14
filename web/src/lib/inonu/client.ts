/**
 * The desk's client of "Pedir ao Inonu" (ASK-2, ASK-5, ASK-11). It sends the intent header that says a person clicked, reads
 * the answer strictly (the contract is closed: a status, an action of buy, sell or hold, advisory true, execution never), and
 * turns every transport failure into a NAMED outcome so the screen can say what happened instead of throwing.
 */
import { parsePortfolioAnswer, type PortfolioAnswer, type PortfolioRequest } from "./portfolio";
import { parseEcoAnswer, type EcoAnswer } from "../opportunity/picks";
import type { SaldoPayload } from "../opportunity/saldo";
import { parseVeredito } from "../veredito/parse";
import type { Veredito } from "../veredito/types";

export type AskStatus = "respondido" | "em_andamento" | "teto_atingido" | "cooldown" | "cancelado" | "sem_chave" | "erro";
export type AskAction = "buy" | "sell" | "hold";

export interface AskDecision {
  readonly action: AskAction;
  readonly candidateId: string | null;
  readonly pesos: Readonly<Record<string, number>> | null;
  readonly razao: string;
  readonly modelo: string;
}

export interface AskAnswer {
  readonly ok: boolean;
  readonly id: string;
  readonly status: AskStatus;
  readonly decisao?: AskDecision;
  readonly filtro?: AskFilter;
  readonly carteira?: PortfolioAnswer;
  /** The picks of the Inonu among the tokens of the ecosystem, with the size and the dollars the core computed from the balance (RAS-8). */
  readonly oportunidades?: EcoAnswer;
  /** The Veredito of a click about one instrument: the model's action with a plan and reasons in plain words (VER-1). */
  readonly veredito?: Veredito;
  /** Which model answered a filter request; provenance only. */
  readonly modelo?: string;
  readonly custo: { readonly chamadasOnchainos: number | null; readonly tokens: number | null; readonly usd: number | null };
  readonly briefHash: string | null;
  readonly reutilizado?: boolean;
  readonly motivo?: string;
  readonly advisory: true;
  readonly execution: "never";
}

export type AskRequest =
  | PortfolioRequest
  | { readonly modo: "ativo"; readonly alvo: { readonly instId: string } }
  /** An on-chain token in focus: asked through the OnchainOS gateway, chain and address only. */
  | { readonly modo: "token"; readonly alvo: { readonly chainIndex: string; readonly address: string } }
  /** The best entries now on one network, asked from the top bar (ASK-12). */
  | { readonly modo: "descoberta"; readonly alvo: { readonly chainIndex: string } }
  /** The two to five rows ticked in the Rastreador, ranked in one Brief (RAS-6). */
  | { readonly modo: "ranking"; readonly alvos: readonly { readonly instId: string }[] }
  /** The Rastreador "Perguntar ao Inonu": a sentence, answered as a filter (RAS-5). */
  | { readonly modo: "filtro"; readonly textoLivre: string }
  /** The best opportunities of the ecosystem (RAS-8): the networks are the core's choice unless given, and the balance, read at the click, only sizes the picks. */
  | { readonly modo: "ecossistema"; readonly redes?: readonly string[]; readonly saldo?: SaldoPayload };

/** The filter the model's options built (src/inonu/screener.ts). The sort keys are the ones the table of the Rastreador has. */
export interface AskFilter {
  readonly mercado: "todos" | "spot" | "perp";
  readonly volUsdMin: number | null;
  readonly varMin: number | null;
  readonly varMax: number | null;
  readonly rankMax: number | null;
  readonly apenasFixados: boolean;
  readonly ordenar: { readonly chave: "volUsd24h" | "var24hPct" | "preco"; readonly direcao: "asc" | "desc" };
}

export interface EngineInstrument {
  readonly instId: string;
  readonly closedCandles: number;
  readonly needed: number;
  readonly lastTradeAgeMs: number | null;
}

export interface InonuStatus {
  readonly modelConfigured: boolean;
  readonly running: { readonly id: string } | null;
  readonly today: { readonly calls: number; readonly usd: number | null };
  readonly engine: { readonly feedState: string | null; readonly messagesPerSecond: number; readonly instruments: readonly EngineInstrument[] };
}

const STATUSES: readonly string[] = ["respondido", "em_andamento", "teto_atingido", "cooldown", "cancelado", "sem_chave", "erro"];
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOrNull = (v: unknown): number | null | undefined => (v === null ? null : typeof v === "number" && Number.isFinite(v) ? v : undefined);

const FILTER_KEYS = ["mercado", "volUsdMin", "varMin", "varMax", "rankMax", "apenasFixados", "ordenar"];

/** The closed shape of a filter, or null: nothing outside it is trusted. */
export function parseFilter(raw: unknown): AskFilter | null {
  if (!isRec(raw) || Object.keys(raw).length !== FILTER_KEYS.length || !FILTER_KEYS.every((k) => k in raw)) return null;
  if (raw.mercado !== "todos" && raw.mercado !== "spot" && raw.mercado !== "perp") return null;
  const volUsdMin = numOrNull(raw.volUsdMin);
  const varMin = numOrNull(raw.varMin);
  const varMax = numOrNull(raw.varMax);
  if (volUsdMin === undefined || varMin === undefined || varMax === undefined) return null;
  if (raw.rankMax !== null && !(typeof raw.rankMax === "number" && Number.isInteger(raw.rankMax) && raw.rankMax >= 1)) return null;
  if (typeof raw.apenasFixados !== "boolean") return null;
  const order = raw.ordenar;
  if (!isRec(order) || Object.keys(order).length !== 2) return null;
  if (order.chave !== "volUsd24h" && order.chave !== "var24hPct" && order.chave !== "preco") return null;
  if (order.direcao !== "asc" && order.direcao !== "desc") return null;
  return { mercado: raw.mercado, volUsdMin, varMin, varMax, rankMax: raw.rankMax as number | null, apenasFixados: raw.apenasFixados, ordenar: { chave: order.chave, direcao: order.direcao } };
}

export function parseAnswer(raw: unknown): AskAnswer | null {
  if (!isRec(raw)) return null;
  if (typeof raw.ok !== "boolean" || typeof raw.id !== "string" || typeof raw.status !== "string" || !STATUSES.includes(raw.status)) return null;
  if (raw.advisory !== true || raw.execution !== "never") return null;
  const custo = raw.custo;
  if (!isRec(custo)) return null;
  const onchainos = numOrNull(custo.chamadasOnchainos);
  const tokens = numOrNull(custo.tokens);
  const usd = numOrNull(custo.usd);
  if (onchainos === undefined || tokens === undefined || usd === undefined) return null;
  if (raw.briefHash !== null && typeof raw.briefHash !== "string") return null;

  let decisao: AskDecision | undefined;
  if (raw.decisao !== undefined) {
    const d = raw.decisao;
    if (!isRec(d) || (d.action !== "buy" && d.action !== "sell" && d.action !== "hold")) return null;
    if (d.candidateId !== null && typeof d.candidateId !== "string") return null;
    if (typeof d.razao !== "string" || typeof d.modelo !== "string") return null;
    const pesos = isRec(d.pesos) && Object.values(d.pesos).every((v) => typeof v === "number" && Number.isFinite(v)) ? (d.pesos as Record<string, number>) : null;
    decisao = { action: d.action, candidateId: d.candidateId, pesos, razao: d.razao.slice(0, 200), modelo: d.modelo.slice(0, 64) };
  }
  let filtro: AskFilter | undefined;
  if (raw.filtro !== undefined) {
    const parsed = parseFilter(raw.filtro);
    if (parsed === null) return null;
    filtro = parsed;
  }
  let carteira: PortfolioAnswer | undefined;
  if (raw.carteira !== undefined) {
    const parsed = parsePortfolioAnswer(raw.carteira);
    if (parsed === null) return null;
    carteira = parsed;
  }
  let oportunidades: EcoAnswer | undefined;
  if (raw.oportunidades !== undefined) {
    const parsed = parseEcoAnswer(raw.oportunidades);
    if (parsed === null) return null;
    oportunidades = parsed;
  }
  // a Veredito that is not exactly the documented shape is dropped, and the answer is shown as it was before
  const veredito = raw.veredito === undefined ? null : parseVeredito(raw.veredito);
  return {
    ok: raw.ok,
    id: raw.id,
    status: raw.status as AskStatus,
    ...(decisao ? { decisao } : {}),
    ...(filtro ? { filtro } : {}),
    ...(carteira ? { carteira } : {}),
    ...(oportunidades ? { oportunidades } : {}),
    ...(veredito ? { veredito } : {}),
    ...((filtro || oportunidades) && typeof raw.modelo === "string" ? { modelo: raw.modelo.slice(0, 64) } : {}),
    custo: { chamadasOnchainos: onchainos, tokens, usd },
    briefHash: raw.briefHash as string | null,
    ...(typeof raw.reutilizado === "boolean" ? { reutilizado: raw.reutilizado } : {}),
    ...(typeof raw.motivo === "string" ? { motivo: raw.motivo.slice(0, 80) } : {}),
    advisory: true,
    execution: "never",
  };
}

export function parseStatus(raw: unknown): InonuStatus | null {
  if (!isRec(raw) || raw.ok !== true || typeof raw.modelConfigured !== "boolean") return null;
  const today = raw.today;
  if (!isRec(today) || typeof today.calls !== "number") return null;
  const usd = numOrNull(today.usd);
  if (usd === undefined) return null;
  const engine = isRec(raw.engine) ? raw.engine : {};
  const feed = isRec(engine.feed) ? engine.feed : null;
  const instruments = Array.isArray(engine.instruments)
    ? engine.instruments.flatMap((i): EngineInstrument[] => {
        if (!isRec(i) || typeof i.instId !== "string" || typeof i.closedCandles !== "number" || typeof i.needed !== "number") return [];
        const age = numOrNull(i.lastTradeAgeMs);
        return [{ instId: i.instId, closedCandles: i.closedCandles, needed: i.needed, lastTradeAgeMs: age === undefined ? null : age }];
      })
    : [];
  return {
    modelConfigured: raw.modelConfigured,
    running: isRec(raw.running) && typeof raw.running.id === "string" ? { id: raw.running.id } : null,
    today: { calls: today.calls, usd },
    engine: { feedState: feed !== null && typeof feed.state === "string" ? feed.state : null, messagesPerSecond: typeof engine.messagesPerSecond === "number" ? engine.messagesPerSecond : 0, instruments },
  };
}

import { parseProviders, parseUsage, type ProviderRow, type Usage } from "./usage";

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;

const failure = (status: AskStatus, motivo: string): AskAnswer => ({ ok: false, id: "", status, motivo, briefHash: null, custo: { chamadasOnchainos: null, tokens: null, usd: null }, advisory: true, execution: "never" });

export function createInonuClient(base: string = process.env.NEXT_PUBLIC_API_URL ?? "", fetchImpl: FetchLike = (url, init) => fetch(url, init)) {
  const intent = { "x-inonu-intent": "user" };
  return {
    async ask(request: AskRequest, signal?: AbortSignal, requestId?: string): Promise<AskAnswer> {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/inonu/ask`, { method: "POST", headers: { "content-type": "application/json", ...intent, ...(requestId ? { "x-inonu-request-id": requestId } : {}) }, body: JSON.stringify(request), ...(signal ? { signal } : {}) });
      } catch {
        return failure("erro", "sem_conexao");
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // a non JSON page still has a status
      }
      const answer = parseAnswer(body);
      if (answer) return answer;
      if (res.status === 404) return failure("erro", "servidor_sem_rota");
      if (res.status === 403) return failure("erro", "origem_negada");
      return failure("erro", res.ok ? "resposta_invalida" : "servidor_com_erro");
    },

    async cancelRequest(requestId: string): Promise<boolean> {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return false;
      try {
        const res = await fetchImpl(`${base}/inonu/request/${requestId}`, { method: "DELETE", headers: intent });
        const body: unknown = await res.json().catch(() => null);
        return res.ok && isRec(body) && body.ok === true;
      } catch { return false; }
    },

    async cancel(id: string): Promise<boolean> {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return false;
      try {
        const res = await fetchImpl(`${base}/inonu/ask/${id}`, { method: "DELETE", headers: intent });
        const body: unknown = await res.json().catch(() => null);
        return res.ok && isRec(body) && body.ok === true;
      } catch {
        return false;
      }
    },

    /** What the ledger measured and the price per token in force (T7.4); null when the core has no such route. */
    async usage(): Promise<Usage | null> {
      try {
        const res = await fetchImpl(`${base}/inonu/ledger`, { method: "GET" });
        if (!res.ok) return null;
        return parseUsage(await res.json().catch(() => null));
      } catch {
        return null;
      }
    },

    /** Both prices per million tokens, or both null to clear. */
    async setPrices(input: number | null, output: number | null): Promise<{ ok: true } | { ok: false; reason: string }> {
      try {
        const res = await fetchImpl(`${base}/inonu/prices`, { method: "PUT", headers: { "content-type": "application/json", ...intent }, body: JSON.stringify({ input, output }) });
        const body: unknown = await res.json().catch(() => null);
        if (res.ok && isRec(body) && body.ok === true) return { ok: true };
        return { ok: false, reason: isRec(body) && typeof body.code === "string" ? body.code.slice(0, 40) : res.status === 404 ? "servidor_sem_rota" : "servidor_com_erro" };
      } catch {
        return { ok: false, reason: "sem_conexao" };
      }
    },

    /** The addresses the app talks to (the manifest of the core). */
    async providers(): Promise<ProviderRow[] | null> {
      try {
        const res = await fetchImpl(`${base}/inonu/providers`, { method: "GET" });
        if (!res.ok) return null;
        return parseProviders(await res.json().catch(() => null));
      } catch {
        return null;
      }
    },

    async status(): Promise<InonuStatus | null> {
      try {
        const res = await fetchImpl(`${base}/inonu/status`, { method: "GET" });
        if (!res.ok) return null;
        return parseStatus(await res.json().catch(() => null));
      } catch {
        return null;
      }
    },
  };
}

export type InonuClient = ReturnType<typeof createInonuClient>;
