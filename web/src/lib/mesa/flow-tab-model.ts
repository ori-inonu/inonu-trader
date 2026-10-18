/**
 * What the Fluxo tab and the Zonas view of the Radar tab tell (DOC-1, DOC-4, INF-1), built only from the reading of the flow engine
 * (`/inonu/engine`). Pure: no clock of its own (the caller passes `nowMs`), no network, no React.
 *
 * Honest by construction: a figure that needs the adaptive thresholds says "aguardando aquecimento" until the engine has them (a zero
 * there would be a claim), a reading older than a minute is stale and says its age, a missing reading is empty and says why, and a
 * list the engine cut to the levels nearest the price is told partial. The words are descriptive (FLX-10): "compradores" and
 * "vendedores" name the aggressing side of the trades, never an instruction.
 */
import { ageText } from "../desk/chart/inonu-layer";
import { baseSymbol, fmtCompact, fmtNumber, fmtPx, priceDecimals } from "../desk/ui/format";
import { REASON_TEXT, flowStatusText } from "../inonu/feed-text";
import type { ChartOverlay, OverlayZone } from "../inonu/overlay";
import { OVERLAY_STALE_MS, type OverlayFeedState } from "../inonu/overlay-feed";

/** The most rows the Fluxo tab shows without opening a drawer (INF-1). */
export const FLOW_ROWS_MAX = 12;
/** The most zones the Radar tab lists (info-diet.md section 3). */
export const ZONE_ROWS_MAX = 6;

/** The engine cuts its level list to this many levels nearest the price; a list this long may be only part of the window. */
const ENGINE_LEVEL_CAP = 120;

export type TabState = "live" | "stale" | "empty";

export interface FlowRow {
  readonly label: string;
  readonly value: string;
  readonly note?: string | null;
}

export interface FlowTabModel {
  readonly state: TabState;
  /** One line about the engine (live or by query, warm-up, zones, or why it is not reading); empty when there is no feed. */
  readonly status: string;
  /** Why the tab is empty; null when it has rows. */
  readonly reason: string | null;
  readonly rows: readonly FlowRow[];
}

export interface ZoneRowModel {
  readonly id: string;
  readonly lado: string;
  readonly faixa: string;
  readonly nota: string;
  readonly fatores: string;
  readonly idade: string;
  readonly estado: string;
  readonly invalidacao: string;
}

export interface ZonesTabModel {
  readonly state: TabState;
  readonly status: string;
  readonly reason: string | null;
  readonly rows: readonly ZoneRowModel[];
  /** Zones the engine has beyond the six listed. */
  readonly hidden: number;
}

const NO_FEED_REASON = "O motor so le instrumentos da OKX; nenhum em foco";

const cap = (text: string): string => (text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1));

/** Why there is no reading to show, in words; null when there is one. */
function emptyReason(feed: OverlayFeedState | null): string | null {
  if (feed === null) return NO_FEED_REASON;
  if (feed.overlay !== null) return null;
  if (feed.status === "loading") return "Lendo o motor";
  const reason = feed.reason ?? "";
  return cap(REASON_TEXT[reason] ?? (reason.startsWith("okx_") ? "a OKX nao respondeu" : "falha ao ler o fluxo"));
}

