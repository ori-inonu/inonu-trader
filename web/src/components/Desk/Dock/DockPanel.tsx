"use client";

import { type KeyboardEvent, type PointerEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  DOCK_KEY_STEP_PCT,
  DOCK_MAX_PCT,
  DOCK_MIN_PCT,
  DOCK_TAB_BAR_PX,
  DOCK_TABS,
  defaultDock,
  dockHeightPx,
  dragHeightPct,
  isDockTab,
  loadDock,
  saveDock,
  selectDockTab,
  stepHeightPct,
  type DockState,
  type DockTabDef,
} from "@/lib/mesa/dock";
import { DEFAULT_SUBS, type DockSubs, type SubViewTab, isSubView, migrateSubs, saveSubs } from "@/lib/mesa/dock-subviews";
import type { PanelFeedState } from "../panels/PanelFrame";
import styles from "./DockPanel.module.css";

/** The feed vocabulary is the one PanelFrame already speaks: Ao vivo, Dado velho, Sem dados. */
const STATE_LABEL: Record<PanelFeedState, string> = { live: "Ao vivo", stale: "Dado velho", empty: "Sem dados" };

export interface DockTabView {
  readonly id: string;
  readonly label: string;
  readonly state: PanelFeedState;
  readonly body: ReactNode;
}

export interface DockPanelProps {
  readonly tabs: readonly DockTabView[];
  /** The active tab id. When it is not in `tabs` the first tab shows without writing state. */
  readonly active: string;
  readonly onSelect: (id: string) => void;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly heightPct: number;
  readonly onHeightPct: (pct: number) => void;
  /** False on mobile: the panel fills its section and shows no resize separator. */
  readonly resizable?: boolean;
  readonly group?: string;
  readonly className?: string;
}

/** Shared dock state: one holder serves the desktop panel and the two mobile groups. */
export function useDockState(tabs: readonly DockTabDef[] = DOCK_TABS): {
  state: DockState;
  /** The chosen view of the two composite tabs (Radar, Mercado bruto). */
  subs: DockSubs;
  select: (id: string) => void;
  selectSub: (tab: SubViewTab, id: string) => void;
  toggle: () => void;
  setHeightPct: (pct: number) => void;
} {
  const [state, setState] = useState<DockState>(() => defaultDock(tabs));
  const [subs, setSubs] = useState<DockSubs>(DEFAULT_SUBS);
  // The stored value is read only after mount, so the server markup is always the default state.
  useEffect(() => {
    setState(loadDock(undefined, tabs));
    setSubs(migrateSubs());
  }, [tabs]);
  const patch = useCallback(
    (p: Partial<DockState>) =>
      setState((s) => {
        const next: DockState = {
          open: p.open ?? s.open,
          tab: p.tab !== undefined && isDockTab(p.tab, tabs) ? p.tab : s.tab,
          heightPct: p.heightPct ?? s.heightPct,
        };
        saveDock(next);
        return next;
      }),
    [tabs],
  );
  const select = useCallback((id: string) => setState((current) => {
    const next = selectDockTab(current, id, tabs);
    if (next !== current) saveDock(next);
    return next;
  }), [tabs]);
  const selectSub = useCallback((tab: SubViewTab, id: string) => {
    if (!isSubView(tab, id)) return;
    setSubs((current) => {
      const next: DockSubs = { ...current, [tab]: id };
      saveSubs(next);
      return next;
    });
  }, []);
  const toggle = useCallback(() => patch({ open: !state.open }), [patch, state.open]);
  const setHeightPct = useCallback((pct: number) => patch({ heightPct: pct }), [patch]);
  return { state, subs, select, selectSub, toggle, setHeightPct };
}

/**
 * The bottom dock of the desk, in the style of the trading platforms: a strip of tabs, the state
 * chip of the active tab, a collapse button and a draggable top edge. The whole height lives in
 * the `--dock-h` custom property that MesaView writes on the grid root.
 */
export function DockPanel({ tabs, active, onSelect, open, onToggle, heightPct, onHeightPct, resizable = true, group, className }: DockPanelProps) {
  const instanceId = useId();
  const current = tabs.some((t) => t.id === active) ? tabs.find((t) => t.id === active)! : tabs[0];
  const dragRef = useRef<{ startY: number; startPct: number } | null>(null);

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    const ids = tabs.map((t) => t.id);
    const at = Math.max(0, ids.indexOf(current.id));
    let next = at;
    if (key === "ArrowRight") next = (at + 1) % ids.length;
    else if (key === "ArrowLeft") next = (at - 1 + ids.length) % ids.length;
    else if (key === "Home") next = 0;
    else next = ids.length - 1;
    event.preventDefault();
    onSelect(ids[next]);
    const list = event.currentTarget;
    requestAnimationFrame(() => list.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus());
  };

  const onSepKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const vh = window.innerHeight;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onHeightPct(stepHeightPct(heightPct, 1, vh));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onHeightPct(stepHeightPct(heightPct, -1, vh));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onToggle();
    }
  };

  const onSepPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { startY: event.clientY, startPct: heightPct };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onSepPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    onHeightPct(dragHeightPct(drag.startPct, drag.startY, event.clientY, window.innerHeight));
  };
  const onSepPointerEnd = () => {
    dragRef.current = null;
  };

  return (
    <section
      className={`${styles.panel}${className ? ` ${className}` : ""}`}
      data-open={open ? "true" : "false"}
      data-group={group}
      aria-label="Painel inferior da mesa"
    >
      {resizable && open ? (
        <div
          className={styles.separator}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Altura do painel inferior"
          aria-valuenow={Math.round(heightPct)}
          aria-valuemin={DOCK_MIN_PCT}
          aria-valuemax={DOCK_MAX_PCT}
          aria-valuetext={`${Math.round(heightPct)} por cento da janela`}
          tabIndex={0}
          onKeyDown={onSepKeyDown}
          onPointerDown={onSepPointerDown}
          onPointerMove={onSepPointerMove}
          onPointerUp={onSepPointerEnd}
          onPointerCancel={onSepPointerEnd}
          onDoubleClick={onToggle}
        />
      ) : null}
      <div className={styles.bar} role="tablist" aria-label="Painel inferior" onKeyDown={onTabKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${instanceId}-dock-tab-${tab.id}`}
            aria-selected={tab.id === current.id}
            aria-controls={`${instanceId}-dock-body-${tab.id}`}
            tabIndex={tab.id === current.id ? 0 : -1}
            className={styles.tab}
            data-state={tab.state}
            onClick={() => onSelect(tab.id)}
          >
            <span className={styles.tabDot} aria-hidden="true"></span>
            {tab.label}
            <span className="srOnly">{`, ${STATE_LABEL[tab.state].toLowerCase()}`}</span>
          </button>
        ))}
        <span className={styles.barSpacer} />
        <span className={styles.chip} data-state={current.state} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {STATE_LABEL[current.state]}
        </span>
        {resizable ? (
          <button
            type="button"
            className={styles.collapse}
            aria-expanded={open}
            aria-label={open ? "Recolher painel inferior" : "Expandir painel inferior"}
            title={open ? "Recolher" : "Expandir"}
            onClick={onToggle}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d={open ? "M2 7.5 6 3.5l4 4" : "M2 4.5 6 8.5l4-4"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {open ? (
        <div className={styles.body} role="tabpanel" id={`${instanceId}-dock-body-${current.id}`} aria-labelledby={`${instanceId}-dock-tab-${current.id}`}>
          {current.body}
        </div>
      ) : null}
    </section>
  );
}

export { DOCK_TAB_BAR_PX, DOCK_KEY_STEP_PCT, dockHeightPx };
