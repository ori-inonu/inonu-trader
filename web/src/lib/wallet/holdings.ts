/**
 * The reader of what the connected address holds (T9.4, WAL-4): GET /onchain/wallet-value, /onchain/wallet-balances and /onchain/wallet-history of the
 * local gateway, read only. Like the quote reader, it checks again what comes back: whatever is not exactly the documented shape is an error, never a
 * number on the screen, and a row about a network that was not asked is a contract error. The address of the person goes out as a parameter of a GET to the
 * local server, only because the person clicked; it never goes to the model and the gateway never sends it back.
 *
 * It makes one request per call and never signs, sends, prepares a transaction or talks to a wallet.
 */
import { ONCHAIN_API_URL, type OnchainErrorCode, type OnchainMeta, type OnchainTier } from "../onchain/client";

/** `sem_dados`: the gateway answered, and the provider has nothing for this address (an empty payload). */
export type HoldingsError = OnchainErrorCode | "network" | "backend_stale" | "origin_denied" | "sem_dados" | "cancelled";

export type HoldingsResult<T> =
  | { readonly ok: true; readonly data: T; readonly meta: OnchainMeta }
  | { readonly ok: false; readonly error: HoldingsError };

export interface ValueData {
  readonly totalValueUsd: number;
}

export interface BalanceRow {
  readonly chainIndex: string;
  readonly symbol: string;
  /** Null for the coin of the network itself. */
  readonly tokenAddress: string | null;
  readonly balance: number;
  /** Null when the provider has no price: a balance with no price is not worth zero. */
  readonly priceUsd: number | null;
  readonly valueUsd: number | null;
  /** Provider risk mark. False means unflagged, not safe; null means unknown. */
  readonly flaggedRisk: boolean | null;
}

export interface BalancesData {
  readonly rows: readonly BalanceRow[];
  /** How many rows there were before the gateway kept the largest ones. */
  readonly total: number;
}

export type HistoryKind = "native" | "internal" | "token";
export type HistoryStatus = "success" | "fail" | "pending";

export interface HistoryRow {
  readonly chainIndex: string;
  readonly txHash: string;
  readonly atMs: number;
  readonly kind: HistoryKind | null;
  readonly symbol: string | null;
  readonly amount: number | null;
  readonly tokenAddress: string | null;
  readonly status: HistoryStatus | null;
  readonly feeNative: number | null;
  /** The counterparties come shortened (first4...last4): they are other people's wallets. */
  readonly from: string | null;
  readonly to: string | null;
  readonly flaggedByProvider: boolean;
}

export interface HistoryData {
  readonly cursor: string | null;
  readonly rows: readonly HistoryRow[];
}

/** What the address did over a window, on one network. Every field is null when the provider did not give it. */
export interface OverviewData {
  readonly winRatePct: number | null;
  readonly realizedPnlUsd: number | null;
  readonly buyCount: number | null;
  readonly sellCount: number | null;
  readonly buyVolumeUsd: number | null;
  readonly sellVolumeUsd: number | null;
  readonly avgBuyValueUsd: number | null;
  readonly top3PnlTokenPercent: number | null;
}

export interface PnlRow {
  readonly chainIndex: string;
  readonly symbol: string;
  readonly tokenAddress: string | null;
  readonly balanceAmount: number | null;
  readonly balanceUsd: number | null;
  readonly realizedUsd: number | null;
  readonly unrealizedUsd: number | null;
  readonly totalUsd: number | null;
  readonly totalPct: number | null;
  readonly positionPct: number | null;
  readonly lastActiveMs: number | null;
}

export interface PnlData {
  readonly cursor: string | null;
  readonly rows: readonly PnlRow[];
}

/** One network of the provider's own list (the ones its balance routes read). */
export interface NetworkRow {
  readonly chainIndex: string;
  readonly name: string;
}

export interface HoldingsParams {
  readonly address: string;
  /** The networks to read, up to 20, as the provider numbers them. */
  readonly chains: readonly string[];
}

/** The result routes read one network at a time, over one of the windows the provider offers. */
export interface ResultParams {
  readonly address: string;
  readonly chainIndex: string;
  /** 1 to 5, see TIME_FRAMES. */
  readonly timeFrame: number;
}

/** The windows of the overview, as the provider numbers them (1 = 1D, 2 = 3D, 3 = 7D, 4 = 1M, 5 = 3M). */
export const TIME_FRAMES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 1, label: "1 dia" },
  { value: 2, label: "3 dias" },
  { value: 3, label: "7 dias" },
  { value: 4, label: "1 mes" },
  { value: 5, label: "3 meses" },
];

