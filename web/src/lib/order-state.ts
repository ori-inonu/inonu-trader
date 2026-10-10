import type { KpiTone } from "./kpi";
import type { BlockEvent, Quote } from "./types";

export interface OrderState {
  label: string;
  tone: KpiTone;
}

const QUOTE_STATE: Record<Quote["status"], OrderState> = {
  sent: { label: "Orden enviada", tone: "neutral" },
  placed: { label: "Ordem no livro", tone: "buy" },
  reverted: { label: "Ordem revertida", tone: "sell" },
  lost: { label: "Ordem perdida", tone: "sell" },
  sim: { label: "Ordem simulada", tone: "late" },
};

const SIMULATED: OrderState = { label: "Execucao simulada", tone: "late" };
const FILLED: OrderState = { label: "Execucao real", tone: "buy" };

/**
 * The single line of truth for how the latest order or execution reads.
 * A simulated quote or a simulated fill always wins, so simulated work can never be mistaken
 * for a real execution, and a real fill beats its own quote.
 */
export function orderStateFor(latest: BlockEvent | null): OrderState | null {
  const quote = latest?.quote ?? null;
  const fill = latest?.fill ?? null;
  if (!quote && !fill) return null;

  if (fill?.simulated === true) return SIMULATED;
  if (quote?.status === "sim") return QUOTE_STATE.sim;
  if (fill) return FILLED;
  return QUOTE_STATE[quote!.status];
}