/**
 * The one line that tells where a dock view's data comes from and how old it is (DAT-2, T10.3). Pure: the caller passes the clock.
 *
 * Only the views that had no such line need it: the zones (engine reading) and the raw OKX market (tape, book, liquidity). The on-chain
 * views carry it in their own head (`OnchainHead`: source, age, budget), the Fluxo tab in its "Leitura" row, the wallet and the Inonu tab
 * in their own headings. A stale reading is never worded as live: it says "dado velho" and its age, and a feed that never spoke says so.
 */
import { ageText } from "../desk/chart/inonu-layer";

/** Views of the dock that carry their own origin and age label. */
export const SELF_LABELLED_VIEWS: readonly string[] = ["melhores", "oportunidades", "smart", "traders", "holders", "lancamentos", "pares"];

export interface ViewSourceInput {
  readonly view: "zonas" | "fita" | "livro" | "liquidez";
  /** An on-chain token is in focus: the tape and the liquidity switch to the on-chain surface, which has its own head. */
  readonly onchain: boolean;
  /** Milliseconds since the last message of the OKX real time feed; null when it never spoke. */
  readonly feedAgeMs: number | null | undefined;
  /** The reading of the flow engine behind the zones; null when there is none. */
  readonly engine: { readonly asOfMs: number; readonly fonte: "okx_ws_trades" | "okx_public_v5" } | null;
  readonly nowMs: number;
  /** The feed (or the reading) is older than it should be. */
  readonly stale: boolean;
}

export function viewSource(input: ViewSourceInput): string | null {
  if (input.view === "zonas") {
    if (input.engine === null) return null;
    const age = ageText(input.nowMs - input.engine.asOfMs);
    const live = input.engine.fonte === "okx_ws_trades";
    if (input.stale) return `${live ? "OKX trades" : "OKX por consulta"}, dado velho, ${age}`;
    return live ? `OKX trades ao vivo, ${age}` : `OKX por consulta, sem ao vivo, ${age}`;
  }
  // the tape and the liquidity follow the on-chain token while one is in focus (and then carry their own head); the book keeps following OKX
  if (input.onchain && input.view !== "livro") return null;
  if (input.feedAgeMs === null || input.feedAgeMs === undefined) return "OKX tempo real, sem mensagem ainda";
  const age = ageText(input.feedAgeMs);
  return input.stale ? `OKX tempo real, dado velho, ${age}` : `OKX tempo real, ${age}`;
}