const ERRORS: ReadonlySet<string> = new Set([
  "no_credentials", "incomplete_credentials", "budget_exhausted", "pace_limited", "rate_limited",
  "provider_unauthorized", "provider_payment_required", "provider_error", "schema", "unsupported_chain", "clock_skew", "bad_request",
]);
const TIERS: ReadonlySet<string> = new Set<OnchainTier>(["free", "basic", "premium"]);
const KINDS: ReadonlySet<string> = new Set<HistoryKind>(["native", "internal", "token"]);
const STATUSES: ReadonlySet<string> = new Set<HistoryStatus>(["success", "fail", "pending"]);

export const MAX_CHAINS = 20;
export const HISTORY_LIMIT = 20;
export const PNL_LIMIT = 20;
/** The number the provider gives Solana. Its addresses are base58, have a case that matters, and go only with this network. */
export const SOLANA_CHAIN_INDEX = "501";
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const isSolanaAddress = (value: string): boolean => SOLANA_ADDRESS.test(value);
const CHAIN = /^\d{1,12}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null | undefined => (v === null ? null : isNum(v) ? v : undefined);
const textOrNull = (v: unknown, max: number): string | null | undefined => (v === null ? null : typeof v === "string" && v !== "" && v.length <= max && !CONTROL.test(v) ? v : undefined);

export function parseValue(raw: unknown): ValueData | null {
  if (!isRec(raw) || !isNum(raw.totalValueUsd) || raw.totalValueUsd < 0) return null;
  return { totalValueUsd: raw.totalValueUsd };
}

export function parseBalances(raw: unknown, asked: readonly string[]): BalancesData | null {
  if (!isRec(raw) || !Array.isArray(raw.rows) || !Number.isInteger(raw.total) || (raw.total as number) < raw.rows.length) return null;
  const rows: BalanceRow[] = [];
  for (const item of raw.rows) {
    if (!isRec(item)) return null;
    const symbol = textOrNull(item.symbol, 24);
    const tokenAddress = textOrNull(item.tokenAddress, 128);
    const priceUsd = numOrNull(item.priceUsd);
    const valueUsd = numOrNull(item.valueUsd);
    if (typeof item.chainIndex !== "string" || !asked.includes(item.chainIndex)) return null;
    if (symbol === undefined || symbol === null || tokenAddress === undefined || priceUsd === undefined || valueUsd === undefined) return null;
    if (!isNum(item.balance) || item.balance < 0 || (item.flaggedRisk !== null && typeof item.flaggedRisk !== "boolean")) return null;
    if ((priceUsd !== null && priceUsd < 0) || (valueUsd !== null && valueUsd < 0)) return null;
    rows.push({ chainIndex: item.chainIndex, symbol, tokenAddress, balance: item.balance, priceUsd, valueUsd, flaggedRisk: item.flaggedRisk });
  }
  return { rows, total: raw.total as number };
}

/** The list of networks the provider reads balances on: a number and a name each, a repeated number kept once. */
export function parseNetworks(raw: unknown): NetworkRow[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const rows: NetworkRow[] = [];
  for (const item of raw) {
    if (!isRec(item)) return null;
    const name = textOrNull(item.name, 40);
    if (typeof item.chainIndex !== "string" || !CHAIN.test(item.chainIndex) || name === undefined || name === null) return null;
    if (seen.has(item.chainIndex)) continue;
    seen.add(item.chainIndex);
    rows.push({ chainIndex: item.chainIndex, name });
  }
  return rows;
}

