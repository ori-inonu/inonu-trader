"use client";

/**
 * The strip under the chart toolbar where the person chooses which signals the chart shows (ASK-8). On an OKX instrument it
 * holds the Inonu layers (zones, flow, the decision) and one line about how the engine is doing; on an on-chain token it holds
 * the tracked-wallet filters the provider offers. Every control is a plain button or select; nothing here moves or blinks.
 * The component is presentational, so each state is rendered in tests without a server.
 */
import { flowStatusText } from "@/lib/inonu/feed-text";
import type { OverlayFeedState } from "@/lib/inonu/overlay-feed";
import { MIN_ADDRESS_OPTIONS, MIN_USD_OPTIONS, type SignalFilters, type WalletKind } from "@/lib/inonu/signals";
import styles from "./InonuSignalStrip.module.css";

export interface InonuSignalStripProps {
  readonly mode: "okx" | "onchain";
  readonly filters: SignalFilters;
  readonly onChange: (next: SignalFilters) => void;
  /** The reading of the flow engine (OKX instruments). Null on an on-chain token. */
  readonly feed: OverlayFeedState | null;
}

export { flowStatusText };

export function toggleSignal(filters: SignalFilters, key: "inonu" | "zonas" | "fluxo" | "carteiras"): SignalFilters {
  return { ...filters, [key]: !filters[key] };
}

const KIND_ORDER: readonly WalletKind[] = ["smart_money", "kol", "whale"];

export function toggleKind(filters: SignalFilters, kind: WalletKind): SignalFilters {
  const has = filters.tipos.includes(kind);
  return { ...filters, tipos: KIND_ORDER.filter((k) => (k === kind ? !has : filters.tipos.includes(k))) };
}

const USD_LABEL = (v: number): string => (v === 0 ? "Qualquer" : v >= 1000 ? `${v / 1000} mil` : String(v));

function Toggle({ label, on, title, onClick }: { readonly label: string; readonly on: boolean; readonly title: string; readonly onClick: () => void }) {
  return (
    <button type="button" className={styles.toggle} aria-pressed={on} title={title} onClick={onClick}>
      {label}
    </button>
  );
}

export function InonuSignalStrip({ mode, filters, onChange, feed }: InonuSignalStripProps) {
  if (mode === "onchain") {
    return (
      <div className={styles.strip} role="group" aria-label="Sinais de carteiras no grafico">
        <span className={styles.name}>Carteiras</span>
        <Toggle label="Rastreadas" on={filters.carteiras} title="Compras de carteiras rastreadas da OKX, observadas e nao sao decisao" onClick={() => onChange(toggleSignal(filters, "carteiras"))} />
        {filters.carteiras ? (
          <>
            <Toggle label="Smart money" on={filters.tipos.includes("smart_money")} title="Carteiras de smart money" onClick={() => onChange(toggleKind(filters, "smart_money"))} />
            <Toggle label="KOL" on={filters.tipos.includes("kol")} title="Carteiras de influenciadores" onClick={() => onChange(toggleKind(filters, "kol"))} />
            <Toggle label="Baleia" on={filters.tipos.includes("whale")} title="Carteiras de baleias" onClick={() => onChange(toggleKind(filters, "whale"))} />
            <label className={styles.field}>
              <span>Valor minimo</span>
              <select aria-label="Valor minimo em USD" value={filters.minUsd} onChange={(e) => onChange({ ...filters, minUsd: Number(e.target.value) })}>
                {optionsWith(MIN_USD_OPTIONS, filters.minUsd).map((v) => (
                  <option key={v} value={v}>
                    {USD_LABEL(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Enderecos minimos</span>
              <select aria-label="Enderecos minimos por sinal" value={filters.minEnderecos} onChange={(e) => onChange({ ...filters, minEnderecos: Number(e.target.value) })}>
                {optionsWith(MIN_ADDRESS_OPTIONS, filters.minEnderecos).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
    );
  }
  const status = flowStatusText(feed);
  return (
    <div className={styles.strip} role="group" aria-label="Camadas do Inonu no grafico">
      <span className={styles.name}>Inonu</span>
      <Toggle label="Zonas" on={filters.zonas} title="Zonas de demanda e oferta calculadas pelo fluxo, descritivas" onClick={() => onChange(toggleSignal(filters, "zonas"))} />
      <Toggle label="Fluxo" on={filters.fluxo} title="Volume agredido por nivel de preco, desequilibrios e corridas, medidos" onClick={() => onChange(toggleSignal(filters, "fluxo"))} />
      <Toggle label="Decisao" on={filters.inonu} title="A resposta do Inonu quando voce pede (modelo: Jev)" onClick={() => onChange(toggleSignal(filters, "inonu"))} />
      {status !== "" ? (
        <span className={styles.status} role="status">
          {status}
        </span>
      ) : null}
    </div>
  );
}

/** The offered values, plus the saved one when it is not among them, so a stored choice never disappears from the select. */
function optionsWith(options: readonly number[], current: number): number[] {
  return options.includes(current) ? [...options] : [...options, current].sort((a, b) => a - b);
}
