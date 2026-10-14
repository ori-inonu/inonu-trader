"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type AssetCatalog,
  type AssetCatalogRow,
  ASSET_PICKER_MAX_ROWS,
  fallbackCatalogRows,
} from "@/lib/desk/useAssetCatalog";
import { fmtCompact, fmtPctSigned, fmtPx, priceDecimalsForMagnitude, UNAVAILABLE } from "@/lib/desk/ui/format";
import { onchainErrorText, fmtUsd } from "@/lib/mesa/onchain-rows";
import { chainChips, CHAIN_ORDER, type ChainChip } from "@/lib/onchain/chains";
import type { HotToken, OnchainClient, SearchToken } from "@/lib/onchain/client";
import type { OnchainFocus } from "@/lib/onchain/focus";
import { parseOnchainFocus } from "@/lib/onchain/focus";
import { useOnchainResource } from "@/lib/onchain/useOnchainResource";
import { instrumentIconSymbol } from "@/lib/onchain/icons";
import { AssetIcon } from "../AssetIcon";
import { ChainChips } from "../Dock/ChainChips";
import styles from "./AssetPicker.module.css";

export interface AssetPickerOnchain {
  readonly client: OnchainClient;
  /**
   * The network the user explicitly chose before (persisted under jev.onchain.v1), or null:
   * null restores the OKX branch on open so the picker's default stays the current behavior.
   */
  readonly chainIndex: string | null;
  readonly onChainSelect: (chainIndex: string) => void;
  readonly onSelectToken: (token: OnchainFocus) => void;
}

export interface AssetPickerProps {
  /** Instrument in focus, shown on the trigger button. */
  readonly focus: string;
  readonly catalog: AssetCatalog;
  /** Instruments with a read on the Jev board; they get the "Inonu le" tag. */
  readonly jevReads: ReadonlySet<string>;
  readonly onSelect?: (instId: string) => void;
  /** Starts open, for tests and the fixture harness; users always start closed. */
  readonly defaultOpen?: boolean;
  /** Onchain mode: chain row, trending tokens and the provider search. Omit for OKX only. */
  readonly onchain?: AssetPickerOnchain | null;
  /** The focused on-chain token: the trigger reads "PEPE (Ethereum)". */
  readonly onchainFocus?: OnchainFocus | null;
}

type PickerTab = "spot" | "swap";

const TABS: readonly { id: PickerTab; label: string }[] = [
  { id: "spot", label: "Spot" },
  { id: "swap", label: "Perpetuos" },
];

const OKX = "okx";

/** Display name of a chain: the API name when the list answered, else the static catalog. */
function chainNameOf(chainIndex: string, chips: readonly ChainChip[]): string {
  return chips.find((c) => c.chainIndex === chainIndex)?.name ?? CHAIN_ORDER.find((c) => c.chainIndex === chainIndex)?.name ?? `Rede ${chainIndex}`;
}

function toneOf(v: number | null): "up" | "down" | "none" {
  if (v === null || Math.abs(v) < 0.005) return "none";
  return v > 0 ? "up" : "down";
}

/** One onchain list row: symbol, short name when the provider knows it, price, change, liquidity, holders. */
export interface OcRow {
  readonly key: string;
  readonly symbol: string;
  readonly name: string | null;
  readonly price: number;
  readonly changePct: number;
  readonly liquidityUsd: number | null;
  readonly holders: number | null;
  readonly chainIndex: string;
  readonly address: string;
}

const hotRow = (t: HotToken): OcRow => ({
  key: `hot:${t.chainIndex}:${t.address}`,
  symbol: t.symbol,
  name: null,
  price: t.price,
  changePct: t.changePct,
  liquidityUsd: t.liquidityUsd,
  holders: t.holders,
  chainIndex: t.chainIndex,
  address: t.address,
});

const searchRow = (t: SearchToken, fallbackChain: string): OcRow => ({
  key: `q:${t.chainIndex ?? fallbackChain}:${t.address}`,
  symbol: t.symbol,
  name: t.name,
  price: t.price,
  changePct: t.changePct,
  liquidityUsd: t.liquidityUsd,
  holders: t.holders,
  chainIndex: t.chainIndex ?? fallbackChain,
  address: t.address,
});

/**
 * One token row of the on-chain list (CHN-3): two full lines, nothing invented. Line one is the
 * symbol in bold, the provider name in gray only when it exists and the price on the right; line
 * two carries the signed change, liquidity and holders, each whole, none forced.
 */
