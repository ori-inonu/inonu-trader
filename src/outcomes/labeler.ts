/**
 * The labeler (INT-0.6, REC-3, REC-4, REC-5): what a snapshot WOULD have returned over a horizon, for a long and for a short,
 * net of the round-trip cost recorded with it, plus the triple barrier and the reaction of the nearest zones. Pure.
 *
 * It reads only the five minute bars that lie inside `[start, start + horizon]` and that were closed at `nowMs`, and the entry is
 * the price recorded with the snapshot. The start is the bar the snapshot was taken in when it was taken within a minute of that
 * bar's open (the clock recorder, a few seconds in), so a one hour label is one hour from the bar; a snapshot taken later in a bar
 * (a click) starts at the next bar, and the first minutes after it are not measured. Nothing later than the window can change a
 * label (a test appends bars and expects the same label). An outcome that cannot be known (the horizon is not over, or a bar is
 * missing) is incomplete with a reason and carries only nulls, never zeros.
 *
 * The triple barrier: the stop of a long is the invalidation of the demand zone of the snapshot when it is a valid one (below the
 * entry), the stop of a short that of the supply zone (above the entry), and one ATR otherwise; the target is 1.5 times the
 * distance to the stop that was used. The label says which basis each side had.
 *
 * Conservative on purpose: when the stop and the target are both inside one bar the stop wins; a zone that is touched and
 * invalidated in the same bar did not react.
 */
import type { Bar } from "../intel/features/types";
import { HORIZON_MS, type Barrier, type Horizon, type IncompleteReason, type Label, type Snapshot, type StopBasis, type ZoneReaction, type ZoneRef } from "./types";

export const LABEL_BAR_MS = 300_000;
export const STOP_ATR = 1;
/** The target is this many times the distance to the stop (1.5 ATR when the stop is one ATR). */
export const TARGET_ATR = 1.5;
/** A snapshot taken this close after the open of a five minute bar belongs to that bar; later, to the next one. */
export const ENTRY_TOLERANCE_MS = 60_000;
/** The favourable move, in ATR above the upper limit of a demand zone (below the lower limit of a supply zone), that counts as a reaction. */
export const REACTION_ATR = 1;

const bps = (value: number, base: number): number => Math.round(((value - base) / base) * 10_000 * 100) / 100 + 0;

function incomplete(snapshot: Snapshot, horizonte: Horizon, motivo: IncompleteReason): Label {
  return { snapshotId: snapshot.id, horizonte, completo: false, motivoIncompleto: motivo, brutoLongBps: null, liquidoLongBps: null, liquidoShortBps: null, maxAltaBps: null, maxQuedaBps: null, barreiraLong: null, barreiraShort: null, zonaDemanda: null, zonaOferta: null };
}

/** The first and the last instant of the window of a label: the bars inside it are the ones the label reads. */
export function windowOf(asOfMs: number, horizonte: Horizon): { readonly start: number; readonly end: number } {
  const open = Math.floor(asOfMs / LABEL_BAR_MS) * LABEL_BAR_MS;
  const start = asOfMs - open <= ENTRY_TOLERANCE_MS ? open : open + LABEL_BAR_MS;
  return { start, end: start + HORIZON_MS[horizonte] };
}

/** The distance from the entry to the stop of a side, and what it is based on; null when neither the zone nor the ATR gives one. */
function stopOf(side: "long" | "short", entry: number, atr: number | null, zone: ZoneRef | null): { distance: number; basis: StopBasis } | null {
  const inv = zone?.invalidacao ?? null;
  if (inv !== null && (side === "long" ? inv < entry : inv > entry)) return { distance: Math.abs(entry - inv), basis: "zona" };
  return atr === null ? null : { distance: STOP_ATR * atr, basis: "atr" };
}

function barrierOf(side: "long" | "short", entry: number, distance: number, window: readonly Bar[]): Barrier {
  const stop = side === "long" ? entry - distance : entry + distance;
  const target = side === "long" ? entry + TARGET_ATR * distance : entry - TARGET_ATR * distance;
  for (const bar of window) {
    const stopped = side === "long" ? bar.low <= stop : bar.high >= stop;
    if (stopped) return "parada";
    const hit = side === "long" ? bar.high >= target : bar.low <= target;
    if (hit) return "alvo";
  }
  return "tempo";
}

