/**
 * Pure row models of the three onchain dock tabs: every string the tables show is produced here so
 * the tables are a map over finished rows and the rules are testable without React. No fabricated
 * numbers anywhere: a missing field becomes the UNAVAILABLE word, never a zero.
 */
import type { LeaderboardRow, Signal, SignalWalletType, WalletRow } from "../onchain/client";
import { fmtCompact, fmtNumber, fmtPctPlain, UNAVAILABLE } from "../desk/ui/format";

/** Relative age in words: "agora", "ha 5 s", "ha 3 min", "ha 2 h", "ha 4 d". */
export function fmtRelAgo(tsMs: number | null | undefined, nowMs: number): string {
  if (typeof tsMs !== "number" || !Number.isFinite(tsMs)) return UNAVAILABLE;
  return fmtAgeMs(nowMs - tsMs);
}

/** A duration in the same words: 90_000 -> "ha 2 min". Negative or future reads "agora". */
export function fmtAgeMs(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return UNAVAILABLE;
  const s = Math.floor(ms / 1000);
  if (s < 10) return "agora";
  if (s < 60) return `ha ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `ha ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `ha ${h} h`;
  return `ha ${Math.floor(h / 24)} d`;
}

/** Compact USD with the currency word: 125430.56 -> "US$ 125,4 mil"; -50 -> "-US$ 50". */
export function fmtUsd(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return UNAVAILABLE;
  const sign = v < 0 ? "-" : "";
  return `${sign}US$ ${fmtCompact(Math.abs(v))}`;
}

/** Signed USD for PnL columns: "+US$ 1,2 mil" / "-US$ 3,4 mil". */
export function fmtUsdSigned(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return UNAVAILABLE;
  if (v === 0) return "US$ 0";
  return `${v > 0 ? "+" : "-"}US$ ${fmtCompact(Math.abs(v))}`;
}

/** The tracked-wallet kind in words, never in the provider's code. */
export function walletTypeWord(t: SignalWalletType): string {
  return t === "smart_money" ? "Smart money" : t === "kol" ? "KOL" : "Baleia";
}

/** The tag filters of the holders/top-traders tables, in display order (provider tagFilter 1-9). */
export const TAG_FILTERS: readonly { readonly value: number | null; readonly label: string }[] = [
  { value: null, label: "Todos" },
  { value: 3, label: "Smart money" },
  { value: 1, label: "KOL" },
  { value: 2, label: "Dev" },
  { value: 4, label: "Baleia" },
  { value: 5, label: "Novas" },
  { value: 6, label: "Suspeitos" },
  { value: 7, label: "Snipers" },
  { value: 9, label: "Bundle" },
];

export interface SignalRowModel {
  readonly key: string;
  readonly ago: string;
  readonly tokenSymbol: string;
  readonly tokenAddress: string | null;
  readonly chainIndex: string | null;
  readonly wallets: string;
  readonly typeWord: string;
  readonly amountUsd: string;
  readonly priceUsd: string;
  readonly soldPct: string;
  readonly mcap: string;
  readonly tsMs: number;
}

/** Signal rows newest first; the token symbol falls back to the shortened address, never empty. */
export function signalRows(signals: readonly Signal[], nowMs: number): SignalRowModel[] {
  return [...signals]
    .sort((a, b) => b.tsMs - a.tsMs)
    .map((s, i) => ({
      key: `${s.tsMs}-${s.token.address ?? "t"}-${i}`,
      ago: fmtRelAgo(s.tsMs, nowMs),
      tokenSymbol: s.token.symbol ?? (s.token.address !== null ? `${s.token.address.slice(0, 4)}...${s.token.address.slice(-4)}` : UNAVAILABLE),
      tokenAddress: s.token.address,
      chainIndex: s.chainIndex,
      wallets: fmtNumber(s.walletCount, 0),
      typeWord: walletTypeWord(s.walletType),
      amountUsd: fmtUsd(s.amountUsd),
      priceUsd: fmtUsd(s.priceUsd),
      soldPct: fmtPctPlain(s.soldRatioPct, 0),
      mcap: fmtUsd(s.token.marketCap),
      tsMs: s.tsMs,
    }));
}

export interface LeaderboardRowModel {
  readonly key: string;
  readonly wallet: string;
  readonly pnlUsd: string;
  readonly pnlPct: string;
  readonly winPct: string;
  readonly volumeUsd: string;
  readonly txs: string;
  readonly lastActive: string;
  readonly topTokens: string;
}

