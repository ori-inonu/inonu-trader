import { nextUtcMonthMs } from "../onchainos/http.ts";
import type { LedgerState, Period } from "./ledger.ts";
import { ceilings, entryId, poolId, type BudgetEntry, type Priority } from "./registry.ts";

export type DenyReason = "budget" | "reserved" | "blocked_402" | "cooldown_429" | "expired";

/** Fração do teto reservada a execution e security; background nunca a consome. */
export const DEFAULT_RESERVE = 0.2;

const usedIn = (state: LedgerState, id: string, period: Period, stamp: string): number => {
  const usage = state.usage[id]?.[period];
  return usage !== undefined && usage.stamp === stamp ? usage.n : 0;
};

/**
 * Decide uma chamada e, se liberada, já a contabiliza no estado. Ordem: validade, bloqueio 402, cooldown 429,
 * depois cada janela (minuto, hora, dia, mês). Acima do teto da janela é "budget". Background acima de
 * (1 - reserva) x teto é "reserved". Nada é contabilizado quando a chamada é negada.
 * Os contadores são do pool da entrada (ou da própria entrada, sem pool).
 */
export function takeSlot(state: LedgerState, entry: BudgetEntry, priority: Priority, now: number, reservePct = DEFAULT_RESERVE): DenyReason | null {
  const id = poolId(entry);
  if (entry.expiresAt !== undefined && now >= entry.expiresAt) return "expired";
  if (state.blocked[id] !== undefined && now < state.blocked[id]) return "blocked_402";
  if (state.cooldown[id] !== undefined && now < state.cooldown[id]) return "cooldown_429";

  const cost = entry.custo ?? 1;
  const iso = new Date(now).toISOString();
  const caps = ceilings(entry);
  const windows: Array<{ period: Period; stamp: string; cap: number | null }> = [
    { period: "min", stamp: String(Math.floor(now / 60_000)), cap: caps.minute },
    { period: "h", stamp: String(Math.floor(now / 3_600_000)), cap: caps.hour },
    { period: "d", stamp: iso.slice(0, 10), cap: caps.day },
    { period: "m", stamp: iso.slice(0, 7), cap: entry.franquiaMensal ?? null },
  ];

  let reserved = false;
  for (const window of windows) {
    if (window.cap === null) continue;
    const used = usedIn(state, id, window.period, window.stamp);
    if (used + cost > window.cap) return "budget";
    const limit = priority === "background" ? Math.floor(window.cap * (1 - reservePct)) : window.cap;
    if (used + cost > limit) reserved = true;
  }
  if (reserved) return "reserved";

  const usage = (state.usage[id] ??= {});
  for (const window of windows) {
    if (window.cap === null) continue;
    usage[window.period] = { stamp: window.stamp, n: usedIn(state, id, window.period, window.stamp) + cost };
  }
  // Contagem por endpoint, sempre (com ou sem teto): é o que diz onde o orçamento é gasto.
  const calls = ((state.endpoints ??= {})[entryId(entry)] ??= {});
  for (const period of ["d", "m"] as const) {
    const stamp = period === "d" ? iso.slice(0, 10) : iso.slice(0, 7);
    calls[period] = { stamp, n: (calls[period]?.stamp === stamp ? calls[period]!.n : 0) + cost };
  }
  return null;
}

/** Bloqueio 402: nenhuma chamada do pool até o primeiro instante do próximo mês UTC. O sistema nunca paga para destravar. */
export function markBlocked(state: LedgerState, entry: BudgetEntry, now: number): void {
  state.blocked[poolId(entry)] = nextUtcMonthMs(now);
}

/** Cooldown 429: nenhuma chamada do pool até `untilMs`. Mantém o maior prazo já registrado. */
export function markCooldown(state: LedgerState, entry: BudgetEntry, untilMs: number): void {
  const id = poolId(entry);
  state.cooldown[id] = Math.max(state.cooldown[id] ?? 0, untilMs);
}

/** Piso da escala adaptativa: mesmo sob 429 repetido o ritmo não cai abaixo de um quarto do declarado. */
export const MIN_SCALE = 0.25;
/** Sucessos seguidos necessários para recuperar um degrau de escala. */
export const RECOVER_AFTER = 20;

export interface Pacer {
  /** Reserva o próximo slot de forma síncrona (sem corrida entre chamadas concorrentes) e espera até ele. */
  wait(entry: BudgetEntry): Promise<void>;
  /** Escala atual do pool, em [MIN_SCALE, 1]. 1 é o ritmo declarado. */
  scale(entry: BudgetEntry): number;
  /** Chamada respondida 429: o ritmo do pool cai pela metade (até MIN_SCALE). */
  penalize(entry: BudgetEntry): void;
  /** Chamada bem-sucedida: após RECOVER_AFTER sucessos seguidos a escala sobe 25% (até 1). */
  reward(entry: BudgetEntry): void;
  /** Chamada que voltou com falha (5xx, não autorizado, erro do provedor): interrompe a sequência de sucessos sem mexer na escala. */
  reset(entry: BudgetEntry): void;
}

/**
 * Pacing por pool: um slot a cada 1/(rps x escala) segundos. Entradas sem `rps` não são espaçadas por aqui.
 * A escala é adaptativa (AIMD simplificado): corta pela metade no 429 e recupera devagar, para não bater de novo no limite.
 */
export function createPacer(now: () => number, sleep: (ms: number) => Promise<void>): Pacer {
  const nextAt = new Map<string, number>();
  const state = new Map<string, { scale: number; streak: number }>();
  const stateOf = (id: string) => {
    let s = state.get(id);
    if (s === undefined) state.set(id, (s = { scale: 1, streak: 0 }));
    return s;
  };
  return {
    async wait(entry) {
      if (entry.rps === undefined) return;
      const id = poolId(entry);
      const t = now();
      const start = Math.max(t, nextAt.get(id) ?? 0);
      nextAt.set(id, start + 1000 / (entry.rps * stateOf(id).scale));
      if (start > t) await sleep(start - t);
    },
    scale: (entry) => stateOf(poolId(entry)).scale,
    penalize(entry) {
      const s = stateOf(poolId(entry));
      s.scale = Math.max(MIN_SCALE, s.scale / 2);
      s.streak = 0;
    },
    reset(entry) {
      stateOf(poolId(entry)).streak = 0;
    },
    reward(entry) {
      const s = stateOf(poolId(entry));
      if (s.scale >= 1) return;
      s.streak += 1;
      if (s.streak >= RECOVER_AFTER) {
        s.scale = Math.min(1, s.scale * 1.25);
        s.streak = 0;
      }
    },
  };
}
