import type { DeskFeedStatus } from "../desk/types";
import type { SystemOneCycleView } from "../system-one";
import { readAgeMs, readFreshness, type JevAction, type JevReadBoardState, type JevReadBoardView, type JevReadView, type ReadFreshness } from "../jev-read";

/**
 * View models of the desk. Everything the Jev stage, the health rail and the dock show is derived here from observed
 * state: when an input is missing the model says so in words and carries no number. Nothing is defaulted to a plausible
 * value, and none of the text contains a middle dot, an em dash or an en dash.
 */

export const FORBIDDEN_TEXT = new RegExp(`[${String.fromCharCode(0xb7, 0x2014, 0x2013)}]`);
export const UNAVAILABLE = "Indisponivel";

export type StageTone = "buy" | "sell" | "hold" | "late" | "neutral";

const ACTION_LABEL: Record<JevAction, string> = { buy: "Comprar", sell: "Vender", hold: "Manter" };
const ACTION_HEADLINE: Record<JevAction, string> = { buy: "COMPRAR", sell: "VENDER", hold: "MANTER" };
const STATUS_LABEL: Record<string, string> = { error: "erro do provedor", timeout: "tempo esgotado", malformed: "resposta invalida" };
const REASON_LABEL: Record<string, string> = {
  book_missing: "livro de ofertas ausente",
  book_stale: "livro de ofertas velho",
  book_crossed: "livro de ofertas cruzado",
  ticker_missing: "preco ausente",
  ticker_stale: "preco velho",
  candles_short: "velas insuficientes",
  candles_stale: "velas velhas",
  clock_unknown: "relogio da OKX ainda nao medido",
  trades_unavailable: "fita de negocios indisponivel",
};

export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? "dado insuficiente";
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number, digits: number) => `${value > 0 ? "+" : ""}${value.toFixed(digits).replace(".", ",")}`;
const plain = (value: number, digits: number) => value.toFixed(digits).replace(".", ",");

export interface StageProbability {
  readonly key: JevAction;
  readonly label: string;
  readonly p: number | null;
}

export interface JevStageModel {
  readonly instId: string;
  readonly tone: StageTone;
  readonly headline: string;
  readonly statusLine: string;
  readonly freshness: ReadFreshness | null;
  readonly ageMs: number | null;
  readonly dimmed: boolean;
  readonly probabilities: readonly StageProbability[];
  readonly confidenceText: string;
  readonly model: string | null;
  readonly latencyMs: number | null;
  readonly seen: readonly { readonly label: string; readonly value: string }[];
  readonly advisoryNote: string;
}

export interface JevStageInput {
  readonly status: JevReadBoardState["status"];
  readonly board: JevReadBoardView | null;
  readonly focus: string;
  readonly nowMs: number;
  /** Exchange clock minus browser clock, null until measured. */
  readonly browserSkewMs: number | null;
}

const ADVISORY = "Leitura consultiva do Jev: nao executa ordem nem assina nada.";
const EMPTY_PROBABILITIES: readonly StageProbability[] = (["buy", "sell", "hold"] as const).map((key) => ({ key, label: ACTION_LABEL[key], p: null }));

function empty(instId: string, headline: string, statusLine: string): JevStageModel {
  return { instId, tone: "neutral", headline, statusLine, freshness: null, ageMs: null, dimmed: false, probabilities: EMPTY_PROBABILITIES, confidenceText: UNAVAILABLE, model: null, latencyMs: null, seen: [], advisoryNote: ADVISORY };
}

function seenOf(read: JevReadView): { label: string; value: string }[] {
  const s = read.state;
  if (s === null) return [];
  const f = s.flow60s;
  return [
    { label: "Spread", value: `${plain(s.spreadBps, 2)} bps` },
    { label: "Desequilibrio do livro", value: signed(s.bookImbalanceTop5, 2) },
    { label: "Fluxo agressor 60 s", value: f.imbalance === null ? "Sem negocios" : `${signed(f.imbalance, 2)} em ${f.count} negocios` },
    { label: "Retorno 5 min", value: `${signed(s.returnsBps.m5, 1)} bps` },
    { label: "Retorno 30 min", value: `${signed(s.returnsBps.m30, 1)} bps` },
    { label: "Volatilidade", value: `${plain(s.volBpsPerMinute, 1)} bps por minuto` },
  ];
}

