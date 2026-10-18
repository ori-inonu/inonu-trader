"use client";

/**
 * The shared selection of the three onchain dock tabs (Smart money, Traders, Holders): the network,
 * the tracked wallet kinds, the leaderboard window and order. It persists under `jev.onchain.v1`
 * so a reload keeps the desk where the user left it. The token picked inside the tabs is NOT here:
 * it is session state held by MesaView and shared by the tabs.
 *
 * The model is pure and defensive field by field; storage is read only after mount (the caller
 * does it in an effect), so the server markup is always the default state. `chainIndex: null`
 * means "use the default network": prefs.onchain.defaultChainIndex when configured, else "501".
 */
import { useCallback, useEffect, useState } from "react";

export const ONCHAIN_VIEW_KEY = "jev.onchain.v1";
export const ONCHAIN_DEFAULT_CHAIN = "501";

export type WalletTypeId = "1" | "2" | "3";
export const WALLET_TYPE_IDS: readonly WalletTypeId[] = ["1", "2", "3"];

export interface OnchainViewState {
  readonly chainIndex: string | null;
  readonly walletTypes: readonly WalletTypeId[];
  readonly timeFrame: number;
  readonly sortBy: number;
}

export function defaultOnchainView(): OnchainViewState {
  return { chainIndex: null, walletTypes: [...WALLET_TYPE_IDS], timeFrame: 3, sortBy: 1 };
}

/** The effective network: the stored choice or the configured/fallback default. */
export function resolveChainIndex(view: OnchainViewState, defaultChainIndex: string | null | undefined): string {
  if (view.chainIndex !== null && /^\d{1,12}$/.test(view.chainIndex)) return view.chainIndex;
  if (typeof defaultChainIndex === "string" && /^\d{1,12}$/.test(defaultChainIndex)) return defaultChainIndex;
  return ONCHAIN_DEFAULT_CHAIN;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

function walletTypesOf(v: unknown): WalletTypeId[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out = v.filter((w): w is WalletTypeId => w === "1" || w === "2" || w === "3");
  // At least one kind stays selected: a signal list with zero kinds would be a silent filter.
  return out.length === 0 ? null : [...new Set(out)];
}

/** Field-by-field defensive parse: a corrupted payload falls back piece by piece. */
export function parseOnchainView(raw: unknown): OnchainViewState {
  const base = defaultOnchainView();
  if (!isRecord(raw)) return base;
  const chainIndex =
    raw.chainIndex === null ? null : typeof raw.chainIndex === "string" && /^\d{1,12}$/.test(raw.chainIndex) ? raw.chainIndex : base.chainIndex;
  const walletTypes = walletTypesOf(raw.walletTypes) ?? base.walletTypes;
  const timeFrame = intIn(raw.timeFrame, 1, 5) ?? base.timeFrame;
  const sortBy = intIn(raw.sortBy, 1, 5) ?? base.sortBy;
  return { chainIndex, walletTypes, timeFrame, sortBy };
}

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined;

export function loadOnchainView(storage: ReadableStorage = typeof localStorage === "undefined" ? null : localStorage): OnchainViewState {
  try {
    const raw = storage?.getItem(ONCHAIN_VIEW_KEY);
    if (raw == null) return defaultOnchainView();
    return parseOnchainView(JSON.parse(raw));
  } catch {
    return defaultOnchainView();
  }
}

export function saveOnchainView(state: OnchainViewState, storage: WritableStorage = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(
      ONCHAIN_VIEW_KEY,
      JSON.stringify({ chainIndex: state.chainIndex, walletTypes: state.walletTypes, timeFrame: state.timeFrame, sortBy: state.sortBy }),
    );
  } catch {
    /* session only */
  }
}

/** Sanitizer shared by the reducer and patch: the rules are the same ones the parser enforces. */
export function patchOnchainView(state: OnchainViewState, patch: Partial<OnchainViewState>): OnchainViewState {
  const next: OnchainViewState = {
    chainIndex: patch.chainIndex === undefined ? state.chainIndex : patch.chainIndex === null || /^\d{1,12}$/.test(patch.chainIndex) ? patch.chainIndex : state.chainIndex,
    walletTypes: patch.walletTypes === undefined ? state.walletTypes : walletTypesOf(patch.walletTypes) ?? state.walletTypes,
    timeFrame: patch.timeFrame === undefined ? state.timeFrame : intIn(patch.timeFrame, 1, 5) ?? state.timeFrame,
    sortBy: patch.sortBy === undefined ? state.sortBy : intIn(patch.sortBy, 1, 5) ?? state.sortBy,
  };
  return next;
}

export interface OnchainView {
  readonly view: OnchainViewState;
  /** Set one field; invalid values are refused, never stored. */
  readonly patch: (p: Partial<OnchainViewState>) => void;
}

/**
 * The shared view of the three tabs: the default state on the server, the stored one after mount.
 * The caller resolves `chainIndex === null` against the configured default before calling routes.
 */
export function useOnchainView(storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null): OnchainView {
  const store = storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : storage;
  const [view, setView] = useState<OnchainViewState>(defaultOnchainView);
  useEffect(() => setView(loadOnchainView(store)), [store]);
  const patch = useCallback(
    (p: Partial<OnchainViewState>) =>
      setView((s) => {
        const next = patchOnchainView(s, p);
        saveOnchainView(next, store);
        return next;
      }),
    [store],
  );
  return { view, patch };
}
