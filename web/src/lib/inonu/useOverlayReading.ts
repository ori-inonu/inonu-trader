"use client";

/**
 * The reading of the flow engine for one instrument, shared by every reader on the page (the chart layer, the Zonas view of the
 * Radar tab, the Fluxo tab): one poll per instrument, started by the first reader and stopped by the last (overlay-share.ts). It is
 * free and never touches the model. A page that turns visible again reads once now.
 */
import { useCallback, useSyncExternalStore } from "react";
import { createOverlayClient } from "./overlay";
import { type OverlayFeedState, createOverlayFeed } from "./overlay-feed";
import { type OverlayShare, createOverlayShare } from "./overlay-share";

const INSTRUMENT = /^[A-Z0-9-]{3,60}$/;

let shared: OverlayShare | null = null;

function sharedOverlay(): OverlayShare {
  if (shared !== null) return shared;
  const client = createOverlayClient();
  const created = createOverlayShare({ make: ({ instId, onChange }) => createOverlayFeed({ client, instId, onChange }) });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") created.pokeAll();
    });
  }
  shared = created;
  return created;
}

const never = (): (() => void) => () => {};

/** The reading in force for the instrument, or null when `enabled` is false, the id is not an instrument, or nothing was read yet. */
export function useOverlayReading(instId: string, enabled: boolean): OverlayFeedState | null {
  const active = enabled && INSTRUMENT.test(instId);
  const subscribe = useCallback((onChange: () => void) => (active ? sharedOverlay().subscribe(instId, onChange) : never()), [active, instId]);
  const snapshot = useCallback(() => (active ? sharedOverlay().get(instId) : null), [active, instId]);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