function stateOf(feed: OverlayFeedState, overlay: ChartOverlay, nowMs: number): TabState {
  if (feed.status === "erro") return "stale";
  return nowMs - overlay.asOfMs >= OVERLAY_STALE_MS ? "stale" : "live";
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const sideWord = (lado: "c" | "v"): string => (lado === "c" ? "compradores" : "vendedores");

function signed(v: number, text: (n: number) => string): string {
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "-"}${text(Math.abs(v))}`;
}

function runText(count: number, longest: { readonly n: number; readonly what: string; readonly baixo: number; readonly alto: number } | null, px: (v: number) => string): string {
  if (count === 0 || longest === null) return "nenhuma";
  return `${plural(count, "corrida", "corridas")}, a ${count === 1 ? "unica" : "maior"} com ${longest.n} niveis ${longest.what} entre ${px(longest.baixo)} e ${px(longest.alto)}`;
}

function biggest<T extends { readonly n: number }>(runs: readonly T[]): T | null {
  let best: T | null = null;
  for (const run of runs) if (best === null || run.n > best.n) best = run;
  return best;
}

export function flowTab(feed: OverlayFeedState | null, nowMs: number): FlowTabModel {
  const status = flowStatusText(feed);
  const overlay = feed?.overlay ?? null;
  if (feed === null || overlay === null) return { state: "empty", status, reason: emptyReason(feed), rows: [] };

  const px = (v: number): string => fmtPx(v, priceDecimals(overlay.tickSz));
  const ready = overlay.aquecimento.pronto;
  const waiting = "aguardando aquecimento";
  const levels = overlay.niveis;
  // the totals of the whole window when the core sends them; otherwise the sum of the levels it kept (partial when it cut the list)
  const buy = overlay.totais?.c ?? levels.reduce((sum, l) => sum + l.c, 0);
  const sell = overlay.totais?.v ?? levels.reduce((sum, l) => sum + l.v, 0);
  const cut = overlay.totais === undefined && levels.length >= ENGINE_LEVEL_CAP;
  // a unit is a lot of the instrument: told in base currency when the core says how big it is, in lots otherwise, never as a currency
  const unit = overlay.unidade === undefined ? null : Number(overlay.unidade);
  const base = baseSymbol(overlay.instId);
  const qty = (units: number): string => (unit === null || !Number.isFinite(unit) ? `${fmtCompact(units)} lotes` : `${fmtCompact(units * unit)} ${base}`);

  const imbBuy = levels.filter((l) => l.imb === "c" || l.imb === "cv").length;
  const imbSell = levels.filter((l) => l.imb === "v" || l.imb === "cv").length;
  const seq = overlay.corridas.sequencial;
  const prog = overlay.corridas.progressao;
  const exh = overlay.corridas.exaustao;
  const seqBest = biggest(seq);
  const progBest = biggest(prog);
  const exhBest = biggest(exh);
  const marks = levels.filter((l) => l.volume !== null);
  const alertBuy = levels.filter((l) => l.alerta?.c === true).length;
  const alertSell = levels.filter((l) => l.alerta?.v === true).length;
  const p = overlay.perfil;

  const warm = overlay.aquecimento;
  const warmText = !ready
    ? `${warm.fechadas} de ${warm.necessarias} minutos fechados`
    : warm.restaurado > 0
      ? `pronto, ${warm.restaurado} min vieram do historico salvo`
      : "pronto";

  const rows: FlowRow[] = [
    { label: "Leitura", value: overlay.fonte === "okx_ws_trades" ? "ao vivo, trades da OKX" : "por consulta, sem ao vivo", note: ageText(nowMs - overlay.asOfMs) },
    { label: "Aquecimento", value: warmText },
    { label: "Volume agredido", value: `compradores ${qty(buy)}, vendedores ${qty(sell)}`, note: cut ? "parcial, so os niveis mais proximos do preco" : null },
    { label: "Delta", value: signed(buy - sell, qty) },
    {
      label: "Absorcao",
      value: overlay.absorcao === null ? "nenhuma" : `${overlay.absorcao.lado === "c" ? "compradora" : "vendedora"}, volume ${fmtNumber(overlay.absorcao.razaoVolume, 1)} vezes o das velas passadas`,
    },
    { label: "Desequilibrios", value: ready ? (imbBuy + imbSell === 0 ? "nenhum" : `${imbBuy} compradores, ${imbSell} vendedores`) : waiting },
    { label: "Sequencial", value: ready ? runText(seq.length, seqBest && { n: seqBest.n, what: sideWord(seqBest.lado), baixo: seqBest.baixo, alto: seqBest.alto }, px) : waiting },
    { label: "Progressao", value: ready ? runText(prog.length, progBest && { n: progBest.n, what: sideWord(progBest.lado), baixo: progBest.baixo, alto: progBest.alto }, px) : waiting },
    { label: "Exaustao", value: ready ? runText(exh.length, exhBest && { n: exhBest.n, what: `na extremidade ${exhBest.extremo === "alto" ? "alta" : "baixa"}`, baixo: exhBest.baixo, alto: exhBest.alto }, px) : waiting },
    {
      label: "Fator Volume",
      value: !ready
        ? waiting
        : marks.length === 0
          ? "nenhum"
          : `${plural(marks.length, "nivel marcado", "niveis marcados")}, ${plural(marks.filter((l) => l.volume === "c").length, "comprador", "compradores")}, ${plural(marks.filter((l) => l.volume === "v").length, "vendedor", "vendedores")}`,
    },
    {
      label: "Alerta de quantidade",
      value: !ready ? waiting : alertBuy + alertSell === 0 ? "nenhum" : `${plural(alertBuy, "nivel comprador", "niveis compradores")}, ${plural(alertSell, "nivel vendedor", "niveis vendedores")}`,
    },
    {
      label: "Perfil de volume",
      value: p.poc === null ? "indisponivel" : `POC ${px(p.poc.baixo)} a ${px(p.poc.alto)}, VAL ${p.val === null ? "indisponivel" : px(p.val)}, VAH ${p.vah === null ? "indisponivel" : px(p.vah)}`,
    },
  ];

  return { state: stateOf(feed, overlay, nowMs), status, reason: null, rows: rows.slice(0, FLOW_ROWS_MAX) };
}

const SIDE_WORD: Readonly<Record<OverlayZone["lado"], string>> = { demanda: "Demanda", oferta: "Oferta", neutra: "Neutra" };

export function zonesTab(feed: OverlayFeedState | null, nowMs: number): ZonesTabModel {
  const status = flowStatusText(feed);
  const overlay = feed?.overlay ?? null;
  if (feed === null || overlay === null) return { state: "empty", status, reason: emptyReason(feed), rows: [], hidden: 0 };

  const decimals = priceDecimals(overlay.tickSz);
  const px = (v: number): string => fmtPx(v, decimals);
  const ordered = [...overlay.zonas].sort((a, b) => b.nota - a.nota);
  const rows = ordered.slice(0, ZONE_ROWS_MAX).map(
    (z): ZoneRowModel => ({
      id: z.id,
      lado: SIDE_WORD[z.lado],
      faixa: `${px(z.baixo)} a ${px(z.alto)}`,
      nota: fmtNumber(z.nota, 2),
      fatores: z.fatores.join(", "),
      idade: plural(z.idadeBarras, "barra", "barras"),
      estado: z.estado === "testada" ? "Testada" : "Ativa",
      invalidacao: z.invalidacao === null ? "nenhum" : px(z.invalidacao),
    }),
  );
  const warm = overlay.aquecimento;
  const reason =
    rows.length > 0
      ? null
      : warm.pronto
        ? "Nenhuma zona ativa agora"
        : `Nenhuma zona ativa ainda, o motor aquece ${warm.fechadas} de ${warm.necessarias} minutos`;
  return { state: stateOf(feed, overlay, nowMs), status, reason, rows, hidden: Math.max(0, ordered.length - rows.length) };
}
