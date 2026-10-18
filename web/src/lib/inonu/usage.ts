/**
 * What Settings shows about the Inonu (T7.4, CFG-5, CFG-8): the calls that reached the model, the tokens the provider measured, the
 * dollars only when the person gave a price, the latest calls, and the addresses the app talks to. Read strictly (a bad answer is no
 * answer) and written in plain words. The functions are pure; the client lives in client.ts.
 */
import { fmtNumber } from "../desk/ui/format";

const MAX_RECENT = 12;

export interface Totals {
  readonly calls: number;
  readonly usd: number | null;
  readonly tokens: number | null;
  readonly onchainosCalls: number;
  readonly avgLatencyMs: number | null;
}

export interface EvaluationUsage {
  readonly indice: 1 | 2;
  readonly tokensEntrada: number | null;
  readonly tokensSaida: number | null;
  readonly usd: number | null;
  readonly usdEstimado: number | null;
}

export interface RecentCall {
  readonly atMs: number;
  readonly modo: string;
  readonly modelo: string | null;
  readonly resultado: string;
  readonly tokens: number | null;
  readonly usd: number | null;
  readonly latenciaMs: number | null;
  readonly chamadasOnchainos: number | null;
  readonly chamadasModelo?: 0 | 1 | 2;
  readonly avaliacoes?: readonly EvaluationUsage[];
}

export interface Prices {
  readonly input: number | null;
  readonly output: number | null;
}

export interface Usage {
  readonly today: Totals;
  readonly month: Totals;
  readonly recent: readonly RecentCall[];
  readonly prices: Prices;
}

