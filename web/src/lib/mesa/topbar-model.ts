import { shortAddr } from "@/lib/format";
import type { ChipTone, FeedChip } from "./mesa-model";

/**
 * Pure view models of the desk topbar. Nothing here is defaulted to a plausible value: an unknown age is "sem mensagem",
 * an unreadable list of sources is "sem fontes", and no text carries a middle dot, an em dash or an en dash.
 */

const WORD: Record<ChipTone, string> = { live: "ao vivo", late: "atrasado", down: "fora do ar", off: "inativo" };

/** The state spoken in words, so a source is never told by colour alone. */
export function toneWord(tone: ChipTone): string {
  return WORD[tone];
}

export interface FeedSummary {
  readonly tone: ChipTone;
  readonly text: string;
  /** The form that fits a pill: how many of the sources are live. The colour and the full text carry the rest. */
  readonly short: string;
  readonly counts: Record<ChipTone, number>;
  readonly total: number;
}

/**
 * One pill for the health of every source. The tone is the worst real problem: a source that is merely inactive (for
 * example a wallet that is not connected) does not turn the bar amber or red.
 */
export function summarizeFeeds(chips: readonly FeedChip[]): FeedSummary {
  const counts: Record<ChipTone, number> = { live: 0, late: 0, down: 0, off: 0 };
  for (const chip of chips) counts[chip.tone] += 1;
  const total = chips.length;
  const parts: string[] = [];
  if (counts.live > 0) parts.push(`${counts.live} ao vivo`);
  if (counts.late > 0) parts.push(`${counts.late} ${counts.late === 1 ? "atrasada" : "atrasadas"}`);
  if (counts.down > 0) parts.push(`${counts.down} fora do ar`);
  if (counts.off > 0) parts.push(`${counts.off} ${counts.off === 1 ? "inativa" : "inativas"}`);
  const tone: ChipTone = counts.down > 0 ? "down" : counts.late > 0 ? "late" : counts.live > 0 ? "live" : "off";
  return { tone, text: total === 0 ? "sem fontes" : parts.join(", "), short: total === 0 ? "sem fontes" : `${counts.live} de ${total} ao vivo`, counts, total };
}

export interface WalletBadge {
  readonly tone: ChipTone;
  readonly label: string;
  readonly detail: string;
  /** The short form, only while the wallet is connected and live. The full address never leaves the wallet store. */
  readonly address: string | null;
}

/** The account chip: what the wallet is doing, never a control. */
export function walletBadge(chip: FeedChip | undefined, account: string | null): WalletBadge {
  if (!chip) return { tone: "off", label: "Carteira OKX", detail: "sem dados", address: null };
  const address = chip.tone === "live" && account ? shortAddr(account) : null;
  return { tone: chip.tone, label: address ? `Carteira ${address}` : "Carteira OKX", detail: chip.detail ?? toneWord(chip.tone), address };
}

/** The short clock selo of the bar. The full sentence stays in skewLabel (DeskRail) for screen readers and the tooltip. */
export function skewBadge(skewMs: number | null): { text: string; warn: boolean } {
  if (skewMs === null) return { text: "relogio nao comparado", warn: false };
  if (Math.abs(skewMs) <= 5_000) return { text: "relogio sincronizado", warn: false };
  return { text: `relogio ${Math.round(Math.abs(skewMs) / 1000)} s ${skewMs > 0 ? "atrasado" : "adiantado"}`, warn: true };
}

const WALLET_HINTS: Record<string, string> = {
  "extensao nao encontrada": "A extensao OKX Wallet nao foi encontrada neste navegador. Instale a extensao para conectar.",
  "nao conectada": "Conecte pela secao Carteira OKX do rodape. A barra nao conecta nem assina nada.",
  conectada: "Conectada. A leitura fica neste navegador e a barra nao assina nem envia nada.",
  "rede nao suportada": "A conta esta numa rede que o painel nao le. Troque de rede na secao Carteira OKX do rodape.",
  consultando: "Lendo a conta neste navegador.",
  "consulta falhou": "A leitura da conta falhou. Tente de novo na secao Carteira OKX do rodape.",
};

/** What the account chip tells when opened: an explanation, never a control. */
export function walletHint(detail: string): string {
  return WALLET_HINTS[detail] ?? "Estado da carteira neste navegador. A barra nao conecta, assina nem envia nada.";
}

/** How long ago a feed spoke. undefined means this source has no timing and no line is shown; unknown is never a number. */
export function ageLabel(ageMs: number | null | undefined): string | null {
  if (ageMs === undefined) return null;
  if (ageMs === null || !Number.isFinite(ageMs)) return "sem mensagem";
  if (ageMs < 1_000) return "agora";
  if (ageMs < 60_000) return `ha ${Math.floor(ageMs / 1_000)} s`;
  return `ha ${Math.floor(ageMs / 60_000)} min`;
}

export type Shortcut = "search" | "alerts" | "layout" | "fullscreen" | "help";

export interface ShortcutEvent {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly defaultPrevented?: boolean;
  /** A DOM event target; only tagName and isContentEditable are read, and anything else counts as not typing. */
  readonly target?: unknown;
}

/** The keys the desk answers to. Nothing fires while someone types in a field or holds a modifier. */
export function shortcutFor(event: ShortcutEvent): Shortcut | null {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = (event.target ?? null) as { tagName?: unknown; isContentEditable?: unknown } | null;
  const tag = typeof target?.tagName === "string" ? target.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable === true) return null;
  switch (event.key) {
    case "/":
      return "search";
    case "a":
    case "A":
      return "alerts";
    case "g":
    case "G":
      return "layout";
    case "f":
    case "F":
      return "fullscreen";
    case "?":
      return "help";
    default:
      return null;
  }
}

export const SHORTCUTS: readonly { readonly keys: string; readonly action: string }[] = [
  { keys: "/", action: "Buscar ativo" },
  { keys: "A", action: "Alertas de preco" },
  { keys: "G", action: "Modo grafico" },
  { keys: "F", action: "Tela cheia" },
  { keys: "?", action: "Preferencias e atalhos" },
  { keys: "Esc", action: "Fechar o painel aberto" },
];

/** inonu-BTC-USDT-20261012-164523Z.png: the instrument and the UTC time, nothing a file system would refuse. */
export function captureFileName(instId: string, nowMs: number): string {
  const safe = instId.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "grafico";
  const d = new Date(nowMs);
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}-${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`;
  return `inonu-${safe}-${stamp}.png`;
}

/** Age of each desk feed against the browser clock; nothing before the first tick of that clock, null when a feed never spoke. */
export function feedAges(feeds: readonly { readonly id: string; readonly lastMessageAtMs: number | null }[], nowMs: number): Record<string, number | null> {
  const ages: Record<string, number | null> = {};
  if (!(nowMs > 0)) return ages;
  for (const feed of feeds) ages[feed.id] = feed.lastMessageAtMs === null ? null : Math.max(0, nowMs - feed.lastMessageAtMs);
  return ages;
}
