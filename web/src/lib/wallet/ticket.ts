/**
 * The draft of the order ticket (T9.6, T9.7, WAL-6, WAL-7). "Aceitar" on an answer of Inonu about a token only FILLS this draft: the network, the token and
 * the side the model chose. It holds no amount (the size is typed by the person), no secret and no address that is not the exact address of a token, and
 * nothing here sends, signs or prepares anything to be signed. The plan says what the ladder of quotes can do with the draft today and why not when it
 * cannot.
 *
 * Pure: no clock of its own, no network, no storage, no wallet.
 */
import { EVM_CHAINS, type EvmChainSpec, type EvmTokenSpec } from "../evm-multichain";

export interface TicketDraft {
  readonly chainIndex: string;
  readonly tokenAddress: string;
  /** Only for the person to read; never part of a request. */
  readonly tokenSymbol: string | null;
  /** The side the model chose, as the model said it: "buy" is to receive the token, "sell" is to give it. */
  readonly acao: "buy" | "sell";
  readonly origem: "inonu" | "manual";
  readonly briefHash: string | null;
  readonly atMs: number;
  /**
   * What the Inonu worked out for this purchase from the balance, in dollars (RAS-8): a suggestion the order panel offers as the size when the coin to pay with is a dollar coin. The person still types or confirms
   * the size; it is never an order. Absent when the answer came from a click that does not size (an older draft, a manual one).
   */
  readonly sugestaoUsd?: number | null;
}

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** The hash of a Brief as it is kept: plain characters, never a sentence. The producer and the reader of the draft use this one rule. */
const HASH = /^[A-Za-z0-9]{1,128}$/;
/** The address of a token as the code writes it in a candidate id: plain characters only (a Sui type has colons, a TON address has a dash and an underscore). */
const PLAIN_ADDRESS = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
const TOKEN_ID = /^token:(\d{1,12}):(.+)$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** An EVM address is lower case; any other plain address is case sensitive and kept as it is. Null when it is not a plain address. */
function cleanAddress(raw: string): string | null {
  if (EVM_ADDRESS.test(raw)) return raw.toLowerCase();
  return PLAIN_ADDRESS.test(raw) ? raw : null;
}

/** The network and the address of a token candidate id, or null when it is not a token with a plain address. */
function parseTokenId(candidateId: string | null): { readonly chainIndex: string; readonly tokenAddress: string } | null {
  if (candidateId === null) return null;
  const match = TOKEN_ID.exec(candidateId);
  if (match === null) return null;
  const tokenAddress = cleanAddress(match[2]!);
  return tokenAddress === null ? null : { chainIndex: match[1]!, tokenAddress };
}

/** Whether an accepted answer with this candidate can fill the ticket: the effect of Aceitar and the note under the card agree with the draft. */
export function isTicketCandidate(candidateId: string | null): boolean {
  return parseTokenId(candidateId) !== null;
}

export function draftFromDecision(input: {
  readonly candidateId: string | null;
  readonly action: "buy" | "sell" | "hold";
  readonly briefHash: string | null;
  readonly symbol: string | null;
  readonly atMs: number;
  /** The size the Inonu worked out in dollars; only a plain positive amount is kept. */
  readonly suggestUsd?: number | null;
}): TicketDraft | null {
  if (input.action !== "buy" && input.action !== "sell") return null;
  // a moment that is not a number cannot be kept and read back: it makes no draft
  if (!Number.isFinite(input.atMs)) return null;
  const parsed = parseTokenId(input.candidateId);
  if (parsed === null) return null;
  const { chainIndex, tokenAddress } = parsed;
  const symbol = input.symbol !== null && !CONTROL.test(input.symbol) && input.symbol.length > 0 ? input.symbol.slice(0, 20) : null;
  const briefHash = input.briefHash !== null && HASH.test(input.briefHash) ? input.briefHash : null;
  const suggest = input.suggestUsd !== undefined && input.suggestUsd !== null && Number.isFinite(input.suggestUsd) && input.suggestUsd > 0 && input.suggestUsd <= 1_000_000 ? Math.floor(input.suggestUsd) : null;
  return { chainIndex, tokenAddress, tokenSymbol: symbol, acao: input.action, origem: "inonu", briefHash, atMs: input.atMs, ...(suggest === null || suggest < 1 ? {} : { sugestaoUsd: suggest }) };
}

/** The page of the Rastreador and the Mesa are two pages: the draft is kept for the tab, under this key, so it is there when the next page opens. */
export const TICKET_KEY = "inonu.ticket.v1";

export interface TicketStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const DRAFT_KEYS = ["acao", "atMs", "briefHash", "chainIndex", "origem", "tokenAddress", "tokenSymbol"];
const DRAFT_KEYS_SIZED = [...DRAFT_KEYS, "sugestaoUsd"].sort();