export function OnchainTokenRow({
  row,
  active,
  onHover,
  onPick,
}: {
  readonly row: OcRow;
  readonly active: boolean;
  readonly onHover?: () => void;
  readonly onPick?: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-active={active ? "true" : undefined}
      className={styles.ocRow}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      <span className={styles.ocTop}>
        <span className={styles.ocSymbol}>{row.symbol}</span>
        {row.name !== null ? <span className={styles.ocName}>{row.name}</span> : null}
        <span className={styles.ocPrice}>{fmtUsd(row.price)}</span>
      </span>
      <span className={styles.ocBottom}>
        <span className={styles.change} data-tone={toneOf(row.changePct)}>{fmtPctSigned(row.changePct, 1)}</span>
        {row.liquidityUsd !== null ? <span className={styles.ocMeta}>liq {fmtUsd(row.liquidityUsd)}</span> : null}
        {row.holders !== null ? <span className={styles.ocMeta}>{fmtCompact(row.holders)} holders</span> : null}
      </span>
    </button>
  );
}

/**
 * Searchable asset picker of the chart toolbar (G8) with an on-chain branch (CHN-3): the first
 * row of the popover is "OKX" plus the network chips. OKX keeps the Spot and Perpetuos tabs;
 * a network shows Trending (one load per network) and a commit-only search. Arrows move the
 * highlight, Enter selects, Escape closes and focus returns to the button.
 */
