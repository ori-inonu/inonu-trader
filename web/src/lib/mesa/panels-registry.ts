/**
 * The registry of everything the desk shows (INF-3): routes, tabs of the bottom dock and panel components, each with the
 * requirement of docs/sdd/inonu-desktop-v1/SPEC.md that asks for it. A panel without an entry fails the test in
 * `panels-registry.test.ts`, so the desk cannot grow a screen nobody asked for. Tabs also carry the most rows they may show
 * without opening a drawer (INF-1, [info-diet.md](../../../../docs/sdd/inonu-desktop-v1/info-diet.md)).
 *
 * The bottom dock has five tabs (DOC-4, T4.6); the views inside Radar and Mercado bruto are not tabs (see dock-subviews.ts), so
 * they are not in this list. A new tab needs an entry here, and the test keeps both in step.
 */
export type RegistryKind = "rota" | "aba" | "painel";

export interface RegistryEntry {
  readonly kind: RegistryKind;
  readonly id: string;
  /** The requirement of the SPEC that asks for it. */
  readonly requisito: string;
  /** Tabs only: the most rows visible without opening a drawer. */
  readonly maxLinhas?: number;
}

/** The documented budget of a tab (INF-1). */
export const MAX_ROWS_PER_TAB = 12;

export const PANEL_REGISTRY: readonly RegistryEntry[] = [
  // the routes of the app: the agent, and the keys it works with. The desk, the tracker, the diagnostic and the old console are not served any more.
  { kind: "rota", id: "/", requisito: "AUT-12" },
  { kind: "rota", id: "/configuracoes", requisito: "CFG-5" },

  // tabs of the bottom dock
  { kind: "aba", id: "diario", requisito: "DOC-3", maxLinhas: 12 },
  { kind: "aba", id: "radar", requisito: "DOC-2", maxLinhas: 12 },
  { kind: "aba", id: "fluxo", requisito: "DOC-4", maxLinhas: 12 },
  { kind: "aba", id: "carteira", requisito: "WAL-4", maxLinhas: 12 },
  { kind: "aba", id: "mercado", requisito: "DOC-4", maxLinhas: 12 },

  // panels of the desk
  { kind: "painel", id: "PriceChart", requisito: "SMT-7" },
  { kind: "painel", id: "AssetPicker", requisito: "SRC-5" },
  { kind: "painel", id: "Watchlist", requisito: "INF-1" },
  { kind: "painel", id: "DecisionCard", requisito: "ASK-7" },
  { kind: "painel", id: "OrderBookLadder", requisito: "DOC-4" },
  { kind: "painel", id: "TimeAndSales", requisito: "DOC-4" },
  { kind: "painel", id: "LiquiditySurface", requisito: "DOC-4" },
  { kind: "painel", id: "FlowGauge", requisito: "FLX-7" },
  { kind: "painel", id: "DerivativesStrip", requisito: "SMT-2" },
  { kind: "painel", id: "JevIndicators", requisito: "SMT-1" },
];
