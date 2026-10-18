"use client";

/**
 * The drawing of the composite tabs of the bottom dock (DOC-4): the chip row of a tab that holds several views, and the two bodies that
 * come from the reading of the flow engine, the Fluxo table and the Zonas table. Presentational: the numbers and the words come from
 * `flow-tab-model.ts`, so each state is rendered in tests without a server. Nothing here moves or blinks.
 */
import type { ReactNode } from "react";
import type { FlowTabModel, ZonesTabModel } from "@/lib/mesa/flow-tab-model";
import type { SubViewDef } from "@/lib/mesa/dock-subviews";
import styles from "./DockComposite.module.css";

export interface DockCompositeProps {
  /** The accessible name of the chip group, e.g. "Vistas do Radar". */
  readonly label: string;
  readonly views: readonly SubViewDef[];
  readonly active: string;
  readonly onSelect: (id: string) => void;
  /** Where the data of the chosen view comes from and how old it is (DAT-2); null or absent when the view carries that line itself. */
  readonly source?: string | null;
  /** The body of the chosen view: the only one that is built. */
  readonly children: ReactNode;
}

export function DockComposite({ label, views, active, onSelect, source = null, children }: DockCompositeProps) {
  return (
    <div className={styles.composite}>
      <div className={styles.chips} role="group" aria-label={label}>
        {views.map((view) => (
          <button key={view.id} type="button" className={styles.chip} aria-pressed={view.id === active} onClick={() => onSelect(view.id)}>
            {view.label}
          </button>
        ))}
        {source !== null ? (
          <span className={styles.source} aria-label="Fonte e idade da vista">
            {source}
          </span>
        ) : null}
      </div>
      <div className={styles.pane}>{children}</div>
    </div>
  );
}

/** A scrolling pane for a view that brings its own sections (the news and sentiment of the Radar tab). */
export function DockNews({ children }: { readonly children: ReactNode }) {
  return <div className={styles.news}>{children}</div>;
}

function Empty({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.empty} role="status">
      {children}
    </div>
  );
}

function StatusLine({ text }: { readonly text: string }) {
  return text === "" ? null : <p className={styles.status}>{text}</p>;
}

export function DockFlowBody({ model }: { readonly model: FlowTabModel }) {
  if (model.rows.length === 0) {
    return (
      <div className={styles.fill}>
        <StatusLine text={model.status} />
        <Empty>{model.reason ?? "Sem leitura do motor"}</Empty>
      </div>
    );
  }
  return (
    <div className={styles.fill} data-stale={model.state === "stale" ? "true" : undefined}>
      <StatusLine text={model.status} />
      <div className={styles.table} role="table" aria-label="Fluxo do motor">
        <div className={styles.scroll} role="rowgroup">
          {model.rows.map((row) => (
            <div key={row.label} className={styles.frow} role="row">
              <span role="rowheader" className={styles.flabel}>
                {row.label}
              </span>
              <span role="cell" className={styles.fvalue}>
                {row.value}
              </span>
              <span role="cell" className={styles.fnote}>
                {row.note ?? ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DockZonesBody({ model }: { readonly model: ZonesTabModel }) {
  if (model.rows.length === 0) {
    return (
      <div className={styles.fill}>
        <StatusLine text={model.status} />
        <Empty>{model.reason ?? "Sem leitura do motor"}</Empty>
      </div>
    );
  }
  return (
    <div className={styles.fill} data-stale={model.state === "stale" ? "true" : undefined}>
      <StatusLine text={model.status} />
      <div className={styles.table} role="table" aria-label="Zonas ativas">
        <div className={`${styles.scroll} ${styles.scrollWide}`} role="rowgroup">
          <div className={`${styles.zrow} ${styles.thead}`} role="row">
            <span role="columnheader">Lado</span>
            <span role="columnheader">Faixa</span>
            <span role="columnheader">Nota</span>
            <span role="columnheader">Fatores</span>
            <span role="columnheader">Idade</span>
            <span role="columnheader">Estado</span>
            <span role="columnheader">Invalidacao</span>
          </div>
          {model.rows.map((row) => (
            <div key={row.id} className={styles.zrow} role="row" data-zone={row.id} data-lado={row.lado === "Demanda" ? "demanda" : row.lado === "Oferta" ? "oferta" : "neutra"}>
              <span role="cell" className={styles.zside}>
                {row.lado}
              </span>
              <span role="cell">{row.faixa}</span>
              <span role="cell">{row.nota}</span>
              <span role="cell">{row.fatores}</span>
              <span role="cell">{row.idade}</span>
              <span role="cell">{row.estado}</span>
              <span role="cell">{row.invalidacao}</span>
            </div>
          ))}
          {model.hidden > 0 ? <p className={styles.more}>{model.hidden === 1 ? "Mais 1 zona fora da lista" : `Mais ${model.hidden} zonas fora da lista`}</p> : null}
        </div>
      </div>
    </div>
  );
}
