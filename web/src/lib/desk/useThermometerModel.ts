"use client";

import { useEffect, useMemo, useState } from "react";
import { useInonuLayer } from "@/lib/inonu/useInonuLayer";
import type { MarketRead } from "./market-read";
import { guardTrades, thermometer, type Thermometer } from "./thermometer";
import type { DeskMetrics } from "./types";
import { useSteadyFlow } from "./useSteadyFlow";

export interface ThermometerRead {
  readonly model: Thermometer;
  /** How far the flow engine is from being ready, or null when it is ready (or unknown). */
  readonly warming: { readonly closed: number; readonly needed: number } | null;
}

/**
 * The reading of the thermometer as a hook: who is in charge, how many conditions line up and what the Inonu last answered, built from the SAME shared stores the chart reads (the saved
 * answers of the Inonu layer, the one steady hand of the flow). The thermometer panel and the legend of the chart both call it, so the two always tell the same story; nothing here asks
 * the model, it only reads what the page has already measured and saved.
 */
export function useThermometerModel({
  instId,
  metrics,
  price,
  market = null,
  measured = "",
}: {
  readonly instId: string;
  readonly metrics: DeskMetrics;
  readonly price: number | null;
  /** What the book says about the cost of moving money through it, when it could be read. */
  readonly market?: MarketRead | null;
  /** How the hits of the Inonu are measured, in one sentence the account of the profit reads its break even against. */
  readonly measured?: string;
}): ThermometerRead {
  const { layer } = useInonuLayer(instId, true, true);
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const overlay = layer?.overlay ?? null;
  const decision = layer?.decision ?? null;

  // The steady hand: the flow reading changes every second, so it is sampled once a second into a smoothed value with hysteresis and shown in steps. It is the ONE hand of the
  // page (the Inonu tab reads the same one), and another instrument starts it over: a reading of the old one must not carry into the new.
  const stable = useSteadyFlow(instId, () => metrics.flowImbalance60s);

  const model = useMemo(
    () =>
      thermometer({
        imbalance: metrics.flowImbalance60s,
        trades: guardTrades(metrics),
        stable,
        price,
        zones: overlay?.zonas ?? [],
        market: market !== null && market.state === "ok" ? { thickness: market.thickness, text: market.thicknessText } : null,
        answer: decision === null ? null : { action: decision.action, atMs: decision.atMs, ...(decision.veredito === undefined ? {} : { veredito: decision.veredito }) },
        base: instId.split("-")[0] ?? "",
        measured,
        nowMs,
      }),
    // the raw flow is read through `stable`; the minute of trades is what guards a quiet market
    [metrics.tradesPerSecond60s, metrics.tradeCount60s, stable, price, overlay, decision, instId, measured, nowMs, market], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const warming = overlay !== null && !overlay.aquecimento.pronto ? { closed: overlay.aquecimento.fechadas, needed: overlay.aquecimento.necessarias } : null;
  return { model, warming };
}