export function jevStageModel(input: JevStageInput): JevStageModel {
  const { status, board, focus, nowMs, browserSkewMs } = input;
  if (board === null) {
    if (status === "absent") return empty(focus, "INDISPONIVEL", "O produtor de leituras do Jev nao esta rodando. Inicie com: bun run jev-read --jev");
    if (status === "error") return empty(focus, "INDISPONIVEL", "O backend das leituras do Jev nao respondeu. Verifique a origem permitida e o servico.");
    return empty(focus, "AGUARDANDO", "Consultando o Jev");
  }
  const read = board.reads[focus] ?? null;
  if (read === null) {
    const others = Object.keys(board.reads).length;
    return empty(focus, "AGUARDANDO", others > 0 ? `O Jev ainda nao leu ${focus}. Ele le um mercado por vez, em rodizio.` : `O Jev ainda nao leu ${focus}.`);
  }

  const ageMs = readAgeMs(read, nowMs, browserSkewMs);
  const freshness = readFreshness(ageMs);
  const connection = status === "error" ? " Conexao com o backend perdida: mostrando a ultima leitura." : "";
  const base = { instId: focus, freshness, ageMs, model: read.decision?.model ?? null, latencyMs: read.decision?.latencyMs ?? null, seen: seenOf(read), advisoryNote: ADVISORY };

  if (read.decision === null && read.state === null) {
    return { ...base, tone: "neutral", headline: "SEM LEITURA", statusLine: `O Jev nao foi consultado: ${read.insufficient.map(reasonLabel).join(", ") || "dado insuficiente"}.${connection}`, dimmed: false, probabilities: EMPTY_PROBABILITIES, confidenceText: UNAVAILABLE };
  }
  if (read.decision === null) {
    return { ...base, tone: "neutral", headline: "SEM DECISAO", statusLine: `Estado registrado em modo observacao: o produtor nao consulta o modelo.${connection}`, dimmed: false, probabilities: EMPTY_PROBABILITIES, confidenceText: UNAVAILABLE };
  }

  const d = read.decision;
  const probabilities = (["buy", "sell", "hold"] as const).map((key) => ({ key, label: ACTION_LABEL[key], p: d.probabilities[key] }));
  const confidenceText = d.status === "ok" && d.confidence !== null ? pct(d.confidence) : UNAVAILABLE;
  let tone: StageTone = d.action;
  let statusLine: string;
  let dimmed = false;
  if (d.status !== "ok") {
    statusLine = `Resposta do Jev: ${STATUS_LABEL[d.status] ?? "invalida"}. Mantendo por seguranca.`;
    tone = "hold";
  } else if (freshness === "fresh") {
    statusLine = `Leitura de ${Math.round((ageMs ?? 0) / 1000)} s atras, horizonte de ${read.state?.horizonMinutes ?? 5} min.`;
  } else if (freshness === "late") {
    statusLine = `Leitura atrasada: ${Math.round((ageMs ?? 0) / 1000)} s.`;
    tone = "late";
  } else if (freshness === "stale") {
    statusLine = `Leitura velha: ${Math.round((ageMs ?? 0) / 60_000)} min. Nao use como decisao atual.`;
    tone = "neutral";
    dimmed = true;
  } else {
    statusLine = "Idade da leitura desconhecida: o relogio local ainda nao foi comparado com o da OKX.";
    tone = "neutral";
    dimmed = true;
  }
  return { ...base, tone, headline: ACTION_HEADLINE[d.action], statusLine: `${statusLine}${connection}`, dimmed, probabilities, confidenceText };
}

export type ChipTone = "live" | "late" | "down" | "off";

export interface FeedChip {
  readonly id: string;
  readonly label: string;
  readonly tone: ChipTone;
  readonly detail: string | null;
}