export interface ProviderRow {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly uso: string;
  readonly custo: string;
  readonly quemFala: string;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** A number, or null; undefined when it is neither (that is a bad answer). */
const numOrNull = (v: unknown): number | null | undefined => (v === null ? null : num(v) ? v : undefined);
const cut = (v: string, n: number): string => v.slice(0, n);

function parseTotals(raw: unknown): Totals | null {
  if (!isRec(raw) || !num(raw.calls) || !num(raw.onchainosCalls)) return null;
  const usd = numOrNull(raw.usd);
  const tokens = numOrNull(raw.tokens);
  const latency = numOrNull(raw.avgLatencyMs);
  if (usd === undefined || tokens === undefined || latency === undefined) return null;
  return { calls: raw.calls, usd, tokens, onchainosCalls: raw.onchainosCalls, avgLatencyMs: latency };
}

function parsePrices(raw: unknown): Prices | null {
  if (!isRec(raw)) return null;
  const input = numOrNull(raw.input);
  const output = numOrNull(raw.output);
  if (input === undefined || output === undefined) return null;
  if ((input === null) !== (output === null)) return null; // both or none
  if ((input !== null && input <= 0) || (output !== null && output <= 0)) return null;
  return { input, output };
}

function parseEvaluations(raw: unknown, count: 0 | 1 | 2 | undefined): EvaluationUsage[] | null {
  if (!Array.isArray(raw) || count === undefined || raw.length !== count) return null;
  const result: EvaluationUsage[] = [];
  for (const [index, stage] of raw.entries()) {
    if (!isRec(stage) || stage.indice !== index + 1) return null;
    const input = numOrNull(stage.tokensEntrada);
    const output = numOrNull(stage.tokensSaida);
    const usd = numOrNull(stage.usd);
    const estimate = numOrNull(stage.usdEstimado);
    if ([input, output, usd, estimate].some((v) => v === undefined || (v !== null && v < 0))) return null;
    if ((input !== null && !Number.isInteger(input)) || (output !== null && !Number.isInteger(output))) return null;
    result.push({ indice: stage.indice as 1 | 2, tokensEntrada: input!, tokensSaida: output!, usd: usd!, usdEstimado: estimate! });
  }
  return result;
}

export function parseUsage(raw: unknown): Usage | null {
  if (!isRec(raw) || raw.ok !== true || raw.advisory !== true || raw.execution !== "never") return null;
  const today = parseTotals(raw.today);
  const month = parseTotals(raw.month);
  const prices = parsePrices(raw.prices);
  if (today === null || month === null || prices === null || !Array.isArray(raw.recent)) return null;
  const recent: RecentCall[] = [];
  for (const item of raw.recent.slice(0, MAX_RECENT)) {
    if (!isRec(item) || !num(item.atMs) || typeof item.modo !== "string" || typeof item.resultado !== "string") return null;
    const tokens = numOrNull(item.tokens);
    const usd = numOrNull(item.usd);
    const latenciaMs = numOrNull(item.latenciaMs);
    const chamadasOnchainos = numOrNull(item.chamadasOnchainos);
    if (tokens === undefined || usd === undefined || latenciaMs === undefined || chamadasOnchainos === undefined) return null;
    if (item.modelo !== null && typeof item.modelo !== "string") return null;
    if (item.chamadasModelo !== undefined && item.chamadasModelo !== 0 && item.chamadasModelo !== 1 && item.chamadasModelo !== 2) return null;
    const chamadasModelo = item.chamadasModelo as 0 | 1 | 2 | undefined;
    const avaliacoes = item.avaliacoes === undefined ? undefined : parseEvaluations(item.avaliacoes, chamadasModelo);
    if (avaliacoes === null) return null;
    recent.push({ atMs: item.atMs, modo: cut(item.modo, 20), modelo: item.modelo === null ? null : cut(item.modelo as string, 40), resultado: cut(item.resultado, 60), tokens, usd, latenciaMs, chamadasOnchainos, ...(chamadasModelo === undefined ? {} : { chamadasModelo }), ...(avaliacoes === undefined ? {} : { avaliacoes }) });
  }
  return { today, month, recent, prices };
}

export function parseProviders(raw: unknown): ProviderRow[] | null {
  if (!isRec(raw) || raw.ok !== true || !Array.isArray(raw.providers)) return null;
  const rows: ProviderRow[] = [];
  for (const item of raw.providers) {
    if (!isRec(item)) return null;
    const { id, label, url, uso, custo, quemFala } = item;
    if (typeof id !== "string" || typeof label !== "string" || typeof url !== "string" || typeof uso !== "string" || typeof custo !== "string" || typeof quemFala !== "string") return null;
    rows.push({ id: cut(id, 30), label: cut(label, 80), url: cut(url, 120), uso: cut(uso, 200), custo: cut(custo, 200), quemFala: cut(quemFala, 120) });
  }
  return rows;
}

const usdText = (usd: number): string => `US$ ${usd.toFixed(usd < 0.01 ? 4 : 2).replace(".", ",")}`;

/** "2 consultas ao modelo, 1.500 tokens, custo em dolar nao medido": it counts the calls that reached the model, not the requests a cap or a refusal stopped. */
export function totalsLine(t: Totals): string {
  if (t.calls === 0) return "nenhuma consulta ao modelo";
  const calls = `${t.calls} ${t.calls === 1 ? "consulta" : "consultas"} ao modelo`;
  const tokens = t.tokens === null ? "tokens nao medidos" : `${fmtNumber(t.tokens, 0)} tokens`;
  const usd = t.usd === null ? "custo em dolar nao medido" : usdText(t.usd);
  return `${calls}, ${tokens}, ${usd}`;
}

export function priceLine(p: Prices): string {
  if (p.input === null || p.output === null) return "Preco por milhao de tokens: nao informado, entao o custo em dolar nao e medido e os tetos em dolar nao valem";
  return `Preco por milhao de tokens: US$ ${String(p.input).replace(".", ",")} de entrada e US$ ${String(p.output).replace(".", ",")} de saida`;
}

function agoText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "agora";
  if (s < 60) return `ha ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `ha ${h} h` : `ha ${Math.floor(h / 24)} d`;
}

const REFUSED: Readonly<Record<string, string>> = {
  sem_sinais: "sem registros de carteiras",
  sem_candidatos: "sem candidatos",
  sem_dados_onchain: "sem dados da OnchainOS",
  sem_credencial_onchainos: "sem credencial da OnchainOS",
  tempo_esgotado: "tempo esgotado",
  modelo_falhou: "o modelo falhou",
  coleta_falhou: "leitura falhou",
  instrumento_nao_suportado: "ativo nao suportado",
  alvo_invalido: "ativo invalido",
  brief_grande_demais: "dados grandes demais",
  modo_nao_disponivel: "pedido nao disponivel",
  cancelado: "cancelado",
};

/**
 * How a request ended, in words. The ledger keeps the codes of the pipeline (some are English, and one carries the word of an order);
 * what the person reads is Portuguese, and a code this function does not know is never shown raw.
 */
export function resultText(resultado: string): string {
  if (resultado === "respondido") return "respondido";
  if (resultado === "cancelado") return "cancelado";
  if (resultado.startsWith("teto_")) return "teto atingido";
  if (resultado.startsWith("invalida:")) return "resposta descartada";
  if (resultado.startsWith("erro:")) {
    const code = resultado.slice(5);
    return `recusado (${code.startsWith("okx_") ? "a OKX nao respondeu" : REFUSED[code] ?? "sem detalhe"})`;
  }
  return "sem detalhe";
}

/** One latest call in a line: when, what, which model, how it ended and what it measured. */
export function recentLine(c: RecentCall, nowMs: number): string {
  const parts = [agoText(nowMs - c.atMs), c.modo, c.modelo ?? "sem modelo", resultText(c.resultado)];
  if (c.chamadasModelo !== undefined && c.chamadasModelo > 0) parts.push(`${c.chamadasModelo} ${c.chamadasModelo === 1 ? "avaliacao" : "avaliacoes"}`);
  if (c.modelo !== null || c.tokens !== null) parts.push(c.tokens === null ? "tokens nao medidos" : `${fmtNumber(c.tokens, 0)} tokens`);
  if (c.latenciaMs !== null) parts.push(`${fmtNumber(c.latenciaMs / 1000, 1)} s`);
  return parts.join(", ");
}

const TAIL_LINES = 5;

export interface LedgerTail {
  readonly headline: string;
  readonly recent: readonly string[];
}

/**
 * What the Inonu tab shows under the button that asks (T4.5): the totals of the day and the latest requests of the ledger, newest first.
 * `undefined` is "not read yet" and `null` is "could not be read": neither is shown as zeros, because zero requests is an answer too.
 */
export function tailOf(usage: Usage | null | undefined, nowMs: number): LedgerTail {
  if (usage === undefined) return { headline: "Lendo o registro de pedidos", recent: [] };
  if (usage === null) return { headline: "O registro de pedidos nao esta disponivel agora", recent: [] };
  return { headline: `Hoje: ${totalsLine(usage.today)}`, recent: usage.recent.slice(0, TAIL_LINES).map((call) => recentLine(call, nowMs)) };
}
