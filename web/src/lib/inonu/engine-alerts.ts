/**
 * Alerts about the flow and the zones of the focused instrument (ASK-13, T7.10): ALGORITHMIC and LOCAL. They compare two readings of the
 * engine, say in plain words what changed, and never ask the model; the button on each alert is the only thing that does. A first
 * reading, another instrument and a repeated reading change nothing. Runs that depend on adaptive thresholds are told only when those
 * exist. The words describe (demand, supply, aggressing side) and never use the words of an order. Pure, with a small store for the
 * session; nothing is written to disk and nothing leaves the browser.
 */
import { fmtNumber, fmtPx, priceDecimals } from "../desk/ui/format";
import type { ChartOverlay } from "./overlay";

export type EngineAlertKind = "zona_nova" | "zona_testada" | "sequencial" | "progressao" | "exaustao" | "absorcao";

export interface EngineAlert {
  /** Stable identity of what changed, so the same change is not told twice. */
  readonly id: string;
  readonly instId: string;
  readonly kind: EngineAlertKind;
  readonly text: string;
  readonly atMs: number;
}

const sideWord = (lado: "c" | "v"): string => (lado === "c" ? "compradores" : "vendedores");

export function detectEngineAlerts(prev: ChartOverlay | null, next: ChartOverlay, atMs: number): EngineAlert[] {
  if (prev === null || prev.instId !== next.instId) return [];
  const px = (v: number): string => fmtPx(v, priceDecimals(next.tickSz));
  const out: EngineAlert[] = [];
  const add = (kind: EngineAlertKind, key: string, text: string): void => {
    out.push({ id: `${next.instId}|${kind}|${key}`, instId: next.instId, kind, text, atMs });
  };

  // zones
  const before = new Map(prev.zonas.map((z) => [z.id, z]));
  for (const zone of next.zonas) {
    const old = before.get(zone.id);
    const lado = zone.lado === "demanda" ? "demanda" : zone.lado === "oferta" ? "oferta" : "equilibrio";
    if (old === undefined) add("zona_nova", zone.id, `Zona de ${lado} nova entre ${px(zone.baixo)} e ${px(zone.alto)}, nota ${fmtNumber(zone.nota, 2)}`);
    else if (old.estado === "ativa" && zone.estado === "testada") add("zona_testada", zone.id, `Zona de ${lado} testada entre ${px(zone.baixo)} e ${px(zone.alto)}`);
  }

  // runs depend on thresholds that are learned: during the warm-up they say nothing
  if (next.aquecimento.pronto && prev.aquecimento.pronto) {
    const seen = new Set<string>();
    const mark = (kind: string, side: string, baixo: number, alto: number) => seen.add(`${kind}|${side}|${baixo}|${alto}`);
    for (const r of prev.corridas.sequencial) mark("sequencial", r.lado, r.baixo, r.alto);
    for (const r of prev.corridas.progressao) mark("progressao", r.lado, r.baixo, r.alto);
    for (const r of prev.corridas.exaustao) mark("exaustao", r.extremo, r.baixo, r.alto);
    for (const r of next.corridas.sequencial) {
      if (!seen.has(`sequencial|${r.lado}|${r.baixo}|${r.alto}`)) add("sequencial", `${r.lado}:${r.baixo}:${r.alto}`, `Sequencial de ${r.n} niveis ${sideWord(r.lado)} entre ${px(r.baixo)} e ${px(r.alto)}`);
    }
    for (const r of next.corridas.progressao) {
      if (!seen.has(`progressao|${r.lado}|${r.baixo}|${r.alto}`)) add("progressao", `${r.lado}:${r.baixo}:${r.alto}`, `Progressao de ${r.n} niveis ${sideWord(r.lado)} entre ${px(r.baixo)} e ${px(r.alto)}`);
    }
    for (const r of next.corridas.exaustao) {
      if (!seen.has(`exaustao|${r.extremo}|${r.baixo}|${r.alto}`)) add("exaustao", `${r.extremo}:${r.baixo}:${r.alto}`, `Exaustao de ${r.n} niveis na extremidade ${r.extremo === "alto" ? "alta" : "baixa"} entre ${px(r.baixo)} e ${px(r.alto)}`);
    }
  }

  // an absorption that starts
  if (prev.absorcao === null && next.absorcao !== null) {
    add("absorcao", next.absorcao.lado, `Absorcao ${next.absorcao.lado === "c" ? "compradora" : "vendedora"}, volume ${fmtNumber(next.absorcao.razaoVolume, 1)} vezes o das velas passadas`);
  }
  return out;
}

export interface EngineAlertStoreOptions {
  readonly now: () => number;
  /** The same alert is told again only after this long. Default five minutes. */
  readonly cooldownMs?: number;
  readonly max?: number;
}

/** The kinds of alert the simple desk tells: a zone that appeared or was tested. The runs (sequencial, progressao, exaustao) and the absorption are for whoever reads the flow level by level. */
export const SIMPLE_ALERT_KINDS: ReadonlySet<EngineAlertKind> = new Set<EngineAlertKind>(["zona_nova", "zona_testada"]);

/** The alerts the bell shows on this desk, and how many of the unseen ones are among them. The complete desk shows them all. */
export function alertsForDesk(alerts: readonly EngineAlert[], unseen: number, simple: boolean): { readonly alerts: readonly EngineAlert[]; readonly unseen: number } {
  if (!simple) return { alerts, unseen };
  const shown = alerts.filter((a) => SIMPLE_ALERT_KINDS.has(a.kind));
  // the newest come first: the unseen ones are the first `unseen` of the whole list, so those that are shown are counted among them
  const fresh = new Set(alerts.slice(0, Math.max(0, unseen)));
  return { alerts: shown, unseen: shown.filter((a) => fresh.has(a)).length };
}

export function createEngineAlertStore(options: EngineAlertStoreOptions) {
  const cooldown = options.cooldownMs ?? 300_000;
  const max = options.max ?? 20;
  let items: readonly EngineAlert[] = [];
  let unseen = 0;
  const lastToldAt = new Map<string, number>();
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of [...listeners]) listener();
  };

  return {
    /** Newest first. The same array until something changes. */
    list(): readonly EngineAlert[] {
      return items;
    },
    add(alert: EngineAlert): void {
      const now = options.now();
      const last = lastToldAt.get(alert.id);
      if (last !== undefined && now - last < cooldown) return;
      lastToldAt.set(alert.id, now);
      items = [alert, ...items].slice(0, max);
      unseen += 1;
      emit();
    },
    unseen(): number {
      return Math.min(unseen, items.length);
    },
    markSeen(): void {
      if (unseen === 0) return;
      unseen = 0;
      emit();
    },
    clear(): void {
      if (items.length === 0 && unseen === 0) return;
      items = [];
      unseen = 0;
      lastToldAt.clear();
      emit();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type EngineAlertStore = ReturnType<typeof createEngineAlertStore>;