/**
 * Whether the real model has decided: at least one recent read carries a decision that the model answered (status ok)
 * and that is not the mock. null when there is no board yet. A producer in observation mode records reads without any
 * decision, so its reads are fresh and still not a Jev call.
 */
export function hasModelDecision(board: JevReadBoardView | null): boolean | null {
  if (board === null) return null;
  return board.recent.some((read) => read.decision !== null && read.decision.status === "ok" && read.decision.model !== "mock");
}

export interface FeedChipsInput {
  readonly desk: readonly DeskFeedStatus[];
  /** `decided` is hasModelDecision of the board; absent or null means it is not known, and unknown is never live. */
  readonly jev: { readonly status: JevReadBoardState["status"]; readonly ageMs: number | null; readonly decided?: boolean | null };
  readonly wallet: { readonly status: string; readonly available: boolean };
  readonly operator: { readonly status: JevReadBoardState["status"] };
}

const DESK_CHIPS: readonly { id: DeskFeedStatus["id"]; label: string }[] = [
  { id: "okx-public-ws", label: "OKX tempo real" },
  { id: "okx-business-ws", label: "OKX velas" },
  { id: "okx-public-rest", label: "OKX REST" },
];

function deskTone(state: DeskFeedStatus["state"]): ChipTone {
  if (state === "live") return "live";
  if (state === "stale" || state === "reconnecting" || state === "connecting") return "late";
  if (state === "failed") return "down";
  return "off";
}

function jevTone(status: JevReadBoardState["status"], ageMs: number | null, decided: boolean | null | undefined): { tone: ChipTone; detail: string | null } {
  if (status === "ready") {
    const freshness = readFreshness(ageMs);
    if (freshness === "fresh") {
      if (decided === true) return { tone: "live", detail: null };
      return { tone: "late", detail: decided === false ? "leituras sem decisao do modelo" : "decisao do modelo nao confirmada" };
    }
    if (freshness === "late" || freshness === "unknown") return { tone: "late", detail: freshness === "late" ? "leitura atrasada" : "idade desconhecida" };
    return { tone: "down", detail: "leitura velha" };
  }
  if (status === "absent") return { tone: "down", detail: "produtor desligado" };
  if (status === "error") return { tone: "down", detail: "backend sem resposta" };
  return { tone: "off", detail: "consultando" };
}

function walletTone(wallet: FeedChipsInput["wallet"]): { tone: ChipTone; detail: string } {
  if (!wallet.available) return { tone: "off", detail: "extensao nao encontrada" };
  switch (wallet.status) {
    case "connected": return { tone: "live", detail: "conectada" };
    case "wrong-network": return { tone: "late", detail: "rede nao suportada" };
    case "connecting":
    case "reading": return { tone: "late", detail: "consultando" };
    case "error": return { tone: "down", detail: "consulta falhou" };
    default: return { tone: "off", detail: "nao conectada" };
  }
}

export function feedChips(input: FeedChipsInput): FeedChip[] {
  const chips: FeedChip[] = DESK_CHIPS.map(({ id, label }) => {
    const feed = input.desk.find((f) => f.id === id);
    return feed ? { id, label, tone: deskTone(feed.state), detail: feed.detail } : { id, label, tone: "off", detail: "sem dados" };
  });
  const jev = jevTone(input.jev.status, input.jev.ageMs, input.jev.decided);
  chips.push({ id: "jev-backend", label: "Jev", tone: jev.tone, detail: jev.detail });
  const wallet = walletTone(input.wallet);
  chips.push({ id: "okx-wallet", label: "Carteira OKX", tone: wallet.tone, detail: wallet.detail });
  const op = input.operator.status;
  chips.push({
    id: "onchainos",
    label: "OnchainOS",
    tone: op === "ready" ? "late" : op === "idle" || op === "loading" ? "off" : "down",
    detail: op === "ready" ? "operador ativo, veja as fontes" : op === "error" ? "operador sem resposta" : op === "absent" ? "sem ciclo do operador" : "consultando",
  });
  return chips;
}

export type CapabilityState = "live" | "late" | "held" | "blocked";