function reactionOf(side: "demanda" | "oferta", zone: ZoneRef, atr: number | null, window: readonly Bar[]): ZoneReaction {
  const touchedAt = window.findIndex((b) => (side === "demanda" ? b.low <= zone.alto : b.high >= zone.baixo));
  if (touchedAt < 0) return { tocou: false, reagiu: null };
  if (atr === null) return { tocou: true, reagiu: null };
  const invalidated = (b: Bar): boolean => (zone.invalidacao === null ? false : side === "demanda" ? b.close < zone.invalidacao : b.close > zone.invalidacao);
  if (invalidated(window[touchedAt]!)) return { tocou: true, reagiu: false };
  const goal = side === "demanda" ? zone.alto + REACTION_ATR * atr : zone.baixo - REACTION_ATR * atr;
  for (let i = touchedAt + 1; i < window.length; i += 1) {
    const bar = window[i]!;
    if (invalidated(bar)) return { tocou: true, reagiu: false };
    if (side === "demanda" ? bar.high >= goal : bar.low <= goal) return { tocou: true, reagiu: true };
  }
  return { tocou: true, reagiu: false };
}

export function labelSnapshot(snapshot: Snapshot, bars5m: readonly Bar[], horizonte: Horizon, nowMs: number): Label {
  const entry = snapshot.price;
  if (!Number.isFinite(entry) || !(entry > 0)) return incomplete(snapshot, horizonte, "sem_preco_de_entrada");
  const { start, end } = windowOf(snapshot.asOfMs, horizonte);
  if (nowMs < end) return incomplete(snapshot, horizonte, "horizonte_alem_dos_dados");

  const byTs = new Map<number, Bar>();
  for (const b of bars5m) if (b.confirmed && b.ts >= start && b.ts + LABEL_BAR_MS <= end) byTs.set(b.ts, b);
  const expected = (end - start) / LABEL_BAR_MS;
  const window: Bar[] = [];
  for (let i = 0; i < expected; i += 1) {
    const bar = byTs.get(start + i * LABEL_BAR_MS);
    if (bar === undefined) return incomplete(snapshot, horizonte, "lacuna_de_velas");
    window.push(bar);
  }

  const exit = window[window.length - 1]!.close;
  const gross = bps(exit, entry);
  const cost = snapshot.costRoundTripBps;
  const high = Math.max(...window.map((b) => b.high));
  const low = Math.min(...window.map((b) => b.low));
  const atr = snapshot.atr15m !== null && snapshot.atr15m > 0 ? snapshot.atr15m : null;
  const stopLong = stopOf("long", entry, atr, snapshot.zones.demanda);
  const stopShort = stopOf("short", entry, atr, snapshot.zones.oferta);
  return {
    snapshotId: snapshot.id,
    horizonte,
    completo: true,
    motivoIncompleto: null,
    brutoLongBps: gross,
    liquidoLongBps: cost === null ? null : Math.round((gross - cost) * 100) / 100 + 0,
    liquidoShortBps: cost === null ? null : Math.round((-gross - cost) * 100) / 100 + 0,
    maxAltaBps: Math.max(0, bps(high, entry)),
    maxQuedaBps: Math.max(0, -bps(low, entry)),
    barreiraLong: stopLong === null ? null : barrierOf("long", entry, stopLong.distance, window),
    barreiraShort: stopShort === null ? null : barrierOf("short", entry, stopShort.distance, window),
    baseDaParadaLong: stopLong?.basis ?? null,
    baseDaParadaShort: stopShort?.basis ?? null,
    zonaDemanda: snapshot.zones.demanda === null ? null : reactionOf("demanda", snapshot.zones.demanda, atr, window),
    zonaOferta: snapshot.zones.oferta === null ? null : reactionOf("oferta", snapshot.zones.oferta, atr, window),
  };
}