export function AssetPicker({ focus, catalog, jevReads, onSelect, defaultOpen = false, onchain = null, onchainFocus = null }: AssetPickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<PickerTab>("spot");
  const [query, setQuery] = useState("");
  const [committed, setCommitted] = useState("");
  const [active, setActive] = useState(0);
  /** "okx" or a chainIndex: which list the popover shows. */
  const [chainSel, setChainSel] = useState<string>(onchainFocus?.chainIndex ?? OKX);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const ready = catalog.status === "ready";
  const rows = ready ? (tab === "spot" ? catalog.spot : catalog.swap) : fallbackCatalogRows();
  const q = query.trim().toLowerCase();
  const filtered = q === "" ? rows : rows.filter((r) => r.instId.toLowerCase().includes(q));

  // Onchain resources: the network list once per open, trending once per network, the provider
  // search only for a committed query of at least two characters.
  const apiChains = useOnchainResource(open && onchain !== null ? "picker-chains" : null, (user, _s) => onchain!.client.chains(user ? "user" : "background"));
  const inChain = open && onchain !== null && chainSel !== OKX;
  const trending = useOnchainResource(inChain ? `hot:${chainSel}` : null, (user, _s) =>
    onchain!.client.hotTokens({ chainIndex: chainSel, timeFrame: 2, limit: 50 }, user ? "user" : "background"),
  );
  const searching = inChain && committed.length >= 2;
  const search = useOnchainResource(searching ? `search:${chainSel}:${committed}` : null, (user, _s) =>
    onchain!.client.search({ chainIndex: chainSel, q: committed }, user ? "user" : "background"),
  );

  const chips = useMemo(
    () => chainChips({ apiChains: apiChains.state.data, resourceChains: null, resourceLabel: "tokens" }),
    [apiChains.state.data],
  );

  const ocRows: OcRow[] = useMemo(() => {
    if (!inChain) return [];
    if (searching && search.state.data !== null) {
      // Defensive: the provider is expected to filter by chain; a stray row is dropped, not shown.
      return search.state.data.filter((t) => t.chainIndex === null || t.chainIndex === chainSel).map((t) => searchRow(t, chainSel));
    }
    if (!searching && trending.state.data !== null) {
      return trending.state.data.filter((t) => t.chainIndex === chainSel).map(hotRow);
    }
    return [];
  }, [inChain, searching, search.state.data, trending.state.data, chainSel]);

  const okxMode = !inChain;
  const shown = filtered.slice(0, ASSET_PICKER_MAX_ROWS);
  const ocShown = ocRows.slice(0, ASSET_PICKER_MAX_ROWS);
  const itemCount = okxMode ? shown.length : ocShown.length;
  const highlighted = Math.min(active, Math.max(0, itemCount - 1));

  const ocState = searching ? search.state : trending.state;
  const ocError = ocState.status === "error" ? onchainErrorText(ocState.error ?? "bad_request") : null;

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  function close(restoreFocus: boolean): void {
    setOpen(false);
    setQuery("");
    setCommitted("");
    setActive(0);
    if (restoreFocus) buttonRef.current?.focus();
  }

  function pick(instId: string): void {
    close(true);
    onSelect?.(instId);
  }

  function pickToken(row: OcRow): void {
    const token = parseOnchainFocus({ chainIndex: row.chainIndex, address: row.address, symbol: row.symbol, name: row.name });
    if (token === null) return;
    close(true);
    onchain?.onSelectToken(token);
  }

  function chooseChain(chainIndex: string): void {
    setChainSel(chainIndex);
    setCommitted("");
    setActive(0);
    onchain?.onChainSelect(chainIndex);
  }

  function commitSearch(): void {
    const t = query.trim();
    if (t.length < 2) return;
    setCommitted(t);
    setActive(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Enter" && !okxMode && event.target === searchRef.current) {
      event.preventDefault();
      commitSearch();
      return;
    }
    if (itemCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((a) => (a + 1) % itemCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((a) => (a - 1 + itemCount) % itemCount);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (okxMode) {
        const row = shown[highlighted];
        if (row) pick(row.instId);
      } else {
        const row = ocShown[highlighted];
        if (row) pickToken(row);
      }
    }
  }

  const triggerText = onchainFocus !== null ? `${onchainFocus.symbol} (${chainNameOf(onchainFocus.chainIndex, chips)})` : focus;

  return (
    <div className={styles.root}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setChainSel(onchainFocus?.chainIndex ?? onchain?.chainIndex ?? OKX);
          setOpen((o) => !o);
        }}
      >
        <span className={styles.triggerId}>{triggerText}</span>
        <span className={styles.caret} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <div className={styles.backdrop} onClick={() => close(false)} aria-hidden="true" />
          <div className={`${styles.popover} ${onchain !== null ? styles.popoverOnchain : ""}`} role="dialog" aria-label="Escolher ativo" onKeyDown={onKeyDown}>
            {onchain !== null ? (
              <div className={styles.chainPick} role="radiogroup" aria-label="Fonte do ativo">
                <button
                  type="button"
                  role="radio"
                  aria-checked={chainSel === OKX}
                  className={styles.chainOkx}
                  onClick={() => {
                    setChainSel(OKX);
                    setCommitted("");
                    setActive(0);
                  }}
                >
                  OKX
                </button>
                <ChainChips chips={chips} value={chainSel === OKX ? "" : chainSel} onSelect={chooseChain} ariaLabel="Rede on-chain" />
              </div>
            ) : null}
            <div className={styles.searchRow}>
              <input
                ref={searchRef}
                className={styles.searchInput}
                type="text"
                value={query}
                placeholder={okxMode ? "Buscar ativo" : "Buscar token na rede"}
                aria-label={okxMode ? "Buscar ativo" : "Buscar token na rede"}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCommitted("");
                  setActive(0);
                }}
              />
              {!okxMode ? (
                <button type="button" className={styles.searchGo} onClick={commitSearch} disabled={query.trim().length < 2}>
                  Buscar
                </button>
              ) : null}
            </div>
            {okxMode ? (
              <>
                <div className={styles.tabs} role="tablist" aria-label="Tipo de mercado">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      className={styles.tab}
                      onClick={() => {
                        setTab(t.id);
                        setActive(0);
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {!ready ? <p className={styles.notice}>Lista completa indisponivel</p> : null}
                <ul className={styles.list} role="listbox" aria-label="Ativos">
                  {shown.length === 0 ? <li className={styles.empty}>Nenhum ativo encontrado</li> : null}
                  {shown.map((row, i) => {
                    const decimals = priceDecimalsForMagnitude(row.last);
                    return (
                      <li key={row.instId}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === highlighted}
                          data-active={i === highlighted ? "true" : undefined}
                          data-current={row.instId === focus ? "true" : undefined}
                          className={styles.row}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => pick(row.instId)}
                        >
                          <AssetIcon ccy={instrumentIconSymbol(row.instId)} size={14} />
                          <span className={styles.instId}>{row.instId}</span>
                          {jevReads.has(row.instId) ? <span className={styles.jevTag}>Inonu le</span> : null}
                          <span className={styles.last}>{row.last === null ? UNAVAILABLE : fmtPx(row.last, decimals)}</span>
                          <span className={styles.change} data-tone={toneOf(row.change24hPct)}>
                            {fmtPctSigned(row.change24hPct)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {filtered.length > shown.length ? <p className={styles.more}>{filtered.length - shown.length} a mais, refine a busca</p> : null}
              </>
            ) : (
              <>
                <div className={styles.ocHeader}>
                  <span>Trending</span>
                  {searching ? <span className={styles.ocSearchTag}>busca: {committed}</span> : null}
                </div>
                {ocError !== null ? <p className={styles.notice} role="status">{ocError.text}</p> : null}
                {ocError === null && ocState.status !== "ready" ? <p className={styles.notice}>Carregando</p> : null}
                <ul className={`${styles.list} ${styles.listOnchain}`} role="listbox" aria-label="Tokens on-chain">
                  {ocError === null && ocState.status === "ready" && ocShown.length === 0 ? (
                    <li className={styles.empty}>{searching ? "Nenhum token encontrado" : "Sem tokens nesta rede agora"}</li>
                  ) : null}
                  {ocShown.map((row, i) => (
                    <li key={row.key}>
                      <OnchainTokenRow row={row} active={i === highlighted} onHover={() => setActive(i)} onPick={() => pickToken(row)} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