export interface CapabilityRow {
  readonly id: string;
  readonly label: string;
  readonly state: CapabilityState;
  readonly detail: string;
  readonly next: string | null;
}

export interface CapabilityInput {
  readonly desk: readonly DeskFeedStatus[];
  readonly jev: { readonly status: JevReadBoardState["status"]; readonly ageMs: number | null; readonly decided?: boolean | null };
  /** `marketSource`, `walletSource` and `model` come from the cycle itself; absent or unknown means the origin is not declared. */
  readonly systemOne: {
    readonly status: JevReadBoardState["status"];
    readonly execution: string | null;
    readonly reasons: readonly string[];
    readonly marketSource?: string | null;
    readonly walletSource?: string | null;
    readonly model?: string | null;
  };
  readonly wallet: { readonly status: string; readonly available: boolean };
  readonly operator: { readonly status: JevReadBoardState["status"] };
  readonly hasDerivatives: boolean;
}

const SYSTEM_ONE_REASON: Record<string, string> = {
  inventory_value_incomplete: "inventario nao observado",
  no_eligible_candidate: "nenhum candidato elegivel",
  system_one_never_executes: "nunca executa",
  jev_not_asked: "Jev nao consultado",
  market_stale: "mercado velho",
  inventory_stale: "inventario velho",
};

const UNDECLARED = new Set(["", "unknown", "desconhecido"]);

/** Why a System One cycle must not be shown as live, or null when its market, wallet and model are all declared and real. */
function systemOneNotLiveReason(one: CapabilityInput["systemOne"]): string | null {
  const market = one.marketSource ?? null;
  const wallet = one.walletSource ?? null;
  const model = one.model ?? null;
  if (market === "synthetic") return "ciclo com mercado sintetico, nao e leitura real";
  if (wallet === "synthetic") return "ciclo com carteira sintetica, nao e leitura real";
  if (model === "mock") return "modelo mock, o Jev nao foi consultado";
  if (market === null || wallet === null || model === null || UNDECLARED.has(market) || UNDECLARED.has(wallet) || UNDECLARED.has(model)) return "origem do ciclo nao declarada";
  return null;
}

export function capabilityRows(input: CapabilityInput): CapabilityRow[] {
  const ws = input.desk.find((f) => f.id === "okx-public-ws");
  const jev = jevTone(input.jev.status, input.jev.ageMs, input.jev.decided);
  const rows: CapabilityRow[] = [];

  rows.push(ws?.state === "live"
    ? { id: "market-v5", label: "Mercado OKX v5", state: "live", detail: "livro, negocios e precos publicos ao vivo", next: null }
    : { id: "market-v5", label: "Mercado OKX v5", state: ws && ws.state !== "failed" && ws.state !== "idle" ? "late" : "blocked", detail: ws?.detail ?? "sem conexao com o feed publico", next: "Verificar a rede e o acesso a ws.okx.com" });

  rows.push(jev.tone === "live"
    ? { id: "jev-tape", label: "Jev lendo a fita", state: "live", detail: "decisoes reais do modelo, consultivas", next: null }
    : jev.tone === "late"
      ? { id: "jev-tape", label: "Jev lendo a fita", state: "late", detail: jev.detail ?? "leitura atrasada", next: null }
      : { id: "jev-tape", label: "Jev lendo a fita", state: "blocked", detail: jev.detail ?? "sem leituras", next: "Rodar bun run jev-read --jev com a chave do app" });

  rows.push(input.hasDerivatives
    ? { id: "derivatives", label: "Funding e derivativos", state: "live", detail: "funding, marca e open interest do perpetuo", next: null }
    : { id: "derivatives", label: "Funding e derivativos", state: "blocked", detail: "sem leitura do perpetuo deste ativo", next: "Aguardar o feed do perpetuo ou escolher outro ativo" });

  const walletOn = input.wallet.available && input.wallet.status === "connected";
  rows.push(walletOn
    ? { id: "wallet", label: "OKX Wallet", state: "live", detail: "conectada, leitura local no navegador", next: null }
    : { id: "wallet", label: "OKX Wallet", state: "blocked", detail: input.wallet.available ? "nao conectada" : "extensao nao encontrada", next: input.wallet.available ? "Conectar a OKX Wallet no painel da carteira" : "Instalar a extensao OKX Wallet" });

  rows.push(input.operator.status === "ready"
    ? { id: "onchainos-dex", label: "OnchainOS cotacao e saldos", state: "late", detail: "ciclo do operador visivel, confira a fonte de cada campo", next: null }
    : { id: "onchainos-dex", label: "OnchainOS cotacao e saldos", state: "blocked", detail: "sem ciclo do operador com dados da API Web3", next: "Configurar a chave da API Web3 da OKX no servidor e iniciar o operador" });

  if (input.systemOne.status === "ready") {
    const why = input.systemOne.reasons.map((r) => SYSTEM_ONE_REASON[r]).filter((r): r is string => r !== undefined && r !== "nunca executa");
    const notLive = input.systemOne.execution === "dry_run" ? systemOneNotLiveReason(input.systemOne) : null;
    rows.push(input.systemOne.execution === "dry_run"
      ? notLive === null
        ? { id: "system-one", label: "System One alavancagem", state: "live", detail: "decisao de alavancagem em simulacao", next: null }
        : { id: "system-one", label: "System One alavancagem", state: "held", detail: notLive, next: "Rodar bun run system-one --public --jev" }
      : { id: "system-one", label: "System One alavancagem", state: "held", detail: why.join(", ") || "execucao bloqueada", next: "Observar o inventario da carteira para liberar candidatos" });
  } else {
    rows.push({ id: "system-one", label: "System One alavancagem", state: "blocked", detail: "sem ciclo gravado", next: "Rodar bun run system-one --public --jev" });
  }
  return rows;
}