/** What was kept is read back only if it is exactly a draft: a hand edited or older payload is dropped, never trusted. */
function parseDraft(raw: unknown): TicketDraft | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(",");
  const sized = keys === DRAFT_KEYS_SIZED.join(",");
  if (keys !== DRAFT_KEYS.join(",") && !sized) return null;
  if (sized && !(typeof r.sugestaoUsd === "number" && Number.isInteger(r.sugestaoUsd) && r.sugestaoUsd >= 1 && r.sugestaoUsd <= 1_000_000)) return null;
  if (typeof r.chainIndex !== "string" || !/^\d{1,12}$/.test(r.chainIndex)) return null;
  if (typeof r.tokenAddress !== "string" || cleanAddress(r.tokenAddress) !== r.tokenAddress) return null;
  if (r.acao !== "buy" && r.acao !== "sell") return null;
  if (r.origem !== "inonu" && r.origem !== "manual") return null;
  if (typeof r.atMs !== "number" || !Number.isFinite(r.atMs)) return null;
  if (r.briefHash !== null && (typeof r.briefHash !== "string" || !HASH.test(r.briefHash))) return null;
  if (r.tokenSymbol !== null && (typeof r.tokenSymbol !== "string" || r.tokenSymbol.length < 1 || r.tokenSymbol.length > 20 || CONTROL.test(r.tokenSymbol))) return null;
  return { chainIndex: r.chainIndex, tokenAddress: r.tokenAddress, tokenSymbol: r.tokenSymbol, acao: r.acao, origem: r.origem, briefHash: r.briefHash, atMs: r.atMs, ...(sized ? { sugestaoUsd: r.sugestaoUsd as number } : {}) };
}

/** How old the draft is: it lives for the tab, and one filled in the morning must not read as new at night. */
export function draftAgeText(atMs: number, nowMs: number): string {
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return "-";
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (s < 60) return `ha ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `ha ${h} h` : `ha ${Math.floor(h / 24)} d`;
}

export function createTicketStore(options: { readonly storage?: TicketStorage | null } = {}) {
  const storage = options.storage ?? null;
  let draft: TicketDraft | null = null;
  if (storage !== null) {
    try {
      const kept = storage.getItem(TICKET_KEY);
      draft = kept === null ? null : parseDraft(JSON.parse(kept));
    } catch {
      draft = null;
    }
  }
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // a listener that fails must not keep the others from hearing
      }
    }
  };
  return {
    get: (): TicketDraft | null => (draft === null ? null : { ...draft }),
    fill(next: TicketDraft): void {
      draft = { ...next };
      try {
        storage?.setItem(TICKET_KEY, JSON.stringify(draft));
      } catch {
        // full or blocked: the draft lives in memory for this page
      }
      notify();
    },
    clear(): void {
      if (draft === null) return;
      draft = null;
      try {
        storage?.removeItem(TICKET_KEY);
      } catch {
        // blocked: nothing to undo
      }
      notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type TicketStore = ReturnType<typeof createTicketStore>;

let shared: TicketStore | null = null;

/** The one ticket of the page: the answer cards fill it, the Carteira tab shows it. */
export function sharedTicket(): TicketStore {
  shared ??= createTicketStore({ storage: tabStorage() });
  return shared;
}

function tabStorage(): TicketStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export interface TicketPlan {
  /** The network of the registry; null when the app does not know it. */
  readonly chain: EvmChainSpec | null;
  /** The coins the person can pay with on that network, from the registry, with their decimals. */
  readonly pay: readonly EvmTokenSpec[];
  readonly quotable: boolean;
  /** Why it cannot be quoted; null when it can. */
  readonly reason: string | null;
}

export function ticketPlan(draft: TicketDraft): TicketPlan {
  const chain = EVM_CHAINS.find((c) => c.chainIndex === draft.chainIndex) ?? null;
  if (chain === null) return { chain: null, pay: [], quotable: false, reason: "O app ainda nao tem uma moeda de pagamento conhecida para esta rede" };
  if (!EVM_ADDRESS.test(draft.tokenAddress)) return { chain, pay: [], quotable: false, reason: "O endereco deste token nao tem o formato de um token EVM" };
  const pay = chain.tokens;
  if (pay.length === 0) return { chain, pay, quotable: false, reason: "O app ainda nao tem uma moeda de pagamento conhecida para esta rede" };
  if (pay.every((p) => p.contract.toLowerCase() === draft.tokenAddress)) return { chain, pay, quotable: false, reason: "O token e a propria moeda de pagamento" };
  if (draft.acao === "sell") {
    return { chain, pay, quotable: false, reason: "A escada de cotacoes so cota a troca da moeda de pagamento pelo token. A troca do token por dolar e conferida e enviada no painel Ordem pela minha carteira, que le o saldo do token" };
  }
  return { chain, pay: pay.filter((p) => p.contract.toLowerCase() !== draft.tokenAddress), quotable: true, reason: null };
}