export function parseHistory(raw: unknown, asked: readonly string[]): HistoryData | null {
  if (!isRec(raw) || !Array.isArray(raw.rows)) return null;
  const cursor = textOrNull(raw.cursor, 128);
  if (cursor === undefined) return null;
  const rows: HistoryRow[] = [];
  for (const item of raw.rows) {
    if (!isRec(item)) return null;
    const symbol = textOrNull(item.symbol, 24);
    const tokenAddress = textOrNull(item.tokenAddress, 128);
    const amount = numOrNull(item.amount);
    const feeNative = numOrNull(item.feeNative);
    const from = textOrNull(item.from, 64);
    const to = textOrNull(item.to, 64);
    if (typeof item.chainIndex !== "string" || !asked.includes(item.chainIndex)) return null;
    if (typeof item.txHash !== "string" || !/^[A-Za-z0-9]{1,128}$/.test(item.txHash) || !isNum(item.atMs)) return null;
    if (symbol === undefined || tokenAddress === undefined || amount === undefined || feeNative === undefined || from === undefined || to === undefined) return null;
    if (!(item.kind === null || (typeof item.kind === "string" && KINDS.has(item.kind)))) return null;
    if (!(item.status === null || (typeof item.status === "string" && STATUSES.has(item.status)))) return null;
    if (typeof item.flaggedByProvider !== "boolean") return null;
    rows.push({
      chainIndex: item.chainIndex, txHash: item.txHash, atMs: item.atMs, kind: item.kind as HistoryKind | null, symbol, amount, tokenAddress,
      status: item.status as HistoryStatus | null, feeNative, from, to, flaggedByProvider: item.flaggedByProvider,
    });
  }
  return { cursor, rows };
}

export function parseOverview(raw: unknown): OverviewData | null {
  if (!isRec(raw)) return null;
  const keys = ["winRatePct", "realizedPnlUsd", "buyCount", "sellCount", "buyVolumeUsd", "sellVolumeUsd", "avgBuyValueUsd", "top3PnlTokenPercent"] as const;
  const out: Record<string, number | null> = {};
  for (const key of keys) {
    const v = numOrNull(raw[key]);
    if (v === undefined) return null;
    out[key] = v;
  }
  // counts and volumes cannot be negative
  for (const key of ["buyCount", "sellCount", "buyVolumeUsd", "sellVolumeUsd"] as const) if (out[key] !== null && out[key]! < 0) return null;
  return out as unknown as OverviewData;
}

export function parsePnl(raw: unknown, asked: readonly string[]): PnlData | null {
  if (!isRec(raw) || !Array.isArray(raw.rows)) return null;
  const cursor = textOrNull(raw.cursor, 128);
  if (cursor === undefined) return null;
  const rows: PnlRow[] = [];
  for (const item of raw.rows) {
    if (!isRec(item)) return null;
    const symbol = textOrNull(item.symbol, 24);
    const tokenAddress = textOrNull(item.tokenAddress, 128);
    if (typeof item.chainIndex !== "string" || !asked.includes(item.chainIndex)) return null;
    if (symbol === undefined || symbol === null || tokenAddress === undefined) return null;
    const nums: Record<string, number | null> = {};
    for (const key of ["balanceAmount", "balanceUsd", "realizedUsd", "unrealizedUsd", "totalUsd", "totalPct", "positionPct", "lastActiveMs"] as const) {
      const v = numOrNull(item[key]);
      if (v === undefined) return null;
      nums[key] = v;
    }
    rows.push({ chainIndex: item.chainIndex, symbol, tokenAddress, ...nums } as PnlRow);
  }
  return { cursor, rows };
}

function parseMeta(v: unknown): OnchainMeta | null {
  if (!isRec(v) || typeof v.tier !== "string" || !TIERS.has(v.tier) || !isNum(v.cachedAtMs) || !isNum(v.ageMs) || typeof v.stale !== "boolean") return null;
  const b = v.budget;
  if (!isRec(b) || typeof b.tier !== "string" || !TIERS.has(b.tier) || !isNum(b.used) || !(b.cap === null || isNum(b.cap))) return null;
  return v as unknown as OnchainMeta;
}

/**
 * The request as the gateway takes it, or null: a request that is not that never leaves. The family of the address decides the networks, as it does in the gateway:
 * an EVM address is case free (it leaves in lower case, one signed request per wallet) and never goes with network 501; a Solana address keeps its case, because
 * changing one letter reads another wallet, and goes with network 501 alone.
 */
export function checkedParams(params: HoldingsParams): { readonly address: string; readonly chains: readonly string[] } | null {
  const evm = EVM_ADDRESS.test(params.address);
  if (!evm && !SOLANA_ADDRESS.test(params.address)) return null;
  const chains = [...new Set(params.chains)];
  if (chains.length === 0 || chains.length > MAX_CHAINS || chains.some((c) => !CHAIN.test(c))) return null;
  if (evm ? chains.includes(SOLANA_CHAIN_INDEX) : chains.length !== 1 || chains[0] !== SOLANA_CHAIN_INDEX) return null;
  return { address: evm ? params.address.toLowerCase() : params.address, chains };
}

