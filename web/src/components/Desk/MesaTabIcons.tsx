import type { ReactNode } from "react";

/**
 * The glyphs of the five sections of the phone desk, one per tab, so the bottom bar reads at a glance
 * the way the bars of the wallet apps do. Line icons on a 16 px grid in the stroke of the topbar tools;
 * decorative (the tab keeps its word), so every one is aria-hidden.
 */
const svgProps = { width: 18, height: 18, viewBox: "0 0 16 16", "aria-hidden": true, focusable: false, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const MESA_TAB_ICONS: Readonly<Record<"jev" | "grafico" | "livro" | "fluxo" | "fontes", ReactNode>> = {
  // Inonu: a speech bubble, the consultation.
  jev: (
    <svg {...svgProps}>
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
      <path d="M5.5 7h5" />
    </svg>
  ),
  // Grafico: two candles.
  grafico: (
    <svg {...svgProps}>
      <path d="M5 2v2M5 12v2M11 2v3M11 11v3" />
      <rect x="3.25" y="4" width="3.5" height="8" rx="0.8" />
      <rect x="9.25" y="5" width="3.5" height="6" rx="0.8" />
    </svg>
  ),
  // Livro: the ladder of the order book, bids and asks of different depth.
  livro: (
    <svg {...svgProps}>
      <path d="M2.5 4h7M2.5 6.5h4M2.5 9.5h9M2.5 12h5" />
      <path d="M13.5 3v10" />
    </svg>
  ),
  // Fluxo: the two sides of the aggressor flow.
  fluxo: (
    <svg {...svgProps}>
      <path d="M5 13V3M5 3 2.5 5.5M5 3l2.5 2.5" />
      <path d="M11 3v10M11 13l-2.5-2.5M11 13l2.5-2.5" />
    </svg>
  ),
  // Fontes: the sources, as the arcs of a signal.
  fontes: (
    <svg {...svgProps}>
      <circle cx="8" cy="11" r="1.2" fill="currentColor" stroke="none" />
      <path d="M5.2 8.4a4 4 0 0 1 5.6 0" />
      <path d="M3 6.2a7 7 0 0 1 10 0" />
    </svg>
  ),
};
