import type { BlockEvent, ConnectionState, Meta, Side } from "./types";
import type { Action } from "./types";

export interface FeedPresentation {
  executionLabel: string;
  declaredModeLabel: string | null;
  sourceLabel: string;
  connectionLabel: string;
}

export type FeedSideFilter = "all" | Side | "hold";
export type FeedTypeFilter = "all" | "orders" | "fills";
export type ChartWindow = 32 | 64 | 128;

export interface DecisionPresentation {
  status: "waiting" | "late" | Action;
  label: string;
  probabilities: Record<Action, string>;
}

interface DecisionInput {
  action: Action;
  late: boolean;
  probabilities?: Partial<Record<Action, number>> | null;
}

function formatProbability(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? `${Math.round(value * 100)}%`
    : "Indisponível";
}

export function presentFeed(
  meta: Meta | null,
  connection: ConnectionState,
): FeedPresentation {
  const rawMode = meta?.mode?.trim().toLowerCase();
  const knownMode = rawMode === "simulation" || rawMode === "live";
  const modeConflicts = knownMode && meta !== null && (rawMode === "simulation") !== meta.dryRun;
  const modeUnknown = meta?.mode !== undefined && !knownMode;
  const executionLabel = meta?.dryRun === true && !modeConflicts && !modeUnknown
    ? "Simulação"
    : "Execução não verificada";

  let connectionLabel = "Feed desconectado. Reconectando";
  if (connection === "live") connectionLabel = "Feed conectado";
  if (connection === "connecting") connectionLabel = "Conectando ao feed";

  const declaredModeLabel = knownMode && !modeConflicts
    ? `Modo declarado: ${rawMode}`
    : null;
  const source = meta?.dataSource?.trim();

  return {
    executionLabel,
    declaredModeLabel,
    sourceLabel: source ? `Fonte: ${source}` : "Fonte não informada",
    connectionLabel,
  };
}

export function filterFeedEvents(
  events: BlockEvent[],
  sideFilter: FeedSideFilter,
  typeFilter: FeedTypeFilter,
): BlockEvent[] {
  return events.filter((event) => {
    if (typeFilter === "orders" && !event.quote) return false;
    if (typeFilter === "fills" && !event.fill) return false;
    if (sideFilter === "all") return true;

    if (sideFilter === "hold") {
      return typeFilter === "all" && event.decision?.action === "hold";
    }

    if (typeFilter === "orders") return event.quote?.side === sideFilter;
    if (typeFilter === "fills") return event.fill?.side === sideFilter;
    return event.decision?.action === sideFilter || event.quote?.side === sideFilter || event.fill?.side === sideFilter;
  });
}

export function presentDecision(decision: DecisionInput | null): DecisionPresentation {
  const status = !decision ? "waiting" : decision.late ? "late" : decision.action;
  const labels: Record<DecisionPresentation["status"], string> = {
    waiting: "Aguardando decisão",
    late: "Resposta tardia",
    buy: "Compra",
    sell: "Venda",
    hold: "Manter",
  };
  const probabilities = decision?.probabilities;

  return {
    status,
    label: labels[status],
    probabilities: {
      buy: formatProbability(probabilities?.buy),
      sell: formatProbability(probabilities?.sell),
      hold: formatProbability(probabilities?.hold),
    },
  };
}

export function sliceChartWindow(events: BlockEvent[], windowSize: ChartWindow): BlockEvent[] {
  return events.slice(-windowSize);
}