/**
 * The request of a result route as the gateway takes it, or null: one network, one of the five windows. The same family rule as the first block: an EVM address
 * leaves in lower case and never with network 501, a Solana address keeps its case and goes with network 501 alone.
 */
export function checkedResultParams(params: ResultParams): { readonly address: string; readonly chainIndex: string; readonly timeFrame: number } | null {
  const evm = EVM_ADDRESS.test(params.address);
  if (!evm && !SOLANA_ADDRESS.test(params.address)) return null;
  if (!CHAIN.test(params.chainIndex) || (params.chainIndex === SOLANA_CHAIN_INDEX) === evm) return null;
  if (!Number.isInteger(params.timeFrame) || params.timeFrame < 1 || params.timeFrame > 5) return null;
  return { address: evm ? params.address.toLowerCase() : params.address, chainIndex: params.chainIndex, timeFrame: params.timeFrame };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HoldingsReader {
  value(params: HoldingsParams, signal?: AbortSignal): Promise<HoldingsResult<ValueData>>;
  balances(params: HoldingsParams, signal?: AbortSignal): Promise<HoldingsResult<BalancesData>>;
  history(params: HoldingsParams, signal?: AbortSignal): Promise<HoldingsResult<HistoryData>>;
  /** The networks the provider reads balances on, free, valid for a day at the gateway. */
  networks(signal?: AbortSignal): Promise<HoldingsResult<NetworkRow[]>>;
  /** Premium tier: it counts against the month of the gateway. */
  overview(params: ResultParams, signal?: AbortSignal): Promise<HoldingsResult<OverviewData>>;
  /** Premium tier: it counts against the month of the gateway. */
  pnl(params: ResultParams, signal?: AbortSignal): Promise<HoldingsResult<PnlData>>;
}

export function createHoldingsReader(options: { readonly base?: string; readonly fetch?: FetchLike } = {}): HoldingsReader {
  const base = options.base ?? ONCHAIN_API_URL;
  const send: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));

  async function call<T>(
    route: string,
    query: URLSearchParams,
    asked: readonly string[],
    parse: (raw: unknown, asked: readonly string[]) => T | null,
    signal: AbortSignal | undefined,
  ): Promise<HoldingsResult<T>> {
    let res: Response;
    try {
      res = await send(`${base}${route}?${query.toString()}`, { method: "GET", credentials: "omit", headers: { "x-inonu-intent": "user" }, ...(signal ? { signal } : {}) });
    } catch {
      // a read the person cancelled is not a lost connection
      return { ok: false, error: signal?.aborted ? "cancelled" : "network" };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // a page that is not json still has a status
    }
    const envelope = isRec(body) && typeof body.ok === "boolean";
    if (!res.ok) {
      const code = isRec(body) ? String(body.error ?? body.code ?? "") : "";
      if (res.status === 404 && (!envelope || code === "not_found")) return { ok: false, error: "backend_stale" };
      if (res.status === 403 && (!envelope || code === "forbidden")) return { ok: false, error: "origin_denied" };
    }
    if (!isRec(body) || typeof body.ok !== "boolean") return { ok: false, error: "schema" };
    // a good looking body under an error status is not an answer
    if (body.ok === true && !res.ok) return { ok: false, error: "schema" };
    if (body.ok === false) {
      const code = body.error ?? body.code;
      return typeof code === "string" && ERRORS.has(code) ? { ok: false, error: code as HoldingsError } : { ok: false, error: "schema" };
    }
    const meta = parseMeta(body.meta);
    if (meta === null) return { ok: false, error: "schema" };
    // the provider has nothing for this address: not a broken contract
    if (body.data === null) return { ok: false, error: "sem_dados" };
    const data = parse(body.data, asked);
    return data === null ? { ok: false, error: "schema" } : { ok: true, data, meta };
  }

  const refuse = (): Promise<{ ok: false; error: HoldingsError }> => Promise.resolve({ ok: false, error: "bad_request" });

  return {
    networks(signal) {
      return call("/onchain/networks", new URLSearchParams(), [], (raw) => parseNetworks(raw), signal);
    },
    value(params, signal) {
      const p = checkedParams(params);
      if (p === null) return refuse();
      return call("/onchain/wallet-value", new URLSearchParams({ address: p.address, chains: p.chains.join(","), assetType: "1" }), p.chains, (raw) => parseValue(raw), signal);
    },
    balances(params, signal) {
      const p = checkedParams(params);
      if (p === null) return refuse();
      return call("/onchain/wallet-balances", new URLSearchParams({ address: p.address, chains: p.chains.join(",") }), p.chains, parseBalances, signal);
    },
    history(params, signal) {
      const p = checkedParams(params);
      if (p === null) return refuse();
      return call("/onchain/wallet-history", new URLSearchParams({ address: p.address, chains: p.chains.join(","), limit: String(HISTORY_LIMIT) }), p.chains, parseHistory, signal);
    },
    overview(params, signal) {
      const p = checkedResultParams(params);
      if (p === null) return refuse();
      return call("/onchain/wallet-overview", new URLSearchParams({ address: p.address, chainIndex: p.chainIndex, timeFrame: String(p.timeFrame) }), [p.chainIndex], (raw) => parseOverview(raw), signal);
    },
    pnl(params, signal) {
      const p = checkedResultParams(params);
      if (p === null) return refuse();
      return call("/onchain/wallet-pnl", new URLSearchParams({ address: p.address, chainIndex: p.chainIndex, limit: String(PNL_LIMIT) }), [p.chainIndex], parsePnl, signal);
    },
  };
}