export interface JournalRow {
  readonly id: string;
  readonly inst: string;
  readonly action: string;
  readonly tone: StageTone;
  readonly weight: string;
  readonly time: string;
}

const two = (n: number) => String(n).padStart(2, "0");

export function journalRows(recent: readonly JevReadView[], limit: number): JournalRow[] {
  return recent.slice(0, Math.max(0, limit)).map((read) => {
    const d = new Date(read.atMs);
    const time = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
    const inst = read.instId.split("-")[0] ?? read.instId;
    if (read.decision === null) {
      return { id: read.readId, inst, action: read.state === null ? "Sem leitura" : "Sem decisao", tone: "neutral", weight: UNAVAILABLE, time };
    }
    const decision = read.decision;
    const ok = decision.status === "ok";
    return {
      id: read.readId,
      inst,
      action: ACTION_LABEL[decision.action],
      tone: ok ? decision.action : "hold",
      weight: ok && decision.confidence !== null ? pct(decision.confidence) : UNAVAILABLE,
      time,
    };
  });
}

/** Age of the freshest read on the board, null when there is none or no age can be told honestly. */
export function newestReadAgeMs(board: JevReadBoardView | null, nowMs: number, browserSkewMs: number | null): number | null {
  if (board === null) return null;
  const ages = Object.values(board.reads).map((read) => readAgeMs(read, nowMs, browserSkewMs)).filter((age): age is number => age !== null);
  return ages.length > 0 ? Math.min(...ages) : null;
}

/** One honest line about the leverage layer for the Jev stage, null when System One has nothing recorded. */
export function systemOneLine(input: { readonly status: JevReadBoardState["status"]; readonly cycle: SystemOneCycleView | null }): string | null {
  if (input.status !== "ready" || input.cycle === null) return null;
  const { cycle } = input;
  const decision = cycle.decision;
  const what = decision === null ? "Jev nao consultado" : decision.choice === "hold" ? "manter" : decision.choice;
  const why = cycle.execution.reasons.map((r) => SYSTEM_ONE_REASON[r]).filter((r): r is string => r !== undefined && r !== "nunca executa");
  return `System One, alavancagem em ${cycle.brief.market.instId}: ${what}${why.length > 0 ? `, ${why.join(", ")}` : ""}.`;
}