/** Leaderboard rows in the provider's order (the sort is a request parameter, not a client sort). */
export function leaderboardRows(rows: readonly LeaderboardRow[], nowMs: number): LeaderboardRowModel[] {
  return rows.map((r, i) => ({
    key: `${r.wallet}-${i}`,
    wallet: r.wallet,
    pnlUsd: fmtUsdSigned(r.realizedPnlUsd),
    pnlPct: fmtPctPlain(r.realizedPnlPct, 1),
    winPct: fmtPctPlain(r.winRatePct, 1),
    volumeUsd: fmtUsd(r.txVolumeUsd),
    txs: r.txs === null ? UNAVAILABLE : fmtNumber(r.txs, 0),
    lastActive: fmtRelAgo(r.lastActiveMs, nowMs),
    topTokens: r.topTokens.length === 0 ? UNAVAILABLE : r.topTokens.slice(0, 4).map((t) => t.symbol).join(", "),
  }));
}

export interface WalletRowModel {
  readonly key: string;
  readonly wallet: string;
  readonly holdPct: string;
  readonly realizedPnl: string;
  readonly unrealizedPnl: string;
  readonly avgBuy: string;
  readonly qty: string;
}

/** Holder and top-trader rows share the provider shape; the wallet arrives already shortened. */
export function walletRows(rows: readonly WalletRow[]): WalletRowModel[] {
  return rows.map((r, i) => ({
    key: `${r.wallet}-${i}`,
    wallet: r.wallet,
    holdPct: fmtPctPlain(r.holdPct, 2),
    realizedPnl: fmtUsdSigned(r.realizedPnlUsd),
    unrealizedPnl: fmtUsdSigned(r.unrealizedPnlUsd),
    avgBuy: fmtUsd(r.avgBuyPrice),
    qty: fmtCompact(r.boughtAmount),
  }));
}

/** The error copy of the three tabs, one exact sentence per code plus an optional settings link. */
export interface OnchainErrorText {
  readonly text: string;
  readonly link: { readonly href: string; readonly label: string } | null;
  /** True when the cache may still be shown under the message with a "Dado velho" badge. */
  readonly showCache: boolean;
}

export function onchainErrorText(code: string): OnchainErrorText {
  const SETTINGS = { href: "/configuracoes", label: "Configuracoes" } as const;
  switch (code) {
    case "no_credentials":
    case "incomplete_credentials":
      return { text: "Configure a chave do OnchainOS", link: SETTINGS, showCache: false };
    case "provider_unauthorized":
      return { text: "Chave, segredo ou passphrase recusados. Confira em Configuracoes", link: SETTINGS, showCache: false };
    case "provider_payment_required":
      return { text: "Cota gratuita do mes esgotada no provedor. O sistema nao paga", link: null, showCache: true };
    case "budget_exhausted":
      return { text: "Orcamento do mes esgotado, ajuste em Configuracoes", link: SETTINGS, showCache: true };
    case "pace_limited":
      return { text: "Ritmo diario atingido, use Atualizar", link: null, showCache: true };
    case "rate_limited":
    case "provider_error":
    case "network":
      return { text: "OnchainOS indisponivel agora", link: null, showCache: false };
    case "schema":
      return { text: "Resposta fora do contrato, descartada", link: null, showCache: false };
    case "backend_stale":
      return { text: "Esta consulta nao esta disponivel no servidor conectado. Verifique a conexao em Diagnostico", link: null, showCache: false };
    case "origin_denied":
      return { text: "O servidor local recusou o pedido desta origem. Abra a mesa pelo Inonu Trader", link: null, showCache: false };
    case "unsupported_chain":
      return { text: "Rede sem suporte a este recurso", link: null, showCache: false };
    case "clock_skew":
      return { text: "O relogio do computador esta fora do horario da OKX. Sincronize o horario do Windows e tente de novo.", link: null, showCache: false };
    case "bad_request":
    default:
      return { text: "Pedido invalido", link: null, showCache: false };
  }
}

/** The feed vocabulary of the dock chip: live inside the TTL, stale when the gateway says so. */
export function feedStateOfResource(status: "idle" | "loading" | "ready" | "error", stale: boolean | null, rowCount: number): "live" | "stale" | "empty" {
  if (status !== "ready") return "empty";
  if (stale === true) return "stale";
  return rowCount > 0 ? "live" : "empty";
}
