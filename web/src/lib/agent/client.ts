/**
 * The screen's client of the autonomous agent (src/agent/http.ts). Every write carries the intent header that says a person acted; every failure is a NAMED outcome so the screen can say what happened and
 * never throws. The base is the core's own origin (empty in the installed app, the development core in dev). The person does one thing here: connect (and, if they wish, disconnect).
 */
import { parseAnalysis } from "../hud/parse-analysis";
import type { Analysis } from "../hud/types";
import { parseStatus } from "./parse";
import type { AgentStatus } from "./types";
import { parseDevStatus } from "./dev-status";
import type { DevAgentStatus } from "./dev-status";

/** The version of the notice the person reads when connecting. It is the proof, sent with the connection, that they saw this text: the core refuses a connection under any other. */
export const DISCLOSURE = "2026-10-14.1";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type Failure = { readonly ok: false; readonly reason: string };
export type Outcome<T> = ({ readonly ok: true } & T) | Failure;

const intent = { "x-inonu-intent": "user" };
const JSON_HEADERS = { "content-type": "application/json", ...intent };

const isRec = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

async function failureOf(res: Response | null, body: unknown): Promise<Failure> {
 if (res === null) return { ok: false, reason: "sem_conexao" };
 if (isRec(body) && typeof body.code === "string" && /^[a-z_]{1,50}$/.test(body.code)) return { ok: false, reason: body.code };
 if (res.status === 404) return { ok: false, reason: "servidor_sem_rota" };
 if (res.status === 403) return { ok: false, reason: "origem_negada" };
 return { ok: false, reason: "servidor_com_erro" };
}

export interface ConnectInput {
 /** Addresses of the wallet the person connected in the browser, when there is one; the agent's own wallet comes with the sign-in that follows. */
 readonly managed?: { readonly kind: "propria"; readonly evm: string | null; readonly solana: string | null };
}

export function createAgentClient(base: string = process.env.NEXT_PUBLIC_API_URL ?? "", fetchImpl: FetchLike = (url, init) => fetch(url, init), development = process.env.NEXT_PUBLIC_INONU_DEV === "1") {
 const readBase = development ? "/api/dev-agent" : base;
 async function call(method: string, path: string, body?: unknown): Promise<{ res: Response | null; json: unknown }> {
  if (development && method !== "GET") return { res: null, json: null };
  let res: Response;
  try {
   res = await fetchImpl(`${readBase}${path}`, { method, headers: method === "GET" ? {} : JSON_HEADERS, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store" });
  } catch {
   return { res: null, json: null };
  }
  const json: unknown = await res.json().catch(() => null);
  return { res, json };
 }
 const done = (res: Response | null, json: unknown): boolean => res !== null && res.ok && isRec(json) && json.ok === true;

 const readOnlyFailure: Failure = { ok: false, reason: "dev_somente_leitura" };

 return {
  async status(): Promise<Outcome<{ status: AgentStatus }>> {
   const { res, json } = await call("GET", "/agent/status");
   if (res === null) return failureOf(null, null);
   const status = parseStatus(json);
   if (status !== null) return { ok: true, status };
   return res.ok ? { ok: false, reason: "resposta_invalida" } : failureOf(res, json);
  },

  /** A narrow in-memory projection for the local development review panel. */
  async devStatus(): Promise<Outcome<{ status: DevAgentStatus }>> {
   const { res, json } = await call("GET", "/agent/dev-status");
   if (res === null) return failureOf(null, null);
   const status = parseDevStatus(json);
   if (status !== null) return { ok: true, status };
   return res.ok ? { ok: false, reason: "resposta_invalida" } : failureOf(res, json);
  },

  /** The study of the decisions (src/agent/analysis.ts), for the command centre. An older core has no such route: that is a named failure and the screen says it has no analysis. */
  async analysis(reviewPage = 1): Promise<Outcome<{ analysis: Analysis }>> {
   const { res, json } = await call("GET", `/agent/analysis?reviewPage=${reviewPage}`);
   if (res === null) return failureOf(null, null);
   const parsed = parseAnalysis(json);
   if (parsed !== null) {
    if (parsed.cycleReviewPage !== undefined) return { ok: true, analysis: parsed };
    const reviews = parsed.cycleReviews ?? [];
    const total = reviews.length, pageSize = 12, totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(reviewPage, totalPages), end = total - (page - 1) * pageSize;
    return { ok: true, analysis: { ...parsed, cycleReviews: reviews.slice(Math.max(0, end - pageSize), end), cycleReviewPage: { page, pageSize, total, totalPages } } };
   }
   return res.ok ? { ok: false, reason: "resposta_invalida" } : failureOf(res, json);
  },

  /** The one authorization: connecting, with the version of the notice the person read. */
  async connect(input: ConnectInput = {}): Promise<Outcome<object>> {
   if (development) return readOnlyFailure;
   const { res, json } = await call("POST", "/agent/connect", { disclosure: DISCLOSURE, ...(input.managed === undefined ? {} : { managed: input.managed }) });
   return done(res, json) ? { ok: true } : failureOf(res, json);
  },

  async disconnect(): Promise<Outcome<object>> {
   if (development) return readOnlyFailure;
   const { res, json } = await call("POST", "/agent/disconnect", {});
   return done(res, json) ? { ok: true } : failureOf(res, json);
  },

  /** Connecting the wallet the agent trades from: install the tool, start the sign-in on OKX's page, look whether it is done. */
  async wallet(action: "install" | "login" | "poll"): Promise<Outcome<object>> {
   if (development) return readOnlyFailure;
   const { res, json } = await call("POST", "/agent/wallet", { action });
   return done(res, json) ? { ok: true } : failureOf(res, json);
  },

  /** The person's word on an order that was sent without an answer, after looking at the wallet's own history. */
  async resolve(orderKey: string, outcome: "executada" | "falhou"): Promise<Outcome<object>> {
   if (development) return readOnlyFailure;
   const { res, json } = await call("POST", "/agent/resolve", { orderKey, outcome });
   return done(res, json) ? { ok: true } : failureOf(res, json);
  },
 };
}

export type AgentClient = ReturnType<typeof createAgentClient>;