/* ---------- what the screen says ---------- */

const NUMBER_BIG = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const NUMBER_MID = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const NUMBER_SMALL = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 6 });
const MONEY = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// a number under one cent keeps its first four significant digits: 0,0000149 is not zero, and a price like that must not be drawn as one
const MICRO = new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 4 });

/** A quantity of a coin: whole above a thousand, four decimals above one, six significant digits below. */
export function amountText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  return abs >= 1000 ? NUMBER_BIG.format(value) : abs >= 1 ? NUMBER_MID.format(value) : NUMBER_SMALL.format(value);
}

/** A percentage the provider gave in percent units (-20.99 is -20,99%): two decimals, a dash when unknown. */
export function pctText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value !== 0 && Math.abs(value) < 0.005) return `${MICRO.format(value)}%`;
  return `${MONEY.format(value === 0 ? 0 : value)}%`;
}

/** A count the provider gave as a whole number. */
export function countText(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : NUMBER_BIG.format(value);
}

export function usdText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value !== 0 && Math.abs(value) < 0.005) return `US$ ${MICRO.format(value)}`;
  // a zero (and a minus zero) is plain zero: "US$ -0,00" says nothing true
  return `US$ ${MONEY.format(value === 0 ? 0 : value)}`;
}

/** How old what is on the screen is: the age the gateway reported when it answered, plus the time since the answer arrived. A clock that went back adds nothing. */
export function readingAgeMs(metas: readonly OnchainMeta[], receivedAtMs: number, nowMs: number): number | null {
  if (metas.length === 0 || !Number.isFinite(receivedAtMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(...metas.map((m) => m.ageMs)) + Math.max(0, nowMs - receivedAtMs);
}

export function ageText(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "-";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `ha ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `ha ${h} h` : `ha ${Math.floor(h / 24)} d`;
}

const ERROR_TEXT: Record<string, string> = {
  network: "Sem conexao com o servidor local.",
  cancelled: "Leitura cancelada.",
  backend_stale: "O servidor local e de uma versao antiga e nao tem esta leitura. Reinicie o app.",
  origin_denied: "O servidor local recusou a origem desta pagina.",
  sem_dados: "O provedor nao devolveu dados para este endereco nas redes lidas.",
  no_credentials: "Faltam as credenciais da OKX. Veja Configuracoes.",
  incomplete_credentials: "As credenciais da OKX estao incompletas. Veja Configuracoes.",
  budget_exhausted: "A cota do mes desta camada acabou. O servidor local nao paga para continuar.",
  pace_limited: "O servidor local esta limitando o ritmo das leituras. Tente de novo em instantes.",
  rate_limited: "A OKX limitou o ritmo. Tente de novo em instantes.",
  provider_unauthorized: "A OKX recusou as credenciais.",
  provider_payment_required: "A OKX pede pagamento para esta leitura. O app nao paga.",
  provider_error: "A OKX respondeu com erro.",
  schema: "A resposta nao tem o formato esperado e foi descartada.",
  unsupported_chain: "A OKX nao le alguma das redes pedidas.",
  clock_skew: "O relogio do Windows esta fora de hora e a OKX recusa a assinatura.",
  bad_request: "O pedido nao e valido e nao foi enviado.",
};

export function holdingsErrorText(error: HoldingsError): string {
  return ERROR_TEXT[error] ?? "Leitura indisponivel.";
}
