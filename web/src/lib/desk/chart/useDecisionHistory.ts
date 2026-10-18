"use client";

import { useEffect, useRef, useState } from "react";
import type { JevReadBoardView, JevReadView } from "../../jev-read";
import {
  boardReads,
  historyList,
  loadDecisionHistory,
  mergeDecisionHistory,
  saveDecisionHistory,
} from "./history";

/** The store is written at most once per this interval, on a board refresh. */
const WRITE_INTERVAL_MS = 5_000;

/**
 * The reads with a real decision that the chart shows as markers, remembered past the board's short recent
 * window. Loaded from localStorage after mount (SSR stays empty), merged on every board refresh and persisted
 * throttled. Only reads with status "ok" and a real state are ever stored; nothing synthetic is created.
 */
export function useDecisionHistory(board: JevReadBoardView | null): JevReadView[] {
  const mapRef = useRef<Map<string, JevReadView>>(new Map());
  const lastWriteRef = useRef(0);
  const [list, setList] = useState<JevReadView[]>([]);

  useEffect(() => {
    mapRef.current = loadDecisionHistory(window.localStorage, Date.now());
    setList(historyList(mapRef.current));
  }, []);

  useEffect(() => {
    if (board === null) return;
    const now = Date.now();
    mergeDecisionHistory(mapRef.current, boardReads(board), now);
    setList(historyList(mapRef.current));
    if (now - lastWriteRef.current >= WRITE_INTERVAL_MS) {
      lastWriteRef.current = now;
      saveDecisionHistory(window.localStorage, mapRef.current);
    }
  }, [board]);

  return list;
}
